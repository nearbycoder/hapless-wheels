import { planck, V, CAT, GRAVITY, clamp, rand } from './physics.js';
import { Effects } from './effects.js';
import { LevelBuilder } from './objects.js';
import { PlayerCharacter, getCharacter } from './characters.js';

const DT = 1 / 120;
const EMPTY_INPUT = { up: false, down: false, left: false, right: false, primary: false, secondary: false };

export class Game {
  constructor(renderer, audio, ui) {
    this.renderer = renderer;
    this.audio = audio;
    this.ui = ui;
    this.world = new planck.World({ gravity: V(0, GRAVITY) });
    this.destroyed = new Set();
    this.effects = new Effects(this);
    this.toughness = 1;
    this.state = 'idle';
    this.time = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.player = null;
  }

  // ------------------------------------------------------------------ setup
  load(level, charId, opts = {}) {
    this.teardown();
    this.world = new planck.World({ gravity: V(0, GRAVITY) });
    this.destroyed = new Set();
    this.queued = [];
    this.delayed = [];
    this.updaters = [];
    this.frameUpdaters = [];
    this.ragdolls = [];
    this.explosives = [];
    this.harpoons = [];
    this.loops = [];
    this.checkpoints = [];
    this.breakables = [];
    this.impaleJoints = [];
    this.contactEvents = [];
    this.sensorEvents = [];
    this.time = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.slowmo = 0;
    this.levelTime = opts.time || 0;
    this.level = level;
    this.charId = charId;
    this.checkpointIndex = opts.checkpoint ?? -1;
    this.tokenPos = null;
    this.deathTimer = -1;
    this.effects.reset();
    this.renderer.setTheme(level.theme);

    const b = new LevelBuilder(this, level.theme);
    this.builder = b;
    level.build(b);

    let start = level.start;
    if (this.checkpointIndex >= 0 && this.checkpoints[this.checkpointIndex]) {
      for (let i = 0; i <= this.checkpointIndex; i++) this.checkpoints[i].activate();
      const cp = this.checkpoints[this.checkpointIndex];
      start = [cp.x, cp.y];
    }
    const def = getCharacter(level.character || charId);
    this.player = new PlayerCharacter(this, def, start[0], start[1] + 0.05);
    this.killY = level.killY ?? b.minY - 30;
    this.renderer.buildBackdrop(level.theme, b.minX, b.maxX, (x) => b.groundAt(x));
    this.hookWorld();
    const f = this.player.focus.getPosition();
    this.renderer.snapCamera(f.x, f.y);
    this.state = 'playing';
    this.ui.onLevelStart(this);
  }

  teardown() {
    this.audio.stopLoops();
    this.renderer.clearLevel();
    this.player = null;
  }

  hookWorld() {
    const w = this.world;
    w.on('begin-contact', (c) => {
      const fa = c.getFixtureA(), fb = c.getFixtureB();
      const ua = fa.getUserData(), ub = fb.getUserData();
      if (fa.isSensor() || (ua && ua.type === 'trampoline')) this.sensorEvents.push({ s: fa, o: fb });
      if (fb.isSensor() || (ub && ub.type === 'trampoline')) this.sensorEvents.push({ s: fb, o: fa });
    });
    w.on('pre-solve', (c) => {
      const fa = c.getFixtureA(), fb = c.getFixtureB();
      const ua = fa.getUserData(), ub = fb.getUserData();
      if (ua || ub) {
        if (ua && ua.type === 'conveyor') c.setTangentSpeed(ua.speed);
        else if (ub && ub.type === 'conveyor') c.setTangentSpeed(ub.speed);
        this.preSolveSide(c, ua, fb);
        this.preSolveSide(c, ub, fa);
        if (!c.isEnabled()) return;
      }
      if (fa.isSensor() || fb.isSensor()) return;
      const ba = fa.getBody(), bb = fb.getBody();
      // closing speed along the contact normal = impact severity
      const wm = c.getWorldManifold(null);
      if (!wm || !wm.points.length) return;
      const p = wm.points[0];
      const va = ba.getLinearVelocityFromWorldPoint(p);
      const vb = bb.getLinearVelocityFromWorldPoint(p);
      const vn = -((vb.x - va.x) * wm.normal.x + (vb.y - va.y) * wm.normal.y);
      const special = (ua && (ua.type || ua.hazard)) || (ub && (ub.type || ub.hazard));
      if (vn < 1.5 && !special) return;
      this.contactEvents.push({ fa, fb, vn: Math.max(0, vn), x: p.x, y: p.y });
    });
  }

  preSolveSide(c, ud, other) {
    if (!ud) return;
    if (ud.type === 'loopA' || ud.type === 'loopB') {
      // riders sit above the track: only the vehicle (or a loose ragdoll) touches it
      const obud = other.getBody().getUserData();
      if (obud && obud.ragdoll && obud.entity && obud.entity.attached) { c.setEnabled(false); return; }
      const ent = this.entityOf(other.getBody());
      const st = ent ? ud.loop.state.get(ent) || 0 : 0;
      if ((ud.type === 'loopA' && st === 1) || (ud.type === 'loopB' && st === 0)) c.setEnabled(false);
    } else if (ud.type === 'glass' && ud.obj.alive) {
      const ob = other.getBody();
      if (!ob.isDynamic() || other.getFilterCategoryBits() & CAT.DEBRIS) return;
      const v = ob.getLinearVelocity();
      const sp = Math.hypot(v.x, v.y);
      if (sp > ud.obj.threshold && ob.getMass() > 1.5) {
        c.setEnabled(false);
        const obj = ud.obj;
        this.queue(() => obj.shatter(v.x, v.y));
      }
    }
  }

  entityOf(body) {
    const ud = body.getUserData();
    if (!ud) return null;
    if (ud.entity) return ud.entity;
    if (ud.ragdoll) return ud.ragdoll;
    return null;
  }

  isPlayerBody(body) {
    const ud = body.getUserData();
    return !!(ud && ud.entity && ud.entity === this.player);
  }

  // ------------------------------------------------------------------ utils
  queue(fn) { this.queued.push(fn); }
  after(t, fn) { this.delayed.push({ t, fn }); }
  addUpdater(fn) { this.updaters.push(fn); }
  addFrameUpdater(fn) { this.frameUpdaters.push(fn); }

  destroyBody(b) {
    if (!b || this.destroyed.has(b)) return;
    this.destroyed.add(b);
    for (let je = b.getJointList(); je; je = je.next) je.joint._dead = true;
    this.renderer.unbind(b);
    this.world.destroyBody(b);
  }

  destroyJoint(j) {
    if (!j || j._dead) return false;
    j._dead = true;
    this.world.destroyJoint(j);
    return true;
  }

  chainExplosions(x, y, r) {
    for (const e of this.explosives) {
      if (!e.alive) continue;
      const p = e.body.getPosition();
      if (Math.hypot(p.x - x, p.y - y) < r) this.after(rand(0.08, 0.2), () => e.explode());
    }
  }

  // ------------------------------------------------------------------ loop
  update(frameDt, input) {
    if (!this.player) return;
    if (this.state !== 'paused') {
      if (this.slowmo > 0) {
        this.slowmo -= frameDt;
        this.timeScale = this.slowmo > 0 ? 0.35 : 1;
      }
      this.acc += Math.min(frameDt, 0.1) * this.timeScale;
      let steps = 0;
      while (this.acc >= DT && steps < 10) {
        this.step(DT, this.state === 'playing' ? input : EMPTY_INPUT);
        this.acc -= DT;
        steps++;
      }
      this.effects.update(frameDt * this.timeScale);
      for (const fn of this.frameUpdaters) fn(frameDt * this.timeScale);
      if (this.deathTimer > 0) {
        this.deathTimer -= frameDt;
        if (this.deathTimer <= 0) this.ui.showDeath(this.deathReason);
      }
    }
    // camera follows the rider
    const pl = this.player;
    const f = pl.focus;
    const p = f.getPosition();
    const v = pl.attached ? pl.chassis.getLinearVelocity() : f.getLinearVelocity();
    this.renderer.updateCamera(frameDt, p.x, p.y, v.x, v.y);
    this.renderer.sync();
    this.renderer.render(frameDt);
    this.ui.updateHud(this, Math.hypot(v.x, v.y));
  }

  step(dt, input) {
    for (let i = 0; i < this.updaters.length; i++) this.updaters[i](dt);
    this.player.update(dt, input);
    for (const rd of this.ragdolls) rd.update(dt);
    this.world.step(dt, 10, 6);
    this.time += dt;
    if (this.state === 'playing') this.levelTime += dt;

    const invDt = 1 / dt;
    this.player.checkBreaks(invDt);
    for (const rd of this.ragdolls) rd.checkBreaks(invDt);
    for (const j of this.breakables) {
      if (j._dead) continue;
      if (j.getReactionForce(invDt).length() > j.brk) {
        this.queue(() => { if (this.destroyJoint(j)) this.audio.play('crunch', 0.6); });
      }
    }
    for (const j of this.impaleJoints) {
      if (j._dead) continue;
      if (j.getReactionForce(invDt).length() > j.brk) this.queue(() => this.destroyJoint(j));
    }

    this.processContacts();
    this.processSensors();

    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t -= dt;
      if (d.t <= 0) {
        this.delayed.splice(i, 1);
        this.queued.push(d.fn);
      }
    }
    const q = this.queued;
    this.queued = [];
    for (const fn of q) fn();

    this.updateLoops();
    this.updateHarpoons(dt);

    const tp = this.player.focus.getPosition();
    if (tp.y < this.killY && this.player.rider.alive) this.player.rider.kill('fell into the abyss');
  }

  updateLoops() {
    if (!this.loops.length) return;
    const pl = this.player;
    const c = pl.attached ? pl.chassis.getPosition() : pl.focus.getPosition();
    let inAny = false;
    for (const L of this.loops) {
      const st = L.state.get(pl) || 0;
      if (st === 0 && c.y > L.cy + L.r * 0.1 && c.x < L.cx - L.r * 0.15 && Math.abs(c.x - L.cx) < L.r) L.state.set(pl, 1);
      else if (st === 1 && (c.x > L.cx + L.r * 1.05 || c.x < L.cx - L.r * 1.5 || c.y > L.cy + L.r * 1.5)) L.state.set(pl, 0);
      // "magnetic" track: lighter gravity, a pull onto the rails and pitch assist
      // while riding the loop with some speed (too slow and you fall off, as you should)
      const dx = c.x - L.cx, dy = c.y - L.cy;
      const d = Math.hypot(dx, dy);
      const onPath = (L.state.get(pl) || 0) === 0 ? dx > -0.5 : dx < 0;
      if (pl.attached && onPath && d < L.r + 0.5 && d > L.r * 0.45) {
        const nx = dx / d, ny = dy / d;
        const v = pl.chassis.getLinearVelocity();
        const vt = -v.x * ny + v.y * nx; // counter-clockwise tangential speed
        if (vt > 3.5 || dy < -L.r * 0.5) {
          inAny = true;
          for (const b of pl.allBodies()) {
            const m = b.getMass();
            b.applyForceToCenter(V(nx * m * 9, ny * m * 9), true);
          }
          const ch = pl.chassis;
          const target = Math.atan2(ny, nx) + Math.PI / 2;
          let err = target - ch.getAngle();
          err = Math.atan2(Math.sin(err), Math.cos(err));
          const M = pl.massCache || (pl.massCache = pl.totalMass());
          ch.applyTorque(err * 75 * M - (ch.getAngularVelocity() - vt / L.r) * 10 * M, true);
        }
      }
    }
    if (inAny !== !!pl.inLoop) {
      pl.inLoop = inAny;
      for (const b of pl.allBodies()) b.setGravityScale(inAny ? 0.3 : 1);
    }
  }

  updateHarpoons(dt) {
    for (let i = this.harpoons.length - 1; i >= 0; i--) {
      const h = this.harpoons[i];
      h.life -= dt;
      if (this.destroyed.has(h.body)) { this.harpoons.splice(i, 1); continue; }
      if (!h.stuck) {
        const v = h.body.getLinearVelocity();
        h.body.setAngle(Math.atan2(v.y, v.x));
        h.body.setAngularVelocity(0);
      }
      if (h.life <= 0) {
        this.destroyBody(h.body);
        this.harpoons.splice(i, 1);
      }
    }
  }

  processContacts() {
    const evs = this.contactEvents;
    this.contactEvents = [];
    for (const e of evs) {
      this.contactSide(e.fa, e.fb, e);
      this.contactSide(e.fb, e.fa, e);
    }
  }

  // velocity change experienced by body `bs` when hit by `bo` at closing speed vn
  impactDv(bs, bo, vn) {
    if (!bo.isDynamic()) return vn;
    const ms = bs.getMass(), mo = bo.getMass();
    return (vn * mo) / (ms + mo);
  }

  contactSide(fs, fo, e) {
    const bs = fs.getBody();
    if (this.destroyed.has(bs)) return;
    const bo = fo.getBody();
    const ud = bs.getUserData() || {};
    const fud = fs.getUserData();
    const oud = fo.getUserData();
    const pt = { x: e.x, y: e.y };
    const vn = e.vn;

    if (ud.ragdoll) {
      const rd = ud.ragdoll;
      const oBodyUd = bo.getUserData();
      // bodies bumping into other bodies are softer than steel and concrete
      const soft = oBodyUd && oBodyUd.ragdoll && oBodyUd.ragdoll !== rd;
      const dv = this.impactDv(bs, bo, vn) * (soft ? 0.6 : 1);
      if (rd.kind === 'npc' && rd.standing && oBodyUd && oBodyUd.entity === this.player) {
        rd.standing = false;
        rd.tone = 0.35;
        rd.hurtSound(1);
      }
      if (dv > 1.5) rd.onImpact(ud.part, dv, pt);
      if (oud && oud.hazard === 'spike' && vn > 0.8) {
        this.queue(() => rd.impale(ud.part, bo, pt));
      } else if (oud && oud.hazard === 'saw' && !bs.sawed) {
        bs.sawed = true;
        this.audio.play('saw', 1);
        this.effects.sparks(e.x, e.y, 8, 6);
        this.effects.bleed(e.x, e.y, 0, 4, 50, 7);
        this.queue(() => rd.sever(ud.part));
        this.after(0.4, () => { bs.sawed = false; });
      }
    } else if (ud.vehicle) {
      const dv = this.impactDv(bs, bo, vn);
      if (dv > 4) this.audio.play('clank', Math.min(1, dv / 12));
      if (oud && oud.hazard === 'saw' && Math.random() < 0.3) {
        this.effects.sparks(e.x, e.y, 4, 7);
        this.audio.play('saw', 0.5);
      }
      if (dv > 8 && !ud.wheel) this.effects.sparks(e.x, e.y, 4, 4);
    } else if (ud.prop) {
      const dv = this.impactDv(bs, bo, vn);
      if (dv > 3) this.audio.play('thud', Math.min(1, dv / 10), { key: 'p' });
    }

    if (fud) {
      if (fud.type === 'mine' && fud.obj.alive && bo.isDynamic() && !(fo.getFilterCategoryBits() & CAT.DEBRIS)) {
        const obj = fud.obj;
        this.queue(() => obj.explode());
      } else if (fud.type === 'barrel' && fud.obj.alive && this.impactDv(bs, bo, vn) > 7) {
        const obj = fud.obj;
        this.queue(() => obj.explode());
      } else if (fud.type === 'harpoon' && !fud.obj.stuck) {
        const h = fud.obj;
        h.stuck = true;
        const oud2 = bo.getUserData() || {};
        this.queue(() => {
          if (this.destroyed.has(h.body) || this.destroyed.has(bo)) return;
          const j = this.world.createJoint(new planck.WeldJoint({}, bo, h.body, V(e.x, e.y)));
          j.brk = 20000;
          this.impaleJoints.push(j);
          h.body.setGravityScale(1);
          if (oud2.ragdoll) {
            const rd = oud2.ragdoll;
            const lp = bo.getLocalPoint(V(e.x, e.y));
            this.effects.bleed(e.x, e.y, 0, 2, 40, 5);
            this.effects.addEmitter(bo, lp.x, lp.y, Math.PI / 2, 3, 40, 3);
            this.audio.play('spike', 1);
            rd.bloodLoss += 1.5;
            if (oud2.part === 'torso' || oud2.part === 'head') rd.kill('harpooned');
            else rd.hurtSound(1.3);
          } else {
            this.audio.play('clank', 0.8);
            this.effects.sparks(e.x, e.y, 6, 4);
          }
        });
      }
    }
  }

  processSensors() {
    const evs = this.sensorEvents;
    this.sensorEvents = [];
    for (const { s, o } of evs) {
      const ud = s.getUserData();
      if (!ud) continue;
      const ob = o.getBody();
      if (this.destroyed.has(ob)) continue;
      if (ud.type === 'token') {
        if (this.isPlayerBody(ob) && this.player.rider.alive && this.state === 'playing') this.win();
      } else if (ud.type === 'checkpoint') {
        if (this.isPlayerBody(ob) && this.player.rider.alive && this.state === 'playing') {
          const idx = this.checkpoints.indexOf(ud.obj);
          if (ud.obj.activate()) {
            this.checkpointIndex = Math.max(this.checkpointIndex, idx);
            this.audio.play('checkpoint', 1);
            this.ui.toast('Checkpoint!');
          }
        }
      } else if (ud.type === 'boost') {
        this.applyPad(ob, ud.obj, (bodies, obj) => {
          const a = obj.angle;
          const dx = Math.cos(a), dy = Math.sin(a);
          // one uniform velocity change for the whole rig keeps the joints happy
          let along = 0, mass = 0;
          for (const b of bodies) {
            const v = b.getLinearVelocity(), m = b.getMass();
            along += (v.x * dx + v.y * dy) * m;
            mass += m;
          }
          along /= mass || 1;
          const dv = Math.max(0, obj.power - along);
          for (const b of bodies) {
            const v = b.getLinearVelocity();
            b.setLinearVelocity(V(v.x + dx * dv, v.y + dy * dv));
            // spin wheels up too, otherwise they skid and scrub the boost away
            if (b.radius) b.setAngularVelocity(-((v.x + dx * dv) * dx + (v.y + dy * dv) * dy) / b.radius);
          }
          this.audio.play('boost', 1);
          const p = ob.getPosition();
          for (let i = 0; i < 12; i++) this.effects.spark(p.x, p.y, -dx * rand(2, 6) + rand(-1, 1), -dy * rand(2, 6) + rand(0, 2), 0xffcc33, rand(0.2, 0.5), rand(0.04, 0.08), { drag: 3 });
        });
      } else if (ud.type === 'trampoline') {
        this.applyPad(ob, ud.obj, (bodies, obj) => {
          const a = obj.body.getAngle() + Math.PI / 2;
          const nx = Math.cos(a), ny = Math.sin(a);
          let vnAvg = 0, mass = 0;
          for (const b of bodies) {
            const v = b.getLinearVelocity(), m = b.getMass();
            vnAvg += (v.x * nx + v.y * ny) * m;
            mass += m;
          }
          vnAvg /= mass || 1;
          const target = Math.max(obj.power, -vnAvg * 0.95);
          const dv = target - vnAvg;
          for (const b of bodies) {
            const v = b.getLinearVelocity();
            b.setLinearVelocity(V(v.x + nx * dv, v.y + ny * dv));
          }
          this.audio.play('spring', 1);
          obj.top.scale.y = 0.4;
          this.after(0.15, () => { obj.top.scale.y = 1; });
        });
      }
    }
  }

  applyPad(body, obj, fn) {
    const ent = this.entityOf(body);
    const key = ent || body;
    const last = obj.cooldown.get(key) ?? -10;
    if (this.time - last < 0.4) return;
    obj.cooldown.set(key, this.time);
    let bodies;
    if (ent && ent.allBodies) bodies = ent.allBodies();
    else bodies = [body];
    if (!bodies.length) return;
    fn(bodies, obj);
  }

  // ------------------------------------------------------------------ events
  onRagdollDeath(rd, reason) {
    if (this.player && rd === this.player.rider) {
      if (this.state === 'playing') {
        this.state = 'dead';
        this.deathReason = reason;
        this.deathTimer = 1.1;
        this.slowmo = 0.7;
        this.audio.play('die', 1);
        this.ui.onDeath(this);
      }
    } else if (this.player && rd === this.player.kid) {
      this.ui.toast('Junior is no more...');
    }
  }

  onRagdollInjury(rd, part) {
    if (this.player && rd === this.player.rider && this.state === 'playing' && rd.alive) {
      const names = { upperArmF: 'arm', upperArmB: 'arm', lowerArmF: 'forearm', lowerArmB: 'forearm', upperLegF: 'leg', upperLegB: 'leg', lowerLegF: 'shin', lowerLegB: 'shin' };
      if (names[part]) this.ui.toast(`Lost a ${names[part]}!`);
    }
  }

  onPlayerDetached() {
    if (this.state === 'playing' && this.player.rider.alive) this.ui.toast('Ejected! Arrows flail, Space curls up');
  }

  win() {
    this.state = 'won';
    this.audio.play('win', 1);
    this.audio.stopLoops();
    const [x, y] = this.tokenPos || [0, 0];
    for (let i = 0; i < 120; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(3, 12);
      this.effects.spark(x, y, Math.cos(a) * s, Math.sin(a) * s + 4, [0xff4d4d, 0xffd23a, 0x4dd2ff, 0x7dff6a, 0xff7ad9][i % 5], rand(0.8, 1.8), rand(0.06, 0.12), { grav: -9, drag: 1.2, z: rand(-1, 1) });
    }
    this.ui.onWin(this);
  }

  pause(on) {
    if (on && this.state === 'playing') {
      this.state = 'paused';
      this.audio.stopLoops();
    } else if (!on && this.state === 'paused') {
      this.state = 'playing';
    }
  }
}

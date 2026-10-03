import * as THREE from 'three';
import { planck, V, CAT, MASK, wrapAngle, clamp, rand } from './physics.js';

const PI = Math.PI;

// Bone definitions. Pose points are relative to the hip, facing +x.
// ref/lo/hi are revolute-joint reference & limits (relative to the parent).
// tone = holding torque (N·m), brk = reaction force (N) that rips the joint.
const BONES = {
  torso: { from: 'hip', to: 'neck', w: 0.34, m: 34 },
  head: { r: 0.2, m: 5, parent: 'torso', at: 'neck', ref: 0, lo: -0.6, hi: 0.6, tone: 70, brk: 7500 },
  upperArmF: { from: 'shoulder', to: 'elbowF', w: 0.13, m: 2.5, parent: 'torso', at: 'shoulder', ref: -PI, lo: -1.3, hi: 3.1, tone: 45, brk: 4600 },
  lowerArmF: { from: 'elbowF', to: 'handF', w: 0.11, m: 2, parent: 'upperArmF', at: 'elbowF', ref: 0, lo: -0.05, hi: 2.7, tone: 30, brk: 4200 },
  upperArmB: { from: 'shoulder', to: 'elbowB', w: 0.13, m: 2.5, parent: 'torso', at: 'shoulder', ref: -PI, lo: -1.3, hi: 3.1, tone: 45, brk: 4600 },
  lowerArmB: { from: 'elbowB', to: 'handB', w: 0.11, m: 2, parent: 'upperArmB', at: 'elbowB', ref: 0, lo: -0.05, hi: 2.7, tone: 30, brk: 4200 },
  upperLegF: { from: 'hip', to: 'kneeF', w: 0.18, m: 8, parent: 'torso', at: 'hip', ref: -PI, lo: -0.7, hi: 2.5, tone: 150, brk: 7800 },
  lowerLegF: { from: 'kneeF', to: 'footF', w: 0.15, m: 5, parent: 'upperLegF', at: 'kneeF', ref: 0, lo: -2.7, hi: 0.05, tone: 100, brk: 6600 },
  upperLegB: { from: 'hip', to: 'kneeB', w: 0.18, m: 8, parent: 'torso', at: 'hip', ref: -PI, lo: -0.7, hi: 2.5, tone: 150, brk: 7800 },
  lowerLegB: { from: 'kneeB', to: 'footB', w: 0.15, m: 5, parent: 'upperLegB', at: 'kneeB', ref: 0, lo: -2.7, hi: 0.05, tone: 100, brk: 6600 },
};
const ORDER = ['torso', 'head', 'upperLegB', 'lowerLegB', 'upperArmB', 'lowerArmB', 'upperLegF', 'lowerLegF', 'upperArmF', 'lowerArmF'];

// Limb lengths (scale 1)
const LEN = { torso: 0.62, shoulder: 0.55, upperArm: 0.29, lowerArm: 0.27, upperLeg: 0.47, lowerLeg: 0.46 };

// Poses: torso angle + where hands and feet should be (relative to hip, facing +x).
// Elbows and knees are solved with 2-bone IK so limb lengths never change.
export const POSES = {
  stand: { torso: PI / 2 + 0.04, handF: [0.24, 0.12], handB: [0.12, 0.06], footF: [0.06, -0.9], footB: [-0.08, -0.9] },
  sit: { torso: PI / 2 + 0.1, handF: [0.32, 0.24], handB: [0.27, 0.22], footF: [0.46, -0.42], footB: [0.4, -0.44] },
};

function ik(root, target, a, b, bendSign) {
  const dx = target[0] - root[0], dy = target[1] - root[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(a - b) + 0.01, a + b - 0.002);
  const th = Math.atan2(dy, dx);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const al = Math.acos(cosA) * bendSign;
  const mid = [root[0] + Math.cos(th + al) * a, root[1] + Math.sin(th + al) * a];
  const ea = Math.atan2(target[1] - mid[1], target[0] - mid[0]);
  const end = [mid[0] + Math.cos(ea) * b, mid[1] + Math.sin(ea) * b];
  return [mid, end];
}

export function solvePose(pose) {
  const ta = pose.torso;
  const P = { hip: [0, 0] };
  P.neck = [Math.cos(ta) * LEN.torso, Math.sin(ta) * LEN.torso];
  P.shoulder = [Math.cos(ta) * LEN.shoulder, Math.sin(ta) * LEN.shoulder];
  for (const side of ['F', 'B']) {
    [P['elbow' + side], P['hand' + side]] = ik(P.shoulder, pose['hand' + side], LEN.upperArm, LEN.lowerArm, -1);
    [P['knee' + side], P['foot' + side]] = ik(P.hip, pose['foot' + side], LEN.upperLeg, LEN.lowerLeg, 1);
  }
  return P;
}

const darken = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

export class Ragdoll {
  constructor(game, opts) {
    this.game = game;
    this.scale = opts.scale || 1;
    this.group = opts.group;
    this.entity = opts.entity || null;
    this.isPlayer = !!opts.isPlayer;
    this.kind = opts.kind || 'rider';
    this.look = Object.assign({
      skin: 0xf2c49b, shirt: 0x3b7dd8, pants: 0x2f3a52, shoes: 0x2a2a2a, hair: 0x4a3020,
      hairStyle: 'short', sleeves: 'short', voice: 1,
    }, opts.look || {});
    this.alive = true;
    this.bodies = {};
    this.joints = {};
    this.visuals = {};
    this.targets = {};
    this.detached = {};
    this.impaled = 0;
    this.tone = opts.tone ?? 1;
    this.standing = this.kind === 'npc';
    this.uprightAngle = PI / 2;
    this.lastScream = -10;
    this.bloodLoss = 0;
    this.uid = 'rd' + Ragdoll.nextId++;
    this.build(opts.x, opts.y, solvePose(opts.pose || POSES.stand), opts.angle || 0);
  }

  build(ox, oy, pose, rot) {
    const s = this.scale;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const P = {};
    for (const k in pose) {
      const [px, py] = pose[k];
      P[k] = [ox + (px * c - py * sn) * s, oy + (px * sn + py * c) * s];
    }
    this.posePoints = P;
    const world = this.game.world;
    const angles = {};
    for (const name of ORDER) {
      const b = BONES[name];
      let pos, angle, shape, area;
      if (name === 'head') {
        const ta = angles.torso;
        const n = P.neck;
        const d = 0.21 * s;
        pos = [n[0] + Math.cos(ta) * d, n[1] + Math.sin(ta) * d];
        angle = ta;
        shape = new planck.Circle(b.r * s);
        area = PI * (b.r * s) ** 2;
      } else {
        const a = P[b.from], e = P[b.to];
        const len = Math.max(0.05, Math.hypot(e[0] - a[0], e[1] - a[1]));
        let raw = Math.atan2(e[1] - a[1], e[0] - a[0]);
        if (b.parent) {
          const rel = wrapAngle(raw - angles[b.parent] - b.ref);
          raw = angles[b.parent] + b.ref + rel;
        }
        angle = raw;
        pos = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2];
        const hw = (b.w * s) / 2;
        shape = new planck.Box(len / 2 + hw * 0.4, hw);
        area = (len + hw * 0.8) * hw * 2;
        this['len_' + name] = len;
      }
      angles[name] = angle;
      const body = world.createBody({
        type: 'dynamic', position: V(pos[0], pos[1]), angle,
        angularDamping: 0.6, linearDamping: 0.02,
      });
      body.createFixture({
        shape, density: (b.m * s * s) / area, friction: 0.7, restitution: 0.05,
        filterCategoryBits: CAT.CHAR, filterMaskBits: MASK.ALL, filterGroupIndex: this.group,
      });
      body.setUserData({ ragdoll: this, part: name, entity: this.entity, bleeds: true });
      this.bodies[name] = body;

      if (b.parent) {
        const anchor = P[b.at];
        const j = world.createJoint(new planck.RevoluteJoint({
          enableLimit: true, lowerAngle: b.lo, upperAngle: b.hi, referenceAngle: b.ref,
          enableMotor: true, maxMotorTorque: b.tone * s * s, motorSpeed: 0,
        }, this.bodies[b.parent], body, V(anchor[0], anchor[1])));
        j.strain = 0;
        this.joints[name] = j;
        this.targets[name] = clamp(j.getJointAngle(), b.lo, b.hi);
      }
      this.buildVisual(name, body);
    }
    this.baseTargets = { ...this.targets };
    this.restAngles = {};
    for (const n in this.bodies) this.restAngles[n] = this.bodies[n].getAngle();
  }

  buildVisual(name, body) {
    const r = this.game.renderer;
    const L = this.look;
    const s = this.scale;
    const g = new THREE.Group();
    const b = BONES[name];
    const back = name.endsWith('B');
    const k = back ? 0.72 : 1;
    const z = name.endsWith('F') ? 0.2 * s : back ? -0.2 * s : 0;
    g.position.z = z;
    const col = (h) => (back ? darken(h, k) : h);

    if (name === 'head') {
      const inner = new THREE.Group();
      inner.rotation.z = -PI / 2;
      g.add(inner);
      const R = b.r * s;
      const skin = r.sphere(R, L.skin, { seg: 20 });
      inner.add(skin);
      // ear
      const ear = r.sphere(R * 0.22, darken(L.skin, 0.92));
      ear.scale.set(0.8, 1, 0.5);
      ear.position.set(-R * 0.08, 0, R * 0.95);
      inner.add(ear);
      // nose
      const nose = r.sphere(R * 0.2, darken(L.skin, 0.95));
      nose.position.set(R * 0.98, -R * 0.02, R * 0.15);
      inner.add(nose);
      // eye
      const eye = r.sphere(R * 0.24, 0xffffff, { seg: 10 });
      eye.position.set(R * 0.55, R * 0.25, R * 0.7);
      inner.add(eye);
      const pupil = r.sphere(R * 0.12, 0x111111, { seg: 8 });
      pupil.position.set(R * 0.72, R * 0.25, R * 0.86);
      inner.add(pupil);
      const xEye = new THREE.Group();
      for (const a of [PI / 4, -PI / 4]) {
        const bar = r.box(R * 0.42, R * 0.07, R * 0.05, 0x111111);
        bar.rotation.z = a;
        xEye.add(bar);
      }
      xEye.position.set(R * 0.66, R * 0.25, R * 0.9);
      xEye.rotation.y = 0.7;
      xEye.visible = false;
      inner.add(xEye);
      this.face = { pupil, xEye, eye };
      // brow
      const brow = r.box(R * 0.45, R * 0.08, R * 0.1, L.hair || 0x222222);
      brow.position.set(R * 0.6, R * 0.55, R * 0.7);
      brow.rotation.z = -0.15;
      inner.add(brow);
      // mouth
      const mouth = r.box(R * 0.35, R * 0.07, R * 0.12, 0x5a1a1a);
      mouth.position.set(R * 0.78, -R * 0.42, R * 0.45);
      mouth.rotation.y = 0.6;
      inner.add(mouth);
      this.face.mouth = mouth;
      if (L.glasses) {
        const gl = r.box(R * 0.55, R * 0.25, R * 0.06, 0x111111, { matOpts: { metalness: 0.5, roughness: 0.2 } });
        gl.position.set(R * 0.7, R * 0.25, R * 0.82);
        gl.rotation.y = 0.5;
        inner.add(gl);
      }
      if (L.beard) {
        const bd = new THREE.Mesh(new THREE.SphereGeometry(R * 1.03, 16, 10, 0, PI, PI * 0.5, PI * 0.5), r.mat(L.beardColor || L.hair));
        bd.rotation.y = PI / 2;
        bd.rotation.z = 0.0;
        bd.position.x = R * 0.05;
        inner.add(bd);
      }
      this.addHair(inner, R, L);
    } else {
      const len = this['len_' + name];
      const rad = (b.w * s) / 2;
      if (name === 'torso') {
        const shirt = r.capsule(len + rad * 0.6, rad, L.shirt);
        g.add(shirt);
        const pants = r.capsule(len * 0.42, rad * 1.04, L.pants);
        pants.position.x = -len / 2 + len * 0.16;
        g.add(pants);
        if (L.vest) {
          const vest = r.capsule(len * 0.7, rad * 1.06, L.vest);
          vest.position.x = len * 0.08;
          g.add(vest);
        }
        if (L.belly) {
          const belly = r.sphere(rad * 1.05, L.shirt);
          belly.position.set(-len * 0.08, -rad * 0.35, 0);
          g.add(belly);
        }
      } else if (name.startsWith('upperArm')) {
        g.add(r.capsule(len + rad * 0.6, rad, col(L.shirt)));
      } else if (name.startsWith('lowerArm')) {
        g.add(r.capsule(len + rad * 0.4, rad * 0.92, col(L.sleeves === 'long' ? L.shirt : L.skin)));
        const hand = r.sphere(rad * 1.25, col(L.gloves || L.skin));
        hand.position.x = len / 2 + rad * 0.3;
        g.add(hand);
      } else if (name.startsWith('upperLeg')) {
        g.add(r.capsule(len + rad * 0.6, rad, col(L.pants)));
      } else if (name.startsWith('lowerLeg')) {
        g.add(r.capsule(len + rad * 0.4, rad * 0.92, col(L.shorts ? L.skin : L.pants)));
        const shoe = r.box(rad * 1.4, rad * 3.2, rad * 1.7, col(L.shoes));
        shoe.position.set(len / 2 + rad * 0.2, rad * 0.9, 0);
        g.add(shoe);
      }
    }
    r.add(g);
    r.bind(body, g);
    this.visuals[name] = g;
  }

  addHair(inner, R, L) {
    const r = this.game.renderer;
    const style = L.hairStyle;
    if (style === 'bald') {
      const ring = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 16, 8, PI * 0.6, PI * 0.8, PI * 0.35, PI * 0.25), r.mat(L.hair));
      ring.rotation.y = PI / 2;
      inner.add(ring);
      return;
    }
    if (style === 'helmet' || style === 'cap') {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(R * (style === 'helmet' ? 1.16 : 1.06), 18, 10, 0, PI * 2, 0, PI * 0.5), r.mat(L.hat || 0xd23a2a, { roughness: 0.4 }));
      helmet.rotation.z = 0.15;
      helmet.position.y = R * 0.05;
      helmet.castShadow = true;
      inner.add(helmet);
      if (style === 'cap') {
        const brim = r.box(R * 0.8, R * 0.08, R * 1.4, L.hat || 0xd23a2a);
        brim.position.set(R * 0.85, R * 0.35, 0);
        inner.add(brim);
      } else {
        const stripe = r.box(R * 0.2, R * 0.2, R * 2.2, 0xffffff);
        stripe.position.set(0, R * 1.05, 0);
        stripe.scale.y = 0.4;
        inner.add(stripe);
      }
      return;
    }
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 18, 10, 0, PI * 2, 0, PI * 0.42), r.mat(L.hair));
    cap.rotation.z = 0.4;
    cap.castShadow = true;
    inner.add(cap);
    if (style === 'long' || style === 'bun' || style === 'pony') {
      if (style === 'long') {
        const back = r.box(R * 0.7, R * 1.6, R * 1.6, L.hair);
        back.position.set(-R * 0.6, -R * 0.3, 0);
        inner.add(back);
      } else {
        const bun = r.sphere(R * 0.45, L.hair);
        bun.position.set(-R * 0.85, R * (style === 'bun' ? 0.65 : 0.1), 0);
        inner.add(bun);
      }
    }
    if (style === 'spiky') {
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(R * 0.22, R * 0.6, 5), r.mat(L.hair));
        const a = 0.2 + i * 0.35;
        sp.position.set(Math.cos(a + PI / 2) * R * 0.95 + R * 0.1, Math.sin(a + PI / 2) * R * 0.95, 0);
        sp.rotation.z = a;
        inner.add(sp);
      }
    }
  }

  get torso() { return this.bodies.torso; }

  allBodies() {
    return Object.values(this.bodies).filter((b) => !this.game.destroyed.has(b));
  }

  partMass(name) {
    const b = this.bodies[name];
    return b && !this.game.destroyed.has(b) ? b.getMass() : 1;
  }

  setGroup(group) {
    this.group = group;
    for (const b of this.allBodies()) {
      for (let f = b.getFixtureList(); f; f = f.getNext()) {
        f.setFilterData({ groupIndex: group, categoryBits: CAT.CHAR, maskBits: MASK.ALL });
      }
    }
  }

  // ---------- per-step ----------
  update(dt) {
    const s2 = this.scale * this.scale;
    for (const name in this.joints) {
      const j = this.joints[name];
      if (!j || this.detached[name]) continue;
      if (j._dead) { this.detached[name] = true; continue; }
      const b = BONES[name];
      if (this.alive && this.tone > 0) {
        const err = this.targets[name] - j.getJointAngle();
        j.setMotorSpeed(clamp(err * 14, -14, 14));
        j.setMaxMotorTorque(b.tone * s2 * this.tone);
      } else {
        j.setMotorSpeed(0);
        j.setMaxMotorTorque(b.tone * s2 * 0.035);
      }
    }
    // NPCs try to stay upright until knocked over
    if (this.standing && this.alive) {
      const t = this.bodies.torso;
      const err = wrapAngle(this.restAngles.torso - t.getAngle());
      if (Math.abs(err) > 0.9) {
        this.standing = false;
        this.tone = 0.4;
      } else {
        for (const n of ['torso', 'upperLegF', 'upperLegB', 'lowerLegF', 'lowerLegB']) {
          const b = this.bodies[n];
          if (!b || this.detached[n]) continue;
          const e = wrapAngle(this.restAngles[n] - b.getAngle());
          const k = n === 'torso' ? 2600 : 900;
          b.applyTorque(e * k * this.scale - b.getAngularVelocity() * k * 0.1 * this.scale, true);
        }
      }
    }
    if (this.bloodLoss > 6 && this.alive && this.kind !== 'npc') {
      this.kill('blood loss');
    }
  }

  checkBreaks(invDt) {
    if (this.game.time < 0.6) return;
    const s2 = this.scale * this.scale;
    const tough = this.game.toughness;
    for (const name in this.joints) {
      const j = this.joints[name];
      if (!j || this.detached[name] || j._dead) continue;
      const f = j.getReactionForce(invDt).length();
      const thr = BONES[name].brk * s2 * tough;
      if (f > thr) {
        j.strain++;
        if (j.strain >= 2 || f > thr * 1.8) this.game.queue(() => this.detach(name));
      } else j.strain = 0;
    }
  }

  // ---------- injuries ----------
  detach(name, silent = false) {
    if (this.detached[name] || !this.joints[name]) return;
    const j = this.joints[name];
    const g = this.game;
    if (j._dead) { this.detached[name] = true; return; }
    this.detached[name] = true;
    const bodyA = j.getBodyA(), bodyB = j.getBodyB();
    const la = j.getLocalAnchorA(), lb = j.getLocalAnchorB();
    const wp = bodyA.getWorldPoint(la);
    g.destroyJoint(j);
    this.joints[name] = null;
    const parentName = BONES[name].parent;
    const rad = (BONES[name].w || 0.2) * this.scale * 0.55;
    this.addStump(parentName, la, rad);
    this.addStump(name, lb, rad);
    const dirA = Math.atan2(la.y, la.x);
    const dirB = Math.atan2(lb.y, lb.x);
    g.effects.addEmitter(bodyA, la.x, la.y, dirA, name === 'head' ? 5 : 3, name === 'head' ? 90 : 55, name === 'head' ? 6 : 4);
    g.effects.addEmitter(bodyB, lb.x, lb.y, dirB, 1.6, 35, 3);
    const v = bodyA.getLinearVelocity();
    g.effects.bleed(wp.x, wp.y, v.x, v.y, 30, 4);
    if (!silent) g.audio.play('crunch', 1);
    this.bloodLoss += name.startsWith('upper') ? 2 : 1;
    if (name === 'head') this.kill('decapitated');
    else if (this.alive) this.hurtSound(1.2);
    g.onRagdollInjury(this, name);
  }

  addStump(name, local, rad) {
    const vis = this.visuals[name];
    if (!vis) return;
    const st = this.game.renderer.sphere(rad, 0x8a0b0b, { matOpts: { roughness: 0.25 } });
    st.position.set(local.x, local.y, 0);
    const bone = this.game.renderer.sphere(rad * 0.45, 0xf1ead8);
    bone.position.set(local.x * 1.04, local.y * 1.04, 0.02);
    if (name === 'head') {
      // head visual has an inner rotated group; local coords still match body frame on outer group
    }
    vis.add(st);
    vis.add(bone);
  }

  explodeHead() {
    const head = this.bodies.head;
    if (!head || this.game.destroyed.has(head)) return;
    const g = this.game;
    const p = head.getPosition();
    const v = head.getLinearVelocity();
    this.kill('head exploded');
    if (this.joints.head) {
      this.detach('head', true);
    }
    g.effects.gibs(p.x, p.y, v.x * 0.3, v.y * 0.3 + 2, [this.look.skin, 0x8a0b0b, 0xb01010, this.look.hair || 0x333333, 0xe8e0d0], 14);
    g.effects.bleed(p.x, p.y, v.x * 0.3, v.y * 0.3 + 1, 90, 7);
    g.audio.play('splat', 1.4);
    g.audio.play('crunch', 1.2);
    g.renderer.shake(0.3);
    g.renderer.unbind(head);
    g.destroyBody(head);
    this.face = null;
    this.kill('head exploded');
  }

  impale(name, otherBody, point) {
    const g = this.game;
    const b = this.bodies[name];
    if (!b || g.destroyed.has(b) || b.impaled) return;
    if (this.impaled > 5) return;
    b.impaled = true;
    this.impaled++;
    const j = g.world.createJoint(new planck.WeldJoint({ frequencyHz: 0, dampingRatio: 0 }, otherBody, b, V(point.x, point.y)));
    j.brk = 9000;
    g.impaleJoints.push(j);
    const v = b.getLinearVelocity();
    g.effects.bleed(point.x, point.y, v.x * 0.2, Math.abs(v.y) * 0.2 + 2, 35, 4);
    g.effects.addEmitter(b, b.getLocalPoint(V(point.x, point.y)).x, b.getLocalPoint(V(point.x, point.y)).y, PI / 2, 2.5, 30, 2.5);
    g.audio.play('spike', 1);
    this.bloodLoss += 1.5;
    if (name === 'torso' || name === 'head') this.kill('impaled');
    else this.hurtSound(1.3);
  }

  sever(name) {
    if (name === 'head') {
      this.explodeHead();
      return;
    }
    if (name === 'torso') {
      // saw through the torso: rip off everything attached
      for (const n of ['head', 'upperArmF', 'upperArmB', 'upperLegF', 'upperLegB']) {
        if (Math.random() < 0.6) this.detach(n);
      }
      const t = this.bodies.torso;
      const p = t.getPosition();
      this.game.effects.bleed(p.x, p.y, 0, 3, 60, 6);
      this.kill('sawed');
      return;
    }
    this.detach(name);
  }

  onImpact(name, dv, point) {
    const g = this.game;
    if (dv > 7 && g.effects.goreLevel > 0) {
      g.effects.bleed(point.x, point.y, 0, 1, Math.min(40, (dv - 6) * 3), Math.min(6, dv * 0.3));
    }
    if (dv > 5) g.audio.play('thud', Math.min(1.2, dv / 14), { key: 'r' });
    if (!this.alive) return;
    const tough = g.toughness;
    if (name === 'head') {
      if (dv > 22 * tough) { g.queue(() => this.explodeHead()); return; }
      if (dv > 13 * tough) { this.kill('head trauma'); return; }
    } else if (name === 'torso') {
      if (dv > 19 * tough) { this.kill('internal injuries'); return; }
    }
    if (dv > 9) this.hurtSound(dv / 12);
    if (this.kind === 'npc' && dv > 2.5 && this.standing) {
      this.standing = false;
      this.tone = 0.35;
      this.hurtSound(1);
    }
  }

  onExplosion(name, falloff) {
    if (!this.alive) return;
    if (falloff > 0.55 && (name === 'torso' || name === 'head')) this.kill('blown up');
    else this.hurtSound(1.2);
    this.standing = false;
  }

  hurtSound(k = 1) {
    const g = this.game;
    const now = g.time;
    if (now - this.lastScream < 0.8) return;
    this.lastScream = now;
    const pitch = this.look.voice * (this.scale < 0.8 ? 1.8 : 1);
    if (k > 1.1 && Math.random() < 0.7) g.audio.play('scream', Math.min(1, k * 0.7), { pitch, key: this.uid });
    else g.audio.play('ouch', Math.min(1, k * 0.8), { pitch, key: this.uid });
  }

  kill(reason) {
    if (!this.alive) return;
    this.alive = false;
    this.deathReason = reason;
    this.standing = false;
    if (this.face && this.face.pupil) {
      this.face.pupil.visible = false;
      this.face.xEye.visible = true;
    }
    if (reason !== 'head exploded' && reason !== 'decapitated') {
      const pitch = this.look.voice * (this.scale < 0.8 ? 1.8 : 1);
      this.game.audio.play('scream', 1, { pitch, key: this.uid });
    }
    this.game.onRagdollDeath(this, reason);
  }

  // Ejected but alive: arrow keys flail the limbs
  flail(input) {
    if (!this.alive) return;
    const T = this.targets, B = this.baseTargets;
    let arm = 0.4, hip = 0.6, knee = -0.5, elbow = 0.5;
    if (input.up) { arm = 2.9; elbow = 0.1; }
    if (input.down) { arm = -1.0; elbow = 0.3; }
    if (input.left) { hip = -0.6; knee = -0.05; }
    if (input.right) { hip = 2.3; knee = -0.3; }
    if (input.primary) { hip = 2.3; knee = -2.5; arm = 1.4; elbow = 2.4; }
    for (const side of ['F', 'B']) {
      const off = side === 'F' ? 0 : 0.35;
      T['upperArm' + side] = arm - off;
      T['lowerArm' + side] = elbow;
      T['upperLeg' + side] = hip + (side === 'B' ? -0.3 : 0);
      T['lowerLeg' + side] = knee;
    }
    T.head = B.head || 0;
  }

  relax() {
    this.targets = { ...this.baseTargets };
  }

  destroy() {
    for (const name in this.bodies) {
      const b = this.bodies[name];
      if (!this.game.destroyed.has(b)) {
        this.game.renderer.unbind(b);
        this.game.destroyBody(b);
      }
    }
  }
}

Ragdoll.nextId = 1;

export { BONES };

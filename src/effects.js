import * as THREE from 'three';
import { planck, V, CAT, MASK, rand, clamp } from './physics.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _n = new THREE.Vector3();

class Pool {
  constructor(scene, geo, mat, max) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // init colors
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, _c.set(0xffffff));
    scene.add(this.mesh);
    this.items = [];
  }
}

export class Effects {
  constructor(game) {
    this.game = game;
    const scene = game.renderer.scene;
    this.scene = scene;
    this.goreLevel = 1;

    // Blood droplets
    const dropGeo = new THREE.SphereGeometry(1, 6, 4);
    this.blood = new Pool(scene, dropGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1 }), 1800);
    this.blood.mesh.castShadow = false;

    // Splat decals
    const decalGeo = new THREE.CircleGeometry(1, 12);
    this.decalMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.35, metalness: 0.0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.decals = new THREE.InstancedMesh(decalGeo, this.decalMat, 3000);
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.receiveShadow = true;
    for (let i = 0; i < 3000; i++) this.decals.setColorAt(i, _c.set(0x880000));
    scene.add(this.decals);
    this.decalIndex = 0;
    this.decalCount = 0;

    // Glowing particles (fire, sparks)
    this.glow = new Pool(scene, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }), 900);
    // Smoke / dust
    this.smoke = new Pool(scene, new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), 600);

    this.emitters = [];
    this.debris = [];
    this.lights = [];
  }

  reset() {
    this.blood.items.length = 0;
    this.glow.items.length = 0;
    this.smoke.items.length = 0;
    this.blood.mesh.count = this.glow.mesh.count = this.smoke.mesh.count = 0;
    this.decals.count = 0;
    this.decalIndex = 0;
    this.decalCount = 0;
    this.emitters.length = 0;
    this.debris.length = 0;
    for (const l of this.lights) this.scene.remove(l.light);
    this.lights.length = 0;
  }

  // ---------------- blood ----------------
  bleed(x, y, vx, vy, count, spread = 4, opts = {}) {
    count = Math.round(count * this.goreLevel);
    const items = this.blood.items;
    for (let i = 0; i < count; i++) {
      if (items.length >= this.blood.max) items.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * spread;
      items.push({
        x: x + rand(-0.05, 0.05), y: y + rand(-0.05, 0.05), z: opts.z ?? rand(-0.45, 0.55),
        vx: vx + Math.cos(a) * sp, vy: vy + Math.sin(a) * sp + rand(0, spread * 0.3), vz: rand(-0.6, 0.6),
        life: 4,
        size: rand(0.025, 0.065) * (opts.scale || 1),
        shade: rand(0.55, 1),
      });
    }
  }

  addEmitter(body, lx, ly, dirAngle, duration = 2.5, rate = 60, speed = 4) {
    if (this.goreLevel <= 0) return;
    this.emitters.push({ body, lx, ly, dirAngle, t: 0, duration, rate, speed, acc: 0 });
  }

  addDecal(x, y, z, nx, ny, size, color = null) {
    const i = this.decalIndex;
    this.decalIndex = (this.decalIndex + 1) % 3000;
    this.decalCount = Math.min(3000, this.decalCount + 1);
    this.decals.count = this.decalCount;
    _n.set(nx, ny, 0).normalize();
    _q.setFromUnitVectors(_zAxis, _n);
    // random spin around normal
    const spin = new THREE.Quaternion().setFromAxisAngle(_n, Math.random() * Math.PI * 2);
    _q.premultiply(spin);
    _p.set(x + nx * 0.012, y + ny * 0.012, z);
    _s.set(size * rand(0.8, 1.6), size, 1);
    _m.compose(_p, _q, _s);
    this.decals.setMatrixAt(i, _m);
    this.decals.setColorAt(i, color ? _c.set(color) : _c.setRGB(rand(0.35, 0.6), 0, 0.01));
    this.decals.instanceMatrix.needsUpdate = true;
    this.decals.instanceColor.needsUpdate = true;
  }

  // ---------------- glow / smoke ----------------
  spark(x, y, vx, vy, color, life, size, opts = {}) {
    const items = this.glow.items;
    if (items.length >= this.glow.max) items.shift();
    items.push({ x, y, z: opts.z ?? rand(-0.3, 0.3), vx, vy, vz: opts.vz ?? 0, life, maxLife: life, size, color, grav: opts.grav ?? 0, drag: opts.drag ?? 1.5 });
  }

  puff(x, y, vx, vy, color, life, size, opts = {}) {
    const items = this.smoke.items;
    if (items.length >= this.smoke.max) items.shift();
    items.push({ x, y, z: opts.z ?? rand(-0.5, 0.5), vx, vy, vz: 0, life, maxLife: life, size, color, grav: opts.grav ?? 0.6, drag: opts.drag ?? 1.2, grow: opts.grow ?? 1.8 });
  }

  dust(x, y, amount = 6) {
    for (let i = 0; i < amount; i++) {
      this.puff(x, y, rand(-1.5, 1.5), rand(0.2, 1.5), 0xc8b89a, rand(0.5, 1.0), rand(0.08, 0.2), { grav: 0.2 });
    }
  }

  sparks(x, y, n = 10, speed = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.3, 1) * speed;
      this.spark(x, y, Math.cos(a) * s, Math.sin(a) * s + 2, 0xffd060, rand(0.2, 0.5), rand(0.025, 0.05), { grav: -12, drag: 0.5 });
    }
  }

  flash(x, y, color = 0xffaa44, intensity = 60, dist = 18, dur = 0.35) {
    const light = new THREE.PointLight(color, intensity, dist, 1.5);
    light.position.set(x, y, 2);
    this.scene.add(light);
    this.lights.push({ light, t: 0, dur, intensity });
  }

  // ---------------- explosion ----------------
  explosion(x, y, radius = 5, power = 22) {
    const game = this.game;
    game.audio.play('explosion', 1);
    game.renderer.shake(0.9);
    this.flash(x, y, 0xffa040, 120, radius * 5, 0.5);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1, 11);
      this.spark(x, y, Math.cos(a) * s, Math.sin(a) * s, i % 3 ? 0xff7a1a : 0xffd84a, rand(0.25, 0.7), rand(0.12, 0.35), { grav: 2, drag: 3, z: rand(-1, 1) });
    }
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.5, 4);
      this.puff(x, y, Math.cos(a) * s, Math.sin(a) * s + 1, 0x3a3634, rand(1.2, 2.5), rand(0.3, 0.7), { grav: 1.2, grow: 2.2, z: rand(-1.2, 1.2) });
    }
    this.sparks(x, y, 30, 14);
    // scorch decals on nearby static ground
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + rand(-1, 1);
      this.rayDecal(x, y, x + Math.cos(a) * radius * 0.7, y + Math.sin(a) * radius * 0.7, rand(0.6, 1.2), 0x1a1512);
    }
    // impulses
    const aabb = new planck.AABB(V(x - radius, y - radius), V(x + radius, y + radius));
    const bodies = new Set();
    game.world.queryAABB(aabb, (f) => {
      const b = f.getBody();
      if (b.isDynamic() && !f.isSensor()) bodies.add(b);
      return true;
    });
    for (const b of bodies) {
      const p = b.getWorldCenter();
      const dx = p.x - x, dy = p.y - y;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const falloff = 1 - d / radius;
      const dv = power * falloff;
      const nx = d > 0.01 ? dx / d : 0, ny = d > 0.01 ? dy / d : 1;
      const m = b.getMass();
      b.applyLinearImpulse(V(nx * dv * m, (ny * dv + dv * 0.25) * m), p, true);
      b.applyAngularImpulse(rand(-1, 1) * m * 0.5, true);
      const ud = b.getUserData();
      if (ud && ud.ragdoll) ud.ragdoll.onExplosion(ud.part, falloff);
    }
  }

  rayDecal(x1, y1, x2, y2, size, color) {
    let hit = null;
    this.game.world.rayCast(V(x1, y1), V(x2, y2), (f, p, n, frac) => {
      if (f.isSensor() || !f.getBody().isStatic()) return -1;
      hit = { x: p.x, y: p.y, nx: n.x, ny: n.y };
      return frac;
    });
    if (hit) this.addDecal(hit.x, hit.y, rand(-0.6, 0.7), hit.nx, hit.ny, size, color);
  }

  // ---------------- debris ----------------
  addDebris(body, obj, life = 6) {
    this.game.renderer.add(obj);
    this.game.renderer.bind(body, obj);
    this.debris.push({ body, obj, life, maxLife: life });
    if (this.debris.length > 140) this.killDebris(this.debris.shift());
  }

  killDebris(d) {
    this.game.renderer.unbind(d.body);
    this.game.destroyBody(d.body);
  }

  gibs(x, y, vx, vy, colors, n = 8) {
    const r = this.game.renderer;
    for (let i = 0; i < n; i++) {
      const s = rand(0.05, 0.12);
      const body = this.game.world.createBody({ type: 'dynamic', position: V(x + rand(-0.15, 0.15), y + rand(-0.15, 0.15)), angle: rand(0, 6) });
      body.createFixture({ shape: new planck.Box(s, s * rand(0.6, 1)), density: 2, friction: 0.8, restitution: 0.2, filterCategoryBits: CAT.DEBRIS, filterMaskBits: MASK.DEBRIS });
      body.setLinearVelocity(V(vx + rand(-6, 6), vy + rand(0, 8)));
      body.setAngularVelocity(rand(-20, 20));
      const col = colors[i % colors.length];
      const mesh = r.box(s * 2, s * 2, s * 2, col);
      const g = new THREE.Group();
      g.add(mesh);
      g.position.z = rand(-0.4, 0.4);
      this.addDebris(body, g, rand(5, 9));
      body.setUserData({ bleeds: true });
    }
  }

  shards(x, y, w, h, vx, vy, color = 0xaee4ff, n = 14) {
    const r = this.game.renderer;
    const mat = r.mat(color, { transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.3 });
    for (let i = 0; i < n; i++) {
      const px = x + rand(-w / 2, w / 2), py = y + rand(-h / 2, h / 2);
      const s = rand(0.08, 0.25);
      const pts = [[0, 0], [s * rand(0.6, 1.4), rand(-s, s) * 0.3], [rand(-s, s) * 0.4, s * rand(0.6, 1.4)]];
      const body = this.game.world.createBody({ type: 'dynamic', position: V(px, py), angle: rand(0, 6) });
      try {
        body.createFixture({ shape: new planck.Polygon(pts.map(([a, b]) => V(a, b))), density: 1, friction: 0.4, restitution: 0.3, filterCategoryBits: CAT.DEBRIS, filterMaskBits: MASK.DEBRIS });
      } catch (e) {
        body.createFixture({ shape: new planck.Box(s / 2, s / 2), density: 1, filterCategoryBits: CAT.DEBRIS, filterMaskBits: MASK.DEBRIS });
      }
      body.setLinearVelocity(V(vx * rand(0.3, 1) + rand(-3, 3), vy * rand(0.3, 1) + rand(-1, 4)));
      body.setAngularVelocity(rand(-15, 15));
      const shape = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
      const mesh = new THREE.Mesh(geo, mat);
      const g = new THREE.Group();
      g.add(mesh);
      g.position.z = rand(-0.5, 0.5);
      this.addDebris(body, g, rand(4, 7));
    }
    for (let i = 0; i < 12; i++) this.spark(x + rand(-w / 2, w / 2), y + rand(-h / 2, h / 2), rand(-3, 3), rand(-1, 4), 0xdff6ff, rand(0.2, 0.5), rand(0.02, 0.05), { grav: -8 });
  }

  // ---------------- update ----------------
  update(dt) {
    const world = this.game.world;

    // emitters
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.t += dt;
      if (e.t > e.duration || !e.body.isActive() || this.game.destroyed.has(e.body)) {
        this.emitters.splice(i, 1);
        continue;
      }
      const fade = 1 - e.t / e.duration;
      e.acc += dt * e.rate * fade;
      const p = e.body.getWorldPoint(V(e.lx, e.ly));
      const v = e.body.getLinearVelocityFromWorldPoint(p);
      const a = e.body.getAngle() + e.dirAngle;
      while (e.acc >= 1) {
        e.acc -= 1;
        const sp = e.speed * rand(0.6, 1.2) * (0.4 + fade * 0.6);
        const aa = a + rand(-0.25, 0.25);
        this.bleedOne(p.x, p.y, v.x + Math.cos(aa) * sp, v.y + Math.sin(aa) * sp);
      }
    }

    // blood droplets
    const items = this.blood.items;
    const g = -14;
    let w = 0;
    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      b.life -= dt;
      if (b.life <= 0) continue;
      b.vy += g * dt;
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      let hit = null;
      world.rayCast(V(b.x, b.y), V(nx, ny), (f, p, n, frac) => {
        if (f.isSensor()) return -1;
        const cat = f.getFilterCategoryBits();
        if (cat & (CAT.CHAR | CAT.DEBRIS | CAT.PROJECTILE)) return -1;
        hit = { x: p.x, y: p.y, nx: n.x, ny: n.y, f };
        return frac;
      });
      if (hit) {
        if (hit.f.getBody().isStatic() && Math.random() < 0.85) {
          this.addDecal(hit.x, hit.y, clamp(b.z, -0.9, 0.95), hit.nx, hit.ny, b.size * rand(1.6, 3.2));
        }
        continue;
      }
      b.x = nx; b.y = ny; b.z += b.vz * dt;
      items[w++] = b;
    }
    items.length = w;
    const bm = this.blood.mesh;
    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      const sp = Math.hypot(b.vx, b.vy);
      _p.set(b.x, b.y, b.z);
      _q.setFromAxisAngle(_zAxis, Math.atan2(b.vy, b.vx));
      _s.set(b.size * (1 + Math.min(sp * 0.08, 1.2)), b.size, b.size);
      _m.compose(_p, _q, _s);
      bm.setMatrixAt(i, _m);
      bm.setColorAt(i, _c.setRGB(0.6 * b.shade, 0.0, 0.02));
    }
    bm.count = items.length;
    bm.instanceMatrix.needsUpdate = true;
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true;

    this.updatePool(this.glow, dt, false);
    this.updatePool(this.smoke, dt, true);

    // debris lifetime
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life < 1) d.obj.scale.setScalar(Math.max(0.01, d.life));
      if (d.life <= 0) {
        this.killDebris(d);
        this.debris.splice(i, 1);
      }
    }

    // lights
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      l.t += dt;
      l.light.intensity = l.intensity * Math.max(0, 1 - l.t / l.dur);
      if (l.t >= l.dur) {
        this.scene.remove(l.light);
        this.lights.splice(i, 1);
      }
    }
  }

  bleedOne(x, y, vx, vy) {
    if (this.goreLevel <= 0) return;
    const items = this.blood.items;
    if (items.length >= this.blood.max) items.shift();
    items.push({ x, y, z: rand(-0.3, 0.35), vx, vy, vz: rand(-0.3, 0.3), life: 4, size: rand(0.025, 0.05), shade: rand(0.6, 1) });
  }

  updatePool(pool, dt, isSmoke) {
    const items = pool.items;
    let w = 0;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag; p.vy *= drag;
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      items[w++] = p;
    }
    items.length = w;
    const mesh = pool.mesh;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      const t = p.life / p.maxLife;
      const s = isSmoke ? p.size * (1 + (1 - t) * p.grow) * Math.min(1, t * 3) : p.size * t;
      _p.set(p.x, p.y, p.z);
      _q.identity();
      _s.setScalar(Math.max(0.001, s));
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      _c.set(p.color);
      if (!isSmoke) _c.multiplyScalar(0.6 + t * 0.8);
      mesh.setColorAt(i, _c);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

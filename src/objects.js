import * as THREE from 'three';
import { planck, V, CAT, MASK, triangulate, clamp, rand } from './physics.js';
import { noiseTexture, woodTexture, brickTexture, hazardStripeTexture, arrowTexture, THEMES } from './render.js';
import { Ragdoll, POSES } from './ragdoll.js';

const PI = Math.PI;
const Z_FRONT = 1.3, Z_BACK = -3.2;

let npcGroup = -100;

const NPC_LOOKS = [
  { shirt: 0x8e44ad, pants: 0x2c3e50, hair: 0x111111, hairStyle: 'short' },
  { shirt: 0x27ae60, pants: 0x34495e, hair: 0xf1c40f, hairStyle: 'long', voice: 1.4 },
  { shirt: 0xe67e22, pants: 0x1b2631, hair: 0x6e2c00, hairStyle: 'spiky' },
  { shirt: 0x95a5a6, pants: 0x2e4053, hair: 0xdddddd, hairStyle: 'bald', beard: true, beardColor: 0xdddddd, voice: 0.8 },
  { shirt: 0xc0392b, pants: 0x212f3d, hair: 0x873600, hairStyle: 'pony', voice: 1.35 },
  { shirt: 0x2980b9, pants: 0x7b241c, hair: 0x1c1c1c, hairStyle: 'cap', hat: 0x111111 },
  { shirt: 0xf5f5f5, pants: 0x111111, hair: 0x4a2a10, hairStyle: 'bun', voice: 1.3, glasses: true },
];

export class LevelBuilder {
  constructor(game, theme) {
    this.game = game;
    this.world = game.world;
    this.R = game.renderer;
    this.theme = THEMES[theme] || THEMES.meadow;
    this.minX = Infinity;
    this.maxX = -Infinity;
    this.minY = Infinity;
    this.groundSamples = [];
    this.npcs = [];
  }

  extend(x, y) {
    this.minX = Math.min(this.minX, x);
    this.maxX = Math.max(this.maxX, x);
    this.minY = Math.min(this.minY, y);
  }

  staticBody(x = 0, y = 0, angle = 0, ud = null) {
    const b = this.world.createBody({ type: 'static', position: V(x, y), angle });
    if (ud) b.setUserData(ud);
    return b;
  }

  sfix(body, shape, opts = {}) {
    return body.createFixture({
      shape, friction: opts.friction ?? 0.8, restitution: opts.restitution ?? 0.05, density: opts.density ?? 0,
      filterCategoryBits: opts.cat ?? CAT.STATIC, filterMaskBits: opts.mask ?? MASK.ALL, isSensor: !!opts.sensor,
    });
  }

  dirtMaterials() {
    const t = this.theme;
    const tex = noiseTexture();
    const cap = new THREE.MeshStandardMaterial({ color: t.dirt, map: tex, roughness: 0.95 });
    cap.map.repeat.set(0.25, 0.25);
    const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(t.dirt).multiplyScalar(0.85), map: tex, roughness: 0.95 });
    return [cap, side];
  }

  // ---------------------------------------------------------------- terrain
  ground(points, opts = {}) {
    const body = this.staticBody(0, 0, 0, { ground: true });
    const pts = points.map(([x, y]) => V(x, y));
    this.sfix(body, new planck.Chain(pts, false), { friction: opts.friction ?? 0.9 });
    for (const [x, y] of points) {
      this.extend(x, y);
      this.groundSamples.push([x, y]);
    }
    const bottom = Math.min(...points.map((p) => p[1])) - (opts.depth ?? 40);
    const poly = [...points, [points[points.length - 1][0], bottom], [points[0][0], bottom]];
    const mats = opts.material ? [opts.material, opts.material] : this.dirtMaterials();
    const m = this.R.extrudePoly(poly, 0, Z_FRONT, Z_BACK, { material: mats, castShadow: false });
    this.R.add(m);
    // grass/top strip
    if (opts.top !== false) {
      const topCol = opts.top ?? this.theme.grass;
      const band = [...points.map(([x, y]) => [x, y + 0.02]), ...points.slice().reverse().map(([x, y]) => [x, y - 0.32])];
      const bm = this.R.extrudePoly(band, topCol, Z_FRONT + 0.02, Z_BACK - 0.02, { castShadow: false, matOpts: { roughness: 0.9 } });
      this.R.add(bm);
    }
    return body;
  }

  // Closed static polygon (any shape; triangulated)
  poly(points, opts = {}) {
    const body = this.staticBody(0, 0, 0, opts.ud || { ground: true });
    for (const tri of triangulate(points)) {
      try { this.sfix(body, new planck.Polygon(tri.map(([x, y]) => V(x, y))), opts); } catch (e) { /* degenerate */ }
    }
    for (const [x, y] of points) this.extend(x, y);
    const mat = opts.material || (opts.style ? this.styleMat(opts.style) : null);
    const m = this.R.extrudePoly(points, opts.color ?? this.theme.rock, opts.zFront ?? Z_FRONT, opts.zBack ?? Z_BACK, { material: mat || undefined });
    this.R.add(m);
    return body;
  }

  styleMat(style) {
    if (style === 'wood') {
      const t = woodTexture().clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
    }
    if (style === 'brick') {
      const t = brickTexture();
      t.repeat.set(0.5, 0.5);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
    }
    if (style === 'metal') return this.R.mat(0x8a9099, { metalness: 0.6, roughness: 0.4 });
    if (style === 'concrete') {
      const m = new THREE.MeshStandardMaterial({ color: 0xa8a8a8, map: noiseTexture(), roughness: 0.95 });
      return m;
    }
    if (style === 'hazard') {
      const t = hazardStripeTexture();
      t.repeat.set(1, 1);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
    }
    return null;
  }

  // Static rectangle (platform / wall / ramp segment)
  platform(x, y, w, h, angle = 0, opts = {}) {
    const body = this.staticBody(x, y, angle, opts.ud || { ground: true });
    this.sfix(body, new planck.Box(w / 2, h / 2), opts);
    this.extend(x - w / 2, y - h / 2);
    this.extend(x + w / 2, y + h / 2);
    const depth = (opts.zFront ?? Z_FRONT) - (opts.zBack ?? Z_BACK);
    const mat = opts.material || this.styleMat(opts.style || 'concrete');
    const m = this.R.box(w, h, depth, opts.color ?? 0xaaaaaa, mat ? { material: mat } : {});
    m.position.set(x, y, ((opts.zFront ?? Z_FRONT) + (opts.zBack ?? Z_BACK)) / 2);
    m.rotation.z = angle;
    this.R.add(m);
    return body;
  }

  // Ramp: right triangle. dir=1 rises to the right, -1 rises to the left.
  ramp(x, y, w, h, dir = 1, opts = {}) {
    const pts = dir > 0 ? [[x, y], [x + w, y], [x + w, y + h]] : [[x, y], [x + w, y], [x, y + h]];
    if (opts.curve) {
      const n = 14;
      const arc = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        arc.push([x + t * w, dir > 0 ? y + h * t * t : y + h * (1 - t) * (1 - t)]);
      }
      return this.poly([[x, y], [x + w, y], ...arc.reverse().filter((p) => p[1] > y + 1e-4)], opts);
    }
    return this.poly(pts, opts);
  }

  building(x, groundY, w, h, opts = {}) {
    const body = this.platform(x + w / 2, groundY + h / 2, w, h, 0, { style: 'brick', ...opts });
    // windows on front face
    const winMat = this.R.mat(0x9fc6e8, { metalness: 0.5, roughness: 0.15, emissive: 0x223344 });
    for (let wy = groundY + 1.5; wy < groundY + h - 1; wy += 2.5) {
      for (let wx = x + 1; wx < x + w - 1; wx += 2.2) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), winMat);
        win.position.set(wx + 0.6, wy, Z_FRONT + 0.01);
        this.R.add(win);
      }
    }
    // roof ledge
    const ledge = this.R.box(w + 0.4, 0.3, Z_FRONT - Z_BACK + 0.3, 0x555555);
    ledge.position.set(x + w / 2, groundY + h + 0.05, (Z_FRONT + Z_BACK) / 2);
    this.R.add(ledge);
    return body;
  }

  // ---------------------------------------------------------------- hazards
  spikes(x, y, w, angle = 0, opts = {}) {
    const body = this.staticBody(x, y, angle, { ground: true });
    const h = opts.height ?? 0.5;
    this.sfix(body, new planck.Box(w / 2, 0.12, V(0, 0.06), 0));
    const f = this.sfix(body, new planck.Box(w / 2 - 0.05, (h - 0.12) / 2, V(0, 0.18 + (h - 0.12) / 2), 0), { friction: 1.2 });
    f.setUserData({ hazard: 'spike' });
    this.extend(x - w / 2, y);
    this.extend(x + w / 2, y + h);
    const g = new THREE.Group();
    const base = this.R.box(w, 0.24, 1.6, 0x444444, { material: this.styleMat('hazard') });
    base.position.set(0, 0.06, 0);
    g.add(base);
    const n = Math.max(1, Math.round(w / 0.32));
    const coneGeo = new THREE.ConeGeometry(0.12, h, 6);
    const mat = this.R.mat(0xcfd3da, { metalness: 0.85, roughness: 0.25 });
    for (const z of [-0.5, 0, 0.5]) {
      for (let i = 0; i < n; i++) {
        const c = new THREE.Mesh(coneGeo, mat);
        c.position.set(-w / 2 + (i + 0.5) * (w / n) + (z === 0 ? 0.08 : 0), 0.18 + h / 2, z);
        c.castShadow = true;
        g.add(c);
      }
    }
    g.position.set(x, y, 0);
    g.rotation.z = angle;
    this.R.add(g);
    return body;
  }

  // Spikes on a ceiling / wall: convenience
  spikeRow(x1, y1, x2, y2, opts) {
    const w = Math.hypot(x2 - x1, y2 - y1);
    const a = Math.atan2(y2 - y1, x2 - x1);
    return this.spikes((x1 + x2) / 2, (y1 + y2) / 2, w, a, opts);
  }

  mine(x, y, angle = 0) {
    const body = this.staticBody(x, y, angle, { ground: true });
    const f = this.sfix(body, new planck.Box(0.32, 0.12, V(0, 0.1), 0));
    const obj = { body, alive: true, type: 'mine' };
    f.setUserData({ type: 'mine', obj });
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 8, 0, PI * 2, 0, PI / 2), this.R.mat(0x4a4f45, { metalness: 0.5, roughness: 0.5 }));
    dome.scale.y = 0.55;
    dome.castShadow = true;
    g.add(dome);
    const light = this.R.sphere(0.06, 0xff2222, { matOpts: { emissive: 0xff0000, emissiveIntensity: 2 } });
    light.position.y = 0.2;
    g.add(light);
    g.position.set(x, y, 0);
    g.rotation.z = angle;
    this.R.add(g);
    obj.visual = g;
    this.R.animate((dt, t) => {
      if (!obj.alive) return false;
      light.visible = Math.sin(t * 8 + x) > 0;
    });
    this.game.explosives.push(obj);
    obj.explode = () => {
      if (!obj.alive) return;
      obj.alive = false;
      const p = body.getPosition();
      this.R.remove(g);
      this.game.destroyBody(body);
      this.game.effects.explosion(p.x, p.y + 0.2, 5.5, 24);
      this.game.chainExplosions(p.x, p.y, 4);
    };
    return obj;
  }

  barrel(x, y) {
    const body = this.world.createBody({ type: 'dynamic', position: V(x, y + 0.5) });
    const obj = { body, alive: true, type: 'barrel' };
    const f = body.createFixture({ shape: new planck.Box(0.35, 0.5), density: 60, friction: 0.6, filterCategoryBits: CAT.DYNAMIC, filterMaskBits: MASK.ALL });
    f.setUserData({ type: 'barrel', obj });
    body.setUserData({ prop: true });
    const g = new THREE.Group();
    const cyl = this.R.cylinder(0.35, 0.35, 1.0, 0xc0392b, { seg: 16, matOpts: { metalness: 0.4, roughness: 0.5 } });
    g.add(cyl);
    for (const yy of [-0.3, 0.3]) {
      const ring = this.R.cylinder(0.37, 0.37, 0.06, 0x7b241c, { seg: 16 });
      ring.position.y = yy;
      g.add(ring);
    }
    const label = this.R.box(0.3, 0.3, 0.02, 0xf1c40f);
    label.position.set(0, 0, 0.36);
    label.rotation.z = PI / 4;
    g.add(label);
    this.R.add(g);
    this.R.bind(body, g);
    obj.visual = g;
    this.game.explosives.push(obj);
    obj.explode = () => {
      if (!obj.alive) return;
      obj.alive = false;
      const p = body.getPosition();
      this.R.unbind(body);
      this.game.destroyBody(body);
      this.game.effects.explosion(p.x, p.y, 6, 26);
      this.game.chainExplosions(p.x, p.y, 5);
    };
    return obj;
  }

  boost(x, y, angle = 0, power = 24, w = 3) {
    const body = this.staticBody(x, y, angle);
    const sensor = this.sfix(body, new planck.Box(w / 2, 0.8, V(0, 0.7), 0), { sensor: true, cat: CAT.SENSOR, mask: MASK.SENSOR });
    const obj = { body, angle, power, cooldown: new Map() };
    sensor.setUserData({ type: 'boost', obj });
    const tex = arrowTexture().clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w / 2, 1);
    tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffaa00, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.5 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 1.6), [this.R.mat(0x222222), this.R.mat(0x222222), mat, this.R.mat(0x222222), mat, this.R.mat(0x222222)]);
    m.receiveShadow = true;
    const g = new THREE.Group();
    m.position.y = -0.03;
    g.add(m);
    // top face uses UVs along x; rotate texture for the top: map is shared, scroll it
    g.position.set(x, y, 0);
    g.rotation.z = angle;
    this.R.add(g);
    this.R.animate((dt) => { tex.offset.x -= dt * 2.5; });
    this.extend(x - w / 2, y);
    this.extend(x + w / 2, y);
    return obj;
  }

  trampoline(x, y, w = 2.4, angle = 0, power = 16) {
    const body = this.staticBody(x, y, angle);
    this.sfix(body, new planck.Polygon([V(-w / 2 - 0.7, 0), V(w / 2 + 0.7, 0), V(w / 2, 0.3), V(-w / 2, 0.3)]));
    const pad = this.sfix(body, new planck.Box(w / 2 - 0.05, 0.08, V(0, 0.36), 0), { restitution: 0.4 });
    const obj = { body, angle, power, cooldown: new Map() };
    pad.setUserData({ type: 'trampoline', obj });
    const g = new THREE.Group();
    const base = this.R.extrudePoly([[-w / 2 - 0.7, 0], [w / 2 + 0.7, 0], [w / 2, 0.3], [-w / 2, 0.3]], 0x333333, 0.7, -0.7);
    g.add(base);
    const top = this.R.box(w - 0.1, 0.12, 1.3, 0x2ecc71, { matOpts: { emissive: 0x0a4020 } });
    top.position.y = 0.38;
    g.add(top);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 4, 10), this.R.mat(0xcccccc, { metalness: 0.8 }));
      s.position.set(-w / 2 + 0.3 + (i * (w - 0.6)) / 3, 0.3, 0.7);
      g.add(s);
    }
    g.position.set(x, y, 0);
    g.rotation.z = angle;
    this.R.add(g);
    obj.top = top;
    this.extend(x - w / 2, y);
    this.extend(x + w / 2, y);
    return obj;
  }

  conveyor(x, y, w, speed = 4, angle = 0) {
    const body = this.staticBody(x, y, angle);
    const f = this.sfix(body, new planck.Polygon([V(-w / 2 - 0.8, -0.2), V(w / 2 + 0.8, -0.2), V(w / 2, 0.2), V(-w / 2, 0.2)]), { friction: 1.2 });
    f.setUserData({ type: 'conveyor', speed });
    for (const sx of [-1, 1]) {
      const wedge = this.R.extrudePoly([[sx * w / 2, -0.2], [sx * (w / 2 + 0.8), -0.2], [sx * w / 2, 0.2]], 0x444444, 0.8, -0.8);
      wedge.position.set(x, y, 0);
      wedge.rotation.z = angle;
      this.R.add(wedge);
    }
    const g = new THREE.Group();
    const tex = hazardStripeTexture().clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w / 1.5, 1);
    tex.needsUpdate = true;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, 1.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    belt.receiveShadow = true;
    belt.castShadow = true;
    g.add(belt);
    for (const sx of [-w / 2, w / 2]) {
      const roller = this.R.cylinder(0.22, 0.22, 1.7, 0x555555, { matOpts: { metalness: 0.6 } });
      roller.rotation.x = PI / 2;
      roller.position.x = sx;
      g.add(roller);
    }
    g.position.set(x, y, 0);
    g.rotation.z = angle;
    this.R.add(g);
    this.R.animate((dt) => { tex.offset.x -= (dt * speed) / 1.5; });
    this.extend(x - w / 2, y);
    this.extend(x + w / 2, y);
  }

  wreckingBall(x, y, len = 6, r = 0.9, startAngle = 1.0) {
    const anchor = this.staticBody(x, y);
    this.sfix(anchor, new planck.Box(0.3, 0.3), { cat: CAT.STATIC });
    const bx = x + Math.sin(startAngle) * len, by = y - Math.cos(startAngle) * len;
    const ball = this.world.createBody({ type: 'dynamic', position: V(bx, by), linearDamping: 0, angularDamping: 0 });
    ball.createFixture({ shape: new planck.Circle(r), density: 380 / (PI * r * r) * (r / 0.9) ** 2, friction: 0.4, restitution: 0.2, filterCategoryBits: CAT.DYNAMIC, filterMaskBits: MASK.ALL });
    ball.setUserData({ prop: true, heavy: true });
    this.world.createJoint(new planck.DistanceJoint({ frequencyHz: 0, dampingRatio: 0 }, anchor, ball, V(x, y), V(bx, by)));
    const ag = this.R.box(0.7, 0.7, 0.9, 0x333333);
    ag.position.set(x, y, 0);
    this.R.add(ag);
    const beam = this.R.box(0.4, 0.4, 6, 0x555555);
    beam.position.set(x, y + 0.3, -2);
    this.R.add(beam);
    const bg = new THREE.Group();
    const sphere = this.R.sphere(r, 0x2b2b2e, { seg: 24, matOpts: { metalness: 0.7, roughness: 0.35 } });
    bg.add(sphere);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 6, 12), this.R.mat(0x666666, { metalness: 0.8 }));
    hook.position.y = r;
    bg.add(hook);
    this.R.add(bg);
    this.R.bind(ball, bg);
    // chain
    const links = [];
    const nLinks = Math.ceil(len / 0.35);
    const linkGeo = new THREE.TorusGeometry(0.12, 0.035, 5, 10);
    linkGeo.userData.shared = true;
    const linkMat = this.R.mat(0x777777, { metalness: 0.8, roughness: 0.35 });
    for (let i = 0; i < nLinks; i++) {
      const l = new THREE.Mesh(linkGeo, linkMat);
      l.castShadow = true;
      l.scale.set(1, 1.6, 1);
      this.R.add(l);
      links.push(l);
    }
    this.R.animate(() => {
      const p = ball.getPosition();
      const a = Math.atan2(p.y - y, p.x - x);
      for (let i = 0; i < nLinks; i++) {
        const t = (i + 0.5) / nLinks;
        links[i].position.set(x + (p.x - x) * t, y + (p.y - y) * t, 0);
        links[i].rotation.set(0, i % 2 ? PI / 2 : 0, a - PI / 2, 'ZYX');
      }
    });
    this.extend(x - len, y - len);
    this.extend(x + len, y);
    return ball;
  }

  saw(x, y, r = 1, opts = {}) {
    const body = this.world.createBody({ type: 'kinematic', position: V(x, y) });
    const f = body.createFixture({ shape: new planck.Circle(r), friction: 0.3, filterCategoryBits: CAT.STATIC, filterMaskBits: MASK.ALL });
    f.setUserData({ hazard: 'saw' });
    body.setUserData({ saw: true });
    body.setAngularVelocity(opts.spin ?? -18);
    const g = new THREE.Group();
    const disc = this.R.cylinder(r * 0.92, r * 0.92, 0.06, 0xd8dce2, { seg: 32, matOpts: { metalness: 0.9, roughness: 0.2 } });
    disc.rotation.x = PI / 2;
    g.add(disc);
    const teeth = Math.round(r * 22);
    const toothGeo = new THREE.ConeGeometry(0.07 * Math.min(1.4, r), 0.18 * Math.min(1.4, r), 3);
    const toothMat = this.R.mat(0xb8bcc4, { metalness: 0.9, roughness: 0.25 });
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * PI * 2;
      const t = new THREE.Mesh(toothGeo, toothMat);
      t.position.set(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, 0);
      t.rotation.z = a - PI / 2 - 0.4;
      g.add(t);
    }
    const hub = this.R.cylinder(r * 0.2, r * 0.2, 0.14, 0x333333);
    hub.rotation.x = PI / 2;
    g.add(hub);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, 0.02, 4, 24), this.R.mat(0x999999));
    g.add(ring);
    this.R.add(g);
    this.R.bind(body, g);
    if (opts.mount !== false) {
      const arm = this.R.box(0.18, 0.18, 2.4, 0x444444);
      arm.position.set(x, y, -1.3);
      this.R.add(arm);
      if (opts.path) arm.visible = false;
    }
    if (opts.path) {
      const [x2, y2] = opts.path;
      const period = opts.period ?? 3;
      const rail = this.R.box(Math.hypot(x2 - x, y2 - y) + 0.4, 0.15, 0.15, 0x333333);
      rail.position.set((x + x2) / 2, (y + y2) / 2, -0.4);
      rail.rotation.z = Math.atan2(y2 - y, x2 - x);
      this.R.add(rail);
      let t = rand(0, period);
      this.game.addUpdater((dt) => {
        t += dt;
        const w = (2 * PI) / period;
        const k = 0.5 * Math.sin(w * t) * w;
        body.setLinearVelocity(V((x2 - x) * k, (y2 - y) * k));
      });
    }
    this.extend(x - r, y - r);
    this.extend(x + r, y + r);
    return body;
  }

  harpoon(x, y, opts = {}) {
    const base = this.staticBody(x, y, 0, { ground: true });
    this.sfix(base, new planck.Box(0.45, 0.35, V(0, 0.35), 0));
    const range = opts.range ?? 22;
    const obj = { x, y: y + 0.85, angle: opts.angle ?? PI, cooldown: rand(0.5, 1.5), range, rate: opts.rate ?? 2.4 };
    const g = new THREE.Group();
    const housing = this.R.box(0.9, 0.7, 1.0, 0x3d4b5c);
    housing.position.y = 0.35;
    g.add(housing);
    const turret = new THREE.Group();
    turret.position.y = 0.85;
    const ball = this.R.sphere(0.32, 0x55677a, { matOpts: { metalness: 0.6, roughness: 0.4 } });
    turret.add(ball);
    const barrel = this.R.cylinder(0.1, 0.12, 1.1, 0x2a2f36, { matOpts: { metalness: 0.6 } });
    barrel.rotation.z = -PI / 2;
    barrel.position.x = 0.55;
    turret.add(barrel);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 6), this.R.mat(0xd0d0d0, { metalness: 0.9 }));
    tip.rotation.z = -PI / 2;
    tip.position.x = 1.15;
    turret.add(tip);
    obj.tipMesh = tip;
    g.add(turret);
    const eye = this.R.sphere(0.06, 0xff3333, { matOpts: { emissive: 0xff0000, emissiveIntensity: 2 } });
    eye.position.set(0, 0.85, 0.3);
    g.add(eye);
    g.position.set(x, y, 0);
    this.R.add(g);
    turret.rotation.z = obj.angle;
    this.game.addUpdater((dt) => {
      const pl = this.game.player;
      if (!pl) return;
      const tgt = pl.focus.getPosition();
      const dx = tgt.x - obj.x, dy = tgt.y - obj.y;
      const dist = Math.hypot(dx, dy);
      obj.cooldown -= dt;
      if (dist > range) return;
      // line of sight
      let blocked = false;
      this.world.rayCast(V(obj.x, obj.y), V(tgt.x, tgt.y), (f, pt) => {
        if (f.isSensor() || !f.getBody().isStatic()) return -1;
        if (f.getBody() === base) return -1;
        // ignore the turret's own mount
        if (Math.hypot(pt.x - obj.x, pt.y - obj.y) < 1.8) return -1;
        blocked = true;
        return 0;
      });
      if (blocked) return;
      // lead the target a bit
      const v = pl.focus.getLinearVelocity();
      const tLead = dist / 38;
      const want = Math.atan2(dy + v.y * tLead + 0.5 * 4 * tLead * tLead, dx + v.x * tLead);
      let diff = want - obj.angle;
      while (diff > PI) diff -= 2 * PI;
      while (diff < -PI) diff += 2 * PI;
      obj.angle += clamp(diff, -dt * 3, dt * 3);
      turret.rotation.z = obj.angle;
      eye.visible = Math.sin(this.game.time * 20) > 0;
      if (obj.cooldown <= 0 && Math.abs(diff) < 0.12) {
        obj.cooldown = obj.rate;
        this.fireHarpoon(obj);
      }
    });
    this.extend(x, y);
    return obj;
  }

  fireHarpoon(obj) {
    const a = obj.angle;
    const sx = obj.x + Math.cos(a) * 1.3, sy = obj.y + Math.sin(a) * 1.3;
    const body = this.world.createBody({ type: 'dynamic', position: V(sx, sy), angle: a, bullet: true, gravityScale: 0.25 });
    const f = body.createFixture({ shape: new planck.Box(0.5, 0.04), density: 400, friction: 0.5, filterCategoryBits: CAT.PROJECTILE, filterMaskBits: CAT.DYNAMIC | CAT.CHAR | CAT.VEHICLE });
    // clear the turret's mount before it can stick into scenery
    this.game.after(0.12, () => { if (!this.game.destroyed.has(body)) f.setFilterData({ groupIndex: 0, categoryBits: CAT.PROJECTILE, maskBits: CAT.STATIC | CAT.DYNAMIC | CAT.CHAR | CAT.VEHICLE }); });
    const h = { body, stuck: false, life: 10 };
    f.setUserData({ type: 'harpoon', obj: h });
    body.setUserData({ harpoon: h });
    body.setLinearVelocity(V(Math.cos(a) * 38, Math.sin(a) * 38));
    const g = new THREE.Group();
    const shaft = this.R.cylinder(0.035, 0.035, 1.0, 0x6b4a2a);
    shaft.rotation.z = PI / 2;
    g.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 6), this.R.mat(0xd0d0d0, { metalness: 0.9, roughness: 0.2 }));
    tip.rotation.z = -PI / 2;
    tip.position.x = 0.6;
    tip.castShadow = true;
    g.add(tip);
    for (const s of [-1, 1]) {
      const fin = this.R.box(0.18, 0.02, 0.12, 0xaa2222);
      fin.position.set(-0.45, s * 0.05, 0);
      g.add(fin);
    }
    this.R.add(g);
    this.R.bind(body, g);
    this.game.audio.play('harpoon', 1);
    this.game.effects.puff(sx, sy, Math.cos(a) * 2, Math.sin(a) * 2, 0xcccccc, 0.6, 0.15);
    this.game.harpoons.push(h);
  }

  fan(x, y, angle = PI / 2, w = 3, range = 12, strength = 26) {
    const body = this.staticBody(x, y, angle - PI / 2, { ground: true });
    this.sfix(body, new planck.Box(w / 2, 0.25, V(0, 0.25), 0));
    const dir = [Math.cos(angle), Math.sin(angle)];
    const perp = [-dir[1], dir[0]];
    const ox = x + dir[0] * 0.5, oy = y + dir[1] * 0.5;
    const g = new THREE.Group();
    const housing = this.R.box(w + 0.2, 0.5, 1.8, 0x5a6270, { matOpts: { metalness: 0.5 } });
    housing.position.y = 0.25;
    g.add(housing);
    const blades = new THREE.Group();
    blades.position.y = 0.55;
    for (let i = 0; i < 4; i++) {
      const b = this.R.box(w * 0.9, 0.04, 0.35, 0xb0b8c4, { matOpts: { metalness: 0.7 } });
      b.rotation.x = (i / 4) * PI;
      blades.add(b);
    }
    g.add(blades);
    const grill = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 1.6), new THREE.MeshStandardMaterial({ color: 0x333333, alphaMap: null, wireframe: true }));
    grill.position.y = 0.6;
    g.add(grill);
    g.position.set(x, y, 0);
    g.rotation.z = angle - PI / 2;
    this.R.add(g);
    this.R.animate((dt) => { blades.rotation.x += dt * 25; });
    let acc = 0;
    this.game.addUpdater((dt) => {
      for (let b = this.world.getBodyList(); b; b = b.getNext()) {
        if (!b.isDynamic()) continue;
        const p = b.getWorldCenter();
        const rx = p.x - ox, ry = p.y - oy;
        const along = rx * dir[0] + ry * dir[1];
        if (along < 0 || along > range) continue;
        const lat = rx * perp[0] + ry * perp[1];
        if (Math.abs(lat) > w / 2 + 0.3) continue;
        const m = b.getMass();
        const k = strength * (1 - (along / range) * 0.7);
        b.applyForceToCenter(V(dir[0] * k * m, dir[1] * k * m), true);
      }
    });
    this.game.addFrameUpdater((dt) => {
      acc += dt * 30;
      while (acc > 1) {
        acc--;
        const l = rand(-w / 2, w / 2);
        const s = rand(0.3, 1) * range * 0.4;
        this.game.effects.spark(ox + perp[0] * l, oy + perp[1] * l, dir[0] * 14, dir[1] * 14, 0x9fb8d0, range / 14 * rand(0.5, 1), 0.03, { drag: 0, z: rand(-0.8, 0.8) });
      }
    });
    this.extend(x - w, y);
    this.extend(x + w, y);
  }

  glass(x, y, w, h, angle = 0, opts = {}) {
    const body = this.staticBody(x, y, angle, { ground: true });
    const obj = { body, alive: true, w, h, threshold: opts.threshold ?? 5 };
    const f = this.sfix(body, new planck.Box(w / 2, h / 2), { friction: 0.2 });
    f.setUserData({ type: 'glass', obj });
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1, clearcoat: 1 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.4), mat);
    m.position.set(x, y, -0.4);
    m.rotation.z = angle;
    this.R.add(m);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    m.add(edge);
    obj.mesh = m;
    obj.shatter = (vx, vy) => {
      if (!obj.alive) return;
      obj.alive = false;
      this.R.remove(m);
      this.game.destroyBody(body);
      this.game.effects.shards(x, y, Math.max(w, 0.3), Math.max(h, 0.3), vx * 0.6, vy * 0.6, 0xaee4ff, Math.round(clamp(w * h * 6, 8, 26)));
      this.game.audio.play('glass', 1);
    };
    this.extend(x - w / 2, y - h / 2);
    return obj;
  }

  crate(x, y, size = 1, opts = {}) {
    const body = this.world.createBody({ type: 'dynamic', position: V(x, y + size / 2), angle: opts.angle || 0 });
    body.createFixture({ shape: new planck.Box(size / 2, size / 2), density: opts.density ?? 9, friction: 0.7, restitution: 0.05, filterCategoryBits: CAT.DYNAMIC, filterMaskBits: MASK.ALL });
    body.setUserData({ prop: true });
    const m = this.R.box(size, size, size, 0xffffff, { material: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.8 }) });
    const g = new THREE.Group();
    g.add(m);
    this.R.add(g);
    this.R.bind(body, g);
    return body;
  }

  // dynamic plank / domino
  plank(x, y, w, h, opts = {}) {
    const body = this.world.createBody({ type: 'dynamic', position: V(x, y + h / 2), angle: opts.angle || 0 });
    body.createFixture({ shape: new planck.Box(w / 2, h / 2), density: opts.density ?? 30, friction: 0.7, filterCategoryBits: CAT.DYNAMIC, filterMaskBits: MASK.ALL });
    body.setUserData({ prop: true });
    const mat = opts.color ? this.R.mat(opts.color) : new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.8 });
    const m = this.R.box(w, h, opts.depth ?? 1.2, 0xffffff, { material: mat });
    const g = new THREE.Group();
    g.add(m);
    this.R.add(g);
    this.R.bind(body, g);
    return body;
  }

  ball(x, y, r = 0.8, opts = {}) {
    const body = this.world.createBody({ type: opts.delay ? 'static' : 'dynamic', position: V(x, y), angularDamping: 0.1 });
    if (opts.delay) this.game.after(opts.delay, () => { body.setDynamic(); body.setAwake(true); if (opts.push) body.setLinearVelocity(V(opts.push, 0)); });
    const f = body.createFixture({ shape: new planck.Circle(r), density: opts.density ?? 60, friction: 0.6, restitution: opts.restitution ?? 0.2, filterCategoryBits: CAT.DYNAMIC, filterMaskBits: MASK.ALL });
    body.setUserData({ prop: true, heavy: true });
    const g = new THREE.Group();
    if (opts.spiked) {
      f.setUserData({ hazard: 'spike' });
      g.add(this.R.sphere(r * 0.8, 0x3a3a3e, { matOpts: { metalness: 0.6, roughness: 0.4 } }));
      const coneGeo = new THREE.ConeGeometry(r * 0.16, r * 0.5, 6);
      const mat = this.R.mat(0xc8ccd2, { metalness: 0.9, roughness: 0.25 });
      const dirs = new THREE.IcosahedronGeometry(1, 1).attributes.position;
      const seen = new Set();
      for (let i = 0; i < dirs.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(dirs, i).normalize();
        const k = v.toArray().map((n) => n.toFixed(2)).join();
        if (seen.has(k)) continue;
        seen.add(k);
        const c = new THREE.Mesh(coneGeo, mat);
        c.position.copy(v.clone().multiplyScalar(r * 0.95));
        c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
        g.add(c);
      }
    } else {
      const tex = noiseTexture();
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshStandardMaterial({ color: opts.color ?? 0x8a8278, map: tex, flatShading: true, roughness: 0.95 }));
      s.castShadow = true;
      g.add(s);
    }
    this.R.add(g);
    this.R.bind(body, g);
    return body;
  }

  bridge(x1, y1, x2, y2, opts = {}) {
    const n = opts.planks ?? Math.max(4, Math.round(Math.hypot(x2 - x1, y2 - y1) / 0.9));
    const a = this.staticBody(x1, y1);
    const b = this.staticBody(x2, y2);
    let prev = a;
    const len = Math.hypot(x2 - x1, y2 - y1) / n;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const ropeMat = this.R.mat(0x8b6b3d);
    const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.8 });
    const joints = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
      const p = this.world.createBody({ type: 'dynamic', position: V(px, py), angle: ang, angularDamping: 0.3, linearDamping: 0.1 });
      p.createFixture({ shape: new planck.Box(len / 2, 0.08), density: opts.density ?? 110, friction: 0.9, filterCategoryBits: CAT.DYNAMIC, filterMaskBits: MASK.ALL });
      p.setUserData({ prop: true });
      const m = this.R.box(len * 0.96, 0.16, 1.8, 0xffffff, { material: woodMat });
      const g = new THREE.Group();
      g.add(m);
      for (const z of [-0.85, 0.85]) {
        const rope = this.R.box(len, 0.04, 0.04, 0x8b6b3d, { material: ropeMat });
        rope.position.set(0, 0.1, z);
        g.add(rope);
      }
      this.R.add(g);
      this.R.bind(p, g);
      const ax = x1 + (x2 - x1) * (i / n), ay = y1 + (y2 - y1) * (i / n);
      const j = this.world.createJoint(new planck.RevoluteJoint({}, prev, p, V(ax, ay)));
      j.brk = opts.strength ?? 0;
      joints.push(j);
      prev = p;
    }
    const j = this.world.createJoint(new planck.RevoluteJoint({}, prev, b, V(x2, y2)));
    j.brk = opts.strength ?? 0;
    joints.push(j);
    if (opts.strength) this.game.breakables.push(...joints);
    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      for (const z of [-0.9, 0.9]) {
        const post = this.R.cylinder(0.08, 0.1, 1.6, 0x6b4a2a);
        post.position.set(px, py + 0.6, z);
        this.R.add(post);
      }
    }
  }

  seesaw(x, y, w = 6, opts = {}) {
    const pivot = this.staticBody(x, y);
    this.sfix(pivot, new planck.Polygon([V(-0.6, -1.2), V(0.6, -1.2), V(0, 0)]));
    const plank = this.world.createBody({ type: 'dynamic', position: V(x, y + 0.15), angle: opts.angle ?? 0 });
    plank.createFixture({ shape: new planck.Box(w / 2, 0.12), density: opts.density ?? 40, friction: 0.9, filterCategoryBits: CAT.DYNAMIC, filterMaskBits: MASK.ALL });
    plank.setUserData({ prop: true });
    this.world.createJoint(new planck.RevoluteJoint({ enableLimit: true, lowerAngle: -0.45, upperAngle: 0.45 }, pivot, plank, V(x, y + 0.15)));
    const tri = this.R.extrudePoly([[-0.6, -1.2], [0.6, -1.2], [0, 0]], 0x666666, 0.8, -0.8);
    tri.position.set(x, y, 0);
    this.R.add(tri);
    const g = new THREE.Group();
    g.add(this.R.box(w, 0.24, 1.8, 0xffffff, { material: this.styleMat('hazard') }));
    this.R.add(g);
    this.R.bind(plank, g);
    return plank;
  }

  movingPlatform(x, y, w, h, dx, dy, period = 4, opts = {}) {
    const body = this.world.createBody({ type: 'kinematic', position: V(x, y) });
    body.createFixture({ shape: new planck.Box(w / 2, h / 2), friction: 1, filterCategoryBits: CAT.STATIC, filterMaskBits: MASK.ALL });
    body.setUserData({ ground: true });
    const g = new THREE.Group();
    g.add(this.R.box(w, h, 2.4, 0xffffff, { material: this.styleMat(opts.style || 'hazard') }));
    this.R.add(g);
    this.R.bind(body, g);
    let t = opts.phase ?? 0;
    this.game.addUpdater((dt) => {
      t += dt;
      const w2 = (2 * PI) / period;
      const k = 0.5 * Math.sin(w2 * t) * w2;
      body.setLinearVelocity(V(dx * k, dy * k));
    });
    this.extend(x, y);
    this.extend(x + dx, y + dy);
    return body;
  }

  // Loop-the-loop. Bottom of the loop sits at (cx, cy - r).
  loop(cx, cy, r = 6, opts = {}) {
    const body = this.staticBody(0, 0, 0, { ground: true });
    const n = 160;
    const arc = (a0, a1) => {
      const pts = [];
      for (let i = 0; i <= n / 2; i++) {
        const a = a0 + ((a1 - a0) * i) / (n / 2);
        pts.push(V(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
      }
      return pts;
    };
    const loopObj = { cx, cy, r, state: new Map() };
    const fa = this.sfix(body, new planck.Chain(arc(-PI / 2, PI / 2 + 0.05), false), { friction: 1 });
    fa.setUserData({ type: 'loopA', loop: loopObj });
    const fb = this.sfix(body, new planck.Chain(arc(PI / 2 - 0.05, PI * 1.5), false), { friction: 1 });
    fb.setUserData({ type: 'loopB', loop: loopObj });
    this.game.loops.push(loopObj);
    // visual: ring track, slightly spiralling in depth
    const segs = 64;
    const mat = this.styleMat('metal');
    const railMat = this.R.mat(0xffcc00, { metalness: 0.5, roughness: 0.4 });
    for (let i = 0; i < segs; i++) {
      const a0 = -PI / 2 + (i / segs) * PI * 2;
      const a1 = -PI / 2 + ((i + 1) / segs) * PI * 2;
      const am = (a0 + a1) / 2;
      const chord = 2 * r * Math.sin(PI / segs) + 0.04;
      const seg = this.R.box(chord, 0.35, 2.0, 0xffffff, { material: mat });
      const rr = r + 0.175;
      seg.position.set(cx + Math.cos(am) * rr, cy + Math.sin(am) * rr, -0.2 - (i / segs) * 0.0);
      seg.rotation.z = am + PI / 2;
      this.R.add(seg);
      if (i % 2 === 0) {
        for (const z of [-1.0, 0.8]) {
          const rail = this.R.box(chord * 2, 0.12, 0.1, 0xffcc00, { material: railMat });
          rail.position.set(cx + Math.cos(am + PI / segs) * (r - 0.02), cy + Math.sin(am + PI / segs) * (r - 0.02), z);
          rail.rotation.z = am + PI / segs + PI / 2;
          this.R.add(rail);
        }
      }
    }
    // support pillar
    const pillar = this.R.box(0.8, r * 0.9, 0.8, 0x555555);
    pillar.position.set(cx, cy - r * 0.55, -2.4);
    this.R.add(pillar);
    this.extend(cx - r, cy - r);
    this.extend(cx + r, cy + r);
    return loopObj;
  }

  npc(x, y, opts = {}) {
    const look = { ...NPC_LOOKS[Math.floor(Math.random() * NPC_LOOKS.length)], ...(opts.look || {}) };
    look.skin = look.skin ?? [0xf2c49b, 0xc68c62, 0x8d5524, 0xe0ac69, 0xf6d2b0][Math.floor(Math.random() * 5)];
    const rd = new Ragdoll(this.game, {
      x, y: y + 0.93 * (opts.scale || 1), pose: POSES.stand, look, group: npcGroup--, kind: 'npc', scale: opts.scale || 1,
    });
    this.game.ragdolls.push(rd);
    return rd;
  }

  token(x, y) {
    const body = this.staticBody(x, y);
    const f = this.sfix(body, new planck.Circle(1.0), { sensor: true, cat: CAT.SENSOR, mask: MASK.SENSOR });
    f.setUserData({ type: 'token' });
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = PI / 2 + (i / 10) * PI * 2;
      const rr = i % 2 ? 0.38 : 0.85;
      if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 });
    geo.center();
    const star = new THREE.Mesh(geo, this.R.mat(0xffd23a, { metalness: 0.7, roughness: 0.25, emissive: 0x6a4a00, emissiveIntensity: 0.8 }));
    star.castShadow = true;
    g.add(star);
    const halo = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.25, 40), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    g.add(halo);
    const light = new THREE.PointLight(0xffd040, 25, 8, 2);
    g.add(light);
    g.position.set(x, y, 0);
    this.R.add(g);
    // goal pole + banner behind
    const pole = this.R.cylinder(0.08, 0.08, 6, 0xdddddd);
    pole.position.set(x + 1.5, y + 1, -1.2);
    this.R.add(pole);
    const banner = this.R.label('FINISH', 2.6, 1.0, { bg: '#111', color: '#ffd23a', border: '#ffd23a', w: 512, h: 200, size: 120 });
    banner.position.set(x + 1.5 + 1.35, y + 3.4, -1.2);
    this.R.add(banner);
    this.R.animate((dt, t) => {
      star.rotation.y = t * 2.2;
      g.position.y = y + Math.sin(t * 2.5) * 0.15;
      halo.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
    });
    this.extend(x + 4, y);
    this.game.tokenPos = [x, y];
  }

  checkpoint(x, y) {
    const body = this.staticBody(x, y);
    const obj = { x, y, active: false };
    const f = this.sfix(body, new planck.Box(0.6, 3, V(0, 2), 0), { sensor: true, cat: CAT.SENSOR, mask: MASK.SENSOR });
    f.setUserData({ type: 'checkpoint', obj });
    const g = new THREE.Group();
    const pole = this.R.cylinder(0.06, 0.06, 3.2, 0xeeeeee);
    pole.position.y = 1.6;
    g.add(pole);
    const flag = this.R.box(1.0, 0.6, 0.04, 0xe74c3c);
    flag.position.set(0.5, 2.8, 0);
    g.add(flag);
    g.position.set(x, y, -0.9);
    this.R.add(g);
    obj.flag = flag;
    obj.activate = () => {
      if (obj.active) return false;
      obj.active = true;
      flag.material = this.R.mat(0x2ecc71, { emissive: 0x0a4020 });
      return true;
    };
    this.R.animate((dt, t) => { flag.rotation.y = Math.sin(t * 3 + x) * 0.25; });
    this.game.checkpoints.push(obj);
    return obj;
  }

  sign(x, y, text, opts = {}) {
    const w = opts.w ?? 3.2, h = opts.h ?? 1.6;
    const g = new THREE.Group();
    const board = this.R.label(text, w, h, { size: opts.size ?? 70, ...opts });
    board.position.y = h / 2 + 1.2;
    g.add(board);
    for (const sx of [-w / 2 + 0.3, w / 2 - 0.3]) {
      const post = this.R.cylinder(0.07, 0.07, 1.4 + h, 0x6b4a2a);
      post.position.set(sx, (1.4 + h) / 2 - 0.1, -0.05);
      g.add(post);
    }
    g.position.set(x, y, opts.z ?? -1.8);
    g.rotation.y = opts.ry ?? 0.12;
    this.R.add(g);
  }

  // Decorative prop at depth (doesn't collide)
  decor(kind, x, y, z = -2, s = 1) {
    let o;
    if (kind === 'tree') o = this.R.tree(false, s, 0x3f8f3a, 0x5a3b22);
    else if (kind === 'pine') o = this.R.tree(true, s, 0x2f5b45, 0x5a3b22);
    else if (kind === 'cactus') o = this.R.cactus(s, 0x4f8a3c);
    else if (kind === 'skull') {
      o = new THREE.Group();
      const sk = this.R.sphere(0.25 * s, 0xeeeedd);
      o.add(sk);
    } else if (kind === 'lamp') {
      o = new THREE.Group();
      const p = this.R.cylinder(0.06, 0.08, 4 * s, 0x333333);
      p.position.y = 2 * s;
      o.add(p);
      const l = this.R.sphere(0.2, 0xfff2c0, { matOpts: { emissive: 0xffe090, emissiveIntensity: 2 } });
      l.position.set(0.3, 4 * s, 0);
      o.add(l);
    }
    if (o) {
      o.position.set(x, y, z);
      this.R.add(o);
    }
    return o;
  }

  groundAt(x) {
    const s = this.groundSamples;
    if (!s.length) return 0;
    let best = s[0][1], bd = Infinity;
    for (const [px, py] of s) {
      const d = Math.abs(px - x);
      if (d < bd) { bd = d; best = py; }
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// Terrain helpers for level authoring
// ---------------------------------------------------------------------------
export function hills(x0, x1, y, amp, wavelength, step = 1, phase = 0) {
  const pts = [];
  for (let x = x0; x <= x1 + 1e-6; x += step) {
    const t = ((x - x0) / wavelength) * PI * 2 + phase;
    pts.push([x, y + Math.sin(t) * amp * Math.min(1, (x - x0) / 6, (x1 - x) / 6 + 0.0001)]);
  }
  return pts;
}

export function curve(x0, y0, x1, y1, n = 12, ease = 'inout') {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let e = t;
    if (ease === 'inout') e = t * t * (3 - 2 * t);
    else if (ease === 'in') e = t * t;
    else if (ease === 'out') e = 1 - (1 - t) * (1 - t);
    pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * e]);
  }
  return pts;
}

// Concatenate point lists, removing duplicated joints
export function path(...parts) {
  const out = [];
  for (const p of parts) {
    for (const pt of p) {
      const last = out[out.length - 1];
      if (last && Math.abs(last[0] - pt[0]) < 1e-6 && Math.abs(last[1] - pt[1]) < 1e-6) continue;
      out.push(pt);
    }
  }
  return out;
}

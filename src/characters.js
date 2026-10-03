import * as THREE from 'three';
import { planck, V, CAT, MASK, clamp, rand, wrapAngle } from './physics.js';
import { Ragdoll, POSES } from './ragdoll.js';

const PI = Math.PI;

// ---------------------------------------------------------------------------
// Vehicle construction helpers
// ---------------------------------------------------------------------------
function vBody(ch, x, y, angle = 0, opts = {}) {
  const b = ch.game.world.createBody({
    type: 'dynamic', position: V(x, y), angle,
    angularDamping: opts.angularDamping ?? 0.05, linearDamping: 0, bullet: !!opts.bullet,
  });
  b.setUserData({ entity: ch, vehicle: true });
  ch.bodies.push(b);
  return b;
}

function fx(ch, body, shape, density, opts = {}) {
  return body.createFixture({
    shape, density, friction: opts.friction ?? 0.6, restitution: opts.restitution ?? 0.1,
    filterCategoryBits: opts.cat ?? CAT.VEHICLE, filterMaskBits: opts.mask ?? MASK.ALL, filterGroupIndex: ch.group,
  });
}

const box = (hw, hh, cx = 0, cy = 0, a = 0) => new planck.Box(hw, hh, V(cx, cy), a);

// box spanning from p1 to p2 with half thickness t
function segBox(p1, p2, t) {
  const cx = (p1[0] + p2[0]) / 2, cy = (p1[1] + p2[1]) / 2;
  const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  return new planck.Box(len / 2, t, V(cx, cy), Math.atan2(p2[1] - p1[1], p2[0] - p1[0]));
}

function makeWheel(ch, x, y, r, mass, opts = {}) {
  const b = vBody(ch, x, y, 0, { angularDamping: 0.02 });
  fx(ch, b, new planck.Circle(r), mass / (PI * r * r), { friction: opts.friction ?? 1.4, restitution: 0.12 });
  const g = new THREE.Group();
  const R = ch.game.renderer;
  const zs = opts.zs || [0];
  for (const z of zs) {
    const w = R.wheel(r, opts.width || 0.12, opts);
    w.position.z = z;
    g.add(w);
  }
  ch.addVisual(b, g);
  b.getUserData().wheel = true;
  b.radius = r;
  return b;
}

// Visual helpers (in body-local coordinates)
function vBox(R, g, hw, hh, cx, cy, a, color, depth = 0.1, z = 0, opts = {}) {
  const m = R.box(hw * 2, hh * 2, depth, color, opts);
  m.position.set(cx, cy, z);
  m.rotation.z = a;
  g.add(m);
  return m;
}

function vTube(R, g, p1, p2, r, color, z = 0, opts = {}) {
  const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const m = R.cylinder(r, r, len, color, { seg: 8, ...opts });
  m.position.set((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, z);
  m.rotation.z = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) - PI / 2;
  g.add(m);
  return m;
}

function vZBar(R, g, x, y, r, depth, color) {
  const m = R.cylinder(r, r, depth, color, { seg: 8 });
  m.rotation.x = PI / 2;
  m.position.set(x, y, 0);
  g.add(m);
  return m;
}

function flameMesh(R, len = 0.5, r = 0.12) {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(r, len, 10), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85 }));
  outer.rotation.z = PI / 2;
  outer.position.x = -len / 2;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, len * 0.6, 10), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
  inner.rotation.z = PI / 2;
  inner.position.x = -len * 0.3;
  g.add(outer, inner);
  g.visible = false;
  return g;
}

function chromeOpts() { return { matOpts: { metalness: 0.8, roughness: 0.25 } }; }

let gridTex = null;
function gridTexture() {
  if (gridTex) return gridTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#fff';
  g.lineWidth = 4;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
  }
  gridTex = new THREE.CanvasTexture(c);
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.repeat.set(4, 4);
  return gridTex;
}

// ---------------------------------------------------------------------------
// Character definitions
// ---------------------------------------------------------------------------
export const CHARACTERS = [
  {
    id: 'wheelchair',
    name: 'Wendell',
    vehicle: 'Rocket Wheelchair',
    blurb: 'A retired stuntman with a rocket-boosted wheelchair and nothing left to lose.',
    stats: { speed: 3, control: 4, toughness: 2 },
    primary: 'Rocket boost', secondary: 'Lift jets',
    look: { skin: 0xe9bf9c, shirt: 0x7a9a5a, pants: 0x6b5a48, shoes: 0x3a2a1a, hair: 0xd8d8d8, hairStyle: 'bald', glasses: true, beard: true, beardColor: 0xe6e6e6, voice: 0.85, sleeves: 'long' },
    build: buildWheelchair,
  },
  {
    id: 'gyro',
    name: 'Gary',
    vehicle: 'Gyro Board',
    blurb: 'Business casual, business fatal. Self-balancing board with a hydraulic jump.',
    stats: { speed: 3, control: 5, toughness: 2 },
    primary: 'Jump', secondary: 'Brake',
    look: { skin: 0xf0c8a0, shirt: 0xffffff, vest: 0x2b3a55, pants: 0x2b3a55, shoes: 0x1a1a1a, hair: 0x2a1a10, hairStyle: 'short', voice: 1.0, sleeves: 'long' },
    build: buildGyro,
  },
  {
    id: 'bike',
    name: 'Reckless Dad',
    vehicle: 'Bicycle + Junior',
    blurb: 'Takes his kid everywhere. Everywhere. Junior rides in the back seat.',
    stats: { speed: 4, control: 3, toughness: 3 },
    primary: 'Brake', secondary: 'Bell',
    look: { skin: 0xf2c49b, shirt: 0xd94a3a, pants: 0x34495e, shoes: 0xeeeeee, hair: 0x6b3f1f, hairStyle: 'helmet', hat: 0x2d7dd2, voice: 0.9 },
    kidLook: { skin: 0xf6d2b0, shirt: 0xf4c542, pants: 0x3d6db5, shoes: 0xd23a2a, hair: 0xa0522d, hairStyle: 'cap', hat: 0x2fae5a, voice: 1.0, shorts: true },
    build: buildBike,
  },
  {
    id: 'cart',
    name: 'Bargain Betty',
    vehicle: 'Motorized Cart',
    blurb: 'Nothing stands between Betty and a clearance sale. Hops curbs on command.',
    stats: { speed: 2, control: 4, toughness: 3 },
    primary: 'Jump', secondary: 'Brake',
    look: { skin: 0xf3cfb0, shirt: 0xe46aa8, pants: 0x5b4a8a, shoes: 0xffffff, hair: 0xb8b8c8, hairStyle: 'bun', voice: 1.3, belly: true },
    build: buildCart,
  },
  {
    id: 'moped',
    name: 'Scooter Sal',
    vehicle: 'Turbo Moped',
    blurb: 'Fastest wheels in town. Turbo burns rubber, and occasionally Sal.',
    stats: { speed: 5, control: 3, toughness: 4 },
    primary: 'Turbo', secondary: 'Brake',
    look: { skin: 0xc68c62, shirt: 0x222222, pants: 0x3a4a6a, shoes: 0x222222, hair: 0x111111, hairStyle: 'helmet', hat: 0xf2f2f2, voice: 1.1, sleeves: 'long', gloves: 0x111111 },
    build: buildMoped,
  },
];

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}

// ---------------------------------------------------------------------------
// The player entity: vehicle + rider (+ passengers)
// ---------------------------------------------------------------------------
export class PlayerCharacter {
  constructor(game, def, x, y) {
    this.game = game;
    this.def = def;
    this.group = -1;
    this.bodies = [];
    this.motors = [];
    this.grips = {};
    this.passengers = [];
    this.ejected = false;
    this.ejectTime = 0;
    this.abilityTimer = 0;
    this.lean = 0;
    this.fx = {};
    const spec = def.build(this, x, y);
    Object.assign(this, spec.props || {});
    this.chassis = spec.chassis;
    this.controlGrips = spec.controlGrips;
    this.rider = new Ragdoll(game, {
      x: spec.hip[0], y: spec.hip[1], pose: spec.pose, look: def.look,
      group: this.group, entity: this, isPlayer: true, kind: 'rider',
    });
    for (const gdef of spec.grips) this.addGrip(this.rider, gdef);
    if (spec.after) spec.after(this);
  }

  addVisual(body, group) {
    this.game.renderer.add(group);
    this.game.renderer.bind(body, group);
  }

  addGrip(ragdoll, { name, part, body, at, brk, motor = 0 }) {
    const pt = ragdoll.posePoints[at];
    const partBody = ragdoll.bodies[part];
    const j = this.game.world.createJoint(new planck.RevoluteJoint({
      enableMotor: motor > 0, maxMotorTorque: motor, motorSpeed: 0,
    }, body, partBody, V(pt[0], pt[1])));
    this.grips[name] = { joint: j, brk, strain: 0, target: j.getJointAngle(), motor, ragdoll };
  }

  get alive() { return this.rider.alive; }

  get attached() {
    return !this.ejected && this.controlGrips.some((n) => this.grips[n]);
  }

  get focus() {
    return this.rider.bodies.torso;
  }

  allBodies() {
    const list = this.bodies.filter((b) => !this.game.destroyed.has(b));
    list.push(...this.rider.allBodies());
    for (const p of this.passengers) list.push(...p.allBodies());
    return list;
  }

  totalMass() {
    let m = 0;
    for (const b of this.allBodies()) m += b.getMass();
    return m;
  }

  releaseGrip(name, quiet = false) {
    const g = this.grips[name];
    if (!g) return;
    this.game.destroyJoint(g.joint);
    delete this.grips[name];
    if (!quiet) this.game.audio.play('clank', 0.5);
    if (g.ragdoll === this.rider && !this.ejected && !this.controlGrips.some((n) => this.grips[n])) {
      this.onDetached();
    }
  }

  onDetached() {
    if (this.ejected) return;
    this.ejected = true;
    this.ejectTime = this.game.time;
    for (const m of this.motors) {
      m.enableMotor(false);
    }
    this.game.onPlayerDetached();
  }

  eject() {
    if (this.ejected) return;
    for (const name of Object.keys(this.grips)) {
      if (this.grips[name].ragdoll === this.rider) this.releaseGrip(name, true);
    }
    this.onDetached();
    const v = this.chassis.getLinearVelocity();
    for (const b of this.rider.allBodies()) {
      b.setLinearVelocity(V(v.x * 0.9, Math.max(v.y, 0) + 4.5));
    }
    this.game.audio.play('jump', 1);
  }

  isGrounded(bodies = this.wheels) {
    for (const b of bodies) {
      for (let ce = b.getContactList(); ce; ce = ce.next) {
        const c = ce.contact;
        if (!c.isTouching()) continue;
        const fa = c.getFixtureA(), fb = c.getFixtureB();
        if (fa.isSensor() || fb.isSensor()) continue;
        const other = ce.other;
        const ud = other.getUserData();
        if (ud && ud.entity === this) continue;
        return true;
      }
    }
    return false;
  }

  drive(input, maxSpeed, torque, motors = this.motors, antiWheelie = this.def.antiWheelie ?? 1.2) {
    for (const m of motors) {
      const spin = m.getBodyB().getAngularVelocity() - m.getBodyA().getAngularVelocity();
      if (input.up) {
        // already faster than the motor can drive (boost pads, downhill): coast
        m.enableMotor(spin > -maxSpeed);
        m.setMotorSpeed(-maxSpeed);
        m.setMaxMotorTorque(torque);
      } else if (input.down) {
        m.enableMotor(true);
        m.setMotorSpeed(maxSpeed * 0.6);
        m.setMaxMotorTorque(torque * 0.8);
      } else {
        m.enableMotor(true);
        m.setMotorSpeed(0);
        m.setMaxMotorTorque(torque * 0.02);
      }
      // Cancel most of the motor's reaction torque on the chassis so throttle
      // doesn't instantly flip the vehicle (arcade handling).
      // (only while the driven wheel is on the ground; in the air the reaction is real physics)
      if ((input.up || input.down) && antiWheelie > 0 && m.isMotorEnabled() && this.isGrounded([m.getBodyB()])) {
        const mt = m.getMotorTorque(120);
        this.chassis.applyTorque(mt * antiWheelie, true);
      }
    }
  }

  brake(joints, torque) {
    for (const j of joints) {
      j.enableMotor(true);
      j.setMotorSpeed(0);
      j.setMaxMotorTorque(torque);
    }
  }

  leanTorque(input, torque, maxSpin = 5) {
    const dir = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.lean = dir;
    if (!dir) return;
    const w = this.chassis.getAngularVelocity();
    if (Math.sign(w) === dir && Math.abs(w) > maxSpin) return;
    this.chassis.applyTorque(dir * torque, true);
  }

  boostAll(dvx, dvy) {
    for (const b of this.allBodies()) {
      const m = b.getMass();
      b.applyLinearImpulse(V(dvx * m, dvy * m), b.getWorldCenter(), true);
    }
  }

  update(dt, input) {
    const controllable = this.rider.alive && this.attached;
    // grips: posture motors
    for (const name in this.grips) {
      const g = this.grips[name];
      if (g.joint._dead) { this.releaseGrip(name, true); continue; }
      if (!g.motor) continue;
      const alive = g.ragdoll.alive;
      const leanOff = g.ragdoll === this.rider && controllable ? this.lean * 0.3 : 0;
      const err = g.target + leanOff - g.joint.getJointAngle();
      g.joint.setMotorSpeed(clamp(err * 10, -10, 10));
      g.joint.setMaxMotorTorque(alive ? g.motor : g.motor * 0.08);
    }
    if (controllable) {
      this.def.__control(this, dt, input);
    } else {
      for (const m of this.motors) {
        m.enableMotor(true);
        m.setMotorSpeed(0);
        m.setMaxMotorTorque(1.5);
      }
      this.lean = 0;
      this.setFlames(false);
      this.game.audio.loop('jet', 0);
    }
    if (this.ejected && this.rider.alive) {
      this.rider.flail(input);
      if (this.rider.group === this.group && this.game.time - this.ejectTime > 0.35) {
        this.rider.setGroup(-50);
      }
    }
    // let the rider's body animate a little with lean while seated
    if (controllable) {
      const T = this.rider.targets, B = this.rider.baseTargets;
      T.head = (B.head || 0) + this.lean * 0.25;
    }
    for (const p of this.passengers) p.update(dt);
    this.rider.update(dt);
    // engine sound
    const v = this.chassis.getLinearVelocity();
    const sp = Math.hypot(v.x, v.y);
    this.game.audio.loop('engine', controllable && this.def.engine ? 0.4 + Math.min(0.6, sp / 15) : 0, 0.6 + sp / 10);
  }

  setFlames(on) {
    for (const f of this.fx.flames || []) {
      f.visible = on;
      if (on) {
        const s = 0.8 + Math.random() * 0.5;
        f.scale.set(s, 0.9 + Math.random() * 0.2, 0.9 + Math.random() * 0.2);
      }
    }
  }

  checkBreaks(invDt) {
    if (this.game.time < 0.6) return; // let the rig settle after spawning
    for (const name in this.grips) {
      const g = this.grips[name];
      if (g.joint._dead) continue;
      const f = g.joint.getReactionForce(invDt).length();
      const thr = g.brk * this.game.toughness;
      if (f > thr) {
        g.strain++;
        if (g.strain >= 2 || f > thr * 1.7) this.game.queue(() => this.releaseGrip(name));
      } else g.strain = 0;
    }
    this.rider.checkBreaks(invDt);
    for (const p of this.passengers) p.checkBreaks(invDt);
  }

  destroy() {
    for (const b of this.bodies) {
      if (!this.game.destroyed.has(b)) {
        this.game.renderer.unbind(b);
        this.game.destroyBody(b);
      }
    }
    this.rider.destroy();
    for (const p of this.passengers) p.destroy();
  }
}

// ---------------------------------------------------------------------------
// 1. Rocket wheelchair
// ---------------------------------------------------------------------------
function buildWheelchair(ch, x, y) {
  const R = ch.game.renderer;
  const cx = x, cy = y + 0.62;
  const chassis = vBody(ch, cx, cy);
  const d = 12 / 0.2;
  fx(ch, chassis, box(0.28, 0.05, 0, 0), d);
  fx(ch, chassis, box(0.04, 0.34, -0.3, 0.32, 0.08), d * 0.3);
  fx(ch, chassis, segBox([0.3, 0], [0.45, -0.5], 0.03), d * 0.3);
  fx(ch, chassis, box(0.11, 0.025, 0.47, -0.32), d * 0.3);
  fx(ch, chassis, box(0.18, 0.025, -0.06, 0.26), d * 0.2);
  // visuals
  const g = new THREE.Group();
  const fabric = 0x2b5fa8, frame = 0xc6cbd3;
  vBox(R, g, 0.29, 0.05, 0, 0, 0, fabric, 0.6);
  vBox(R, g, 0.04, 0.34, -0.3, 0.32, 0.08, fabric, 0.6);
  for (const z of [-0.3, 0.3]) {
    vTube(R, g, [0.28, 0], [0.45, -0.5], 0.02, frame, z, chromeOpts());
    vTube(R, g, [-0.24, 0.26], [0.12, 0.26], 0.025, 0x222222, z);
    vTube(R, g, [-0.33, -0.02], [-0.27, 0.66], 0.02, frame, z, chromeOpts());
    vTube(R, g, [-0.27, 0.66], [-0.44, 0.66], 0.025, 0x222222, z);
    vTube(R, g, [0.1, 0], [0.1, 0.26], 0.015, frame, z, chromeOpts());
  }
  vBox(R, g, 0.11, 0.025, 0.47, -0.32, 0, 0x333333, 0.5);
  // rockets
  const flames = [];
  for (const z of [-0.18, 0.18]) {
    const tank = R.cylinder(0.08, 0.08, 0.5, 0x9c2a2a, { seg: 12, matOpts: { metalness: 0.4, roughness: 0.4 } });
    tank.rotation.z = PI / 2;
    tank.position.set(-0.52, 0.3, z);
    g.add(tank);
    const nozzle = R.cylinder(0.06, 0.09, 0.1, 0x333333, { seg: 10 });
    nozzle.rotation.z = PI / 2;
    nozzle.position.set(-0.8, 0.3, z);
    g.add(nozzle);
    const fl = flameMesh(R, 0.7, 0.1);
    fl.position.set(-0.85, 0.3, z);
    g.add(fl);
    flames.push(fl);
  }
  const upFlames = [];
  for (const z of [-0.3, 0.3]) {
    const fl = flameMesh(R, 0.45, 0.07);
    fl.rotation.z = PI / 2;
    fl.position.set(0.0, -0.08, z);
    g.add(fl);
    upFlames.push(fl);
  }
  ch.fx.flames = flames;
  ch.fx.upFlames = upFlames;
  ch.addVisual(chassis, g);

  const rear = makeWheel(ch, x - 0.3, y + 0.45, 0.45, 4, { zs: [-0.36, 0.36], width: 0.08, spokes: 8 });
  const front = makeWheel(ch, x + 0.45, y + 0.12, 0.12, 1, { zs: [-0.3, 0.3], width: 0.06, spokes: 0 });
  const m1 = ch.game.world.createJoint(new planck.RevoluteJoint({ enableMotor: true, maxMotorTorque: 0, motorSpeed: 0 }, chassis, rear, rear.getPosition()));
  ch.game.world.createJoint(new planck.RevoluteJoint({}, chassis, front, front.getPosition()));
  ch.motors = [m1];
  ch.wheels = [rear, front];

  const hip = [x - 0.06, y + 0.83];
  return {
    chassis, hip,
    pose: { torso: PI / 2 + 0.08, handF: [0.14, 0.07], handB: [0.06, 0.07], footF: [0.5, -0.47], footB: [0.44, -0.48] },
    grips: [
      { name: 'seat', part: 'torso', body: chassis, at: 'hip', brk: 28000, motor: 900 },
      { name: 'handF', part: 'lowerArmF', body: chassis, at: 'handF', brk: 6000 },
      { name: 'handB', part: 'lowerArmB', body: chassis, at: 'handB', brk: 6000 },
      { name: 'footF', part: 'lowerLegF', body: chassis, at: 'footF', brk: 9000 },
      { name: 'footB', part: 'lowerLegB', body: chassis, at: 'footB', brk: 9000 },
    ],
    controlGrips: ['seat'],
  };
}
CHARACTERS[0].engine = false;
CHARACTERS[0].antiWheelie = 1.5;
CHARACTERS[0].__control = (ch, dt, input) => {
  ch.drive(input, 19, 260);
  ch.leanTorque(input, 300);
  const c = ch.chassis;
  const a = c.getAngle();
  let jet = false;
  if (input.primary) {
    const f = 1500;
    c.applyForceToCenter(V(Math.cos(a) * f, Math.sin(a) * f), true);
    jet = true;
    if (Math.random() < 0.9) {
      const p = c.getWorldPoint(V(-0.95, 0.3));
      const v = c.getLinearVelocity();
      ch.game.effects.spark(p.x, p.y, v.x - Math.cos(a) * 8 + rand(-1, 1), v.y - Math.sin(a) * 8 + rand(-1, 1), Math.random() < 0.5 ? 0xff7a1a : 0xffd04a, rand(0.15, 0.3), rand(0.06, 0.12), { drag: 4 });
      if (Math.random() < 0.3) ch.game.effects.puff(p.x, p.y, v.x * 0.3 - Math.cos(a) * 3, v.y * 0.3 - Math.sin(a) * 3, 0x777777, 1.2, 0.12, { grav: 0.8 });
    }
  }
  let up = false;
  if (input.secondary) {
    const f = 1150;
    c.applyForceToCenter(V(-Math.sin(a) * f, Math.cos(a) * f), true);
    up = true;
    if (Math.random() < 0.7) {
      const p = c.getWorldPoint(V(0, -0.2));
      ch.game.effects.spark(p.x, p.y, Math.sin(a) * 7 + rand(-1, 1), -Math.cos(a) * 7, 0xff9a2a, rand(0.1, 0.25), rand(0.05, 0.1), { drag: 4 });
    }
  }
  ch.setFlames(jet);
  for (const f of ch.fx.upFlames) {
    f.visible = up;
    if (up) f.scale.set(0.8 + Math.random() * 0.4, 1, 1);
  }
  ch.game.audio.loop('jet', jet || up ? 1 : 0);
};

// ---------------------------------------------------------------------------
// 2. Gyro board (self balancing)
// ---------------------------------------------------------------------------
function buildGyro(ch, x, y) {
  const R = ch.game.renderer;
  const chassis = vBody(ch, x, y + 0.36);
  fx(ch, chassis, box(0.32, 0.05, 0, 0), 300);
  fx(ch, chassis, segBox([0.22, 0.05], [0.3, 1.05], 0.025), 60);
  fx(ch, chassis, box(0.07, 0.025, 0.3, 1.05), 60);
  const g = new THREE.Group();
  vBox(R, g, 0.33, 0.05, 0, 0, 0, 0x2a2a2e, 0.7);
  vBox(R, g, 0.3, 0.012, 0, 0.055, 0, 0x55c06a, 0.62);
  vTube(R, g, [0.22, 0.05], [0.3, 1.05], 0.03, 0x9aa0a8, 0, chromeOpts());
  vZBar(R, g, 0.3, 1.05, 0.025, 0.7, 0x222222);
  for (const z of [-0.36, 0.36]) {
    const grip = R.cylinder(0.035, 0.035, 0.12, 0x111111);
    grip.rotation.x = PI / 2;
    grip.position.set(0.3, 1.05, z);
    g.add(grip);
  }
  const light = R.sphere(0.04, 0x66ffaa, { matOpts: { emissive: 0x33ff88, emissiveIntensity: 2 } });
  light.position.set(0.27, 0.7, 0.04);
  g.add(light);
  ch.addVisual(chassis, g);
  const wheel = makeWheel(ch, x, y + 0.3, 0.3, 6, { zs: [-0.42, 0.42], width: 0.14, spokes: 5, rim: 0x55c06a });
  const m = ch.game.world.createJoint(new planck.RevoluteJoint({ enableMotor: true, maxMotorTorque: 0, motorSpeed: 0 }, chassis, wheel, wheel.getPosition()));
  ch.motors = [m];
  ch.wheels = [wheel];
  return {
    chassis, hip: [x - 0.02, y + 1.31],
    pose: { torso: PI / 2 - 0.08, handF: [0.32, 0.1], handB: [0.3, 0.09], footF: [0.1, -0.9], footB: [-0.1, -0.9] },
    grips: [
      { name: 'footF', part: 'lowerLegF', body: chassis, at: 'footF', brk: 9000 },
      { name: 'footB', part: 'lowerLegB', body: chassis, at: 'footB', brk: 9000 },
      { name: 'handF', part: 'lowerArmF', body: chassis, at: 'handF', brk: 6000 },
      { name: 'handB', part: 'lowerArmB', body: chassis, at: 'handB', brk: 6000 },
      { name: 'hips', part: 'torso', body: chassis, at: 'hip', brk: 20000, motor: 400 },
    ],
    controlGrips: ['footF', 'footB'],
  };
}
CHARACTERS[1].engine = true;
CHARACTERS[1].antiWheelie = 0;
CHARACTERS[1].__control = (ch, dt, input) => {
  const c = ch.chassis;
  if (input.secondary) ch.brake(ch.motors, 220);
  else ch.drive(input, 26, 280);
  const dir = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  ch.lean = dir;
  const grounded = ch.isGrounded();
  if (ch.inLoop) return; // the loop's pitch assist keeps the board on the track
  const target = dir * 0.45 + (input.up ? -0.12 : input.down ? 0.12 : 0);
  const err = wrapAngle(target - c.getAngle());
  const K = grounded ? 2600 : 1400, D = grounded ? 520 : 220;
  c.applyTorque(clamp(err * K - c.getAngularVelocity() * D, -2600, 2600), true);
  ch.abilityTimer -= dt;
  if (input.primary && grounded && ch.abilityTimer <= 0) {
    ch.abilityTimer = 0.7;
    const a = c.getAngle();
    ch.boostAll(-Math.sin(a) * 7.2, Math.cos(a) * 7.2);
    ch.game.audio.play('spring', 1);
    const p = ch.wheels[0].getPosition();
    ch.game.effects.dust(p.x, p.y - 0.3, 10);
  }
};

// ---------------------------------------------------------------------------
// 3. Bicycle with a kid on the back
// ---------------------------------------------------------------------------
function buildBike(ch, x, y) {
  const R = ch.game.renderer;
  const world = ch.game.world;
  const chassis = vBody(ch, x, y + 0.6);
  const P = { crank: [0, -0.24], seat: [-0.18, 0.42], head: [0.42, 0.44], rear: [-0.55, -0.24], front: [0.58, -0.24], bar: [0.38, 0.64] };
  const t = 0.025, d = 70;
  fx(ch, chassis, segBox(P.seat, P.head, t), d);
  fx(ch, chassis, segBox(P.crank, P.head, t), d);
  fx(ch, chassis, segBox(P.crank, P.seat, t), d);
  fx(ch, chassis, segBox(P.crank, P.rear, t), d);
  fx(ch, chassis, segBox(P.rear, P.seat, t), d);
  fx(ch, chassis, segBox(P.head, P.bar, t), d);
  fx(ch, chassis, box(0.17, 0.03, -0.58, 0.2), 60);
  fx(ch, chassis, box(0.02, 0.14, -0.76, 0.34), 40);
  const g = new THREE.Group();
  const red = 0xd23a2a;
  for (const [a, b] of [[P.seat, P.head], [P.crank, P.head], [P.crank, P.seat]]) vTube(R, g, a, b, 0.032, red, 0, { matOpts: { metalness: 0.3, roughness: 0.4 } });
  for (const z of [-0.06, 0.06]) {
    vTube(R, g, P.crank, P.rear, 0.018, red, z);
    vTube(R, g, P.rear, P.seat, 0.018, red, z);
    vTube(R, g, P.head, P.front, 0.02, 0xaaaaaa, z, chromeOpts());
  }
  vTube(R, g, P.head, P.bar, 0.025, 0xaaaaaa, 0, chromeOpts());
  vZBar(R, g, P.bar[0], P.bar[1], 0.022, 0.6, 0x222222);
  vBox(R, g, 0.14, 0.035, P.seat[0] - 0.02, P.seat[1] + 0.03, 0, 0x1a1a1a, 0.16);
  // child seat
  vBox(R, g, 0.17, 0.03, -0.58, 0.2, 0, 0x2a8ad2, 0.34);
  vBox(R, g, 0.02, 0.15, -0.76, 0.34, 0, 0x2a8ad2, 0.34);
  vTube(R, g, [-0.55, -0.24], [-0.5, 0.18], 0.015, 0x888888, 0);
  vTube(R, g, [-0.5, 0.18], [-0.4, 0.25], 0.015, 0x888888, 0);
  ch.addVisual(chassis, g);

  const susp = (wheel) => world.createJoint(new planck.WheelJoint({
    enableMotor: true, maxMotorTorque: 0, motorSpeed: 0, frequencyHz: 8, dampingRatio: 0.8,
  }, chassis, wheel, wheel.getPosition(), V(0, 1)));
  const rear = makeWheel(ch, x - 0.55, y + 0.36, 0.36, 2, { width: 0.06, spokes: 12, rim: 0xdddddd });
  const front = makeWheel(ch, x + 0.58, y + 0.36, 0.36, 2, { width: 0.06, spokes: 12, rim: 0xdddddd });
  const mr = susp(rear), mf = susp(front);
  ch.motors = [mr];
  ch.wheelJoints = [mr, mf];
  ch.wheels = [rear, front];

  // pedal crank (drives the legs around)
  const crank = vBody(ch, x, y + 0.36);
  fx(ch, crank, new planck.Circle(0.05), 400, { mask: 0 });
  const cg = new THREE.Group();
  const gear = R.cylinder(0.1, 0.1, 0.03, 0x777777, { seg: 16, matOpts: { metalness: 0.7, roughness: 0.3 } });
  gear.rotation.x = PI / 2;
  cg.add(gear);
  vBox(R, cg, 0.13, 0.015, 0, 0, 0, 0x555555, 0.03, 0.12);
  vBox(R, cg, 0.13, 0.015, 0, 0, 0, 0x555555, 0.03, -0.12);
  ch.addVisual(crank, cg);
  ch.crankJoint = world.createJoint(new planck.RevoluteJoint({ enableMotor: true, maxMotorTorque: 260, motorSpeed: 0 }, chassis, crank, crank.getPosition()));
  ch.crank = crank;

  const hip = [x - 0.2, y + 1.05];
  return {
    chassis, hip,
    pose: { torso: PI / 2 - 0.42, handF: [0.58, 0.19], handB: [0.56, 0.17], footF: [0.32, -0.69], footB: [0.08, -0.69] },
    grips: [
      { name: 'seat', part: 'torso', body: chassis, at: 'hip', brk: 28000, motor: 900 },
      { name: 'handF', part: 'lowerArmF', body: chassis, at: 'handF', brk: 6000 },
      { name: 'handB', part: 'lowerArmB', body: chassis, at: 'handB', brk: 6000 },
      { name: 'footF', part: 'lowerLegF', body: crank, at: 'footF', brk: 20000 },
      { name: 'footB', part: 'lowerLegB', body: crank, at: 'footB', brk: 20000 },
    ],
    controlGrips: ['seat'],
    after(ch) {
      const kid = new Ragdoll(ch.game, {
        x: x - 0.6, y: y + 0.9, scale: 0.6, look: ch.def.kidLook, group: ch.group, entity: ch, kind: 'kid',
        pose: { torso: PI / 2 + 0.05, handF: [0.3, 0.1], handB: [0.26, 0.08], footF: [0.42, -0.4], footB: [0.36, -0.42] },
      });
      ch.passengers.push(kid);
      ch.kid = kid;
      ch.addGrip(kid, { name: 'kidSeat', part: 'torso', body: chassis, at: 'hip', brk: 14000, motor: 300 });
      ch.addGrip(kid, { name: 'kidHandF', part: 'lowerArmF', body: chassis, at: 'handF', brk: 2400 });
      ch.addGrip(kid, { name: 'kidHandB', part: 'lowerArmB', body: chassis, at: 'handB', brk: 2400 });
    },
  };
}
CHARACTERS[2].engine = false;
CHARACTERS[2].antiWheelie = 2.2;
CHARACTERS[2].__control = (ch, dt, input) => {
  if (input.primary) {
    ch.brake(ch.wheelJoints, 260);
  } else {
    ch.drive(input, 24, 320);
    ch.wheelJoints[1].enableMotor(false);
  }
  ch.leanTorque(input, 330);
  // crank follows rear wheel
  const w = ch.wheels[0].getAngularVelocity() - ch.chassis.getAngularVelocity();
  ch.crankJoint.setMotorSpeed(w * 0.55);
  if (input.secondary && ch.abilityTimer <= 0) {
    ch.abilityTimer = 0.5;
    ch.game.audio.play('coin', 0.6);
  }
  ch.abilityTimer -= dt;
};

// ---------------------------------------------------------------------------
// 4. Motorized shopping cart
// ---------------------------------------------------------------------------
function buildCart(ch, x, y) {
  const R = ch.game.renderer;
  const world = ch.game.world;
  const chassis = vBody(ch, x, y + 0.5);
  const d = 80;
  fx(ch, chassis, box(0.78, 0.03, -0.24, -0.2), d * 2);
  fx(ch, chassis, box(0.45, 0.025, 0.08, 0.05), d);
  fx(ch, chassis, box(0.025, 0.32, 0.55, 0.34, -0.12), d * 0.5);
  fx(ch, chassis, box(0.025, 0.3, -0.38, 0.32, 0.08), d * 0.5);
  fx(ch, chassis, box(0.18, 0.025, -0.78, -0.17), d);
  fx(ch, chassis, segBox([-0.4, 0.6], [-0.5, 0.75], 0.02), d * 0.3);
  const g = new THREE.Group();
  const chrome = 0xc9ced6;
  const wireMat = new THREE.MeshStandardMaterial({ color: chrome, metalness: 0.8, roughness: 0.3, alphaMap: gridTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  vBox(R, g, 0.78, 0.03, -0.24, -0.2, 0, 0x555a60, 0.6);
  vBox(R, g, 0.45, 0.025, 0.08, 0.05, 0, chrome, 0.62, 0, { material: wireMat });
  vBox(R, g, 0.025, 0.32, 0.55, 0.34, -0.12, chrome, 0.62, 0, { material: wireMat });
  vBox(R, g, 0.025, 0.3, -0.38, 0.32, 0.08, chrome, 0.62, 0, { material: wireMat });
  for (const z of [-0.31, 0.31]) {
    const side = R.box(0.95, 0.6, 0.02, chrome, { material: wireMat });
    side.position.set(0.09, 0.33, z);
    g.add(side);
    vTube(R, g, [0.5, -0.18], [0.55, 0.02], 0.02, chrome, z * 0.8, chromeOpts());
    vTube(R, g, [-0.45, -0.18], [-0.38, 0.02], 0.02, chrome, z * 0.8, chromeOpts());
  }
  vTube(R, g, [-0.4, 0.6], [-0.5, 0.75], 0.02, chrome, 0.3, chromeOpts());
  vTube(R, g, [-0.4, 0.6], [-0.5, 0.75], 0.02, chrome, -0.3, chromeOpts());
  vZBar(R, g, -0.5, 0.75, 0.03, 0.66, 0xd23a2a);
  vBox(R, g, 0.18, 0.025, -0.78, -0.17, 0, 0x333333, 0.5);
  // motor box
  vBox(R, g, 0.15, 0.1, -0.6, -0.3, 0, 0x2a2a2a, 0.3);
  ch.addVisual(chassis, g);
  const susp = (wheel) => world.createJoint(new planck.WheelJoint({
    enableMotor: true, maxMotorTorque: 0, motorSpeed: 0, frequencyHz: 9, dampingRatio: 0.7,
  }, chassis, wheel, wheel.getPosition(), V(0, 1)));
  const rear = makeWheel(ch, x - 1.02, y + 0.15, 0.15, 2, { zs: [-0.3, 0.3], width: 0.07, spokes: 0, rim: 0xd23a2a });
  const front = makeWheel(ch, x + 0.5, y + 0.15, 0.15, 2, { zs: [-0.3, 0.3], width: 0.07, spokes: 0, rim: 0xd23a2a });
  const mr = susp(rear), mf = susp(front);
  ch.motors = [mr];
  ch.wheelJoints = [mr, mf];
  ch.wheels = [rear, front];
  return {
    chassis, hip: [x - 0.84, y + 1.17],
    pose: { torso: PI / 2 - 0.16, handF: [0.34, 0.08], handB: [0.32, 0.06], footF: [0.06, -0.81], footB: [-0.08, -0.81] },
    grips: [
      { name: 'footF', part: 'lowerLegF', body: chassis, at: 'footF', brk: 9000 },
      { name: 'footB', part: 'lowerLegB', body: chassis, at: 'footB', brk: 9000 },
      { name: 'handF', part: 'lowerArmF', body: chassis, at: 'handF', brk: 6000 },
      { name: 'handB', part: 'lowerArmB', body: chassis, at: 'handB', brk: 6000 },
      { name: 'hips', part: 'torso', body: chassis, at: 'hip', brk: 20000, motor: 500 },
    ],
    controlGrips: ['footF', 'footB'],
    after(ch) {
      // groceries in the basket
      const items = [[0xe74c3c, 0.12, 0.16], [0xf1c40f, 0.1, 0.1], [0x27ae60, 0.12, 0.09]];
      let ix = x - 0.33;
      for (const [col, hw, hh] of items) {
        const b = world.createBody({ type: 'dynamic', position: V(ix + hw, y + 0.6 + hh), angle: 0 });
        b.createFixture({ shape: new planck.Box(hw, hh), density: 12, friction: 0.6, filterCategoryBits: CAT.DYNAMIC, filterMaskBits: MASK.ALL });
        b.setUserData({ prop: true });
        const m = R.box(hw * 2, hh * 2, 0.24, col);
        const gg = new THREE.Group();
        gg.add(m);
        gg.position.z = rand(-0.12, 0.12);
        R.add(gg);
        R.bind(b, gg);
        ix += hw * 2 + 0.03;
      }
    },
  };
}
CHARACTERS[3].engine = true;
CHARACTERS[3].antiWheelie = 3.5;
CHARACTERS[3].__control = (ch, dt, input) => {
  if (input.secondary) {
    ch.brake(ch.wheelJoints, 120);
  } else {
    ch.drive(input, 52, 95);
    ch.wheelJoints[1].enableMotor(false);
  }
  ch.leanTorque(input, 340);
  ch.abilityTimer -= dt;
  if (input.primary && ch.abilityTimer <= 0 && ch.isGrounded()) {
    ch.abilityTimer = 0.75;
    const a = ch.chassis.getAngle();
    ch.boostAll(-Math.sin(a) * 6.8, Math.cos(a) * 6.8);
    ch.game.audio.play('spring', 0.8);
    const p = ch.chassis.getPosition();
    ch.game.effects.dust(p.x, p.y - 0.5, 10);
  }
};

// ---------------------------------------------------------------------------
// 5. Turbo moped
// ---------------------------------------------------------------------------
function buildMoped(ch, x, y) {
  const R = ch.game.renderer;
  const world = ch.game.world;
  const chassis = vBody(ch, x, y + 0.6);
  const d = 160;
  fx(ch, chassis, box(0.3, 0.04, 0.0, -0.18), d);
  fx(ch, chassis, box(0.32, 0.12, -0.45, 0.02), d);
  fx(ch, chassis, box(0.3, 0.05, -0.32, 0.18), d * 0.5);
  fx(ch, chassis, box(0.07, 0.3, 0.38, 0.05, -0.3), d * 0.5);
  fx(ch, chassis, segBox([0.45, 0.3], [0.62, -0.3], 0.03), d * 0.5);
  fx(ch, chassis, segBox([0.45, 0.3], [0.42, 0.52], 0.025), d * 0.3);
  const g = new THREE.Group();
  const paint = 0x3fc1a5;
  const paintOpts = { matOpts: { metalness: 0.3, roughness: 0.35 } };
  vBox(R, g, 0.3, 0.04, 0, -0.18, 0, 0x333333, 0.4);
  const rearBody = R.capsule(0.75, 0.15, paint, paintOpts);
  rearBody.scale.z = 2.2;
  rearBody.position.set(-0.45, 0.02, 0);
  g.add(rearBody);
  vBox(R, g, 0.3, 0.05, -0.32, 0.18, 0, 0x1a1a1a, 0.34);
  vBox(R, g, 0.07, 0.3, 0.38, 0.05, -0.3, paint, 0.45, 0, paintOpts);
  vTube(R, g, [0.45, 0.3], [0.62, -0.3], 0.03, 0xaaaaaa, 0.08, chromeOpts());
  vTube(R, g, [0.45, 0.3], [0.62, -0.3], 0.03, 0xaaaaaa, -0.08, chromeOpts());
  vTube(R, g, [0.45, 0.3], [0.42, 0.52], 0.03, 0xaaaaaa, 0, chromeOpts());
  vZBar(R, g, 0.42, 0.52, 0.025, 0.7, 0x222222);
  const lamp = R.sphere(0.08, 0xfff6c8, { matOpts: { emissive: 0xfff2b0, emissiveIntensity: 1.5 } });
  lamp.position.set(0.5, 0.42, 0);
  g.add(lamp);
  const fender = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 6, 16, PI * 0.6), R.mat(paint, paintOpts.matOpts));
  fender.position.set(0.62, -0.3, 0);
  fender.rotation.z = PI * 0.25;
  g.add(fender);
  const pipe = R.cylinder(0.04, 0.05, 0.4, 0x888888, chromeOpts());
  pipe.rotation.z = PI / 2 - 0.15;
  pipe.position.set(-0.75, -0.2, 0.18);
  g.add(pipe);
  const fl = flameMesh(R, 0.5, 0.06);
  fl.position.set(-0.95, -0.17, 0.18);
  fl.rotation.z = 0.15;
  g.add(fl);
  ch.fx.flames = [fl];
  ch.addVisual(chassis, g);
  const susp = (wheel, hz) => world.createJoint(new planck.WheelJoint({
    enableMotor: true, maxMotorTorque: 0, motorSpeed: 0, frequencyHz: hz, dampingRatio: 0.75,
  }, chassis, wheel, wheel.getPosition(), V(0, 1)));
  const rear = makeWheel(ch, x - 0.6, y + 0.3, 0.3, 4, { width: 0.16, spokes: 0, rim: 0x999999 });
  const front = makeWheel(ch, x + 0.62, y + 0.3, 0.3, 4, { width: 0.16, spokes: 0, rim: 0x999999 });
  const mr = susp(rear, 5), mf = susp(front, 5);
  ch.motors = [mr];
  ch.wheelJoints = [mr, mf];
  ch.wheels = [rear, front];
  return {
    chassis, hip: [x - 0.28, y + 0.9],
    pose: { torso: PI / 2 - 0.42, handF: [0.7, 0.22], handB: [0.68, 0.2], footF: [0.36, -0.42], footB: [0.3, -0.43] },
    grips: [
      { name: 'seat', part: 'torso', body: chassis, at: 'hip', brk: 28000, motor: 1000 },
      { name: 'handF', part: 'lowerArmF', body: chassis, at: 'handF', brk: 6000 },
      { name: 'handB', part: 'lowerArmB', body: chassis, at: 'handB', brk: 6000 },
      { name: 'footF', part: 'lowerLegF', body: chassis, at: 'footF', brk: 9000 },
      { name: 'footB', part: 'lowerLegB', body: chassis, at: 'footB', brk: 9000 },
    ],
    controlGrips: ['seat'],
  };
}
CHARACTERS[4].engine = true;
CHARACTERS[4].antiWheelie = 1.6;
CHARACTERS[4].__control = (ch, dt, input) => {
  const turbo = input.primary && input.up;
  if (input.secondary) {
    ch.brake(ch.wheelJoints, 380);
  } else {
    ch.drive(input, turbo ? 68 : 46, turbo ? 560 : 340);
    ch.wheelJoints[1].enableMotor(false);
  }
  ch.leanTorque(input, 420, 4.5);
  ch.setFlames(turbo);
  if (turbo && Math.random() < 0.8) {
    const c = ch.chassis;
    const p = c.getWorldPoint(V(-1.0, -0.17));
    const v = c.getLinearVelocity();
    const a = c.getAngle();
    ch.game.effects.spark(p.x, p.y, v.x - Math.cos(a) * 5, v.y - Math.sin(a) * 5 + rand(-0.5, 0.5), 0xff8a2a, rand(0.1, 0.25), rand(0.05, 0.09), { drag: 4, z: 0.18 });
  }
  ch.game.audio.loop('jet', turbo ? 0.5 : 0);
};

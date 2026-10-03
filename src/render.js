import * as THREE from 'three';
import { clamp, lerp, rand } from './physics.js';

export const THEMES = {
  meadow: {
    skyTop: '#4aa3e8', skyBottom: '#cfeeff', fog: 0xcfeeff,
    grass: 0x5cb83a, dirt: 0x8a5a33, rock: 0x7d7468, sun: 0xfff1d6, ambient: 0.75, backdrop: 'hills',
  },
  city: {
    skyTop: '#3b2c63', skyBottom: '#ff9a6b', fog: 0xe58a6e,
    grass: 0x6d6d78, dirt: 0x4a4a55, rock: 0x5a5a66, sun: 0xffc9a0, ambient: 0.7, backdrop: 'city',
  },
  desert: {
    skyTop: '#62a8e0', skyBottom: '#ffe6b0', fog: 0xffe2b0,
    grass: 0xe8c47a, dirt: 0xc8904f, rock: 0xa86f3e, sun: 0xfff3d6, ambient: 0.8, backdrop: 'mesas',
  },
  snow: {
    skyTop: '#7aa6cf', skyBottom: '#eef5fb', fog: 0xe8f0f8,
    grass: 0xf4f8ff, dirt: 0x6f7682, rock: 0x6f7682, sun: 0xffffff, ambient: 0.85, backdrop: 'peaks',
  },
  factory: {
    skyTop: '#2c2f36', skyBottom: '#8a8178', fog: 0x7a736b,
    grass: 0x8d9097, dirt: 0x50535a, rock: 0x45474d, sun: 0xffe2b8, ambient: 0.65, backdrop: 'factory',
  },
  night: {
    skyTop: '#070b24', skyBottom: '#34407a', fog: 0x2a3466,
    grass: 0x3f9a63, dirt: 0x5a5470, rock: 0x6a6a80, sun: 0xc8d4ff, ambient: 1.25, backdrop: 'night',
  },
};

const texCache = new Map();
function canvasTex(key, w, h, draw, repeat = true) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

export function noiseTexture(key = 'noise') {
  return canvasTex(key, 128, 128, (g, w, h) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const v = 200 + Math.random() * 55;
      g.fillStyle = `rgb(${v},${v},${v})`;
      const s = 1 + Math.random() * 4;
      g.fillRect(Math.random() * w, Math.random() * h, s, s);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function woodTexture() {
  return canvasTex('wood', 128, 128, (g, w, h) => {
    g.fillStyle = '#b07a3e';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#a06c34' : '#bb8546';
      g.fillRect(0, (i * h) / 4, w, h / 4 - 3);
    }
    g.strokeStyle = 'rgba(70,40,15,0.35)';
    for (let i = 0; i < 30; i++) {
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + rand(-4, 4), w * 0.6, y + rand(-4, 4), w, y + rand(-3, 3));
      g.stroke();
    }
    g.strokeStyle = '#5e3a17';
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.beginPath();
    g.moveTo(6, 6); g.lineTo(w - 6, h - 6);
    g.stroke();
  }, false);
}

export function brickTexture() {
  return canvasTex('brick', 128, 128, (g, w, h) => {
    g.fillStyle = '#c9c1b5';
    g.fillRect(0, 0, w, h);
    const bh = 16, bw = 32;
    for (let r = 0; r < h / bh; r++) {
      for (let c = -1; c < w / bw + 1; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0);
        const v = 150 + Math.random() * 40;
        g.fillStyle = `rgb(${v + 30},${v - 20},${v - 40})`;
        g.fillRect(x + 1, r * bh + 1, bw - 2, bh - 2);
      }
    }
  });
}

export function hazardStripeTexture() {
  return canvasTex('hazard', 64, 64, (g, w, h) => {
    g.fillStyle = '#ffcc00';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#222';
    for (let i = -2; i < 4; i++) {
      g.beginPath();
      g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + 64, h); g.lineTo(i * 32 + 64, h);
      g.fill();
    }
  });
}

export function arrowTexture() {
  return canvasTex('arrows', 128, 32, (g, w, h) => {
    g.fillStyle = '#1b1b1b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffdd22';
    for (let i = 0; i < 4; i++) {
      const x = i * 32 + 6;
      g.beginPath();
      g.moveTo(x, 4); g.lineTo(x + 12, 4); g.lineTo(x + 24, 16); g.lineTo(x + 12, 28); g.lineTo(x, 28); g.lineTo(x + 12, 16);
      g.fill();
    }
  });
}

export function textTexture(text, opts = {}) {
  const key = 'txt:' + text + JSON.stringify(opts);
  return canvasTex(key, opts.w || 512, opts.h || 256, (g, w, h) => {
    g.fillStyle = opts.bg || '#f4e7c5';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = opts.border || '#6b4a24';
    g.lineWidth = 14;
    g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = opts.color || '#3a2610';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lines = String(text).split('\n');
    let size = opts.size || 64;
    g.font = `${size}px Bangers, Impact, sans-serif`;
    const maxW = Math.max(...lines.map((l) => g.measureText(l).width));
    if (maxW > w - 40) size = Math.floor((size * (w - 40)) / maxW);
    g.font = `${size}px Bangers, Impact, sans-serif`;
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.05));
  }, false);
}

function skyTexture(top, bottom, stars) {
  return canvasTex('sky:' + top + bottom + stars, 4, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, top);
    grd.addColorStop(1, bottom);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, false);
}

export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
    this.camera.position.set(0, 4, 26);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x665544, 0.8);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -28; sc.right = 28; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
    this.backdropGroup = new THREE.Group();
    this.scene.add(this.backdropGroup);

    this.bindings = [];
    this.matCache = new Map();
    this.camState = { x: 0, y: 0, z: 26, shake: 0 };
    this.animators = [];
    this.time = 0;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (this.matCache.has(key)) return this.matCache.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts });
    this.matCache.set(key, m);
    return m;
  }

  setTheme(name) {
    const t = THEMES[name] || THEMES.meadow;
    this.theme = t;
    this.themeName = name;
    this.scene.background = skyTexture(t.skyTop, t.skyBottom);
    this.scene.fog = new THREE.Fog(t.fog, 60, 230);
    this.sun.color.set(t.sun);
    this.sun.intensity = name === 'night' ? 1.7 : 2.2;
    this.hemi.intensity = t.ambient;
    this.hemi.color.set(name === 'night' ? 0x8899ff : 0xffffff);
  }

  clearLevel() {
    for (const g of [this.levelGroup, this.backdropGroup]) {
      g.traverse((o) => {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      });
      g.clear();
    }
    this.bindings = [];
    this.animators = [];
  }

  add(obj, toBackdrop = false) {
    (toBackdrop ? this.backdropGroup : this.levelGroup).add(obj);
    return obj;
  }

  remove(obj) {
    if (!obj) return;
    obj.parent && obj.parent.remove(obj);
    obj.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
  }

  bind(body, obj) {
    this.bindings.push({ body, obj });
    obj.position.set(body.getPosition().x, body.getPosition().y, obj.position.z);
    obj.rotation.z = body.getAngle();
    return obj;
  }

  unbind(body, removeObj = true) {
    this.bindings = this.bindings.filter((b) => {
      if (b.body === body) {
        if (removeObj) this.remove(b.obj);
        return false;
      }
      return true;
    });
  }

  animate(fn) {
    this.animators.push(fn);
  }

  sync() {
    for (const { body, obj } of this.bindings) {
      const p = body.getPosition();
      obj.position.x = p.x;
      obj.position.y = p.y;
      obj.rotation.z = body.getAngle();
    }
  }

  shake(amount) {
    this.onShake?.(amount);
    this.camState.shake = Math.min(1.5, this.camState.shake + amount);
  }

  snapCamera(x, y) {
    this.camState.x = x;
    this.camState.y = y;
    this.camState.z = 16;
  }

  updateCamera(dt, tx, ty, vx, vy, zoomBias = this.zoomBias || 0) {
    const cs = this.camState;
    const speed = Math.hypot(vx, vy);
    const lookX = tx + clamp(vx * 0.35, -6, 6);
    const lookY = ty + clamp(vy * 0.15, -3, 3) + 1.6;
    const k = 1 - Math.exp(-dt * 4.5);
    cs.x = lerp(cs.x, lookX, k);
    cs.y = lerp(cs.y, lookY, k);
    const targetZ = clamp(15 + speed * 0.4 + zoomBias, 14, 32);
    cs.z = lerp(cs.z, targetZ, 1 - Math.exp(-dt * 1.5));
    cs.shake = Math.max(0, cs.shake - dt * 2.5);
    const sh = cs.shake * cs.shake;
    const sx = (Math.random() - 0.5) * sh * 1.2;
    const sy = (Math.random() - 0.5) * sh * 1.2;
    this.camera.position.set(cs.x + sx, cs.y + 2.2 + cs.z * 0.12 + sy, cs.z);
    this.camera.lookAt(cs.x + sx * 0.5, cs.y + sy * 0.5, 0);
    this.sun.position.set(cs.x + 10, cs.y + 26, 18);
    this.sun.target.position.set(cs.x, cs.y, 0);
  }

  render(dt) {
    this.time += dt;
    for (let i = this.animators.length - 1; i >= 0; i--) {
      if (this.animators[i](dt, this.time) === false) this.animators.splice(i, 1);
    }
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- Mesh factories ----------
  extrudePoly(points, color, zFront = 1.0, zBack = -2.5, opts = {}) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: zFront - zBack, bevelEnabled: false, curveSegments: 1 });
    geo.translate(0, 0, zBack);
    const material = opts.material || this.mat(color, opts.matOpts || {});
    const m = new THREE.Mesh(geo, material);
    m.castShadow = opts.castShadow !== false;
    m.receiveShadow = true;
    return m;
  }

  box(w, h, d, color, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, opts.material || this.mat(color, opts.matOpts || {}));
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  capsule(len, radius, color, opts = {}) {
    // capsule oriented along local X
    const geo = new THREE.CapsuleGeometry(radius, Math.max(0.001, len - radius * 2), 4, 10);
    geo.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geo, opts.material || this.mat(color, opts.matOpts || {}));
    m.castShadow = true;
    return m;
  }

  sphere(r, color, opts = {}) {
    const geo = new THREE.SphereGeometry(r, opts.seg || 18, opts.seg ? opts.seg * 0.7 : 14);
    const m = new THREE.Mesh(geo, opts.material || this.mat(color, opts.matOpts || {}));
    m.castShadow = true;
    return m;
  }

  cylinder(rTop, rBot, h, color, opts = {}) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, opts.seg || 16);
    const m = new THREE.Mesh(geo, opts.material || this.mat(color, opts.matOpts || {}));
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  wheel(r, width = 0.18, opts = {}) {
    const g = new THREE.Group();
    const tireR = Math.min(r * 0.22, 0.1);
    const tire = new THREE.Mesh(
      new THREE.TorusGeometry(r - tireR, tireR, 10, 28),
      this.mat(opts.tire || 0x1d1d1f, { roughness: 0.95 })
    );
    tire.scale.z = width / (tireR * 2);
    tire.castShadow = true;
    g.add(tire);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(r - tireR * 1.6, r - tireR * 1.6, width * 0.5, 24, 1, true),
      this.mat(opts.rim || 0xb8bcc4, { metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide })
    );
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.16, r * 0.16, width * 0.9, 12),
      this.mat(opts.hub || 0x777b85, { metalness: 0.7, roughness: 0.3 })
    );
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
    const spokes = opts.spokes ?? 6;
    for (let i = 0; i < spokes; i++) {
      const s = new THREE.Mesh(
        new THREE.BoxGeometry(r * 2 - tireR * 3, 0.025, 0.025),
        this.mat(0xd0d3d9, { metalness: 0.7, roughness: 0.3 })
      );
      s.rotation.z = (i / spokes) * Math.PI;
      s.position.z = (i % 2 ? 1 : -1) * width * 0.15;
      g.add(s);
    }
    return g;
  }

  label(text, w, h, opts = {}) {
    const tex = textTexture(text, opts);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    m.castShadow = true;
    return m;
  }

  // ---------- Backdrop ----------
  buildBackdrop(themeName, xMin, xMax, groundAtRaw) {
    // ignore the boundary walls at the level ends when placing scenery
    const groundAt = groundAtRaw && ((x) => groundAtRaw(clamp(x, xMin + 18, xMax - 14)));
    const t = THEMES[themeName] || THEMES.meadow;
    const g = this.backdropGroup;
    const span = xMax - xMin + 300;
    const x0 = xMin - 150;
    const baseY = groundAt ? groundAt((xMin + xMax) / 2) : 0;
    const fogTint = new THREE.Color(t.fog);

    const tinted = (hex, amt) => new THREE.Color(hex).lerp(fogTint, amt);
    const flatMat = (c) => new THREE.MeshBasicMaterial({ color: c, fog: true });

    // distant silhouette layers
    const layer = (z, amp, freq, color, yOff, jag = false) => {
      const pts = [];
      const n = Math.ceil(span / 4);
      for (let i = 0; i <= n; i++) {
        const x = x0 + (i / n) * span;
        let y = Math.sin(x * freq) * amp + Math.sin(x * freq * 2.7 + 1.3) * amp * 0.4;
        if (jag) y = Math.abs(Math.sin(x * freq)) * amp * 1.4 + Math.sin(x * freq * 5.1) * amp * 0.25;
        pts.push(new THREE.Vector2(x, y + yOff));
      }
      pts.push(new THREE.Vector2(x0 + span, yOff - 120));
      pts.push(new THREE.Vector2(x0, yOff - 120));
      const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
      const m = new THREE.Mesh(geo, flatMat(color));
      m.position.z = z;
      g.add(m);
    };

    const bt = t.backdrop;
    if (bt === 'hills' || bt === 'night') {
      layer(-150, 18, 0.012, tinted(bt === 'night' ? 0x1d2a44 : 0x7fb07a, 0.55), baseY - 6);
      layer(-90, 10, 0.025, tinted(bt === 'night' ? 0x1f3a2c : 0x5d9b52, 0.4), baseY - 8);
      layer(-45, 5, 0.05, tinted(bt === 'night' ? 0x22432f : 0x4f8f43, 0.2), baseY - 9);
    } else if (bt === 'peaks') {
      layer(-160, 40, 0.01, tinted(0x9fb4cc, 0.45), baseY - 5, true);
      layer(-100, 22, 0.02, tinted(0xd8e4f0, 0.3), baseY - 8, true);
      layer(-50, 8, 0.05, tinted(0xe9f1f9, 0.15), baseY - 9);
    } else if (bt === 'mesas') {
      layer(-150, 12, 0.008, tinted(0xd7a066, 0.5), baseY - 2);
      layer(-80, 6, 0.03, tinted(0xc98a52, 0.35), baseY - 8);
    } else if (bt === 'city' || bt === 'factory') {
      layer(-160, 6, 0.01, tinted(bt === 'city' ? 0x4c3a6b : 0x3e3f44, 0.4), baseY - 6);
    }

    // props
    const rng = mulberry(Math.floor(xMin * 13 + xMax * 7));
    if (bt === 'city') {
      for (let x = x0; x < x0 + span; x += 6 + rng() * 10) {
        const z = -30 - rng() * 70;
        const h = 15 + rng() * 45;
        const w = 6 + rng() * 10;
        const col = tinted(new THREE.Color().setHSL(0.7 + rng() * 0.1, 0.25, 0.18 + rng() * 0.12), Math.min(0.85, -z / 120));
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), flatMat(col));
        b.position.set(x, baseY - 10 + h / 2, z);
        g.add(b);
        // lit windows
        const winMat = new THREE.MeshBasicMaterial({ color: tinted(0xffd27a, Math.min(0.7, -z / 140)), fog: true });
        for (let wy = 2; wy < h - 2; wy += 3) {
          for (let wx = -w / 2 + 1; wx < w / 2 - 0.8; wx += 1.8) {
            if (rng() < 0.45) {
              const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), winMat);
              win.position.set(x + wx + 0.4, baseY - 10 + wy, z + 3.01);
              g.add(win);
            }
          }
        }
      }
    }
    if (bt === 'factory') {
      for (let x = x0; x < x0 + span; x += 12 + rng() * 18) {
        const z = -35 - rng() * 60;
        const h = 10 + rng() * 20;
        const col = tinted(0x55565c, Math.min(0.8, -z / 120));
        const b = new THREE.Mesh(new THREE.BoxGeometry(10 + rng() * 8, h, 8), flatMat(col));
        b.position.set(x, baseY - 8 + h / 2, z);
        g.add(b);
        if (rng() < 0.7) {
          const ch = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, h + 15, 10), flatMat(tinted(0x6b4a3a, Math.min(0.8, -z / 120))));
          ch.position.set(x + 3, baseY - 8 + (h + 15) / 2, z - 2);
          g.add(ch);
        }
      }
    }
    if (bt === 'hills' || bt === 'night' || bt === 'peaks') {
      const pine = bt !== 'hills';
      for (let x = x0; x < x0 + span; x += 3 + rng() * 9) {
        const z = -8 - rng() * 40;
        const s = 0.8 + rng() * 1.2;
        const y = (groundAt ? groundAt(x) : baseY) - 1 - (-z) * 0.12;
        const tree = this.tree(pine, s, tinted(pine ? (bt === 'peaks' ? 0x2f5b45 : 0x1d3d2e) : 0x3f8f3a, Math.min(0.7, -z / 70)), tinted(0x5a3b22, Math.min(0.7, -z / 70)));
        tree.position.set(x, y, z);
        g.add(tree);
      }
    }
    if (bt === 'mesas') {
      for (let x = x0; x < x0 + span; x += 6 + rng() * 14) {
        const z = -6 - rng() * 30;
        const y = (groundAt ? groundAt(x) : baseY) - 0.5 - (-z) * 0.1;
        const c = this.cactus(0.8 + rng() * 0.8, tinted(0x4f8a3c, Math.min(0.6, -z / 60)));
        c.position.set(x, y, z);
        g.add(c);
      }
    }
    // clouds / stars
    if (bt === 'night') {
      const starGeo = new THREE.BufferGeometry();
      const pos = [];
      for (let i = 0; i < 900; i++) pos.push(x0 + rng() * span, baseY + 10 + rng() * 120, -180 - rng() * 20);
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, fog: false })));
      const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xf6f1d8, fog: false }));
      moon.position.set((xMin + xMax) / 2, baseY + 60, -190);
      g.add(moon);
    } else {
      const cloudMat = new THREE.MeshBasicMaterial({ color: tinted(0xffffff, 0.2), fog: false, transparent: true, opacity: bt === 'factory' ? 0.35 : 0.85 });
      for (let x = x0; x < x0 + span; x += 20 + rng() * 40) {
        const cl = new THREE.Group();
        const n = 3 + Math.floor(rng() * 4);
        for (let i = 0; i < n; i++) {
          const puff = new THREE.Mesh(new THREE.CircleGeometry(3 + rng() * 4, 20), cloudMat);
          puff.position.set(i * 3.5 - n * 1.7, rng() * 2, i * 0.01);
          cl.add(puff);
        }
        cl.position.set(x, baseY + 25 + rng() * 45, -120 - rng() * 50);
        g.add(cl);
      }
    }
  }

  tree(pine, s, leafColor, trunkColor) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 2 * s, 6), new THREE.MeshLambertMaterial({ color: trunkColor }));
    trunk.position.y = s;
    g.add(trunk);
    const lm = new THREE.MeshLambertMaterial({ color: leafColor, flatShading: true });
    if (pine) {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry((1.4 - i * 0.35) * s, 1.8 * s, 7), lm);
        c.position.y = (2 + i * 1.0) * s;
        g.add(c);
      }
    } else {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 * s, 0), lm);
      c.position.y = 2.6 * s;
      g.add(c);
      const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 * s, 0), lm);
      c2.position.set(0.7 * s, 2.1 * s, 0.3);
      g.add(c2);
    }
    return g;
  }

  cactus(s, color) {
    const g = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color });
    const main = new THREE.Mesh(new THREE.CapsuleGeometry(0.3 * s, 2.2 * s, 4, 8), m);
    main.position.y = 1.4 * s;
    g.add(main);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.2 * s, 0.8 * s, 4, 8), m);
    arm.position.set(0.5 * s, 1.8 * s, 0);
    g.add(arm);
    const arm2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.18 * s, 0.6 * s, 4, 8), m);
    arm2.position.set(-0.45 * s, 1.4 * s, 0);
    g.add(arm2);
    return g;
  }
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

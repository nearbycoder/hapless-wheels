// Dev-only helpers for simulating levels headlessly from the console.
// Loaded only under `vite dev` (see main.js).
export function installDevtools(app) {
  const g = () => app.game;
  window.evlog = [];

  const groundAngle = (game, x, y) => {
    let hit = null;
    game.world.rayCast({ x, y }, { x, y: y - 40 }, (f, p, n, fr) => {
      if (f.isSensor() || !f.getBody().isStatic()) return -1;
      hit = { n };
      return fr;
    });
    return hit ? Math.atan2(-hit.n.x, hit.n.y) : 0;
  };

  // hazard ahead? (spikes, mines, saws within a few metres in front)
  const hazardAhead = (game, x, y, dist) => {
    let found = false;
    for (let b = game.world.getBodyList(); b && !found; b = b.getNext()) {
      for (let f = b.getFixtureList(); f; f = f.getNext()) {
        const ud = f.getUserData();
        if (!ud || !(ud.hazard || ud.type === 'mine')) continue;
        const p = b.getPosition();
        if (p.x > x + 1 && p.x < x + dist && Math.abs(p.y - y) < 4) { found = true; break; }
      }
    }
    return found;
  };

  // Autopilot: full throttle, match the slope on the ground, level out in the
  // air, and use the special ability when a hazard is coming up.
  window.auto = (lvl, ch, secs = 60, opts = {}) => {
    app.ui.charId = ch;
    app.startLevel(lvl);
    const game = g();
    window.evlog = [];
    hookRagdoll(game);
    hookGrips(app);
    let maxX = -1e9;
    let i = 0;
    const trail = [];
    let jetT = 0;
    for (; i < secs * 60; i++) {
      const pl = game.player;
      const c = pl.chassis;
      const p = c.getPosition(), v = c.getLinearVelocity();
      const grounded = pl.isGrounded();
      const tgt = grounded ? groundAngle(game, p.x + v.x * 0.25, p.y) : Math.max(-0.35, Math.min(0.35, Math.atan2(v.y, Math.abs(v.x) + 1) * 0.5));
      const a = c.getAngle() - tgt;
      const I = { up: true, down: false, left: a < -0.15, right: a > 0.15, primary: false, secondary: false };
      const danger = hazardAhead(game, p.x, p.y, 3 + Math.abs(v.x) * 0.45);
      if (ch === 'gyro' || ch === 'cart') I.primary = danger && grounded;
      if (ch === 'moped') I.primary = true;
      if (ch === 'wheelchair') { if (danger) jetT = 0.5; I.secondary = jetT > 0; I.primary = jetT > 0; jetT -= 1 / 60; }
      if (opts.prim) I.primary = opts.prim(game, pl, i / 60);
      game.update(1 / 60, I);
      const x = pl.focus.getPosition().x;
      maxX = Math.max(maxX, x);
      if (i % 60 === 0) trail.push(Math.round(x));
      if (game.state !== 'playing') break;
    }
    return `${game.level.name}/${ch}: ${game.state} ${game.state === 'dead' ? game.deathReason : ''} t=${(i / 60).toFixed(1)} maxX=${maxX.toFixed(0)} token=${game.tokenPos} att=${game.player.attached} | ${trail.join(',')}`;
  };

  window.sweepAll = (levels, chars = ['wheelchair', 'gyro', 'bike', 'cart', 'moped'], secs = 50) => {
    const out = [];
    for (const l of levels) for (const c of chars) {
      const r = auto(l, c, secs);
      out.push(r.split(' | ')[0].replace(/token=\S+ /, '') + ' :: ' + window.evlog.filter((e) => /kill|grip seat|grip hips/.test(e)).slice(0, 2).join('; '));
    }
    return out.join('\n');
  };

  function hookRagdoll(game) {
    const RD = game.player.rider.constructor.prototype;
    if (RD._o) return;
    RD._o = { detach: RD.detach, kill: RD.kill, onImpact: RD.onImpact, impale: RD.impale };
    const t = () => app.game.time.toFixed(2);
    RD.detach = function (n, s) { if (this.kind !== 'npc') window.evlog.push(`${t()} detach ${this.kind}.${n}`); return RD._o.detach.call(this, n, s); };
    RD.kill = function (r) { if (this.alive && this.kind !== 'npc') window.evlog.push(`${t()} kill ${this.kind} ${r}`); return RD._o.kill.call(this, r); };
    RD.onImpact = function (n, dv, p) { if (dv > 8 && this.kind !== 'npc') window.evlog.push(`${t()} impact ${this.kind}.${n} dv=${dv.toFixed(1)} @${p.x.toFixed(1)},${p.y.toFixed(1)}`); return RD._o.onImpact.call(this, n, dv, p); };
    RD.impale = function (n, b, p) { window.evlog.push(`${t()} impale ${this.kind}.${n}`); return RD._o.impale.call(this, n, b, p); };
  }

  window.sweep = (lvl, chars = ['wheelchair', 'gyro', 'bike', 'cart', 'moped'], secs = 60) =>
    chars.map((c) => auto(lvl, c, secs) + '\n   ' + window.evlog.slice(-6).join('\n   ')).join('\n');
}

export function hookGrips(app) {
  const P = app.game.player.constructor.prototype;
  if (P._rg) return;
  P._rg = P.releaseGrip;
  P.releaseGrip = function (name, quiet) {
    const g = this.grips[name];
    if (g && !quiet) {
      const f = g.joint._dead ? -1 : Math.round(g.joint.getReactionForce(120).length());
      window.evlog.push(`${app.game.time.toFixed(2)} grip ${name} broke f=${f}`);
    }
    return P._rg.call(this, name, quiet);
  };
}

// Render the current frame and save it via the dev server (see vite.config.js).
window.shot = async (name = 'shot') => {
  const r = window.__hw.renderer;
  r.render(0);
  const url = r.renderer.domElement.toDataURL('image/jpeg', 0.8);
  await fetch('/__shot?name=' + name, { method: 'POST', body: url });
  return name;
};

// Fly the camera over a level for layout checks: wide view centred on (x, y).
window.view = async (lvl, x, y, z = 40, name) => {
  const app = window.__hw;
  if (app.game.level !== (await import('./levels.js')).LEVELS[lvl] || app.demo) app.startLevel(lvl);
  const r = app.renderer;
  r.camState.x = x; r.camState.y = y; r.camState.z = z; r.camState.shake = 0;
  r.camera.position.set(x, y + 2, z);
  r.camera.lookAt(x, y, 0);
  r.sun.position.set(x + 10, y + 26, 18);
  r.sun.target.position.set(x, y, 0);
  r.sync();
  r.renderer.render(r.scene, r.camera);
  const url = r.renderer.domElement.toDataURL('image/jpeg', 0.75);
  await fetch('/__shot?name=' + (name || `L${lvl}_${Math.round(x)}`), { method: 'POST', body: url });
  return 'ok';
};

// Capture several camera positions into one 2-column contact sheet.
window.survey = async (lvl, spots, name) => {
  const app = window.__hw;
  const { LEVELS } = await import('./levels.js');
  if (app.game.level !== LEVELS[lvl] || app.demo) app.startLevel(lvl);
  const r = app.renderer;
  const src = r.renderer.domElement;
  const cols = 2, W = 640, H = 400;
  const rows = Math.ceil(spots.length / cols);
  const c = document.createElement('canvas');
  c.width = W * cols; c.height = H * rows;
  const ctx = c.getContext('2d');
  spots.forEach(([x, y, z = 42], i) => {
    r.camera.position.set(x, y + 2, z);
    r.camera.lookAt(x, y, 0);
    r.sun.position.set(x + 10, y + 26, 18);
    r.sun.target.position.set(x, y, 0);
    r.sync();
    r.renderer.render(r.scene, r.camera);
    ctx.drawImage(src, (i % cols) * W, Math.floor(i / cols) * H, W, H);
    ctx.fillStyle = '#ff0';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`x=${x} y=${y}`, (i % cols) * W + 10, Math.floor(i / cols) * H + 26);
  });
  await fetch('/__shot?name=' + (name || 'survey' + lvl), { method: 'POST', body: c.toDataURL('image/jpeg', 0.8) });
  return 'ok';
};

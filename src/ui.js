import { LEVELS } from './levels.js';
import { CHARACTERS } from './characters.js';

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch (e) { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ }
  },
};

const fmt = (t) => {
  if (t == null) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

function medalFor(level, time) {
  if (time == null) return null;
  if (time <= level.par) return 'gold';
  if (time <= level.par * 1.5) return 'silver';
  return 'bronze';
}

const ICONS = {
  wheelchair: '♿', gyro: '⚡', bike: '🚲', cart: '🛒', moped: '🛵',
};

export class UI {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.progress = store.get('hw_progress', {});
    this.charId = store.get('hw_char', 'wheelchair');
    this.settings = store.get('hw_settings', { gore: 1, toughness: 1 });
    this.screen = null;
    this.hud = null;
    this.buildHud();
    this.buildTouch();
  }

  clear() {
    for (const c of [...this.root.children]) {
      if (c !== this.hud && c !== this.touch && c !== this.toastBox) c.remove();
    }
    this.screen = null;
  }

  // ---------------------------------------------------------------- title
  showTitle() {
    this.clear();
    this.hud.classList.add('hidden');
    this.setTouch(false);
    const s = el('div', 'screen title-screen');
    s.innerHTML = `
      <div class="logo">
        <div class="logo-top">HAPLESS</div>
        <div class="logo-bottom">WHEELS</div>
        <div class="logo-sub">a physics ragdoll racer · three.js edition</div>
      </div>
      <div class="menu">
        <button class="btn big" data-a="play">PLAY</button>
        <button class="btn" data-a="how">HOW TO PLAY</button>
        <button class="btn" data-a="settings">SETTINGS</button>
      </div>
      <div class="foot">Arrow keys / WASD · Space · Shift · Z to eject · Enter to retry</div>
    `;
    s.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      this.app.audio.init();
      this.app.audio.play('click');
      if (a === 'play') this.showLevelSelect();
      if (a === 'how') this.showHowTo();
      if (a === 'settings') this.showSettings(() => this.showTitle());
    });
    this.root.appendChild(s);
    this.screen = 'title';
  }

  showHowTo() {
    this.clear();
    const s = el('div', 'screen panel-screen');
    s.innerHTML = `
      <div class="panel wide">
        <h2>How to Play</h2>
        <div class="how-grid">
          <div><kbd>↑</kbd> <kbd>↓</kbd> or <kbd>W</kbd> <kbd>S</kbd></div><div>Accelerate / reverse</div>
          <div><kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd></div><div>Lean back / forward (works in mid-air)</div>
          <div><kbd>Space</kbd></div><div>Primary ability (rockets, jump, brake, turbo...)</div>
          <div><kbd>Shift</kbd> / <kbd>Ctrl</kbd></div><div>Secondary ability</div>
          <div><kbd>Z</kbd></div><div>Eject from your vehicle</div>
          <div><kbd>Enter</kbd></div><div>Retry from last checkpoint</div>
          <div><kbd>R</kbd></div><div>Restart level from the beginning</div>
          <div><kbd>Esc</kbd> / <kbd>P</kbd></div><div>Pause</div>
          <div><kbd>M</kbd></div><div>Mute</div>
        </div>
        <p class="note">Reach the golden star to finish a level. Lose limbs, keep going.
        Lose your head... well. After ejecting you can still flail your arms and legs with the arrow keys.</p>
        <button class="btn" data-a="back">BACK</button>
      </div>`;
    s.querySelector('[data-a=back]').onclick = () => this.showTitle();
    this.root.appendChild(s);
  }

  showSettings(back) {
    this.clear();
    const s = el('div', 'screen panel-screen');
    const st = this.settings;
    s.innerHTML = `
      <div class="panel">
        <h2>Settings</h2>
        <label class="row">Blood &amp; gore
          <select data-k="gore">
            <option value="0">Off</option><option value="0.5">Mild</option><option value="1">Normal</option><option value="2">Extra</option>
          </select></label>
        <label class="row">Body toughness
          <select data-k="toughness">
            <option value="0.6">Fragile</option><option value="1">Normal</option><option value="1.6">Tough</option><option value="3">Iron</option>
          </select></label>
        <label class="row">Sound
          <select data-k="sound"><option value="1">On</option><option value="0">Off</option></select></label>
        <button class="btn danger" data-a="reset">Reset progress</button>
        <button class="btn" data-a="back">BACK</button>
      </div>`;
    s.querySelector('[data-k=gore]').value = String(st.gore);
    s.querySelector('[data-k=toughness]').value = String(st.toughness);
    s.querySelector('[data-k=sound]').value = this.app.audio.muted ? '0' : '1';
    s.addEventListener('change', (e) => {
      const k = e.target.dataset.k;
      if (k === 'sound') this.app.audio.setMuted(e.target.value === '0');
      else {
        st[k] = parseFloat(e.target.value);
        store.set('hw_settings', st);
        this.app.applySettings();
      }
    });
    s.querySelector('[data-a=reset]').onclick = () => {
      if (confirm('Erase all best times?')) {
        this.progress = {};
        store.set('hw_progress', {});
      }
    };
    s.querySelector('[data-a=back]').onclick = back;
    this.root.appendChild(s);
  }

  // ---------------------------------------------------------------- level select
  showLevelSelect() {
    this.clear();
    this.hud.classList.add('hidden');
    this.setTouch(false);
    const s = el('div', 'screen select-screen');
    const chars = CHARACTERS.map((c) => `
      <button class="char ${c.id === this.charId ? 'sel' : ''}" data-char="${c.id}">
        <div class="char-icon">${ICONS[c.id] || '?'}</div>
        <div class="char-name">${c.name}</div>
        <div class="char-veh">${c.vehicle}</div>
        <div class="stats">
          ${['speed', 'control', 'toughness'].map((k) => `<div class="stat"><span>${k}</span><i style="--v:${c.stats[k] * 20}%"></i></div>`).join('')}
        </div>
      </button>`).join('');
    const sel = CHARACTERS.find((c) => c.id === this.charId) || CHARACTERS[0];
    const done = LEVELS.filter((l) => this.progress[l.id]?.best != null).length;
    const levels = LEVELS.map((l, i) => {
      const p = this.progress[l.id];
      const medal = medalFor(l, p?.best);
      return `
        <button class="level ${p ? 'done' : ''}" data-level="${i}">
          <div class="lv-num">${i + 1}</div>
          <div class="lv-theme t-${l.theme}"></div>
          <div class="lv-name">${l.name}</div>
          <div class="lv-desc">${l.desc}</div>
          <div class="lv-meta">
            <span class="skulls">${'☠'.repeat(l.difficulty)}<em>${'☠'.repeat(5 - l.difficulty)}</em></span>
            <span class="best">${p?.best != null ? fmt(p.best) : 'not cleared'}</span>
            ${medal ? `<span class="medal ${medal}" title="${medal}"></span>` : ''}
          </div>
        </button>`;
    }).join('');
    s.innerHTML = `
      <div class="select-head">
        <button class="btn small" data-a="back">◀ MENU</button>
        <h2>Choose your victim</h2>
        <div class="progress-pill">${done} / ${LEVELS.length} cleared</div>
      </div>
      <div class="chars">${chars}</div>
      <div class="char-blurb"><b>${sel.name}</b> — ${sel.blurb} <span class="abil"><kbd>Space</kbd> ${sel.primary} · <kbd>Shift</kbd> ${sel.secondary}</span></div>
      <h3>Levels</h3>
      <div class="levels">${levels}</div>`;
    s.addEventListener('click', (e) => {
      const c = e.target.closest('[data-char]');
      if (c) {
        this.charId = c.dataset.char;
        store.set('hw_char', this.charId);
        this.app.audio.play('click');
        const y = s.scrollTop;
        this.showLevelSelect();
        this.root.querySelector('.select-screen').scrollTop = y;
        return;
      }
      const l = e.target.closest('[data-level]');
      if (l) {
        this.app.audio.init();
        this.app.audio.play('click');
        this.app.startLevel(parseInt(l.dataset.level, 10));
        return;
      }
      if (e.target.closest('[data-a=back]')) this.showTitle();
    });
    this.root.appendChild(s);
    this.screen = 'select';
  }

  // ---------------------------------------------------------------- HUD
  buildHud() {
    const h = el('div', 'hud hidden');
    h.innerHTML = `
      <div class="hud-left">
        <div class="hud-level"></div>
        <div class="hud-time">0:00.00</div>
      </div>
      <div class="hud-right">
        <button class="hbtn" data-a="mute" title="Mute (M)">🔊</button>
        <button class="hbtn" data-a="restart" title="Restart (R)">↻</button>
        <button class="hbtn" data-a="pause" title="Pause (Esc)">❚❚</button>
      </div>
      <div class="hud-bottom">
        <span class="hud-hint"></span>
        <span class="hud-speed"></span>
      </div>
      <div class="overlay-slot"></div>`;
    h.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'mute') this.app.toggleMute();
      if (a === 'restart') this.app.restart(false);
      if (a === 'pause') this.app.togglePause();
    });
    this.root.appendChild(h);
    this.hud = h;
    this.toastBox = el('div', 'toasts');
    this.root.appendChild(this.toastBox);
  }

  onLevelStart(game) {
    this.clear();
    this.hud.classList.remove('hidden');
    this.setTouch(true);
    this.hideOverlay();
    const idx = LEVELS.indexOf(game.level);
    this.hud.querySelector('.hud-level').textContent = `${idx + 1}. ${game.level.name}`;
    const d = game.player.def;
    this.hud.querySelector('.hud-hint').innerHTML = `${d.name} · <kbd>Space</kbd> ${d.primary} · <kbd>Shift</kbd> ${d.secondary} · <kbd>Z</kbd> Eject`;
    this.updateMuteIcon();
    this.screen = 'game';
  }

  updateMuteIcon() {
    this.hud.querySelector('[data-a=mute]').textContent = this.app.audio.muted ? '🔇' : '🔊';
  }

  updateHud(game, speed) {
    if (this.screen !== 'game') return;
    if (!this._t || this._t !== Math.floor(game.levelTime * 30)) {
      this._t = Math.floor(game.levelTime * 30);
      this.hud.querySelector('.hud-time').textContent = fmt(game.levelTime);
      this.hud.querySelector('.hud-speed').textContent = `${Math.round(speed * 3.6)} km/h`;
    }
  }

  toast(msg) {
    const t = el('div', 'toast', msg);
    this.toastBox.appendChild(t);
    setTimeout(() => t.classList.add('out'), 1600);
    setTimeout(() => t.remove(), 2200);
    while (this.toastBox.children.length > 3) this.toastBox.firstChild.remove();
  }

  overlay(html, cls = '') {
    const slot = this.hud.querySelector('.overlay-slot');
    slot.innerHTML = '';
    const o = el('div', 'overlay ' + cls, html);
    slot.appendChild(o);
    return o;
  }

  hideOverlay() {
    this.hud.querySelector('.overlay-slot').innerHTML = '';
  }

  onDeath() { /* overlay shown after a short delay via showDeath */ }

  showDeath(reason) {
    const g = this.app.game;
    const hasCp = g.checkpointIndex >= 0;
    const o = this.overlay(`
      <div class="dead-title">YOU DIED</div>
      <div class="dead-reason">${reason || ''}</div>
      <div class="ov-buttons">
        <button class="btn" data-a="retry">${hasCp ? 'CHECKPOINT' : 'RETRY'} <kbd>Enter</kbd></button>
        ${hasCp ? '<button class="btn" data-a="restart">RESTART <kbd>R</kbd></button>' : ''}
        <button class="btn" data-a="menu">LEVELS <kbd>Esc</kbd></button>
      </div>`, 'death');
    o.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'retry') this.app.restart(true);
      if (a === 'restart') this.app.restart(false);
      if (a === 'menu') this.app.toMenu();
    });
  }

  onWin(game) {
    const lv = game.level;
    const t = game.levelTime;
    const prev = this.progress[lv.id]?.best;
    const isBest = prev == null || t < prev;
    if (isBest) {
      this.progress[lv.id] = { best: t, char: game.charId };
      store.set('hw_progress', this.progress);
    }
    const medal = medalFor(lv, t);
    const idx = LEVELS.indexOf(lv);
    const hasNext = idx < LEVELS.length - 1;
    const pl = game.player;
    const lost = Object.values(pl.rider.detached).filter(Boolean).length;
    setTimeout(() => {
      if (this.app.game.state !== 'won') return;
      const o = this.overlay(`
        <div class="win-title">LEVEL COMPLETE!</div>
        <div class="win-stats">
          <div><span>Time</span><b>${fmt(t)}</b></div>
          <div><span>Best</span><b>${fmt(isBest ? t : prev)}</b>${isBest ? '<em>NEW!</em>' : ''}</div>
          <div><span>Par</span><b>${fmt(lv.par)}</b></div>
          <div><span>Limbs lost</span><b>${lost}</b></div>
        </div>
        <div class="medal-big ${medal}"></div>
        <div class="ov-buttons">
          ${hasNext ? '<button class="btn big" data-a="next">NEXT LEVEL <kbd>Enter</kbd></button>' : '<div class="final">You beat every level! 🏆</div>'}
          <button class="btn" data-a="replay">REPLAY <kbd>R</kbd></button>
          <button class="btn" data-a="menu">LEVELS <kbd>Esc</kbd></button>
        </div>`, 'win');
      o.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'next') this.app.nextLevel();
        if (a === 'replay') this.app.restart(false);
        if (a === 'menu') this.app.toMenu();
      });
    }, 900);
  }

  showPause() {
    const o = this.overlay(`
      <div class="pause-title">PAUSED</div>
      <div class="ov-buttons col">
        <button class="btn big" data-a="resume">RESUME</button>
        <button class="btn" data-a="restart">RESTART LEVEL</button>
        <button class="btn" data-a="settings">SETTINGS</button>
        <button class="btn" data-a="menu">LEVEL SELECT</button>
      </div>`, 'pause');
    o.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'resume') this.app.togglePause();
      if (a === 'restart') this.app.restart(false);
      if (a === 'menu') this.app.toMenu();
      if (a === 'settings') this.showInlineSettings();
    });
  }

  showInlineSettings() {
    const st = this.settings;
    const o = this.overlay(`
      <div class="pause-title">SETTINGS</div>
      <label class="row">Blood &amp; gore
        <select data-k="gore"><option value="0">Off</option><option value="0.5">Mild</option><option value="1">Normal</option><option value="2">Extra</option></select></label>
      <label class="row">Body toughness
        <select data-k="toughness"><option value="0.6">Fragile</option><option value="1">Normal</option><option value="1.6">Tough</option><option value="3">Iron</option></select></label>
      <div class="ov-buttons"><button class="btn" data-a="back">BACK</button></div>`, 'pause');
    o.querySelector('[data-k=gore]').value = String(st.gore);
    o.querySelector('[data-k=toughness]').value = String(st.toughness);
    o.addEventListener('change', (e) => {
      st[e.target.dataset.k] = parseFloat(e.target.value);
      store.set('hw_settings', st);
      this.app.applySettings();
    });
    o.querySelector('[data-a=back]').onclick = () => this.showPause();
  }

  // ---------------------------------------------------------------- touch
  buildTouch() {
    const t = el('div', 'touch hidden');
    t.innerHTML = `
      <div class="tpad left">
        <button data-k="left">◀</button><button data-k="right">▶</button>
      </div>
      <div class="tpad right">
        <button data-k="eject" class="sm">Z</button>
        <button data-k="secondary" class="sm">⇧</button>
        <button data-k="primary">★</button>
        <button data-k="down">▼</button><button data-k="up">▲</button>
      </div>`;
    const set = (e, v) => {
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (!k) return;
      e.preventDefault();
      if (k === 'eject') { if (v) this.app.eject(); return; }
      this.app.input.touch[k] = v;
    };
    t.addEventListener('touchstart', (e) => set(e, true), { passive: false });
    t.addEventListener('touchend', (e) => set(e, false), { passive: false });
    t.addEventListener('touchcancel', (e) => set(e, false), { passive: false });
    this.root.appendChild(t);
    this.touch = t;
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  setTouch(on) {
    this.touch.classList.toggle('hidden', !(on && this.isTouch));
  }
}

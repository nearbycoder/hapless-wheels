import { Renderer } from './render.js';
import { Audio } from './audio.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { LEVELS } from './levels.js';
import { CHARACTERS } from './characters.js';

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'primary',
  ShiftLeft: 'secondary', ShiftRight: 'secondary', ControlLeft: 'secondary', ControlRight: 'secondary',
};

const NULL_UI = new Proxy({}, { get: () => () => {} });
const NULL_AUDIO = { play() {}, loop() {}, stopLoops() {}, init() {} };

class Input {
  constructor() {
    this.keys = {};
    this.touch = {};
  }
  get state() {
    const s = {};
    for (const k of ['up', 'down', 'left', 'right', 'primary', 'secondary']) s[k] = !!(this.keys[k] || this.touch[k]);
    return s;
  }
  reset() {
    this.keys = {};
    this.touch = {};
  }
}

class App {
  constructor() {
    this.renderer = new Renderer(document.getElementById('app'));
    this.audio = new Audio();
    this.input = new Input();
    this.ui = new UI(document.getElementById('ui'), this);
    this.game = new Game(this.renderer, NULL_AUDIO, NULL_UI);
    this.levelIndex = 0;
    this.applySettings();
    this.bindKeys();
    this.startDemo();
    this.ui.showTitle();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    window.addEventListener('blur', () => {
      this.input.reset();
      if (!this.demo && this.game.state === 'playing') this.togglePause();
    });
    window.__hw = this; // handy for debugging in the console
  }

  applySettings() {
    const s = this.ui.settings;
    this.game.effects.goreLevel = s.gore;
    this.game.toughness = s.toughness;
  }

  // ---------------------------------------------------------------- flow
  startDemo() {
    this.demo = true;
    this.game.ui = NULL_UI;
    this.game.audio = NULL_AUDIO;
    const lv = [0, 1, 9, 12][Math.floor(Math.random() * 4)];
    const ch = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id;
    this.game.load(LEVELS[lv], ch);
    this.demoTimer = 0;
  }

  startLevel(i) {
    this.demo = false;
    this.levelIndex = i;
    this.game.ui = this.ui;
    this.game.audio = this.audio;
    this.input.reset();
    this.game.load(LEVELS[i], this.ui.charId);
  }

  restart(fromCheckpoint) {
    if (this.demo) return;
    const g = this.game;
    if (fromCheckpoint && g.state !== 'won' && g.checkpointIndex >= 0) {
      g.load(LEVELS[this.levelIndex], this.ui.charId, { checkpoint: g.checkpointIndex, time: g.levelTime });
    } else {
      g.load(LEVELS[this.levelIndex], this.ui.charId);
    }
  }

  nextLevel() {
    if (this.levelIndex < LEVELS.length - 1) this.startLevel(this.levelIndex + 1);
    else this.toMenu();
  }

  toMenu() {
    this.audio.stopLoops();
    this.startDemo();
    this.ui.showLevelSelect();
  }

  togglePause() {
    if (this.demo) return;
    const g = this.game;
    if (g.state === 'playing') {
      g.pause(true);
      this.ui.showPause();
    } else if (g.state === 'paused') {
      g.pause(false);
      this.ui.hideOverlay();
    }
  }

  toggleMute() {
    this.audio.init();
    this.audio.setMuted(!this.audio.muted);
    this.ui.updateMuteIcon();
  }

  eject() {
    if (!this.demo && this.game.state === 'playing' && this.game.player) this.game.player.eject();
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'SELECT') return;
      const k = KEYMAP[e.code];
      if (k) {
        this.input.keys[k] = true;
        e.preventDefault();
      }
      if (e.repeat) return;
      this.audio.init();
      const g = this.game;
      if (this.demo) {
        if (e.code === 'Enter' && this.ui.screen === 'title') this.ui.showLevelSelect();
        if (e.code === 'Escape' && this.ui.screen !== 'title') this.ui.showTitle();
        return;
      }
      switch (e.code) {
        case 'KeyZ': this.eject(); break;
        case 'Enter':
          if (g.state === 'won') this.nextLevel();
          else if (g.state !== 'paused') this.restart(true);
          break;
        case 'KeyR': this.restart(false); break;
        case 'Escape':
        case 'KeyP':
          if (g.state === 'dead' || g.state === 'won') this.toMenu();
          else this.togglePause();
          break;
        case 'KeyM': this.toggleMute(); break;
        default: break;
      }
    });
    window.addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) this.input.keys[k] = false;
    });
  }

  demoInput() {
    const pl = this.game.player;
    const a = pl.chassis.getAngle();
    const t = this.game.time;
    return {
      up: Math.sin(t * 0.7) > -0.6,
      down: false,
      left: a < -0.35,
      right: a > 0.45,
      primary: Math.sin(t * 1.3) > 0.85,
      secondary: false,
    };
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const g = this.game;
    if (this.demo) {
      g.update(dt, this.demoInput());
      if (g.state !== 'playing') {
        this.demoTimer += dt;
        if (this.demoTimer > 3) this.startDemo();
      } else if (g.time > 45) this.startDemo();
    } else {
      g.update(dt, this.input.state);
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}

const app = new App();
if (import.meta.env.DEV) import('./devtools.js').then((m) => m.installDevtools(app));

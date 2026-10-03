// Procedural sound effects with the Web Audio API (no audio files needed).
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.last = {};
    this.loops = {};
    try {
      this.muted = localStorage.getItem('hw_muted') === '1';
    } catch (e) { /* ignore */ }
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('hw_muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  noise(dur, filterType, freq, q, gain, attack = 0.002, when = 0, freqEnd = null) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone(type, f0, f1, dur, gain, when = 0) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(name, intensity = 1, opts = {}) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const minGap = { thud: 0.06, clank: 0.07, splat: 0.05, crunch: 0.08, scream: 0.9, ouch: 0.5, spike: 0.1, glass: 0.08 }[name] || 0;
    const key = name + (opts.key || '');
    if (this.last[key] && now - this.last[key] < minGap) return;
    this.last[key] = now;
    const k = Math.max(0.05, Math.min(1.5, intensity));
    switch (name) {
      case 'thud':
        this.noise(0.18, 'lowpass', 400 + 400 * k, 1, 0.5 * k);
        this.tone('sine', 120, 50, 0.15, 0.4 * k);
        break;
      case 'clank':
        this.noise(0.12, 'bandpass', 1800, 4, 0.35 * k);
        this.tone('square', 420, 300, 0.08, 0.06 * k);
        break;
      case 'splat':
        this.noise(0.25, 'lowpass', 1400, 2, 0.6 * k, 0.003, 0, 300);
        this.noise(0.12, 'bandpass', 600, 6, 0.4 * k, 0.002, 0.03);
        break;
      case 'crunch':
        for (let i = 0; i < 4; i++) this.noise(0.06, 'bandpass', 900 + Math.random() * 2000, 3, 0.45 * k, 0.001, i * 0.025);
        this.noise(0.3, 'lowpass', 700, 1, 0.5 * k, 0.002, 0, 200);
        break;
      case 'spike':
        this.noise(0.2, 'highpass', 2500, 1, 0.3 * k);
        this.play('splat', k);
        break;
      case 'explosion':
        this.noise(1.6, 'lowpass', 2200, 0.7, 1.0, 0.004, 0, 80);
        this.tone('sine', 90, 30, 0.9, 0.8);
        this.noise(0.4, 'bandpass', 3000, 1, 0.4, 0.001);
        break;
      case 'glass':
        for (let i = 0; i < 9; i++) this.tone('sine', 2500 + Math.random() * 4000, 2000 + Math.random() * 2000, 0.25 + Math.random() * 0.3, 0.08 * k, i * 0.018);
        this.noise(0.35, 'highpass', 4000, 1, 0.5 * k);
        break;
      case 'boost':
        this.noise(0.6, 'bandpass', 500, 1.5, 0.5, 0.05, 0, 3000);
        this.tone('sawtooth', 150, 600, 0.5, 0.08);
        break;
      case 'spring':
        this.tone('sine', 200, 900, 0.25, 0.4);
        this.tone('triangle', 300, 1200, 0.3, 0.2, 0.02);
        break;
      case 'harpoon':
        this.noise(0.25, 'bandpass', 1200, 2, 0.5, 0.002, 0, 400);
        this.tone('square', 220, 80, 0.15, 0.15);
        break;
      case 'saw':
        this.tone('sawtooth', 900, 600, 0.3, 0.12);
        this.noise(0.3, 'bandpass', 3500, 3, 0.3);
        break;
      case 'jump':
        this.tone('square', 220, 520, 0.12, 0.08);
        break;
      case 'click':
        this.tone('square', 900, 700, 0.04, 0.08);
        break;
      case 'checkpoint':
        [523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.25, i * 0.08));
        break;
      case 'coin':
        this.tone('square', 988, 988, 0.08, 0.12);
        this.tone('square', 1319, 1319, 0.25, 0.12, 0.08);
        break;
      case 'win':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.3, i * 0.11));
        break;
      case 'die':
        [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.97, 0.3, 0.25, i * 0.16));
        break;
      case 'scream': this.scream(opts.pitch || 1, k); break;
      case 'ouch': this.ouch(opts.pitch || 1, k); break;
      default: break;
    }
  }

  // Formant-filtered sawtooth "AAAAH"
  scream(pitch = 1, k = 1) {
    const c = this.ctx;
    const t = c.currentTime;
    const dur = 0.9 + Math.random() * 0.5;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const base = (260 + Math.random() * 80) * pitch;
    o.frequency.setValueAtTime(base * 1.25, t);
    o.frequency.linearRampToValueAtTime(base * 1.45, t + 0.15);
    o.frequency.exponentialRampToValueAtTime(base * 0.75, t + dur);
    const lfo = c.createOscillator();
    lfo.frequency.value = 6 + Math.random() * 3;
    const lg = c.createGain();
    lg.gain.value = base * 0.06;
    lfo.connect(lg); lg.connect(o.frequency);
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.35 * k, t + 0.04);
    out.gain.setValueAtTime(0.35 * k, t + dur * 0.6);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [f, q, gn] of [[800, 6, 1], [1150, 8, 0.7], [2800, 10, 0.25]]) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * (0.9 + pitch * 0.1);
      bp.Q.value = q;
      const g = c.createGain();
      g.gain.value = gn * 2.2;
      o.connect(bp); bp.connect(g); g.connect(out);
    }
    out.connect(this.master);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  ouch(pitch = 1, k = 1) {
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const base = 220 * pitch;
    o.frequency.setValueAtTime(base * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.28);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.linearRampToValueAtTime(400, t + 0.28);
    bp.Q.value = 5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * k, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(bp); bp.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.35);
  }

  // Continuous loops: engine / jet / wind. value 0..1
  loop(name, value, pitch = 1) {
    if (!this.ctx) return;
    let l = this.loops[name];
    if (!l) {
      const c = this.ctx;
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      if (name === 'jet' || name === 'wind') {
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const f = c.createBiquadFilter();
        f.type = name === 'jet' ? 'bandpass' : 'lowpass';
        f.frequency.value = name === 'jet' ? 900 : 500;
        f.Q.value = name === 'jet' ? 0.8 : 0.5;
        src.connect(f); f.connect(g);
        src.start();
        l = { g, f, src };
      } else {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 60;
        const o2 = c.createOscillator();
        o2.type = 'square';
        o2.frequency.value = 30;
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 500;
        const og = c.createGain();
        og.gain.value = 0.5;
        o.connect(f); o2.connect(og); og.connect(f); f.connect(g);
        o.start(); o2.start();
        l = { g, f, o, o2 };
      }
      this.loops[name] = l;
    }
    const t = this.ctx.currentTime;
    const vol = this.muted ? 0 : value;
    const maxVol = name === 'engine' ? 0.12 : name === 'wind' ? 0.25 : 0.35;
    l.g.gain.setTargetAtTime(vol * maxVol, t, 0.06);
    if (l.o) {
      l.o.frequency.setTargetAtTime(55 * pitch, t, 0.08);
      l.o2.frequency.setTargetAtTime(27.5 * pitch, t, 0.08);
      l.f.frequency.setTargetAtTime(300 + 600 * pitch, t, 0.08);
    } else if (name === 'wind') {
      l.f.frequency.setTargetAtTime(200 + 900 * pitch, t, 0.1);
    }
  }

  stopLoops() {
    for (const k in this.loops) this.loop(k, 0);
  }
}

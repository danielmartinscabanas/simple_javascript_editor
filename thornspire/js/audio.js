// Procedural sound: no assets. Started on first user gesture.
export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.last = {}; }

  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(this.ctx.destination);
    this.reverb = this.makeReverb();
    this.reverb.connect(this.master);
    this.noiseBuf = this.makeNoise();
    this.drone();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  makeNoise() {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  makeReverb() {
    const c = this.ctx.createConvolver();
    const len = this.ctx.sampleRate * 3.2;
    const b = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    c.buffer = b;
    const g = this.ctx.createGain(); g.gain.value = 0.35;
    c.connect(g);
    this.reverbIn = c;
    return g;
  }

  out(dry = 1, wet = 0.4) {
    const g = this.ctx.createGain();
    const d = this.ctx.createGain(); d.gain.value = dry;
    const w = this.ctx.createGain(); w.gain.value = wet;
    g.connect(d); g.connect(w);
    d.connect(this.master); w.connect(this.reverbIn);
    return g;
  }

  drone() {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0.045;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    for (const f of [55, 55.4, 82.4, 110.3]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(lp); o.start();
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 140;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    lp.connect(g); g.connect(this.master); g.connect(this.reverbIn);
    // wind
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.7;
    const wg = ctx.createGain(); wg.gain.value = 0.03;
    const wl = ctx.createOscillator(); wl.frequency.value = 0.11;
    const wlg = ctx.createGain(); wlg.gain.value = 260;
    wl.connect(wlg); wlg.connect(bp.frequency); wl.start();
    n.connect(bp); bp.connect(wg); wg.connect(this.master); n.start();
    this.droneGain = g;
  }

  noise(dur, freq, q, gain, type = 'bandpass', wet = 0.3, sweepTo) {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out(1, wet));
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  tone(freq, dur, gain, type = 'sine', wet = 0.3, slideTo) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out(1, wet));
    o.start(t); o.stop(t + dur + 0.05);
  }

  bell(base = 110, gain = 0.25) {
    for (const [r, a, d] of [[0.5, 1, 6], [1, 0.8, 4.5], [1.183, 0.55, 3.5], [1.506, 0.45, 3], [2, 0.35, 2.4], [2.514, 0.25, 2], [3.011, 0.15, 1.6]]) {
      this.tone(base * r, d, gain * a * 0.5, 'sine', 0.8);
    }
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const gap = { clang: 0.07, thunk: 0.06, zap: 0.06, bones: 0.08, splat: 0.08, rustle: 0.25, deploy: 0.05, death: 0.08 }[name] ?? 0;
    if (gap && now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    switch (name) {
      case 'clang': this.noise(0.12, 2600 + Math.random() * 1200, 6, 0.18, 'bandpass', 0.25); this.tone(900 + Math.random() * 400, 0.18, 0.03, 'square', 0.3); break;
      case 'smash': this.noise(0.4, 300, 1, 0.5, 'lowpass', 0.4, 80); this.tone(70, 0.4, 0.3, 'sine', 0.3, 35); break;
      case 'thunk': this.noise(0.08, 1500, 3, 0.15); break;
      case 'zap': this.tone(600, 0.15, 0.05, 'triangle', 0.5, 200); break;
      case 'splat': this.noise(0.25, 500, 2, 0.25, 'lowpass', 0.3, 120); break;
      case 'bones': this.noise(0.1, 3500, 8, 0.12); this.noise(0.12, 2200, 8, 0.1); break;
      case 'death': this.tone(220, 0.8, 0.04, 'sawtooth', 0.7, 70); break;
      case 'deploy': this.noise(0.5, 400, 1.5, 0.12, 'bandpass', 0.6, 1600); this.tone(98, 0.6, 0.06, 'sine', 0.6); break;
      case 'whoosh': this.noise(0.9, 300, 1, 0.25, 'bandpass', 0.5, 2400); break;
      case 'boom': this.noise(1.6, 900, 0.8, 0.9, 'lowpass', 0.6, 60); this.tone(55, 1.0, 0.5, 'sine', 0.4, 28); break;
      case 'caw': for (let i = 0; i < 3; i++) setTimeout(() => this.tone(900 + Math.random() * 300, 0.18, 0.04, 'sawtooth', 0.5, 500), i * 90); break;
      case 'spike': this.noise(0.15, 1800, 4, 0.12, 'bandpass', 0.3); break;
      case 'spikeHit': this.noise(0.2, 1800, 4, 0.2); this.noise(0.3, 400, 2, 0.2, 'lowpass', 0.3); break;
      case 'rustle': this.noise(0.35, 2500, 0.8, 0.05, 'highpass', 0.2); break;
      case 'toll': this.bell(98, 0.3); break;
      case 'chime': this.bell(392, 0.12); break;
      case 'collapse': this.noise(2.4, 600, 0.7, 0.9, 'lowpass', 0.7, 50); this.tone(41, 2, 0.4, 'sine', 0.6, 30); this.bell(73, 0.25); break;
      case 'card': this.noise(0.06, 3000, 2, 0.05, 'highpass', 0.1); break;
      case 'deny': this.tone(140, 0.2, 0.08, 'square', 0.2, 110); break;
      case 'victory': this.bell(130.8, 0.3); setTimeout(() => this.bell(196, 0.25), 500); setTimeout(() => this.bell(261.6, 0.25), 1000); break;
      case 'defeat': this.bell(82.4, 0.35); setTimeout(() => this.bell(61.7, 0.35), 900); break;
    }
  }
}

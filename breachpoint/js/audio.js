// Sample-based audio. Every clip is CC0 (Kenney, Still North Media, OpenGameArt authors); see assets/audio.
const BASE = './assets/audio/';
// name -> [file(s), volume, rate jitter, min gap seconds]
const BANK = {
  rifle: [['shot_single'], 0.32, 0.12, 0.05],
  smg: [['shot_short'], 0.26, 0.15, 0.03],
  sniper: [['shot_single'], 0.6, 0.0, 0.05, 0.62],
  shotgun: [['shot_single', 'explosionCrunch_002'], 0.42, 0.08, 0.06, 0.75],
  cannon: [['explosionCrunch_000'], 0.5, 0.1, 0.08],
  laser: [['laserSmall_000', 'laserSmall_002'], 0.22, 0.12, 0.04],
  bite: [['impactGeneric_light_002'], 0.4, 0.2, 0.06],
  plant: [['computerNoise_000'], 0.4, 0, 0.3],
  hit: [['impactGeneric_light_002'], 0.18, 0.25, 0.05],
  hitMetal: [['impactMetal_light_001', 'impactMetal_light_003'], 0.22, 0.2, 0.05],
  shellHit: [['impactMetal_heavy_000'], 0.45, 0.1, 0.08],
  boom: [['explosionCrunch_000', 'explosionCrunch_002'], 0.7, 0.1, 0.06],
  collapse: [['lowFrequency_explosion_000'], 0.95, 0, 0.3],
  droneDown: [['explosionCrunch_002'], 0.45, 0.2, 0.08],
  smoke: [['forceField_000'], 0.5, 0, 0.2],
  fire: [['thrusterFire_000'], 0.45, 0, 0.3],
  flash: [['explosionCrunch_002'], 0.6, 0.3, 0.2, 1.6],
  throw: [['footstep_concrete_001'], 0.35, 0.2, 0.1, 1.4],
  deploy: [['footstep_concrete_001'], 0.4, 0.2, 0.05],
  death: [['impactGeneric_light_002'], 0.3, 0.3, 0.08, 0.6],
  alarm: [['jingles_HIT15'], 0.5, 0, 1],
  capture: [['jingles_STEEL00'], 0.5, 0, 1],
  card: [['click1'], 0.35, 0.1, 0.03],
  deny: [['switch2'], 0.4, 0, 0.1],
  toll: [['vo_ready'], 0.8, 0, 1],
  victory: [['vo_you_win'], 0.9, 0, 1],
  defeat: [['vo_you_lose'], 0.9, 0, 1],
  vo_fight: [['vo_fight'], 0.9, 0, 1],
  vo_prepare: [['vo_prepare_yourself'], 0.9, 0, 1],
  vo_sudden_death: [['vo_sudden_death'], 0.9, 0, 1],
  vo_final_round: [['vo_final_round'], 0.9, 0, 1],
  vo_winner: [['vo_winner'], 0.9, 0, 1],
  win_jingle: [['jingles_STEEL07'], 0.6, 0, 1],
};

export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.last = {}; this.buf = {}; this.music = {}; this.musicOn = true; }

  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const files = new Set(Object.values(BANK).flatMap((b) => b[0]));
    for (const f of files) this.load(f);
    for (const [k, f] of [['menu', 'music_menu'], ['battle', 'music_battle']]) {
      const a = new window.Audio(`${BASE}${f}.ogg`);
      a.loop = true; a.volume = 0; a.preload = 'auto';
      this.music[k] = a;
    }
    if (this.wantMusic) this.playMusic(this.wantMusic);
  }

  async load(f) {
    try {
      const r = await fetch(`${BASE}${f}.ogg`);
      const data = await r.arrayBuffer();
      this.buf[f] = await this.ctx.decodeAudioData(data);
    } catch { /* missing clip: play() stays silent for it */ }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
    for (const a of Object.values(this.music)) a.muted = m;
  }

  playMusic(which) {
    this.wantMusic = which;
    if (!this.ctx) return;
    for (const [k, a] of Object.entries(this.music)) {
      const target = k === which && this.musicOn ? (k === 'battle' ? 0.32 : 0.45) : 0;
      if (target > 0 && a.paused) { a.currentTime = 0; a.play().catch(() => {}); }
      this.fade(a, target);
    }
  }

  fade(a, target) {
    clearInterval(a._fade);
    a._fade = setInterval(() => {
      const v = a.volume + Math.sign(target - a.volume) * 0.04;
      a.volume = Math.max(0, Math.min(1, Math.abs(target - v) < 0.05 ? target : v));
      if (a.volume === target) { clearInterval(a._fade); if (target === 0) a.pause(); }
    }, 60);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    const b = BANK[name];
    if (!b) return;
    const [files, vol, jitter, gap, rate = 1] = b;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    files.forEach((f, i) => {
      const buf = this.buf[f];
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 2 * jitter) * (i ? 0.8 : 1);
      const g = this.ctx.createGain();
      g.gain.value = vol * (i ? 0.6 : 1);
      src.connect(g); g.connect(this.master);
      src.start(now);
    });
  }
}

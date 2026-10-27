// Sample-based audio. Every clip is a CC0 recording (Free Firearm Sound Library, OpenGameArt authors,
// Kenney, Still North Media); see assets/audio/CREDITS.md. Nothing here is synthesized.
const BASE = './assets/audio/';
// name -> { f: alternatives (one picked at random), layer: extra clip played on top, v: volume,
//           j: rate jitter, gap: min seconds between plays, r: base rate }
const BANK = {
  rifle: { f: ['ak47', 'ak47_b'], v: 0.42, j: 0.06, gap: 0.05 },
  smg: { f: ['smg', 'smg_b'], v: 0.32, j: 0.08, gap: 0.035 },
  sniper: { f: ['ak47'], layer: 'magnum', v: 0.7, j: 0.02, gap: 0.05, r: 0.72 },
  shotgun: { f: ['pistol1911'], layer: 'debris', v: 0.6, j: 0.05, gap: 0.06, r: 0.68 },
  cannon: { f: ['rocket'], v: 0.55, j: 0.06, gap: 0.08 },
  laser: { f: ['smg'], v: 0.22, j: 0.06, gap: 0.04, r: 1.35 },
  recruit: { f: ['ak47_b', 'smg_b'], v: 0.18, j: 0.1, gap: 0.07, r: 1.1 },
  levelup: { f: ['levelup'], v: 0.5, j: 0.04, gap: 0.25 },
  rankup: { f: ['rankup'], layer: 'levelup', v: 0.6, j: 0, gap: 0.5 },
  wave: { f: ['radio'], v: 0.35, j: 0, gap: 2 },
  knife: { f: ['knife_swish'], layer: 'knife_hit', v: 0.5, j: 0.12, gap: 0.08 },
  baton: { f: ['whack'], v: 0.45, j: 0.12, gap: 0.1 },
  pistol: { f: ['pistol1911'], v: 0.3, j: 0.08, gap: 0.06, r: 1.15 },
  launcher: { f: ['pistol1911'], layer: 'swish', v: 0.45, j: 0.06, gap: 0.1, r: 0.5 },
  rocketfire: { f: ['rocket'], v: 0.55, j: 0.06, gap: 0.12, r: 1.2 },
  mortar: { f: ['mortar'], v: 0.6, j: 0.06, gap: 0.2 },
  emp: { f: ['static'], layer: 'gas_hiss', v: 0.6, j: 0.05, gap: 0.2 },
  adrenaline: { f: ['heartbeat'], layer: 'reload', v: 0.6, j: 0.03, gap: 0.3 },
  jet: { f: ['jet'], v: 0.7, j: 0.05, gap: 0.3 },
  heal: { f: ['medkit'], v: 0.3, j: 0.08, gap: 0.6 },
  repair: { f: ['ratchet'], v: 0.32, j: 0.08, gap: 0.8 },
  shout: { f: ['shout_hey', 'shout_kill'], v: 0.5, j: 0.03, gap: 2 },
  barricade: { f: ['debris'], layer: 'metal_hit', v: 0.5, j: 0.06, gap: 0.3 },
  sentry: { f: ['smg_b', 'smg'], v: 0.26, j: 0.08, gap: 0.035, r: 1.12 },
  bite: { f: ['bark1', 'bark2'], v: 0.45, j: 0.08, gap: 0.25 },
  plant: { f: ['reload'], layer: 'dryclick', v: 0.6, j: 0, gap: 0.3 },
  hit: { f: ['hit_body'], v: 0.2, j: 0.2, gap: 0.06 },
  hitMetal: { f: ['ricochet', 'metal_hit'], v: 0.22, j: 0.15, gap: 0.06 },
  shellHit: { f: ['expl_small'], v: 0.45, j: 0.1, gap: 0.1 },
  boom: { f: ['expl_big', 'expl_chunky'], v: 0.75, j: 0.06, gap: 0.08 },
  collapse: { f: ['expl_far'], layer: 'debris', v: 1, j: 0, gap: 0.4 },
  droneDown: { f: ['expl_metal'], v: 0.5, j: 0.1, gap: 0.1 },
  smoke: { f: ['gas_hiss'], v: 0.55, j: 0.05, gap: 0.2 },
  fire: { f: ['flare'], layer: 'glass', v: 0.55, j: 0.05, gap: 0.3 },
  flash: { f: ['expl_small'], layer: 'glass', v: 0.65, j: 0.05, gap: 0.2, r: 1.3 },
  throw: { f: ['swish'], v: 0.4, j: 0.15, gap: 0.1 },
  deploy: { f: ['radio'], layer: 'step1', v: 0.4, j: 0.05, gap: 0.08 },
  step: { f: ['step1', 'step2', 'step3', 'step4'], v: 0.13, j: 0.12, gap: 0.09 },
  mechStep: { f: ['mech_step1', 'mech_step2'], layer: 'servo', v: 0.35, j: 0.06, gap: 0.3 },
  death: { f: ['pain1', 'pain2', 'pain3', 'pain4', 'hurt1', 'hurt2'], v: 0.32, j: 0.06, gap: 0.12 },
  cough: { f: ['cough'], v: 0.3, j: 0.1, gap: 1.5 },
  charge: { f: ['yell1', 'yell2'], v: 0.3, j: 0.05, gap: 2.5 },
  alarm: { f: ['siren'], v: 0.45, j: 0, gap: 4 },
  capture: { f: ['crate'], layer: 'radio', v: 0.6, j: 0, gap: 1 },
  card: { f: ['ui_hover'], v: 0.3, j: 0.05, gap: 0.03 },
  confirm: { f: ['ui_confirm'], v: 0.35, j: 0, gap: 0.05 },
  tick: { f: ['ui_hover'], v: 0.45, j: 0, gap: 0.3, r: 1.5 },
  go: { f: ['ui_confirm'], layer: 'radio', v: 0.6, j: 0, gap: 0.3 },
  streak: { f: ['ui_confirm'], v: 0.4, j: 0, gap: 0.2, r: 1.25 },
  deny: { f: ['ui_error'], v: 0.4, j: 0, gap: 0.1 },
  toll: { f: ['vo_ready'], v: 0.8, j: 0, gap: 1 },
  victory: { f: ['vo_you_win'], v: 0.9, j: 0, gap: 1 },
  defeat: { f: ['vo_you_lose'], v: 0.9, j: 0, gap: 1 },
  vo_fight: { f: ['vo_fight'], v: 0.9, j: 0, gap: 1 },
  vo_prepare: { f: ['vo_prepare_yourself'], v: 0.9, j: 0, gap: 1 },
  vo_sudden_death: { f: ['vo_sudden_death'], v: 0.9, j: 0, gap: 1 },
  vo_final_round: { f: ['vo_final_round'], v: 0.9, j: 0, gap: 1 },
  vo_winner: { f: ['vo_winner'], v: 0.9, j: 0, gap: 1 },
  fanfare: { f: ['fanfare'], v: 0.85, j: 0, gap: 1 },
};
// recorded loops whose level follows the battle: wind bed, drone rotors, burning molotovs
const LOOPS = { wind: 'wind_loop', rotor: 'heli_loop', fire: 'fire_loop' };

export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.last = {}; this.buf = {}; this.music = {}; this.musicOn = true; this.loops = {}; }

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
    const files = new Set(Object.values(BANK).flatMap((b) => [...b.f, ...(b.layer ? [b.layer] : [])]));
    for (const f of files) this.load(f);
    for (const [k, f] of Object.entries(LOOPS)) this.load(f).then(() => this.startLoop(k, f));
    for (const [k, f] of [['menu', 'music_menu'], ['battle', 'music_battle'], ['victory', 'music_victory'], ['defeat', 'music_defeat']]) {
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

  startLoop(k, f) {
    const buf = this.buf[f];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(this.master);
    src.start(this.ctx.currentTime + Math.random() * 0.1, Math.random() * buf.duration);
    this.loops[k] = g;
  }

  // levels 0..1 per loop name; ramps smoothly
  setLoops(levels) {
    if (!this.ctx) return;
    const peak = { wind: 0.22, rotor: 0.16, fire: 0.4 };
    for (const [k, g] of Object.entries(this.loops)) {
      g.gain.setTargetAtTime((levels[k] || 0) * peak[k], this.ctx.currentTime, 0.4);
    }
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
      const target = k === which && this.musicOn ? (k === 'battle' ? 0.28 : k === 'victory' ? 0.55 : 0.45) : 0;
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

  clip(f, vol, rate, when) {
    const buf = this.buf[f];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(this.master);
    src.start(when);
  }

  play(name, gain = 1) {
    if (!this.ctx || this.muted) return;
    const b = BANK[name];
    if (!b) return;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || 0) < b.gap) return;
    this.last[name] = now;
    const rate = (b.r || 1) * (1 + (Math.random() - 0.5) * 2 * b.j);
    this.clip(b.f[Math.floor(Math.random() * b.f.length)], b.v * gain, rate, now);
    if (b.layer) this.clip(b.layer, b.v * gain * 0.55, rate, now);
  }
}

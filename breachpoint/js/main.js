import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  ARENA, CARDS, DEFAULT_DECK, RIVAL_NAMES, RIVAL_HOUSES, rankFor, EMOTES, FACTION, MATCH, SOULS, setSides,
} from './config.js';
import { NavGrid } from './nav.js';
import { World } from './world.js';
import { Sim } from './sim.js';
import { Bot, rivalDeck } from './bot.js';
import { Audio } from './audio.js';
import { buildModel, loadAssets, boundsOf } from './models.js';

const $ = (id) => document.getElementById(id);
const TROPHY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v3h3v3a5 5 0 0 1-5 5 6 6 0 0 1-3 2.6V19h3v2H8v-2h3v-2.4A6 6 0 0 1 8 14a5 5 0 0 1-5-5V6h3zm-1 5v1a3 3 0 0 0 2 2.8V8zm14 0h-2v3.8A3 3 0 0 0 19 9z"/></svg>';

// ---------- persistence (best-effort) ----------
const KEY = 'breachpoint.v1';
function load() {
  const d = { side: 'ct', name: 'Operator', trophies: 0, deck: DEFAULT_DECK.slice(), muted: false, quality: 'high', models: 'rigged', wins: 0, losses: 0 };
  try { Object.assign(d, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage unavailable */ }
  if (!Array.isArray(d.deck) || d.deck.length !== 8 || d.deck.some((k) => !CARDS[k])) d.deck = DEFAULT_DECK.slice();
  return d;
}
const store = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore */ } }

// ---------- renderer ----------
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
let world = null;
const audio = new Audio();
audio.muted = store.muted;

let composer, bloom;
function buildComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.45, 0.4, 0.95);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
buildComposer();

function applyQuality() {
  const high = store.quality === 'high';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1));
  if (renderer.shadowMap.enabled !== high) {
    renderer.shadowMap.enabled = high;
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  }
  $('btn-quality').textContent = `Quality: ${high ? 'High' : 'Low'}`;
  resize();
}

// ---------- camera framing ----------
let view = { mode: 'menu', lookZ: 0.6, dist: 34 };
const BATTLE_DIR = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(63)), Math.cos(THREE.MathUtils.degToRad(63)));
function fitBattleCamera() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 46 : 38;
  camera.updateProjectionMatrix();
  const bottomPx = ($('bottom')?.offsetHeight || 170) + 4;
  const topPx = 64;
  const yLow = -1 + (2 * bottomPx) / h, yHigh = 1 - (2 * topPx) / h;
  const pts = [[-ARENA.halfW - 0.3, 0, ARENA.halfL + 0.3], [ARENA.halfW + 0.3, 0, ARENA.halfL + 0.3],
    [-ARENA.halfW - 0.3, 0, -ARENA.halfL - 0.3], [ARENA.halfW + 0.3, 0, -ARENA.halfL - 0.3], [0, 3.6, -13.2]].map((p) => new THREE.Vector3(...p));
  let dist = 34, lookZ = 1;
  const v = new THREE.Vector3();
  for (let i = 0; i < 60; i++) {
    camera.position.set(0, 0, lookZ).addScaledVector(BATTLE_DIR, dist);
    camera.lookAt(0, 0, lookZ);
    camera.updateMatrixWorld();
    let minX = 1, maxX = -1, minY = 1, maxY = -1;
    for (const p of pts) { v.copy(p).project(camera); minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
    const sy = (maxY - minY) / (yHigh - yLow), sx = (maxX - minX) / 2;
    const s = Math.max(sx, sy);
    dist *= 1 + (s - 1) * 0.5;
    const off = (minY + maxY) / 2 - (yLow + yHigh) / 2;
    lookZ -= off * dist * 0.25;
  }
  view.dist = dist; view.lookZ = lookZ;
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  composer.setPixelRatio?.(renderer.getPixelRatio());
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (view.mode === 'battle') fitBattleCamera();
  if (world) for (const p of [world.fx, world.smoke]) p.uniforms.uScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}
window.addEventListener('resize', resize);

// ---------- card art (rendered once from the 3D models) ----------
const thumbs = {};
function renderThumbs() {
  const W = 200, H = 250;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(W, H); r.setPixelRatio(1);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.9;
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xdde8ff, 0x6a5030, 2.8));
  const key = new THREE.DirectionalLight(0xc8d4ff, 2.6); key.position.set(-2, 3, 4); s.add(key);
  const rim = new THREE.DirectionalLight(0xff5a30, 3.2); rim.position.set(3, 1.5, -3); s.add(rim);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
  for (const [k, c] of Object.entries(CARDS)) {
    const g = new THREE.Group();
    const n = Math.min(c.count || 1, 3);
    for (let i = 0; i < n; i++) {
      const m = buildModel(c.model, 0);
      m.root.position.set((i - (n - 1) / 2) * 0.55, 0, -Math.abs(i - (n - 1) / 2) * 0.4);
      if (m.rig.flyer) m.root.position.y = 0.4;
      m.root.rotation.y = 0.45;
      g.add(m.root);
    }
    s.add(g);
    const box = boundsOf(g);
    const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const d = Math.max(size.y * 1.05, size.x * 1.25) / (2 * Math.tan(THREE.MathUtils.degToRad(15)));
    cam.position.set(ctr.x + d * 0.25, ctr.y + size.y * 0.12, ctr.z + d);
    cam.lookAt(ctr.x, ctr.y - size.y * 0.04, ctr.z);
    r.render(s, cam);
    thumbs[k] = r.domElement.toDataURL('image/png');
    s.remove(g);
  }
  r.dispose(); r.forceContextLoss?.();
}

// Hand-painted card art for Hellfire: a falling meteor of brimstone with a flaming tail.
function paintFireball(W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cx = W * 0.42, cy = H * 0.6, R = W * 0.2;
  const ang = Math.atan2(-1, 0.75); // tail points up and to the right
  const tx = Math.cos(ang), ty = Math.sin(ang), nx = -ty, ny = tx;
  // smoke behind the tail
  for (let i = 0; i < 14; i++) {
    const d = R * (1.2 + i * 0.35), w = R * (0.5 + i * 0.07);
    const x = cx + tx * d + nx * (rnd() - 0.5) * w, y = cy + ty * d + ny * (rnd() - 0.5) * w;
    const rg = g.createRadialGradient(x, y, 0, x, y, w);
    rg.addColorStop(0, `rgba(20,12,12,${0.35 - i * 0.02})`); rg.addColorStop(1, 'rgba(20,12,12,0)');
    g.fillStyle = rg; g.fillRect(x - w, y - w, w * 2, w * 2);
  }
  g.globalCompositeOperation = 'lighter';
  // flame tongues streaming into the tail
  const tongue = (len, width, off, col) => {
    const bx = cx + nx * off, by = cy + ny * off;
    const ex = bx + tx * len, ey = by + ty * len;
    const grad = g.createLinearGradient(bx, by, ex, ey);
    grad.addColorStop(0, col); grad.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(bx + nx * width, by + ny * width);
    g.quadraticCurveTo(bx + tx * len * 0.5 + nx * width * 1.2, by + ty * len * 0.5 + ny * width * 1.2, ex + nx * width * 0.1, ey + ny * width * 0.1);
    g.quadraticCurveTo(bx + tx * len * 0.5 - nx * width * 0.6, by + ty * len * 0.5 - ny * width * 0.6, bx - nx * width, by - ny * width);
    g.closePath(); g.fill();
  };
  for (let i = 0; i < 9; i++) tongue(R * (2.2 + rnd() * 2.2), R * (0.35 + rnd() * 0.5), (rnd() - 0.5) * R * 1.4, `rgba(255,${80 + rnd() * 70 | 0},10,0.55)`);
  for (let i = 0; i < 5; i++) tongue(R * (1.4 + rnd() * 1.2), R * (0.25 + rnd() * 0.3), (rnd() - 0.5) * R * 0.8, 'rgba(255,210,90,0.6)');
  // outer glow + fireball body
  let rg = g.createRadialGradient(cx, cy, 0, cx, cy, R * 2.4);
  rg.addColorStop(0, 'rgba(255,120,20,0.55)'); rg.addColorStop(1, 'rgba(255,40,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  rg = g.createRadialGradient(cx - R * 0.2, cy + R * 0.15, R * 0.05, cx, cy, R * 1.1);
  rg.addColorStop(0, '#fffbe8'); rg.addColorStop(0.25, '#ffe27a'); rg.addColorStop(0.55, '#ff8a1c'); rg.addColorStop(0.85, '#c42a06'); rg.addColorStop(1, 'rgba(120,10,0,0)');
  g.fillStyle = rg;
  g.beginPath(); g.arc(cx, cy, R * 1.1, 0, Math.PI * 2); g.fill();
  // brimstone crust with glowing cracks
  g.globalCompositeOperation = 'source-over';
  g.save();
  g.beginPath(); g.arc(cx, cy, R * 0.82, 0, Math.PI * 2); g.clip();
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.1 + rnd() * 0.9), d = R * (0.55 + rnd() * 0.25);
    const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d, pr = R * (0.12 + rnd() * 0.12);
    g.fillStyle = `rgba(150,36,8,${0.35 + rnd() * 0.2})`;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const aa = (k / 6) * Math.PI * 2 + rnd() * 0.5, rr = pr * (0.7 + rnd() * 0.4); g.lineTo(px + Math.cos(aa) * rr, py + Math.sin(aa) * rr); }
    g.closePath(); g.fill();
  }
  g.restore();
  // embers
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    const d = R * (0.8 + rnd() * 4), sp = (rnd() - 0.5) * R * 2.2;
    const x = cx + tx * d + nx * sp, y = cy + ty * d + ny * sp, s = 0.8 + rnd() * 2.2;
    g.fillStyle = `rgba(255,${150 + rnd() * 100 | 0},60,${0.5 + rnd() * 0.5})`;
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
  }
  return c.toDataURL('image/png');
}

function cardEl(key, extra = '') {
  const c = CARDS[key];
  const el = document.createElement('div');
  el.className = `card ${extra}`;
  el.style.backgroundImage = `radial-gradient(ellipse at 50% 40%, rgba(60,40,50,0.0), rgba(0,0,0,0.35)), url(${thumbs[key]}), radial-gradient(ellipse at 50% 30%, #b08a55, #3a2a18 80%)`;
  el.innerHTML = `<div class="cost"><b>${c.cost}</b></div>${c.type !== 'unit' ? `<span class="tp">${c.type}</span>` : ''}<div class="nm">${c.name}</div>`;
  el.dataset.key = key;
  return el;
}

// ---------- screens ----------
const screens = ['menu', 'deck', 'guide', 'seek', 'hud', 'result', 'yield'];
function show(...ids) { for (const s of screens) $(s).hidden = !ids.includes(s); }

function refreshMenu() {
  $('pname').value = store.name;
  $('ptroph').innerHTML = `${TROPHY_SVG}${store.trophies}`;
  $('prank').textContent = rankFor(store.trophies);
  $('precord').textContent = `${store.wins}W · ${store.losses}L`;
  $('btn-sound').textContent = `Sound: ${store.muted ? 'Off' : 'On'}`;
  $('btn-side').textContent = `Side: ${store.side === 'ct' ? 'Counter-Terrorists' : 'Insurgents'}`;
  document.documentElement.dataset.side = store.side;
}

$('pname').addEventListener('input', (e) => { store.name = e.target.value.trim().slice(0, 18) || 'Operator'; save(); });
window.addEventListener('pointerdown', () => { const first = !audio.ctx; audio.start(); if (first) audio.playMusic(view.mode === 'battle' ? 'battle' : 'menu'); }, { capture: true });
$('btn-sound').onclick = () => { audio.start(); store.muted = !store.muted; audio.setMuted(store.muted); save(); refreshMenu(); };
$('btn-side').onclick = () => {
  audio.start(); audio.play('card');
  store.side = store.side === 'ct' ? 't' : 'ct'; save();
  setSides(store.side); renderThumbs(); refreshMenu();
};
$('btn-quality').onclick = () => { store.quality = store.quality === 'high' ? 'low' : 'high'; save(); applyQuality(); };
$('btn-guide').onclick = () => { audio.start(); show('guide'); };
$('guide-done').onclick = () => show('menu');
$('btn-deck').onclick = () => { audio.start(); buildGrimoire(); show('deck'); };
$('deck-done').onclick = () => { if (store.deck.length === 8) { save(); show('menu'); } };

function buildGrimoire() {
  const g = $('grimoire');
  g.innerHTML = '';
  for (const k of Object.keys(CARDS)) {
    const el = cardEl(k, store.deck.includes(k) ? 'in' : '');
    el.tabIndex = 0;
    el.onclick = () => {
      const i = store.deck.indexOf(k);
      if (i >= 0) store.deck.splice(i, 1);
      else if (store.deck.length < 8) store.deck.push(k);
      else { audio.play('deny'); }
      el.classList.toggle('in', store.deck.includes(k));
      $('lore').textContent = `${CARDS[k].name} — ${CARDS[k].lore}`;
      audio.play('card');
      deckInfo();
    };
    el.onmouseenter = () => { $('lore').textContent = `${CARDS[k].name} — ${CARDS[k].lore}`; };
    g.appendChild(el);
  }
  deckInfo();
}
function deckInfo() {
  const n = store.deck.length;
  const avg = n ? store.deck.reduce((a, k) => a + CARDS[k].cost, 0) / n : 0;
  $('deckinfo').textContent = `${n} / 8 bound · average cost ${avg.toFixed(1)}`;
  $('deck-done').disabled = n !== 8;
  $('deck-done').style.opacity = n === 8 ? 1 : 0.4;
}

// ---------- matchmaking (emulated) ----------
let seekTimer = null, rival = null;
$('btn-battle').onclick = () => startSeek();
$('r-again').onclick = () => startSeek();
$('r-menu').onclick = () => { endBattleScene(); toMenu(); };
$('seek-cancel').onclick = () => { clearInterval(seekTimer); seekTimer = null; toMenu(); };

function startSeek() {
  audio.start();
  endBattleScene();
  show('seek');
  $('seek-wait').hidden = false; $('seek-vs').hidden = true;
  const t0 = performance.now();
  const wait = 2.2 + Math.random() * 3.2;
  const pool = 40 + Math.floor(Math.random() * 400);
  clearInterval(seekTimer);
  seekTimer = setInterval(() => {
    const s = (performance.now() - t0) / 1000;
    $('seek-meta').textContent = `Searching… ${Math.floor(s)}s · ${pool + Math.floor(s * 7)} players in queue`;
    if (s >= wait) { clearInterval(seekTimer); seekTimer = null; revealRival(); }
  }, 200);
}

function revealRival() {
  const tro = Math.max(0, store.trophies + Math.round((Math.random() - 0.45) * 80));
  rival = {
    name: RIVAL_NAMES[Math.floor(Math.random() * RIVAL_NAMES.length)],
    house: RIVAL_HOUSES[Math.floor(Math.random() * RIVAL_HOUSES.length)],
    trophies: tro,
    skill: Math.min(0.95, 0.3 + tro / 1800 + Math.random() * 0.1),
    ping: 30 + Math.random() * 40,
  };
  $('seek-wait').hidden = true; $('seek-vs').hidden = false;
  $('vs-me').textContent = store.name;
  $('vs-myside').textContent = FACTION[0].name;
  $('vs-house').dataset.side = FACTION[1].name;
  $('vs-met').innerHTML = `${TROPHY_SVG}${store.trophies}`;
  $('vs-them').textContent = rival.name;
  $('vs-house').textContent = rival.house;
  $('vs-themt').innerHTML = `${TROPHY_SVG}${rival.trophies}`;
  audio.play('toll');
  setTimeout(startBattle, 2600);
}

// ---------- battle ----------
let sim = null, bot = null, nav = null;
let selected = -1, dragging = false, ghost = null, ghostKey = null, pointer = { x: 0, y: 0, over: false };
let handEls = [], towerLabels = [], pingT = 0;
// round intro (countdown + camera sweep), match stats and combat feedback state
let intro = 0, introStep = -1, stats = null, streak = { n: 0, t: 0 }, alertT = 0, uchipT = 0, lastTick = -1, lastSouls = 0;
let lastHand = [];

function startBattle() {
  endBattleScene();
  nav = new NavGrid();
  sim = new Sim({
    scene, world, nav, audio, camera,
    decks: [store.deck.slice(), rivalDeck()],
    hooks: {
      onMessage: (text, team) => banner(text, team),
      onKill: (k, v) => { killFeed(k, v); onKill(k, v); },
      onPlay: (team, key) => { if (team === 0) { stats.deployed++; stats.spent += CARDS[key].cost; } },
      onTowerHit: (t, amount, src) => onTowerHit(t, amount, src),
      onEnd: (r) => setTimeout(() => endBattle(r), 1800),
      onTowerDown: (t) => {
        if (selected >= 0) paintZone();
        if (t.team === 0 && Math.random() < 0.5) setTimeout(() => bot?.emote('Push now!'), 900);
        if (t.team === 1 && Math.random() < 0.4) setTimeout(() => bot?.emote('Nice shot!'), 1200);
        crowns(true);
        slam(t.team === 1 ? (t.sub === 'keep' ? 'Command Post down' : 'Outpost destroyed') : (t.sub === 'keep' ? 'Command Post lost' : 'Outpost lost'),
          t.team === 1 ? '+1 crown' : 'Hold the line', t.team === 1 ? 0 : 1);
      },
    },
  });
  stats = { kills: 0, lost: 0, deployed: 0, spent: 0, towerDmg: 0, byCard: {} };
  streak = { n: 0, t: 0 }; lastTick = -1;
  bot = new Bot(sim, rival.skill, { onEmote: (t) => bubble(t, 1) });
  view.mode = 'battle';
  show('hud');
  $('h-rival').textContent = rival.name;
  $('h-house').textContent = `${rival.house} · ${rival.trophies}`;
  buildHand(true);
  buildSoulsBar();
  buildTowerLabels();
  $('h-tag0').textContent = FACTION[0].short; $('h-tag1').textContent = FACTION[1].short;
  crowns();
  resize();
  selected = -1;
  intro = 3.6; introStep = -1;
  audio.play('vo_prepare');
  clearTimeout(resultMusicT); audio.playMusic('battle');
}

function endBattleScene() {
  if (sim) { sim.dispose(); sim = null; bot = null; }
  clearGhost();
  world.zone.visible = false;
  $('labels').innerHTML = '';
  $('killfeed').innerHTML = '';
  $('pops').innerHTML = '';
  $('count').innerHTML = '';
  intro = 0;
  towerLabels = [];
  document.querySelectorAll('.bubble').forEach((b) => b.remove());
}

let resultMusicT = 0;
function toMenu() { clearTimeout(resultMusicT); view.mode = 'menu'; refreshMenu(); show('menu'); audio.playMusic('menu'); audio.setLoops({}); }

function endBattle(r) {
  if (!sim) return;
  const win = r.winner === 0, draw = r.winner === null;
  let delta = 0;
  if (win) delta = 26 + Math.floor(Math.random() * 7) + Math.max(0, Math.round((rival.trophies - store.trophies) / 20));
  else if (!draw) delta = -Math.min(store.trophies, 18 + Math.floor(Math.random() * 8));
  store.trophies += delta;
  if (win) store.wins++; else if (!draw) store.losses++;
  save();
  clearGhost(); selected = -1;
  $('r-verdict').textContent = draw ? 'Draw' : win ? 'Victory' : 'Defeat';
  $('r-verdict').className = `verdict ${win ? 'win' : draw ? '' : 'loss'}`;
  $('r-score').innerHTML = `<span style="color:var(--soul)">${r.crowns[0]}</span> — <span style="color:var(--blood)">${r.crowns[1]}</span>`;
  $('r-delta').className = `delta ${delta >= 0 ? 'up' : 'down'}`;
  $('r-delta').innerHTML = `${TROPHY_SVG}${delta >= 0 ? '+' : ''}${delta} · ${store.trophies} · ${rankFor(store.trophies)}`;
  const ep = win
    ? ['Objective secured. The rival command post is rubble.', 'Clean sweep. Drinks are on the squad tonight.', 'The map is yours, operator.']
    : draw ? ['Neither squad broke through. Call it a draw.']
      : r.forfeit ? ['You surrendered. The rival squad takes the round.'] : ['Your towers fell. Regroup and queue again.', 'Outplayed this time. Check your loadout and go again.'];
  $('r-epitaph').textContent = ep[Math.floor(Math.random() * ep.length)];
  showStats();
  // victory: brass fanfare, then cynicmusic's Town Theme; defeat: cynicmusic's Crystal Cave
  audio.play(win ? 'victory' : 'defeat');
  audio.playMusic(null);
  clearTimeout(resultMusicT);
  if (win) {
    setTimeout(() => audio.play('fanfare'), 900);
    resultMusicT = setTimeout(() => audio.playMusic('victory'), 6500);
  } else if (!draw) {
    resultMusicT = setTimeout(() => audio.playMusic('defeat'), 1800);
  } else audio.playMusic('menu');
  if (!win && !draw && !r.forfeit) setTimeout(() => bubble('gg', 1), 300);
  show('result');
}

$('h-forfeit').onclick = () => { if (sim && !sim.over) { $('yield').hidden = false; } };
$('yield-no').onclick = () => { $('yield').hidden = true; };
$('yield-yes').onclick = () => {
  $('yield').hidden = true;
  if (!sim || sim.over) return;
  sim.over = true;
  endBattle({ winner: 1, crowns: [sim.players[0].crowns, 3], forfeit: true });
};

// ---------- HUD pieces ----------
function buildHand(initial) {
  const hand = $('hand');
  const p = sim.players[0];
  hand.innerHTML = '';
  handEls = p.hand.map((k, i) => {
    const el = cardEl(k, initial ? 'enter' : '');
    el.innerHTML += '<div class="veil"></div>';
    el.addEventListener('pointerdown', (e) => onCardDown(e, i));
    hand.appendChild(el);
    return el;
  });
  lastHand = p.hand.slice();
  const next = $('nextcard');
  const nk = p.queue[0];
  next.style.backgroundImage = `url(${thumbs[nk]}), radial-gradient(ellipse at 50% 30%, #b08a55, #3a2a18 80%)`;
  next.innerHTML = `<div class="cost"><b>${CARDS[nk].cost}</b></div>`;
}

function refreshHandSlot(i) {
  const p = sim.players[0];
  const old = handEls[i];
  const el = cardEl(p.hand[i], 'enter');
  el.innerHTML += '<div class="veil"></div>';
  el.addEventListener('pointerdown', (e) => onCardDown(e, i));
  old.replaceWith(el);
  handEls[i] = el;
  const nk = p.queue[0];
  $('nextcard').style.backgroundImage = `url(${thumbs[nk]}), radial-gradient(ellipse at 50% 30%, #b08a55, #3a2a18 80%)`;
  $('nextcard').innerHTML = `<div class="cost"><b>${CARDS[nk].cost}</b></div>`;
  lastHand[i] = p.hand[i];
}

function buildSoulsBar() {
  const b = $('souls-bar');
  b.innerHTML = '';
  for (let i = 0; i < SOULS.max; i++) b.appendChild(document.createElement('i'));
}

function buildTowerLabels() {
  const host = $('labels');
  towerLabels = sim.towers.map((t) => {
    const el = document.createElement('div');
    el.className = `tlabel t${t.team}`;
    el.innerHTML = `<span class="zz"></span><span class="hp"></span><span class="hb"><i></i></span>`;
    host.appendChild(el);
    return { t, el, hp: el.querySelector('.hp'), bar: el.querySelector('.hb i'), zz: el.querySelector('.zz'), last: -1 };
  });
}

function crowns(bump) {
  if (!sim) return;
  for (const i of [0, 1]) {
    const el = $(`h-c${i}`), v = String(sim.players[i].crowns);
    if (el.textContent !== v && bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    el.textContent = v;
  }
}

// ---------- combat feedback ----------
function retrigger(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

function slam(big, small, team) {
  $('slam-big').textContent = big;
  $('slam-small').textContent = small;
  $('slam').style.color = team === 0 ? 'var(--soul)' : 'var(--blood)';
  retrigger($('slam'), 'on');
  retrigger($('flash'), 'on');
  requestAnimationFrame(() => $('flash').classList.remove('on'));
}

const STREAKS = ['', '', 'Double kill', 'Triple kill', 'Multi kill', 'Rampage', 'Unstoppable'];
function onKill(k, v) {
  if (!stats || !v || v.kind === 'tower') return;
  if (v.team === 0) { stats.lost++; return; }
  if (!k || k.team !== 0) return;
  stats.kills++;
  const now = sim.time;
  streak.n = now - streak.t < 2.2 ? streak.n + 1 : 1;
  streak.t = now;
  if (streak.n >= 2) {
    $('streak').textContent = STREAKS[Math.min(streak.n, STREAKS.length - 1)];
    retrigger($('streak'), 'on');
    audio.play('streak');
  }
}

// tower damage: numbers accumulate per tower and pop a few times a second
const pending = new Map();
function onTowerHit(t, amount, src) {
  if (!stats) return;
  if (src && src.team === 0 && t.team === 1) {
    stats.towerDmg += amount;
    if (src.key) stats.byCard[src.key] = (stats.byCard[src.key] || 0) + amount;
  }
  pending.set(t, (pending.get(t) || 0) + amount);
  if (t.team === 0 && amount >= 1) {
    alertT = 0.35;
    if (uchipT <= 0) {
      uchipT = 5;
      const c = $('uchip');
      c.textContent = t.sub === 'keep' ? 'Command Post under fire' : 'Outpost under fire';
      c.style.top = `${$('bottom').getBoundingClientRect().top - 30}px`;
      retrigger(c, 'on');
      setTimeout(() => c.classList.remove('on'), 2200);
    }
  }
}
let popT = 0;
function flushPops(dt) {
  popT -= dt;
  if (popT > 0 || !pending.size) return;
  popT = 0.22;
  const host = $('pops'), w = window.innerWidth, h = window.innerHeight;
  for (const [t, amt] of pending) {
    if (amt < 1) continue;
    tmp.set(t.x + (Math.random() - 0.5) * 0.8, t.view.height * 0.75, t.z).project(camera);
    const el = document.createElement('div');
    el.className = `dmg${t.team === 0 ? ' mine' : ''}${amt >= 300 ? ' big' : ''}`;
    el.textContent = `-${Math.round(amt)}`;
    el.style.left = `${((tmp.x + 1) / 2) * w}px`; el.style.top = `${((1 - tmp.y) / 2) * h}px`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }
  pending.clear();
}

function updateIntro(dt) {
  intro -= dt;
  const step = intro > 2.6 ? 3 : intro > 1.6 ? 2 : intro > 0.6 ? 1 : 0;
  if (step !== introStep) {
    introStep = step;
    const el = document.createElement('span');
    el.textContent = step ? String(step) : 'Breach!';
    if (!step) el.className = 'go';
    $('count').replaceChildren(el);
    if (step) audio.play('tick'); else { audio.play('vo_fight'); audio.play('go'); setTimeout(() => bot?.emote('glhf'), 900); }
  }
  if (intro <= 0) setTimeout(() => $('count').replaceChildren(), 600);
}

function showStats() {
  const box = $('r-stats');
  const items = [['Kills', stats.kills], ['Units lost', stats.lost], ['Deployed', stats.deployed], ['Tower dmg', Math.round(stats.towerDmg)]];
  box.innerHTML = items.map(([l], i) => `<div style="animation-delay:${0.15 + i * 0.08}s"><b data-v="${items[i][1]}">0</b><span>${l}</span></div>`).join('');
  const t0 = performance.now();
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 1100);
    box.querySelectorAll('b').forEach((b) => { b.textContent = Math.round(Number(b.dataset.v) * (1 - (1 - k) ** 3)); });
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const best = Object.entries(stats.byCard).sort((a, b) => b[1] - a[1])[0];
  const mvp = $('r-mvp');
  mvp.hidden = !best;
  if (best) {
    const [key, dmg] = best;
    mvp.innerHTML = '';
    mvp.appendChild(cardEl(key, ''));
    mvp.insertAdjacentHTML('beforeend', `<div><small>MVP card</small><strong>${CARDS[key].name}</strong><em>${Math.round(dmg)} damage to towers</em></div>`);
  }
}

const WEAPON = { rifle: 'rifle', smg: 'smg', sniper: 'scope', heavy: 'shotgun', mech: 'cannon', k9: 'bite', breacher: 'C4', drone: 'laser', swarm: 'boom', sentry: 'turret' };
function killFeed(k, v) {
  if (!v || v.kind === 'tower' || view.mode !== 'battle') return;
  const host = $('killfeed');
  const SINGLE = { rifle: 'Rifleman', smg: 'SMG Rusher', swarm: 'Kamikaze Drone', k9: 'K-9' };
  const name = (e) => (e.kind === 'tower' ? (e.sub === 'keep' ? 'Command Post' : 'Outpost') : SINGLE[e.key] || e.card?.name || '—');
  const row = document.createElement('div');
  const tag = (e) => `<b style="color:${e.team === 0 ? 'var(--soul)' : 'var(--blood)'}">${name(e)}</b>`;
  const how = k ? (k.kind === 'tower' ? 'tower' : WEAPON[k.key] || 'hit') : 'blast';
  row.innerHTML = `${k ? tag(k) : '<b>Hazard</b>'} <span>[${how}]</span> ${tag(v)}`;
  host.prepend(row);
  while (host.children.length > 3) host.lastChild.remove();
  setTimeout(() => { row.style.opacity = 0; }, 3000);
  setTimeout(() => row.remove(), 3600);
}

let bannerTimer = null;
function banner(text, team, big) {
  const b = $('banner');
  b.textContent = text;
  b.className = `banner${big ? ' big' : ''}`;
  b.style.color = team === 0 ? 'var(--soul)' : team === 1 ? 'var(--blood)' : 'var(--vellum)';
  b.style.opacity = 1;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.style.opacity = 0; }, big ? 2200 : 2600);
}

function bubble(text, team) {
  if (view.mode !== 'battle') return;
  document.querySelectorAll(`.bubble.b${team}`).forEach((b) => b.remove());
  const el = document.createElement('div');
  el.className = `bubble b${team}`;
  el.textContent = text;
  el.style.borderColor = team === 0 ? 'rgba(159,214,255,0.6)' : 'rgba(255,74,58,0.6)';
  el.style.color = team === 0 ? 'var(--soul)' : '#ffb3aa';
  if (team === 1) { el.style.left = 'max(16px, env(safe-area-inset-left, 0px))'; el.style.top = 'calc(max(10px, env(safe-area-inset-top, 0px)) + 66px)'; }
  else { el.style.right = 'max(16px, env(safe-area-inset-right, 0px))'; el.style.bottom = `${$('bottom').offsetHeight + 14}px`; }
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = 0; }, 2400);
  setTimeout(() => el.remove(), 2900);
}

// emotes
const emoteBox = $('emotes');
EMOTES.forEach((t) => {
  const b = document.createElement('button');
  b.textContent = t;
  b.onclick = () => {
    emoteBox.hidden = true; bubble(t, 0);
    if (bot && Math.random() < 0.45) setTimeout(() => bot?.emote(t === 'gg' ? 'gg' : EMOTES[Math.floor(Math.random() * EMOTES.length)]), 1200 + Math.random() * 1500);
  };
  emoteBox.appendChild(b);
});
$('emote-btn').onclick = () => { emoteBox.hidden = !emoteBox.hidden; };

// ---------- input ----------
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
function groundAt(cx, cy) {
  const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(groundPlane, hit) ? hit.clone() : null;
}
function overField(cx, cy) {
  const b = $('bottom').getBoundingClientRect();
  return cy < b.top + 6;
}

function onCardDown(e, i) {
  e.preventDefault();
  if (!sim || sim.over) return;
  audio.start();
  emoteBox.hidden = true;
  if (selected === i && !dragging) { select(-1); return; }
  select(i);
  dragging = true;
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.over = false;
}

function select(i) {
  selected = i;
  handEls.forEach((el, k) => el.classList.toggle('sel', k === i));
  clearGhost();
  if (i >= 0) {
    audio.play('card');
    const key = sim.players[0].hand[i];
    makeGhost(key);
    if (CARDS[key].type !== 'spell') paintZone();
    world.zone.visible = CARDS[key].type !== 'spell';
  } else world.zone.visible = false;
}

function paintZone() {
  if (!sim || selected < 0) return;
  const key = sim.players[0].hand[selected];
  world.paintZone(nav, (x, z) => sim.canDeploy(0, key, x, z));
}

function makeGhost(key) {
  const c = CARDS[key];
  const g = new THREE.Group();
  const ghostMat = (m) => { const n = m.clone(); n.transparent = true; n.opacity = Math.min(n.opacity, 0.5); n.depthWrite = false; return n; };
  if (c.type === 'spell') {
    const ring = new THREE.Mesh(new THREE.RingGeometry(c.radius - 0.08, c.radius, 56), new THREE.MeshBasicMaterial({ color: new THREE.Color(FACTION[0].glow).multiplyScalar(1.6), transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(c.radius, 56), new THREE.MeshBasicMaterial({ color: FACTION[0].glow, transparent: true, opacity: 0.12, depthTest: false }));
    ring.rotation.x = disc.rotation.x = -Math.PI / 2;
    ring.renderOrder = disc.renderOrder = 40;
    g.add(disc, ring);
  } else {
    const n = c.count || 1;
    for (let i = 0; i < n; i++) {
      const m = buildModel(c.model, 0);
      m.root.traverse((o) => { if (o.isMesh) { o.material = ghostMat(o.material); o.castShadow = false; } });
      if (n > 1) { const a = (i / n) * Math.PI * 2; m.root.position.set(Math.cos(a) * c.spread, 0, Math.sin(a) * c.spread); }
      if (m.rig.flyer) m.root.position.y = 1.5;
      m.root.rotation.y = Math.PI;
      g.add(m.root);
    }
    const r = (c.spread || 0) + c.radius + 0.15;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.05, r, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthTest: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.renderOrder = 40;
    g.add(ring);
    g.userData.ring = ring;
    if (c.type === 'building') {
      const rr = new THREE.Mesh(new THREE.RingGeometry(c.range + 0.4, c.range + 0.48, 64), new THREE.MeshBasicMaterial({ color: FACTION[0].glow, transparent: true, opacity: 0.35, depthTest: false, side: THREE.DoubleSide }));
      rr.rotation.x = -Math.PI / 2; rr.position.y = 0.06; rr.renderOrder = 40;
      g.add(rr);
    }
  }
  g.visible = false;
  scene.add(g);
  ghost = g; ghostKey = key;
}

function clearGhost() {
  if (ghost) { scene.remove(ghost); ghost = null; ghostKey = null; }
}

function updateGhost() {
  if (!ghost || !sim) return;
  if (!pointer.over) { ghost.visible = false; return; }
  const p = groundAt(pointer.x, pointer.y);
  if (!p) { ghost.visible = false; return; }
  ghost.visible = true;
  ghost.position.set(p.x, 0, p.z);
  const ok = sim.canDeploy(0, ghostKey, p.x, p.z);
  if (ghost.userData.ring) ghost.userData.ring.material.color.set(ok ? 0x9fd6ff : 0xff3020);
  ghost.userData.ok = ok;
}

function tryDeploy(cx, cy) {
  if (selected < 0 || !sim) return false;
  if (intro > 0) { audio.play('deny'); return false; }
  const p = groundAt(cx, cy);
  if (!p) return false;
  const key = sim.players[0].hand[selected];
  const card = CARDS[key];
  if (sim.players[0].souls < card.cost) { audio.play('deny'); banner('Not enough funds', null); return false; }
  if (!sim.canDeploy(0, key, p.x, p.z)) { audio.play('deny'); return false; }
  const idx = selected;
  if (sim.play(0, idx, p.x, p.z)) {
    select(-1);
    refreshHandSlot(idx);
    return true;
  }
  return false;
}

window.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  pointer.over = view.mode === 'battle' && overField(e.clientX, e.clientY) && (dragging || selected >= 0);
});
window.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  if (overField(e.clientX, e.clientY)) { if (!tryDeploy(e.clientX, e.clientY) && ghost) { /* keep selected for a retry */ } }
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (view.mode !== 'battle' || selected < 0 || dragging) return;
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.over = true;
  tryDeploy(e.clientX, e.clientY);
});
window.addEventListener('keydown', (e) => {
  if (view.mode !== 'battle' || !sim) return;
  if (e.key >= '1' && e.key <= '4') { audio.start(); select(Number(e.key) - 1); pointer.over = overField(pointer.x, pointer.y); }
  if (e.key === 'Escape') select(-1);
});

// ---------- per-frame HUD ----------
const tmp = new THREE.Vector3();
function updateHud(dt) {
  const p = sim.players[0];
  for (let i = 0; i < 4; i++) {
    if (lastHand[i] !== p.hand[i]) refreshHandSlot(i);
    const el = handEls[i];
    const cost = CARDS[p.hand[i]].cost;
    const k = Math.min(1, p.souls / cost);
    if (k >= 1 && el.classList.contains('poor')) retrigger(el, 'ready');
    el.classList.toggle('poor', k < 1);
    el.querySelector('.veil').style.transform = `scaleY(${1 - k})`;
  }
  const whole = Math.floor(p.souls);
  if (whole !== lastSouls) { if (whole > lastSouls) retrigger($('souls-n').parentElement, 'pop'); lastSouls = whole; }
  $('souls-n').textContent = whole;
  $('souls-bar').classList.toggle('full', p.souls >= SOULS.max - 0.01);
  const segs = $('souls-bar').children;
  for (let i = 0; i < segs.length; i++) segs[i].style.setProperty('--f', Math.max(0, Math.min(1, p.souls - i)).toFixed(3));
  const left = Math.max(0, sim.timeLeft());
  $('h-time').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  $('h-time').classList.toggle('ot', sim.phase === 'overtime');
  $('h-time').classList.toggle('hot', sim.phase !== 'overtime' && left <= 30 && left > 10);
  const sec = Math.ceil(left);
  if (left <= 10 && left > 0 && sec !== lastTick && !sim.over) { lastTick = sec; audio.play('tick'); retrigger($('h-time'), 'tickpop'); }
  alertT -= dt; uchipT -= dt;
  $('alert').classList.toggle('on', alertT > 0.2);
  flushPops(dt);
  $('h-lbl').textContent = sim.phase === 'overtime' ? 'Sudden death' : 'Time left';
  $('h-x2').hidden = !sim.doubleSouls();
  const a = sim.altar;
  $('h-altar').textContent = a.owner === null ? 'Supply drop · open' : a.owner === 0 ? 'Supply drop · yours (+40%)' : 'Supply drop · rival (+40%)';
  $('h-altar').style.color = a.owner === null ? '' : a.owner === 0 ? 'var(--soul)' : 'var(--blood)';
  pingT -= dt;
  if (pingT <= 0) {
    pingT = 1;
    rival.ping = Math.max(18, Math.min(140, rival.ping + (Math.random() - 0.5) * 12 + (Math.random() < 0.03 ? 60 : 0) - (rival.ping > 80 ? 15 : 0)));
    const ms = Math.round(rival.ping);
    const bars = ms < 60 ? 3 : ms < 100 ? 2 : 1;
    $('h-ping').innerHTML = `${[1, 2, 3].map((b) => `<i style="height:${3 + b * 3}px;opacity:${b <= bars ? 1 : 0.25}"></i>`).join('')}${ms} ms`;
  }
  const w = window.innerWidth, h = window.innerHeight;
  for (const L of towerLabels) {
    const t = L.t;
    if (!t.alive) { L.el.style.display = 'none'; continue; }
    tmp.set(t.x, t.view.height + 0.2, t.z).project(camera);
    L.el.style.left = `${((tmp.x + 1) / 2) * w}px`;
    L.el.style.top = `${((1 - tmp.y) / 2) * h}px`;
    const hp = Math.ceil(t.hp);
    if (hp !== L.last) { L.last = hp; L.hp.textContent = hp; L.bar.style.width = `${(t.hp / t.maxHp) * 100}%`; L.el.classList.toggle('low', t.hp / t.maxHp < 0.3); }
    L.zz.textContent = t.sub === 'keep' && !t.active && t.team === 0 ? 'Standby' : '';
  }
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let menuT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (view.mode === 'battle' && sim) {
    if (intro > 0) { updateIntro(dt); sim.updateViews(dt); sim.updateEffects(dt); } else { sim.update(dt); bot?.update(dt); }
    world.update(dt, sim);
    updateGhost();
    updateHud(dt);
    camera.position.set(0, 0, view.lookZ).addScaledVector(BATTLE_DIR, view.dist);
    if (intro > 0) {
      // swoop in from a low, wide orbit to the battle framing
      const k = Math.min(1, Math.max(0, intro / 3.6)), e = k * k * (3 - 2 * k);
      const yaw = e * 0.55, d = view.dist * (1 + e * 0.3);
      const dir = BATTLE_DIR.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      dir.y *= 1 - e * 0.45;
      camera.position.set(0, 0, view.lookZ).addScaledVector(dir.normalize(), d);
    }
    camera.lookAt(0, 0, view.lookZ);
    if (sim.shake > 0) {
      const s = sim.shake * 0.25;
      camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s;
      sim.shake = Math.max(0, sim.shake - dt * 2.2);
    }
  } else {
    menuT += dt;
    world.update(dt, null);
    const w = window.innerWidth / window.innerHeight;
    camera.fov = w < 0.8 ? 60 : 45;
    camera.updateProjectionMatrix();
    camera.position.set(Math.sin(menuT * 0.05) * 14, 9 + Math.sin(menuT * 0.1) * 0.6, 21);
    camera.lookAt(0, 1.5, -3);
  }
  composer.render(dt);
}

// ---------- boot ----------
function grain() {
  const c = $('grain'), ctx = c.getContext('2d');
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  c.style.width = '100%'; c.style.height = '100%'; c.style.imageRendering = 'pixelated';
}

async function boot() {
  grain();
  $('loading').textContent = 'Deploying…';
  try { await loadAssets(); } catch (err) { console.warn('Model load failed, using fallback models', err); }
  setSides(store.side);
  world = new World(scene);
  renderThumbs();
  applyQuality();
  refreshMenu();
  show('menu');
  frame();
  const l = $('loading');
  l.style.opacity = 0;
  setTimeout(() => l.remove(), 700);
}
boot();

// test hook (harmless in play)
window.__breach = { get sim() { return sim; }, get bot() { return bot; }, audio, startBattle: () => { rival = rival || { name: 'Test', house: 'Test', trophies: 0, skill: 0.5, ping: 40 }; startBattle(); }, select, tryDeploy, store };
window.__cards = CARDS;
window.__Bot = Bot;
window.__view = view;

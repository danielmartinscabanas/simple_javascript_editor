import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  ARENA, CARDS, DEFAULT_DECK, RIVAL_NAMES, RIVAL_HOUSES, rankFor, EMOTES, FACTION, MATCH, SOULS, setSides,
  LANES, RIVER, BASE, LEG, XP,
} from './config.js';
import { NavGrid, F } from './nav.js';
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

// ---------- camera: a pannable, zoomable view of the battlefield ----------
let view = { mode: 'menu', fx: 0, fz: 17, dist: 26, minDist: 11, maxDist: 60, defDist: 26, overDist: 60, overZ: 0 };
const BATTLE_DIR = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(60)), Math.cos(THREE.MathUtils.degToRad(60)));
function fitBattleCamera() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 50 : 40;
  camera.updateProjectionMatrix();
  // distance that frames the whole map (used for the intro and as the zoom-out limit)
  const bottomPx = ($('bottom')?.offsetHeight || 170) + 4, topPx = 64;
  const yLow = -1 + (2 * bottomPx) / h, yHigh = 1 - (2 * topPx) / h;
  const pts = [[-ARENA.halfW, 0, ARENA.halfL], [ARENA.halfW, 0, ARENA.halfL], [-ARENA.halfW, 0, -ARENA.halfL], [ARENA.halfW, 0, -ARENA.halfL]].map((p) => new THREE.Vector3(...p));
  let dist = 60, lookZ = 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < 60; i++) {
    camera.position.set(0, 0, lookZ).addScaledVector(BATTLE_DIR, dist);
    camera.lookAt(0, 0, lookZ);
    camera.updateMatrixWorld();
    let minX = 1, maxX = -1, minY = 1, maxY = -1;
    for (const p of pts) { v.copy(p).project(camera); minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
    const s = Math.max((maxX - minX) / 2, (maxY - minY) / (yHigh - yLow));
    dist *= 1 + (s - 1) * 0.5;
    lookZ -= ((minY + maxY) / 2 - (yLow + yHigh) / 2) * dist * 0.25;
  }
  view.overDist = dist; view.overZ = lookZ;
  view.maxDist = dist * 1.05;
  // default zoom shows about one lane-to-lane span across the screen
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  view.defDist = Math.max(view.minDist, Math.min(view.maxDist, (w / h < 0.8 ? 12.5 : 17) / tanH));
  view.dist = Math.max(view.minDist, Math.min(view.maxDist, view.dist));
}
function clampView() {
  view.dist = Math.max(view.minDist, Math.min(view.maxDist, view.dist));
  const k = (view.dist - view.minDist) / Math.max(1, view.maxDist - view.minDist); // zoomed out: less room to pan
  const mx = ARENA.halfW - 2 - k * 12, mz = ARENA.halfL - 2 - k * 20;
  view.fx = Math.max(-mx, Math.min(mx, view.fx));
  view.fz = Math.max(-mz - 1, Math.min(mz + 3, view.fz));
}
function applyCamera() {
  camera.position.set(view.fx, 0, view.fz).addScaledVector(BATTLE_DIR, view.dist);
  camera.lookAt(view.fx, 0, view.fz);
  camera.updateMatrixWorld();
}
function focusOn(x, z) { view.fx = x; view.fz = z + 2; clampView(); applyCamera(); }
// how loud a sound at (x,z) is, given where the camera looks and how far out it is zoomed
function ear(x, z) {
  const d = Math.hypot(x - view.fx, z - view.fz);
  const r = 8 + view.dist * 0.75;
  return Math.max(0, Math.min(1, 1.25 - d / r)) ** 1.4;
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  composer.setPixelRatio?.(renderer.getPixelRatio());
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (view.mode === 'battle') { fitBattleCamera(); clampView(); }
  sizeMinimap();
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
  const tag = c.type !== 'unit' ? c.type : c.vehicle ? 'vehicle' : ['support', 'melee'].includes(c.role) ? c.role : '';
  el.innerHTML = `<div class="cost"><b>${c.cost}</b></div>${tag ? `<span class="tp">${tag}</span>` : ''}<div class="nm">${c.name}</div>`;
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
  for (const k of Object.keys(CARDS).filter((c) => !CARDS[c].minion)) {
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
      ear,
      onLevel: (e) => onLevel(e),
      onCardRank: (team, key, rank) => {
        if (team !== 0) return;
        stats.promotions++;
        banner(`${CARDS[key].name} promoted — new ones deploy at Lv ${rank}`, 0);
        audio.play('rankup');
      },
      onWave: (n) => { if (n === 1) banner('Recruit squads are marching every lane', null); audio.play('wave', 0.6); },
      onEnd: (r) => setTimeout(() => endBattle(r), 1800),
      onTowerDown: (t) => {
        if (selected >= 0) paintZone();
        if (t.team === 0 && Math.random() < 0.5) setTimeout(() => bot?.emote('Push now!'), 900);
        if (t.team === 1 && Math.random() < 0.4) setTimeout(() => bot?.emote('Nice shot!'), 1200);
        crowns(true);
        slam(t.team === 1 ? (t.sub === 'keep' ? 'Command Post down' : 'Outpost destroyed') : (t.sub === 'keep' ? 'Command Post lost' : 'Outpost lost'),
          t.team === 1 ? `+1 tower · +$2 · forward deploy` : 'Hold the line', t.team === 1 ? 0 : 1);
        pings.push({ x: t.x, z: t.z, t: 0, col: '#fff' });
      },
    },
  });
  stats = { kills: 0, lost: 0, deployed: 0, spent: 0, towerDmg: 0, byCard: {}, promotions: 0, levelUps: 0 };
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
  buildMinimap();
  resize();
  view.fx = 0; view.fz = 17; view.dist = view.defDist; clampView();
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
    el.innerHTML += '<div class="veil"></div><div class="rank"></div><div class="xpbar"><i></i></div>';
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
  el.innerHTML += '<div class="veil"></div><div class="rank"></div><div class="xpbar"><i></i></div>';
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
    lastHit = t;
    if (!t._pingT || sim.time - t._pingT > 1.5) { t._pingT = sim.time; pings.push({ x: t.x, z: t.z, t: 0, col: '#ff4a2a' }); }
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
let lastHit = null;
$('uchip').addEventListener('pointerdown', (e) => { e.stopPropagation(); if (lastHit) focusOn(lastHit.x, lastHit.z); });

function onLevel(e) {
  if (!stats) return;
  if (e.team === 0) stats.levelUps++;
  tmp.set(e.x, (e.y || 0) + e.height + 0.4, e.z).project(camera);
  if (tmp.z > 1 || Math.abs(tmp.x) > 1 || Math.abs(tmp.y) > 1) return;
  const el = document.createElement('div');
  el.className = `dmg lvl${e.team ? ' foe' : ''}`;
  el.textContent = `Lv ${e.level}`;
  el.style.left = `${((tmp.x + 1) / 2) * window.innerWidth}px`; el.style.top = `${((1 - tmp.y) / 2) * window.innerHeight}px`;
  $('pops').appendChild(el);
  setTimeout(() => el.remove(), 1300);
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
    if (tmp.z > 1 || Math.abs(tmp.x) > 1 || Math.abs(tmp.y) > 1) continue;
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
  const items = [['Kills', stats.kills], ['Units lost', stats.lost], ['Level-ups', stats.levelUps], ['Deployed', stats.deployed], ['Tower dmg', Math.round(stats.towerDmg)]];
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

const WEAPON = { rifle: 'rifle', smg: 'smg', sniper: 'scope', heavy: 'shotgun', mech: 'cannon', k9: 'bite', breacher: 'C4', drone: 'laser', swarm: 'boom', sentry: 'turret', recruit: 'smg', ghost: 'knife', riot: 'baton', medic: 'pistol', engineer: 'hammer', commander: 'pistol', grenadier: '40mm', rocket: 'RPG', apc: 'MG', mortar: 'mortar' };
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
  const m = $('minimap').getBoundingClientRect();
  if (cx >= m.left && cx <= m.right && cy >= m.top && cy <= m.bottom) return false;
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
  if (overField(e.clientX, e.clientY)) tryDeploy(e.clientX, e.clientY);
});

// field gestures: drag to pan, pinch or wheel to zoom, tap to deploy the selected card
const touches = new Map();
let pan = null, pinch = null;
const canvasEl = renderer.domElement;
function panBy(x0, y0, x1, y1) {
  const a = groundAt(x0, y0), b = groundAt(x1, y1);
  if (!a || !b) return;
  view.fx += a.x - b.x; view.fz += a.z - b.z;
  clampView(); applyCamera();
}
function pinchSpan() { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }
canvasEl.addEventListener('pointerdown', (e) => {
  if (view.mode !== 'battle' || !sim || dragging) return;
  canvasEl.setPointerCapture?.(e.pointerId);
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 1) pan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
  else if (touches.size === 2) { pinch = { span: pinchSpan(), dist: view.dist }; if (pan) pan.moved = true; }
  pointer.x = e.clientX; pointer.y = e.clientY;
});
canvasEl.addEventListener('pointermove', (e) => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && touches.size >= 2) { view.dist = pinch.dist * pinch.span / Math.max(20, pinchSpan()); clampView(); applyCamera(); return; }
  if (pan && pan.id === e.pointerId) {
    if (!pan.moved && Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) > 9) pan.moved = true;
    if (pan.moved && intro <= 0) panBy(pan.lx, pan.ly, e.clientX, e.clientY);
    pan.lx = e.clientX; pan.ly = e.clientY;
  }
});
function endTouch(e) {
  if (!touches.has(e.pointerId)) return;
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  if (pan && pan.id === e.pointerId) {
    if (!pan.moved && selected >= 0 && e.type === 'pointerup') { pointer.over = true; tryDeploy(e.clientX, e.clientY); }
    pan = null;
  }
}
canvasEl.addEventListener('pointerup', endTouch);
canvasEl.addEventListener('pointercancel', endTouch);
canvasEl.addEventListener('wheel', (e) => {
  if (view.mode !== 'battle') return;
  e.preventDefault();
  const before = groundAt(e.clientX, e.clientY);
  view.dist *= Math.exp(e.deltaY * 0.0012);
  clampView(); applyCamera();
  const after = groundAt(e.clientX, e.clientY);
  if (before && after) { view.fx += before.x - after.x; view.fz += before.z - after.z; clampView(); applyCamera(); }
}, { passive: false });

const held = new Set();
window.addEventListener('keydown', (e) => {
  if (view.mode !== 'battle' || !sim) return;
  if (e.key >= '1' && e.key <= '4') { audio.start(); select(Number(e.key) - 1); pointer.over = overField(pointer.x, pointer.y); }
  if (e.key === 'Escape') select(-1);
  if (e.key === ' ') { focusOn(0, 17); e.preventDefault(); }
  if (e.key === '+' || e.key === '=') { view.dist *= 0.88; clampView(); }
  if (e.key === '-') { view.dist *= 1.12; clampView(); }
  held.add(e.key.toLowerCase());
});
window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => held.clear());
function panKeys(dt) {
  if (intro > 0) return;
  let dx = 0, dz = 0;
  if (held.has('a') || held.has('arrowleft')) dx--;
  if (held.has('d') || held.has('arrowright')) dx++;
  if (held.has('w') || held.has('arrowup')) dz--;
  if (held.has('s') || held.has('arrowdown')) dz++;
  // dragging a card to a screen edge scrolls the map
  if (dragging && pointer.over) {
    const w = window.innerWidth;
    if (pointer.y < 80) dz--;
    if (pointer.x < 28) dx--; else if (pointer.x > w - 28) dx++;
  }
  if (!dx && !dz) return;
  const v = view.dist * 0.9 * dt;
  view.fx += dx * v; view.fz += dz * v;
  clampView();
}

// ---------- minimap ----------
const mini = $('minimap'), mctx = mini.getContext('2d');
let miniBg = null, miniT = 0;
const pings = [];
function sizeMinimap() {
  const h = window.innerHeight, w = window.innerWidth;
  const ch = Math.round(Math.min(190, Math.max(120, h * (w / h < 0.8 ? 0.17 : 0.28))));
  const cw = Math.round(ch * ARENA.halfW / ARENA.halfL);
  mini.style.width = `${cw}px`; mini.style.height = `${ch}px`;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  mini.width = cw * dpr; mini.height = ch * dpr;
  mini.style.bottom = `${($('bottom')?.offsetHeight || 170) + 10}px`;
  miniBg = null;
}
function mm(x, z) { return [((x + ARENA.halfW) / (ARENA.halfW * 2)) * mini.width, ((z + ARENA.halfL) / (ARENA.halfL * 2)) * mini.height]; }
function buildMinimap() {
  if (!nav) return;
  const c = document.createElement('canvas'); c.width = mini.width; c.height = mini.height;
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  const onLane = (x, z) => {
    const az = Math.abs(z);
    if (az > BASE.z0 && Math.abs(x) < BASE.hx) return true;
    if (az > LEG.z0 && az < LEG.z1) return true;
    return Object.values(LANES).some((l) => Math.abs(x - l.x) < l.half && az < (l.x === 0 ? BASE.z0 : LEG.z1));
  };
  for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
    const x = (px / c.width) * ARENA.halfW * 2 - ARENA.halfW, z = (py / c.height) * ARENA.halfL * 2 - ARENA.halfL;
    const f = nav.flagAt(x, z);
    let col = [92, 74, 50];
    if (onLane(x, z)) col = [176, 150, 108];
    if (Math.abs(z) < RIVER.half && f & F.MIRE) col = [74, 60, 44];
    if (f & F.THICKET) col = [col[0] * 0.65, col[1] * 0.7, col[2] * 0.6];
    if (f & F.BLOCK) col = [34, 26, 18];
    const i = (py * c.width + px) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 235;
  }
  g.putImageData(img, 0, 0);
  miniBg = c;
}
function drawMinimap(dt) {
  if (!sim) return;
  for (const p of pings) p.t += dt;
  while (pings.length && pings[0].t > 1.6) pings.shift();
  miniT -= dt;
  if (miniT > 0) return;
  miniT = 1 / 20;
  if (!miniBg) buildMinimap();
  const W = mini.width, H = mini.height, k = W / (ARENA.halfW * 2);
  mctx.clearRect(0, 0, W, H);
  if (miniBg) mctx.drawImage(miniBg, 0, 0);
  const css = (t) => `#${new THREE.Color(FACTION[t].glow).getHexString()}`;
  for (const o of sim.objectives) {
    const [x, y] = mm(o.def.x, o.def.z);
    mctx.beginPath(); mctx.arc(x, y, o.def.r * k, 0, Math.PI * 2);
    mctx.fillStyle = o.owner === null ? 'rgba(240,210,90,0.55)' : css(o.owner); mctx.fill();
  }
  for (const t of sim.towers) {
    const [x, y] = mm(t.x, t.z), s = (t.sub === 'keep' ? 2.0 : 1.5) * k;
    mctx.fillStyle = t.alive ? css(t.team) : 'rgba(30,24,18,0.8)';
    mctx.fillRect(x - s, y - s, s * 2, s * 2);
    mctx.lineWidth = Math.max(1, k * 0.35); mctx.strokeStyle = sim.isProtected(t) ? '#fff' : '#000';
    mctx.strokeRect(x - s, y - s, s * 2, s * 2);
  }
  for (const e of sim.entities) {
    if (!e.alive || e.kind === 'tower') continue;
    if (e.team === 1 && sim.isHidden(e)) continue;
    const [x, y] = mm(e.x, e.z);
    mctx.fillStyle = css(e.team);
    const r = (e.minion ? 0.32 : 0.5) * k + 0.6;
    mctx.beginPath(); mctx.arc(x, y, r, 0, Math.PI * 2); mctx.fill();
    if (!e.minion) { mctx.lineWidth = 1; mctx.strokeStyle = '#000'; mctx.stroke(); }
  }
  for (const p of pings) {
    const [x, y] = mm(p.x, p.z);
    mctx.beginPath(); mctx.arc(x, y, (1 + p.t * 3) * k * 1.4, 0, Math.PI * 2);
    mctx.lineWidth = 2; mctx.strokeStyle = p.col; mctx.globalAlpha = Math.max(0, 1 - p.t / 1.6); mctx.stroke(); mctx.globalAlpha = 1;
  }
  // camera footprint
  const corners = [[0, 0], [window.innerWidth, 0], [window.innerWidth, $('bottom').getBoundingClientRect().top], [0, $('bottom').getBoundingClientRect().top]].map(([cx, cy]) => groundAt(cx, cy));
  if (corners.every(Boolean)) {
    mctx.beginPath();
    corners.forEach((p, i) => { const [x, y] = mm(p.x, p.z); if (i) mctx.lineTo(x, y); else mctx.moveTo(x, y); });
    mctx.closePath(); mctx.lineWidth = Math.max(1.5, k * 0.4); mctx.strokeStyle = 'rgba(255,255,255,0.85)'; mctx.stroke();
  }
}
function miniPoint(e) {
  const r = mini.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * ARENA.halfW * 2 - ARENA.halfW, z = ((e.clientY - r.top) / r.height) * ARENA.halfL * 2 - ARENA.halfL;
  focusOn(x, z);
}
mini.addEventListener('pointerdown', (e) => { if (intro > 0) return; e.stopPropagation(); mini.setPointerCapture?.(e.pointerId); mini._drag = true; miniPoint(e); });
mini.addEventListener('pointermove', (e) => { if (mini._drag) miniPoint(e); });
mini.addEventListener('pointerup', () => { mini._drag = false; });
mini.addEventListener('pointercancel', () => { mini._drag = false; });

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
    const key = p.hand[i], card = CARDS[key];
    if (card.type !== 'spell') {
      const rank = sim.cardRank(0, key), xp = sim.cardXp[0][key] || 0, at = XP.rankAt(card);
      const lo = rank > 1 ? at[rank - 2] : 0, hi = at[rank - 1];
      el.querySelector('.xpbar i').style.width = `${hi ? Math.min(100, ((xp - lo) / (hi - lo)) * 100) : 100}%`;
      const r = el.querySelector('.rank');
      const txt = rank > 1 ? `Lv ${rank}` : '';
      if (r.textContent !== txt) { r.textContent = txt; if (txt) retrigger(r, 'pop'); }
    }
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
  const chips = sim.objectives.map((o) => `<span title="${o.def.name}: ${o.def.blurb}" style="color:${o.owner === null ? 'var(--ash)' : o.owner === 0 ? 'var(--soul)' : 'var(--blood)'}">${{ drop: 'Drop', armory: 'Arm', medic: 'Med' }[o.def.id]}</span>`).join(' · ');
  if ($('h-altar').innerHTML !== chips) $('h-altar').innerHTML = chips;
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
    const off = tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1;
    L.el.style.display = off ? 'none' : '';
    if (off) continue;
    L.el.style.left = `${((tmp.x + 1) / 2) * w}px`;
    L.el.style.top = `${((1 - tmp.y) / 2) * h}px`;
    const hp = Math.ceil(t.hp);
    if (hp !== L.last) { L.last = hp; L.hp.textContent = hp; L.bar.style.width = `${(t.hp / t.maxHp) * 100}%`; L.el.classList.toggle('low', t.hp / t.maxHp < 0.3); }
    const sh = sim.isProtected(t);
    if (L.sh !== sh) { L.sh = sh; L.zz.textContent = sh ? 'Shielded' : ''; L.el.classList.toggle('shielded', sh); }
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
    panKeys(dt);
    if (intro > 0) {
      // open on the whole map, then swoop down to your base
      const k = Math.min(1, Math.max(0, (intro - 0.4) / 3.2)), e = k * k * (3 - 2 * k);
      const fz = 17 + (view.overZ - 17) * e, d = view.defDist + (view.overDist - view.defDist) * e;
      const dir = BATTLE_DIR.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), e * 0.12).normalize();
      camera.position.set(0, 0, fz).addScaledVector(dir, d);
      camera.lookAt(0, 0, fz);
      view.fx = 0; view.fz = 17; view.dist = view.defDist;
    } else applyCamera();
    drawMinimap(dt);
    if (sim.shake > 0) {
      const s = sim.shake * 0.25 * (view.dist / 26);
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
window.__breach = { get sim() { return sim; }, get bot() { return bot; }, audio, startBattle: () => { rival = rival || { name: 'Test', house: 'Test', trophies: 0, skill: 0.5, ping: 40 }; startBattle(); }, select, tryDeploy, store, focusOn, skipIntro: () => { intro = 0; $('count').replaceChildren(); } };
window.__cards = CARDS;
window.__Bot = Bot;
window.__rivalDeck = rivalDeck;
window.__view = view;

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  ARENA, CARDS, DEFAULT_DECK, RIVAL_NAMES, RIVAL_HOUSES, rankFor, EMOTES, FACTION, MATCH, THICKETS, SPIKES, MIRES, SOULS,
} from './config.js';
import { NavGrid } from './nav.js';
import { World } from './world.js';
import { Sim } from './sim.js';
import { Bot, rivalDeck } from './bot.js';
import { Audio } from './audio.js';
import { buildModel } from './models.js';

const $ = (id) => document.getElementById(id);
const TROPHY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v3h3v3a5 5 0 0 1-5 5 6 6 0 0 1-3 2.6V19h3v2H8v-2h3v-2.4A6 6 0 0 1 8 14a5 5 0 0 1-5-5V6h3zm-1 5v1a3 3 0 0 0 2 2.8V8zm14 0h-2v3.8A3 3 0 0 0 19 9z"/></svg>';

// ---------- persistence (best-effort) ----------
const KEY = 'thornspire.v1';
function load() {
  const d = { name: 'Pilgrim', trophies: 0, deck: DEFAULT_DECK.slice(), muted: false, quality: 'high', wins: 0, losses: 0 };
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
renderer.toneMappingExposure = 1.6;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
const world = new World(scene);
const audio = new Audio();
audio.muted = store.muted;

let composer, bloom;
function buildComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.85, 0.55, 0.82);
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
const BATTLE_DIR = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(56)), Math.cos(THREE.MathUtils.degToRad(56)));
function fitBattleCamera() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 46 : 38;
  camera.updateProjectionMatrix();
  const bottomPx = ($('bottom')?.offsetHeight || 170) + 4;
  const topPx = 64;
  const yLow = -1 + (2 * bottomPx) / h, yHigh = 1 - (2 * topPx) / h;
  const pts = [[-ARENA.halfW - 0.3, 0, ARENA.halfL + 0.3], [ARENA.halfW + 0.3, 0, ARENA.halfL + 0.3],
    [-ARENA.halfW - 0.3, 0, -ARENA.halfL - 0.3], [ARENA.halfW + 0.3, 0, -ARENA.halfL - 0.3], [0, 6.5, -13.2]].map((p) => new THREE.Vector3(...p));
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
  for (const p of [world.fx, world.smoke]) p.uniforms.uScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}
window.addEventListener('resize', resize);

// ---------- card art (rendered once from the 3D models) ----------
const thumbs = {};
function renderThumbs() {
  const W = 200, H = 250;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(W, H); r.setPixelRatio(1);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.5;
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0x8090c0, 0x302018, 2.4));
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
    const box = new THREE.Box3().setFromObject(g);
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

function cardEl(key, extra = '') {
  const c = CARDS[key];
  const el = document.createElement('div');
  el.className = `card ${extra}`;
  el.style.backgroundImage = `radial-gradient(ellipse at 50% 40%, rgba(60,40,50,0.0), rgba(0,0,0,0.35)), url(${thumbs[key]}), radial-gradient(ellipse at 50% 30%, #4a3846, #0d0a10 75%)`;
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
}

$('pname').addEventListener('input', (e) => { store.name = e.target.value.trim().slice(0, 18) || 'Pilgrim'; save(); });
$('btn-sound').onclick = () => { audio.start(); store.muted = !store.muted; audio.setMuted(store.muted); save(); refreshMenu(); };
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
    $('seek-meta').textContent = `Searching… ${Math.floor(s)}s · ${pool + Math.floor(s * 7)} souls in the queue`;
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
let handEls = [], towerLabels = [], featureLabels = [], featureT = 0, pingT = 0;
let lastHand = [];

function startBattle() {
  endBattleScene();
  nav = new NavGrid();
  sim = new Sim({
    scene, world, nav, audio, camera,
    decks: [store.deck.slice(), rivalDeck()],
    hooks: {
      onMessage: (text, team) => banner(text, team),
      onEnd: (r) => setTimeout(() => endBattle(r), 1800),
      onTowerDown: (t) => {
        if (selected >= 0) paintZone();
        if (t.team === 0 && Math.random() < 0.5) setTimeout(() => bot?.emote('Thou art doomed.'), 900);
        if (t.team === 1 && Math.random() < 0.4) setTimeout(() => bot?.emote('Mercy… none.'), 1200);
        crowns();
      },
    },
  });
  bot = new Bot(sim, rival.skill, { onEmote: (t) => bubble(t, 1) });
  view.mode = 'battle';
  show('hud');
  $('h-rival').textContent = rival.name;
  $('h-house').textContent = `${rival.house} · ${rival.trophies}`;
  buildHand(true);
  buildSoulsBar();
  buildTowerLabels();
  buildFeatureLabels();
  crowns();
  resize();
  selected = -1;
  audio.play('toll');
  banner('The bells toll — defend your spires', null, true);
  setTimeout(() => bot?.emote('Ave Mortis.'), 1800);
}

function endBattleScene() {
  if (sim) { sim.dispose(); sim = null; bot = null; }
  clearGhost();
  world.zone.visible = false;
  $('labels').innerHTML = '';
  towerLabels = []; featureLabels = [];
  document.querySelectorAll('.bubble').forEach((b) => b.remove());
}

function toMenu() { view.mode = 'menu'; refreshMenu(); show('menu'); }

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
  $('r-verdict').textContent = draw ? 'Stalemate' : win ? 'Victory' : 'Defeat';
  $('r-verdict').className = `verdict ${win ? 'win' : draw ? '' : 'loss'}`;
  $('r-score').innerHTML = `<span style="color:var(--soul)">${r.crowns[0]}</span> — <span style="color:var(--blood)">${r.crowns[1]}</span>`;
  $('r-delta').className = `delta ${delta >= 0 ? 'up' : 'down'}`;
  $('r-delta').innerHTML = `${TROPHY_SVG}${delta >= 0 ? '+' : ''}${delta} · ${store.trophies} · ${rankFor(store.trophies)}`;
  const ep = win
    ? ['The Covenant’s banners burn. Your name is carved in the reliquary.', 'The spires of the rival lie in rubble. The bells are yours.', 'Ash settles on a field you hold.']
    : draw ? ['Both houses bleed; neither breaks. The rift keeps its silence.']
      : r.forfeit ? ['You yield the field. The Covenant will remember it.'] : ['Your spires fall to the Crimson Covenant. Rise, and try again.', 'The rift drinks deep tonight. Not of them.'];
  $('r-epitaph').textContent = ep[Math.floor(Math.random() * ep.length)];
  audio.play(win ? 'victory' : 'defeat');
  if (!win && !draw && !r.forfeit) setTimeout(() => bubble('Well fought.', 1), 300);
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
  next.style.backgroundImage = `url(${thumbs[nk]}), radial-gradient(ellipse at 50% 30%, #2a1e28, #0a080c 70%)`;
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
  $('nextcard').style.backgroundImage = `url(${thumbs[nk]}), radial-gradient(ellipse at 50% 30%, #2a1e28, #0a080c 70%)`;
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

function buildFeatureLabels() {
  const host = $('labels');
  const defs = [
    [THICKETS[0].x, 0.9, -THICKETS[0].z, 'Thornbrake', 'units inside are hidden'],
    [SPIKES[0].x + 1.8, 0.2, SPIKES[0].z + 0.4, 'Spike Gallery', 'erupts on a rhythm'],
    [MIRES[1].x, 0.4, -MIRES[1].z, 'Weeping Mire', 'halves ground speed'],
    [0, 3.8, 0, 'Altar of the Pale Saint', 'hold it: +40% souls'],
  ];
  featureLabels = defs.map(([x, y, z, a, b]) => {
    const el = document.createElement('div');
    el.className = 'flabel';
    el.innerHTML = `${a}<em>${b}</em>`;
    host.appendChild(el);
    return { el, p: new THREE.Vector3(x, y, z) };
  });
  featureT = 7;
}

function crowns() {
  if (!sim) return;
  $('h-c0').textContent = sim.players[0].crowns;
  $('h-c1').textContent = sim.players[1].crowns;
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
    if (bot && Math.random() < 0.45) setTimeout(() => bot?.emote(t === 'Well fought.' ? 'Well fought.' : EMOTES[Math.floor(Math.random() * EMOTES.length)]), 1200 + Math.random() * 1500);
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
  const p = groundAt(cx, cy);
  if (!p) return false;
  const key = sim.players[0].hand[selected];
  const card = CARDS[key];
  if (sim.players[0].souls < card.cost) { audio.play('deny'); banner('Not enough souls', null); return false; }
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
    el.classList.toggle('poor', k < 1);
    el.querySelector('.veil').style.transform = `scaleY(${1 - k})`;
  }
  $('souls-n').textContent = Math.floor(p.souls);
  const segs = $('souls-bar').children;
  for (let i = 0; i < segs.length; i++) segs[i].style.setProperty('--f', Math.max(0, Math.min(1, p.souls - i)).toFixed(3));
  const left = Math.max(0, sim.timeLeft());
  $('h-time').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  $('h-time').classList.toggle('ot', sim.phase === 'overtime');
  $('h-lbl').textContent = sim.phase === 'overtime' ? 'Sudden death' : 'Time left';
  $('h-x2').hidden = !sim.doubleSouls();
  const a = sim.altar;
  $('h-altar').textContent = a.owner === null ? 'Altar · unclaimed' : a.owner === 0 ? 'Altar · yours (+40%)' : 'Altar · rival (+40%)';
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
    if (hp !== L.last) { L.last = hp; L.hp.textContent = hp; L.bar.style.width = `${(t.hp / t.maxHp) * 100}%`; }
    L.zz.textContent = t.sub === 'keep' && !t.active ? 'Dormant' : '';
  }
  if (featureT > 0) {
    featureT -= dt;
    for (const f of featureLabels) {
      tmp.copy(f.p).project(camera);
      f.el.style.left = `${((tmp.x + 1) / 2) * w}px`;
      f.el.style.top = `${((1 - tmp.y) / 2) * h}px`;
      f.el.style.opacity = Math.min(1, featureT / 1.5);
    }
    if (featureT <= 0) featureLabels.forEach((f) => f.el.remove());
  }
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let menuT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (view.mode === 'battle' && sim) {
    sim.update(dt);
    bot?.update(dt);
    world.update(dt, sim);
    updateGhost();
    updateHud(dt);
    camera.position.set(0, 0, view.lookZ).addScaledVector(BATTLE_DIR, view.dist);
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
    camera.position.set(Math.sin(menuT * 0.06) * 9, 6.5 + Math.sin(menuT * 0.1) * 0.6, 23);
    camera.lookAt(0, 2.2, -6);
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

function boot() {
  grain();
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
window.__thornspire = { get sim() { return sim; }, get bot() { return bot; }, startBattle: () => { rival = rival || { name: 'Test', house: 'Test', trophies: 0, skill: 0.5, ping: 40 }; startBattle(); }, select, tryDeploy, store };
window.__cards = CARDS;
window.__Bot = Bot;
window.__view = view;

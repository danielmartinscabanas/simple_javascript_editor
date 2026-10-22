import * as THREE from 'three';
import {
  ARENA, WALL_HALF as RIFT_HALF, TOWERS, CARDS, MINES, MINE, ALTAR, SOULS, MATCH, FACTION,
} from './config.js';
import { F } from './nav.js';
import { buildModel, bellTower, cathedralKeep, healthBar, teamMats, crow, playClip, syncWeapon } from './models.js';
import { runeCircle, rubbleDecal } from './textures.js';

let NEXT_ID = 1;
const tmpV = new THREE.Vector3();

function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// Give each entity its own materials so it can flash / fade independently.
function ownMaterials(root) {
  const map = new Map();
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    if (!map.has(src)) {
      const c = src.clone();
      c.userData = { origT: src.transparent, baseOpacity: src.opacity, baseEm: c.emissive ? c.emissive.clone() : null };
      c.onBeforeCompile = src.onBeforeCompile; c.customProgramCacheKey = src.customProgramCacheKey;
      map.set(src, c); list.push(c);
    }
    o.material = map.get(src);
  });
  return list;
}

export class Sim {
  constructor({ scene, world, nav, audio, decks, hooks, camera }) {
    this.scene = scene; this.world = world; this.nav = nav; this.audio = audio; this.hooks = hooks || {};
    this.camera = camera;
    this.time = 0; this.phase = 'regulation'; this.over = false;
    this.entities = []; this.projectiles = []; this.effects = []; this.corpses = [];
    this.altar = { owner: null, progress: 0 };
    this.junk = [];
    this.mineT = MINES.map(() => 0);
    this.smokes = []; this.fires = [];
    this.shake = 0;
    this.runeTex = runeCircle(11);
    this.players = [0, 1].map((team) => {
      const deck = shuffle(decks[team]);
      return { team, souls: SOULS.start, hand: deck.slice(0, 4), queue: deck.slice(4), crowns: 0, played: 0 };
    });
    this.towers = [];
    for (const team of [0, 1]) for (const t of TOWERS) this.towers.push(this.createTower(team, t));
  }

  // ---------- helpers ----------
  sideZ(team, z) { return team === 0 ? z : -z; }
  enemyOf(team) { return 1 - team; }
  timeLeft() {
    return this.phase === 'regulation' ? MATCH.regulation - this.time : MATCH.regulation + MATCH.overtime - this.time;
  }
  doubleSouls() { return this.phase === 'overtime' || this.timeLeft() <= MATCH.doubleAt; }

  mineArmed(def) { return this.mineT[MINES.indexOf(def)] <= 0; }

  towerAlive(team, kind, side) {
    return this.towers.some((t) => t.alive && t.team === team && t.sub === kind && (side === undefined || Math.sign(t.x) === side));
  }

  inZone(team, x, z) {
    const own = team === 0 ? z >= RIFT_HALF + 0.15 : z <= -(RIFT_HALF + 0.15);
    if (own) return true;
    const enemy = this.enemyOf(team);
    for (const side of [-1, 1]) {
      if (Math.sign(x) !== side) continue;
      if (!this.towerAlive(enemy, 'bell', side)) {
        if (team === 0 ? z > -10.6 : z < 10.6) return true;
      }
    }
    return false;
  }

  canDeploy(team, key, x, z) {
    const card = CARDS[key];
    if (!card) return false;
    if (Math.abs(x) > ARENA.halfW - 0.25 || Math.abs(z) > ARENA.halfL - 0.25) return false;
    if (card.type === 'spell') return true;
    if (!this.nav.walkable(x, z)) return false;
    if (card.type === 'building') {
      for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) if (!this.nav.walkable(x + dx, z + dz)) return false;
    }
    return this.inZone(team, x, z);
  }

  play(team, handIdx, x, z) {
    const p = this.players[team];
    const key = p.hand[handIdx];
    if (!key || this.over) return false;
    const card = CARDS[key];
    if (p.souls < card.cost - 1e-6) return false;
    if (!this.canDeploy(team, key, x, z)) return false;
    p.souls -= card.cost;
    p.hand[handIdx] = p.queue.shift();
    p.queue.push(key);
    p.played++;
    if (card.type === 'spell') this.castSpell(team, key, x, z);
    else this.deployCard(team, key, x, z);
    this.hooks.onPlay?.(team, key, x, z);
    return true;
  }

  // ---------- creation ----------
  createTower(team, t) {
    const x = t.x, z = this.sideZ(team, t.z);
    const model = t.kind === 'keep' ? cathedralKeep(team) : bellTower(team);
    model.root.position.set(x, 0, z);
    model.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(model.root);
    this.nav.setStructure(x, z, t.half, true);
    const e = {
      id: NEXT_ID++, team, kind: 'tower', sub: t.kind, x, z, y: 0,
      hp: t.hp, maxHp: t.hp, radius: t.half + 0.1, half: t.half,
      dmg: t.dmg, hitSpeed: t.hitSpeed, range: t.range, sight: t.range, cd: 0,
      hitsAir: true, air: false, alive: true, active: t.kind !== 'keep', target: null,
      view: model, muzzleY: model.rig.muzzleY, structure: true, deployT: 0, revealT: 0, windup: 0, attackT: -1,
    };
    this.entities.push(e);
    return e;
  }

  deployCard(team, key, x, z) {
    const card = CARDS[key];
    const n = card.count || 1;
    const spread = card.spread || 0;
    for (let i = 0; i < n; i++) {
      let px = x, pz = z;
      if (n > 1) {
        const a = (i / n) * Math.PI * 2 + (team ? Math.PI : 0);
        px += Math.cos(a) * spread; pz += Math.sin(a) * spread;
        if (!card.air && !this.nav.walkable(px, pz)) [px, pz] = [x, z];
      }
      this.createUnit(team, key, px, pz, 1.0);
    }
    this.portal(team, x, z, Math.max(0.9, spread + 0.6));
    this.audio.play('deploy');
    if (!card.air && card.type === 'unit' && card.model !== 'dog' && Math.random() < 0.45) this.audio.play('charge');
  }

  createUnit(team, key, x, z, deployT = 1.0) {
    const card = CARDS[key];
    const model = buildModel(card.model, team);
    const mats = ownMaterials(model.root);
    // faint self-light so units separate from the stone in low light
    for (const m of mats) if (m.emissive && m.userData.baseEm && m.userData.baseEm.getHex() === 0) { if (m.map && !m.emissiveMap) m.emissiveMap = m.map; m.emissive.copy(m.color).multiplyScalar(m.map ? 0.35 : 0.22); m.userData.baseEm.copy(m.emissive); }
    model.root.position.set(x, 0, z);
    model.root.rotation.y = team === 0 ? Math.PI : 0;
    model.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    this.scene.add(model.root);
    model.root.scale.setScalar(card.type === 'building' ? 1.3 : 2.0);
    const ring = new THREE.Mesh(this.ringGeo ||= new THREE.RingGeometry(0.7, 1, 28), this.ringMat(team));
    ring.rotation.x = -Math.PI / 2; ring.renderOrder = 7;
    const rr = card.radius * 1.5 + 0.12;
    ring.scale.set(rr, rr, rr);
    this.scene.add(ring);
    const bar = healthBar(Math.min(1.4, 0.5 + card.hp / 3000), team);
    bar.visible = false;
    this.scene.add(bar);
    const building = card.type === 'building';
    const e = {
      id: NEXT_ID++, team, key, card, kind: building ? 'building' : 'unit', x, z, y: 0,
      hp: card.hp, maxHp: card.hp, radius: card.radius, mass: card.mass || 4,
      dmg: card.dmg, hitSpeed: card.hitSpeed, range: card.range, sight: card.sight, speed: card.speed || 0,
      air: !!card.air, hitsAir: !!card.hitsAir, buildingsOnly: !!card.buildingsOnly,
      cd: card.hitSpeed * 0.4, alive: true, target: null, retarget: 0, path: null, pathT: 0, pathTarget: null, navV: -1,
      view: model, mats, bar, ring, height: model.height * (card.type === 'building' ? 1.3 : 2.0), deployT, deployMax: deployT, revealT: 0, inThicket: false,
      facing: model.root.rotation.y, walkPhase: Math.random() * 6, attackT: -1, windup: -1, flashT: 0,
      slowT: 0, stuckT: 0, lastX: x, lastZ: z, structure: building, life: card.lifetime || 0, fade: 1,
    };
    if (building) { e.half = 0.5; this.nav.setStructure(x, z, 0.5, true); bar.visible = true; }
    this.entities.push(e);
    return e;
  }

  ringMat(team) {
    this._ringMats ||= [0, 1].map((t) => new THREE.MeshBasicMaterial({
      color: new THREE.Color(FACTION[t].glow).multiplyScalar(t === 0 ? 1.1 : 1.3), transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    return this._ringMats[team];
  }

  portal(team, x, z, r) {
    const mat = new THREE.MeshBasicMaterial({ map: this.runeTex, transparent: true, depthWrite: false, color: new THREE.Color(FACTION[team].glow).multiplyScalar(2.2), blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.2, r * 2.2), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.04, z); m.renderOrder = 8;
    this.scene.add(m);
    this.effects.push({ t: 0, dur: 1.2, update: (fx, dt) => {
      const k = fx.t / fx.dur;
      mat.opacity = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      m.rotation.z += dt * 1.5;
      return k < 1;
    }, dispose: () => { this.scene.remove(m); m.geometry.dispose(); mat.dispose(); } });
    const c = FACTION[team].glow;
    const col = [((c >> 16) & 255) / 120, ((c >> 8) & 255) / 120, (c & 255) / 120, 1];
    this.world.fx.emit({ x, y: 0.1, z, count: 26, spread: r * 0.6, spreadY: 0, vel: [0, 1.8, 0], velRand: 0.5, life: 1.0, size: 0.16, color: col });
  }

  // ---------- spells ----------
  castSpell(team, key, x, z) {
    const card = CARDS[key];
    const thrown = { frag: 'grenade', smoke: 'smokecan', flash: 'flashcan', molotov: 'molotov' }[key];
    this.areaMarker(team, x, z, card.radius, 1.2);
    this.throwItem(team, thrown, x, z, key === 'frag' ? 0.9 : 0.7, () => {
      if (key === 'frag') this.explode(team, x, z, card.radius, card.dmg, card.towerMul, true);
      else if (key === 'smoke') this.popSmoke(team, card, x, z);
      else if (key === 'flash') this.flashbang(team, card, x, z);
      else if (key === 'molotov') this.ignite(team, card, x, z);
    });
    this.audio.play('throw');
  }

  // A grenade-like object lobbed from the caster's side of the field.
  throwItem(team, model, x, z, dur, land) {
    const obj = buildModel(model, team).root;
    obj.scale.setScalar(0.7);
    const sx = x * 0.4, sz = team === 0 ? Math.min(15, z + 9) : Math.max(-15, z - 9);
    this.scene.add(obj);
    this.effects.push({ t: 0, dur, update: (f) => {
      const k = Math.min(1, f.t / dur);
      obj.position.set(sx + (x - sx) * k, 0.3 + Math.sin(k * Math.PI) * 5, sz + (z - sz) * k);
      obj.rotation.x += 0.3; obj.rotation.z += 0.2;
      if (k >= 1) { land(); return false; }
      return true;
    }, dispose: () => this.scene.remove(obj) });
  }

  spellTargets(team, x, z, r, cb) {
    for (const e of this.entities) {
      if (!e.alive || e.team === team) continue;
      if (Math.hypot(e.x - x, e.z - z) <= r + e.radius * 0.5) cb(e);
    }
  }

  explode(team, x, z, r, dmg, towerMul, knock, hitsOwn = false) {
    const hit = (e) => {
      this.damage(e, e.kind === 'tower' ? dmg * towerMul : dmg, null);
      if (knock && e.kind === 'unit' && e.mass < 8 && !e.air) {
        const d = Math.hypot(e.x - x, e.z - z) || 1;
        const nx = e.x + ((e.x - x) / d) * 0.6, nz = e.z + ((e.z - z) / d) * 0.6;
        if (this.nav.walkable(nx, nz)) { e.x = nx; e.z = nz; }
      }
    };
    if (hitsOwn) { for (const e of this.entities) if (e.alive && e.kind === 'unit' && !e.air && Math.hypot(e.x - x, e.z - z) <= r + e.radius * 0.5) hit(e); }
    else this.spellTargets(team, x, z, r, hit);
    this.boomFx(x, z, r);
  }

  boomFx(x, z, r, big = 1) {
    const fx = this.world.fx, sm = this.world.smoke;
    fx.emit({ x, y: 0.3, z, count: 70 * big, spread: 0.3, vel: [0, 3, 0], velRand: 2.5, radial: r * 2.4, gravity: 4, drag: 1.6, life: 0.7, size: 0.35, sizeEnd: 0.05, color: [1.6, 0.7, 0.2, 1], colorJitter: 0.5 });
    sm.emit({ x, y: 0.4, z, count: 30 * big, spread: r * 0.4, vel: [0, 1.3, 0], velRand: 0.6, radial: 1.2, drag: 0.8, life: 2.4, size: 0.8, sizeEnd: 2.8, color: [0.32, 0.27, 0.22, 0.7] });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.4, 0.6), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.08, z);
    const scorch = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: this.scorchTex ||= rubbleDecal(), transparent: true, depthWrite: false, opacity: 0.7 }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.set(x, 0.03, z); scorch.renderOrder = 3;
    const light = new THREE.PointLight(0xffa040, 40, r * 5, 1.4);
    light.position.set(x, 1.5, z);
    this.scene.add(ring, scorch, light);
    this.shake = Math.max(this.shake, 0.35 * big);
    this.audio.play('boom');
    this.effects.push({ t: 0, dur: 6, update: (f) => {
      const k = f.t, rr = Math.min(1, k / 0.3);
      ring.scale.setScalar(1 + rr * r * 2.2);
      ring.material.opacity = Math.max(0, 1 - rr);
      light.intensity = Math.max(0, 40 * (1 - k / 0.4));
      scorch.material.opacity = 0.7 * Math.max(0, 1 - Math.max(0, k - 4) / 2);
      return k < f.dur;
    }, dispose: () => { this.scene.remove(ring, scorch, light); ring.geometry.dispose(); scorch.geometry.dispose(); } });
  }

  popSmoke(team, card, x, z) {
    const zone = { x, z, r: card.radius, until: this.time + card.duration };
    this.smokes.push(zone);
    this.audio.play('smoke');
    this.world.smoke.emit({ x, y: 0.6, z, count: 90, spread: card.radius * 0.5, spreadY: 0.4, vel: [0, 0.4, 0], velRand: 0.5, radial: 1.2, drag: 1.2, life: 3, size: 1.6, sizeEnd: 3.4, color: [0.78, 0.8, 0.82, 0.85] });
    this.effects.push({ t: 0, dur: card.duration, update: (f, dt) => {
      const left = 1 - f.t / f.dur;
      if (Math.random() < dt * 30) this.world.smoke.emit({ x, y: 0.5 + Math.random() * 1.2, z, count: 2, spread: card.radius * 0.75, spreadY: 0.3, vel: [0.15, 0.15, 0], velRand: 0.2, life: 2.6, size: 1.5, sizeEnd: 3.2, color: [0.8, 0.82, 0.84, 0.75 * Math.min(1, left * 2)] });
      return f.t < f.dur;
    } });
  }

  inSmoke(e) {
    for (const s of this.smokes) if (Math.hypot(e.x - s.x, e.z - s.z) < s.r) return true;
    return false;
  }

  flashbang(team, card, x, z) {
    this.spellTargets(team, x, z, card.radius, (e) => {
      this.damage(e, e.kind === 'tower' ? card.dmg * card.towerMul : card.dmg, null);
      e.stunT = Math.max(e.stunT || 0, card.stun);
      e.windup = 0;
    });
    const light = new THREE.PointLight(0xffffff, 140, card.radius * 6, 1.2);
    light.position.set(x, 1.4, z);
    this.scene.add(light);
    this.world.fx.emit({ x, y: 0.8, z, count: 80, spread: 0.2, velRand: 4, drag: 2.5, life: 0.5, size: 0.5, color: [3, 3, 3, 1] });
    this.audio.play('flash');
    this.hooks.onFlash?.(x, z);
    this.effects.push({ t: 0, dur: 0.6, update: (f) => { light.intensity = 140 * (1 - f.t / f.dur); return f.t < f.dur; }, dispose: () => this.scene.remove(light) });
  }

  ignite(team, card, x, z) {
    const fire = { team, x, z, r: card.radius, dps: card.dps, towerMul: card.towerMul, until: this.time + card.duration };
    this.fires.push(fire);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(card.radius, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.5, 0.1), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; glow.position.set(x, 0.04, z); glow.renderOrder = 7;
    const light = new THREE.PointLight(0xff7a20, 25, card.radius * 4, 1.5);
    light.position.set(x, 1, z);
    this.scene.add(glow, light);
    this.audio.play('fire');
    this.effects.push({ t: 0, dur: card.duration, update: (f, dt) => {
      const left = 1 - f.t / f.dur;
      glow.material.opacity = 0.45 * Math.min(1, left * 3);
      light.intensity = 25 * Math.min(1, left * 3) * (0.8 + Math.random() * 0.4);
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * card.radius;
        this.world.fx.emit({ x: x + Math.cos(a) * d, y: 0.1, z: z + Math.sin(a) * d, vel: [0, 1.6, 0], velRand: 0.3, life: 0.7, size: 0.4, sizeEnd: 0.05, color: [1.8, 0.6 + Math.random() * 0.3, 0.12, 1] });
      }
      if (Math.random() < dt * 8) this.world.smoke.emit({ x, y: 1, z, spread: card.radius * 0.6, vel: [0, 1, 0], velRand: 0.2, life: 2, size: 0.6, sizeEnd: 2, color: [0.15, 0.12, 0.1, 0.5] });
      return f.t < f.dur;
    }, dispose: () => { this.scene.remove(glow, light); glow.geometry.dispose(); } });
  }

  areaMarker(team, x, z, r, dur) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(FACTION[team].glow).multiplyScalar(1.4), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r, 48), mat);
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.06, z); ring.renderOrder = 9;
    this.scene.add(ring);
    this.effects.push({ t: 0, dur, update: (f) => { mat.opacity = 0.8 * (1 - f.t / f.dur); return f.t < f.dur; }, dispose: () => { this.scene.remove(ring); ring.geometry.dispose(); mat.dispose(); } });
  }

  // ---------- combat ----------
  isHidden(e) { return e.deployT <= 0 && ((e.inThicket && e.revealT <= 0) || (!e.structure && this.inSmoke(e))); }

  canTarget(a, b) {
    if (!b.alive || b.team === a.team) return false;
    if (b.air && !a.hitsAir) return false;
    if (a.buildingsOnly && !b.structure) return false;
    if (this.isHidden(b) && Math.hypot(a.x - b.x, a.z - b.z) > 1.6 + a.radius) return false;
    return true;
  }

  edgeDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius; }

  acquire(e) {
    let best = null, bestD = Infinity;
    const sight = e.kind === 'unit' ? e.sight : e.range;
    for (const o of this.entities) {
      if (!this.canTarget(e, o)) continue;
      const d = this.edgeDist(e, o);
      if (d > sight) continue;
      // units prefer troops over structures when both are in sight
      const bias = o.structure && e.kind === 'unit' && !e.buildingsOnly ? 1.5 : 0;
      if (d + bias < bestD) { bestD = d + bias; best = o; }
    }
    if (!best && e.kind === 'unit') {
      for (const o of this.entities) {
        if (!o.alive || o.team === e.team || !o.structure) continue;
        if (o.kind === 'building' && !e.buildingsOnly) continue;
        const d = Math.hypot(o.x - e.x, o.z - e.z) + (o.sub === 'keep' ? 3 : 0);
        if (d < bestD) { bestD = d; best = o; }
      }
    }
    return best;
  }

  damage(e, amount, src) {
    if (!e.alive) return;
    e.hp -= amount;
    e.flashT = 0.1;
    if (e.kind === 'tower') this.hooks.onTowerHit?.(e, Math.min(amount, e.hp + amount), src);
    if (e.kind === 'tower' && e.sub === 'keep' && !e.active) this.activateKeep(e);
    if (src && src.card?.lifesteal && src.alive) src.hp = Math.min(src.maxHp, src.hp + amount * src.card.lifesteal);
    if (e.hp <= 0) { this.hooks.onKill?.(src, e); this.kill(e); }
  }

  activateKeep(k) {
    if (k.active || !k.alive) return;
    k.active = true;
    k.view.rig.statueEyes.visible = true;
    this.hooks.onMessage?.(k.team === 0 ? 'Your Command Post is online' : 'Rival Command Post is online', k.team);
    this.audio.play('alarm');
  }

  kill(e) {
    e.alive = false; e.hp = 0;
    const c = FACTION[e.team].glow;
    const col = [((c >> 16) & 255) / 110, ((c >> 8) & 255) / 110, (c & 255) / 110, 1];
    if (e.kind === 'tower') return this.destroyTower(e);
    if (e.structure) this.nav.setStructure(e.x, e.z, e.half, false);
    this.world.fx.emit({ x: e.x, y: e.y + 0.5, z: e.z, count: 18, spread: 0.25, vel: [0, 1.6, 0], velRand: 0.5, life: 1.4, size: 0.18, color: col });
    this.world.smoke.emit({ x: e.x, y: e.y + 0.3, z: e.z, count: 6, spread: 0.3, vel: [0, 0.4, 0], velRand: 0.3, life: 1.2, size: 0.4, sizeEnd: 1.6, color: [0.08, 0.07, 0.07, 0.6] });
    this.audio.play(e.air ? 'droneDown' : e.card?.model === 'mech' ? 'boom' : 'death');
    if (e.card?.model === 'mech') this.boomFx(e.x, e.z, 1.2, 1);
    e.bar.visible = false;
    this.corpses.push({ e, t: 0 });
    const ds = e.card?.deathSpawn;
    if (ds) {
      for (let i = 0; i < ds.count; i++) {
        const a = (i / ds.count) * Math.PI * 2;
        let px = e.x + Math.cos(a) * 0.6, pz = e.z + Math.sin(a) * 0.6;
        if (!this.nav.walkable(px, pz)) [px, pz] = [e.x, e.z];
        this.createUnit(e.team, ds.card, px, pz, 0.3);
      }
    }
  }

  destroyTower(t) {
    this.nav.setStructure(t.x, t.z, t.half, false);
    const scorer = this.players[this.enemyOf(t.team)];
    scorer.crowns = t.sub === 'keep' ? 3 : Math.min(3, scorer.crowns + 1);
    this.shake = 1.0;
    this.audio.play('collapse');
    this.world.smoke.emit({ x: t.x, y: 1.5, z: t.z, count: 80, spread: 1.2, vel: [0, 1.4, 0], velRand: 1.4, radial: 1.5, drag: 0.6, life: 3.5, size: 1.0, sizeEnd: 3.5, color: [0.16, 0.14, 0.13, 0.75] });
    this.world.fx.emit({ x: t.x, y: 3, z: t.z, count: 60, spread: 0.6, vel: [0, 3, 0], velRand: 2.5, gravity: 5, life: 1.3, size: 0.2, color: [2, 0.7, 0.25, 1] });
    const v = t.view.root;
    const rubble = new THREE.Group();
    const m = teamMats(t.team);
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.35, 0), m.darkStone);
      const a = Math.random() * Math.PI * 2, d = Math.random() * t.half * 1.2;
      s.position.set(t.x + Math.cos(a) * d, 0.1, t.z + Math.sin(a) * d);
      s.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      s.castShadow = true; s.receiveShadow = true;
      rubble.add(s);
    }
    this.scene.add(rubble);
    this.junk.push(rubble);
    const tilt = (Math.random() - 0.5) * 0.4;
    this.effects.push({ t: 0, dur: 2.2, update: (f) => {
      const k = Math.min(1, f.t / f.dur);
      v.position.y = -k * k * 8;
      v.rotation.z = tilt * k; v.rotation.x = tilt * 0.5 * k;
      return k < 1;
    }, dispose: () => { this.scene.remove(v); } });
    if (t.sub === 'bell') {
      const keep = this.towers.find((k) => k.team === t.team && k.sub === 'keep');
      if (keep) this.activateKeep(keep);
    }
    this.hooks.onTowerDown?.(t);
    this.checkEnd();
  }

  checkEnd() {
    const [a, b] = this.players;
    if (a.crowns >= 3 || b.crowns >= 3) return this.finish();
    if (this.phase === 'overtime' && a.crowns !== b.crowns) return this.finish();
  }

  finish(tiebreak) {
    if (this.over) return;
    this.over = true;
    this.audio.setLoops({ wind: 0.6 });
    const [a, b] = this.players;
    let winner = a.crowns > b.crowns ? 0 : b.crowns > a.crowns ? 1 : null;
    if (winner === null && tiebreak) {
      const low = (team) => Math.min(...this.towers.filter((t) => t.team === team && t.alive).map((t) => t.hp / t.maxHp), 1);
      const la = low(0), lb = low(1);
      if (Math.abs(la - lb) > 1e-3) winner = la > lb ? 0 : 1;
    }
    this.hooks.onEnd?.({ winner, crowns: [a.crowns, b.crowns] });
  }

  spawnProjectile(src, target, kind) {
    const glow = new THREE.Color(FACTION[src.team].glow);
    const spec = {
      tracer: { len: 0.55, w: 0.03, color: new THREE.Color(3, 2.6, 1.4), speed: 38 },
      slug: { len: 1.2, w: 0.045, color: new THREE.Color(3.2, 3, 2.4), speed: 60 },
      buckshot: { len: 0.4, w: 0.07, color: new THREE.Color(3, 2.2, 1.2), speed: 30 },
      laser: { len: 0.7, w: 0.05, color: glow.clone().multiplyScalar(3), speed: 28 },
      shell: { len: 0.35, w: 0.16, color: new THREE.Color(2.5, 1.3, 0.5), speed: 15 },
    }[kind] || { len: 0.5, w: 0.04, color: new THREE.Color(3, 2.6, 1.4), speed: 38 };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.w, spec.len), new THREE.MeshBasicMaterial({ color: spec.color }));
    const y0 = src.kind === 'tower' ? src.muzzleY : src.kind === 'building' ? 1.0 : (src.y || 0) + src.height * 0.55;
    mesh.position.set(src.x, y0, src.z);
    this.scene.add(mesh);
    // muzzle flash
    this.world.fx.emit({ x: src.x + (target.x - src.x) * 0.06, y: y0, z: src.z + (target.z - src.z) * 0.06, count: 3, spread: 0.03, velRand: 0.6, life: 0.08, size: 0.35, sizeEnd: 0.1, color: [3, 2.2, 1, 1] });
    this.projectiles.push({
      team: src.team, src, target, kind, mesh, x: src.x, y: y0, z: src.z,
      tx: target.x, ty: (target.y || 0) + 0.5, tz: target.z,
      speed: spec.speed, dmg: src.dmg * (target.structure && src.card?.structMul ? src.card.structMul : 1), splash: src.card?.splash || 0, hitsAir: src.hitsAir,
    });
  }

  impact(p) {
    const fx = this.world.fx;
    if (p.splash) {
      for (const e of this.entities) {
        if (!e.alive || e.team === p.team) continue;
        if (e.air && !p.hitsAir) continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) <= p.splash + e.radius * 0.5) this.damage(e, p.dmg, p.src);
      }
      fx.emit({ x: p.x, y: p.y, z: p.z, count: 18, spread: 0.1, velRand: 2.4, gravity: 5, life: 0.4, size: 0.14, color: [2, 1.3, 0.5, 1] });
      this.world.smoke.emit({ x: p.x, y: p.y, z: p.z, count: 5, spread: 0.2, vel: [0, 0.6, 0], velRand: 0.4, life: 1, size: 0.5, sizeEnd: 1.4, color: [0.5, 0.42, 0.32, 0.6] });
      this.audio.play(p.kind === 'shell' ? 'shellHit' : 'hit');
    } else if (p.target.alive) {
      this.damage(p.target, p.dmg, p.src);
      const tower = p.target.structure;
      fx.emit({ x: p.x, y: p.y, z: p.z, count: tower ? 6 : 4, spread: 0.05, velRand: 1.8, gravity: 6, life: 0.25, size: 0.08, color: tower ? [2.4, 2, 1.2, 1] : [1.6, 0.25, 0.15, 1] });
      if (tower) this.world.smoke.emit({ x: p.x, y: p.y, z: p.z, count: 2, spread: 0.1, vel: [0, 0.4, 0], life: 0.7, size: 0.25, sizeEnd: 0.8, color: [0.75, 0.62, 0.45, 0.6] });
      this.audio.play(tower ? 'hitMetal' : 'hit');
    }
  }

  // ---------- main tick ----------
  update(dt) {
    if (this.over) { this.updateViews(dt); this.updateEffects(dt); return; }
    this.time += dt;
    // phase transitions
    if (this.phase === 'regulation' && this.time >= MATCH.regulation) {
      const [a, b] = this.players;
      if (a.crowns !== b.crowns) return this.finish();
      this.phase = 'overtime';
      this.hooks.onMessage?.('Sudden death — the next tower to fall decides it', null);
      this.audio.play('vo_sudden_death');
    } else if (this.phase === 'overtime' && this.time >= MATCH.regulation + MATCH.overtime) {
      return this.finish(true);
    }
    if (!this._doubled && this.doubleSouls()) { this._doubled = true; this.hooks.onMessage?.('Final minute — funds flow twice as fast', null); this.audio.play('vo_final_round'); }
    this.smokes = this.smokes.filter((sm) => sm.until > this.time);
    this.fires = this.fires.filter((f) => f.until > this.time);
    let flyers = 0, choking = false;
    for (const e of this.entities) if (e.alive) { if (e.air) flyers++; else if (e.kind === 'unit' && this.smokes.length && this.inSmoke(e)) choking = true; }
    this.audio.setLoops({ wind: 1, rotor: Math.min(1, flyers / 2), fire: this.fires.length ? 1 : 0 });
    if (choking && Math.random() < dt * 0.6) this.audio.play('cough');
    for (const f of this.fires) {
      for (const e of this.entities) {
        if (!e.alive || e.team === f.team || e.air || e.deployT > 0) continue;
        if (Math.hypot(e.x - f.x, e.z - f.z) <= f.r + e.radius * 0.4) this.damage(e, f.dps * dt * (e.kind === 'tower' ? f.towerMul : 1), null);
      }
    }

    // souls
    for (const p of this.players) {
      let rate = SOULS.regen * (this.doubleSouls() ? 2 : 1);
      if (this.altar.owner === p.team) rate *= 1 + ALTAR.bonus;
      p.souls = Math.min(SOULS.max, p.souls + rate * dt);
    }

    this.updateHazards(dt);
    this.updateAltar(dt);

    for (const e of this.entities) {
      if (!e.alive) continue;
      if (e.deployT > 0) { e.deployT -= dt; continue; }
      e.revealT = Math.max(0, e.revealT - dt);
      e.slowT = Math.max(0, e.slowT - dt);
      if (e.stunT > 0) {
        e.stunT -= dt;
        if (Math.random() < dt * 6) this.world.fx.emit({ x: e.x, y: (e.y || 0) + e.height + 0.2, z: e.z, spread: 0.2, vel: [0, 0.4, 0], life: 0.5, size: 0.12, color: [2.4, 2.4, 1.6, 1] });
        continue;
      }
      if (e.kind === 'building') {
        e.hp -= (e.maxHp / e.life) * dt;
        if (e.hp <= 0) { this.kill(e); continue; }
      }
      if (e.kind === 'tower' && !e.active) continue;
      if (e.kind === 'unit' && !e.air) {
        const inT = !!(this.nav.flagAt(e.x, e.z) & F.THICKET);
        if (inT && !e.inThicket) this.rustle(e);
        e.inThicket = inT;
      }
      this.think(e, dt);
    }
    this.separate(dt);
    this.updateProjectiles(dt);
    this.entities = this.entities.filter((e) => e.alive || e.kind === 'tower');
    this.updateEffects(dt);
    this.updateViews(dt);
  }

  updateHazards(dt) {
    MINES.forEach((m, i) => {
      if (this.mineT[i] > 0) { this.mineT[i] -= dt; return; }
      const trip = this.entities.find((e) => e.alive && e.kind === 'unit' && !e.air && e.deployT <= 0 && Math.hypot(e.x - m.x, e.z - m.z) < MINE.radius + e.radius);
      if (!trip) return;
      this.mineT[i] = MINE.rearm;
      for (const e of this.entities) {
        if (!e.alive || e.kind !== 'unit' || e.air) continue;
        if (Math.hypot(e.x - m.x, e.z - m.z) <= MINE.splash + e.radius * 0.5) this.damage(e, MINE.dmg, null);
      }
      this.boomFx(m.x, m.z, MINE.splash, 0.7);
    });
  }

  updateAltar(dt) {
    const c = [0, 0];
    for (const e of this.entities) {
      if (!e.alive || e.kind !== 'unit' || e.deployT > 0) continue;
      if (Math.hypot(e.x - ALTAR.x, e.z - ALTAR.z) <= ALTAR.r) c[e.team]++;
    }
    const a = this.altar;
    const rate = dt / ALTAR.captureTime;
    if (c[0] && !c[1]) a.progress = Math.min(1, a.progress + rate);
    else if (c[1] && !c[0]) a.progress = Math.max(-1, a.progress - rate);
    const prev = a.owner;
    if (a.progress >= 1) a.owner = 0;
    else if (a.progress <= -1) a.owner = 1;
    else if (a.owner === 0 && a.progress <= 0) a.owner = null;
    else if (a.owner === 1 && a.progress >= 0) a.owner = null;
    if (prev !== a.owner) {
      if (a.owner !== null) {
        this.hooks.onMessage?.(a.owner === 0 ? 'Supply drop secured — funds +40%' : 'Rival secured the supply drop', a.owner);
        this.audio.play('capture');
      }
    }
  }

  think(e, dt) {
    // targeting
    e.retarget -= dt;
    const t = e.target;
    const valid = t && this.canTarget(e, t) && (e.kind === 'unit' ? true : this.edgeDist(e, t) <= e.range + 0.2);
    if (!valid || (e.retarget <= 0 && (!t || t.structure || this.edgeDist(e, t) > e.range))) {
      e.retarget = 0.25 + Math.random() * 0.1;
      const n = this.acquire(e);
      if (n !== e.target) { e.target = n; e.path = null; }
    }
    const tg = e.target;
    if (e.cd > 0) e.cd -= dt;
    if (e.attackT >= 0) e.attackT += dt;
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) this.strike(e);
    }
    if (!tg) return;
    const d = this.edgeDist(e, tg);
    if (d <= e.range) {
      if (e.kind === 'unit') e.facingTarget = Math.atan2(tg.x - e.x, tg.z - e.z);
      e.moving = false;
      if (e.cd <= 0 && e.windup <= 0) {
        e.cd = e.hitSpeed;
        e.windup = e.kind === 'tower' ? 0.05 : 0.3;
        e.attackT = 0;
        e.attackSeq = (e.attackSeq || 0) + 1;
        e.strikeTarget = tg;
        e.revealT = 1.2;
      }
    } else if (e.kind === 'unit') {
      this.move(e, tg, dt);
    }
  }

  strike(e) {
    const tg = e.strikeTarget;
    if (!tg || !tg.alive) return;
    if (this.edgeDist(e, tg) > e.range + 0.8) return;
    const proj = e.kind === 'tower' ? 'tracer' : e.card?.projectile;
    this.audio.play(e.kind === 'tower' ? (e.sub === 'keep' ? 'smg' : 'rifle') : e.card?.sfx || 'rifle');
    if (e.card?.breach) {
      const b = e.card.breach;
      this.damage(tg, e.dmg, e);
      for (const o of this.entities) {
        if (o === tg || !o.alive || o.team === e.team || o.air) continue;
        if (Math.hypot(o.x - tg.x, o.z - tg.z) <= b.splash + o.radius * 0.5) this.damage(o, b.splashDmg, e);
      }
      this.boomFx((e.x + tg.x) / 2, (e.z + tg.z) / 2, b.splash, 1.3);
      this.kill(e);
      return;
    }
    if (e.card?.kamikaze) {
      const k = e.card.kamikaze;
      for (const o of this.entities) {
        if (!o.alive || o.team === e.team) continue;
        if (Math.hypot(o.x - tg.x, o.z - tg.z) <= k.splash + o.radius * 0.5) this.damage(o, o.kind === 'tower' ? e.dmg * 0.6 : e.dmg, e);
      }
      this.boomFx(tg.x, tg.z, k.splash, 0.6);
      this.kill(e);
      return;
    }
    if (proj) this.spawnProjectile(e, tg, proj);
    else {
      const charged = e.charging && e.card?.charge;
      this.damage(tg, e.dmg * (charged ? e.card.charge.dmgMul : 1), e);
      if (e.card?.charge) {
        if (charged) this.world.fx.emit({ x: tg.x, y: 0.8, z: tg.z, count: 22, spread: 0.15, velRand: 2.4, gravity: 4, life: 0.5, size: 0.14, color: [1.8, 0.05, 0.08, 1] });
        e.runUp = 0; e.charging = false;
      }
      if (e.card?.cripple && tg.kind === 'unit') tg.slowT = Math.max(tg.slowT, e.card.cripple);
      if (e.card?.splash) {
        for (const o of this.entities) {
          if (o === tg || !o.alive || o.team === e.team || (o.air && !e.hitsAir)) continue;
          if (Math.hypot(o.x - tg.x, o.z - tg.z) <= e.card.splash + o.radius * 0.5) this.damage(o, e.dmg, e);
        }
        this.world.fx.emit({ x: tg.x, y: 0.4, z: tg.z, count: 14, spread: 0.2, radial: 3, velRand: 0.5, gravity: 3, life: 0.4, size: 0.12, color: [1.8, 0.5, 0.15, 1] });
      }
      const c = FACTION[e.team].glow;
      this.world.fx.emit({ x: (e.x + tg.x) / 2, y: (tg.y || 0) + 0.6, z: (e.z + tg.z) / 2, count: 6, spread: 0.1, velRand: 1.6, gravity: 4, life: 0.3, size: 0.09, color: [2, 1.6, 1.2, 1] });
      if (e.card?.lifesteal) this.world.fx.emit({ x: tg.x, y: 0.8, z: tg.z, count: 6, spread: 0.1, vel: [(e.x - tg.x) * 2, 0.6, (e.z - tg.z) * 2], life: 0.5, size: 0.12, color: [1.6, 0.05, 0.05, 1] });
    }
  }

  move(e, tg, dt) {
    let speed = e.speed;
    if (!e.air) {
      if (this.nav.flagAt(e.x, e.z) & F.MIRE) speed *= 0.5;
    }
    if (e.slowT > 0) speed *= 0.5;
    const ch = e.card?.charge;
    if (ch) { e.charging = (e.runUp || 0) >= ch.after; if (e.charging) speed *= ch.speedMul; }
    let gx = tg.x, gz = tg.z;
    if (!e.air && !this.nav.lineClear(e.x, e.z, tg.x, tg.z)) {
      e.pathT -= dt;
      if (!e.path || e.pathTarget !== tg || e.pathT <= 0 || e.navV !== this.nav.version) {
        const reach = Math.max(0.5, e.range + e.radius + tg.radius - 0.15);
        e.path = this.nav.findPath(e.x, e.z, tg.x, tg.z, reach);
        e.pathTarget = tg; e.pathT = 0.7 + Math.random() * 0.4; e.navV = this.nav.version;
      }
      while (e.path && e.path.length && Math.hypot(e.path[0][0] - e.x, e.path[0][1] - e.z) < 0.2) e.path.shift();
      if (e.path && e.path.length) [gx, gz] = e.path[0];
    }
    const dx = gx - e.x, dz = gz - e.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    const step = Math.min(len, speed * dt);
    if (ch) e.runUp = (e.runUp || 0) + step;
    const nx = e.x + (dx / len) * step, nz = e.z + (dz / len) * step;
    if (e.air || this.nav.walkable(nx, nz)) { e.x = nx; e.z = nz; }
    else if (this.nav.walkable(nx, e.z)) e.x = nx;
    else if (this.nav.walkable(e.x, nz)) e.z = nz;
    e.facingTarget = Math.atan2(dx, dz);
    e.moving = true;
    // stuck detection
    if (Math.hypot(e.x - e.lastX, e.z - e.lastZ) < speed * dt * 0.2) { e.stuckT += dt; if (e.stuckT > 1) { e.path = null; e.pathT = 0; e.stuckT = 0; } }
    else e.stuckT = 0;
    e.lastX = e.x; e.lastZ = e.z;
  }

  rustle(e) {
    let best = null, bd = Infinity;
    for (const th of this.world.thicketMeshes) {
      const d = Math.hypot(th.def.x - e.x, th.def.z - e.z);
      if (d < bd) { bd = d; best = th; }
    }
    if (best) best.rustle = 1;
    this.world.smoke.emit({ x: e.x, y: 0.5, z: e.z, count: 8, spread: 0.3, vel: [0, 0.5, 0], velRand: 0.8, gravity: 1.5, life: 1.0, size: 0.1, color: [0.1, 0.13, 0.06, 0.9] });

  }

  separate() {
    const list = this.entities;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive || a.kind !== 'unit') continue;
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const b = list[j];
        if (!b.alive || b.air !== a.air) continue;
        const dx = a.x - b.x, dz = a.z - b.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + b.radius;
        if (d >= min || d < 1e-5) {
          if (d < 1e-5 && j > i) { a.x += (Math.random() - 0.5) * 0.02; a.z += (Math.random() - 0.5) * 0.02; }
          continue;
        }
        const overlap = min - d;
        let share;
        if (b.kind !== 'unit') share = 1;
        else share = b.mass / (a.mass + b.mass);
        const push = overlap * share * 0.5;
        const nx = a.x + (dx / d) * push, nz = a.z + (dz / d) * push;
        if (a.air || this.nav.walkable(nx, nz)) { a.x = nx; a.z = nz; }
      }
      a.x = Math.max(-ARENA.halfW + 0.2, Math.min(ARENA.halfW - 0.2, a.x));
      a.z = Math.max(-ARENA.halfL + 0.2, Math.min(ARENA.halfL - 0.2, a.z));
    }
  }

  updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      if (p.target.alive) { p.tx = p.target.x; p.ty = (p.target.y || 0) + (p.target.kind === 'tower' ? 2 : 0.5); p.tz = p.target.z; }
      const dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z;
      const d = Math.hypot(dx, dy, dz);
      const step = p.speed * dt;
      if (d <= step + 0.05) {
        p.x = p.tx; p.y = p.ty; p.z = p.tz;
        this.impact(p);
        this.scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose();
        continue;
      }
      p.x += (dx / d) * step; p.y += (dy / d) * step; p.z += (dz / d) * step;
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.lookAt(p.tx, p.ty, p.tz);
      if (p.kind === 'shell') this.world.smoke.emit({ x: p.x, y: p.y, z: p.z, spread: 0.03, life: 0.6, size: 0.2, sizeEnd: 0.7, color: [0.45, 0.42, 0.38, 0.5] });
      keep.push(p);
    }
    this.projectiles = keep;
  }

  updateEffects(dt) {
    const keep = [];
    for (const fx of this.effects) {
      fx.t += dt;
      if (fx.update(fx, dt) === false || fx.t >= fx.dur) fx.dispose?.(); else keep.push(fx);
    }
    this.effects = keep;
  }

  // ---------- visuals per entity ----------
  updateViews(dt) {
    const cam = this.camera;
    const now = this.time;
    for (const e of this.entities) {
      if (e.kind === 'tower') {
        if (!e.alive) continue;
        const rig = e.view.rig;
        if (rig.gunner) {
          const g = rig.gunner;
          const shooting = e.target && e.attackT >= 0 && e.attackT < 0.5;
          playClip(g.rig, shooting ? 'Shoot_OneHanded' : 'Idle', 0.1, false, shooting ? 1.6 : 1);
          if (e.target) {
            const want = Math.atan2(e.target.x - e.x, e.target.z - e.z);
            g.root.rotation.y += angDiff(want, g.root.rotation.y) * Math.min(1, dt * 8);
          } else g.root.rotation.y += angDiff(e.team === 0 ? Math.PI : 0, g.root.rotation.y) * Math.min(1, dt * 2);
          g.rig.mixer.update(dt);
          syncWeapon(g.rig, g.root);
        }
        if (rig.statue && e.target) {
          const want = Math.atan2(e.target.x - e.x, e.target.z - e.z);
          rig.statue.rotation.y += angDiff(want, rig.statue.rotation.y) * Math.min(1, dt * 5);
        }
        continue;
      }
      this.animateUnit(e, dt, now, cam);
    }
    for (const c of this.corpses) {
      c.t += dt;
      const v = c.e.view.root, rig = c.e.view.rig;
      let k, fade;
      if (rig.gltf && rig.actions[rig.spec.death]) {
        if (!c.played) { c.played = true; playClip(rig, rig.spec.death, 0.1, true, 1.3); }
        rig.mixer.update(dt);
        k = Math.min(1, c.t / 1.8);
        fade = Math.max(0, (k - 0.55) / 0.45);
        v.position.y = -fade * fade * 0.5;
      } else {
        k = fade = Math.min(1, c.t / 0.9);
        v.rotation.z = k * 1.3 * (c.e.id % 2 ? 1 : -1);
        v.position.y = (c.e.air ? c.e.y * (1 - k) : 0) - k * k * 0.7;
      }
      for (const m of c.e.mats) { if (!m.transparent) { m.transparent = true; m.needsUpdate = true; } m.opacity = m.userData.baseOpacity * (1 - fade); }
      c.e.ring.visible = false;
      if (k >= 1) { this.scene.remove(v, c.e.bar, c.e.ring); c.done = true; }
    }
    this.corpses = this.corpses.filter((c) => !c.done);
  }

  animateUnit(e, dt, now, cam) {
    const v = e.view, rig = v.rig, root = v.root;
    const deploying = e.deployT > 0;
    const k = deploying ? 1 - e.deployT / e.deployMax : 1;
    const flyer = rig.flyer;
    const hover = flyer ? 1.55 + Math.sin(now * 3 + e.id) * 0.1 : 0;
    e.y = flyer ? hover : 0;
    const rise = deploying ? (flyer ? (1 - k) * 2.5 : -(1 - k) * (1 - k) * e.height * 0.9) : 0;
    root.position.set(e.x, e.y + rise, e.z);
    e.ring.position.set(e.x, 0.035, e.z);
    if (e.facingTarget !== undefined && e.kind === 'unit') {
      e.facing += angDiff(e.facingTarget, e.facing) * Math.min(1, dt * 10);
      root.rotation.y = e.facing;
    }
    const walking = e.moving && !deploying && e.alive;
    if (walking && !e.air && (e.stepT = (e.stepT ?? Math.random() * 0.4) - dt) <= 0) {
      const mech = e.card?.model === 'mech';
      e.stepT = mech ? 0.62 : 0.34 + Math.random() * 0.1;
      this.audio.play(mech ? 'mechStep' : 'step');
    }
    if (rig.gltf) this.animateRigged(e, rig, deploying, walking, dt);
    e.moving = false;
    if (walking) e.walkPhase += dt * e.speed * 5.5;
    const sw = walking ? Math.sin(e.walkPhase) : 0;
    if (rig.legL) {
      rig.legL.rotation.x = sw * 0.6; rig.legR.rotation.x = -sw * 0.6;
      rig.body.position.y = (rig.body.userData.baseY ??= rig.body.position.y) + Math.abs(Math.cos(e.walkPhase)) * (walking ? 0.04 : 0) + (rig.heavy ? 0 : Math.sin(now * 2 + e.id) * 0.006);
    }
    if (rig.glide) rig.body.position.y = 0.04 + Math.sin(now * 2.2 + e.id) * 0.04;
    if (rig.ghost) {
      rig.body.rotation.z = Math.sin(now * 2 + e.id) * 0.08;
    }
    if (rig.wingL) {
      const f = Math.sin(now * (rig.ghost ? 4 : 11) + e.id) * 0.55;
      rig.wingL.rotation.z = -0.2 + f; rig.wingR.rotation.z = 0.2 - f;
      rig.wingL.rotation.y = 0.3; rig.wingR.rotation.y = -0.3;
    }
    if (rig.flame) rig.flame.scale.set(0.8, 1.5 + Math.sin(now * 12) * 0.2, 0.8);
    if (e.kind === 'building' && e.target) {
      const want = Math.atan2(e.target.x - e.x, e.target.z - e.z);
      e.facing = (e.facing || 0) + angDiff(want, e.facing || 0) * Math.min(1, dt * 8);
      root.rotation.y = e.facing;
    }
    if (flyer && e.alive && Math.random() < dt * 3) this.world.smoke.emit({ x: e.x, y: e.y - 0.2, z: e.z, spread: 0.1, vel: [0, -0.6, 0], life: 0.4, size: 0.18, sizeEnd: 0.5, color: [0.85, 0.8, 0.7, 0.25] });
    // weapon arm: idle swing / attack strike
    const arm = rig.weaponArm;
    if (arm && !rig.building) {
      const base = (arm.userData.baseX ??= arm.rotation.x);
      if (e.attackT >= 0 && e.attackT < 0.55) {
        const t = e.attackT / 0.55;
        if (e.card.projectile) arm.rotation.x = base + Math.sin(t * Math.PI) * 0.25;
        else arm.rotation.x = base + (t < 0.45 ? -2.2 * (t / 0.45) : -2.2 + 3.4 * Math.min(1, (t - 0.45) / 0.25));
      } else {
        arm.rotation.x += ((base + (rig.legL ? -sw * 0.4 : 0)) - arm.rotation.x) * Math.min(1, dt * 10);
      }
      if (rig.armL && rig.armL !== arm && rig.legL && !e.card.projectile) rig.armL.rotation.x = (rig.armL.userData.baseX ??= rig.armL.rotation.x) + sw * 0.4;
    }
    if (rig.orb) rig.orb.scale.setScalar(1 + Math.sin(now * 6) * 0.12);
    // flash on hit
    if (e.flashT > 0) {
      e.flashT -= dt;
      const on = e.flashT > 0;
      for (const m of e.mats) if (m.userData.baseEm) { if (on) m.emissive.setScalar(0.45); else m.emissive.copy(m.userData.baseEm); }
    }
    // stealth
    let alpha = 1;
    const hidden = this.isHidden(e);
    if (hidden) {
      if (e.team === 1) {
        const spotted = this.entities.some((o) => o.alive && o.team === 0 && o.kind !== 'tower' && Math.hypot(o.x - e.x, o.z - e.z) < 1.6 + o.radius);
        alpha = spotted ? 0.6 : 0;
      } else alpha = 0.4;
    }
    if (rig.ghost) alpha *= 0.75 + Math.sin(now * 5 + e.id) * 0.1;
    e.fade += (alpha - e.fade) * Math.min(1, dt * 8);
    root.visible = e.fade > 0.03;
    e.ring.visible = root.visible && e.alive && (e.team === 0 || e.fade > 0.5);
    const needT = e.fade < 0.99;
    for (const m of e.mats) {
      const t = needT || m.userData.origT;
      if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
      m.opacity = m.userData.baseOpacity * e.fade;
    }
    // health bar
    const bar = e.bar;
    const showBar = e.alive && root.visible && (e.hp < e.maxHp - 1 || e.kind === 'building');
    bar.visible = showBar;
    if (showBar) {
      bar.position.set(e.x, e.y + rise + e.height + 0.25, e.z);
      bar.quaternion.copy(cam.quaternion);
      bar.userData.fg.scale.x = Math.max(0.001, e.hp / e.maxHp);
    }
  }

  animateRigged(e, rig, deploying, walking, dt) {
    const sp = rig.spec;
    if (!sp.idle) return; // static models (drones, sentry) have no clips
    if (deploying) {
      playClip(rig, sp.idle || 'Idle', 0.1);
    } else if (e.stunT > 0) {
      if (rig.current) rig.current.timeScale = 0.15;
    } else if (e.attackSeq && e.attackSeq !== e._seenSeq) {
      e._seenSeq = e.attackSeq;
      const atk = Array.isArray(sp.attack) ? sp.attack[e.attackSeq % sp.attack.length] : sp.attack;
      const clip = rig.actions[atk]?.getClip();
      const dur = clip ? clip.duration : 1;
      playClip(rig, atk, 0.08, true, Math.max(1, dur / Math.max(0.35, e.hitSpeed * 0.85)));
      e._attackUntil = dur / (rig.current?.timeScale || 1);
    } else if ((e._attackUntil -= dt) > 0) {
      // let the swing finish
    } else if (walking) {
      if (e.charging && sp.run) playClip(rig, sp.run, 0.15, false, 1.1);
      else playClip(rig, sp.move, 0.2, false, /Run/.test(sp.move) ? e.speed / 2.0 : e.speed / 1.1);
    } else {
      playClip(rig, sp.idle || 'Idle', 0.25);
    }
    rig.mixer.update(dt);
    syncWeapon(rig, e.view.root);
    e.moving = false;
  }

  dispose() {
    for (const e of this.entities) { this.scene.remove(e.view.root); if (e.bar) this.scene.remove(e.bar, e.ring); }
    for (const c of this.corpses) this.scene.remove(c.e.view.root, c.e.bar, c.e.ring);
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const fx of this.effects) fx.dispose?.();
    for (const j of this.junk) this.scene.remove(j);
  }
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

import * as THREE from 'three';
import {
  ARENA, RIFT_HALF, TOWERS, CARDS, SPIKES, SPIKE_WARN, SPIKE_UP, SPIKE_DMG, ALTAR, SOULS, MATCH, FACTION,
} from './config.js';
import { F } from './nav.js';
import { buildModel, bellTower, cathedralKeep, healthBar, teamMats, crow, playClip } from './models.js';
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
    this.spikeUp = SPIKES.map(() => false);
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

  spikeState(def) {
    const ph = ((this.time + def.offset) % def.period + def.period) % def.period;
    const up = ph >= def.period - SPIKE_UP;
    const warn = !up && ph >= def.period - SPIKE_UP - SPIKE_WARN;
    return { up, warn };
  }

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
    model.root.scale.setScalar(card.type === 'building' ? 1.2 : 1.6);
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
      view: model, mats, bar, ring, height: model.height * (card.type === 'building' ? 1.2 : 1.6), deployT, deployMax: deployT, revealT: 0, inThicket: false,
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
    if (key === 'hellfire') this.hellfire(team, card, x, z);
    else if (key === 'crows') this.crowStorm(team, card, x, z);
    else if (key === 'raise') this.raiseDead(team, card, x, z);
  }

  spellTargets(team, x, z, r, cb) {
    for (const e of this.entities) {
      if (!e.alive || e.team === team) continue;
      if (Math.hypot(e.x - x, e.z - z) <= r + e.radius * 0.5) cb(e);
    }
  }

  hellfire(team, card, x, z) {
    const geo = new THREE.SphereGeometry(0.45, 12, 10);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.0, 0.2) });
    const ball = new THREE.Mesh(geo, mat);
    const sx = x + (team === 0 ? 3 : -3), sz = z + (team === 0 ? 9 : -9);
    ball.position.set(sx, 16, sz);
    this.scene.add(ball);
    const light = new THREE.PointLight(0xff6a20, 40, 10, 1.4);
    ball.add(light);
    const dur = 0.85;
    this.audio.play('whoosh');
    this.effects.push({ t: 0, dur, update: (fx) => {
      const k = Math.min(1, fx.t / dur);
      const e = k * k;
      ball.position.set(sx + (x - sx) * e, 16 * (1 - e) + 0.3, sz + (z - sz) * e);
      this.world.fx.emit({ x: ball.position.x, y: ball.position.y, z: ball.position.z, count: 3, spread: 0.2, velRand: 0.6, life: 0.5, size: 0.5, sizeEnd: 0.1, color: [1.4, 0.45, 0.1, 1] });
      this.world.smoke.emit({ x: ball.position.x, y: ball.position.y, z: ball.position.z, count: 1, spread: 0.2, velRand: 0.2, life: 1.4, size: 0.5, sizeEnd: 2, color: [0.06, 0.04, 0.04, 0.6] });
      if (k >= 1) {
        this.explode(team, x, z, card.radius, card.dmg, card.towerMul, true);
        return false;
      }
      return true;
    }, dispose: () => { this.scene.remove(ball); geo.dispose(); mat.dispose(); } });
  }

  explode(team, x, z, r, dmg, towerMul, knock) {
    this.spellTargets(team, x, z, r, (e) => {
      this.damage(e, e.kind === 'tower' ? dmg * towerMul : dmg, null);
      if (knock && e.kind === 'unit' && e.mass < 8 && !e.air) {
        const d = Math.hypot(e.x - x, e.z - z) || 1;
        const nx = e.x + ((e.x - x) / d) * 0.6, nz = e.z + ((e.z - z) / d) * 0.6;
        if (this.nav.walkable(nx, nz)) { e.x = nx; e.z = nz; }
      }
    });
    const fx = this.world.fx, sm = this.world.smoke;
    fx.emit({ x, y: 0.3, z, count: 90, spread: 0.4, vel: [0, 3, 0], velRand: 2.5, radial: r * 2.6, gravity: 3, drag: 1.6, life: 0.9, size: 0.4, sizeEnd: 0.05, color: [1.5, 0.5, 0.12, 1], colorJitter: 0.5 });
    sm.emit({ x, y: 0.5, z, count: 40, spread: r * 0.5, vel: [0, 1.2, 0], velRand: 0.6, radial: 1.2, drag: 0.8, life: 2.6, size: 0.9, sizeEnd: 3, color: [0.05, 0.035, 0.03, 0.75] });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1, 0.3), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.08, z);
    const scorch = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.2, r * 2.2), new THREE.MeshBasicMaterial({ map: this.scorchTex ||= rubbleDecal(), transparent: true, depthWrite: false, opacity: 0.85 }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.set(x, 0.03, z); scorch.renderOrder = 3;
    const light = new THREE.PointLight(0xff7a30, 45, r * 5, 1.4);
    light.position.set(x, 1.5, z);
    this.scene.add(ring, scorch, light);
    this.shake = Math.max(this.shake, 0.5);
    this.audio.play('boom');
    this.effects.push({ t: 0, dur: 8, update: (f, dt) => {
      const k = f.t;
      const rr = Math.min(1, k / 0.35);
      ring.scale.setScalar(1 + rr * r * 2.2);
      ring.material.opacity = Math.max(0, 1 - rr);
      light.intensity = Math.max(0, 45 * (1 - k / 0.5));
      scorch.material.opacity = 0.85 * Math.max(0, 1 - Math.max(0, k - 5) / 3);
      return k < f.dur;
    }, dispose: () => { this.scene.remove(ring, scorch, light); ring.geometry.dispose(); scorch.geometry.dispose(); } });
  }

  crowStorm(team, card, x, z) {
    for (let w = 0; w < card.waves; w++) {
      const delay = 0.15 + w * 0.5;
      const birds = [];
      for (let i = 0; i < 9; i++) {
        const c = crow(); c.scale.setScalar(1.6);
        c.visible = false; this.scene.add(c);
        const ang = Math.random() * Math.PI * 2;
        birds.push({ c, ox: Math.cos(ang) * card.radius * Math.random(), oz: Math.sin(ang) * card.radius * Math.random(), sx: x + (Math.random() - 0.5) * 6, sz: z + (team === 0 ? 10 : -10), ph: Math.random() * 6 });
      }
      let hit = false;
      const T = 0.65;
      this.effects.push({ t: -delay, dur: T + 0.6, update: (f) => {
        if (f.t < 0) return true;
        const k = f.t / T;
        for (const b of birds) {
          b.c.visible = true;
          const tx = x + b.ox, tz = z + b.oz;
          let px, py, pz;
          if (k < 1) {
            px = b.sx + (tx - b.sx) * k; pz = b.sz + (tz - b.sz) * k; py = 7 * (1 - k) * (1 - k) + 0.4;
          } else {
            const u = k - 1;
            px = tx + b.ox * u; pz = tz + b.oz * u; py = 0.4 + u * 9;
          }
          b.c.lookAt(px + (tx - b.sx) * 0.1, py, pz + (tz - b.sz) * 0.1);
          b.c.position.set(px, py, pz);
          const wf = Math.sin(f.t * 30 + b.ph) * 0.8;
          b.c.userData.wings[0].rotation.z = wf; b.c.userData.wings[1].rotation.z = -wf;
        }
        if (!hit && k >= 1) {
          hit = true;
          this.spellTargets(team, x, z, card.radius, (e) => this.damage(e, e.kind === 'tower' ? card.dmg * card.towerMul : card.dmg, null));
          this.world.smoke.emit({ x, y: 0.4, z, count: 40, spread: card.radius * 0.7, spreadY: 0.2, vel: [0, 0.8, 0], velRand: 1, gravity: 0.6, life: 1.6, size: 0.14, sizeEnd: 0.8, color: [0.03, 0.03, 0.04, 0.95] });
          this.world.fx.emit({ x, y: 0.3, z, count: 20, spread: card.radius * 0.6, spreadY: 0.1, velRand: 1.2, life: 0.5, size: 0.15, color: [1.8, 0.1, 0.08, 1] });
          this.audio.play('caw');
        }
        return f.t < f.dur;
      }, dispose: () => birds.forEach((b) => this.scene.remove(b.c)) });
    }
    // marker ring so the target area reads
    this.areaMarker(team, x, z, card.radius, 1.6);
  }

  areaMarker(team, x, z, r, dur) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(FACTION[team].glow).multiplyScalar(1.4), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r, 48), mat);
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.06, z); ring.renderOrder = 9;
    this.scene.add(ring);
    this.effects.push({ t: 0, dur, update: (f) => { mat.opacity = 0.8 * (1 - f.t / f.dur); return f.t < f.dur; }, dispose: () => { this.scene.remove(ring); ring.geometry.dispose(); mat.dispose(); } });
  }

  raiseDead(team, card, x, z) {
    const mat = new THREE.MeshBasicMaterial({ map: this.runeTex, transparent: true, depthWrite: false, color: new THREE.Color(FACTION[team].glow).multiplyScalar(1.6), blending: THREE.AdditiveBlending, opacity: 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(card.radius * 2.3, card.radius * 2.3), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); m.renderOrder = 8;
    this.scene.add(m);
    let spawned = 0;
    const every = card.duration / card.spawnCount;
    this.audio.play('toll');
    this.effects.push({ t: 0, dur: card.duration + 0.8, update: (f, dt) => {
      mat.opacity = Math.min(1, f.t * 2) * (f.t > card.duration ? Math.max(0, 1 - (f.t - card.duration) / 0.8) : 0.8);
      m.rotation.z -= dt * 0.4;
      while (spawned < card.spawnCount && f.t >= 0.5 + spawned * every) {
        spawned++;
        for (let tries = 0; tries < 8; tries++) {
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * card.radius;
          const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
          if (this.nav.walkable(px, pz) && Math.abs(px) < ARENA.halfW - 0.3 && Math.abs(pz) < ARENA.halfL - 0.3) {
            this.createUnit(team, card.spawn, px, pz, 0.5);
            this.world.smoke.emit({ x: px, y: 0.1, z: pz, count: 8, spread: 0.2, vel: [0, 0.6, 0], velRand: 0.4, life: 1.2, size: 0.3, sizeEnd: 1.5, color: [0.12, 0.1, 0.08, 0.8] });
            break;
          }
        }
      }
      return f.t < f.dur;
    }, dispose: () => { this.scene.remove(m); m.geometry.dispose(); mat.dispose(); } });
  }

  // ---------- combat ----------
  isHidden(e) { return e.inThicket && e.revealT <= 0 && e.deployT <= 0; }

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
    if (e.kind === 'tower' && e.sub === 'keep' && !e.active) this.activateKeep(e);
    if (src && src.card?.lifesteal && src.alive) src.hp = Math.min(src.maxHp, src.hp + amount * src.card.lifesteal);
    if (e.hp <= 0) this.kill(e);
  }

  activateKeep(k) {
    if (k.active || !k.alive) return;
    k.active = true;
    k.view.rig.statueEyes.visible = true;
    this.hooks.onMessage?.(k.team === 0 ? 'Your Cathedral Keep awakens' : 'The rival Keep awakens', k.team);
    this.audio.play('toll');
  }

  kill(e) {
    e.alive = false; e.hp = 0;
    const c = FACTION[e.team].glow;
    const col = [((c >> 16) & 255) / 110, ((c >> 8) & 255) / 110, (c & 255) / 110, 1];
    if (e.kind === 'tower') return this.destroyTower(e);
    if (e.structure) this.nav.setStructure(e.x, e.z, e.half, false);
    this.world.fx.emit({ x: e.x, y: e.y + 0.5, z: e.z, count: 18, spread: 0.25, vel: [0, 1.6, 0], velRand: 0.5, life: 1.4, size: 0.18, color: col });
    this.world.smoke.emit({ x: e.x, y: e.y + 0.3, z: e.z, count: 6, spread: 0.3, vel: [0, 0.4, 0], velRand: 0.3, life: 1.2, size: 0.4, sizeEnd: 1.6, color: [0.08, 0.07, 0.07, 0.6] });
    this.audio.play(e.card?.model === 'skeleton' ? 'bones' : 'death');
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
    const geoMat = {
      bolt: () => [new THREE.BoxGeometry(0.035, 0.035, 0.45), new THREE.MeshBasicMaterial({ color: new THREE.Color(FACTION[src.team].glow).multiplyScalar(1.5) })],
      blood: () => [new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.08, 0.06) })],
      soul: () => [new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(FACTION[src.team].glow).multiplyScalar(3) })],
    }[kind]();
    const mesh = new THREE.Mesh(geoMat[0], geoMat[1]);
    const y0 = src.kind === 'tower' ? src.muzzleY : src.kind === 'building' ? 1.3 : (src.y || 0) + src.height * 0.6;
    mesh.position.set(src.x, y0, src.z);
    this.scene.add(mesh);
    this.projectiles.push({
      team: src.team, src, target, kind, mesh, x: src.x, y: y0, z: src.z,
      tx: target.x, ty: (target.y || 0) + 0.5, tz: target.z,
      speed: kind === 'bolt' ? 16 : kind === 'blood' ? 8 : 11,
      dmg: src.dmg, splash: src.card?.splash || 0, hitsAir: src.hitsAir,
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
      fx.emit({ x: p.x, y: p.y, z: p.z, count: 26, spread: 0.1, velRand: 2.2, gravity: 4, life: 0.6, size: 0.18, color: [1.8, 0.05, 0.04, 1] });
      this.audio.play('splat');
    } else if (p.target.alive) {
      this.damage(p.target, p.dmg, p.src);
      const c = FACTION[p.team].glow;
      fx.emit({ x: p.x, y: p.y, z: p.z, count: 8, spread: 0.05, velRand: 1.5, life: 0.35, size: 0.12, color: [((c >> 16) & 255) / 100, ((c >> 8) & 255) / 100, (c & 255) / 100, 1] });
      this.audio.play(p.kind === 'bolt' ? 'thunk' : 'zap');
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
      this.hooks.onMessage?.('Sudden death — the next spire to fall decides it', null);
      this.audio.play('toll');
    } else if (this.phase === 'overtime' && this.time >= MATCH.regulation + MATCH.overtime) {
      return this.finish(true);
    }
    if (!this._doubled && this.doubleSouls()) { this._doubled = true; this.hooks.onMessage?.('The bells quicken — souls flow twice as fast', null); this.audio.play('toll'); }

    // souls
    for (const p of this.players) {
      let rate = SOULS.regen * (this.doubleSouls() ? 2 : 1);
      if (this.altar.owner === p.team) rate *= 1 + ALTAR.bonus;
      p.souls = Math.min(SOULS.max, p.souls + rate * dt);
    }

    this.updateHazards();
    this.updateAltar(dt);

    for (const e of this.entities) {
      if (!e.alive) continue;
      if (e.deployT > 0) { e.deployT -= dt; continue; }
      e.revealT = Math.max(0, e.revealT - dt);
      e.slowT = Math.max(0, e.slowT - dt);
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

  updateHazards() {
    SPIKES.forEach((s, i) => {
      const { up } = this.spikeState(s);
      if (up && !this.spikeUp[i]) {
        let any = false;
        for (const e of this.entities) {
          if (!e.alive || e.air || e.kind !== 'unit') continue;
          if (Math.abs(e.x - s.x) < s.hx + e.radius * 0.5 && Math.abs(e.z - s.z) < s.hz + e.radius * 0.5) {
            this.damage(e, SPIKE_DMG, null);
            e.slowT = 0.6;
            any = true;
            this.world.fx.emit({ x: e.x, y: 0.4, z: e.z, count: 10, spread: 0.1, vel: [0, 2, 0], velRand: 1.2, gravity: 6, life: 0.5, size: 0.1, color: [1.4, 0.05, 0.04, 1] });
          }
        }
        this.world.smoke.emit({ x: s.x, y: 0.1, z: s.z, count: 10, spread: s.hx, spreadY: 0, vel: [0, 0.5, 0], life: 0.8, size: 0.3, sizeEnd: 1.2, color: [0.2, 0.18, 0.16, 0.5] });
        this.audio.play(any ? 'spikeHit' : 'spike', s.x, s.z);
      }
      this.spikeUp[i] = up;
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
        this.hooks.onMessage?.(a.owner === 0 ? 'The Pale Saint heeds you — souls quicken' : 'The rival claims the Altar', a.owner);
        this.audio.play('chime');
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
    const proj = e.kind === 'tower' ? 'soul' : e.card?.projectile;
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
      this.audio.play(e.card?.model === 'colossus' ? 'smash' : 'clang');
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
    this.audio.play('rustle');
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
      if (p.kind !== 'bolt') {
        const c = p.kind === 'blood' ? [1.6, 0.04, 0.03, 1] : (() => { const g = FACTION[p.team].glow; return [((g >> 16) & 255) / 120, ((g >> 8) & 255) / 120, (g & 255) / 120, 1]; })();
        this.world.fx.emit({ x: p.x, y: p.y, z: p.z, count: 2, spread: 0.04, velRand: 0.2, life: 0.35, size: p.kind === 'blood' ? 0.22 : 0.16, sizeEnd: 0.1, color: c });
      }
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
        if (rig.bell) {
          const swing = e.attackT >= 0 && e.attackT < 0.6 ? Math.sin(e.attackT * 18) * 0.3 * (1 - e.attackT / 0.6) : 0;
          rig.bell.rotation.z = swing;
          rig.flame.scale.setScalar(1 + Math.sin(now * 9 + e.x) * 0.15);
        }
        if (rig.statue && e.active && e.target) {
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
      if (rig.gltf) {
        if (!c.played) { c.played = true; playClip(rig, rig.spec.death || 'Death_A', 0.1, true, 1.3); }
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
    const rise = deploying && !(rig.gltf && rig.actions.Spawn_Ground_Skeletons) ? (flyer ? (1 - k) * 2.5 : -(1 - k) * (1 - k) * e.height * 0.9) : 0;
    root.position.set(e.x, e.y + rise, e.z);
    e.ring.position.set(e.x, 0.035, e.z);
    if (e.facingTarget !== undefined && e.kind === 'unit') {
      e.facing += angDiff(e.facingTarget, e.facing) * Math.min(1, dt * 10);
      root.rotation.y = e.facing;
    }
    const walking = e.moving && !deploying && e.alive;
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
    if (rig.building) {
      rig.flame.scale.set(0.8, 1.5 + Math.sin(now * 12) * 0.2, 0.8);
      rig.body.rotation.z = Math.sin(now * 1.3) * 0.08;
    }
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
    if (deploying) {
      if (!e._spawned) { e._spawned = true; if (rig.actions.Spawn_Ground_Skeletons) playClip(rig, 'Spawn_Ground_Skeletons', 0, true, 2.2 / Math.max(0.4, e.deployMax)); }
    } else if (e.attackSeq && e.attackSeq !== e._seenSeq) {
      e._seenSeq = e.attackSeq;
      const atk = Array.isArray(sp.attack) ? sp.attack[e.attackSeq % sp.attack.length] : sp.attack;
      const clip = rig.actions[atk]?.getClip();
      const dur = clip ? clip.duration : 1;
      playClip(rig, atk, 0.08, true, Math.max(1, dur / Math.max(0.35, e.hitSpeed * 0.85)));
      e._attackUntil = dur / rig.current.timeScale;
    } else if ((e._attackUntil -= dt) > 0) {
      // let the swing finish
    } else if (walking) {
      if (e.charging && sp.run) playClip(rig, sp.run, 0.15, false, 1.1);
      else playClip(rig, sp.move, 0.2, false, sp.move === 'Running_A' ? e.speed / 2.2 : sp.move === 'Walk' ? e.speed / 1.1 : sp.move === 'Fast_Flying' ? 1 : e.speed / 1.0);
    } else {
      playClip(rig, sp.idle || 'Idle', 0.25);
    }
    rig.mixer.update(dt);
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

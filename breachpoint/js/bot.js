import { CARDS, MAP, ROUTES, EMOTES } from './config.js';

// just inside our deploy zone, in the bot's frame (its base is at -z)
const edge = () => -(MAP.deployEdge + 0.5);

// Rival AI. Plays the rival team (1, -z side). Ignores units it cannot see (hidden in thickets).
const ROLE = {
  recruit: ['ranged'], rifle: ['ranged', 'antiAir'], smg: ['swarm', 'antiAir', 'dps'], sniper: ['ranged', 'antiAir'], heavy: ['tank', 'splash'],
  mech: ['tank', 'win'], k9: ['melee', 'dps'], breacher: ['win', 'melee'], drone: ['air', 'antiAir'], swarm: ['air', 'antiAir', 'swarm'],
  sentry: ['building', 'antiAir'], frag: ['spell'], smoke: ['support'], flash: ['spell'], molotov: ['spell'],
  ghost: ['melee', 'dps'], riot: ['tank', 'melee'], medic: ['support', 'escort'], engineer: ['support', 'melee'],
  commander: ['support', 'escort', 'ranged'], medevac: ['support', 'escort'], grenadier: ['ranged', 'splash'],
  rocket: ['ranged', 'antiAir', 'antiArmor'], apc: ['tank', 'antiAir'], mortar: ['building', 'splash'],
  barricade: ['building'], airstrike: ['spell'], emp: ['spell'], adrenaline: ['support', 'escort'],
};

export function rivalDeck() {
  const keys = Object.keys(CARDS).filter((k) => !CARDS[k].minion);
  for (let tries = 0; tries < 200; tries++) {
    const d = keys.slice().sort(() => Math.random() - 0.5).slice(0, 8);
    const has = (f) => d.filter((k) => f(k)).length;
    const air = has((k) => CARDS[k].hitsAir);
    const spell = has((k) => CARDS[k].type === 'spell' && !['smoke', 'adrenaline'].includes(k));
    const win = has((k) => ROLE[k].includes('tank') || ROLE[k].includes('win'));
    const escort = has((k) => ROLE[k].includes('escort'));
    const build = has((k) => CARDS[k].type === 'building');
    if (air >= 3 && spell >= 1 && spell <= 3 && win >= 1 && escort <= 2 && build <= 2) return d;
  }
  return ['rifle', 'smg', 'k9', 'drone', 'mech', 'heavy', 'frag', 'sentry'];
}

export class Bot {
  constructor(sim, skill, hooks, team = 1) {
    this.sim = sim; this.team = team;
    this.Z = (z) => (team === 1 ? z : -z); // bot reasons in the rival frame (its side is -z)
    this.skill = skill; // 0..1
    this.hooks = hooks || {};
    this.thinkT = 2.5;
    this.pending = [];
    this.pushLane = null;
    this.saveFor = 8.5 + Math.random();
    this.emoteCd = 6;
  }

  get me() { return this.sim.players[this.team]; }

  visibleEnemies() {
    return this.sim.entities.filter((e) => e.alive && e.team !== this.team && e.kind === 'unit' && !this.sim.isHidden(e))
      .map((e) => ({ ...e, z: this.Z(e.z), ref: e }));
  }

  update(dt) {
    const sim = this.sim;
    if (sim.over) return;
    this.emoteCd -= dt;
    for (const p of this.pending) p.t -= dt;
    const ready = this.pending.filter((p) => p.t <= 0);
    this.pending = this.pending.filter((p) => p.t > 0);
    for (const p of ready) this.tryPlay(p.key, p.x, p.z);

    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    const sk = this.skill;
    this.thinkT = (1.1 - sk * 0.75) * (0.7 + Math.random() * 0.6);
    const souls = this.me.souls;

    // threats: enemy troops on our side of the river or closing on one of our outposts
    const mine = sim.towers.filter((t) => t.alive && t.team === this.team).map((t) => ({ t, x: t.x, z: this.Z(t.z) }));
    const threats = this.visibleEnemies().filter((e) => !e.ref.minion || e.z < -8)
      .filter((e) => e.z < 2.5 || mine.some((t) => Math.hypot(t.x - e.x, t.z - e.z) < t.t.range + 2.5));
    if (threats.length) { if (this.defend(threats, mine)) return; }

    // spell finisher on an exposed outpost
    for (const t of sim.towers) {
      if (!t.alive || t.team === this.team || sim.isProtected(t)) continue;
      const hand = this.me.hand;
      if (hand.includes('frag') && t.hp <= CARDS.frag.dmg * CARDS.frag.towerMul && souls >= CARDS.frag.cost) {
        return this.queue('frag', t.x, this.Z(t.z), 0.3);
      }
    }
    // opportunistic spell on clustered enemies anywhere
    const cluster = this.cluster(this.visibleEnemies().filter((e) => !e.ref.minion), 2.4);
    if (cluster && cluster.count >= 4 && Math.random() < 0.3 + sk * 0.5) {
      const k = this.pickSpell(cluster);
      if (k) return this.queue(k, cluster.x, cluster.z + 0.6, 0.2);
    }

    // river objectives: contest whatever the rival holds, or grab free ones when flush
    for (const ob of sim.objectives) {
      const foe = ob.owner === 1 - this.team, free = ob.owner === null;
      if ((foe && souls >= 5 && Math.random() < 0.2 + sk * 0.25) || (free && souls >= 7 && Math.random() < 0.12 + sk * 0.15)) {
        const cheap = this.me.hand.find((k) => ['smg', 'k9', 'rifle', 'heavy'].includes(k) && CARDS[k].cost <= souls);
        if (cheap) return this.queue(cheap, ob.def.x + (Math.random() - 0.5), edge() - 0.4, 0.2);
      }
    }

    // build a push
    const full = souls >= Math.min(9.6, this.saveFor + (1 - sk) * 0.8);
    if (full || (sim.doubleSouls() && souls >= 7)) {
      this.attack();
      this.saveFor = 7 + Math.random() * 2.5;
    }

    if (this.emoteCd <= 0 && Math.random() < 0.04) this.emote(EMOTES[Math.floor(Math.random() * EMOTES.length)]);
  }

  emote(text) {
    if (this.emoteCd > 0) return;
    this.emoteCd = 12 + Math.random() * 10;
    this.hooks.onEmote?.(text);
  }

  queue(key, x, z, delay) {
    if (this.pending.some((p) => p.t <= 1)) return true;
    const jitter = (1 - this.skill) * 0.9;
    this.pending.push({ key, x: x + (Math.random() - 0.5) * jitter, z: z + (Math.random() - 0.5) * jitter, t: delay + (1 - this.skill) * Math.random() * 0.8 });
    return true;
  }

  tryPlay(key, x, z) {
    const sim = this.sim;
    const idx = this.me.hand.indexOf(key);
    if (idx < 0) return false;
    const T = this.team;
    let px = x, pz = z;
    if (CARDS[key].type !== 'spell') {
      const ok = (xx, zz) => sim.canDeploy(T, key, xx, this.Z(zz));
      if (!ok(px, pz)) {
        pz = Math.min(pz, edge());
        const n = sim.nav.nearestWalkable(px, this.Z(pz), 3);
        if (!n) return false;
        px = n[0]; pz = this.Z(n[1]);
        for (let s = 0; s < 16 && !ok(px, pz); s++) pz -= 0.5;
        if (!ok(px, pz)) return false;
      }
    }
    return sim.play(T, idx, px, this.Z(pz));
  }

  cluster(list, r) {
    let best = null;
    for (const a of list) {
      let n = 0, sx = 0, sz = 0, hp = 0;
      for (const b of list) if (Math.hypot(a.x - b.x, a.z - b.z) < r) { n++; sx += b.x; sz += b.z; hp += b.hp; }
      if (!best || n > best.count) best = { count: n, x: sx / n, z: sz / n, hp };
    }
    return best;
  }

  pickSpell(cl) {
    const h = this.me.hand, s = this.me.souls;
    if (h.includes('molotov') && s >= 4 && cl.hp / cl.count < 400) return 'molotov';
    if (h.includes('frag') && s >= 3 && cl.hp > 400) return 'frag';
    if (h.includes('flash') && s >= 2 && cl.count >= 3) return 'flash';
    return null;
  }

  defend(threats, mine) {
    const me = this.me;
    const c = this.cluster(threats, 2.6);
    const main = threats.reduce((a, b) => (b.hp > a.hp ? b : a));
    const anyAir = threats.some((t) => t.air);
    const allAir = threats.every((t) => t.air);
    const swarm = c.count >= 3;
    const urgent = threats.some((t) => mine.some((m) => Math.hypot(m.x - t.x, m.z - t.z) < m.t.range + 1));
    const score = (k) => {
      const card = CARDS[k], r = ROLE[k];
      if (card.cost > me.souls) return -1;
      let s = 1;
      if (card.noAttack && card.type !== 'building') return -1;
      if (k === 'adrenaline' || k === 'engineer') return -1;
      if (k === 'emp') return anyAir || main.card.vehicle || main.card.model === 'mech' ? 3 + Math.random() : -1;
      if (r.includes('escort')) s -= 1.5;
      if (r.includes('antiArmor') && (main.card.vehicle || main.card.model === 'mech' || main.air)) s += 3;
      if (card.type === 'spell') {
        if (k === 'smoke') return -1;
        if (!swarm && !(k === 'flash' && c.hp > 1200)) return -1;
        s += c.count * 0.8 + (k === 'molotov' && c.hp / c.count < 400 ? 2 : 0) + (k === 'frag' && c.hp > 600 ? 2 : 0) + (k === 'flash' && c.hp > 1200 ? 2 : 0);
      }
      if (allAir && !card.hitsAir && card.type !== 'spell') return -1;
      if (anyAir && card.hitsAir) s += 2;
      if (main.buildingsOnly && (r.includes('dps') || r.includes('swarm') || r.includes('building'))) s += 3;
      if (swarm && r.includes('splash')) s += 3;
      if (swarm && r.includes('swarm')) s -= 1;
      if (main.card.projectile && (r.includes('melee') || r.includes('air'))) s += 1.5;
      if (r.includes('tank') && card.cost >= 6) s -= 2;
      s -= card.cost * 0.25;
      return s + Math.random() * (1.4 - this.skill);
    };
    let best = null, bs = 0;
    for (const k of me.hand) { const s = score(k); if (s > bs) { bs = s; best = k; } }
    if (!best) return false;
    // let a lone push come under our outposts unless it's already hurting us
    if (!urgent && main.z > -4 && Math.random() < 0.6) return false;
    const card = CARDS[best];
    let x, z;
    if (card.type === 'spell') { x = c.x; z = c.z - 0.4; }
    else {
      // between the threat and the outpost it is heading for
      const guard = mine.slice().sort((a, b) => Math.hypot(a.x - main.x, a.z - main.z) - Math.hypot(b.x - main.x, b.z - main.z))[0];
      const gx = guard ? guard.x : main.x, gz = guard ? guard.z : -20;
      const back = card.type === 'building' ? 2.6 : card.range > 2 ? 2.4 : 1.0;
      const dx = main.x - gx, dz = main.z - gz, d = Math.hypot(dx, dz) || 1;
      const k = Math.max(0, Math.min(1, (d - back - 1.5) / d));
      x = gx + dx * k; z = Math.min(edge(), gz + dz * k);
    }
    this.queue(best, x, z, 0.1);
    if (main.card.cost >= 5 && Math.random() < 0.3) this.emote('Hold the line.');
    return true;
  }

  // x of a lane's route where it crosses depth z (bot frame)
  laneX(id, z) {
    const r = this.sim.route(this.team, id).map((p) => ({ x: p.x, z: this.Z(p.z) }));
    for (let i = 0; i < r.length - 1; i++) {
      const a = r[i], b = r[i + 1];
      if ((a.z - z) * (b.z - z) <= 0 && a.z !== b.z) return a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
    }
    return r.reduce((best, p) => (Math.abs(p.z - z) < Math.abs(best.z - z) ? p : best)).x;
  }

  // lane to push: the one whose next exposed enemy outpost is weakest
  pickLane() {
    const sim = this.sim;
    let best = null;
    for (const id of Object.keys(ROUTES)) {
      const lane = { id };
      const t = sim.towers.filter((o) => o.alive && o.team !== this.team && o.lane === id && !sim.isProtected(o) && o.sub !== 'keep')
        .sort((a, b) => a.tier - b.tier)[0];
      const keepOpen = sim.towers.find((o) => o.alive && o.team !== this.team && o.sub === 'keep' && !sim.isProtected(o));
      const target = t || keepOpen;
      const score = (target ? 1 - target.hp / target.maxHp + (target.sub === 'keep' ? 1 : 0) : -0.5) + Math.random() * 0.6;
      if (!best || score > best.score) best = { id, lane, target, score };
    }
    return best;
  }

  attack() {
    const sim = this.sim, me = this.me;
    const pick = this.pickLane();
    // forward base: our deploy zone around the enemy outpost we already took in this lane
    const taken = sim.towers.filter((o) => !o.alive && o.team !== this.team && o.lane === pick.id).sort((a, b) => b.tier - a.tier)[0];
    const frontZ = taken ? this.Z(taken.z) - 1.5 : edge() - 0.3;
    const lx = taken ? taken.x : this.laneX(pick.id, frontZ);
    const tank = me.hand.find((k) => ROLE[k].includes('tank') && CARDS[k].cost <= me.souls);
    if (tank) {
      const slow = CARDS[tank].speed < 1;
      const tz = slow && !taken ? -12 : frontZ, tx = slow && !taken ? this.laneX(pick.id, -12) : lx;
      this.queue(tank, tx, tz, 0.1);
      const support = me.hand.find((k) => k !== tank && ROLE[k].includes('escort') && k !== 'adrenaline')
        || me.hand.find((k) => k !== tank && CARDS[k].type === 'unit' && !ROLE[k].includes('tank'));
      if (me.hand.includes('adrenaline') && Math.random() < 0.6) this.pending.push({ key: 'adrenaline', x: tx, z: tz + (slow ? 8 : 4), t: slow ? 12 : 6 });
      if (support) this.pending.push({ key: support, x: tx, z: tz - 1.4, t: slow ? 4 : 1.6 });
      if (me.hand.includes('smoke') && Math.random() < 0.5 && pick.target) this.pending.push({ key: 'smoke', x: pick.target.x, z: this.Z(pick.target.z) - 1.5, t: slow ? 16 : 7 });
      return;
    }
    if (me.hand.includes('breacher') && me.souls >= 4 && Math.random() < 0.5 && pick.target) {
      return this.queue('breacher', lx, frontZ, 0.1);
    }
    // a damaged outpost of ours? send the engineer
    const hurt = sim.towers.find((t) => t.alive && t.team === this.team && t.hp < t.maxHp * 0.7);
    if (hurt && me.hand.includes('engineer') && me.souls >= 3) return this.queue('engineer', hurt.x, this.Z(hurt.z) - 1.5, 0.1);
    if (pick.target && me.hand.includes('airstrike') && me.souls >= 6 && Math.random() < 0.3) {
      const foes = this.visibleEnemies().filter((e) => Math.hypot(e.x - pick.target.x, e.z - this.Z(pick.target.z)) < 6);
      if (foes.length >= 2) { const c = this.cluster(foes, 2.5); return this.queue('airstrike', c.x, c.z, 0.1); }
    }
    if (me.hand.includes('mortar') && me.souls >= 5 && pick.target && Math.random() < 0.35) {
      return this.queue('mortar', lx * 0.9, Math.min(edge(), this.Z(pick.target.z) - 9), 0.1);
    }
    const unit = me.hand.filter((k) => CARDS[k].type === 'unit' && CARDS[k].cost <= me.souls && !ROLE[k].includes('escort')).sort((a, b) => CARDS[b].cost - CARDS[a].cost)[0];
    if (unit) this.queue(unit, lx, frontZ, 0.1);
  }
}

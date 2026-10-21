import { CARDS, WALL_HALF as RIFT_HALF, ALTAR, EMOTES } from './config.js';

// Rival AI. Plays the rival team (1, -z side). Ignores units it cannot see (hidden in thickets).
const ROLE = {
  rifle: ['ranged', 'antiAir'], smg: ['swarm', 'antiAir', 'dps'], sniper: ['ranged', 'antiAir'], heavy: ['tank', 'splash'],
  mech: ['tank', 'win'], k9: ['melee', 'dps'], breacher: ['win', 'melee'], drone: ['air', 'antiAir'], swarm: ['air', 'antiAir', 'swarm'],
  sentry: ['building', 'antiAir'], frag: ['spell'], smoke: ['support'], flash: ['spell'], molotov: ['spell'],
};

export function rivalDeck() {
  const keys = Object.keys(CARDS);
  for (let tries = 0; tries < 200; tries++) {
    const d = keys.slice().sort(() => Math.random() - 0.5).slice(0, 8);
    const has = (f) => d.filter((k) => f(k)).length;
    const air = has((k) => CARDS[k].hitsAir);
    const spell = has((k) => CARDS[k].type === 'spell' && k !== 'smoke');
    const win = has((k) => ROLE[k].includes('tank') || ROLE[k].includes('win'));
    if (air >= 3 && spell >= 1 && spell <= 2 && win >= 1) return d;
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

    const threats = this.visibleEnemies().filter((e) => e.z < 4.5);
    const souls = this.me.souls;

    if (threats.length) { if (this.defend(threats)) return; }

    // spell finisher
    for (const t of sim.towers) {
      if (!t.alive || t.team === this.team) continue;
      const hand = this.me.hand;
      if (hand.includes('frag') && t.hp <= CARDS.frag.dmg * CARDS.frag.towerMul && souls >= CARDS.frag.cost) {
        return this.queue('frag', t.x, this.Z(t.z), 0.3);
      }
    }
    // opportunistic spell on clustered enemies anywhere
    const cluster = this.cluster(this.visibleEnemies(), 2.4);
    if (cluster && cluster.count >= 4 && Math.random() < 0.3 + sk * 0.5) {
      const k = this.pickSpell(cluster);
      if (k) return this.queue(k, cluster.x, cluster.z + 0.6, 0.2);
    }

    // altar: if the player holds it and we have cheap units, contest it
    const altarFoe = sim.altar.owner === 1 - this.team, altarFree = sim.altar.owner === null;
    if ((altarFoe && souls >= 5 && Math.random() < 0.25 + sk * 0.3) || (altarFree && souls >= 7 && Math.random() < 0.15 + sk * 0.2)) {
      const cheap = this.me.hand.find((k) => ['smg', 'k9', 'rifle'].includes(k) && CARDS[k].cost <= souls);
      if (cheap) return this.queue(cheap, (Math.random() - 0.5) * 1.2, -(RIFT_HALF + 0.6), 0.2);
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
      pz = Math.min(pz, -(RIFT_HALF + 0.3));
      const ok = (zz) => sim.canDeploy(T, key, px, this.Z(zz));
      if (!ok(pz)) {
        const n = sim.nav.nearestWalkable(px, this.Z(pz), 3);
        if (!n) return false;
        px = n[0]; pz = this.Z(n[1]);
        // walk back toward our keep until valid
        for (let s = 0; s < 12 && !ok(pz); s++) pz -= 0.5;
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

  defend(threats) {
    const sim = this.sim;
    const me = this.me;
    const c = this.cluster(threats, 2.6);
    const main = threats.reduce((a, b) => (b.hp > a.hp ? b : a));
    const anyAir = threats.some((t) => t.air);
    const allAir = threats.every((t) => t.air);
    const swarm = c.count >= 3;
    const urgent = threats.some((t) => t.z < -2);
    const score = (k) => {
      const card = CARDS[k], r = ROLE[k];
      if (card.cost > me.souls) return -1;
      let s = 1;
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
    // wait for the threat to come closer unless it's already hurting us
    if (!urgent && main.z > 1 && Math.random() < 0.6) return false;
    const card = CARDS[best];
    let x, z;
    if (card.type === 'spell') { x = c.x; z = c.z - 0.4; }
    else if (card.type === 'building') { x = Math.sign(main.x) * 1.2 || 0.8; z = -8.4; }
    else if (card.range > 2) {
      // ranged: behind the nearest friendly tower, away from the threat
      const tw = sim.towers.filter((t) => t.alive && t.team === this.team).sort((a, b) => Math.hypot(a.x - main.x, this.Z(a.z) - main.z) - Math.hypot(b.x - main.x, this.Z(b.z) - main.z))[0];
      x = tw ? tw.x * 0.85 : main.x; z = tw ? this.Z(tw.z) - 1.8 : -10;
    } else {
      x = main.x; z = Math.min(main.z - 1.4, -(RIFT_HALF + 0.5));
    }
    this.queue(best, x, z, 0.1);
    if (main.card.cost >= 5 && Math.random() < 0.3) this.emote('Hold the line.');
    return true;
  }

  attack() {
    const sim = this.sim, me = this.me;
    // pick lane: weakest enemy tower side, or the altar causeway
    const towers = sim.towers.filter((t) => t.alive && t.team !== this.team && t.sub === 'bell');
    let lane;
    const r = Math.random();
    if (r < 0.22) lane = 0;
    else if (towers.length) lane = towers.reduce((a, b) => (b.hp < a.hp ? b : a)).x > 0 ? 6.2 : -6.2;
    else lane = Math.random() < 0.5 ? -4 : 4;
    const tank = me.hand.find((k) => ROLE[k].includes('tank') && CARDS[k].cost <= me.souls);
    if (tank) {
      const tz = CARDS[tank].speed < 1 ? -13.2 : -4.0;
      const tx = CARDS[tank].speed < 1 ? Math.sign(lane || 1) * 2.4 : lane * 0.95;
      this.queue(tank, tx, tz, 0.1);
      const support = me.hand.find((k) => k !== tank && CARDS[k].type === 'unit' && !ROLE[k].includes('tank'));
      if (support) this.pending.push({ key: support, x: tx * 0.9, z: tz - 1.2, t: CARDS[tank].speed < 1 ? 4.5 : 1.6 });
      if (me.hand.includes('smoke') && Math.random() < 0.5) this.pending.push({ key: 'smoke', x: tx, z: 6.5, t: CARDS[tank].speed < 1 ? 14 : 6 });
      return;
    }
    if (me.hand.includes('breacher') && me.souls >= 4 && Math.random() < 0.5 && towers.length) {
      const t = towers[Math.floor(Math.random() * towers.length)];
      return this.queue('breacher', t.x * 0.9, -(RIFT_HALF + 0.6), 0.1);
    }
    const unit = me.hand.filter((k) => CARDS[k].type === 'unit' && CARDS[k].cost <= me.souls).sort((a, b) => CARDS[b].cost - CARDS[a].cost)[0];
    if (unit) this.queue(unit, lane * 0.95, -(RIFT_HALF + 0.5), 0.1);
  }
}

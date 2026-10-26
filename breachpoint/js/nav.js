import {
  ARENA, RIVER, LANES, TUNNEL_COVER, BLOCKS, SANDS, MINES, MINE, OBJECTIVES,
} from './config.js';

export const F = { BLOCK: 1, MIRE: 2, SPIKE: 4, THICKET: 8, RIFT: 16, STRUCT: 32 };

const COLS = Math.round((ARENA.halfW * 2) / ARENA.cell);
const ROWS = Math.round((ARENA.halfL * 2) / ARENA.cell);

// Features are listed for the player half; the rival half mirrors z.
export const mirrored = (list) => list.flatMap((f) => [f, { ...f, z: -f.z }]);
// Blocks and hazards are authored for the left player quadrant; mirror x too (unless marked or centred).
export const quad = (list) => mirrored(list.flatMap((f) => (f.noMirrorX || Math.abs(f.x) < 0.01 ? [f] : [f, { ...f, x: -f.x }])));

export const ALL_BLOCKS = quad(BLOCKS);
export const ALL_SANDS = quad(SANDS);
export const ALL_MINES = quad(MINES);

export const onBridge = (x) => Object.values(LANES).some((l) => Math.abs(x - l.x) < l.half);
export const nearObjective = (x, z) => OBJECTIVES.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 0.4);
export const isRiverAt = (x, z) => Math.abs(z) < RIVER.half && !onBridge(x) && !nearObjective(x, z);
export const isRiftAt = () => false;

export class NavGrid {
  constructor() {
    this.cols = COLS; this.rows = ROWS; this.cell = ARENA.cell;
    this.flags = new Uint8Array(COLS * ROWS);
    this.structCount = new Uint8Array(COLS * ROWS);
    this.build();
  }

  idx(c, r) { return r * this.cols + c; }
  cellOf(x, z) {
    const c = Math.floor((x + ARENA.halfW) / this.cell);
    const r = Math.floor((z + ARENA.halfL) / this.cell);
    return [c, r];
  }
  center(c, r) { return [-ARENA.halfW + (c + 0.5) * this.cell, -ARENA.halfL + (r + 0.5) * this.cell]; }
  inBounds(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }

  build() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const [x, z] = this.center(c, r);
        let f = 0;
        for (const m of ALL_BLOCKS) if (Math.abs(x - m.x) < m.hx && Math.abs(z - m.z) < m.hz) f |= F.BLOCK;
        if (Math.abs(x - TUNNEL_COVER.x) < TUNNEL_COVER.hx && Math.abs(z - TUNNEL_COVER.z) < TUNNEL_COVER.hz) f |= F.THICKET;
        if (isRiverAt(x, z)) f |= F.MIRE;
        for (const m of ALL_SANDS) if (Math.hypot(x - m.x, z - m.z) < m.r) f |= F.MIRE;
        for (const m of ALL_MINES) if (Math.hypot(x - m.x, z - m.z) < MINE.radius) f |= F.SPIKE;
        this.flags[this.idx(c, r)] = f;
      }
    }
  }

  // Towers and placed buildings occupy cells until destroyed.
  setStructure(x, z, half, on) {
    const [c0, r0] = this.cellOf(x - half + 0.01, z - half + 0.01);
    const [c1, r1] = this.cellOf(x + half - 0.01, z + half - 0.01);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!this.inBounds(c, r)) continue;
      const i = this.idx(c, r);
      this.structCount[i] = Math.max(0, this.structCount[i] + (on ? 1 : -1));
      if (this.structCount[i] > 0) this.flags[i] |= F.STRUCT; else this.flags[i] &= ~F.STRUCT;
    }
    this.version = (this.version || 0) + 1;
  }

  flagAt(x, z) {
    const [c, r] = this.cellOf(x, z);
    if (!this.inBounds(c, r)) return F.BLOCK;
    return this.flags[this.idx(c, r)];
  }
  walkable(x, z) { return (this.flagAt(x, z) & (F.BLOCK | F.STRUCT)) === 0; }
  walkableCell(c, r) { return this.inBounds(c, r) && (this.flags[this.idx(c, r)] & (F.BLOCK | F.STRUCT)) === 0; }

  lineClear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / 0.2));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (!this.walkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  cost(i) {
    const f = this.flags[i];
    return 1 + (f & F.MIRE ? 1.6 : 0) + (f & F.SPIKE ? 1.2 : 0);
  }

  // A* to any cell whose centre lies within `reach` of (tx,tz). Returns smoothed waypoints.
  findPath(sx, sz, tx, tz, reach) {
    let [sc, sr] = this.cellOf(sx, sz);
    if (!this.walkableCell(sc, sr)) {
      const n = this.nearestWalkable(sx, sz);
      if (!n) return null;
      [sc, sr] = this.cellOf(n[0], n[1]);
    }
    const N = this.cols * this.rows;
    if (!this._g || this._g.length !== N) {
      this._g = new Float32Array(N); this._from = new Int32Array(N); this._seen = new Uint32Array(N); this._stamp = 0;
      this._closed = new Uint32Array(N);
    }
    const g = this._g, from = this._from, seen = this._seen, closed = this._closed;
    const stamp = ++this._stamp;
    const heap = new Heap();
    const start = this.idx(sc, sr);
    g[start] = 0; from[start] = -1; seen[start] = stamp;
    const h = (c, r) => { const [x, z] = this.center(c, r); return Math.max(0, Math.hypot(x - tx, z - tz) - reach); };
    heap.push(start, h(sc, sr));
    let goal = -1, best = start, bestH = Infinity, iter = 0;
    while (heap.size && iter++ < 16000) {
      const cur = heap.pop();
      if (closed[cur] === stamp) continue;
      closed[cur] = stamp;
      const c = cur % this.cols, r = (cur / this.cols) | 0;
      const [cx, cz] = this.center(c, r);
      const dh = Math.hypot(cx - tx, cz - tz);
      if (dh <= reach) { goal = cur; break; }
      if (dh < bestH) { bestH = dh; best = cur; }
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc, nr = r + dr;
        if (!this.walkableCell(nc, nr)) continue;
        if (dr && dc && (!this.walkableCell(c + dc, r) || !this.walkableCell(c, r + dr))) continue;
        const ni = this.idx(nc, nr);
        if (closed[ni] === stamp) continue;
        const ng = g[cur] + (dr && dc ? 1.4142 : 1) * this.cost(ni);
        if (seen[ni] !== stamp || ng < g[ni]) {
          seen[ni] = stamp; g[ni] = ng; from[ni] = cur;
          heap.push(ni, ng + h(nc, nr));
        }
      }
    }
    if (goal < 0) goal = best;
    const pts = [];
    for (let i = goal; i >= 0; i = from[i]) {
      const [x, z] = this.center(i % this.cols, (i / this.cols) | 0);
      pts.push([x, z]);
      if (i === start) break;
    }
    pts.reverse();
    return this.smooth(sx, sz, pts);
  }

  smooth(sx, sz, pts) {
    const out = [];
    let ax = sx, az = sz, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineClear(ax, az, pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      [ax, az] = pts[j];
      i = j + 1;
    }
    return out;
  }

  nearestWalkable(x, z, maxR = 3) {
    if (this.walkable(x, z)) return [x, z];
    for (let rad = 0.25; rad <= maxR; rad += 0.25) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const px = x + Math.cos(ang) * rad, pz = z + Math.sin(ang) * rad;
        if (this.walkable(px, pz)) return [px, pz];
      }
    }
    return null;
  }
}

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, v = this.v;
    k.push(key); v.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = k[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

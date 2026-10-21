import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Cheap fbm noise drawn by stacking blurred random grids.
function noiseLayer(ctx, w, h, rand, octaves, alpha, tint) {
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    const [nc, nctx] = canvas(cells, cells);
    const img = nctx.createImageData(cells, cells);
    for (let i = 0; i < cells * cells; i++) {
      const v = rand() * 255;
      img.data[i * 4] = v * tint[0]; img.data[i * 4 + 1] = v * tint[1]; img.data[i * 4 + 2] = v * tint[2];
      img.data[i * 4 + 3] = 255;
    }
    nctx.putImageData(img, 0, 0);
    ctx.globalAlpha = alpha / (o + 1);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(nc, 0, 0, w, h);
  }
  ctx.globalAlpha = 1;
}

function tex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

export function flagstones(seed, w = 1024, h = 768, unitsW = 18) {
  const rand = rng(seed);
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#0d0c0d';
  ctx.fillRect(0, 0, w, h);
  const px = w / unitsW;               // pixels per world unit
  let y = 0;
  while (y < h) {
    const rowH = px * (0.7 + rand() * 0.45);
    let x = -rand() * px;
    while (x < w) {
      const sw = px * (0.8 + rand() * 0.9);
      const inset = 2 + rand() * 2;
      const base = 52 + rand() * 30;
      const warm = rand() * 6;
      ctx.fillStyle = `rgb(${base + warm},${base},${base - 2 + rand() * 4})`;
      ctx.beginPath();
      const j = () => (rand() - 0.5) * 5;
      ctx.moveTo(x + inset + j(), y + inset + j());
      ctx.lineTo(x + sw - inset + j(), y + inset + j());
      ctx.lineTo(x + sw - inset + j(), y + rowH - inset + j());
      ctx.lineTo(x + inset + j(), y + rowH - inset + j());
      ctx.closePath();
      ctx.fill();
      // worn centre highlight
      const g = ctx.createRadialGradient(x + sw / 2, y + rowH / 2, 2, x + sw / 2, y + rowH / 2, sw * 0.7);
      g.addColorStop(0, `rgba(120,112,100,${0.08 + rand() * 0.08})`);
      g.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = g;
      ctx.fill();
      // cracks
      if (rand() < 0.35) {
        ctx.strokeStyle = 'rgba(5,4,4,0.75)';
        ctx.lineWidth = 1 + rand();
        ctx.beginPath();
        let cx = x + sw * rand(), cy = y + rowH * rand();
        ctx.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) { cx += (rand() - 0.5) * sw * 0.5; cy += (rand() - 0.5) * rowH * 0.5; ctx.lineTo(cx, cy); }
        ctx.stroke();
      }
      x += sw;
    }
    y += rowH;
  }
  noiseLayer(ctx, w, h, rand, 5, 0.18, [0.6, 0.62, 0.55]);
  // moss + dried blood stains
  for (let i = 0; i < 60; i++) {
    const mx = rand() * w, my = rand() * h, r = 8 + rand() * 40;
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, r);
    const blood = rand() < 0.25;
    g.addColorStop(0, blood ? 'rgba(70,8,8,0.35)' : 'rgba(30,40,22,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(mx - r, my - r, r * 2, r * 2);
  }
  return tex(c);
}

export function soil(seed) {
  const rand = rng(seed);
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#0b0908';
  ctx.fillRect(0, 0, 512, 512);
  noiseLayer(ctx, 512, 512, rand, 6, 0.5, [0.32, 0.27, 0.22]);
  for (let i = 0; i < 900; i++) {
    ctx.strokeStyle = `rgba(${40 + rand() * 30},${38 + rand() * 20},${24},${0.25 + rand() * 0.3})`;
    ctx.lineWidth = 1;
    const x = rand() * 512, y = rand() * 512;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rand() - 0.5) * 4, y - 3 - rand() * 6); ctx.stroke();
  }
  return tex(c, 8);
}

export function rockWall(seed) {
  const rand = rng(seed);
  const [c, ctx] = canvas(512, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#2a2624'); g.addColorStop(1, '#120a09');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  noiseLayer(ctx, 512, 256, rand, 5, 0.35, [0.5, 0.45, 0.42]);
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.3 + rand() * 0.4})`;
    ctx.lineWidth = 1 + rand() * 2;
    const x = rand() * 512;
    ctx.beginPath(); ctx.moveTo(x, 0);
    let yy = 0, xx = x;
    while (yy < 256) { yy += 10 + rand() * 20; xx += (rand() - 0.5) * 12; ctx.lineTo(xx, yy); }
    ctx.stroke();
  }
  const glow = ctx.createLinearGradient(0, 140, 0, 256);
  glow.addColorStop(0, 'rgba(120,10,0,0)'); glow.addColorStop(1, 'rgba(160,24,4,0.55)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 512, 256);
  const t = tex(c); t.repeat.set(6, 1);
  return t;
}

export function magma(seed) {
  const rand = rng(seed);
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#100202'; ctx.fillRect(0, 0, 512, 512);
  noiseLayer(ctx, 512, 512, rand, 6, 0.9, [0.9, 0.12, 0.03]);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(255,${60 + rand() * 80},20,${0.25 + rand() * 0.3})`;
    ctx.lineWidth = 1 + rand() * 3;
    let x = rand() * 512, y = rand() * 512;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (rand() - 0.5) * 70; y += (rand() - 0.5) * 70; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  return tex(c, 3);
}

export function mist() {
  const rand = rng(77);
  const [c, ctx] = canvas(512, 512);
  ctx.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) {
    const x = rand() * 512, y = rand() * 512, r = 40 + rand() * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.05 + rand() * 0.08})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) ctx.fillRect(x - r + ox, y - r + oy, r * 2, r * 2);
  }
  return tex(c, 1, false);
}

export function softDot() {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// Ritual circle with procedural glyphs — used for the altar ring and deploy portals.
export function runeCircle(seed = 3) {
  const rand = rng(seed);
  const S = 512;
  const [c, ctx] = canvas(S, S);
  ctx.translate(S / 2, S / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineCap = 'round';
  const ring = (r, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); };
  ring(240, 6); ring(222, 2); ring(150, 3); ring(140, 1.5);
  const n = 24;
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.rotate((i / n) * Math.PI * 2);
    ctx.translate(0, -185);
    ctx.lineWidth = 3;
    ctx.beginPath();
    const strokes = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < strokes; s++) {
      const x0 = (rand() - 0.5) * 22, y0 = (rand() - 0.5) * 30;
      ctx.moveTo(x0, y0); ctx.lineTo(x0 + (rand() - 0.5) * 24, y0 + (rand() - 0.5) * 30);
    }
    ctx.stroke();
    ctx.restore();
  }
  // pentacle-free sigil: interlaced triangles
  ctx.lineWidth = 3;
  for (const off of [0, Math.PI]) {
    ctx.beginPath();
    for (let k = 0; k <= 3; k++) {
      const a = off + (k / 3) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * 140, y = Math.sin(a) * 140;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ring(40, 3);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function rubbleDecal() {
  const rand = rng(9);
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.6, 'rgba(10,6,4,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.5 + rand() * 0.5})`;
    ctx.lineWidth = 1 + rand() * 2;
    let x = 128, y = 128;
    ctx.beginPath(); ctx.moveTo(x, y);
    const a = rand() * Math.PI * 2;
    for (let k = 0; k < 5; k++) { x += Math.cos(a + (rand() - 0.5)) * 22; y += Math.sin(a + (rand() - 0.5)) * 22; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

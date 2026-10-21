import * as THREE from 'three';
import { FACTION } from './config.js';

// ---------- material palette ----------
const shared = {};
function sharedMats() {
  if (shared.ready) return shared;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  Object.assign(shared, {
    ready: true,
    iron: std({ color: 0x6a6c74, metalness: 0.45, roughness: 0.4 }),
    darkIron: std({ color: 0x38383f, metalness: 0.4, roughness: 0.55 }),
    rust: std({ color: 0x4a3426, metalness: 0.5, roughness: 0.8 }),
    bone: std({ color: 0xc9bfa6, roughness: 0.85 }),
    oldBone: std({ color: 0x8f8572, roughness: 0.9 }),
    leather: std({ color: 0x2a1d16, roughness: 0.9 }),
    blackCloth: std({ color: 0x2c2933, roughness: 1, side: THREE.DoubleSide }),
    skin: std({ color: 0xbdb3ad, roughness: 0.7 }),
    stone: std({ color: 0x55524f, roughness: 0.95, flatShading: true }),
    darkStone: std({ color: 0x4e4a48, roughness: 0.95, flatShading: true }),
    slate: std({ color: 0x1c1d24, roughness: 0.7, metalness: 0.2, flatShading: true }),
    wood: std({ color: 0x2b1f17, roughness: 0.95 }),
    gold: std({ color: 0x8f7339, metalness: 0.9, roughness: 0.35 }),
    bronze: std({ color: 0x5c4423, metalness: 0.9, roughness: 0.45 }),
    blood: std({ color: 0x6a0508, roughness: 0.3, metalness: 0.1, emissive: 0x3a0000, emissiveIntensity: 1 }),
    fire: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.4, 0.35) }),
    window: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.1, 0.4) }),
    wraith: std({ color: 0x2a2f3e, roughness: 1, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
  });
  return shared;
}

const teamCache = [null, null];
export function teamMats(team) {
  if (teamCache[team]) return teamCache[team];
  const f = FACTION[team];
  const glow = new THREE.Color(f.glow);
  const m = {
    ...sharedMats(),
    cloth: new THREE.MeshStandardMaterial({ color: f.cloth, roughness: 0.95, side: THREE.DoubleSide }),
    trim: new THREE.MeshStandardMaterial({ color: f.trim, roughness: 0.6, metalness: 0.4 }),
    banner: new THREE.MeshStandardMaterial({ color: f.banner, roughness: 1, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: glow.clone().multiplyScalar(3.2) }),
    softGlow: new THREE.MeshBasicMaterial({ color: glow.clone().multiplyScalar(1.6), transparent: true, opacity: 0.85 }),
    glowColor: glow,
  };
  teamCache[team] = m;
  return m;
}

// ---------- primitive helpers ----------
function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow; m.receiveShadow = shadow;
  return m;
}
const box = (w, h, d, mat) => mesh(new THREE.BoxGeometry(w, h, d), mat);
const cyl = (rt, rb, h, seg, mat) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
const sph = (r, mat, ws = 12, hs = 10) => mesh(new THREE.SphereGeometry(r, ws, hs), mat);
const cone = (r, h, seg, mat) => mesh(new THREE.ConeGeometry(r, h, seg), mat);
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const group = (...kids) => { const g = new THREE.Group(); kids.forEach((k) => g.add(k)); return g; };
function pivot(x, y, z, ...kids) { const g = group(...kids); g.position.set(x, y, z); return g; }

function eyes(m, y, z, spread = 0.06, r = 0.022) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(r, 6, 4);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(geo, m.glow); e.position.set(s * spread, y, z); g.add(e); }
  return g;
}

function tatteredCape(w, h, mat, seed = 1) {
  const geo = new THREE.PlaneGeometry(w, h, 6, 8);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = (h / 2 - y) / h;
    p.setZ(i, -Math.abs(x) * 0.35 * (1 - t * 0.3) - t * 0.08);
    if (y < -h / 2 + 0.01) p.setY(i, y + Math.abs(Math.sin(x * 23 + seed)) * h * 0.18);
  }
  geo.computeVertexNormals();
  const c = mesh(geo, mat);
  return c;
}

function legs(m, mat, hipY, len, gap, thick) {
  const mk = (s) => {
    const leg = at(box(thick, len, thick * 1.1, mat), 0, -len / 2, 0);
    const boot = at(box(thick * 1.15, thick * 0.9, thick * 1.6, m.darkIron), 0, -len + thick * 0.3, thick * 0.2);
    return pivot(s * gap, hipY, 0, leg, boot);
  };
  return [mk(-1), mk(1)];
}

// ---------- units ----------
function knight(team) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const [legL, legR] = legs(m, m.iron, 0.5, 0.48, 0.11, 0.12);
  const body = new THREE.Group();
  body.position.y = 0.5;
  const torso = at(cyl(0.2, 0.16, 0.42, 8, m.iron), 0, 0.22, 0);
  const tabard = at(box(0.24, 0.5, 0.02, m.cloth), 0, 0.1, 0.17);
  const sigil = at(box(0.05, 0.16, 0.025, m.trim), 0, 0.2, 0.185);
  const belt = at(cyl(0.18, 0.18, 0.05, 8, m.leather), 0, 0.02, 0);
  const pL = at(sph(0.12, m.iron, 8, 6), -0.22, 0.4, 0); pL.scale.set(1, 0.7, 1);
  const pR = pL.clone(); pR.position.x = 0.22;
  const head = new THREE.Group(); head.position.set(0, 0.55, 0);
  const helm = cyl(0.12, 0.13, 0.22, 8, m.darkIron);
  const crest = at(box(0.025, 0.12, 0.24, m.trim), 0, 0.14, -0.02);
  const visor = at(box(0.17, 0.025, 0.02, m.glow), 0, 0.01, 0.125);
  head.add(helm, crest, visor);
  const cape = at(tatteredCape(0.5, 0.75, m.cloth, team * 3 + 1), 0, 0.1, -0.16);
  cape.rotation.x = 0.08;
  body.add(torso, tabard, sigil, belt, pL, pR, head, cape);
  // greatsword held two-handed in right arm group
  const blade = at(box(0.06, 0.9, 0.015, m.iron), 0, -0.55, 0.0);
  const guard = at(box(0.24, 0.035, 0.05, m.gold), 0, -0.09, 0);
  const grip = at(cyl(0.022, 0.022, 0.16, 6, m.leather), 0, 0.0, 0);
  const sword = group(blade, guard, grip);
  sword.position.set(0, -0.32, 0.08); sword.rotation.x = Math.PI * 0.62;
  const armR = pivot(0.25, 0.38, 0, at(cyl(0.05, 0.045, 0.32, 6, m.iron), 0, -0.16, 0), sword);
  const armL = pivot(-0.25, 0.38, 0, at(cyl(0.05, 0.045, 0.32, 6, m.iron), 0, -0.16, 0));
  armL.rotation.x = -0.5; armL.rotation.z = -0.5;
  body.add(armR, armL);
  root.add(legL, legR, body);
  return { root, rig: { body, head, armR, armL, legL, legR, weaponArm: armR }, height: 1.25 };
}

function skeleton(team) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const [legL, legR] = legs(m, m.bone, 0.38, 0.36, 0.07, 0.05);
  const body = new THREE.Group(); body.position.y = 0.38;
  const spine = at(cyl(0.02, 0.02, 0.32, 5, m.bone), 0, 0.16, 0);
  const ribs = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const r = mesh(new THREE.TorusGeometry(0.1 - i * 0.012, 0.012, 4, 10, Math.PI * 1.6), m.bone);
    r.rotation.x = Math.PI / 2; r.rotation.z = Math.PI * 0.2 + Math.PI;
    r.position.y = 0.3 - i * 0.055; ribs.add(r);
  }
  const pelvis = at(box(0.16, 0.05, 0.08, m.bone), 0, 0, 0);
  const head = new THREE.Group(); head.position.set(0, 0.42, 0.01);
  const skull = sph(0.09, m.bone, 10, 8); skull.scale.set(0.9, 1, 1);
  const jaw = at(box(0.1, 0.035, 0.08, m.oldBone), 0, -0.07, 0.02);
  const hood = at(cone(0.13, 0.16, 7, m.cloth), 0, 0.06, -0.02);
  head.add(skull, jaw, hood, eyes(m, 0.0, 0.075, 0.035, 0.018));
  const blade = at(box(0.035, 0.36, 0.01, m.rust), 0, -0.36, 0.08);
  blade.rotation.x = Math.PI * 0.55;
  const armR = pivot(0.13, 0.3, 0, at(cyl(0.015, 0.015, 0.3, 4, m.bone), 0, -0.15, 0), blade);
  const armL = pivot(-0.13, 0.3, 0, at(cyl(0.015, 0.015, 0.3, 4, m.bone), 0, -0.15, 0));
  const tatter = at(tatteredCape(0.2, 0.25, m.cloth, team + 7), 0, 0.05, 0.06);
  tatter.rotation.y = Math.PI;
  body.add(spine, ribs, pelvis, head, armR, armL, tatter);
  root.add(legL, legR, body);
  return { root, rig: { body, head, armR, armL, legL, legR, weaponArm: armR }, height: 0.9 };
}

function hunter(team) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const [legL, legR] = legs(m, m.leather, 0.42, 0.4, 0.08, 0.08);
  const body = new THREE.Group(); body.position.y = 0.42;
  const coat = at(cyl(0.13, 0.24, 0.62, 8, m.blackCloth), 0, 0.12, 0);
  const sash = at(box(0.05, 0.5, 0.29, m.cloth), 0, 0.2, 0); sash.rotation.z = 0.6;
  const collar = at(cyl(0.16, 0.13, 0.07, 8, m.leather), 0, 0.44, 0);
  const head = new THREE.Group(); head.position.set(0, 0.56, 0);
  const face = sph(0.085, m.skin, 10, 8);
  const brim = at(cyl(0.22, 0.22, 0.015, 14, m.blackCloth), 0, 0.07, 0);
  const crown = at(cyl(0.085, 0.11, 0.2, 10, m.blackCloth), 0, 0.17, 0);
  const band = at(cyl(0.112, 0.112, 0.03, 10, m.trim), 0, 0.09, 0);
  const buckle = at(box(0.04, 0.04, 0.01, m.gold), 0, 0.09, 0.112);
  head.add(face, brim, crown, band, buckle, eyes(m, 0.01, 0.075, 0.032, 0.015));
  const stock = at(box(0.05, 0.05, 0.36, m.wood), 0, 0, 0.12);
  const prod = at(box(0.42, 0.03, 0.03, m.darkIron), 0, 0, 0.28);
  const bolt = at(box(0.012, 0.012, 0.28, m.iron), 0, 0.03, 0.16);
  const xbow = group(stock, prod, bolt);
  xbow.position.set(-0.12, -0.2, 0.12);
  const armR = pivot(0.15, 0.36, 0, at(cyl(0.04, 0.035, 0.28, 6, m.blackCloth), 0, -0.14, 0), xbow);
  armR.rotation.x = -1.2;
  const armL = pivot(-0.15, 0.36, 0, at(cyl(0.04, 0.035, 0.28, 6, m.blackCloth), 0, -0.14, 0));
  armL.rotation.x = -1.1; armL.rotation.z = -0.4;
  body.add(coat, sash, collar, head, armR, armL);
  root.add(legL, legR, body);
  return { root, rig: { body, head, armR, armL, legL, legR, weaponArm: armR, aimPose: -1.2 }, height: 1.2 };
}

function batWing(mat, span, sign) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(span * 0.35, span * 0.35);
  s.lineTo(span, span * 0.25);
  s.quadraticCurveTo(span * 0.82, 0, span * 0.85, -span * 0.25);
  s.quadraticCurveTo(span * 0.6, -span * 0.08, span * 0.5, -span * 0.3);
  s.quadraticCurveTo(span * 0.32, -span * 0.12, span * 0.2, -span * 0.25);
  s.lineTo(0, -0.05);
  const g = new THREE.ShapeGeometry(s);
  if (sign < 0) g.scale(-1, 1, 1);
  const w = mesh(g, mat);
  w.material = mat.clone(); w.material.side = THREE.DoubleSide;
  return w;
}

function gargoyle(team) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const body = new THREE.Group();
  const torso = sph(0.28, m.darkStone, 8, 6); torso.scale.set(1, 0.9, 1.25); torso.rotation.x = 0.5;
  const head = new THREE.Group(); head.position.set(0, 0.18, 0.3);
  const skull = sph(0.15, m.darkStone, 7, 5); skull.scale.set(1, 0.85, 1.2);
  const snout = at(box(0.12, 0.08, 0.14, m.darkStone), 0, -0.05, 0.13);
  const hornL = at(cone(0.035, 0.22, 5, m.oldBone), -0.09, 0.14, -0.04); hornL.rotation.set(-0.7, 0, 0.4);
  const hornR = at(cone(0.035, 0.22, 5, m.oldBone), 0.09, 0.14, -0.04); hornR.rotation.set(-0.7, 0, -0.4);
  head.add(skull, snout, hornL, hornR, eyes(m, 0.03, 0.15, 0.06, 0.022));
  const wingL = pivot(-0.12, 0.15, -0.05, batWing(m.darkStone, 0.85, -1));
  const wingR = pivot(0.12, 0.15, -0.05, batWing(m.darkStone, 0.85, 1));
  const armR = pivot(0.2, -0.05, 0.15, at(cyl(0.045, 0.03, 0.3, 5, m.darkStone), 0, -0.15, 0),
    at(cone(0.05, 0.1, 4, m.oldBone), 0, -0.32, 0.03));
  const armL = pivot(-0.2, -0.05, 0.15, at(cyl(0.045, 0.03, 0.3, 5, m.darkStone), 0, -0.15, 0),
    at(cone(0.05, 0.1, 4, m.oldBone), 0, -0.32, 0.03));
  const tail = at(cone(0.06, 0.6, 5, m.darkStone), 0, -0.1, -0.45); tail.rotation.x = -1.9;
  const core = at(sph(0.06, m.glow, 6, 4), 0, 0.02, 0.3); core.scale.set(1, 1, 0.4);
  body.add(torso, head, wingL, wingR, armR, armL, tail, core);
  body.position.y = 0;
  root.add(body);
  return { root, rig: { body, head, armR, armL, wingL, wingR, weaponArm: armR, flyer: true }, height: 0.8 };
}

function colossus(team) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const mkLeg = (s) => pivot(s * 0.3, 1.0, 0,
    at(cyl(0.11, 0.09, 0.55, 6, m.bone), 0, -0.28, 0),
    at(sph(0.1, m.oldBone, 6, 5), 0, -0.56, 0),
    at(cyl(0.09, 0.14, 0.42, 6, m.bone), 0, -0.8, 0));
  const legL = mkLeg(-1), legR = mkLeg(1);
  const body = new THREE.Group(); body.position.y = 1.0;
  const pelvis = at(box(0.6, 0.18, 0.3, m.oldBone), 0, 0, 0);
  const spine = at(cyl(0.07, 0.08, 0.7, 6, m.bone), 0, 0.4, -0.05);
  const ribs = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const r = mesh(new THREE.TorusGeometry(0.42 - i * 0.04, 0.04, 5, 12, Math.PI * 1.55), m.bone);
    r.rotation.x = Math.PI / 2; r.rotation.z = Math.PI * 1.22;
    r.position.set(0, 0.95 - i * 0.13, 0); ribs.add(r);
  }
  const core = at(sph(0.17, m.glow, 10, 8), 0, 0.6, 0.02);
  const chains = at(cyl(0.48, 0.48, 0.04, 12, m.rust), 0, 0.3, 0); chains.scale.z = 0.7;
  const head = new THREE.Group(); head.position.set(0, 1.2, 0.18);
  const skull = sph(0.24, m.bone, 10, 8); skull.scale.set(1, 0.95, 1.1);
  const jaw = at(box(0.26, 0.09, 0.2, m.oldBone), 0, -0.2, 0.06);
  const crown = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const spike = at(cone(0.04, 0.24, 4, m.rust), Math.cos(a) * 0.18, 0.24, Math.sin(a) * 0.18);
    crown.add(spike);
  }
  const hornL = at(cone(0.07, 0.5, 6, m.oldBone), -0.25, 0.18, -0.05); hornL.rotation.set(-0.5, 0, 1.0);
  const hornR = at(cone(0.07, 0.5, 6, m.oldBone), 0.25, 0.18, -0.05); hornR.rotation.set(-0.5, 0, -1.0);
  head.add(skull, jaw, crown, hornL, hornR, eyes(m, 0.02, 0.2, 0.09, 0.04));
  const mkArm = (s) => {
    const club = at(cyl(0.17, 0.09, 0.6, 7, m.oldBone), 0, -1.05, 0.05);
    const spikes = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const sp = at(cone(0.04, 0.16, 4, m.rust), Math.cos(i) * 0.17, -1.1 - (i % 2) * 0.15, Math.sin(i) * 0.17);
      sp.rotation.z = Math.cos(i) * -1.4; sp.rotation.x = Math.sin(i) * 1.4; spikes.add(sp);
    }
    return pivot(s * 0.55, 1.0, 0,
      at(sph(0.16, m.bone, 7, 6), 0, 0, 0),
      at(cyl(0.09, 0.08, 0.5, 6, m.bone), 0, -0.3, 0),
      at(cyl(0.08, 0.07, 0.45, 6, m.bone), 0, -0.68, 0.02), club, spikes);
  };
  const armL = mkArm(-1), armR = mkArm(1);
  const banner = at(tatteredCape(0.7, 1.1, m.cloth, team + 11), 0, 0.5, -0.32);
  body.add(pelvis, spine, ribs, core, chains, head, armL, armR, banner);
  root.add(legL, legR, body);
  return { root, rig: { body, head, armR, armL, legL, legR, weaponArm: armR, heavy: true }, height: 2.7 };
}

function witch(team) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const body = new THREE.Group();
  const robe = at(cone(0.32, 1.0, 9, m.blackCloth), 0, 0.5, 0);
  const inner = at(cone(0.2, 0.8, 9, m.blood), 0, 0.42, 0.06);
  const mantle = at(cyl(0.12, 0.24, 0.24, 9, m.cloth), 0, 0.86, 0);
  const head = new THREE.Group(); head.position.set(0, 1.05, 0);
  const hood = sph(0.16, m.cloth, 10, 8); hood.scale.set(1, 1.15, 1.1);
  const hoodTip = at(cone(0.12, 0.3, 8, m.cloth), 0, 0.17, -0.08); hoodTip.rotation.x = -0.5;
  const shadow = at(sph(0.11, m.darkIron, 8, 6), 0, -0.02, 0.07);
  head.add(hood, hoodTip, shadow, eyes(m, 0.0, 0.16, 0.04, 0.02));
  const orb = at(sph(0.1, m.blood, 12, 10), 0, -0.36, 0.2);
  const orbGlow = at(sph(0.06, m.glow, 8, 6), 0, -0.36, 0.2);
  const armR = pivot(0.2, 0.9, 0.04, at(cyl(0.05, 0.04, 0.34, 6, m.blackCloth), 0, -0.17, 0), orb, orbGlow);
  armR.rotation.x = -0.9;
  const staff = at(cyl(0.02, 0.02, 1.35, 5, m.wood), 0, -0.2, 0.05);
  const crescent = at(mesh(new THREE.TorusGeometry(0.11, 0.015, 4, 14, Math.PI * 1.3), m.bronze), 0, 0.52, 0.05);
  const armL = pivot(-0.2, 0.9, 0.04, at(cyl(0.05, 0.04, 0.3, 6, m.blackCloth), 0, -0.15, 0), staff, crescent);
  armL.rotation.x = -0.3;
  body.add(robe, inner, mantle, head, armR, armL);
  root.add(body);
  return { root, rig: { body, head, armR, armL, weaponArm: armR, glide: true, orb }, height: 1.4 };
}

function vampire(team) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const [legL, legR] = legs(m, m.blackCloth, 0.55, 0.53, 0.08, 0.075);
  const body = new THREE.Group(); body.position.y = 0.55;
  const torso = at(cyl(0.15, 0.12, 0.48, 8, m.blackCloth), 0, 0.24, 0);
  const vest = at(box(0.16, 0.36, 0.02, m.cloth), 0, 0.26, 0.13);
  const coatTail = at(tatteredCape(0.34, 0.5, m.blackCloth, 5), 0, -0.05, -0.1);
  const cape = at(tatteredCape(0.62, 1.0, m.cloth, team + 2), 0, 0.05, -0.17);
  const collarL = at(box(0.02, 0.32, 0.18, m.cloth), -0.15, 0.6, -0.04); collarL.rotation.set(0, 0.5, 0.35);
  const collarR = at(box(0.02, 0.32, 0.18, m.cloth), 0.15, 0.6, -0.04); collarR.rotation.set(0, -0.5, -0.35);
  const head = new THREE.Group(); head.position.set(0, 0.64, 0);
  const face = sph(0.09, m.skin, 10, 8); face.scale.set(0.9, 1.1, 1);
  const hair = at(sph(0.095, m.darkIron, 10, 8), 0, 0.03, -0.015); hair.scale.set(0.95, 1.0, 1.05);
  head.add(face, hair, eyes(m, 0.01, 0.08, 0.032, 0.016));
  const rapier = at(box(0.012, 0.72, 0.012, m.iron), 0, -0.6, 0.12);
  rapier.rotation.x = Math.PI * 0.55;
  const hilt = at(sph(0.04, m.gold, 6, 4), 0, -0.32, 0.03);
  const armR = pivot(0.18, 0.44, 0, at(cyl(0.04, 0.035, 0.32, 6, m.blackCloth), 0, -0.16, 0), rapier, hilt);
  const armL = pivot(-0.18, 0.44, 0, at(cyl(0.04, 0.035, 0.32, 6, m.blackCloth), 0, -0.16, 0));
  armL.rotation.z = -0.25;
  body.add(torso, vest, coatTail, cape, collarL, collarR, head, armR, armL);
  root.add(legL, legR, body);
  return { root, rig: { body, head, armR, armL, legL, legR, weaponArm: armR, cape }, height: 1.4 };
}

function wraith(team) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const body = new THREE.Group();
  const geo = new THREE.ConeGeometry(0.26, 0.9, 10, 6, true);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < -0.44) p.setY(i, y + Math.abs(Math.sin(i * 1.7)) * 0.22);
    p.setX(i, p.getX(i) * (1 + Math.sin(i * 3.1) * 0.08));
  }
  geo.computeVertexNormals();
  const shroud = mesh(geo, m.wraith); shroud.position.y = -0.1; shroud.rotation.x = Math.PI;
  shroud.rotation.x = 0;
  const head = new THREE.Group(); head.position.set(0, 0.42, 0.02);
  const hood = sph(0.15, m.wraith, 10, 8); hood.scale.set(1, 1.1, 1.1);
  const void_ = at(sph(0.1, m.darkIron, 8, 6), 0, -0.02, 0.07);
  head.add(hood, void_, eyes(m, 0, 0.15, 0.045, 0.022));
  const claw = (s) => pivot(s * 0.2, 0.22, 0.08,
    at(cyl(0.012, 0.012, 0.3, 4, m.bone), 0, -0.15, 0),
    at(cone(0.03, 0.12, 4, m.bone), 0, -0.32, 0));
  const armL = claw(-1), armR = claw(1);
  armL.rotation.x = -0.9; armR.rotation.x = -0.9;
  const wisp = at(sph(0.05, m.softGlow, 6, 4), 0, 0.1, 0.12);
  body.add(shroud, head, armL, armR, wisp);
  root.add(body);
  return { root, rig: { body, head, armR, armL, weaponArm: armR, flyer: true, ghost: true }, height: 0.9 };
}

function lantern(team) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const post = at(box(0.14, 2.0, 0.14, m.wood), -0.35, 1.0, 0);
  const beam = at(box(0.9, 0.12, 0.12, m.wood), 0.05, 1.95, 0);
  const brace = at(box(0.08, 0.5, 0.08, m.wood), -0.2, 1.72, 0); brace.rotation.z = -0.8;
  const base = at(box(0.6, 0.15, 0.6, m.darkStone), -0.35, 0.07, 0);
  const chain = at(cyl(0.01, 0.01, 0.4, 4, m.rust), 0.35, 1.7, 0);
  const cage = new THREE.Group(); cage.position.set(0.35, 1.3, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    cage.add(at(cyl(0.012, 0.012, 0.42, 3, m.darkIron), Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16));
  }
  cage.add(at(cone(0.22, 0.14, 6, m.darkIron), 0, 0.27, 0), at(cyl(0.18, 0.18, 0.04, 6, m.darkIron), 0, -0.21, 0));
  const flame = at(sph(0.1, m.glow, 8, 6), 0, 0, 0); flame.scale.set(0.8, 1.5, 0.8);
  const skull = at(sph(0.06, m.bone, 6, 5), 0, -0.13, 0);
  cage.add(flame, skull);
  root.add(post, beam, brace, base, chain, cage);
  return { root, rig: { body: cage, flame, building: true, muzzle: new THREE.Vector3(0.35, 1.3, 0) }, height: 2.2 };
}

export function crow() {
  const m = sharedMats();
  const g = new THREE.Group();
  const b = sph(0.08, m.darkIron, 6, 4); b.scale.set(0.8, 0.8, 1.6);
  const head = at(sph(0.05, m.darkIron, 6, 4), 0, 0.03, 0.12);
  const beak = at(cone(0.02, 0.07, 4, m.bronze), 0, 0.03, 0.18); beak.rotation.x = Math.PI / 2;
  const wingGeo = new THREE.PlaneGeometry(0.28, 0.12);
  wingGeo.translate(0.14, 0, 0);
  const wL = new THREE.Mesh(wingGeo, m.blackCloth); wL.rotation.y = Math.PI;
  const wR = new THREE.Mesh(wingGeo, m.blackCloth);
  g.add(b, head, beak, wL, wR);
  g.userData.wings = [wL, wR];
  return g;
}

function sigilFire(team) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const boneHot = new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.7, emissive: 0xff5a10, emissiveIntensity: 0.35 });
  const skull = sph(0.34, boneHot, 14, 12); skull.scale.set(0.95, 1, 1.05);
  const jaw = at(box(0.36, 0.12, 0.3, boneHot), 0, -0.3, 0.08);
  const sockets = new THREE.Group();
  for (const sx of [-1, 1]) sockets.add(at(sph(0.075, m.fire, 8, 6), sx * 0.12, 0.0, 0.29));
  const nose = at(cone(0.04, 0.08, 3, m.darkIron), 0, -0.12, 0.33); nose.rotation.x = Math.PI;
  const flames = new THREE.Group();
  const fmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.16, 0.02) });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const f = at(cone(0.09 + (i % 3) * 0.03, 0.45 + (i % 4) * 0.12, 6, fmat), Math.cos(a) * 0.2, 0.34 + (i % 3) * 0.05, Math.sin(a) * 0.2 - 0.05);
    f.rotation.set(Math.sin(a) * -0.4, 0, Math.cos(a) * 0.4);
    flames.add(f);
  }
  root.add(skull, jaw, sockets, nose, flames);
  root.position.y = 0.6; root.rotation.x = 0.15;
  return { root: group(root), rig: { body: root }, height: 1.6 };
}

function sigilCrow() {
  const root = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const c = crow(); c.scale.setScalar(2.4 - i * 0.25);
    c.position.set(Math.cos(i * 2.3) * 0.45, 0.5 + i * 0.22, Math.sin(i * 2.3) * 0.3);
    c.rotation.y = i * 1.3;
    c.userData.wings[0].rotation.z = 0.5; c.userData.wings[1].rotation.z = -0.5;
    root.add(c);
  }
  return { root, rig: { body: root }, height: 1.6 };
}

function sigilGrave(team) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const stone = at(box(0.55, 0.75, 0.14, m.stone), 0, 0.42, -0.2);
  const top = at(cyl(0.275, 0.275, 0.14, 12, m.stone), 0, 0.8, -0.2); top.rotation.x = Math.PI / 2;
  const mound = at(sph(0.5, sharedMats().leather, 10, 6), 0, 0, 0.2); mound.scale.set(1, 0.3, 1.2);
  const hand = new THREE.Group(); hand.position.set(0.05, 0.1, 0.3);
  hand.add(at(cyl(0.04, 0.05, 0.4, 5, m.bone), 0, 0.2, 0));
  for (let i = 0; i < 4; i++) hand.add(at(cyl(0.012, 0.012, 0.13, 3, m.bone), -0.045 + i * 0.03, 0.46, 0));
  hand.rotation.z = -0.2;
  const glow = at(sph(0.05, m.glow), -0.12, 0.25, 0.3);
  root.add(stone, top, mound, hand, glow);
  return { root, rig: { body: root }, height: 1.3 };
}

const BUILDERS = { knight, skeleton, hunter, gargoyle, colossus, witch, vampire, wraith, lantern, sigilFire, sigilCrow, sigilGrave };

export function buildModel(name, team) {
  const out = BUILDERS[name](team);
  out.root.traverse((o) => { if (o.isMesh) o.userData.baseMat = o.material; });
  return out;
}

// ---------- towers ----------
function bellGeometry() {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.08 + Math.pow(t, 2.2) * 0.32 + (t > 0.9 ? 0.04 : 0), 0.55 - t * 0.55));
  }
  return new THREE.LatheGeometry(pts, 14);
}

export function bellTower(team) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const base = at(cyl(1.15, 1.25, 1.0, 8, m.stone), 0, 0.5, 0);
  const plinth = at(cyl(1.0, 1.15, 0.2, 8, m.darkStone), 0, 1.1, 0);
  const shaft = at(cyl(0.82, 0.9, 2.4, 8, m.stone), 0, 2.4, 0);
  const ring = at(cyl(0.95, 0.95, 0.16, 8, m.darkStone), 0, 3.65, 0);
  root.add(base, plinth, shaft, ring);
  // buttresses
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const b = at(box(0.3, 2.2, 0.55, m.darkStone), Math.cos(a) * 1.0, 1.4, Math.sin(a) * 1.0);
    b.rotation.y = -a; root.add(b);
    const cap = at(cone(0.22, 0.5, 4, m.slate), Math.cos(a) * 1.0, 2.75, Math.sin(a) * 1.0);
    cap.rotation.y = -a + Math.PI / 4; root.add(cap);
  }
  // lancet windows (glowing)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const w = at(box(0.12, 0.5, 0.05, i % 2 ? m.window : m.glow), Math.cos(a) * 0.86, 2.6, Math.sin(a) * 0.86);
    w.rotation.y = -a + Math.PI / 2; root.add(w);
  }
  // belfry
  const belfry = new THREE.Group(); belfry.position.y = 3.73;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    belfry.add(at(box(0.18, 1.0, 0.18, m.stone), Math.cos(a) * 0.7, 0.5, Math.sin(a) * 0.7));
  }
  belfry.add(at(cyl(0.95, 0.95, 0.14, 8, m.darkStone), 0, 1.05, 0));
  const bell = mesh(bellGeometry(), m.bronze); bell.position.y = 0.38;
  belfry.add(bell);
  const flame = at(sph(0.12, m.glow, 8, 6), 0, 0.3, 0);
  belfry.add(flame);
  const roof = at(cone(1.0, 2.4, 8, m.slate), 0, 2.3, 0);
  belfry.add(roof);
  const finial = at(cyl(0.03, 0.03, 0.6, 4, m.darkIron), 0, 3.7, 0);
  const crossbar = at(box(0.3, 0.03, 0.03, m.darkIron), 0, 3.85, 0);
  belfry.add(finial, crossbar);
  // spikes at roof edge
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    belfry.add(at(cone(0.05, 0.35, 4, m.slate), Math.cos(a) * 0.92, 1.25, Math.sin(a) * 0.92));
  }
  root.add(belfry);
  // banners
  for (const s of [-1, 1]) {
    const ban = at(tatteredCape(0.5, 1.4, m.banner, s + team * 4), s * 0.0, 2.6, s * 0.93);
    ban.rotation.y = s > 0 ? 0 : Math.PI;
    const rod = at(box(0.6, 0.04, 0.04, m.darkIron), 0, 3.3, s * 0.95);
    const mark = at(box(0.1, 0.35, 0.01, m.trim), 0, 2.8, s * 0.96);
    root.add(ban, rod, mark);
  }
  return { root, rig: { bell, flame, belfry, muzzleY: 4.1 }, height: 7.8 };
}

export function cathedralKeep(team) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const front = team === 0 ? -1 : 1; // facing the rift
  const base = at(box(3.1, 1.2, 3.1, m.stone), 0, 0.6, 0);
  const step = at(box(3.4, 0.25, 3.4, m.darkStone), 0, 0.12, 0);
  const nave = at(box(2.3, 2.6, 2.3, m.stone), 0, 2.5, 0);
  const cornice = at(box(2.55, 0.18, 2.55, m.darkStone), 0, 3.85, 0);
  root.add(base, step, nave, cornice);
  // nave roof (gabled)
  const roofGeo = new THREE.CylinderGeometry(0.01, 1.6, 1.4, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  const roof = mesh(roofGeo, m.slate); roof.position.y = 4.65;
  root.add(roof);
  // corner spires
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tower = at(cyl(0.32, 0.38, 3.8, 8, m.stone), sx * 1.35, 1.9, sz * 1.35);
    const spire = at(cone(0.42, 1.8, 8, m.slate), sx * 1.35, 4.7, sz * 1.35);
    const tip = at(cyl(0.02, 0.02, 0.4, 4, m.darkIron), sx * 1.35, 5.75, sz * 1.35);
    const win = at(box(0.08, 0.35, 0.05, m.window), sx * 1.35, 3.1, sz * 1.35 + sz * 0.33);
    root.add(tower, spire, tip, win);
  }
  // flying buttresses
  for (const sx of [-1, 1]) {
    const fb = at(box(0.22, 0.2, 1.8, m.darkStone), sx * 1.6, 2.4, 0);
    fb.rotation.z = sx * 0.6; fb.rotation.y = Math.PI / 2;
    root.add(fb);
  }
  // great rose window toward the rift
  const rose = at(mesh(new THREE.CircleGeometry(0.62, 24), m.glow, false), 0, 2.85, front * 1.16);
  if (front < 0) rose.rotation.y = Math.PI;
  const roseFrame = at(mesh(new THREE.TorusGeometry(0.66, 0.07, 6, 24), m.darkStone), 0, 2.85, front * 1.17);
  const tracery = new THREE.Group(); tracery.position.set(0, 2.85, front * 1.18);
  for (let i = 0; i < 6; i++) {
    const t = box(0.04, 1.2, 0.03, m.darkStone); t.rotation.z = (i / 6) * Math.PI; tracery.add(t);
  }
  const gate = at(box(0.8, 1.0, 0.05, m.darkIron), 0, 0.7, front * 1.56);
  const gateArch = at(mesh(new THREE.TorusGeometry(0.42, 0.08, 6, 12, Math.PI), m.darkStone), 0, 1.15, front * 1.57);
  root.add(rose, roseFrame, tracery, gate, gateArch);
  // central bell-spire with the Revenant statue
  const drum = at(cyl(0.55, 0.65, 0.9, 8, m.stone), 0, 5.4, 0);
  const statue = new THREE.Group(); statue.position.set(0, 5.85, 0);
  const robe = at(cone(0.3, 0.9, 8, m.cloth), 0, 0.45, 0);
  const sHead = at(sph(0.13, m.darkStone, 8, 6), 0, 1.0, 0);
  const sCrown = new THREE.Group(); sCrown.position.y = 1.12;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    sCrown.add(at(cone(0.03, 0.16, 4, m.gold), Math.cos(a) * 0.1, 0.05, Math.sin(a) * 0.1));
  }
  const sEyes = eyes(m, 1.01, 0.11, 0.045, 0.025);
  sEyes.visible = false;
  const scythe = at(cyl(0.02, 0.02, 1.3, 4, m.wood), 0.32, 0.65, 0);
  const sBlade = at(box(0.5, 0.06, 0.02, m.iron), 0.12, 1.25, 0); sBlade.rotation.z = -0.3;
  statue.add(robe, sHead, sCrown, sEyes, scythe, sBlade);
  statue.rotation.y = front > 0 ? 0 : Math.PI;
  root.add(drum, statue);
  // braziers on the steps
  return { root, rig: { statue, statueEyes: sEyes, rose, muzzleY: 6.6 }, height: 7.5 };
}

export function healthBar(width, team) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.06, 0.13), new THREE.MeshBasicMaterial({ color: 0x050405, depthTest: false, transparent: true, opacity: 0.85 }));
  const col = team === 0 ? new THREE.Color(0.55, 0.85, 1.4) : new THREE.Color(1.5, 0.18, 0.12);
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.08), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true }));
  fg.geometry.translate(width / 2, 0, 0);
  fg.position.x = -width / 2; fg.position.z = 0.001;
  bg.renderOrder = 998; fg.renderOrder = 999;
  g.add(bg, fg);
  g.userData.fg = fg;
  return g;
}

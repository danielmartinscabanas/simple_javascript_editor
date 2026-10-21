import * as THREE from 'three';
import { softDot } from './textures.js';

const VERT = `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D uMap;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.004) discard;
}`;

export class Particles {
  constructor(scene, capacity, additive) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.base = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uMap: { value: softDot() }, uScale: { value: 600 } };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 19;
    this.geo = g;
    scene.add(this.points);
  }

  emit(o) {
    const n = o.count || 1;
    const c = o.color || [1, 1, 1, 1];
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.cap;
      const s = o.spread || 0, sy = o.spreadY ?? s;
      this.pos[i * 3] = o.x + (Math.random() - 0.5) * 2 * s;
      this.pos[i * 3 + 1] = o.y + (Math.random() - 0.5) * 2 * sy;
      this.pos[i * 3 + 2] = o.z + (Math.random() - 0.5) * 2 * s;
      const v = o.vel || [0, 0, 0], vr = o.velRand || 0;
      let vx = v[0] + (Math.random() - 0.5) * 2 * vr, vy = v[1] + (Math.random() - 0.5) * 2 * vr, vz = v[2] + (Math.random() - 0.5) * 2 * vr;
      if (o.radial) {
        const a = Math.random() * Math.PI * 2, sp = o.radial * (0.4 + Math.random() * 0.6);
        vx += Math.cos(a) * sp; vz += Math.sin(a) * sp;
      }
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      const jitter = o.colorJitter || 0;
      for (let j = 0; j < 3; j++) this.base[i * 4 + j] = c[j] * (1 - jitter * Math.random());
      this.base[i * 4 + 3] = c[3] ?? 1;
      const life = (o.life || 1) * (0.7 + Math.random() * 0.6);
      this.life[i] = life; this.max[i] = life;
      this.size0[i] = (o.size || 0.3) * (0.7 + Math.random() * 0.6);
      this.size1[i] = this.size0[i] * (o.sizeEnd ?? 0.3);
      this.grav[i] = o.gravity || 0;
      this.drag[i] = o.drag || 0;
    }
  }

  update(dt) {
    const p = this.pos, v = this.vel, col = this.col;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { if (col[i * 4 + 3] !== 0) { col[i * 4 + 3] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.max[i];
      const d = Math.max(0, 1 - this.drag[i] * dt);
      v[i * 3] *= d; v[i * 3 + 1] = v[i * 3 + 1] * d - this.grav[i] * dt; v[i * 3 + 2] *= d;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      col[i * 4] = this.base[i * 4]; col[i * 4 + 1] = this.base[i * 4 + 1]; col[i * 4 + 2] = this.base[i * 4 + 2];
      col[i * 4 + 3] = this.base[i * 4 + 3] * Math.max(0, fade);
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

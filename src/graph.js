import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Group, InstancedBufferAttribute,
  InstancedMesh, LineSegments, Matrix4, ShaderMaterial, Vector3,
} from 'three';
import { U } from './uniforms.js';
import { rng } from './data.js';

// グラフのローカルX軸が画面の水平方向に揃う角度（初期カメラ基準）
export const PHI = 0.67;
export const ICE = [0.86, 0.94, 1.0];

// 種別ごとの色（ノード・接続線・見出しカード・パネルの色見本で共通）
export const TYPE_COL = {
  CVE: [1.00, 0.27, 0.45], CWE: [1.00, 0.74, 0.28], CAPEC: [0.62, 0.64, 1.00],
  'ATT&CK': [0.40, 0.95, 1.00], TACTIC: [0.66, 1.00, 0.42], ASSET: ICE,
  // CTIモード: 攻撃者は洋紅、作戦は琥珀、マルウェアは赤桃、手口はシアン、痕跡はライム、標的は青紫
  ACTOR: [1.00, 0.42, 0.88], CAMPAIGN: [1.00, 0.74, 0.28], MALWARE: [1.00, 0.27, 0.45], TTP: [0.40, 0.95, 1.00], IOC: [0.66, 1.00, 0.42], SECTOR: [0.62, 0.64, 1.00],
};
export const typeCss = (type, a = 1) => {
  const c = TYPE_COL[type] || ICE;
  return `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`;
};

const CLUSTERS = [
  { type: 'CVE',    title: 'CVE',              n: [8, 11], cx: -7.5, y: [4.8, 7.6],  size: [0.34, 0.50], t0: 0.7, col: TYPE_COL.CVE },
  { type: 'CWE',    title: 'CWE',              n: [5, 7],  cx: -2.4, y: [8.4, 10.6], size: [0.34, 0.50], t0: 1.6, col: TYPE_COL.CWE },
  { type: 'CAPEC',  title: 'CAPEC',            n: [4, 6],  cx: 2.6,  y: [8.2, 10.8], size: [0.34, 0.52], t0: 2.4, col: TYPE_COL.CAPEC },
  { type: 'ATT&CK', title: 'ATT&CK Technique', n: [6, 9],  cx: 6.8,  y: [5.8, 9.2],  size: [0.36, 0.56], t0: 3.1, col: TYPE_COL['ATT&CK'] },
  { type: 'TACTIC', title: 'Tactic',           n: [3, 5],  cx: 10.6, y: [4.6, 7.4],  size: [0.34, 0.50], t0: 3.8, col: TYPE_COL.TACTIC },
];
const CWE_IDS = [20, 22, 78, 79, 89, 94, 119, 125, 200, 287, 306, 352, 416, 434, 502, 787, 798, 862];
const TACTICS = ['Initial Access', 'Execution', 'Persistence', 'Privilege Escalation', 'Defense Evasion', 'Lateral Movement', 'Exfiltration'];

const COMMON = /* glsl */`
uniform float uMT, uQuiet, uBuild, uCollapse;
vec3 drift(vec3 p, float s){
  return p + vec3(sin(uMT * .40 + s * 6.28), sin(uMT * .55 + s * 17.), cos(uMT * .37 + s * 11.)) * .10;
}`;

const NODE_VERT = /* glsl */`
${COMMON}
uniform float uScale;
attribute float aSeed, aT0, aSize, aHot;
attribute vec3 aColor;
varying vec2 vUv;
varying vec3 vColor;
varying float vA, vHot, vSeed;
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
void main(){
  vec3 ctr = drift(instanceMatrix[3].xyz, aSeed);
  float t = uBuild - aT0;
  float pop = t < 0. ? 0. : 1. - exp(-t * 7.) * cos(t * 14.);
  float flick = t < 0.4 ? mix(mix(.35, 1., step(.5, fract(t * 31. + aSeed * 7.))), 1., uQuiet) : 1.;
  float k = max(pop, 0.) * (1. - uCollapse);
  float spin = uScale < 0.99 ? -1.6 : 1.;
  vec3 p = rotY(uMT * .22 * spin * (aSeed + .3) + aSeed * 6.) * rotX(uMT * .15 * (aSeed - .4) * spin) * position * aSize * uScale * k;
  vUv = uv; vColor = aColor; vA = flick; vHot = aHot; vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(ctr + p, 1.);
}`;

const NODE_FRAG = /* glsl */`
uniform float uMT, uQuiet, uGain;
varying vec2 vUv;
varying vec3 vColor;
varying float vA, vHot, vSeed;
void main(){
  vec2 ed = min(vUv, 1. - vUv);
  float e = min(ed.x, ed.y);
  float line = smoothstep(0.05, 0., e);
  float glow = smoothstep(0.24, 0., e) * 0.10;
  float hot = vHot * (0.045 + 0.03 * sin(uMT * 2.5 + vSeed * 20.) * (1. - uQuiet));
  vec3 c = vColor * (line * 0.95 + glow + hot) + vec3(1.) * line * 0.14 * vHot;
  gl_FragColor = vec4(c * vA * uGain, 1.);
}`;

const LINE_VERT = /* glsl */`
${COMMON}
attribute vec3 aA, aB, aColA, aColB;
attribute float aT, aT0, aSA, aSB, aBase, aSeedE;
varying vec3 vCol;
varying float vT, vBase, vSeedE, vProg;
void main(){
  float prog = clamp((uBuild - aT0) / 0.7, 0., 1.);
  prog = prog * prog * (3. - 2. * prog) * (1. - uCollapse);
  vec3 pa = drift(aA, aSA), pb = drift(aB, aSB);
  vec3 p = mix(pa, pb, aT * prog);
  vCol = mix(aColA, aColB, aT); vT = aT; vBase = aBase; vSeedE = aSeedE; vProg = prog;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.);
}`;

const LINE_FRAG = /* glsl */`
uniform float uMT, uQuiet;
varying vec3 vCol;
varying float vT, vBase, vSeedE, vProg;
void main(){
  float ph = fract(uMT * (.10 + vSeedE * .16) + vSeedE * 3.7);
  float pulse = exp(-pow((vT - ph) * 12., 2.));
  float a = vBase + pulse * 0.9 * (1. - uQuiet);
  gl_FragColor = vec4(vCol * a * step(.001, vProg), 1.);
}`;

export class ThreatGraph {
  constructor(scene, labelRoot) {
    this.group = new Group();
    this.group.rotation.y = PHI;
    scene.add(this.group);
    this.labelRoot = labelRoot;
    this.uniforms = { uBuild: { value: 0 }, uCollapse: { value: 0 } };
    this.pending = null;
    this.labelsOn = true;
    this.meshes = [];
    this.labels = [];
    this.nodes = [];
    this.beamAssets = [];
    this.counts = { CVE: 0, CWE: 0, CAPEC: 0, 'ATT&CK': 0, TACTIC: 0, edges: 0 };
  }

  // 次のアセットへ再構成。既存グラフを畳んでから新しいグラフを時間差で構築する。
  show(asset, assets) {
    if (!this.meshes.length) { this.build(asset, assets); return; }
    this.pending = { asset, assets };
    this.collapsing = 0;
  }

  build(asset, assets) {
    this.dispose();
    const r = rng(asset.index * 131 + 17);
    const gy = asset.height + 0.3;
    const cph = Math.cos(PHI), sph = Math.sin(PHI);
    const nodes = [];
    const addNode = (n) => { n.seed = r(); nodes.push(n); return nodes.length - 1; };

    const base = addNode({ type: 'ASSET', id: asset.name, pos: new Vector3(0, 0.1, 0), col: ICE, size: 0.5, t0: 0.05, hot: 1 });
    const hub = addNode({ type: 'HUB', id: asset.name, pos: new Vector3(0, 4.0, 0), col: ICE, size: 0.85, t0: 0.25, hot: 1 });

    const idx = {};
    CLUSTERS.forEach((C) => {
      const n = C.n[0] + ((r() * (C.n[1] - C.n[0] + 1)) | 0);
      idx[C.type] = [];
      for (let i = 0; i < n; i++) {
        const id = C.type === 'CVE' ? `CVE-${2023 + ((r() * 4) | 0)}-${1000 + ((r() * 8000) | 0)}`
          : C.type === 'CWE' ? `CWE-${CWE_IDS[(r() * CWE_IDS.length) | 0]}`
          : C.type === 'CAPEC' ? `CAPEC-${1 + ((r() * 620) | 0)}`
          : C.type === 'ATT&CK' ? `T${1003 + ((r() * 300) | 0)}`
          : `TA${String(1 + ((r() * 12) | 0)).padStart(4, '0')}`;
        idx[C.type].push(addNode({
          type: C.type, id, col: C.col,
          pos: new Vector3(C.cx + (r() - 0.5) * 3.6, C.y[0] + r() * (C.y[1] - C.y[0]), (r() - 0.5) * 4.2),
          size: C.size[0] + r() * (C.size[1] - C.size[0]), t0: C.t0 + r() * 0.9, hot: C.type === 'CVE' && r() < 0.3 ? 1 : 0,
        }));
      }
    });

    // 周辺アセット → 真上の主要ノードへ垂直ビーム（クラスタごとに1本）
    const beams = [];
    this.beamAssets = [];
    const used = new Set([asset.index]);
    CLUSTERS.forEach((C) => {
      let best = null, bs = 1e9;
      for (const a of assets) {
        if (used.has(a.index) || a.state === 3) continue;
        const ox = a.x - asset.x, oz = a.z - asset.z;
        const lx = ox * cph - oz * sph, lz = ox * sph + oz * cph;
        const sc = Math.abs(lx - C.cx) + Math.abs(lz) * 0.55;
        if (sc < bs) { bs = sc; best = { a, lx, lz }; }
      }
      if (!best) return;
      used.add(best.a.index);
      this.beamAssets.push(best.a.index);
      const anchor = idx[C.type][0];
      nodes[anchor].pos.x = best.lx; nodes[anchor].pos.z = best.lz;
      const top = addNode({ type: 'ASSET', id: best.a.name, pos: new Vector3(best.lx, best.a.height - gy + 0.1, best.lz), col: ICE, size: 0.32, t0: C.t0 - 0.3, hot: 0 });
      beams.push([top, anchor]);
    });

    // 文脈ノード（無名の立方体と微小ノード）
    const ctx = [];
    for (let i = 0; i < 16; i++) {
      ctx.push(addNode({ type: 'CTX', id: '', col: ICE.map((v) => v * 0.55), pos: new Vector3(-12 + r() * 25, 3.6 + r() * 8, (r() - 0.5) * 9), size: 0.2 + r() * 0.18, t0: 1 + r() * 3.2, hot: 0 }));
    }
    for (let i = 0; i < 38; i++) {
      ctx.push(addNode({ type: 'DOT', id: '', col: ICE.map((v) => v * 0.8), pos: new Vector3(-12 + r() * 25, 3.2 + r() * 8.5, (r() - 0.5) * 9), size: 0.07 + r() * 0.07, t0: 1.2 + r() * 3.4, hot: 0 }));
    }

    const edges = [];
    const seen = new Set();
    const add = (i, j, b) => {
      if (i === j) return;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) return;
      seen.add(key);
      let A = nodes[i], B = nodes[j];
      if (B.t0 < A.t0) [A, B] = [B, A];
      edges.push({ a: A, b: B, base: b, t0: Math.max(A.t0 + 0.1, B.t0 - 0.6), seed: r() });
    };
    const pick = (arr) => arr[(r() * arr.length) | 0];
    const nearest = (i, pool, k) => pool.filter((j) => j !== i)
      .sort((p, q) => nodes[p].pos.distanceToSquared(nodes[i].pos) - nodes[q].pos.distanceToSquared(nodes[i].pos)).slice(0, k);

    add(base, hub, 0.75);
    beams.forEach(([top, anchor]) => add(top, anchor, 0.62));
    idx.CVE.forEach((i) => add(hub, i, 0.30));
    idx.CVE.forEach((i) => { add(i, pick(idx.CWE), 0.30); if (r() < 0.4) add(i, pick(idx.CWE), 0.22); if (r() < 0.5) nearest(i, idx.CVE, 1).forEach((j) => add(i, j, 0.16)); });
    idx.CWE.forEach((i) => { const k = 1 + ((r() * 2) | 0); for (let q = 0; q < k; q++) add(i, pick(idx.CAPEC), 0.30); add(hub, i, 0.14); });
    idx.CAPEC.forEach((i) => { const k = 1 + ((r() * 2) | 0); for (let q = 0; q < k; q++) add(i, pick(idx['ATT&CK']), 0.30); });
    idx['ATT&CK'].forEach((i) => { add(i, pick(idx.TACTIC), 0.28); nearest(i, idx['ATT&CK'], 1).forEach((j) => add(i, j, 0.16)); });
    const prim = [...idx.CVE, ...idx.CWE, ...idx.CAPEC, ...idx['ATT&CK'], ...idx.TACTIC];
    ctx.forEach((i) => { nearest(i, [...prim, ...ctx], 2).forEach((j) => add(i, j, 0.13)); });
    for (let q = 0; q < 8; q++) add(pick(idx.CVE), pick(idx.CAPEC), 0.12);

    this.group.position.set(asset.x, gy, asset.z);
    this.commit(nodes, edges);
    this.counts = { edges: edges.length };
    CLUSTERS.forEach((C) => { this.counts[C.type] = idx[C.type].length; });
    this.buildLabels(asset, nodes, idx, hub);
    this.uniforms.uBuild.value = 0;
    this.uniforms.uCollapse.value = 0;
    this.asset = asset;
  }

  // ノードと接続線をGPUに載せる（アセット用・CTI用で共通）
  commit(nodes, edges) {
    // ノード: 外側と内側の二重ワイヤーキューブ
    const nn = nodes.length;
    const geo = new BoxGeometry(1, 1, 1);
    const ng = { aSeed: new Float32Array(nn), aT0: new Float32Array(nn), aSize: new Float32Array(nn), aHot: new Float32Array(nn), aColor: new Float32Array(nn * 3) };
    const m = new Matrix4();
    const outer = new InstancedMesh(geo, null, nn);
    nodes.forEach((n, i) => {
      m.makeTranslation(n.pos.x, n.pos.y, n.pos.z);
      outer.setMatrixAt(i, m);
      ng.aSeed[i] = n.seed; ng.aT0[i] = n.t0; ng.aSize[i] = n.size; ng.aHot[i] = n.hot;
      ng.aColor.set(n.col, i * 3);
    });
    for (const [k, v] of Object.entries(ng)) geo.setAttribute(k, new InstancedBufferAttribute(v, k === 'aColor' ? 3 : 1));
    const nodeMat = (scale, gain) => new ShaderMaterial({
      vertexShader: NODE_VERT, fragmentShader: NODE_FRAG,
      uniforms: { ...U, ...this.uniforms, uScale: { value: scale }, uGain: { value: gain } },
      transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
    });
    outer.material = nodeMat(1, 1);
    const inner = new InstancedMesh(geo, nodeMat(0.55, 0.6), nn);
    inner.instanceMatrix = outer.instanceMatrix;
    for (const o of [outer, inner]) { o.frustumCulled = false; o.renderOrder = 7; }

    // 接続線（極細）
    const ne = edges.length, nv = ne * 2;
    const L = {
      position: new Float32Array(nv * 3), aA: new Float32Array(nv * 3), aB: new Float32Array(nv * 3),
      aColA: new Float32Array(nv * 3), aColB: new Float32Array(nv * 3), aT: new Float32Array(nv),
      aT0: new Float32Array(nv), aSA: new Float32Array(nv), aSB: new Float32Array(nv),
      aBase: new Float32Array(nv), aSeedE: new Float32Array(nv),
    };
    edges.forEach((e, i) => {
      for (let v = 0; v < 2; v++) {
        const q = i * 2 + v;
        L.aA.set(e.a.pos.toArray(), q * 3); L.aB.set(e.b.pos.toArray(), q * 3);
        L.aColA.set(e.a.col, q * 3); L.aColB.set(e.b.col, q * 3);
        L.aT[q] = v; L.aT0[q] = e.t0; L.aSA[q] = e.a.seed; L.aSB[q] = e.b.seed;
        L.aBase[q] = e.base; L.aSeedE[q] = e.seed;
      }
    });
    const lg = new BufferGeometry();
    for (const [k, v] of Object.entries(L)) lg.setAttribute(k, new BufferAttribute(v, v.length / nv));
    const lines = new LineSegments(lg, new ShaderMaterial({
      vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms: { ...U, ...this.uniforms },
      transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
    }));
    lines.frustumCulled = false; lines.renderOrder = 6;

    this.group.add(lines, outer, inner);
    this.meshes = [lines, outer, inner];

    this.nodes = nodes;
  }

  // 見出しカード: ハブとクラスタごとの代表ノードに付ける
  mkLabel(node, cls, html, dx, dy, tint) {
    const el = document.createElement('div');
    el.className = `card ${cls}`;
    if (tint) { el.style.borderLeftColor = typeCss(tint, .85); el.style.setProperty('--tc', typeCss(tint, 1)); }
    if (this.hidden) el.style.display = 'none';
    el.innerHTML = html;
    this.labelRoot.appendChild(el);
    this.labels.push({ el, n: node, dx, dy, tmp: new Vector3() });
  }

  // モード切り替えで丸ごと隠す（見出しカードのDOMも含む）
  setVisible(v) {
    this.hidden = !v;
    this.group.visible = v;
    this.labels.forEach((l) => { l.el.style.display = v ? '' : 'none'; });
  }

  buildLabels(asset, nodes, idx, hub) {
    const mk = (...a) => this.mkLabel(...a);
    mk(nodes[hub], 'hub', `<div class="h">${asset.name}</div><div class="l">${asset.ip}</div>`, 22, -16);
    CLUSTERS.forEach((C) => {
      const ids = idx[C.type];
      const items = ids.slice(0, 3).map((i) => (C.type === 'TACTIC' ? TACTICS[nodes[i].seed * TACTICS.length | 0] : nodes[i].id));
      mk(nodes[ids[0]], '', `<div class="h">${C.title}</div>${items.map((t) => `<div class="l">${t}</div>`).join('')}<div class="l d">...</div>`, 20, -20, C.type);
    });
  }

  dispose() {
    for (const o of this.meshes) {
      this.group.remove(o);
      if (o.isLineSegments || o === this.meshes[1]) o.geometry.dispose();
      o.material.dispose();
    }
    this.meshes = [];
    this.labels.forEach((l) => l.el.remove());
    this.labels = [];
  }

  update(dt, camera, w, h) {
    const u = this.uniforms;
    u.uBuild.value += dt;
    if (this.pending) {
      this.collapsing += dt;
      u.uCollapse.value = Math.min(1, this.collapsing / 0.4);
      if (this.collapsing >= 0.45) {
        const p = this.pending; this.pending = null;
        this.build(p.asset, p.assets);
      }
    }
    this.group.updateMatrixWorld();
    const t = u.uBuild.value, tm = U.uMT.value, calm = U.uQuiet.value > 0.5;
    for (const l of this.labels) {
      const s = l.n.seed;
      l.tmp.set(
        l.n.pos.x + Math.sin(tm * 0.40 + s * 6.28) * 0.10,
        l.n.pos.y + Math.sin(tm * 0.55 + s * 17) * 0.10,
        l.n.pos.z + Math.cos(tm * 0.37 + s * 11) * 0.10,
      ).applyMatrix4(this.group.matrixWorld).project(camera);
      const vis = l.tmp.z < 1 && t > l.n.t0 + 0.5 && u.uCollapse.value < 0.05;
      const flick = t < l.n.t0 + 0.9 && !calm ? (Math.sin(t * 60) > 0 ? 1 : 0.3) : 1;
      l.el.style.opacity = vis && this.labelsOn ? flick : 0;
      l.el.style.transform = `translate(${((l.tmp.x * 0.5 + 0.5) * w + l.dx).toFixed(1)}px, ${((-l.tmp.y * 0.5 + 0.5) * h + l.dy).toFixed(1)}px)`;
    }
  }
}

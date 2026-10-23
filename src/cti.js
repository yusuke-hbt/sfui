import { AdditiveBlending, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { U } from './uniforms.js';
import { rng } from './data.js';
import { ThreatGraph, TYPE_COL, ICE, PHI } from './graph.js';
import { TACTICS, SECTOR_JP } from './cti-data.js';
import { PAL } from './theme.js';

// CTIモードの3D。左端に攻撃者が縦に並び、選んだ攻撃者の作戦・マルウェア・手口（キルチェーン12列）・痕跡・標的が展開する。
const COL_W = 1.7;                       // キルチェーンの列幅
const colX = (i) => (i - (TACTICS.length - 1) / 2) * COL_W;
const railPos = (i, n) => new Vector3(-13.2 - 0.9 * Math.sin(Math.PI * i / (n - 1)), 0.6 + i * (12 / (n - 1)), 0);

// 床: キルチェーンの列。攻撃者が使う戦術の列が点灯し、列に沿って光が流れる。
const FLOOR_FRAG = /* glsl */`
#define CW ${COL_W.toFixed(2)}
uniform float uMT, uQuiet, uCt;
uniform float uUse[12];
uniform vec3 uIce, uAcc;
varying vec3 vW;
void main(){
  vec2 p = vW.xz;
  float lane = p.x / CW + 6.0;
  float li = floor(lane), lf = fract(lane);
  float inX = step(0., lane) * step(lane, 12.);
  float zb = 5.0;
  float dist = length(vec2(max(abs(p.x) - 6. * CW, 0.), max(abs(p.y) - zb, 0.)));
  float fade = exp(-dist * 0.20);
  float box = inX * step(abs(p.y), zb);
  float use = uUse[int(clamp(li, 0., 11.))] * box;

  vec2 gp = p;
  vec2 g = abs(fract(gp - .5) - .5) / max(fwidth(gp), vec2(1e-4));
  float fine = 1. - min(min(g.x, g.y), 1.);
  float fw = fwidth(lane) * 1.2;
  float sep = (1. - smoothstep(0., fw, min(lf, 1. - lf))) * inX * step(abs(p.y), zb + 0.05);
  float edgeZ = (1. - smoothstep(0., fwidth(p.y) * 1.3, abs(abs(p.y) - zb))) * inX;
  float stripe = smoothstep(0.82, 1., fract(p.y * 0.42 - uMT * 0.55 + li * 0.37)) * (1. - uQuiet);
  float sweep = exp(-pow((p.x - (-14. + fract(uMT / 9.) * 28.)) / 0.55, 2.)) * box * (1. - uQuiet);

  vec3 ice = uIce, cy = uAcc;
  vec3 col = ice * fine * 0.045 * fade;
  col += ice * (sep + edgeZ) * 0.22;
  col += cy * use * (0.03 + 0.04 * sin(lf * 3.14159) + stripe * 0.09);
  col += cy * sweep * 0.10;
  float rev = smoothstep(-22. + uCt * 50., -26. + uCt * 50., p.x);
  gl_FragColor = vec4(col * rev, 1.);
}`;

class CtiFloor {
  constructor() {
    this.use = new Float32Array(12);
    this.goal = new Float32Array(12);
    this.group = new Group();
    this.group.rotation.y = PHI;
    this.ct = 0;
    this.mesh = new Mesh(new PlaneGeometry(120, 120).rotateX(-Math.PI / 2), new ShaderMaterial({
      vertexShader: 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: FLOOR_FRAG,
      uniforms: { uMT: U.uMT, uQuiet: U.uQuiet, uCt: { value: 0 }, uUse: { value: this.use }, uIce: { value: new Vector3() }, uAcc: { value: new Vector3() } },
      transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
    }));
    this.mesh.renderOrder = -5;
    this.group.add(this.mesh);
  }

  update(dt) {
    this.ct = Math.min(1, this.ct + dt / 3.2);
    const mu = this.mesh.material.uniforms;
    mu.uCt.value = this.ct; mu.uIce.value.set(...PAL.ice); mu.uAcc.value.set(...PAL.acc);
    const k = Math.min(1, dt * 3);
    for (let i = 0; i < 12; i++) this.use[i] += (this.goal[i] - this.use[i]) * k;
  }
}

export class CtiGraph extends ThreatGraph {
  build(actor, actors) {
    this.dispose();
    const r = rng(actor.index * 313 + 7);
    const nodes = [];
    const addNode = (n) => { n.seed = r(); nodes.push(n); return nodes.length - 1; };
    const col = (t, k = 1) => TYPE_COL[t].map((v) => v * k);

    // 左端のレール: 全攻撃者。選択中が大きく点灯する。
    const rail = actors.map((a, i) => addNode({
      type: 'ACTOR', id: a.name, pos: railPos(i, actors.length), col: col('ACTOR', i === actor.index ? 1 : 0.42),
      size: i === actor.index ? 0.85 : 0.30, t0: 0.05 + i * 0.05, hot: i === actor.index ? 1 : 0, actor: i,
    }));
    const hub = rail[actor.index];

    // キルチェーンの列: 全手口を暗く並べ、この攻撃者が使うものだけ点灯させる
    const usedSet = new Set(actor.used.map((u) => `${u.tactic}:${u.k}`));
    const pool = TACTICS.map((T, ti) => T.tech.map(([id], k) => {
      const on = usedSet.has(`${ti}:${k}`);
      return addNode({
        type: on ? 'TTP' : 'POOL', id, tactic: ti, k, on,
        pos: new Vector3(colX(ti) + (r() - 0.5) * 0.5, 1.4 + k * 1.5 + (r() - 0.5) * 0.3, (r() - 0.5) * 3.2),
        col: on ? col('TTP') : PAL.dim, size: on ? 0.40 + r() * 0.16 : 0.17 + r() * 0.05,
        t0: 0.9 + ti * 0.22 + r() * 0.2, hot: on && r() < 0.25 ? 1 : 0,
      });
    }));

    // 作戦・マルウェア（左上）、痕跡（上）、標的（右端）
    const camp = actor.campaigns.map((c, i) => addNode({ type: 'CAMPAIGN', id: c.name, pos: new Vector3(-11.2 + i * 1.7 + (r() - 0.5) * 0.6, 9.4 + r() * 2.2, (r() - 0.5) * 3.6), col: col('CAMPAIGN'), size: 0.40 + r() * 0.1, t0: 0.5 + i * 0.3, hot: c.active ? 1 : 0 }));
    const mal = actor.malware.map((m, i) => addNode({ type: 'MALWARE', id: m, pos: new Vector3(-7.4 + i * 1.8 + (r() - 0.5) * 0.6, 8.2 + r() * 2.6, (r() - 0.5) * 4), col: col('MALWARE'), size: 0.38 + r() * 0.12, t0: 1.1 + i * 0.3, hot: 0 }));
    const ioc = actor.iocs.map((q, i) => addNode({ type: 'IOC', id: q.v, ioc: q, pos: new Vector3(0.8 + (i % 5) * 1.5 + (r() - 0.5) * 0.5, 9.3 + (i / 5 | 0) * 1.8 + r() * 0.8, (r() - 0.5) * 4.2), col: col('IOC'), size: 0.26 + r() * 0.10, t0: 3.4 + i * 0.15, hot: 0 }));
    const sec = actor.sectors.map((s, i) => addNode({ type: 'SECTOR', id: s, pos: new Vector3(12.6 + (r() - 0.5) * 0.6, 2.6 + i * 2.5 + r(), (r() - 0.5) * 3), col: col('SECTOR'), size: 0.42 + r() * 0.1, t0: 4.4 + i * 0.3, hot: 0 }));
    const dots = [];
    for (let i = 0; i < 30; i++) dots.push(addNode({ type: 'DOT', id: '', col: PAL.base.map((v) => v * 0.7), pos: new Vector3(-14 + r() * 28, 1 + r() * 11, (r() - 0.5) * 8), size: 0.07 + r() * 0.07, t0: 1 + r() * 3.4, hot: 0 }));
    const heads = TACTICS.map((T, ti) => addNode({ type: 'CTX', id: T.en, pos: new Vector3(colX(ti), 0.15, ti % 2 ? 6.6 : 5.4), col: PAL.base.map((v) => v * 0.5), size: 0.16, t0: 0.5 + ti * 0.1, hot: 0, tactic: ti }));

    const edges = [], seen = new Set();
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

    // 各列の背骨（暗い縦線）
    pool.forEach((col_) => col_.forEach((n, k) => { if (k) add(col_[k - 1], n, 0.07); }));
    // キルチェーン: 使う手口を、次に使う戦術の手口へ順に結ぶ
    const byT = TACTICS.map((_, ti) => pool[ti].filter((n) => nodes[n].on));
    const order = byT.map((a, ti) => (a.length ? ti : -1)).filter((ti) => ti >= 0);
    order.forEach((ti, oi) => {
      byT[ti].forEach((n, q) => { if (q) add(byT[ti][q - 1], n, 0.30); });
      const nx = order[oi + 1];
      if (nx !== undefined) byT[ti].forEach((n) => add(n, pick(byT[nx]), 0.55));
    });
    const first = order.length ? pick(byT[order[0]]) : null, lastT = order.length ? byT[order[order.length - 1]] : [];
    if (first !== null) add(hub, first, 0.55);
    camp.forEach((c) => add(hub, c, 0.55));
    camp.forEach((c) => mal.forEach((m) => { if (r() < 0.7) add(c, m, 0.26); }));
    const mid = order.length ? order.filter((ti) => [1, 2, 9].includes(ti)) : [];
    mal.forEach((m) => {
      (mid.length ? mid : order).forEach((ti) => { if (r() < 0.8) add(m, pick(byT[ti]), 0.22); });
      for (let q = 0; q < 2; q++) add(m, pick(ioc), 0.30);
    });
    const c2 = byT[9].length ? byT[9] : lastT;
    ioc.forEach((q) => { if (c2.length && r() < 0.6) add(q, pick(c2), 0.18); });
    sec.forEach((s) => (lastT.length ? lastT : pool[11]).forEach((n) => { if (r() < 0.8) add(n, s, 0.34); }));
    heads.forEach((h, ti) => add(h, pool[ti][0], 0.10));
    // 他の攻撃者へ薄いリンク（隣接する攻撃者との共通点を示唆）
    rail.forEach((a, i) => { if (i) add(rail[i - 1], a, 0.10); });
    dots.forEach((d) => {
      const near = nodes.map((n, i) => [i, n.pos.distanceToSquared(nodes[d].pos)]).filter(([i]) => i !== d).sort((p, q) => p[1] - q[1]).slice(0, 1);
      near.forEach(([i]) => add(d, i, 0.12));
    });

    this.group.position.set(0, 0, 0);
    this.commit(nodes, edges);
    this.counts = { edges: edges.length, ACTOR: actors.length, CAMPAIGN: camp.length, MALWARE: mal.length, TTP: actor.used.length, IOC: ioc.length, SECTOR: sec.length };
    this.railNodes = rail.map((i) => nodes[i]);
    this.hubNode = nodes[hub];
    this.buildCtiLabels(actor, actors, nodes, { rail, camp, mal, ioc, sec, heads });
    this.uniforms.uBuild.value = 0;
    this.uniforms.uCollapse.value = 0;
    this.asset = actor;
  }

  buildCtiLabels(actor, actors, nodes, g) {
    const mk = (...a) => this.mkLabel(...a);
    g.rail.forEach((i, ai) => {
      if (ai !== actor.index) mk(nodes[i], 'mini', `<div class="h">${actors[ai].name}</div>`, 10, -9, 'ACTOR');
    });
    g.heads.forEach((i, ti) => mk(nodes[i], 'mini col', `<div class="h">${TACTICS[ti].short}</div><div class="l jp">${TACTICS[ti].jp}</div>`, -26, 4));
    const list = (arr) => `${arr.slice(0, 3).map((t) => `<div class="l">${t}</div>`).join('')}${arr.length > 3 ? '<div class="l d">...</div>' : ''}`;
    mk(nodes[g.camp[0]], '', `<div class="h">CAMPAIGN</div>${list(actor.campaigns.map((c) => c.name))}`, 18, -22, 'CAMPAIGN');
    mk(nodes[g.mal[0]], '', `<div class="h">MALWARE</div>${list(actor.malware)}`, 18, -22, 'MALWARE');
    mk(nodes[g.ioc[0]], '', `<div class="h">IOC</div>${list(actor.iocs.map((q) => q.v))}`, 18, -22, 'IOC');
    mk(nodes[g.sec[0]], '', `<div class="h">TARGET SECTOR</div>${list(actor.sectors.map((s) => `${s}`))}`, -118, -26, 'SECTOR');
    void SECTOR_JP;
  }
}

// CTIビュー全体（床・グラフ・攻撃者の拾い上げ）
export class CtiView {
  constructor(scene, labelRoot, actors) {
    this.actors = actors;
    this.graph = new CtiGraph(scene, labelRoot);
    this.floor = new CtiFloor();
    scene.add(this.floor.group);
    this.setVisible(false);
    this.v = new Vector3();
  }

  setVisible(v) {
    this.on = v;
    this.graph.setVisible(v);
    this.floor.group.visible = v;
    if (v) this.floor.ct = 0;
  }

  select(i) {
    const a = this.actors[i];
    this.floor.goal.fill(0);
    a.used.forEach((u) => { this.floor.goal[u.tactic] = 1; });
    this.graph.show(a, this.actors);
  }

  update(dt, camera, w, h) {
    if (!this.on) return;
    this.floor.update(dt);
    this.graph.update(dt, camera, w, h);
  }

  // 画面上でいちばん近い攻撃者ノード（クリック・タップの拾い上げ）
  pickScreen(x, y, camera, w, h, tol = 30) {
    if (!this.on || !this.graph.railNodes) return -1;
    let best = -1, bd = tol;
    this.graph.group.updateMatrixWorld();
    for (const n of this.graph.railNodes) {
      this.v.copy(n.pos).applyMatrix4(this.graph.group.matrixWorld).project(camera);
      if (this.v.z > 1) continue;
      const d = Math.hypot((this.v.x * 0.5 + 0.5) * w - x, (-this.v.y * 0.5 + 0.5) * h - y);
      if (d < bd) { bd = d; best = n.actor; }
    }
    return best;
  }
}

import { Vector2 } from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const GRID = 5;
export const SPACING = 4.5;

export const STATE_NAMES = ['NOMINAL', 'WARNING', 'CRITICAL', 'OFFLINE'];
// 基調は氷青。警告・危険は彩度を落として控えめに差す
export const STATE_COLORS = [
  [0.58, 0.80, 1.00],
  [0.98, 0.78, 0.50],
  [1.00, 0.45, 0.50],
  [0.26, 0.33, 0.42],
];

export const TILE = 3.5;
export const TILE_H = 0.14;
export const PART_GAP = 0.07;
const B = (w, d, h, r) => ({ kind: 'box', w, d, h, r });
const P = (r, h, seg = 40) => ({ kind: 'puck', w: r * 2, d: r * 2, r, h, seg });

// 種別ごとの形（下から積む段）と、ブロック内に浮かぶアイコン番号
const TYPES = {
  WEB: { label: 'Web Server', icon: 0, parts: [B(2.4, 2.0, 0.55, 0.16), B(1.9, 1.5, 0.7, 0.2), P(0.5, 0.25)] },
  DB:  { label: 'Database', icon: 1, parts: [P(1.0, 0.5), P(0.9, 0.5), P(0.8, 0.5)] },
  APP: { label: 'Application', icon: 2, parts: [B(2.2, 1.8, 0.5, 0.2), B(1.5, 1.5, 0.9, 0.28)] },
  FW:  { label: 'Firewall', icon: 3, parts: [B(2.7, 1.1, 0.9, 0.15), B(2.2, 0.7, 0.4, 0.12)] },
  VPN: { label: 'VPN Gateway', icon: 4, parts: [P(1.0, 0.45, 8), P(0.65, 0.8, 8)] },
  KBS: { label: 'Kubernetes', icon: 5, parts: [P(1.1, 0.5, 6), P(0.8, 0.5, 6), P(0.5, 0.5, 6)] },
  S3:  { label: 'Object Storage', icon: 6, parts: [P(1.0, 0.9), P(0.7, 0.35)] },
  DC:  { label: 'Domain Controller', icon: 7, parts: [B(2.0, 2.0, 0.5, 0.25), B(1.4, 1.4, 0.5, 0.22), P(0.45, 0.4)] },
};
const DC_NAMES = ['DC-TOKYO', 'DC-OSAKA', 'DC-NAGOYA', 'DC-SAPPORO'];
const OS = ['Ubuntu 22.04', 'RHEL 9.3', 'Debian 12', 'Windows Server 2022', 'Amazon Linux 2023'];
const ENV = ['Production', 'Production', 'Staging', 'Development'];
// メタ情報パネル用。既存の乱数列（配置・状態）を動かさないよう、別の乱数で引く
const SITES = ['TYO-A', 'TYO-B', 'OSA-A', 'NGO-A', 'SPK-A'];
const PORTS = {
  WEB: [[22, 80, 443], [22, 443, 8443]], DB: [[22, 5432], [22, 3306], [22, 1521]], APP: [[22, 8080, 8443], [22, 9000]],
  FW: [[22, 443, 541]], VPN: [[443, 500, 4500], [1194, 443]], KBS: [[22, 6443, 10250]], S3: [[443, 9000]], DC: [[53, 389, 636, 3389]],
};
const OWNERS = ['NetOps', 'SecOps', 'Platform', 'DBA', 'AppDev', 'InfraSRE'];

export const riskFor = (state, r = Math.random) =>
  Math.round((state === 2 ? 7.4 + r() * 2.1 : state === 1 ? 4.4 + r() * 2.4 : state === 3 ? 0.4 : 1 + r() * 3.4) * 10) / 10;

export function makeAssets() {
  const r = rng(11), m = rng(23);
  const keys = Object.keys(TYPES);
  const counters = {};
  const out = [];
  for (let i = 0; i < GRID * GRID; i++) {
    const gx = i % GRID, gz = (i / GRID) | 0;
    // 見栄えのため、中央付近のアセットが重要種別になりやすいよう先頭から巡回
    const type = i === 12 ? 'WEB' : keys[(r() * keys.length) | 0];
    const T = TYPES[type];
    counters[type] = (counters[type] || 0) + 1;
    const name = type === 'DC' ? DC_NAMES[(counters[type] - 1) % DC_NAMES.length] : `${type}-${String(counters[type]).padStart(2, '0')}`;
    const u = r();
    const state = i === 12 ? 2 : u < 0.68 ? 0 : u < 0.82 ? 1 : u < 0.93 ? 2 : 3;
    const w = Math.max(...T.parts.map((q) => q.w)), d = Math.max(...T.parts.map((q) => q.d));
    const height = TILE_H + PART_GAP + T.parts.reduce((acc, q) => acc + q.h + PART_GAP, 0);
    out.push({
      index: i, gx, gz,
      x: (gx - (GRID - 1) / 2) * SPACING,
      z: (gz - (GRID - 1) / 2) * SPACING,
      type, label: T.label, icon: T.icon, parts: T.parts, w, d, height, name,
      ip: `10.0.${(r() * 40) | 0}.${1 + ((r() * 250) | 0)}`,
      os: OS[(r() * OS.length) | 0], env: ENV[(r() * ENV.length) | 0],
      site: SITES[(m() * SITES.length) | 0], owner: OWNERS[(m() * OWNERS.length) | 0],
      ports: PORTS[type][(m() * PORTS[type].length) | 0], scanned: 1 + ((m() * 46) | 0),
      alerts: state === 2 ? 2 + ((r() * 4) | 0) : state === 1 ? 1 + ((r() * 2) | 0) : 0,
      risk: riskFor(state, r),
      state, targetState: state,
      load: state === 3 ? 0.06 : 0.25 + r() * 0.7,
      loadPhase: r() * 100,
      color: STATE_COLORS[state].slice(),
    });
  }
  return out;
}

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const v2 = (x = 0, y = 0) => new Vector2(x, y);

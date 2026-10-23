import { U } from './uniforms.js';
import { TYPE_COL, ICE } from './graph.js';

// 配色テーマ。ice（氷青・Asset Intelligence）と amber（琥珀・Amber Atlas）。
// 3D・シェーダー・DOM・2Dオーバーレイを同じ名前で切り替える。
const CTI_TYPES = {
  ice: { ACTOR: [1.00, 0.42, 0.88], CAMPAIGN: [1.00, 0.74, 0.28], MALWARE: [1.00, 0.27, 0.45], TTP: [0.40, 0.95, 1.00], IOC: [0.66, 1.00, 0.42], SECTOR: [0.62, 0.64, 1.00] },
  amber: { ACTOR: [1.00, 0.52, 0.18], CAMPAIGN: [1.00, 0.86, 0.38], MALWARE: [1.00, 0.30, 0.32], TTP: [0.36, 0.90, 0.95], IOC: [0.70, 1.00, 0.45], SECTOR: [0.78, 0.62, 1.00] },
};
// 背景・床の色を線形に写す行列（出力R,G,Bの各行）。氷青の暗い背景を琥珀の暗い背景へ。
const BG = {
  ice: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  amber: [[0.25, 0, 0.95], [0.12, 0.10, 0.55], [0.03, 0, 0.10]],
};
const TINT = { ice: [0, 0.004, 0.008], amber: [0.008, 0.004, 0] };

export const PAL = { base: ICE.slice(), dim: ICE.map((v) => v * 0.30), acc: [0.30, 0.90, 1.0], ice: [0.62, 0.80, 0.98] };
export const theme = { name: 'ice', amber: false };
const listeners = [];
export const onTheme = (f) => listeners.push(f);

export function applyTheme(name) {
  if (name === theme.name) return false;
  theme.name = name; theme.amber = name === 'amber';
  Object.assign(TYPE_COL, CTI_TYPES[name]);
  PAL.base = theme.amber ? [1.0, 0.80, 0.50] : ICE.slice();
  PAL.dim = PAL.base.map((v) => v * 0.30);
  PAL.ice = theme.amber ? [1.0, 0.72, 0.38] : [0.62, 0.80, 0.98];
  PAL.acc = theme.amber ? [1.0, 0.62, 0.20] : [0.30, 0.90, 1.0];
  U.uBgR.value.set(...BG[name][0]); U.uBgG.value.set(...BG[name][1]); U.uBgB.value.set(...BG[name][2]);
  U.uTint.value.set(...TINT[name]);
  document.body.dataset.theme = name;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.amber ? '#070401' : '#010407');
  listeners.forEach((f) => f(name));
  return true;
}

// ---- 2Dオーバーレイの色変換 ----
// オーバーレイの色は氷青で書いてある。琥珀テーマでは「青系の色相」だけを琥珀へ回し、
// 赤・緑・紫・シアンなどの意味のある色と、無彩色の白はそのまま残す。
const NUM = '(\\d+(?:\\.\\d+)?)';
const RGBA = new RegExp(`^rgba?\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*(?:,\\s*(\\.?\\d+(?:\\.\\d+)?(?:e-?\\d+)?)\\s*)?\\)$`);
const cache = new Map();

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function shift(r, g, b) {
  const [h, s, l] = hsl(r, g, b);
  if (h < 192 || h > 262 || s < 0.15) return null;
  // 色相を琥珀（約36°）へ。明るい色は少し落として、白飛びの代わりに温かい黄白にする。
  const l2 = l > 0.8 ? 0.70 + (l - 0.8) * 1.0 : l * 0.88;
  return rgb(36 + (h - 220) * 0.12, Math.min(1, s * 0.96), l2);
}

export function mapCss(v) {
  if (!theme.amber || typeof v !== 'string') return v;
  let o = cache.get(v);
  if (o !== undefined) return o;
  let r, g, b, a = 1, m;
  if ((m = RGBA.exec(v))) { r = +m[1]; g = +m[2]; b = +m[3]; if (m[4] !== undefined) a = +m[4]; }
  else if (v[0] === '#' && (v.length === 7 || v.length === 4)) {
    const h = v.length === 4 ? v.slice(1).replace(/./g, '$&$&') : v.slice(1);
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  } else { cache.set(v, v); return v; }
  const q = shift(r, g, b);
  o = q ? `rgba(${q[0]},${q[1]},${q[2]},${a})` : v;
  if (cache.size > 6000) cache.clear();
  cache.set(v, o);
  return o;
}

// canvas 2D コンテキストの色指定（fillStyle / strokeStyle / shadowColor / グラデーション停止色）を変換経由にする
export function patchCtx(ctx) {
  const proto = Object.getPrototypeOf(ctx);
  for (const k of ['fillStyle', 'strokeStyle', 'shadowColor']) {
    const d = Object.getOwnPropertyDescriptor(proto, k);
    Object.defineProperty(ctx, k, { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, theme.amber ? mapCss(v) : v); } });
  }
  for (const k of ['createLinearGradient', 'createRadialGradient']) {
    const orig = ctx[k].bind(ctx);
    ctx[k] = (...a) => { const g = orig(...a), add = g.addColorStop.bind(g); g.addColorStop = (o, c) => add(o, mapCss(c)); return g; };
  }
}

import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, DataTexture, DoubleSide, DynamicDrawUsage,
  FloatType, Group, LatheGeometry, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, NearestFilter, PlaneGeometry, Points,
  RGBAFormat, Scene, ShaderMaterial, Vector2, GreaterDepth,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { U } from './uniforms.js';
import { PART_GAP, STATE_COLORS, TILE, TILE_H, rng } from './data.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- 共通の頂点処理: 起動演出・選択時のせり上がり・波紋・ホバー（ガラスと発光レイヤーの両方に使う）----
const PREAMBLE = /* glsl */`
attribute float aAsset, aPart, aBev, aSeed, aIcon;
attribute vec3 aCenter;
uniform sampler2D uData;
uniform float uMT, uQuiet, uBoot, uSelA, uSelT, uPrevA, uPrevT, uHoverA, uHoverK;
uniform vec2 uSelPos;
float g_sel, g_hov, g_rv;
float eo(float x){ x = clamp(x, 0., 1.); return 1. - pow(1. - x, 3.); }
vec3 displaceAsset(vec3 pos){
  vec4 dat = texelFetch(uData, ivec2(int(aAsset + .5), 0), 0);
  float dist = length(aCenter.xz);
  g_rv = eo((uBoot - (0.9 + dist * 0.11) - aPart * 0.16) / 0.9);
  float sel = abs(aAsset - uSelA) < 0.5 ? smoothstep(0., 0.9, uSelT) : 0.;
  float prv = abs(aAsset - uPrevA) < 0.5 ? 1. - smoothstep(0., 0.9, uPrevT) : 0.;
  g_sel = max(sel, prv);
  g_hov = abs(aAsset - uHoverA) < 0.5 ? uHoverK : 0.;
  vec2 dv = aCenter.xz - uSelPos;
  float d = length(dv);
  float w = uSelA > -0.5 ? exp(-pow((d - uSelT * 10.) / 1.5, 2.)) * exp(-uSelT * 0.7) : 0.;
  vec3 p = pos;
  p.y += aPart * (0.22 * g_sel + 0.035 * g_hov) + w * (0.05 + 0.10 * aPart);
  p.y += (1. - g_rv) * 3.0;
  p.y += sin(uMT * 1.3 + aSeed * 6.283) * 0.006 * dat.x * aPart * (1. - uQuiet);
  if (d > 0.01) p.xz += normalize(dv) * w * 0.07 * step(0.5, aPart);
  return p;
}`;

const VERT = /* glsl */`
${PREAMBLE}
varying vec3 vN, vView, vLocal, vColor;
varying vec2 vUv;
varying float vLoad, vSel, vReveal, vSeed, vBev, vPart, vIcon;
void main(){
  vec4 dat = texelFetch(uData, ivec2(int(aAsset + .5), 0), 0);
  vec3 p = displaceAsset(position);
  vLocal = vec3(position.x - aCenter.x, position.y, position.z - aCenter.z);
  vUv = uv; vN = normal; vView = cameraPosition - p;
  vColor = dat.yzw; vLoad = dat.x; vSeed = aSeed; vReveal = g_rv; vBev = aBev; vPart = aPart; vIcon = aIcon;
  vSel = max(g_sel, g_hov * 0.45);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
}`;

// ---- アクリル: 暗い透明体 + 面取りの輝線 + 鏡面ハイライト + 内部の発光 ----
const GLASS_FRAG = /* glsl */`
uniform float uMT, uQuiet;
varying vec3 vN, vView, vLocal, vColor;
varying vec2 vUv;
varying float vLoad, vSel, vReveal, vSeed, vBev, vPart;
const vec3 ICE = vec3(0.84, 0.94, 1.0);
float lineAA(float d, float w){ return 1. - clamp(abs(d) / max(w, 1e-4), 0., 1.); }
void main(){
  vec3 N = normalize(vN), V = normalize(vView);
  if (!gl_FrontFacing) N = -N;
  float ndv = abs(dot(N, V));
  float fres = pow(1. - ndv, 2.6);
  vec3 R = reflect(-V, N);
  float spec = 0.;
  float back = gl_FrontFacing ? 1. : 0.45;
  float bev = vBev;
  vec3 c;
  if (vPart < 0.5) {
    // タイル: 暗いガラス板。縁の輝きと、天面に彫られた内側の枠線
    float top = step(0.9, N.y);
    float m = max(abs(vLocal.x), abs(vLocal.z));
    float fw = fwidth(m);
    float frame = top * lineAA(m - (${(TILE / 2 - 0.18).toFixed(2)}), fw * 1.1);
    float tick = top * lineAA(m - (${(TILE / 2 - 0.30).toFixed(2)}), fw) * step(${(TILE / 2 - 0.9).toFixed(2)}, min(abs(vLocal.x), abs(vLocal.z)));
    c = ICE * (bev * (0.16 + 0.2 * vSel) + fres * 0.006)
      + ICE * frame * (0.10 + 0.28 * vSel) + vColor * tick * 0.12
      + vColor * vSel * top * smoothstep(${(TILE / 2).toFixed(2)}, 0.0, m) * 0.012;
  } else {
    // ブロック: 面取り部が光り、天面と側面に鏡面が走る。内部にはアイコン由来の光が溜まる
    float r = length(vLocal.xz);
    float glow = exp(-r * r * 1.6) * (0.04 + 0.16 * vLoad) * (1. + 2.4 * vSel) * (0.7 + 0.3 * sin(uMT * 1.5 + vSeed * 20.) * (1. - uQuiet));
    c = ICE * (bev * (0.22 + 0.30 * vSel) + fres * 0.006)
      + vColor * glow * 0.2;
  }
  c *= back * vReveal;
  c += vColor * (vReveal > 0. && vReveal < 0.98 ? (1. - vReveal) * (bev + 0.2) * 1.4 : 0.);
  gl_FragColor = vec4(c, 1.);
}`;

// ---- ブロック内に浮かぶアイコンと、それを囲むリング ----
const ICON_FRAG = /* glsl */`
uniform float uMT, uQuiet;
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec3 vColor;
varying float vLoad, vSel, vReveal, vSeed, vIcon;
void main(){
  vec2 p = vUv - .5;
  float r = length(p) * 2.;
  float ang = atan(p.y, p.x);
  float k = 1. + 0.08 * vSel;
  vec2 q = p / (0.56 * k) + .5;
  float ia = 0.;
  if (q.x > 0. && q.x < 1. && q.y > 0. && q.y < 1.) {
    float col = mod(vIcon, 4.), row = floor(vIcon / 4.);
    ia = texture2D(uAtlas, vec2((col + q.x) / 4., 1. - (row + 1.) / 2. + q.y / 2.)).a;
  }
  float pulse = 0.75 + 0.25 * sin(uMT * (1.4 + vLoad * 2.) + vSeed * 12.) * (1. - uQuiet) + 0.12 * uQuiet;
  float dash1 = step(0.45, fract(ang * 3. / 6.2832 + uMT * 0.10 + vSeed));
  float dash2 = step(0.35, fract(ang * 5. / 6.2832 - uMT * 0.14 + vSeed * 3.));
  float ring1 = smoothstep(0.018, 0., abs(r - 0.90)) * dash1;
  float ring2 = smoothstep(0.012, 0., abs(r - 0.80)) * 0.55;
  float ring3 = smoothstep(0.016, 0., abs(r - 0.70)) * dash2;
  float tick = smoothstep(0.02, 0., abs(r - 0.96)) * step(0.5, fract(ang * 24. / 6.2832));
  float glow = exp(-r * r * 3.4);
  float gain = (0.40 + 0.40 * vLoad) * (1. + 0.45 * vSel);
  vec3 c = vColor * (ia * 1.2 * pulse + (ring1 + ring3) * 0.8 + ring2 * 0.5 + tick * 0.45 + glow * 0.06) * gain
         + vec3(1.) * ia * 0.12 * pulse;
  gl_FragColor = vec4(c * vReveal, 1.);
}`;

// ---- タイルに印字する名前 ----
const LABEL_FRAG = /* glsl */`
uniform sampler2D uLabel;
varying vec2 vUv;
varying vec3 vColor;
varying float vSel, vReveal;
void main(){
  float a = texture2D(uLabel, vUv).a;
  vec3 c = mix(vec3(0.72, 0.86, 1.0), vec3(1.), vSel) * a * (0.50 + 0.5 * vSel);
  gl_FragColor = vec4(c * vReveal, 1.);
}`;

const MOTE_VERT = /* glsl */`
attribute vec3 aCenter;
attribute float aSeed, aHeight, aRad, aLoad;
attribute vec3 aColor;
uniform float uMT, uQuiet, uBoot, uPR;
varying float vA;
varying vec3 vColor;
float eo(float x){ x = clamp(x, 0., 1.); return 1. - pow(1. - x, 3.); }
void main(){
  float ph = fract(uMT * (0.07 + aLoad * 0.30) + aSeed);
  float ang = aSeed * 40. + uMT * 0.35 * (aSeed - .5);
  vec3 p = aCenter + vec3(cos(ang) * aRad, ph * aHeight + 0.2, sin(ang) * aRad);
  float rv = eo((uBoot - (1.8 + length(aCenter.xz) * 0.11)) / 1.0);
  vA = sin(ph * 3.14159) * rv * (0.15 + aLoad * 0.5) * (1. - uQuiet);
  vColor = aColor;
  vec4 mv = viewMatrix * vec4(p, 1.);
  gl_PointSize = clamp((1.3 + aSeed * 1.8) * uPR * 26. / -mv.z, 1., 6. * uPR);
  gl_Position = projectionMatrix * mv;
}`;
const MOTE_FRAG = /* glsl */`
varying float vA;
varying vec3 vColor;
void main(){
  float d = smoothstep(.5, 0., length(gl_PointCoord - .5));
  gl_FragColor = vec4((vColor * 0.9 + 0.3) * d * vA, 1.);
}`;


// ---- ブロックの背面に立つ縦パネル: IP・OS などのメタ情報 ----
// ブロックの −Z 側の隙間に固定して立てる（カメラには追従しない）。すりガラス風: パネルの向こうの3Dを
// ぼかした像（post.js の BlurCapture）を地にして、文字を重ねる。手前のブロックに隠れる部分は、文字だけ薄く透かす。
const PCW = 512, PCH = 352;            // 1枚分のテクスチャ（px）
const PW = 3.4, PH = PW * PCH / PCW;   // 板の大きさ（ワールド）
const PY0 = 0.9;                       // 床からの高さ（手前のブロックの上に文字が出るように浮かせる）
const PRING = 2.25;                    // ブロック中心から背面の隙間の中心まで
const BAR = [108, 314, 330, 330];      // ロードバーの枠（x0, y0, x1, y1 / px）
const MONO = '"SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';

const PANEL_VERT = /* glsl */`
${PREAMBLE}
varying vec2 vCell, vUv;
varying vec3 vColor;
varying float vLoad, vSel, vRV, vSeed, vOn;
uniform float uSolo;
void main(){
  vec4 dat = texelFetch(uData, ivec2(int(aAsset + .5), 0), 0);
  displaceAsset(vec3(0.));   // g_sel / g_hov だけ欲しい
  vRV = eo((uBoot - (2.4 + length(aCenter.xz) * 0.11)) / 1.0);
  vec3 base = aCenter + vec3(0., ${PY0.toFixed(2)}, -${PRING.toFixed(2)});
  float sc = 0.72 + 0.40 * g_sel + 0.06 * g_hov;   // 選択中だけ大きく読めるサイズ。他は小さな札
  vec3 p = base + (position - base) * sc;
  vCell = vec2((position.x - aCenter.x) / ${PW.toFixed(3)} + .5, (position.y - ${PY0.toFixed(2)}) / ${PH.toFixed(4)});
  vUv = uv; vColor = dat.yzw; vLoad = dat.x; vSeed = aSeed;
  vSel = max(g_sel, g_hov * 0.5);
  vOn = mix(1., g_sel, uSolo);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
}`;

const PANEL_FRAG = /* glsl */`
uniform float uMT, uQuiet;
uniform sampler2D uMeta, uBlur;
uniform vec2 uRes;
varying vec2 vCell, vUv;
varying vec3 vColor;
varying float vLoad, vSel, vRV, vSeed, vOn;
void main(){
  if (vOn < 0.02 || vCell.y > vRV) discard;
  vec3 t = texture2D(uMeta, vUv).rgb;
  vec2 bc = (vCell - vec2(${(BAR[0] + 3) / PCW}, ${1 - (BAR[3] - 3) / PCH})) / vec2(${(BAR[2] - BAR[0] - 6) / PCW}, ${(BAR[3] - BAR[1] - 6) / PCH});
  float fill = step(0., bc.x) * step(bc.x, vLoad) * step(0., bc.y) * step(bc.y, 1.);
  float m = max(max(t.r, t.g), max(t.b, fill));
  vec3 ice = vec3(0.72, 0.88, 1.0);
  vec3 txt = ice * t.r + vColor * t.g * 1.1 + ice * t.b * 0.6 + vColor * fill * 0.95;
  txt *= (0.55 + 0.75 * vSel) * vOn;
  float sw = exp(-pow((vCell.y - fract(uMT * 0.18 + vSeed)) / 0.05, 2.)) * (1. - uQuiet);   // ゆっくり上る走査光
  txt += ice * sw * m * 0.35;
#ifdef GHOST
  // 手前のブロックの陰になった部分: 文字だけを薄く透かす
  if (m < 0.05) discard;
  gl_FragColor = vec4(txt * 0.32, 1.);
#else
  // すりガラス: 向こう側のぼかし像を暗めに敷き、上ほど少し明るくする
  vec3 bl = texture2D(uBlur, gl_FragCoord.xy / uRes).rgb;
  vec3 col = bl * 0.55 + ice * (0.004 + 0.020 * vCell.y) + vec3(0.001, 0.003, 0.006) + txt;
  col += vec3(0.8, 0.95, 1.) * exp(-pow((vCell.y - vRV) / 0.02, 2.)) * step(vRV, 0.999) * 0.35;   // 書き上がりの先端
  gl_FragColor = vec4(col, 1.);
#endif
}`;

// 1枚分を描く。R=文字と枠（氷色）、G=状態色で光らせる部分、B=ロードバーの枠。黒地に加算で重ねる。
function drawMeta(g, a, ox, oy) {
  const R = (k = 1) => `rgba(255,0,0,${k})`, G = (k = 1) => `rgba(0,255,0,${k})`, Bl = (k = 1) => `rgba(0,0,255,${k})`;
  g.save(); g.translate(ox, oy);
  g.beginPath(); g.rect(0, 0, PCW, PCH); g.clip();
  g.fillStyle = '#000'; g.fillRect(0, 0, PCW, PCH);
  g.globalCompositeOperation = 'lighter';
  g.textBaseline = 'alphabetic';
  const tx = (s, x, y, size, col, o = {}) => {
    g.font = `${o.w || 400} ${size}px ${o.f || MONO}`; g.fillStyle = col; g.textAlign = o.a || 'left';
    if ('letterSpacing' in g) g.letterSpacing = `${o.ls || 0}px`;
    g.fillText(s, x, y);
  };
  // 枠は細い矩形だけ
  g.lineWidth = 2; g.strokeStyle = R(0.6);
  g.strokeRect(3, 3, PCW - 6, PCH - 6);
  // 見出し
  tx(a.name, 24, 66, 50, R(1), { w: 700, f: '"Helvetica Neue", Arial, "Hiragino Sans", sans-serif' });
  tx(a.label.toUpperCase(), 26, 94, 21, R(0.62), { ls: 1.5 });
  tx('RISK', PCW - 26, 40, 18, G(0.8), { a: 'right', ls: 2 });
  tx(a.risk.toFixed(1), PCW - 26, 82, 40, G(1), { a: 'right', w: 700 });
  g.fillStyle = R(0.3); g.fillRect(24, 112, PCW - 48, 1.5);
  // メタ情報
  [['IP', a.ip], ['OS', a.os], ['ENV', a.env], ['PORT', a.ports.join(' ')]].forEach(([k, v], n) => {
    const y = 156 + n * 40;
    tx(k, 26, y, 22, R(0.58), { ls: 2 });
    tx(v, 108, y, 32, R(1));
  });
  // ロードバー（中身は負荷に合わせてシェーダーで塗る）と、アラート数
  tx('LOAD', 26, BAR[3], 20, R(0.58), { ls: 2 });
  g.lineWidth = 2; g.strokeStyle = Bl(1); g.strokeRect(BAR[0], BAR[1], BAR[2] - BAR[0], BAR[3] - BAR[1]);
  if (a.alerts) tx(`▲ ${a.alerts}`, PCW - 26, 336, 30, G(1), { a: 'right', w: 700 });
  else tx('CLEAR', PCW - 26, 334, 22, R(0.55), { a: 'right', ls: 2 });
  g.restore();
}

function metaAtlas(assets, cols) {
  const rows = Math.ceil(assets.length / cols), cv = document.createElement('canvas');
  cv.width = PCW * cols; cv.height = PCH * rows;
  const g = cv.getContext('2d');
  assets.forEach((a, i) => drawMeta(g, a, (i % cols) * PCW, Math.floor(i / cols) * PCH));
  const t = new CanvasTexture(cv);
  t.generateMipmaps = true; t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.anisotropy = 8;
  t.cv = cv; t.cols = cols;
  return t;
}

// ---- ジオメトリ ----
function puckGeometry(r, h, seg) {
  const b = Math.min(0.045, r * 0.3, h * 0.4), pts = [new Vector2(0, 0), new Vector2(r - b, 0)];
  for (let i = 1; i <= 3; i++) { const a = -Math.PI / 2 + (i / 3) * (Math.PI / 2); pts.push(new Vector2(r - b + Math.cos(a) * b, b + Math.sin(a) * b)); }
  for (let i = 1; i <= 3; i++) { const a = (i / 3) * (Math.PI / 2); pts.push(new Vector2(r - b + Math.cos(a) * b, h - b + Math.sin(a) * b)); }
  pts.push(new Vector2(0, h));
  return new LatheGeometry(pts, seg);
}

// 面取り部を示す属性（0〜1）を頂点ごとに求める
function bevelAttr(geo, kind) {
  const n = geo.attributes.normal, out = new Float32Array(n.count);
  for (let i = 0; i < n.count; i++) {
    const x = Math.abs(n.getX(i)), y = Math.abs(n.getY(i)), z = Math.abs(n.getZ(i));
    out[i] = kind === 'puck' ? sstep(0.12, 0.45, y) * (1 - sstep(0.85, 0.97, y)) : 1 - sstep(0.82, 0.985, Math.max(x, y, z));
  }
  return out;
}

function decorate(src, a, part, kind) {
  const geo = src.index ? src.toNonIndexed() : src;
  const n = geo.attributes.position.count;
  const fill = (v, size = 1) => {
    const arr = new Float32Array(n * size);
    for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arr[i * size + k] = Array.isArray(v) ? v[k] : v;
    return new BufferAttribute(arr, size);
  };
  geo.setAttribute('aAsset', fill(a.index));
  geo.setAttribute('aPart', fill(part));
  geo.setAttribute('aCenter', fill([a.x, 0, a.z], 3));
  geo.setAttribute('aSeed', fill((a.index * 0.137 + part * 0.071) % 1));
  geo.setAttribute('aIcon', fill(a.icon));
  geo.setAttribute('aBev', kind ? new BufferAttribute(bevelAttr(geo, kind), 1) : fill(0));
  return geo;
}

function iconAtlas() {
  const S = 128, cv = document.createElement('canvas');
  cv.width = S * 4; cv.height = S * 2;
  const g = cv.getContext('2d');
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  const R = 40;
  const hex = () => { g.beginPath(); for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3; g[k ? 'lineTo' : 'moveTo'](Math.cos(a) * R, Math.sin(a) * R); } g.closePath(); };
  const draw = [
    // 地球儀
    () => { g.beginPath(); g.arc(0, 0, R, 0, 7); g.stroke(); g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0); g.moveTo(0, -R); g.lineTo(0, R); g.stroke(); g.beginPath(); g.ellipse(0, 0, R * 0.5, R, 0, 0, 7); g.stroke(); },
    // データベース
    () => { for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(0, -R * 0.55 + k * R * 0.55, R * 0.8, R * 0.26, 0, 0, 7); g.stroke(); } g.beginPath(); g.moveTo(-R * 0.8, -R * 0.55); g.lineTo(-R * 0.8, R * 0.55); g.moveTo(R * 0.8, -R * 0.55); g.lineTo(R * 0.8, R * 0.55); g.stroke(); },
    // 歯車
    () => { g.beginPath(); g.arc(0, 0, R * 0.6, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, R * 0.24, 0, 7); g.stroke(); g.lineWidth = 12; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.stroke(); } g.lineWidth = 7; },
    // 盾
    () => { g.beginPath(); g.moveTo(0, -R); g.quadraticCurveTo(R * 0.9, -R * 0.7, R * 0.8, 0); g.quadraticCurveTo(R * 0.6, R * 0.7, 0, R); g.quadraticCurveTo(-R * 0.6, R * 0.7, -R * 0.8, 0); g.quadraticCurveTo(-R * 0.9, -R * 0.7, 0, -R); g.stroke(); g.beginPath(); g.moveTo(-R * 0.35, 0); g.lineTo(-R * 0.08, R * 0.3); g.lineTo(R * 0.4, -R * 0.25); g.stroke(); },
    // 鍵
    () => { g.strokeRect(-R * 0.7, -R * 0.1, R * 1.4, R * 1.0); g.beginPath(); g.arc(0, -R * 0.1, R * 0.45, Math.PI, 0); g.stroke(); g.beginPath(); g.arc(0, R * 0.4, R * 0.1, 0, 7); g.fill(); },
    // ホイール
    () => { hex(); g.stroke(); g.beginPath(); g.arc(0, 0, R * 0.3, 0, 7); g.stroke(); for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.stroke(); } },
    // 立方体
    () => { hex(); g.moveTo(0, 0); g.lineTo(Math.cos(Math.PI / 6) * R, Math.sin(Math.PI / 6) * R); g.moveTo(0, 0); g.lineTo(Math.cos(5 * Math.PI / 6) * R, Math.sin(5 * Math.PI / 6) * R); g.moveTo(0, 0); g.lineTo(0, -R); g.stroke(); },
    // 星
    () => { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? R * 0.45 : R; g[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); },
  ];
  draw.forEach((fn, i) => { g.save(); g.translate((i % 4) * S + S / 2, Math.floor(i / 4) * S + S / 2); fn(); g.restore(); });
  const t = new CanvasTexture(cv); t.minFilter = LinearFilter; t.generateMipmaps = false;
  return t;
}

function labelAtlas(assets, cols) {
  const cw = 256, ch = 64, rows = Math.ceil(assets.length / cols), cv = document.createElement('canvas');
  cv.width = cw * cols; cv.height = ch * rows;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.font = '600 38px "Helvetica Neue", Arial, "Hiragino Sans", sans-serif';
  assets.forEach((a, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    g.fillText(a.name, x + 8, y + ch / 2 - 2);
    g.fillRect(x + 8, y + ch - 9, 44, 3);
  });
  const t = new CanvasTexture(cv); t.minFilter = LinearFilter; t.generateMipmaps = false;
  return t;
}

export class AssetField {
  constructor(scene, assets) {
    this.assets = assets;
    this.group = new Group();
    scene.add(this.group);
    const na = assets.length, cols = 5;

    // 状態テクスチャ: 資産ごとに (負荷, 色rgb) を1テクセルで持つ
    this.data = new DataTexture(new Float32Array(na * 4), na, 1, RGBAFormat, FloatType);
    this.data.minFilter = this.data.magFilter = NearestFilter;

    const tiles = [], bodies = [], icons = [], labels = [], panels = [];
    assets.forEach((a) => {
      tiles.push(decorate(new RoundedBoxGeometry(TILE, TILE_H, TILE, 2, 0.035).translate(a.x, TILE_H / 2, a.z), a, 0, 'box'));
      let y = TILE_H + PART_GAP;
      a.parts.forEach((p, i) => {
        const g = p.kind === 'box'
          ? new RoundedBoxGeometry(p.w, p.h, p.d, 2, 0.045).translate(a.x, y + p.h / 2, a.z)
          : puckGeometry(p.r, p.h, p.seg).translate(a.x, y, a.z);
        bodies.push(decorate(g, a, i + 1, p.kind === 'box' ? 'box' : 'puck'));
        y += p.h + PART_GAP;
      });
      // アイコンは最下段のブロックの内側に置く（上の段越しに光って見える）
      const first = a.parts[0], size = Math.min(2.3, Math.min(first.w, first.d) * 0.98);
      icons.push(decorate(new PlaneGeometry(size, size).rotateX(-Math.PI / 2).translate(a.x, TILE_H + PART_GAP + first.h - 0.13, a.z), a, 1, null));

      // 名前ラベル（タイル手前の右寄りに、グリッドと平行に置く）
      const lw = 1.9, lh = lw / 4;
      const lg = new PlaneGeometry(lw, lh).rotateX(-Math.PI / 2).translate(a.x + TILE / 2 - lw / 2 - 0.35, TILE_H + 0.006, a.z + TILE / 2 - 0.46);
      const uv = lg.attributes.uv, c = a.index % cols, rr = Math.floor(a.index / cols), rows = Math.ceil(na / cols);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (c + uv.getX(i)) / cols, 1 - (rr + 1) / rows + uv.getY(i) / rows);
      labels.push(decorate(lg, a, 0, null));

      // メタ情報パネル（形は画面向きの板。位置はシェーダーで決める）
      const pg = new PlaneGeometry(PW, PH).translate(a.x, PY0 + PH / 2, a.z - PRING), pu = pg.attributes.uv, rows2 = Math.ceil(na / cols);
      for (let i = 0; i < pu.count; i++) pu.setXY(i, (c + pu.getX(i)) / cols, 1 - (rr + 1) / rows2 + pu.getY(i) / rows2);
      panels.push(decorate(pg, a, 1, null));
    });

    const mat = (frag, defines = {}, extra = {}) => new ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, defines,
      uniforms: { ...U, uData: { value: this.data }, ...extra },
      transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, side: DoubleSide,
    });
    const tileGeo = mergeGeometries(tiles), bodyGeo = mergeGeometries(bodies);
    const overlayGeo = mergeGeometries([...tiles, ...bodies]);
    this.overlay = new Mesh(overlayGeo, mat(GLASS_FRAG));
    this.icons = new Mesh(mergeGeometries(icons), mat(ICON_FRAG, {}, { uAtlas: { value: iconAtlas() } }));
    this.labels = new Mesh(mergeGeometries(labels), mat(LABEL_FRAG, {}, { uLabel: { value: labelAtlas(assets, cols) } }));

    // 物理ベースのガラス: 屈折（transmission + ior）、厚み由来の吸収、分散、環境マップの映り込み
    this.body = new Mesh(bodyGeo, this.glassMaterial({
      color: 0xffffff, transmission: 1, thickness: 0.8, ior: 1.5, roughness: 0.01, dispersion: 0.3,
      attenuationColor: new Color(0xc8e6ff), attenuationDistance: 8, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 2.2,
    }));
    this.tile = new Mesh(tileGeo, this.glassMaterial({
      color: 0x0a1622, transmission: 0.9, thickness: 0.35, ior: 1.5, roughness: 0.4, specularIntensity: 0.08,
      attenuationColor: new Color(0x2a5a8a), attenuationDistance: 0.8, clearcoat: 0, envMapIntensity: 0.06,
    }));
    this.tile.renderOrder = 0; this.body.renderOrder = 1;
    this.overlay.renderOrder = 3; this.labels.renderOrder = 3.5; this.icons.renderOrder = 4;
    // メタ情報パネルは不透明パス。ガラスの屈折像に入る
    this.meta = metaAtlas(assets, cols);
    for (const m of [this.tile, this.body, this.overlay, this.icons, this.labels]) { m.frustumCulled = false; this.group.add(m); }
    // パネルは別シーン（post.js が、ぼかしの像を作ったあとに重ねて描く）
    this.plateScene = new Scene();
    const pgeo = mergeGeometries(panels), pu = { ...U, uData: { value: this.data }, uMeta: { value: this.meta }, uSolo: { value: 0 } };
    this.panel = new Mesh(pgeo, new ShaderMaterial({ vertexShader: PANEL_VERT, fragmentShader: PANEL_FRAG, uniforms: pu, side: DoubleSide }));
    this.ghost = new Mesh(pgeo, new ShaderMaterial({
      vertexShader: PANEL_VERT, fragmentShader: PANEL_FRAG, defines: { GHOST: 1 }, uniforms: pu, side: DoubleSide,
      transparent: true, blending: AdditiveBlending, depthWrite: false, depthFunc: GreaterDepth,
    }));
    this.ghost.renderOrder = 1;
    for (const m of [this.panel, this.ghost]) { m.frustumCulled = false; this.plateScene.add(m); }

    // 上昇する光の粒
    const r = rng(99), PER = 4, np = na * PER;
    const pg = new BufferGeometry();
    const P = { position: new Float32Array(np * 3), aCenter: new Float32Array(np * 3), aSeed: new Float32Array(np), aHeight: new Float32Array(np), aRad: new Float32Array(np) };
    this.mLoad = new BufferAttribute(new Float32Array(np), 1).setUsage(DynamicDrawUsage);
    this.mColor = new BufferAttribute(new Float32Array(np * 3), 3).setUsage(DynamicDrawUsage);
    this.PER = PER;
    assets.forEach((a, i) => {
      for (let j = 0; j < PER; j++) {
        const q = i * PER + j;
        P.aCenter.set([a.x, 0, a.z], q * 3);
        P.aSeed[q] = r(); P.aHeight[q] = a.height + 0.9 + r() * 0.8; P.aRad[q] = 0.2 + r() * Math.min(a.w, a.d) * 0.45;
      }
    });
    for (const [k, v] of Object.entries(P)) pg.setAttribute(k, new BufferAttribute(v, k === 'position' || k === 'aCenter' ? 3 : 1));
    pg.setAttribute('aLoad', this.mLoad); pg.setAttribute('aColor', this.mColor);
    this.motes = new Points(pg, new ShaderMaterial({
      vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, uniforms: { ...U },
      transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
    }));
    this.motes.frustumCulled = false; this.motes.renderOrder = 5;
    this.group.add(this.motes);

    // クリック判定用の不可視ボックス
    this.hit = new Group();
    this.hitMeshes = assets.map((a) => {
      const hm = new Mesh(new BoxGeometry(TILE, a.height + 0.4, TILE), new MeshBasicMaterial({ visible: false }));
      hm.position.set(a.x, (a.height + 0.4) / 2, a.z);
      hm.userData.index = a.index;
      this.hit.add(hm);
      return hm;
    });
    scene.add(this.hit);

    this.syncDynamic(0);
  }

  // 値が変わったアセットのパネルだけ描き直す
  refreshMeta(i) {
    const a = this.assets[i], t = this.meta;
    drawMeta(t.cv.getContext('2d'), a, (i % t.cols) * PCW, Math.floor(i / t.cols) * PCH);
    t.needsUpdate = true;
  }

  // 狭い画面では、選択中のパネルだけを見せる
  panelSolo(on) { this.panel.material.uniforms.uSolo.value = on ? 1 : 0; }   // ghost と同じ uniforms を共有

  glassMaterial(params) {
    const mat = new MeshPhysicalMaterial({ side: DoubleSide, ...params });
    const data = this.data;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, { uData: { value: data } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${PREAMBLE}`)
        .replace('#include <begin_vertex>', 'vec3 transformed = displaceAsset(position);');
    };
    mat.customProgramCacheKey = () => 'asset-glass';
    return mat;
  }

  // 負荷と状態色を反映（色は目標色へ滑らかに遷移）
  syncDynamic(dt) {
    const k = Math.min(1, dt * 3);
    const arr = this.data.image.data;
    this.assets.forEach((a, i) => {
      const tc = STATE_COLORS[a.targetState];
      for (let c = 0; c < 3; c++) a.color[c] += (tc[c] - a.color[c]) * (dt === 0 ? 1 : k);
      arr[i * 4] = a.load; arr[i * 4 + 1] = a.color[0]; arr[i * 4 + 2] = a.color[1]; arr[i * 4 + 3] = a.color[2];
      for (let j = 0; j < this.PER; j++) {
        const q = i * this.PER + j;
        this.mLoad.array[q] = a.load;
        this.mColor.array.set(a.color, q * 3);
      }
    });
    this.data.needsUpdate = true;
    this.mLoad.needsUpdate = this.mColor.needsUpdate = true;
  }
}

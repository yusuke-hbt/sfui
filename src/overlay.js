import { rng, GRID, SPACING, STATE_NAMES } from './data.js';
import { typeCss } from './graph.js';
import { installCtiPanels } from './ctipanels.js';
import { installWidgets } from './widgets.js';
import { patchCtx, mapCss } from './theme.js';

// 画面座標に固定した2Dレイヤー。3D側とは独立した時計・独立した周期で動く。
// パネルの背景（すりガラス）はDOM、中身はcanvasで描く。
const SANS = '"Inter", "Helvetica Neue", "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
// 日本語表記はすべて明朝体
const SERIF = '"Shippori Mincho", "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", "BIZ UDMincho", "IPAMincho", "Noto Serif CJK JP", serif';
const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;
const GLY = 'ABCDEF0123456789#%/<>+*';
const JPG = '電脳零式神経網義体基幹素子攻殻';
const WHITE = 'rgba(238,247,255,.94)';
const DIM = 'rgba(178,204,230,.78)';
const LINE = 'rgba(190,215,240,.20)';
const HI = 'rgba(150,196,240,.20)';

const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const noise = (x) => Math.sin(x * 1.7) * 0.5 + Math.sin(x * 2.9 + 1.3) * 0.3 + Math.sin(x * 5.3 + 0.7) * 0.2;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const pad2 = (n) => String(n).padStart(2, '0');
const clock = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

const LOG_POOL = [
  ['Suspicious process detected', 'WARN'], ['Latency increase', 'WARN'], ['Deployment success', 'INFO'],
  ['Multiple failed login attempts', 'ERROR'], ['Pod restarted', 'INFO'], ['Backup completed', 'INFO'],
  ['Access from unknown IP', 'ERROR'], ['Certificate renewed', 'INFO'], ['Port scan detected', 'WARN'],
];
const TECH = { T1190: 'Exploit Public-Facing...', T1059: 'Command and Scripting...' };
const REGIONS = [['All', 1284], ['DC-TOKYO', 284], ['DC-OSAKA', 176], ['AWS', 142], ['On-Prem', 432], ['Other', 250]];
const LAYERS = [['Asset', 'ASSET'], ['CVE', 'CVE'], ['CWE', 'CWE'], ['CAPEC', 'CAPEC'], ['ATT&CK', 'ATT&CK'], ['Tactic', 'TACTIC']];
const CTI_LAYERS = [['Actor', 'ACTOR'], ['Campaign', 'CAMPAIGN'], ['Malware', 'MALWARE'], ['TTP', 'TTP'], ['IOC', 'IOC'], ['Sector', 'SECTOR']];
const CTI_TABS = [['ACTORS', '攻撃者'], ['CAMPAIGNS', '作戦'], ['MALWARE', '悪性符号'], ['TTP', '手口'], ['IOC', '痕跡']];
const TABS = [['OVERVIEW', '概況'], ['THREAT', '脅威'], ['VULNERABILITY', '脆弱性'], ['RELATIONSHIP', '関係'], ['TIMELINE', '時系列']];
const JP_ALL = `脅威情報分析攻撃者概要関連情報活動推移作戦悪性符号手口痕跡脅威源脅威主体情報フィード${JPG}詳細一覧記録地図節点時系列階層資産情報解析システム第七区画全域配置一覧事象記録詳細関連節点時系列階層表示概況脅威脆弱性関係警告危険度同期率`;
const mod = (a, n) => ((a % n) + n) % n;
// 狭い画面で下から出すシートに載せるパネル（チップで切り替える）
const SHEETS = [['detail', 'DETAIL', '詳細'], ['alist', 'LIST', '一覧'], ['elog', 'LOG', '記録'], ['map', 'MAP', '地図'], ['related', 'NODES', '節点'], ['timeline', 'TIME', '時系列'], ['layer', 'LAYER', '階層']];
const SHEET_CUT = [0, 16, 0, 0];
const SHEET_JP = '詳細一覧記録地図節点時系列階層';

export class Overlay {
  constructor(canvas, state, glassRoot) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    patchCtx(this.ctx);   // 琥珀テーマでは、色指定を変換経由にする
    this.state = state; this.glassRoot = glassRoot;
    this.glass = {};
    this.log = []; this.ilog = [];
    this.lastPush = 0;
    this.pts = this.makeMap();
    this.riskShown = 0;
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.sheet = 'detail'; this.sheetOn = true; this.swT = {}; this.hit = {};
    this.hudHidden = false; this.hv = 0;   // パネルを捌けさせる（hv: 0=表示 → 1=退避済み）
    this.buildChips();
    // Webフォントはcanvasからは自動で読み込まれないので、使う字を先に要求しておく
    try { document.fonts.load('500 12px "Shippori Mincho"', JP_ALL); document.fonts.load('800 12px "Shippori Mincho"', JP_ALL); } catch (e) { /* フォールバック書体で描く */ }
    this.resize();
  }

  makeMap() {
    const r = rng(5), out = [];
    const g = () => (r() + r() + r() - 1.5) / 1.5;
    [[0.42, 0.52, 0.26, 120], [0.14, 0.26, 0.09, 80], [0.80, 0.26, 0.09, 70], [0.84, 0.76, 0.10, 80], [0.18, 0.80, 0.09, 60], [0.62, 0.10, 0.08, 40]]
      .forEach(([cx, cy, sp, n]) => { for (let i = 0; i < n; i++) out.push({ x: cx + g() * sp * 1.5, y: cy + g() * sp, s: 0.6 + r() * 1.1, ph: r() * 6.28 }); });
    return out;
  }

  // ログアウト用: 表示状態を初期化し、次のログイン後にもう一度起動演出から始める
  reset() {
    this.log = []; this.ilog = []; this.lastPush = 0; this.riskShown = 0; this.done = {}; this.cliVis = 0; this.mt = 0;
    this.hudHidden = false; this.hv = 0;
    if (this.cliGlass) this.cliGlass.style.opacity = 0;
    Object.values(this.glass).forEach((el) => { el.style.opacity = 0; el.style.transform = ''; el._hid = false; });
    this.ctx.clearRect(0, 0, this.W, this.H);
  }

  // ASSET ⇄ CTI の切り替え: パネルを一度消して、枠の描き上げからやり直す
  modeSwitch(t) {
    this.mt = t; this.done = {}; this.hit = {}; this.riskShown = 0; this.mapSel = null;
    Object.values(this.glass).forEach((el) => { el.style.opacity = 0; });
    this.placeChips();
  }

  // cut: 角の面取り量 [左上, 右上, 右下, 左下]（u倍）。すりガラス本体は同じ多角形で切り抜く。
  rect(name, x, y, w, h, t0, cut = [0, 0, 0, 0]) {
    const r = this.R[name] = { x, y, w, h, t0, cut, name, idx: Object.keys(this.R).length };
    let el = this.glass[name];
    if (!el) {
      el = document.createElement('div'); el.className = 'glass'; this.glassRoot.appendChild(el); this.glass[name] = el;
      el.addEventListener('pointerup', (e) => this.panelTap(name, e.clientX, e.clientY));
    }
    const poly = this.poly(r).map(([px, py]) => `${(px - x).toFixed(1)}px ${(py - y).toFixed(1)}px`).join(',');
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, clipPath: `polygon(${poly})` });
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = innerWidth; this.H = innerHeight;
    this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr;
    this.layout();
  }

  // ノッチ・ホームバーを避けるための安全領域（env(safe-area-inset-*) を隠し要素のpaddingから読む）
  readSafe() {
    const el = document.getElementById('safe');
    if (!el) return { t: 0, r: 0, b: 0, l: 0 };
    const c = getComputedStyle(el), n = (v) => parseFloat(v) || 0;
    return { t: n(c.paddingTop), r: n(c.paddingRight), b: n(c.paddingBottom), l: n(c.paddingLeft) };
  }

  layout() {
    const { W } = this;
    this.compact = W < 900;
    this.R = {};
    if (this.compact) this.layoutCompact(); else this.layoutFull();
    this.done = {};
    this.placeChips();
  }

  layoutFull() {
    const { W, H } = this;
    this.u = Math.min(1.3, Math.max(0.64, H / 941));
    const u = this.u, mg = 14;
    const lw = Math.min(340, Math.max(210, W * 0.185)), rw = Math.min(320, Math.max(200, W * 0.175));
    const top = 56 * u + 4;
    this.top = top;
    this.rect('map', mg, top, lw, H * 0.468 - top + 0, 1.0, [0, 16, 0, 0]);
    this.rect('alist', mg, H * 0.485, lw, H * 0.248, 1.4, [12, 0, 0, 0]);
    this.rect('elog', mg, H * 0.752, lw + 28 * u, H - mg - H * 0.752, 1.8, [0, 0, 18, 0]);
    this.rect('detail', W - mg - rw, top + 6, rw, H * 0.585 - top, 1.2, [18, 0, 0, 0]);
    this.rect('related', W - mg - rw, H * 0.655, rw, H * 0.30, 1.6, [0, 0, 0, 16]);
    const cx0 = mg + lw + 28 * u + 14, cx1 = W - mg - rw - 14;
    this.cx0 = cx0; this.cx1 = cx1;
    const tw = (cx1 - cx0) * 0.80, lyw = Math.min(170 * u, (cx1 - cx0) * 0.18);
    this.rect('timeline', cx0, H * 0.832, tw, H - mg - H * 0.832, 2.2, [0, 0, 16, 0]);
    this.rect('layer', cx0 + tw + 12, H * 0.800, lyw, H - mg - H * 0.800, 2.5, [0, 12, 0, 0]);
    const tabW = Math.min(620 * u, (cx1 - cx0) * 0.92);
    this.rect('tabs', (cx0 + cx1) / 2 - tabW / 2, 10, tabW, 42 * u, 0.6, [10, 10, 10, 10]);
    this.zb = this.R.timeline.y;
  }

  // 狭い画面（スマホ・小型タブレット）: 3Dを主役にして、パネルは1枚ずつ下（横長なら右）のシートに出す。
  layoutCompact() {
    const { W, H } = this;
    const sf = this.safe = this.readSafe();
    const u = this.u = Math.min(1, Math.max(0.82, (Math.min(W, 460) - 16) / 340));
    const mg = 8, L = sf.l + mg, Rr = W - sf.r - mg, B = H - sf.b - mg;
    const top = this.top = sf.t + 58 * u;
    const ch = this.chipH = Math.max(34, 32 * u);
    const on = this.sheetOn && !(this.state.cli && this.state.cli.open);
    const land = W > H;
    let x1 = Rr, zy1, chip;
    if (land) {
      const sw = Math.min(380, W * 0.44), sx = Rr - sw;
      if (on) { x1 = sx - 8; SHEETS.forEach(([n]) => this.rect(n, sx, top, sw, B - top, this.swT[n] ?? 1.0, SHEET_CUT)); }
      chip = { x: L, y: B - ch, w: x1 - L, h: ch }; zy1 = chip.y - 6;
    } else {
      const sh = Math.min(440, Math.max(250, H * 0.42)), sy = B - sh;
      chip = { x: L, y: on ? sy - ch - 6 : B - ch, w: Rr - L, h: ch };
      if (on) SHEETS.forEach(([n]) => this.rect(n, L, sy, Rr - L, sh, this.swT[n] ?? 1.0, SHEET_CUT));
      zy1 = chip.y - 6;
    }
    this.cx0 = L; this.cx1 = x1; this.zb = zy1 + 6; this.chipRect = chip;
  }

  // ---- 操作チップ（タッチ操作用のDOMボタン）----
  buildChips() {
    const root = this.chips = document.createElement('div');
    root.id = 'chips';
    const sc = document.createElement('div');   // パネル切り替えだけ横スクロール。前後・コマンド・畳むは常に見える位置に固定
    sc.className = 'sc';
    const mk = (parent, cls, html, fn) => {
      const b = document.createElement('button');
      b.className = `chip ${cls}`; b.tabIndex = -1; b.innerHTML = html;
      b.addEventListener('mousedown', (e) => e.preventDefault());   // 入力欄のフォーカスを奪わない
      b.addEventListener('click', fn);
      parent.appendChild(b); return b;
    };
    mk(root, 'nav', '‹', () => this.state.ui && this.state.ui.nav(-1));
    mk(root, 'nav', '›', () => this.state.ui && this.state.ui.nav(1));
    root.appendChild(sc);
    this.chipBtns = {};
    SHEETS.forEach(([n, en, jp]) => { this.chipBtns[n] = mk(sc, 'sheet', `${en}<i>${jp}</i>`, () => this.setSheet(n)); });
    this.modeChip = mk(root, 'act mode', '◈<i>CTI</i>', () => this.state.ui && this.state.ui.mode());
    this.quietChip = mk(root, 'act quiet', '◌<i>静穏</i>', () => this.state.ui && this.state.ui.quiet());
    mk(root, 'act cmd', '⌘<i>CMD</i>', () => this.state.ui && this.state.ui.cmd());
    this.foldBtn = mk(root, 'act fold', '▾<i>畳む</i>', () => this.toggleSheet());
    document.body.appendChild(root);
  }

  placeChips() {
    const el = this.chips, show = this.compact || this.touch;
    el.style.display = show ? 'flex' : 'none';
    el.classList.toggle('mini', !this.compact);
    // 狭い画面: 全画面・設定ボタンは3D領域の左上に常設（広い画面では CSS の既定位置＝右上）
    const tb = document.getElementById('topBtns');
    if (tb) { tb.style.left = this.compact ? `${this.cx0 + 10}px` : ''; tb.style.top = this.compact ? `${this.top + 10}px` : ''; }
    if (!show) return;
    if (this.compact) {
      const c = this.chipRect;
      Object.assign(el.style, { left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px` });
    } else {
      Object.assign(el.style, { left: `${this.cx0 + 12}px`, top: `${this.zb - 50 * this.u - 34}px`, width: 'auto', height: '34px' });
    }
    Object.entries(this.chipBtns).forEach(([n, b]) => b.classList.toggle('on', n === this.sheet && this.sheetOn));
    this.modeChip.innerHTML = this.state.mode === 'cti' ? '◈<i>ASSET</i>' : '◈<i>CTI</i>';
    this.quietChip.classList.toggle('on', !!this.state.quietOn);
    this.foldBtn.innerHTML = this.sheetOn ? '▾<i>畳む</i>' : '▴<i>開く</i>';
  }

  setSheet(n) {
    this.sheet = n; this.sheetOn = true; this.swT[n] = this.t || 0;   // 切り替えのたびに枠の描き上げからやり直す
    this.layout();
  }

  toggleSheet() { this.sheetOn = !this.sheetOn; this.swT[this.sheet] = this.t || 0; this.layout(); }

  // パネルを一括で隠す / 戻す。広い画面では各パネルを近い画面端へ滑らせて退避し、狭い画面ではシートを畳む。
  isHudHidden() { return this.compact ? !this.sheetOn : this.hudHidden; }
  setHud(hidden) {
    if (this.compact) { if (this.sheetOn === hidden) this.toggleSheet(); return; }
    this.hudHidden = !!hidden;
  }


  // パネルをタップした時: 一覧の行ならそのアセットを選択する（パネルの下の3Dには何も起きない）
  panelTap(name, x, y) {
    const rows = this.hit[name];
    if (!rows || !this.state.ui) return;
    const row = rows.find((q) => y >= q[0] && y < q[1]);
    if (!row) return;
    const a = typeof row[2] === 'number' ? row[2] : (this.state.assets.find((q) => q.name === row[2]) || {}).index;
    if (a !== undefined) this.state.ui.pick(a);
  }

  // ---- 描画ヘルパー ----
  T(s, x, y, o = {}) {
    const { ctx, u } = this;
    const jp = CJK.test(s);
    ctx.font = `${o.w || (jp ? 500 : 400)} ${(o.s || 12.5) * u}px ${o.f || (jp ? SERIF : SANS)}`;
    ctx.fillStyle = o.c || WHITE; ctx.textAlign = o.a || 'left';
    const ls = o.ls || 0;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${ls}px`;
    ctx.fillText(s, x, y);
    if (ls && 'letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  fit(s, maxW) {
    const { ctx } = this;
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
    return `${s}…`;
  }

  rr(x, y, w, h, r, fill, stroke) {
    const { ctx } = this;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  cube(x, y, s, c = 'rgba(225,240,255,.9)') {
    const { ctx } = this;
    const v = [0, 1, 2, 3, 4, 5].map((k) => [x + Math.cos(-Math.PI / 2 + k * Math.PI / 3) * s, y + Math.sin(-Math.PI / 2 + k * Math.PI / 3) * s]);
    ctx.strokeStyle = c; ctx.lineWidth = 1.1; ctx.beginPath();
    v.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    [1, 3, 5].forEach((k) => { ctx.moveTo(x, y); ctx.lineTo(v[k][0], v[k][1]); });
    ctx.stroke();
  }

  close(x, y, s = 4) {
    const { ctx } = this;
    ctx.strokeStyle = DIM; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke();
  }

  search(x, y, s = 6) {
    const { ctx } = this;
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1.3; ctx.beginPath();
    ctx.arc(x, y, s * 0.7, 0, 7); ctx.moveTo(x + s * 0.5, y + s * 0.5); ctx.lineTo(x + s, y + s); ctx.stroke();
  }

  // 文字がランダムな字から1字ずつ確定していく演出。p: 0→1
  scr(s, p, seed = 0, set = GLY) {
    if (p >= 1) return s;
    const n = Math.floor(Math.max(0, p) * s.length), f = Math.floor(this.t * 20);
    let o = '';
    for (let i = 0; i < s.length; i++) o += (i < n || s[i] === ' ') ? s[i] : set[Math.floor(hash(i * 3.3 + seed + f * 1.7) * set.length)];
    return o;
  }

  // パネルの外形（角を面取りした多角形）
  poly(r) {
    const [a, b, c, d] = r.cut.map((v) => v * this.u);
    const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
    return [[x0 + a, y0], [x1 - b, y0], [x1, y0 + b], [x1, y1 - c], [x1 - c, y1], [x0 + d, y1], [x0, y1 - d], [x0, y0 + a]];
  }

  path(pts) {
    const { ctx } = this;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
  }

  // 折れ線を先頭から割合fだけ辿った点と、そこまでの経路
  walk(pts, f, closed) {
    const n = pts.length, m = closed ? n : n - 1, seg = [];
    let len = 0;
    for (let i = 0; i < m; i++) { const p = pts[i], q = pts[(i + 1) % n]; seg.push(Math.hypot(q[0] - p[0], q[1] - p[1])); len += seg[i]; }
    let rem = len * Math.min(1, Math.max(0, f));
    const out = [pts[0]];
    for (let i = 0; i < m && rem > 0; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      if (rem >= seg[i]) { out.push(q); rem -= seg[i]; } else { const k = rem / seg[i]; out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); rem = 0; }
    }
    return out;
  }

  trace(pts, f, closed = true) {
    const { ctx } = this;
    const w = this.walk(pts, f, closed);
    ctx.beginPath(); w.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    return w[w.length - 1];
  }

  // パネルの枠: 外形を線で描き上げ、角のブラケット・内側の二重線・ノッチ・目盛り・微小タグを足す
  frame(r, t) {
    const { ctx, u } = this;
    const lp = sm((t - r.t0) / 0.8);
    if (lp <= 0) return;
    const pts = this.poly(r), [ca, cb, cc, cd] = r.cut.map((v) => v * u);
    const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
    ctx.save();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(190,220,248,.34)';
    const head = this.trace(pts, lp);
    if (lp < 1) {
      const g = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 16 * u);
      g.addColorStop(0, 'rgba(235,248,255,.9)'); g.addColorStop(1, 'rgba(235,248,255,0)');
      ctx.fillStyle = g; ctx.fillRect(head[0] - 16 * u, head[1] - 16 * u, 32 * u, 32 * u);
      ctx.restore(); return;
    }
    const da = sm((t - r.t0 - 0.8) / 0.5);
    ctx.globalAlpha = da;

    // 内側の二重線: 薄い全周線と、周回する明るい区間
    const ins = 4.5 * u, k = 0.41;
    const inner = this.poly({ x: x0 + ins, y: y0 + ins, w: r.w - 2 * ins, h: r.h - 2 * ins, cut: r.cut.map((v) => Math.max(0, v - ins / u * k)) });
    ctx.strokeStyle = 'rgba(170,205,240,.07)'; this.path(inner); ctx.stroke();
    ctx.setLineDash([46 * u, 210 * u]); ctx.lineDashOffset = -this.mo * (14 + r.idx * 2.3) * u;
    ctx.strokeStyle = 'rgba(210,238,255,.30)'; this.path(inner); ctx.stroke();
    ctx.setLineDash([]);

    // 角のブラケット（左上・右下は明るく）
    const L = 18 * u;
    [[ca, x0, y0, 1, 1, 1], [cb, x1, y0, -1, 1, 0], [cc, x1, y1, -1, -1, 1], [cd, x0, y1, 1, -1, 0]].forEach(([c, x, y, dx, dy, hi]) => {
      ctx.strokeStyle = hi ? 'rgba(238,248,255,.92)' : 'rgba(200,228,255,.45)'; ctx.lineWidth = hi ? 2 : 1.4;
      ctx.beginPath(); ctx.moveTo(x + dx * (c + L), y); ctx.lineTo(x + dx * c, y);
      if (c > 0) ctx.lineTo(x, y + dy * c);
      ctx.lineTo(x, y + dy * (c + L)); ctx.stroke();
    });
    ctx.lineWidth = 1;

    // 上辺のノッチ（タブ）とコード
    const nx = x0 + r.w * (0.42 + 0.32 * hash(r.idx * 5.3)), nw = 46 * u;
    ctx.beginPath(); ctx.moveTo(nx, y0); ctx.lineTo(nx + 5 * u, y0 - 6 * u); ctx.lineTo(nx + nw - 5 * u, y0 - 6 * u); ctx.lineTo(nx + nw, y0);
    ctx.fillStyle = 'rgba(150,200,245,.16)'; ctx.fill(); ctx.strokeStyle = 'rgba(200,228,255,.5)'; ctx.stroke();
    this.T(`${'ABCDEFGH'[r.idx % 8]}-${pad2(r.idx * 7 + 3)}`, nx + nw / 2, y0 - 1.6 * u, { s: 7.5, f: MONO, a: 'center', c: 'rgba(215,236,255,.8)', ls: 0.6 });

    // 下辺の目盛りと、境界線に乗る微小ステータス
    for (let i = 0; i < 26; i++) {
      const x = x0 + r.w * 0.10 + cd + i * 4.6 * u, maj = i % 5 === 0;
      ctx.fillStyle = `rgba(190,222,250,${maj ? 0.32 : 0.16})`; ctx.fillRect(x, y1 - (maj ? 5 : 3) * u, 1, (maj ? 5 : 3) * u);
    }
    const sync = (96.4 + 3.4 * noise(this.mo * 0.4 + r.idx * 4.1)).toFixed(1);
    const hx = Math.floor(hash(Math.floor(this.mo * 2.2) + r.idx * 13) * 0xffff).toString(16).toUpperCase().padStart(4, '0');
    const tag = `SYNC ${sync}%  ▸ 0x${hx}`;
    ctx.font = `400 ${7.5 * u}px ${MONO}`;
    const tw = ctx.measureText(tag).width + 12 * u, tx = x1 - cc - 18 * u - tw;
    ctx.fillStyle = 'rgba(8,16,26,.94)'; ctx.fillRect(tx, y1 - 4.5 * u, tw, 9 * u);
    this.T(tag, tx + 6 * u, y1 + 2.6 * u, { s: 7.5, f: MONO, c: 'rgba(190,220,248,.62)' });

    // 位置合わせの＋印（外側の角）
    const rx = x0 < this.W / 2 ? x0 - 7 * u : x1 + 7 * u, ry = y1 + 7 * u;
    ctx.strokeStyle = 'rgba(200,228,255,.4)'; ctx.beginPath();
    ctx.moveTo(rx - 3 * u, ry); ctx.lineTo(rx + 3 * u, ry); ctx.moveTo(rx, ry - 3 * u); ctx.lineTo(rx, ry + 3 * u); ctx.stroke();
    ctx.restore();
  }

  // パネルの見出し: 角印・英字・明朝の副題・右端に微小コード。起動時と一定周期でデコード演出が走る。
  title(r, en, extra, jp) {
    const { ctx, u, t } = this;
    const cyc = 15 + r.idx, ph = mod(t + r.idx * 3.7, cyc);
    let p = Math.min(1, (t - r.t0 - 0.75) / 0.9);
    if (ph < 0.55) p = Math.min(p, ph / 0.55);
    const x = r.x + 16 * u, y = r.y + 26 * u;
    ctx.fillStyle = 'rgba(190,228,255,.95)'; ctx.fillRect(x, y - 8.5 * u, 5 * u, 5 * u);
    const tx = x + 12 * u, txt = this.scr(en, p, r.idx);
    this.T(txt, tx, y, { s: 14.5, w: 400, ls: 0.4 });
    let end = tx + ctx.measureText(en).width + 0.4 * en.length * u;
    if (jp) {
      this.T(this.scr(jp, p * 1.2 - 0.1, r.idx + 9, JPG), end + 10 * u, y - 0.5 * u, { s: 10.5, c: DIM, ls: 2.5 });
      end += 10 * u + ctx.measureText(jp).width + 2.5 * jp.length * u;
    }
    const right = r.x + r.w - (extra ? 36 : 16) * u - r.cut[1] * u * 0.6;
    if (right - 38 * u > end + 8 * u) {
      const hx = Math.floor(hash(Math.floor(this.mo * 0.9) + r.idx * 7) * 0xfffff).toString(16).toUpperCase().padStart(5, '0');
      this.T(`#${hx}`, right, y - 0.5 * u, { s: 8.5, f: MONO, a: 'right', c: 'rgba(170,200,230,.45)', ls: 0.8 });
    }
    if (extra === 'x') this.close(r.x + r.w - 18 * u, r.y + 22 * u);
    if (extra === 's') this.search(r.x + r.w - 24 * u, r.y + 20 * u, 6 * u);
  }

  // ---- 全体 ----
  draw(t) {
    const { ctx, dpr, W, H } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    this.t = t;
    this.cfg = this.state.cfg || {};
    this.q = this.state.quiet || 0;   // 静穏モードの度合い（0〜1）
    this.mo = this.state.mo ?? t;      // 環境アニメ用の時計（静穏で減速して止まる）
    // コマンドラインが開閉したら、狭い画面ではシートの出し入れで領域を取り直す
    const co = !!(this.state.cli && this.state.cli.open);
    if (co !== this.cliPrev) { this.cliPrev = co; if (this.compact) this.layout(); }
    this.header(t);

    const names = this.compact ? [this.sheet] : ['tabs', 'map', 'alist', 'elog', 'detail', 'related', 'timeline', 'layer'];
    for (const [n, el] of Object.entries(this.glass)) el.style.display = names.includes(n) && this.R[n] ? 'block' : 'none';
    // 退避の進み具合（約0.9秒）
    const dh = Math.min(0.1, Math.max(0, t - (this.hvT ?? t))); this.hvT = t;
    const hg = this.hudHidden && !this.compact ? 1 : 0;
    this.hv = hg > this.hv ? Math.min(1, this.hv + dh / 0.9) : Math.max(0, this.hv - dh / 0.9);
    for (const n of names) {
      const r = this.R[n];
      if (!r) continue;
      const el = this.glass[n];
      // 手前のパネルから順に、近い画面端へ滑って消える
      const hp = this.hv > 0 ? sm(this.hv * 1.5 - r.idx * 0.07) : 0;
      if (hp >= 0.999) { el.style.display = 'none'; continue; }
      const side = n === 'tabs' ? [0, -(r.y + r.h + 24)] : n === 'timeline' || n === 'layer' ? [0, this.H - r.y + 24] : r.x + r.w / 2 < this.W / 2 ? [-(r.x + r.w + 24), 0] : [this.W - r.x + 24, 0];
      if (hp > 0.001) { el.style.transform = `translate(${side[0] * hp}px,${side[1] * hp}px)`; el.style.opacity = 1 - hp; el._hid = true; }
      else if (el._hid) { el.style.transform = ''; el.style.opacity = 1; el._hid = false; }
      ctx.save();
      if (hp > 0.001) { ctx.translate(side[0] * hp, side[1] * hp); ctx.globalAlpha = 1 - hp; }
      // 枠線の描き上げ → すりガラスが満ちる → 中身が上から現れる、の3段階
      const tr = t - (this.mt || 0);
      const gp = sm((tr - r.t0 - 0.35) / 0.8), cp = sm((tr - r.t0 - 0.65) / 0.8);
      if (!this.done[n] && hp <= 0.001) { el.style.opacity = gp; if (gp >= 1) this.done[n] = true; }
      this.frame(r, tr);
      if (cp <= 0.01) { ctx.restore(); continue; }
      ctx.save();
      this.path(this.poly(r)); ctx.clip();
      if (cp < 1) {
        ctx.beginPath(); ctx.rect(r.x - 2, r.y - 2, r.w + 4, r.h * cp + 2); ctx.clip();
        ctx.globalAlpha *= cp * (0.75 + 0.25 * (this.q > 0.5 || Math.sin(cp * 90) > -0.2 ? 1 : 0));
      }
      (this.state.mode === 'cti' && this[`c_${n}`] ? this[`c_${n}`] : this[n]).call(this, r, t);
      ctx.restore();
      if (cp < 1) {
        const y = r.y + r.h * cp;
        ctx.fillStyle = `rgba(215,240,255,${0.7 * (1 - cp)})`; ctx.fillRect(r.x + 4, y, r.w - 8, 1.5);
      }
      ctx.restore();
    }
    this.deco(t);
  }

  header(t) {
    const { ctx, W, u } = this;
    const a = sm(t / 0.9);
    ctx.save(); ctx.globalAlpha = a;
    if (this.compact) {
      const sf = this.safe, x = sf.l + 12 * u, y = sf.t + 24 * u, xr = W - sf.r - 12 * u, d = new Date(), sy = this.state.sys;
      const cti = this.state.mode === 'cti';
      this.T(cti ? 'THREAT INTELLIGENCE' : 'ASSET INTELLIGENCE', x, y, { s: 15, w: 300, ls: cti ? 2.6 : 3.6 });
      this.T(cti ? '脅威情報分析システム' : '資産情報解析システム', x + 1, y + 14 * u, { s: 9, c: DIM, ls: 2.6 });
      ctx.fillStyle = '#7fe08a'; ctx.beginPath(); ctx.arc(xr - 30 * u, y - 4 * u, 3 * u, 0, 7); ctx.fill();
      this.T('LIVE', xr, y - 0.5 * u, { s: 10.5, a: 'right', ls: 1 });
      this.T(`UTC ${d.toISOString().slice(11, 19)}`, xr, y + 13 * u, { s: 9.5, f: MONO, a: 'right', c: DIM, ls: 0.6 });
      if (sy && sy.fps && this.cfg.sys) this.T(`${sy.fps.toFixed(0)} FPS  ${sy.w}×${sy.h}`, xr, y + 25 * u, { s: 8.5, f: MONO, a: 'right', c: 'rgba(170,200,230,.5)', ls: 0.6 });
      ctx.restore();
      return;
    }
    const cti = this.state.mode === 'cti';
    this.T(cti ? 'THREAT INTELLIGENCE' : 'ASSET INTELLIGENCE', 20 * u, 36 * u, { s: 21, w: 300, ls: 5 });
    this.T(cti ? '脅威情報分析システム ／ CTI' : '資産情報解析システム ／ 第七区画', 22 * u, 51 * u, { s: 10.5, c: DIM, ls: 3.2 });
    const d = new Date();
    const rw = this.compact ? 0 : this.R.detail.w;
    ctx.fillStyle = '#7fe08a';
    ctx.beginPath(); ctx.arc(W - 14 - rw + 4 * u, 36 * u, 3.4 * u, 0, 7); ctx.fill();
    this.T('LIVE', W - 14 - rw + 14 * u, 40 * u, { s: 12, ls: 1 });
    this.T(`UTC ${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)}`, W - 16, 40 * u, { s: 12.5, a: 'right', c: DIM, ls: 0.5 });
    if (!this.compact) {
      const tb = this.R.tabs;
      ctx.save(); ctx.globalAlpha *= 1 - this.hv;   // タブが退避したら、つなぐ信号線も消す
      this.signal(346 * u, tb.x - 16, 31 * u, t, 0);
      this.signal(tb.x + tb.w + 16, W - 14 - rw - 6, 31 * u, t, 1.7);
      ctx.restore();
    }
    ctx.restore();
  }

  // 細い信号線。脈動する光点が左から右へ走る。
  signal(x0, x1, y, t, ph) {
    const { ctx, u } = this;
    if (x1 - x0 < 30) return;
    const m = this.mo, q = this.q, head = x0 + (((m * 0.13 + ph * 0.3) % 1) * (x1 - x0));
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 2) {
      const k = (x - x0) / (x1 - x0);
      const spike = Math.exp(-Math.pow((x - head) / (14 * u), 2)) * 9 * u * Math.sin((x - head) * 0.5) * (1 - q);
      const yy = y + noise(x * 0.04 + m * 0.9 + ph) * 2.2 * u + spike;
      x === x0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      void k;
    }
    ctx.strokeStyle = 'rgba(160,205,245,.34)'; ctx.stroke();
    if (q < 0.99) {
      const g = ctx.createRadialGradient(head, y, 0, head, y, 18 * u);
      g.addColorStop(0, 'rgba(210,240,255,.5)'); g.addColorStop(1, 'rgba(210,240,255,0)');
      ctx.save(); ctx.globalAlpha = 1 - q; ctx.fillStyle = g; ctx.fillRect(head - 18 * u, y - 18 * u, 36 * u, 36 * u); ctx.restore();
    }
    ctx.fillStyle = 'rgba(150,190,230,.35)';
    for (let x = x0; x <= x1; x += 24 * u) ctx.fillRect(x, y + 9 * u, 1, 3 * u);
  }

  // 画面全体の演出: 端の目盛り、中央を横切る走査光、ビューポートの角
  deco(t) {
    const { ctx, W, H, u } = this;
    if (this.compact) {
      // 狭い画面: 計器リング・ロックオン・警告・コマンドラインだけを重ねる
      const { cx0, cx1, top } = this, by = this.zb - 6, L = 12 * u;
      ctx.strokeStyle = 'rgba(200,228,255,.4)'; ctx.lineWidth = 1;
      [[cx0 + 4, top + 4, 1, 1], [cx1 - 4, top + 4, -1, 1], [cx0 + 4, by, 1, -1], [cx1 - 4, by, -1, -1]].forEach(([cx, cy, dx, dy]) => {
        ctx.beginPath(); ctx.moveTo(cx + dx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * L); ctx.stroke();
      });
      if (this.cfg.ring) this.bigRing(t);
      this.lockon(t); this.warning(t); this.cmdline();
      return;
    }
    // 左右の端のルーラー
    if (this.cfg.deco) for (let side = 0; side < 2; side++) {
      const x = side ? W - 7 : 3;
      for (let y = 70 * u; y < H - 20; y += 10 * u) {
        const major = Math.round(y / (10 * u)) % 5 === 0;
        ctx.fillStyle = `rgba(170,205,240,${major ? 0.30 : 0.14})`;
        ctx.fillRect(x, y, major ? 4 : 2, 1);
      }
      const my = 70 * u + (((this.mo * (side ? -0.05 : 0.04) + side * 0.5) % 1 + 1) % 1) * (H - 100 * u);
      ctx.fillStyle = `rgba(220,242,255,${0.75 * (1 - this.q)})`; ctx.fillRect(x - 1, my, 6, 2);
    }
    // 中央を走る走査光
    const { cx0, cx1, top } = this;
    const k = (this.mo / 15) % 1;
    const x = cx0 + k * (cx1 - cx0);
    const y1 = this.zb - 6;
    const g = ctx.createLinearGradient(x - 90 * u, 0, x, 0);
    g.addColorStop(0, 'rgba(150,200,255,0)'); g.addColorStop(1, 'rgba(150,200,255,.045)');
    if (this.cfg.deco) {
      ctx.save(); ctx.globalAlpha = 1 - this.q;
      ctx.fillStyle = g; ctx.fillRect(x - 90 * u, top, 90 * u, y1 - top);
      ctx.fillStyle = 'rgba(205,235,255,.16)'; ctx.fillRect(x, top, 1, y1 - top);
      ctx.restore();
    }
    // ビューポート四隅
    const L = 16 * u, pad = 6, ty = top + 4, by = y1;
    ctx.strokeStyle = 'rgba(200,228,255,.45)'; ctx.lineWidth = 1;
    [[cx0 + pad, ty, 1, 1], [cx1 - pad, ty, -1, 1], [cx0 + pad, by, 1, -1], [cx1 - pad, by, -1, -1]].forEach(([cx, cy, dx, dy]) => {
      ctx.beginPath(); ctx.moveTo(cx + dx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * L); ctx.stroke();
    });
    if (this.cfg.ring) this.bigRing(t);
    if (this.cfg.hex) this.hexcols(t);
    if (this.cfg.readouts) { this.readouts(t); this.tape(t); this.links(t); }
    this.lockon(t); this.warning(t); this.cmdline();
  }

  // 3Dの背後に敷く巨大な計器リング（目盛り・方位数字・別速度で回る円弧）。非常に淡い。
  bigRing(t) {
    const { ctx, u, cx0, cx1, top } = this;
    const a = sm((t - 2.4) / 1.5);
    if (a <= 0) return;
    const ymax = this.zb - 6;
    const cx = (cx0 + cx1) / 2, cy = (top + ymax) / 2, R = Math.min(cx1 - cx0, ymax - top) * 0.5 - 8 * u;
    ctx.save(); ctx.globalAlpha = a;
    ctx.beginPath(); ctx.rect(cx0, top, cx1 - cx0, ymax - top); ctx.clip();
    ctx.translate(cx, cy); ctx.lineWidth = 1;
    const rot = this.mo * 0.012;
    for (let i = 0; i < 180; i++) {
      const an = rot + i * Math.PI / 90, maj = i % 15 === 0, mid = i % 5 === 0, l = (maj ? 9 : mid ? 5 : 2.5) * u;
      ctx.strokeStyle = `rgba(185,220,250,${maj ? 0.30 : mid ? 0.17 : 0.09})`;
      ctx.beginPath(); ctx.moveTo(Math.cos(an) * R, Math.sin(an) * R); ctx.lineTo(Math.cos(an) * (R - l), Math.sin(an) * (R - l)); ctx.stroke();
      if (maj) this.T(String(mod(i * 2, 360)).padStart(3, '0'), Math.cos(an) * (R - 22 * u), Math.sin(an) * (R - 22 * u) + 3 * u, { s: 8, f: MONO, a: 'center', c: 'rgba(185,220,250,.30)' });
    }
    ctx.strokeStyle = 'rgba(185,220,250,.07)';
    [0.93, 0.80].forEach((k) => { ctx.beginPath(); ctx.arc(0, 0, R * k, 0, 7); ctx.stroke(); });
    [[0.93, 0.22, 0.85, 1.6, 0.22], [0.86, -0.38, 1.45, 1, 0.16], [0.74, 0.14, 0.55, 1, 0.14], [0.66, -0.7, 0.35, 1, 0.16]].forEach(([k, sp, len, lw, al]) => {
      ctx.lineWidth = lw; ctx.strokeStyle = `rgba(210,238,255,${al})`;
      for (let i = 0; i < 3; i++) { const a0 = this.mo * sp + i * 2.094; ctx.beginPath(); ctx.arc(0, 0, R * k, a0, a0 + len); ctx.stroke(); }
    });
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(200,230,255,.16)';
    ctx.beginPath(); ctx.moveTo(-8 * u, 0); ctx.lineTo(8 * u, 0); ctx.moveTo(0, -8 * u); ctx.lineTo(0, 8 * u); ctx.stroke();
    ctx.restore();
  }

  // 中央域の縁を流れる16進ダンプ
  hexcols(t) {
    const { ctx, u, cx0, cx1, top } = this;
    const a = sm((t - 3.0) / 1.2);
    if (a <= 0) return;
    const y0 = top + 50 * u, y1 = this.zb - 52 * u, rh = 11 * u;
    [[cx0 + 12 * u, 4.2], [cx1 - 62 * u, -3.1]].forEach(([x, sp], c) => {
      const off = this.mo * sp, o0 = Math.floor(off), fr = off - o0;
      for (let i = 0; (i - 1) * rh < y1 - y0; i++) {
        const id = i + o0, y = y0 + (i - fr) * rh;
        const e = sm((y - y0) / (30 * u)) * sm((y1 - y) / (30 * u));
        if (e <= 0) continue;
        const hot = hash(id * 9.1 + c) < 0.07;
        const h = Math.floor(hash(id * 1.37 + c * 50) * 0xffffff).toString(16).toUpperCase().padStart(6, '0');
        this.T(`${hot ? '▸' : ' '}${h.slice(0, 4)} ${h.slice(4)}`, x, y, { s: 8.5, f: MONO, c: `rgba(${hot ? '225,244,255' : '170,205,240'},${(hot ? 0.55 : 0.16) * e * a})` });
      }
    });
  }

  // 中央域上部の計器値（カメラ連動）と同期率
  readouts(t) {
    const { ctx, u, cx0, cx1, top, state } = this;
    const a = sm((t - 3.0) / 1.2);
    if (a <= 0) return;
    const c = state.cam, deg = mod(c.az * 180 / Math.PI, 360), el = 90 - c.pol * 180 / Math.PI;
    ctx.save(); ctx.globalAlpha = a * 0.7;
    const x = cx0 + 28 * u, y = top + 25 * u;
    this.T(`AZ ${deg.toFixed(1).padStart(5, '0')}°   EL ${el.toFixed(1)}°   DIST ${c.dist.toFixed(1)}`, x, y, { s: 9.5, f: MONO, c: DIM, ls: 1 });
    this.T(`TGT ${c.tx.toFixed(1)} / ${c.tz.toFixed(1)}`, x, y + 13 * u, { s: 8.5, f: MONO, c: 'rgba(170,200,230,.5)', ls: 1 });
    this.T('[:] コマンド   [?] ヘルプ', x, y + 28 * u, { s: 9, c: 'rgba(170,200,230,.5)', ls: 1.4 });
    const xr = cx1 - 28 * u;
    const sync = (97.2 + 2.2 * noise(this.mo * 0.5)).toFixed(1);
    this.T(`${sync}%`, xr, y, { s: 11, f: MONO, a: 'right', c: WHITE, ls: 1 });
    this.T('同期率', xr - 54 * u, y, { s: 10, a: 'right', c: DIM, ls: 3 });
    const fr = this.q > 0.5 ? 0 : Math.floor((t % 1) * 30), ss = Math.floor(t) % 60, mm = Math.floor(t / 60) % 60;
    this.T(`T+ 00:${pad2(mm)}:${pad2(ss)}:${pad2(fr)}`, xr, y + 13 * u, { s: 8.5, f: MONO, a: 'right', c: 'rgba(170,200,230,.5)', ls: 1 });
    // システムステータス（実測値）: FPS の推移グラフと描画量・解像度・メモリ
    const sy = state.sys, dim = 'rgba(170,200,230,.5)';
    if (sy && sy.fps && this.cfg.sys) {
      const y2 = y + 30 * u, lowFps = sy.fps < 30;
      const gw = 64 * u, gx = xr - gw;
      ctx.fillStyle = 'rgba(190,220,250,.10)'; ctx.fillRect(gx, y2 - 9 * u, gw, 12 * u);
      sy.hist.forEach((v, i) => {
        const hh = Math.min(1, v / 60) * 12 * u, bx = gx + (i / 40) * gw;
        ctx.fillStyle = v < 30 ? 'rgba(255,200,150,.8)' : 'rgba(170,220,255,.7)'; ctx.fillRect(bx, y2 + 3 * u - hh, Math.max(1, gw / 40 - 0.8), hh);
      });
      this.T(`${sy.fps.toFixed(0)} FPS`, gx - 8 * u, y2 - 0.5 * u, { s: 10, f: MONO, a: 'right', c: lowFps ? '#ffd7b0' : WHITE, ls: 1 });
      this.T(`${sy.ms.toFixed(1)} ms   DRAW ${sy.calls}   TRI ${(sy.tris / 1000).toFixed(0)}k   GEO ${sy.geo}`, xr, y2 + 14 * u, { s: 8.5, f: MONO, a: 'right', c: dim, ls: 0.8 });
      this.T(`${sy.w}×${sy.h} @${sy.dpr.toFixed(1)}x${sy.mem ? `   MEM ${sy.mem.toFixed(0)}MB` : ''}`, xr, y2 + 26 * u, { s: 8.5, f: MONO, a: 'right', c: dim, ls: 0.8 });
    }
    ctx.restore();
  }

  // 方位テープ（カメラの向きで流れる）
  tape(t) {
    const { ctx, u, cx0, cx1, state } = this;
    const a = sm((t - 3.2) / 1.2);
    if (a <= 0) return;
    const cx = (cx0 + cx1) / 2, y = this.zb - 26 * u, w = Math.min(380 * u, (cx1 - cx0) * 0.5), ppd = 5 * u;
    const hdg = mod(state.cam.az * 180 / Math.PI, 360);
    ctx.save(); ctx.globalAlpha = a;
    ctx.beginPath(); ctx.rect(cx - w / 2, y - 16 * u, w, 36 * u); ctx.clip();
    for (let d = Math.floor(hdg - w / 2 / ppd); d <= Math.ceil(hdg + w / 2 / ppd); d++) {
      if (mod(d, 5)) continue;
      const x = cx + (d - hdg) * ppd, maj = mod(d, 15) === 0, f = 1 - Math.abs(x - cx) / (w / 2);
      ctx.fillStyle = `rgba(200,230,255,${(maj ? 0.6 : 0.3) * f})`; ctx.fillRect(x, y, 1, (maj ? 8 : 4) * u);
      if (maj) { const dd = mod(d, 360); this.T(dd % 90 === 0 ? 'NESW'[dd / 90] : String(dd).padStart(3, '0'), x, y + 19 * u, { s: 8.5, f: MONO, a: 'center', c: `rgba(200,230,255,${0.6 * f})` }); }
    }
    ctx.fillStyle = 'rgba(200,230,255,.22)'; ctx.fillRect(cx - w / 2, y, w, 1);
    ctx.restore();
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.moveTo(cx - 4 * u, y - 9 * u); ctx.lineTo(cx + 4 * u, y - 9 * u); ctx.lineTo(cx, y - 2 * u); ctx.fill();
    this.T(`HDG ${String(Math.round(hdg) % 360).padStart(3, '0')}°`, cx, y - 13 * u, { s: 9, f: MONO, a: 'center', c: WHITE, ls: 1.5 });
    ctx.restore();
  }

  // 隣り合うパネル同士を結ぶ点線コネクタ
  links(t) {
    const { ctx, u, R } = this;
    const a = sm((t - 2.6) / 1.0) * (1 - this.hv);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.lineWidth = 1;
    [['map', 'alist', 0], ['alist', 'elog', 0], ['detail', 'related', 1]].forEach(([p, q, right], i) => {
      const A = R[p], B = R[q], x = right ? A.x + A.w - 24 * u : A.x + 24 * u, y0 = A.y + A.h, y1 = B.y;
      ctx.strokeStyle = 'rgba(190,225,255,.5)'; ctx.setLineDash([2, 3]); ctx.lineDashOffset = -this.mo * 6;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(220,242,255,.8)'; ctx.fillRect(x - 2, y0 - 1, 4, 3); ctx.fillRect(x - 2, y1 - 2, 4, 3);
      const k = mod(this.mo * 0.4 + i * 0.3, 1);
      ctx.fillStyle = 'rgba(240,250,255,.95)'; ctx.fillRect(x - 1.5, y0 + (y1 - y0) * k - 1, 3, 3);
      if (y1 - y0 > 40) this.T(`LNK-0${i + 1}  ▸ ${Math.floor(hash(Math.floor(t) + i) * 999)}`, x + 8 * u, (y0 + y1) / 2 + 3 * u, { s: 7.5, f: MONO, c: 'rgba(190,220,248,.5)', ls: 0.8 });
    });
    const A = R.timeline, B = R.layer;
    ctx.fillStyle = 'rgba(190,225,255,.5)'; ctx.fillRect(A.x + A.w, A.y + A.h - 22 * u, B.x - A.x - A.w, 1);
    ctx.restore();
  }

  // 選択中のAssetへのロックオン照準と、Detail・Minimapへ伸びる引出線
  lockon(t) {
    const { ctx, u, state, R } = this;
    const L = state.lock, cti = state.mode === 'cti';
    if (!L || (cti ? state.cti.selected < 0 : state.selected < 0)) return;
    const age = t - state.selT, p = sm(age / 0.8);
    if (p <= 0) return;
    const a = cti ? state.cti.actors[state.cti.selected] : state.assets[state.selected];
    const S = Math.max(34 * u, L.r * 1.1) + (1 - p) * 120 * u, k = S * 0.32;
    ctx.save(); ctx.translate(L.x, L.y); ctx.globalAlpha = p;
    ctx.save(); ctx.rotate((1 - p) * 1.2);
    ctx.strokeStyle = 'rgba(238,248,255,.92)'; ctx.lineWidth = 1.5;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.moveTo(x * (S - k), y * S); ctx.lineTo(x * S, y * S); ctx.lineTo(x * S, y * (S - k)); ctx.stroke();
    });
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(200,230,255,.38)';
    ctx.setLineDash([3 * u, 5 * u]); ctx.lineDashOffset = -this.mo * 8;
    ctx.beginPath(); ctx.arc(0, 0, S * 0.8, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(225,244,255,.8)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 2; i++) { const a0 = this.mo * 1.4 + i * Math.PI; ctx.beginPath(); ctx.arc(0, 0, S * 0.64, a0, a0 + 0.8); ctx.stroke(); }
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(200,230,255,.55)';
    for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(an) * S * 0.9, Math.sin(an) * S * 0.9); ctx.lineTo(Math.cos(an) * S * 0.74, Math.sin(an) * S * 0.74); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(240,250,255,.9)'; ctx.fillRect(-1.5, -1.5, 3, 3);
    ctx.strokeStyle = 'rgba(200,230,255,.5)'; ctx.beginPath();
    ctx.moveTo(-9 * u, 0); ctx.lineTo(-4 * u, 0); ctx.moveTo(9 * u, 0); ctx.lineTo(4 * u, 0); ctx.moveTo(0, -9 * u); ctx.lineTo(0, -4 * u); ctx.moveTo(0, 9 * u); ctx.lineTo(0, 4 * u); ctx.stroke();
    ctx.restore();

    // タグ
    // 右端に近いときはタグを左側へ折り返す
    const flip = L.x + S + 12 * u + 130 * u > this.W, fx = flip ? -1 : 1, al = flip ? 'right' : 'left';
    const tx = L.x + fx * (S + 12 * u), ty = L.y + S * 0.55, ta = sm((age - 0.4) / 0.5);
    ctx.save(); ctx.globalAlpha = ta;
    ctx.strokeStyle = 'rgba(210,238,255,.6)'; ctx.beginPath(); ctx.moveTo(L.x + fx * S, L.y + S); ctx.lineTo(tx - fx * 2 * u, ty - 12 * u); ctx.lineTo(tx + fx * 86 * u, ty - 12 * u); ctx.stroke();
    this.T(this.scr(a.name, (age - 0.4) / 0.4, 5), tx, ty, { s: 13, w: 400, ls: 0.6, a: al });
    if (cti) {
      this.T(`${a.motive}  SEV ${a.sev.toFixed(1)}`, tx, ty + 13 * u, { s: 9.5, f: MONO, c: a.sev >= 8.5 ? '#ffd0c8' : DIM, ls: 1, a: al });
      this.T(`${a.origin}  CONF ${a.conf}`, tx, ty + 25 * u, { s: 8.5, f: MONO, c: 'rgba(170,200,230,.55)', ls: 0.8, a: al });
    } else {
      this.T(`${STATE_NAMES[a.state]}  R ${a.risk.toFixed(1)}`, tx, ty + 13 * u, { s: 9.5, f: MONO, c: a.state === 2 ? '#ffd0c8' : DIM, ls: 1, a: al });
      this.T(`X ${a.x.toFixed(1)}  Z ${a.z.toFixed(1)}  LD ${(a.load * 100).toFixed(0)}`, tx, ty + 25 * u, { s: 8.5, f: MONO, c: 'rgba(170,200,230,.55)', ls: 0.8, a: al });
    }
    ctx.restore();
    if (this.compact || this.hv > 0.98) return;

    // 引出線: 縦→横→短い斜めで、Detailのリングとミニマップの選択点へ
    const pl = sm((age - 0.3) / 1.0);
    const D = R.detail, M = R.map;
    const targets = [[D.x - 3 * u, D.y + 64 * u, 1], [M.x + M.w + 3 * u, this.mapSel ? Math.min(M.y + M.h - 10 * u, Math.max(M.y + 10 * u, this.mapSel[1])) : M.y + 80 * u, -1]];
    targets.forEach(([ex, ey, sg], i) => {
      const sx = L.x + sg * S, sy = L.y - S * (i ? 0.2 : 0.5);
      const dy = ey - sy, dir = Math.sign(dy) || 1, dd = Math.min(Math.abs(dy), 70 * u, Math.abs(ex - sx) * 0.5), v = Math.abs(dy) - dd;
      const pts = [[sx, sy], [sx, sy + dir * v], [ex - sg * dd, sy + dir * v], [ex, ey]];
      ctx.save(); ctx.globalAlpha = 1 - this.hv; ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(205,236,255,.42)';
      const end = this.trace(pts, pl, false);
      ctx.setLineDash([2, 3]); ctx.lineDashOffset = -this.mo * 6;
      if (pl >= 1) {
        ctx.fillStyle = 'rgba(235,248,255,.95)'; ctx.fillRect(ex - 2, ey - 2, 4, 4);
        ctx.strokeStyle = 'rgba(235,248,255,.7)'; ctx.setLineDash([]); ctx.beginPath(); ctx.arc(ex, ey, 6 * u, 0, 7); ctx.stroke();
        const w = this.walk(pts, mod(this.mo * 0.45 + i * 0.5, 1), false), q = w[w.length - 1];
        ctx.fillStyle = 'rgba(245,252,255,.95)'; ctx.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3);
        if (i && this.mapSel) { ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(205,236,255,.4)'; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(this.mapSel[0], this.mapSel[1]); ctx.stroke(); }
      } else { ctx.fillStyle = 'rgba(245,252,255,.9)'; ctx.fillRect(end[0] - 2, end[1] - 2, 4, 4); }
      ctx.restore();
    });
  }

  // コマンドライン（下から開く端末風パネル）。入力・履歴・補完は cli.js、ここは描画だけ。
  cmdline() {
    const cli = this.state.cli;
    if (!cli) return;
    const { ctx, u, cx0, cx1 } = this;
    const now = performance.now() / 1000, dt = Math.min(0.1, now - (this.cliLast || now));
    this.cliLast = now;
    this.cliVis = Math.min(1, Math.max(0, (this.cliVis || 0) + (cli.open ? dt / 0.18 : -dt / 0.25)));
    if (cli.open && !this.cliWas) this.cliOpenAt = now;
    this.cliWas = cli.open;
    const v = sm(this.cliVis);
    if (!this.cliGlass) { this.cliGlass = document.createElement('div'); this.cliGlass.className = 'glass'; this.glassRoot.appendChild(this.cliGlass); }
    const el = this.cliGlass;
    el.style.opacity = v;
    el.style.background = `linear-gradient(180deg, ${mapCss('rgba(10,18,28,.82)')}, ${mapCss('rgba(4,9,16,.88)')})`;
    if (v <= 0.01) return;

    // 狭い画面では少し上に持ち上げる。iOS はキーボードがレイアウトを縮めないので、見えている範囲(visualViewport)から求めて避ける
    const vv = window.visualViewport, kb = vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
    const lift = this.compact ? 64 * u + kb : 0;
    const lh = 14.5 * u, rows = this.compact ? Math.max(3, Math.min(8, Math.floor((this.zb - this.top - lift - 120 * u) / lh))) : 8;
    const w = Math.min(680 * u, (cx1 - cx0) * (this.compact ? 0.98 : 0.8)), h = (36 + 46) * u + rows * lh;
    const x = (cx0 + cx1) / 2 - w / 2, y = this.zb - (this.compact ? 10 : 54) * u - h - lift + (1 - v) * 14 * u;
    const r = { x, y, w, h, t0: (this.cliOpenAt || now) - 0.5, cut: [0, 14, 0, 14], idx: 5, name: 'cli' };
    const key = `${x | 0},${y | 0},${w | 0},${h | 0}`;
    if (this.cliKey !== key) {
      this.cliKey = key;
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, clipPath: `polygon(${this.poly(r).map(([px, py]) => `${(px - x).toFixed(1)}px ${(py - y).toFixed(1)}px`).join(',')})` });
    }
    ctx.save(); ctx.globalAlpha = v;
    this.frame(r, now);
    this.path(this.poly(r)); ctx.clip();
    // 見出し
    const tx = x + 16 * u, ty = y + 24 * u;
    ctx.fillStyle = 'rgba(190,228,255,.95)'; ctx.fillRect(tx, ty - 8.5 * u, 5 * u, 5 * u);
    this.T('COMMAND', tx + 12 * u, ty, { s: 13, ls: 0.6 });
    this.T('命令入力', tx + 92 * u, ty - 0.5 * u, { s: 10, c: DIM, ls: 2.5 });
    if (w > 520 * u) this.T('TAB 補完   ↑↓ 履歴   PgUp/PgDn 遡る   ESC 閉じる', x + w - 18 * u - r.cut[1] * u * 0.4, ty - 0.5 * u, { s: 8.5, a: 'right', c: 'rgba(170,200,230,.5)', ls: 1 });
    ctx.fillStyle = LINE; ctx.fillRect(x + 14 * u, y + 34 * u, w - 28 * u, 1);
    // 出力（末尾が最新。スクロール中は過去へ）
    const col = { info: WHITE, dim: 'rgba(170,200,230,.55)', ok: 'rgba(170,226,255,.98)', err: '#ffc9bc', warn: '#ffe0b0', in: 'rgba(150,182,218,.85)' };
    const end = cli.out.length - cli.scroll, start = Math.max(0, end - rows);
    for (let i = start; i < end; i++) {
      const o = cli.out[i], yy = y + 34 * u + 14 * u + (rows - (end - i)) * lh + 3 * u;
      const [lhs, rhs] = o.s.split('\t');
      this.T(lhs, x + 18 * u, yy, { s: 11, f: CJK.test(lhs) ? undefined : MONO, c: col[o.k] || WHITE, ls: 0.3 });
      if (rhs) this.T(rhs, x + 230 * u, yy, { s: 11, c: 'rgba(205,225,245,.8)', ls: 0.3 });
    }
    if (cli.scroll) this.T(`↑ ${cli.scroll}`, x + w - 20 * u, y + 34 * u + 12 * u, { s: 8.5, f: MONO, a: 'right', c: 'rgba(170,200,230,.6)' });
    // 入力行
    const iy = y + h - 20 * u;
    ctx.fillStyle = LINE; ctx.fillRect(x + 14 * u, iy - 17 * u, w - 28 * u, 1);
    const prompt = 'OP-0417@CELL-07 ▸';
    this.T(prompt, x + 18 * u, iy, { s: 11.5, f: MONO, c: 'rgba(170,205,240,.7)', ls: 0.3 });
    const px = x + 18 * u + ctx.measureText(prompt).width + 0.3 * prompt.length * u + 8 * u;
    this.T(cli.buf, px, iy, { s: 12, f: CJK.test(cli.buf) ? undefined : MONO, c: '#fff', ls: 0.3 });
    const bw = ctx.measureText(cli.buf).width + 0.3 * cli.buf.length * u;
    const gh = cli.ghost();
    if (gh) this.T(gh, px + bw, iy, { s: 12, f: MONO, c: 'rgba(170,200,230,.38)', ls: 0.3 });
    if (cli.open && (this.q > 0.5 || Math.sin(now * 7) > -0.3)) { ctx.fillStyle = 'rgba(238,248,255,.92)'; ctx.fillRect(px + bw + 1, iy - 11 * u, 7 * u, 14 * u); }
    ctx.restore();
  }

  // criticalのAssetを選んだ時の割り込み警告（斜線帯・六角パターン・明朝の大見出し）
  warning(t) {
    const Wn = this.state.warn;
    if (!Wn || !this.cfg.warning) return;
    const age = t - Wn.t, D = 3.6;
    if (age < 0 || age > D) return;
    const { ctx, cx0, cx1, top, W, H } = this;
    const cx = (cx0 + cx1) / 2, cy = top + (this.zb - top) * 0.2, full = (cx1 - cx0) * (this.compact ? 0.96 : 0.62);
    const u = Math.min(this.u, full / 440);   // 狭い画面では帯の中身を縮める
    const e = sm(age / 0.35), out = sm((D - age) / 0.5);
    const w = full * e, h = 66 * u, x = cx - w / 2, y = cy - h / 2;
    const calm = this.q > 0.5, flick = age < 0.5 && !calm ? (Math.sin(age * 90) > -0.3 ? 1 : 0.2) : 1, blink = calm ? 0.8 : Math.sin(age * 9) > 0 ? 1 : 0.55;
    ctx.save(); ctx.globalAlpha = out * flick;
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(255,70,80,0)'); vg.addColorStop(1, `rgba(255,70,80,${0.14 * blink})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(46,8,12,.66)'; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y - 12 * u, w, h + 24 * u); ctx.clip();
    // 六角パターン
    ctx.strokeStyle = 'rgba(255,130,115,.10)'; ctx.lineWidth = 1;
    const hs = 8 * u, hw = hs * 1.732;
    for (let row = 0; row * hs * 1.5 < h + hs; row++) for (let col = -1; col * hw < w + hw; col++) {
      const hx = x + col * hw + (row % 2 ? hw / 2 : 0) + ((this.mo * 6) % hw), hy = y + row * hs * 1.5;
      ctx.beginPath(); for (let k = 0; k < 6; k++) { const an = Math.PI / 6 + k * Math.PI / 3; ctx.lineTo(hx + Math.cos(an) * hs * 0.5, hy + Math.sin(an) * hs * 0.5); } ctx.closePath(); ctx.stroke();
    }
    // 斜線の警告帯（上下）
    [y - 11 * u, y + h + 3 * u].forEach((by, i) => {
      ctx.save(); ctx.beginPath(); ctx.rect(x, by, w, 8 * u); ctx.clip();
      ctx.fillStyle = 'rgba(255,196,110,.88)';
      const sp = 16 * u, off = mod(this.mo * 40 * (i ? -1 : 1), sp);
      for (let sx = x - sp * 2 + off; sx < x + w + sp; sx += sp) { ctx.beginPath(); ctx.moveTo(sx, by + 8 * u); ctx.lineTo(sx + 8 * u, by + 8 * u); ctx.lineTo(sx + 16 * u, by); ctx.lineTo(sx + 8 * u, by); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    });
    ctx.fillStyle = `rgba(255,150,125,${0.9 * blink})`; ctx.fillRect(x, y, w, 1.5); ctx.fillRect(x, y + h - 1.5, w, 1.5);
    // 文言
    this.T('警告', x + 26 * u, cy + 15 * u, { s: 46, w: 800, c: 'rgba(255,160,145,.98)', ls: 8 });
    this.T(this.scr('WARNING', (age - 0.15) / 0.5, 7), x + 156 * u, cy - 3 * u, { s: 22, w: 300, c: 'rgba(255,206,140,.98)', ls: 11 });
    this.T(`${Wn.label || 'CRITICAL ASSET'} // ${Wn.name}`, x + 156 * u, cy + 17 * u, { s: 10.5, f: MONO, c: 'rgba(255,214,200,.9)', ls: 1.6 });
    this.T('CODE:473', x + w - 24 * u, cy - 12 * u, { s: 10, f: MONO, a: 'right', c: 'rgba(255,190,170,.8)', ls: 1.5 });
    this.T(Wn.jp || '危険度', x + w - 24 * u, cy + 5 * u, { s: 11, a: 'right', c: 'rgba(255,200,185,.85)', ls: 4 });
    this.T(Wn.risk.toFixed(1), x + w - 24 * u, cy + 25 * u, { s: 22, f: MONO, a: 'right', c: '#ffe3dc', ls: 1 });
    ctx.restore();
    ctx.restore();
  }

  // ---- タブ ----
  tabs(r, t) {
    const { ctx, u } = this;
    const tabs = this.state.mode === 'cti' ? CTI_TABS : TABS;
    const sw = (r.w - 44 * u) / tabs.length;
    tabs.forEach(([en, jp], i) => {
      const x = r.x + i * sw, on = this.state.mode === 'cti' ? i === 0 : en === 'THREAT';
      if (on) {
        this.rr(x + 3, r.y + 3, sw - 6, r.h - 6, 3, 'rgba(110,165,225,.30)', 'rgba(190,225,255,.7)');
        ctx.fillStyle = 'rgba(160,215,255,.9)'; ctx.fillRect(x + 8, r.y + r.h - 4, sw - 16, 1.5);
      } else if (i) { ctx.fillStyle = LINE; ctx.fillRect(x, r.y + 9, 1, r.h - 18); }
      this.T(en, x + sw / 2, r.y + 18.5 * u, { s: 12, a: 'center', c: on ? '#fff' : 'rgba(215,232,250,.85)', ls: 0.3 });
      this.T(jp, x + sw / 2, r.y + 32.5 * u, { s: 9.5, a: 'center', c: on ? 'rgba(235,246,255,.85)' : 'rgba(178,204,230,.6)', ls: 2 });
    });
    ctx.fillStyle = LINE; ctx.fillRect(r.x + r.w - 44 * u, r.y + 9, 1, r.h - 18);
    this.search(r.x + r.w - 26 * u, r.y + r.h / 2 - 3, 6 * u);
  }

  // ---- 左 ----
  map(r, t) {
    const { ctx, u, state } = this;
    this.title(r, 'MINIMAP', 'x', '全域配置');
    // 左のアイコンレール
    for (let i = 0; i < 6; i++) {
      const y = r.y + 46 * u + i * 30 * u;
      this.rr(r.x + 10 * u, y, 22 * u, 22 * u, 5, i === 0 ? 'rgba(130,185,240,.30)' : 'rgba(120,150,190,.10)', i === 0 ? 'rgba(190,225,255,.6)' : LINE);
      this.cube(r.x + 21 * u, y + 11 * u, 5.5 * u, i === 0 ? '#fff' : 'rgba(200,225,250,.7)');
    }
    const mx = r.x + 44 * u, my = r.y + 42 * u, mw = r.w - 44 * u - 14 * u, mh = Math.max(70 * u, r.h * 0.38);
    this.rr(mx, my, mw, mh, 4, 'rgba(4,10,18,.55)', LINE);
    ctx.save(); ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 4); ctx.clip();

    // 周囲のネットワーク（点群）
    for (const p of this.pts) {
      const tw = 0.45 + 0.55 * Math.sin(this.mo * 1.3 + p.ph);
      ctx.fillStyle = `rgba(170,215,255,${0.20 + 0.45 * tw})`;
      ctx.fillRect(mx + (p.x + Math.sin(this.mo * 0.2 + p.ph) * 0.004) * mw, my + p.y * mh, p.s * u, p.s * u);
    }
    const fx = mx + 0.42 * mw, fy = my + 0.52 * mh;
    const sc = (mh * 0.60) / (GRID * SPACING);
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, mh * 0.5);
    g.addColorStop(0, 'rgba(120,190,255,.30)'); g.addColorStop(1, 'rgba(120,190,255,0)');
    ctx.fillStyle = g; ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = 'rgba(190,225,255,.28)'; ctx.lineWidth = 1;
    [0.40, 0.52].forEach((k, i) => { ctx.beginPath(); ctx.arc(fx, fy, mh * k, this.mo * (i ? -0.35 : 0.45), this.mo * (i ? -0.35 : 0.45) + 3.6); ctx.stroke(); });

    // アセット場（真上から）。選択中は強調し、ビームでつながる周辺アセットを結ぶ
    const sel = state.selected >= 0 ? state.assets[state.selected] : null;
    const px = (a) => [fx + a.x * sc, fy + a.z * sc];
    // 距離リングと十字線、グリッド座標
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(170,210,245,.14)';
    ctx.setLineDash([2, 4]); ctx.lineDashOffset = this.mo * 4;
    [0.22, 0.31].forEach((k) => { ctx.beginPath(); ctx.arc(fx, fy, mh * k, 0, 7); ctx.stroke(); });
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(170,210,245,.10)'; ctx.fillRect(mx, fy, mw, 1); ctx.fillRect(fx, my, 1, mh);
    for (let i = -12; i <= 12; i++) { ctx.fillRect(fx + i * 3 * sc / 1.5, fy - (i % 5 ? 1.5 : 3), 1, i % 5 ? 3 : 6); }
    for (let g = 0; g < GRID; g++) {
      const gx = fx + (g - (GRID - 1) / 2) * SPACING * sc, gz = fy + (g - (GRID - 1) / 2) * SPACING * sc;
      this.T('ABCDE'[g], gx, my + 9 * u, { s: 7.5, f: MONO, a: 'center', c: 'rgba(185,215,245,.5)' });
      this.T(String(g + 1), mx + 5 * u, gz + 2.5 * u, { s: 7.5, f: MONO, c: 'rgba(185,215,245,.5)' });
    }
    this.mapSel = sel ? px(sel) : null;
    if (sel) {
      const [sx, sy] = px(sel);
      ctx.fillStyle = 'rgba(210,240,255,.20)'; ctx.fillRect(mx, sy, mw, 1); ctx.fillRect(sx, my, 1, mh);
    }
    if (sel) {
      ctx.setLineDash([3, 3]); ctx.lineDashOffset = -this.mo * 6;
      ctx.strokeStyle = 'rgba(210,240,255,.55)';
      state.graph.beamAssets.forEach((i) => {
        const [x0, y0] = px(sel), [x1, y1] = px(state.assets[i]);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      });
      ctx.setLineDash([]);
    }
    state.assets.forEach((a) => {
      const [x, y] = px(a), on = sel && a.index === sel.index;
      const rel = sel && state.graph.beamAssets.includes(a.index);
      const w = a.w * sc * 0.82, d = a.d * sc * 0.82;
      const c = a.color.map((v) => Math.round(v * 255)).join(',');
      ctx.fillStyle = `rgba(${c},${on ? 0.9 : rel ? 0.6 : 0.32})`;
      ctx.fillRect(x - w / 2, y - d / 2, w, d);
      ctx.strokeStyle = `rgba(${c},${on || rel ? 0.95 : 0.55})`; ctx.lineWidth = 1;
      ctx.strokeRect(x - w / 2 + 0.5, y - d / 2 + 0.5, w - 1, d - 1);
    });
    if (sel) {
      const [x, y] = px(sel), k = (this.mo * 0.8) % 1;
      ctx.strokeStyle = `rgba(230,246,255,${0.8 * (1 - k) * (1 - 0.6 * this.q)})`;
      ctx.beginPath(); ctx.arc(x, y, (6 + k * 14) * u, 0, 7); ctx.stroke();
    }

    // カメラの視野（向き・距離・注視点に追従）
    const cam = state.cam;
    const cx = fx + cam.tx * sc, cy = fy + cam.tz * sc;
    const hFar = cam.dist * 0.30 * sc, hNear = cam.dist * 0.17 * sc, dep = cam.dist * 0.22 * sc;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-cam.az);
    ctx.beginPath(); ctx.moveTo(-hNear, dep / 2); ctx.lineTo(hNear, dep / 2); ctx.lineTo(hFar, -dep / 2); ctx.lineTo(-hFar, -dep / 2); ctx.closePath();
    ctx.fillStyle = 'rgba(190,225,255,.08)'; ctx.fill();
    ctx.strokeStyle = 'rgba(225,244,255,.85)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -dep / 2); ctx.lineTo(0, -dep / 2 - 6 * u); ctx.moveTo(-3 * u, -dep / 2 - 3 * u); ctx.lineTo(0, -dep / 2 - 6 * u); ctx.lineTo(3 * u, -dep / 2 - 3 * u); ctx.stroke();
    ctx.restore();

    // 縮尺バー（1マス＝SPACING）
    {
      const bx = mx + 8 * u, by = my + mh - 9 * u, bl = SPACING * sc;
      ctx.fillStyle = 'rgba(190,225,255,.55)'; ctx.fillRect(bx, by, bl, 1); ctx.fillRect(bx, by - 3 * u, 1, 6 * u); ctx.fillRect(bx + bl, by - 3 * u, 1, 6 * u);
      this.T(`${SPACING.toFixed(1)} m / CELL`, bx + bl + 6 * u, by + 3 * u, { s: 7.5, f: MONO, c: 'rgba(185,215,245,.5)', ls: 0.8 });
    }
    // 走査線
    if (this.q < 0.99) {
      const sx = mx + ((this.mo * 0.09) % 1) * mw;
      const sg = ctx.createLinearGradient(sx - 30 * u, 0, sx, 0);
      sg.addColorStop(0, 'rgba(170,215,255,0)'); sg.addColorStop(1, 'rgba(170,215,255,.14)');
      ctx.save(); ctx.globalAlpha = 1 - this.q; ctx.fillStyle = sg; ctx.fillRect(sx - 30 * u, my, 30 * u, mh); ctx.restore();
    }
    ctx.restore();

    const ry = my + mh + 22 * u;
    this.T('REGION', mx - 2, ry - 4, { s: 11.5, c: DIM, ls: 1.2 });
    this.w_matrix(mx + mw - 66 * u, ry - 15 * u, 12, 2, 3, 5.5 * u);
    const rh = Math.min(22 * u, (r.y + r.h - ry - 8) / REGIONS.length);
    REGIONS.forEach(([n, c], i) => {
      const y = ry + i * rh;
      if (i === 0) this.rr(mx - 6, y + 2, mw + 6, rh - 2, 4, HI, 'rgba(190,225,255,.45)');
      this.cube(mx + 8 * u, y + rh / 2 + 1, 5 * u, i === 0 ? '#fff' : 'rgba(200,225,250,.7)');
      this.T(n, mx + 24 * u, y + rh / 2 + 4.5 * u, { s: 12 });
      this.T(String(c).replace(/\B(?=(\d{3})+$)/g, ','), mx + mw - 6, y + rh / 2 + 4.5 * u, { s: 12, a: 'right' });
    });
  }

  alist(r) {
    const { state, u } = this;
    this.title(r, 'ASSET LIST', 's', '資産一覧');
    const sel = state.selected;
    const sorted = [...state.assets].sort((a, b) => b.risk - a.risk);
    const rh = (this.compact || this.touch ? 28 : 21.5) * u, top = r.y + 62 * u;
    const n = Math.max(3, Math.floor((r.y + r.h - top - 6 - 20 * u) / rh));
    let rows = sorted.slice(0, n);
    if (sel >= 0 && !rows.includes(state.assets[sel])) rows[n - 1] = state.assets[sel];
    this.ctx.fillStyle = LINE; this.ctx.fillRect(r.x + 14 * u, r.y + 36 * u, r.w - 28 * u, 1);
    this.T('Name', r.x + 40 * u, r.y + 55 * u, { s: 11.5, c: DIM });
    this.T('Risk', r.x + r.w - 20 * u, r.y + 55 * u, { s: 11.5, c: DIM, a: 'right' });
    this.hit.alist = rows.map((a, i) => [top + i * rh, top + (i + 1) * rh, a.index]);
    rows.forEach((a, i) => {
      const y = top + i * rh, on = a.index === sel;
      if (on) this.rr(r.x + 10 * u, y, r.w - 20 * u, rh - 2, 3, 'rgba(140,185,235,.30)', 'rgba(200,230,255,.55)');
      this.cube(r.x + 26 * u, y + rh / 2 - 1, 5.2 * u, on ? '#fff' : 'rgba(200,225,250,.7)');
      this.T(a.name, r.x + 40 * u, y + rh / 2 + 3.5 * u, { s: 12 });
      const bx = r.x + r.w * 0.52, bw = r.w * 0.28;
      this.ctx.fillStyle = 'rgba(160,190,225,.16)'; this.ctx.fillRect(bx, y + rh / 2 - 1, bw, 2 * u);
      this.ctx.fillStyle = a.risk >= 7 ? 'rgba(255,205,195,.9)' : 'rgba(170,215,255,.85)';
      this.ctx.fillRect(bx, y + rh / 2 - 1, bw * (a.risk / 10), 2 * u);
      this.T(a.risk.toFixed(1), r.x + r.w - 20 * u, y + rh / 2 + 3.5 * u, { s: 12, a: 'right', c: a.risk >= 7 ? '#ffd9d0' : WHITE });
    });
    this.w_dist(r, state.assets.map((a) => a.risk), `${state.assets.length} NODES`);
  }

  elog(r, t) {
    const { ctx, u } = this;
    this.title(r, 'EVENT LOG', 'x', '事象記録');
    // 新しいログ行を流す
    if (!this.log.length) {
      for (let i = 0; i < 9; i++) this.pushLog(new Date(Date.now() - (9 - i) * 3300));
    }
    if (t - this.lastPush > (this.q > 0.5 ? 12 : 2.2)) { this.pushLog(new Date()); this.lastPush = t; }
    const tabs = ['ALL', 'WARN', 'ERROR', 'INFO'];
    const tw = (r.w - 32 * u) / 4;
    tabs.forEach((s, i) => {
      const x = r.x + 16 * u + i * tw;
      this.rr(x, r.y + 38 * u, tw - 3, 22 * u, 3, i === 0 ? 'rgba(140,185,235,.32)' : 'rgba(120,150,190,.08)', i === 0 ? 'rgba(200,230,255,.5)' : LINE);
      this.T(s, x + (tw - 3) / 2, r.y + 53 * u, { s: 11.5, a: 'center', c: i === 0 ? '#fff' : DIM, ls: 0.4 });
    });
    this.w_bars(r.x + 16 * u, r.y + 64 * u, r.w - 32 * u, 8 * u, 5, 34);
    const rh = 19 * u, top = r.y + 78 * u;
    const n = Math.floor((r.y + r.h - top) / rh);
    const slide = (1 - sm((t - this.lastPush) / 0.5)) * -rh;
    this.hit.elog = this.log.slice(0, n + 1).map((e, i) => [top + i * rh - 4 * u, top + (i + 1) * rh - 4 * u, e.src]);
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, top - 8 * u, r.w, r.h); ctx.clip();
    this.log.slice(0, n + 1).forEach((e, i) => {
      const y = top + i * rh + 12 * u + slide;
      const a = i === 0 ? sm((t - this.lastPush) / 0.5) : 1;
      ctx.save(); ctx.globalAlpha *= a;
      this.T(e.time, r.x + 16 * u, y, { s: 11.5, f: MONO, c: DIM });
      this.T(e.src, r.x + 80 * u, y, { s: 11.5, c: e.lvl === 'ERROR' ? '#ffd0c8' : WHITE });
      ctx.font = `400 ${11.5 * u}px ${SANS}`;
      this.T(this.fit(e.msg, r.x + r.w - (r.x + 164 * u) - 12 * u), r.x + 164 * u, y, { s: 11.5, c: 'rgba(205,225,245,.78)' });
      ctx.restore();
    });
    ctx.restore();
  }

  pushLog(d) {
    const names = this.state.assets.map((a) => a.name);
    const [msg, lvl] = LOG_POOL[(Math.random() * LOG_POOL.length) | 0];
    this.log.unshift({ time: clock(d), src: names[(Math.random() * names.length) | 0], msg, lvl });
    if (this.log.length > 14) this.log.pop();
  }

  // ---- 右 ----
  // 選択アセットを囲む多重リング
  ringHud(cx, cy, R, a, t) {
    const { ctx, u } = this;
    {
      const sel = Math.max(0, t - this.state.selT);
      const risk = a ? a.risk / 10 : 0;
      const warm = a && a.risk >= 7;
      ctx.lineWidth = 1;
      for (let i = 0; i < 72; i++) {
        const an = i * Math.PI / 36 + this.mo * 0.15, l = i % 6 === 0 ? 4.5 * u : i % 2 === 0 ? 2.5 * u : 1.5 * u;
        ctx.strokeStyle = `rgba(190,225,255,${i % 6 === 0 ? 0.42 : 0.2})`;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * R, cy + Math.sin(an) * R); ctx.lineTo(cx + Math.cos(an) * (R + l), cy + Math.sin(an) * (R + l)); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(225,244,255,.85)'; ctx.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) { const a0 = -this.mo * 0.7 + k * 2.094; ctx.beginPath(); ctx.arc(cx, cy, R - 3 * u, a0, a0 + 1.05); ctx.stroke(); }
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(170,210,245,.5)';
      ctx.setLineDash([1.2 * u, 3.2 * u]); ctx.lineDashOffset = -this.mo * 5;
      ctx.beginPath(); ctx.arc(cx, cy, R - 8 * u, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(190,225,255,.14)'; ctx.lineWidth = 3 * u;
      ctx.beginPath(); ctx.arc(cx, cy, R - 13.5 * u, 0, 7); ctx.stroke();
      ctx.strokeStyle = warm ? 'rgba(255,190,175,.95)' : 'rgba(175,225,255,.95)';
      ctx.beginPath(); ctx.arc(cx, cy, R - 13.5 * u, -Math.PI / 2, -Math.PI / 2 + 6.283 * risk * Math.min(1, sel / 0.8)); ctx.stroke();
      this.cube(cx, cy, 7.5 * u, '#fff');
    }
  }

  detail(r, t) {
    if (this.compact) return this.detailCompact(r, t);
    const { ctx, state, u } = this;
    const a = state.selected >= 0 ? state.assets[state.selected] : null;
    const gc = state.graph.counts;
    const k = Math.min(1, r.h / (500 * u));
    const rowH = 23 * u * k;
    this.title(r, 'ASSET DETAIL', '', '資産詳細');
    // 名前と、Iron Man風の多重リング（目盛り輪・逆回転する円弧・点線輪・リスク弧）
    this.ringHud(r.x + 50 * u, r.y + 64 * u, 29 * u, a, t);
    {
      const nm = a ? this.scr(a.name, (t - state.selT) / 0.5 - 0.1, 3) : '—';
      // 幅の狭いパネルでは名前の大きさを詰める
      ctx.font = `400 ${25 * u}px ${SANS}`;
      const nw = ctx.measureText(a ? a.name : '—').width, room = r.w - 104 * u;
      this.T(nm, r.x + 92 * u, r.y + 62 * u, { s: nw > room ? 25 * room / nw : 25, w: 400 });
      this.T(a ? `${a.label}` : '', r.x + 92 * u, r.y + 78 * u, { s: 10, c: DIM, ls: 1.2 });
    }
    const vx = r.x + r.w * 0.42;
    const rows = a ? [
      ['Type', a.label], ['Env', a.env], ['IP', a.ip], ['OS', a.os],
      ['Logs', '受信中 (Last 1m)'], ['Alerts', `${a.alerts} (Critical ${a.state === 2 ? 1 : 0})`],
    ] : [];
    let y = r.y + 104 * u;
    rows.forEach(([l, v], i) => {
      this.T(l, r.x + 16 * u, y + i * rowH, { s: 12.5, c: 'rgba(200,222,245,.82)' });
      this.ctx.font = CJK.test(v) ? `500 ${12.5 * u}px ${SERIF}` : `400 ${12.5 * u}px ${SANS}`;
      this.T(this.scr(this.fit(v, r.x + r.w - vx - 14 * u), (t - state.selT - 0.15 - i * 0.07) / 0.4, i + 20), vx, y + i * rowH, { s: 12.5 });
    });
    // Logs の脇に小さな流れる棒
    const lx = r.x + r.w - 38 * u, ly = y + 4 * rowH;
    for (let i = 0; i < 6; i++) {
      const h = (0.25 + 0.75 * Math.abs(noise(i * 0.9 + this.mo * 3))) * 8 * u;
      ctx.fillStyle = 'rgba(170,220,255,.8)'; ctx.fillRect(lx + i * 5 * u, ly - h, 3 * u, h);
    }
    y += rows.length * rowH + 4 * u;
    ctx.fillStyle = LINE; ctx.fillRect(r.x + 14 * u, y - 10 * u, r.w - 28 * u, 1);

    this.T('VULNERABILITY', r.x + 16 * u, y + 14 * u, { s: 13, ls: 0.3 });
    this.w_matrix(r.x + r.w - 82 * u, y + 3 * u, 12, 2, 7, 5.5 * u);
    y += 36 * u * k;
    const hot = state.graph.nodes.filter((n) => n.hot && n.type === 'CVE').length;
    [['CVE', gc.CVE, 'CVE'], ['CWE', gc.CWE, 'CWE'], ['CAPEC', gc.CAPEC, 'CAPEC'], ['Exploit', hot, 'CVE'], ['ATT&CK Technique', gc['ATT&CK'], 'ATT&CK'], ['Tactic', gc.TACTIC, 'TACTIC']].forEach(([l, v, ty], i) => {
      this.cube(r.x + 22 * u, y + i * rowH - 4 * u, 5 * u, typeCss(ty, .95));
      this.T(l, r.x + 34 * u, y + i * rowH, { s: 12.5, c: 'rgba(200,222,245,.82)' });
      this.T(String(v ?? 0), vx + 48 * u, y + i * rowH, { s: 12.5 });
    });
    y += 6 * rowH + 2 * u;
    ctx.fillStyle = LINE; ctx.fillRect(r.x + 14 * u, y - 10 * u, r.w - 28 * u, 1);

    this.T('RISK SCORE', r.x + 16 * u, y + 14 * u, { s: 13, ls: 0.3 });
    const tgt = a ? a.risk : 0;
    this.riskShown += (tgt - this.riskShown) * 0.06;
    this.w_dial(r.x + r.w - 44 * u, y + 38 * u, 25 * u, this.riskShown / 10, { text: String(Math.round(this.riskShown * 10)), label: 'RISK %' });
    this.T(this.riskShown.toFixed(1), r.x + 16 * u, y + 56 * u * k + 8 * u, { s: 34, w: 400 });
    ctx.font = `400 ${34 * u}px ${SANS}`;
    const nw = ctx.measureText(this.riskShown.toFixed(1)).width;
    this.T('/ 10', r.x + 16 * u + nw + 6 * u, y + 56 * u * k + 8 * u, { s: 17, c: DIM });
    const by = y + 70 * u * k + 8 * u, bw = r.w - 32 * u;
    this.rr(r.x + 16 * u, by, bw, 6 * u, 3, 'rgba(160,190,225,.18)');
    const g = ctx.createLinearGradient(r.x + 16 * u, 0, r.x + 16 * u + bw, 0);
    g.addColorStop(0, 'rgba(120,180,240,.6)'); g.addColorStop(1, 'rgba(225,245,255,.95)');
    this.rr(r.x + 16 * u, by, bw * (this.riskShown / 10), 6 * u, 3, g);
    const sx = r.x + 16 * u + ((this.mo * 0.35) % 1) * bw * (this.riskShown / 10);
    ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - this.q)})`; ctx.fillRect(sx, by, 2 * u, 6 * u);
  }

  // 狭い画面用のAsset Detail: リング・名前・リスクを上に、情報を2列、脆弱性を3列のグリッドで詰める
  detailCompact(r, t) {
    const { ctx, state, u } = this;
    const a = state.selected >= 0 ? state.assets[state.selected] : null, gc = state.graph.counts;
    this.title(r, 'ASSET DETAIL', '', '資産詳細');
    this.ringHud(r.x + 50 * u, r.y + 64 * u, 29 * u, a, t);
    this.T(a ? this.scr(a.name, (t - state.selT) / 0.5 - 0.1, 3) : '—', r.x + 92 * u, r.y + 62 * u, { s: 22 });
    this.T(a ? a.label : '', r.x + 92 * u, r.y + 78 * u, { s: 10, c: DIM, ls: 1.2 });
    this.riskShown += ((a ? a.risk : 0) - this.riskShown) * 0.06;
    this.T(this.riskShown.toFixed(1), r.x + r.w - 16 * u, r.y + 62 * u, { s: 30, a: 'right' });
    this.T('RISK / 10', r.x + r.w - 16 * u, r.y + 78 * u, { s: 8.5, a: 'right', c: DIM, ls: 1.5 });
    const bw = r.w - 32 * u, by = r.y + 100 * u;
    this.rr(r.x + 16 * u, by, bw, 4 * u, 2, 'rgba(160,190,225,.18)');
    this.rr(r.x + 16 * u, by, Math.max(2, bw * (this.riskShown / 10)), 4 * u, 2, 'rgba(190,230,255,.9)');
    const k = Math.min(1, Math.max(0.75, (r.h - 130 * u) / (166 * u)));
    const cw = (r.w - 32 * u) / 2, ch = 30 * u * k, y0 = r.y + 120 * u;
    const rows = a ? [['Type', a.label], ['Env', a.env], ['IP', a.ip], ['OS', a.os], ['Logs', '受信中 (Last 1m)'], ['Alerts', `${a.alerts} (Critical ${a.state === 2 ? 1 : 0})`]] : [];
    rows.forEach(([l, v], i) => {
      const x = r.x + 16 * u + (i % 2) * cw, y = y0 + Math.floor(i / 2) * ch;
      this.T(l, x, y, { s: 9.5, c: DIM, ls: 0.6 });
      ctx.font = CJK.test(v) ? `500 ${12.5 * u}px ${SERIF}` : `400 ${12.5 * u}px ${SANS}`;
      this.T(this.scr(this.fit(v, cw - 10 * u), (t - state.selT - 0.15 - i * 0.07) / 0.4, i + 20), x, y + 14 * u, { s: 12.5 });
    });
    const vy = y0 + 3 * ch + 8 * u;
    ctx.fillStyle = LINE; ctx.fillRect(r.x + 14 * u, vy - 12 * u, r.w - 28 * u, 1);
    this.T('VULNERABILITY', r.x + 16 * u, vy + 4 * u, { s: 11, ls: 0.4 });
    const hot = state.graph.nodes.filter((n) => n.hot && n.type === 'CVE').length, tw = (r.w - 32 * u) / 3;
    [['CVE', gc.CVE, 'CVE'], ['CWE', gc.CWE, 'CWE'], ['CAPEC', gc.CAPEC, 'CAPEC'], ['Exploit', hot, 'CVE'], ['ATT&CK', gc['ATT&CK'], 'ATT&CK'], ['Tactic', gc.TACTIC, 'TACTIC']].forEach(([l, v, ty], i) => {
      const x = r.x + 16 * u + (i % 3) * tw, y = vy + 24 * u + Math.floor(i / 3) * ch;
      ctx.fillStyle = typeCss(ty, .9); ctx.fillRect(x, y - 13 * u, 14 * u, 1.5 * u);
      this.T(String(v ?? 0), x, y, { s: 16 });
      this.T(l, x, y + 12 * u, { s: 9, c: DIM, ls: 0.5 });
    });
  }

  related(r) {
    const { ctx, state, u } = this;
    this.title(r, 'RELATED NODES', 'x', '関連節点');
    const nodes = state.graph.nodes;
    const pick = (type, n) => nodes.filter((q) => q.type === type).sort((p, q) => q.hot - p.hot).slice(0, n);
    const items = [
      ...pick('CVE', 2).map((q) => [q.id, 'CVE']),
      ...pick('ATT&CK', 2).map((q) => [`${q.id}${TECH[q.id] ? ` (${TECH[q.id]})` : ' (Exploit Public-Facing...)'}`, 'ATT&CK']),
      ...pick('TACTIC', 1).map((q) => [`${q.id} (Initial Access)`, 'TACTIC']),
    ].slice(0, 5);
    const rh = Math.min(34 * u, (r.h - 60 * u) / 5.4);
    items.forEach(([s, ty], i) => {
      const y = r.y + 44 * u + i * rh;
      ctx.fillStyle = LINE; ctx.fillRect(r.x + 14 * u, y + rh - 3, r.w - 28 * u, 1);
      this.cube(r.x + 28 * u, y + rh / 2 - 2, 8 * u, typeCss(ty, .95));
      ctx.font = `400 ${12.5 * u}px ${SANS}`;
      this.T(this.fit(s, r.w - 66 * u - 34 * u), r.x + 48 * u, y + rh / 2 + 3 * u, { s: 12.5 });
      ctx.strokeStyle = 'rgba(170,215,255,.55)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 0; k <= 14; k++) {
        const xx = r.x + r.w - 52 * u + k * 2.6 * u, yy = y + rh / 2 + noise(k * 0.7 + i * 3 + this.mo * 1.6) * 4 * u;
        k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
    });
    this.T('...', r.x + 40 * u, r.y + 44 * u + items.length * rh + 6 * u, { s: 13, c: DIM });
    const ny = r.y + r.h - 28 * u;
    if (ny - 18 * u > r.y + 44 * u + items.length * rh + 14 * u) this.w_netFoot(r, ny, 2);
  }

  // ---- 下 ----
  timeline(r, t) {
    const { ctx, u } = this;
    const cti = this.state.mode === 'cti', act = cti && this.state.cti.selected >= 0 ? this.state.cti.actors[this.state.cti.selected].activity : null;
    this.title(r, cti ? 'ACTIVITY' : 'TIMELINE', '', cti ? '活動推移' : '時系列');
    if (r.w > 700 * u) {
      const pk = Math.round(64 + 28 * noise(this.mo * 0.15)), av = Math.round(30 + 9 * noise(this.mo * 0.1 + 2)), sd = (0.28 + 0.06 * noise(this.mo * 0.2 + 5)).toFixed(2);
      this.T(`PEAK ${pk}   AVG ${av}   σ ${sd}`, r.x + 236 * u, r.y + 25 * u, { s: 8.5, f: MONO, c: 'rgba(170,200,230,.55)', ls: 1 });
      this.w_ruler(r.x + 236 * u, r.y + 31 * u, 150 * u, 1);
    }
    const ranges = ['24H', '6H', '1H', 'LIVE'];
    ranges.forEach((s, i) => {
      const x = r.x + r.w - (ranges.length - i) * 48 * u - 8 * u;
      if (s === '1H') this.rr(x - 6 * u, r.y + 12 * u, 44 * u, 22 * u, 4, 'rgba(140,185,235,.34)', 'rgba(200,230,255,.55)');
      this.T(s, x + 16 * u, r.y + 27 * u, { s: 11.5, a: 'center', c: s === '1H' ? '#fff' : DIM });
    });
    const cx = r.x + 44 * u, cw = r.w - 44 * u - 16 * u, cy = r.y + 44 * u, ch = r.h - 44 * u - 26 * u;
    [0, 0.25, 0.5, 0.75, 1].forEach((f, i) => {
      ctx.fillStyle = 'rgba(190,215,240,.10)'; ctx.fillRect(cx, cy + ch * f, cw, 1);
      this.T(String(100 - i * 25), cx - 6 * u, cy + ch * f + 3 * u, { s: 8.5, a: 'right', c: 'rgba(170,196,222,.5)' });
    });
    const bw = 5.2 * u, n = Math.floor(cw / bw);
    const sh = this.mo * 1.4, off = Math.floor(sh), fr = sh - off;
    const ph = cx + cw * 0.68;
    for (let i = 0; i < n; i++) {
      const k = i + off;
      const v = act ? act[mod(k, act.length)] : Math.min(1, Math.max(0.05, 0.16 + 0.5 * (0.5 + 0.5 * noise(k * 0.21)) * (0.55 + 0.45 * noise(k * 0.063 + 3)) + hash(k) * 0.12));
      const x = cx + (i - fr) * bw;
      if (x < cx || x > cx + cw - bw) continue;
      const near = Math.max(0, 1 - Math.abs(x - ph) / (60 * u));
      ctx.fillStyle = `rgba(${150 + 90 * near},${195 + 50 * near},240,${0.5 + 0.4 * near})`;
      ctx.fillRect(x, cy + ch * (1 - v), bw - 1.6 * u, ch * v);
    }
    ctx.fillStyle = 'rgba(200,225,250,.55)'; ctx.fillRect(cx, cy + ch, cw, 1);
    // 平滑化した発光カーブ（棒グラフの上に重ねる抽象表現）
    ctx.save();
    ctx.beginPath();
    for (let x = 0; x <= cw; x += 3) {
      const k = sh + x / bw;
      const v = 0.22 + 0.5 * (0.5 + 0.5 * noise(k * 0.21)) * (0.55 + 0.45 * noise(k * 0.063 + 3));
      x ? ctx.lineTo(cx + x, cy + ch * (1 - v)) : ctx.moveTo(cx, cy + ch * (1 - v));
    }
    ctx.strokeStyle = 'rgba(225,244,255,.85)'; ctx.lineWidth = 1.4;
    ctx.shadowColor = 'rgba(150,210,255,.9)'; ctx.shadowBlur = 8 * u; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#e8f6ff'; ctx.fillRect(ph, cy - 4 * u, 1.4, ch + 8 * u);
    ctx.beginPath(); ctx.moveTo(ph - 4 * u, cy - 6 * u); ctx.lineTo(ph + 4.4 * u, cy - 6 * u); ctx.lineTo(ph + 0.2, cy); ctx.fill();
    const d = Date.now();
    for (let i = 0; i < 5; i++) {
      const dt = new Date(d - (4 - i) * 10 * 60000);
      const x = cx + (cw * (i + 0.5)) / 5 - 8 * u;
      this.T(`${pad2(dt.getHours())}:${pad2(Math.floor(dt.getMinutes() / 10) * 10)}`, x, cy + ch + 18 * u, { s: 11.5, a: 'center', c: i === 3 ? '#fff' : DIM });
    }
  }

  layer(r, t) {
    const { ctx, u } = this;
    this.title(r, 'LAYER', '', '階層');
    const LY = this.state.mode === 'cti' ? CTI_LAYERS : LAYERS;
    const rh = Math.min(26 * u, (r.h - 46 * u) / LY.length);
    LY.forEach(([s, ty], i) => {
      const y = r.y + 40 * u + i * rh;
      this.rr(r.x + 16 * u, y + 3, 14 * u, 14 * u, 3, typeCss(ty, .9));
      ctx.strokeStyle = '#06101a'; ctx.lineWidth = 1.6; ctx.beginPath();
      ctx.moveTo(r.x + 19 * u, y + 10 * u); ctx.lineTo(r.x + 22.5 * u, y + 13 * u); ctx.lineTo(r.x + 28 * u, y + 7 * u); ctx.stroke();
      this.T(s, r.x + 38 * u, y + 14.5 * u, { s: 12.5 });
    });
    const sx = r.x + r.w - 20 * u, sy0 = r.y + 40 * u, sy1 = r.y + r.h - 18 * u;
    ctx.fillStyle = 'rgba(190,215,240,.3)'; ctx.fillRect(sx - 1, sy0, 2, sy1 - sy0);
    const ky = sy0 + (sy1 - sy0) * (0.5 + 0.04 * Math.sin(this.mo * 0.8));
    ctx.fillStyle = 'rgba(190,225,255,.9)'; ctx.fillRect(sx - 1, ky, 2, sy1 - ky);
    ctx.save(); ctx.shadowColor = 'rgba(160,215,255,.9)'; ctx.shadowBlur = (8 + 4 * Math.sin(this.mo * 3) * (1 - this.q)) * u;
    ctx.beginPath(); ctx.arc(sx, ky, 5 * u, 0, 7); ctx.fillStyle = '#e9f6ff'; ctx.fill(); ctx.restore();
  }
}

installCtiPanels(Overlay, { SANS, MONO, SERIF, CJK, WHITE, DIM, LINE, HI, sm, noise, hash, mod, pad2 });
installWidgets(Overlay, { MONO, noise, hash, mod });

export { SANS, MONO, SERIF, CJK, WHITE, DIM, sm, noise, hash, mod, pad2 };

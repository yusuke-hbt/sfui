import { SANS, MONO, SERIF, CJK, WHITE, DIM, sm, noise, hash, mod, pad2 } from './overlay.js';

const GLY = 'ABCDEF0123456789#%/<>+*';
const JPG = '電脳零式神経網義体基幹素子攻殻';
const STEPS = ['ハッシュ照合', 'トークン発行', 'ポリシー評価', 'セッション確立'];

// ログイン画面。3Dシーン（起動前の暗い背景）の手前に重ねる。パスワードは何でもよく、Enterで認証演出に入る。
// phase: input → verify → granted → exit。exit に入った時点で onGranted を呼び、本編の起動演出を始める。
export class Login {
  constructor(root, canvas, glass, onGranted) {
    this.root = root; this.cv = canvas; this.ctx = canvas.getContext('2d'); this.glass = glass;
    this.onGranted = onGranted;
    this.pw = '';
    this.input = document.getElementById('pwIn'); this.go = document.getElementById('loginGo');
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.phase = 'input'; this.pt = 0;
    this.deny = -9; this.t = 0; this.lastType = -9; this.t0 = 0; this.timer = 0;
    this.sid = Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, '0');
    // 文字入力は隠し <input> が受ける（ソフトウェアキーボード・IME・貼り付け対応）。画面のどこをタップしても入力欄にフォーカス。
    this.input.addEventListener('input', () => { if (this.phase === 'input') { this.pw = this.input.value; this.lastType = this.t; } });
    root.addEventListener('click', () => { if (this.phase === 'input') this.input.focus({ preventScroll: true }); });
    this.go.addEventListener('click', (e) => { e.stopPropagation(); this.submit(); });
    if (!this.touch) this.input.focus({ preventScroll: true });
    addEventListener('keydown', (e) => this.key(e));
    try { document.fonts.load('500 12px "Shippori Mincho"', `${JPG}資産情報解析システム認証暗号入力端末第七区画完了拒否`); } catch (err) { /* フォールバック書体 */ }
    this.resize();
  }

  key(e) {
    if (this.phase !== 'input' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') { this.submit(); e.preventDefault(); }
    else if (document.activeElement !== this.input && !this.touch) this.input.focus({ preventScroll: true });   // この打鍵がそのまま入力される
  }

  submit() {
    if (this.phase !== 'input') return;
    if (!this.pw.length) { this.deny = this.t; return; }
    this.phase = 'verify'; this.pt = this.t; this.input.blur();
  }

  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    const W = this.W = innerWidth, H = this.H = innerHeight;
    this.cv.width = W * this.dpr; this.cv.height = H * this.dpr;
    this.u = Math.min(1.3, Math.max(H < 520 ? 0.6 : 0.85, Math.min(H / 941, W / 640)));
    this.pw_ = Math.min(540 * this.u, W - 24); this.ph_ = 372 * this.u;
  }

  T(s, x, y, o = {}) {
    const { ctx, u } = this, jp = CJK.test(s);
    ctx.font = `${o.w || (jp ? 500 : 400)} ${(o.s || 12) * u}px ${o.f || (jp ? SERIF : SANS)}`;
    ctx.fillStyle = o.c || WHITE; ctx.textAlign = o.a || 'left';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${o.ls || 0}px`;
    ctx.fillText(s, x, y);
    if (o.ls && 'letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  scr(s, p, seed = 0, set = GLY) {
    if (p >= 1) return s;
    const n = Math.floor(Math.max(0, p) * s.length), f = Math.floor(this.t * 20);
    let o = '';
    for (let i = 0; i < s.length; i++) o += (i < n || s[i] === ' ') ? s[i] : set[Math.floor(hash(i * 3.3 + seed + f * 1.7) * set.length)];
    return o;
  }

  poly(x, y, w, h, [a, b, c, d]) {
    const u = this.u; a *= u; b *= u; c *= u; d *= u;
    return [[x + a, y], [x + w - b, y], [x + w, y + b], [x + w, y + h - c], [x + w - c, y + h], [x + d, y + h], [x, y + h - d], [x, y + a]];
  }

  path(pts) { const { ctx } = this; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }

  trace(pts, f) {
    const { ctx } = this, n = pts.length, seg = [];
    let len = 0;
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; seg.push(Math.hypot(q[0] - p[0], q[1] - p[1])); len += seg[i]; }
    let rem = len * Math.min(1, Math.max(0, f));
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    let last = pts[0];
    for (let i = 0; i < n && rem > 0; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      if (rem >= seg[i]) { ctx.lineTo(q[0], q[1]); rem -= seg[i]; last = q; } else { const k = rem / seg[i]; last = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]; ctx.lineTo(last[0], last[1]); rem = 0; }
    }
    ctx.stroke();
    return last;
  }

  // ログアウト後にもう一度ログイン画面へ戻す。時計は呼び出し時点を0として演出をやり直す。
  reset(now) {
    clearTimeout(this.timer);
    this.t0 = now; this.pw = ''; this.phase = 'input'; this.pt = 0; this.deny = -9; this.lastType = -9;
    this.sid = Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, '0');
    this.input.value = '';
    this.root.style.display = 'block'; this.root.style.opacity = 1;
    if (!this.touch) this.input.focus({ preventScroll: true });
  }

  draw(now) {
    const { ctx, dpr, W, H, u } = this;
    const t = now - this.t0;
    this.t = t;
    const age = this.phase === 'input' ? 0 : t - this.pt;
    if (this.phase === 'verify' && age > 2.0) { this.phase = 'granted'; this.pt = t; }
    else if (this.phase === 'granted' && t - this.pt > 1.0) { this.phase = 'exit'; this.pt = t; this.onGranted(); this.root.style.opacity = 0; this.timer = setTimeout(() => { this.root.style.display = 'none'; }, 1100); }
    const ex = this.phase === 'exit' ? sm((t - this.pt) / 0.9) : 0;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const intro = sm(t / 1.2);
    // 背景を暗く落として前面を読みやすくする
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(1,5,10,.30)'); vg.addColorStop(1, 'rgba(1,4,8,.78)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    this.ring(t, intro, ex);
    this.hex(t, intro);
    this.edges(t, intro);
    this.panel(t, intro, ex);
  }

  ring(t, intro, ex) {
    const { ctx, u, W, H } = this;
    const R = Math.min(W, H) * 0.44 * (1 + ex * 0.5), a = intro * 0.9 * (1 - ex);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H / 2); ctx.lineWidth = 1;
    const rot = t * 0.02 + (this.phase === 'verify' ? (t - this.pt) * 0.6 : 0);
    for (let i = 0; i < 180; i++) {
      const an = rot + i * Math.PI / 90, maj = i % 15 === 0, mid = i % 5 === 0, l = (maj ? 10 : mid ? 6 : 3) * u;
      ctx.strokeStyle = `rgba(185,220,250,${maj ? 0.40 : mid ? 0.22 : 0.11})`;
      ctx.beginPath(); ctx.moveTo(Math.cos(an) * R, Math.sin(an) * R); ctx.lineTo(Math.cos(an) * (R - l), Math.sin(an) * (R - l)); ctx.stroke();
      if (maj) this.T(String(mod(i * 2, 360)).padStart(3, '0'), Math.cos(an) * (R - 24 * u), Math.sin(an) * (R - 24 * u) + 3 * u, { s: 8, f: MONO, a: 'center', c: 'rgba(185,220,250,.34)' });
    }
    [[0.92, 0.25, 0.85, 1.6, 0.30], [0.85, -0.42, 1.45, 1, 0.20], [0.74, 0.16, 0.55, 1.2, 0.20], [0.66, -0.7, 0.35, 1, 0.20]].forEach(([k, sp, len, lw, al]) => {
      ctx.lineWidth = lw; ctx.strokeStyle = `rgba(210,238,255,${al})`;
      for (let i = 0; i < 3; i++) { const a0 = t * sp + i * 2.094; ctx.beginPath(); ctx.arc(0, 0, R * k, a0, a0 + len); ctx.stroke(); }
    });
    ctx.restore();
  }

  hex(t, intro) {
    const { ctx, u, W, H } = this;
    if (intro <= 0 || W < 700) return;
    const rh = 11 * u;
    [[34 * u, 3.6], [W - 90 * u, -2.8]].forEach(([x, sp], c) => {
      const off = t * sp, o0 = Math.floor(off), fr = off - o0;
      for (let i = 0; (i - 1) * rh < H; i++) {
        const id = i + o0, y = (i - fr) * rh, e = sm((y - 96 * u) / (70 * u)) * sm((H - 70 * u - y) / (70 * u));
        if (e <= 0) continue;
        const hot = hash(id * 9.1 + c) < 0.06, h = Math.floor(hash(id * 1.37 + c * 50) * 0xffffff).toString(16).toUpperCase().padStart(6, '0');
        this.T(`${hot ? '▸' : ' '}${h.slice(0, 4)} ${h.slice(4)}`, x, y, { s: 8.5, f: MONO, c: `rgba(${hot ? '225,244,255' : '170,205,240'},${(hot ? 0.55 : 0.18) * e * intro})` });
      }
    });
  }

  edges(t, intro) {
    const { ctx, u, W, H } = this;
    ctx.save(); ctx.globalAlpha = intro;
    const m = 18 * u, L = 26 * u;
    ctx.strokeStyle = 'rgba(210,236,255,.5)'; ctx.lineWidth = 1.4;
    [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, dx, dy]) => {
      ctx.beginPath(); ctx.moveTo(x + dx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * L); ctx.stroke();
    });
    for (let side = 0; side < 2; side++) {
      const x = side ? W - 7 : 3;
      for (let y = 60 * u; y < H - 40; y += 10 * u) { const major = Math.round(y / (10 * u)) % 5 === 0; ctx.fillStyle = `rgba(170,205,240,${major ? 0.30 : 0.14})`; ctx.fillRect(x, y, major ? 4 : 2, 1); }
      const my = 60 * u + mod(t * (side ? -0.05 : 0.04) + side * 0.5, 1) * (H - 100 * u);
      ctx.fillStyle = 'rgba(220,242,255,.75)'; ctx.fillRect(x - 1, my, 6, 2);
    }
    const d = new Date();
    this.T('ASSET INTELLIGENCE', 40 * u, 52 * u, { s: 13, w: 300, c: DIM, ls: 5 });
    this.T('資産情報解析システム', 40 * u, 68 * u, { s: 9.5, c: 'rgba(178,204,230,.6)', ls: 3 });
    const narrow = W < 700;
    if (!narrow) {
      this.T(`UTC ${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)}`, W - 40 * u, 52 * u, { s: 11, a: 'right', c: DIM, ls: 0.6 });
      this.T(`SESSION 0x${this.sid}`, W - 40 * u, 68 * u, { s: 9, f: MONO, a: 'right', c: 'rgba(170,200,230,.5)', ls: 1 });
      this.T('PROTOTYPE // DUMMY DATA ONLY', W - 40 * u, H - 44 * u, { s: 9, f: MONO, a: 'right', c: 'rgba(170,200,230,.45)', ls: 1.2 });
    }
    this.T('SECURE TERMINAL ／ 端末 07', 40 * u, H - 44 * u, { s: 10, c: 'rgba(178,204,230,.6)', ls: 2.5 });
    ctx.restore();
  }

  panel(t, intro, ex) {
    const { ctx, u, W, H } = this;
    const age = this.phase === 'input' ? 0 : t - this.pt;
    const shk = Math.max(0, 1 - (t - this.deny) / 0.45), sx = (this.deny > -5 ? Math.sin((t - this.deny) * 70) * 9 * u * shk : 0);
    const k = 1 - ex;                                   // 退場: 縦に畳む
    const w = this.pw_, h = this.ph_ * Math.max(0.02, k);
    const x = (W - w) / 2 + sx, y = (H - h) / 2 - 8 * u * ex;
    const lp = sm((t - 0.3) / 1.0), gp = sm((t - 0.8) / 0.8), cp = sm((t - 1.3) / 0.9);
    const cut = [0, 24, 0, 24], pts = this.poly(x, y, w, h, cut);
    const g = this.glass.style;
    g.opacity = gp * k; g.left = `${x}px`; g.top = `${y}px`; g.width = `${w}px`; g.height = `${h}px`;
    g.clipPath = `polygon(${pts.map((p) => `${(p[0] - x).toFixed(1)}px ${(p[1] - y).toFixed(1)}px`).join(',')})`;
    const warn = this.t - this.deny < 1.2;
    const grant = this.phase === 'granted' || this.phase === 'exit';

    ctx.save();
    ctx.strokeStyle = grant ? 'rgba(225,246,255,.8)' : warn ? 'rgba(255,170,150,.8)' : 'rgba(190,220,248,.4)'; ctx.lineWidth = 1;
    const head = this.trace(pts, lp);
    if (lp < 1) {
      const gr = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 18 * u);
      gr.addColorStop(0, 'rgba(235,248,255,.9)'); gr.addColorStop(1, 'rgba(235,248,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(head[0] - 18 * u, head[1] - 18 * u, 36 * u, 36 * u);
      ctx.restore(); return;
    }
    // 角のブラケット
    const Lb = 22 * u;
    [[cut[0], x, y, 1, 1, 1], [cut[1], x + w, y, -1, 1, 0], [cut[2], x + w, y + h, -1, -1, 1], [cut[3], x, y + h, 1, -1, 0]].forEach(([c, px, py, dx, dy, hi]) => {
      c *= u; ctx.strokeStyle = hi ? 'rgba(238,248,255,.95)' : 'rgba(200,228,255,.5)'; ctx.lineWidth = hi ? 2 : 1.4;
      ctx.beginPath(); ctx.moveTo(px + dx * (c + Lb), py); ctx.lineTo(px + dx * c, py); if (c > 0) ctx.lineTo(px, py + dy * c); ctx.lineTo(px, py + dy * (c + Lb)); ctx.stroke();
    });
    // 内側の周回する明るい区間
    const ins = 6 * u, inner = this.poly(x + ins, y + ins, w - 2 * ins, h - 2 * ins, cut.map((c) => Math.max(0, c - ins / u * 0.41)));
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(170,205,240,.08)'; this.path(inner); ctx.stroke();
    ctx.setLineDash([60 * u, 260 * u]); ctx.lineDashOffset = -t * 22 * u; ctx.strokeStyle = 'rgba(210,238,255,.34)'; this.path(inner); ctx.stroke(); ctx.setLineDash([]);
    // 上辺のノッチ
    const nx = x + w * 0.62, nw = 56 * u;
    ctx.beginPath(); ctx.moveTo(nx, y); ctx.lineTo(nx + 5 * u, y - 7 * u); ctx.lineTo(nx + nw - 5 * u, y - 7 * u); ctx.lineTo(nx + nw, y);
    ctx.fillStyle = 'rgba(150,200,245,.16)'; ctx.fill(); ctx.strokeStyle = 'rgba(200,228,255,.5)'; ctx.stroke();
    this.T('A-00 ／ AUTH', nx + nw / 2, y - 2 * u, { s: 7.5, f: MONO, a: 'center', c: 'rgba(215,236,255,.8)', ls: 0.6 });
    ctx.restore();
    if (cp <= 0.01 || ex >= 1) return;

    // 中身（上から現れる。退場時は全体を薄くする）
    ctx.save(); ctx.globalAlpha = cp * (1 - ex);
    this.path(pts); ctx.clip();
    if (cp < 1) { ctx.beginPath(); ctx.rect(x - 2, y - 2, w + 4, h * cp + 2); ctx.clip(); }
    const px = x + 40 * u, pw = w - 80 * u, p = (t - 1.4) / 0.9;
    this.T(this.scr('ASSET INTELLIGENCE', p, 1), x + w / 2, y + 62 * u, { s: 22, w: 300, a: 'center', ls: 6.5 });
    this.T(this.scr('資産情報解析システム ／ 認証', p * 1.2 - 0.1, 2, JPG), x + w / 2, y + 84 * u, { s: 11.5, a: 'center', c: DIM, ls: 4 });
    ctx.fillStyle = 'rgba(190,215,240,.22)'; ctx.fillRect(px, y + 100 * u, pw, 1);
    // OPERATOR
    this.T('OPERATOR', px, y + 128 * u, { s: 10, c: DIM, ls: 2 }); this.T('操作員', px + 80 * u, y + 128 * u, { s: 10, c: 'rgba(178,204,230,.6)', ls: 3 });
    this.T(this.scr('OP-0417  //  ANALYST', p - 0.2, 3), px + pw, y + 128 * u, { s: 11.5, f: MONO, a: 'right', c: WHITE, ls: 1.2 });
    // PASSWORD
    this.T('PASSWORD', px, y + 160 * u, { s: 10, c: DIM, ls: 2 }); this.T('暗号', px + 80 * u, y + 160 * u, { s: 10, c: 'rgba(178,204,230,.6)', ls: 3 });
    const fy = y + 170 * u, fh = 38 * u;
    ctx.fillStyle = 'rgba(4,10,18,.6)'; ctx.fillRect(px, fy, pw, fh);
    ctx.strokeStyle = warn ? 'rgba(255,170,150,.85)' : grant ? 'rgba(225,246,255,.9)' : 'rgba(190,225,255,.5)'; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, fy + 0.5, pw - 1, fh - 1);
    ctx.fillStyle = 'rgba(235,248,255,.9)'; ctx.fillRect(px, fy, 3 * u, fh);
    ctx.save(); ctx.beginPath(); ctx.rect(px + 4, fy, pw - 8, fh); ctx.clip();
    if (this.phase === 'input') {
      const n = this.pw.length, step = 14 * u, x0 = px + 18 * u;
      const maxN = Math.floor((pw - 40 * u) / step), vis = Math.min(n, maxN), off = n - vis;
      for (let i = 0; i < vis; i++) {
        const fresh = i + off === n - 1 ? sm((t - this.lastType) / 0.15) : 1;
        ctx.fillStyle = 'rgba(232,246,255,.95)'; ctx.beginPath(); ctx.arc(x0 + i * step + 4 * u, fy + fh / 2, 3.4 * u * (0.4 + 0.6 * fresh), 0, 7); ctx.fill();
      }
      if (Math.sin(t * 6) > -0.2) { ctx.fillStyle = 'rgba(232,246,255,.95)'; ctx.fillRect(x0 + vis * step, fy + fh / 2 - 8 * u, 2 * u, 16 * u); }
      if (!n) this.T('パスワードを入力', x0 + 12 * u, fy + fh / 2 + 4 * u, { s: 11.5, c: 'rgba(178,204,230,.45)', ls: 2 });
    } else {
      // 認証中は入力欄が進行バーになる
      const f = this.phase === 'verify' ? sm(age / 1.9) : 1, cells = 28, cw = (pw - 28 * u) / cells;
      for (let i = 0; i < cells; i++) {
        const on = i / cells < f, near = Math.max(0, 1 - Math.abs(i / cells - f) * 6);
        ctx.fillStyle = on ? `rgba(${180 + 60 * near},${224 + 20 * near},255,${0.45 + 0.5 * near})` : 'rgba(160,190,225,.14)';
        ctx.fillRect(px + 14 * u + i * cw, fy + 10 * u, cw - 2 * u, fh - 20 * u);
      }
    }
    ctx.restore();
    ctx.restore();

    // 状態行・ヒント・ログ（枠の外にはみ出さないよう再度クリップ）
    ctx.save(); ctx.globalAlpha = cp * (1 - ex); this.path(pts); ctx.clip();
    const sy = y + 232 * u;
    let msg, col = DIM;
    if (warn) { msg = '入力が必要です ／ INPUT REQUIRED'; col = '#ffc9bc'; }
    else if (this.phase === 'input') msg = this.touch ? 'TAP [ AUTHENTICATE ]  ／  認証' : 'PRESS [ENTER] TO AUTHENTICATE  ／  認証';
    else if (this.phase === 'verify') msg = `VERIFYING CREDENTIALS …  ${STEPS[Math.min(3, Math.floor(age / 0.5))]}`;
    else { msg = this.scr('ACCESS GRANTED  ／  認証完了', (t - this.pt) / 0.4, 9, JPG); col = '#eaf8ff'; }
    const tapMode = this.touch && this.phase === 'input' && !warn;   // タッチ端末はヒント行の代わりにボタンを出す
    if (!tapMode) this.T(msg, x + w / 2, sy, { s: 10.5, a: 'center', c: col, ls: 2.2 });
    // タッチ端末では認証ボタンを出す（ソフトウェアキーボードのEnterに加えて）
    const gs = this.go.style, showGo = this.touch && this.phase === 'input' && cp >= 1 && !warn;
    gs.display = showGo ? 'block' : 'none';
    if (showGo) Object.assign(gs, { left: `${x + w / 2 - 120 * u}px`, top: `${sy - 16 * u}px`, width: `${240 * u}px`, height: `${30 * u}px`, fontSize: `${11 * u}px` });
    if (this.phase === 'input' && !warn && !this.touch) this.T('ANY PASSPHRASE ACCEPTED ／ 任意の文字列で入室できます', x + w / 2, sy + 15 * u, { s: 8.5, a: 'center', c: 'rgba(170,200,230,.4)', ls: 1.2 });
    ctx.fillStyle = 'rgba(190,215,240,.18)'; ctx.fillRect(px, y + 268 * u, pw, 1);
    const LOG = ['LINK   SEC-CHANNEL-07 ............ OK', 'TLS    1.3 / X25519 .............. OK', 'NODE   cell-07.local ............. READY', `AUTH   ${this.phase === 'input' ? 'AWAITING OPERATOR ........ _' : this.phase === 'verify' ? 'IN PROGRESS ................ …' : 'SESSION OPENED ............. OK'}`];
    LOG.forEach((s, i) => {
      const a = sm((t - 1.9 - i * 0.35) / 0.4);
      this.T(s, px, y + (286 + i * 14) * u, { s: 8.5, f: MONO, c: `rgba(170,205,240,${0.55 * a})`, ls: 0.5 });
    });
    this.T(`#${Math.floor(hash(Math.floor(t * 1.5)) * 0xfffff).toString(16).toUpperCase().padStart(5, '0')}`, px + pw, y + 342 * u, { s: 8.5, f: MONO, a: 'right', c: 'rgba(170,200,230,.4)' });
    ctx.restore();
    if (this.phase === 'granted') {
      const f = 1 - sm((t - this.pt) / 0.5);
      ctx.fillStyle = `rgba(225,246,255,${0.10 * f})`; ctx.fillRect(0, 0, W, H);
    }
  }
}

// パネルに足す抽象的な小部品（情報量を増やすための飾り）。意味のある値ではなく、形と動きで「計器らしさ」を出す。
// 色は氷色のみ（危険な値のときだけ既存の暖色）。時計は this.mo（静穏で止まる）。座標・大きさは呼び出し側で u 倍済み。
export function installWidgets(Overlay, K) {
  const { MONO, noise, hash, mod } = K;
  const P = Overlay.prototype;
  const ICE = (a) => `rgba(190,225,255,${a})`, WARM = (a) => `rgba(255,190,175,${a})`;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // 円弧メーター（270°）。目盛りが v まで点灯し、先端で小さな点が脈打つ。中央に数値。
  P.w_dial = function (cx, cy, R, v, o = {}) {
    const { ctx, u } = this, N = 28;
    v = clamp01(v);
    const hot = o.hot ?? v > 0.7, on = hot ? WARM : ICE;
    ctx.save(); ctx.lineCap = 'butt';
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1), th = (135 + 270 * k) * Math.PI / 180, c = Math.cos(th), s = Math.sin(th), lit = k <= v + 1e-6, l = (i % 9 === 0 ? 5.5 : 3.4) * u;
      ctx.lineWidth = lit ? 1.8 : 1; ctx.strokeStyle = lit ? on(0.95) : ICE(i % 9 === 0 ? 0.36 : 0.16);
      ctx.beginPath(); ctx.moveTo(cx + c * (R - l), cy + s * (R - l)); ctx.lineTo(cx + c * R, cy + s * R); ctx.stroke();
    }
    ctx.lineWidth = 1; ctx.strokeStyle = ICE(0.18);
    ctx.beginPath(); ctx.arc(cx, cy, R - 9 * u, 0, 7); ctx.stroke();
    const th = (135 + 270 * v) * Math.PI / 180, pr = R - 9 * u;
    ctx.fillStyle = on(0.55 + 0.4 * Math.sin(this.mo * 3) * (1 - this.q));
    ctx.fillRect(cx + Math.cos(th) * pr - 1.6 * u, cy + Math.sin(th) * pr - 1.6 * u, 3.2 * u, 3.2 * u);
    this.T(o.text ?? String(Math.round(v * 100)), cx, cy + 0.17 * R, { s: (R / u) * 0.58, a: 'center', c: hot ? '#ffd9d0' : '#fff' });
    if (o.label) this.T(o.label, cx, cy + 0.62 * R, { s: 6.5, f: MONO, a: 'center', c: ICE(0.5), ls: 1.2 });
    ctx.restore();
  };

  // 流れる折れ線。方眼つき、右端に脈打つ点、高い山には小さな印。
  P.w_spark = function (x, y, w, h, seed, o = {}) {
    const { ctx, u } = this, n = o.n || 36, sh = this.mo * 0.9, off = Math.floor(sh), fr = sh - off;
    const val = (idx) => clamp01(0.5 + 0.42 * noise(idx * 0.45 + seed * 7) + (hash(idx + seed * 13) - 0.5) * 0.2);
    ctx.save();
    ctx.fillStyle = ICE(0.045); ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ICE(0.10);
    for (let i = 1; i < 3; i++) ctx.fillRect(x, y + (h * i) / 3, w, 1);
    for (let i = 1; i < 6; i++) ctx.fillRect(x + (w * i) / 6, y, 1, h);
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const pts = [];
    for (let i = 0; i <= n + 1; i++) pts.push([x + ((i - fr) * w) / n, y + h - 2 * u - val(i + off) * (h - 4 * u), val(i + off)]);
    ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.strokeStyle = ICE(0.88); ctx.lineWidth = 1.2 * u; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.lineTo(x + w + 4, y + h); ctx.lineTo(x - 4, y + h); ctx.closePath();
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, ICE(0.14)); g.addColorStop(1, ICE(0));
    ctx.fillStyle = g; ctx.fill();
    pts.forEach(([px, py, v]) => { if (v > 0.86 && px > x && px < x + w) { ctx.fillStyle = o.hot ? WARM(0.9) : '#e9f6ff'; ctx.fillRect(px - 1.5 * u, py - 1.5 * u, 3 * u, 3 * u); } });
    const e = pts[n - 1] || pts[pts.length - 1];
    ctx.fillStyle = ICE(0.5 + 0.5 * Math.sin(this.mo * 4) * (1 - this.q)); ctx.fillRect(Math.min(x + w - 2 * u, e[0]) - 1.5 * u, e[1] - 1.5 * u, 3 * u, 3 * u);
    ctx.restore();
  };

  // 棒グラフ（ゆっくり左へ流れる）
  P.w_bars = function (x, y, w, h, seed, n = 24, o = {}) {
    const { ctx, u } = this, sh = this.mo * 0.6, off = Math.floor(sh), fr = sh - off, pitch = w / n;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y - 1, w, h + 2); ctx.clip();
    for (let i = 0; i <= n; i++) {
      const idx = i + off, v = clamp01(0.16 + 0.55 * (0.5 + 0.5 * noise(idx * 0.5 + seed * 5)) + (hash(idx * 1.7 + seed) - 0.5) * 0.3), bx = x + (i - fr) * pitch;
      ctx.fillStyle = v > (o.hotAt || 0.8) ? WARM(0.85) : ICE(i === n - 1 ? 0.95 : 0.5);
      ctx.fillRect(bx, y + h * (1 - v), Math.max(1, pitch - 1.2 * u), h * v);
    }
    ctx.fillStyle = ICE(0.3); ctx.fillRect(x, y + h, w, 1);
    ctx.restore();
  };

  // ドットマトリクス。ゆっくり入れ替わりながら明滅する
  P.w_matrix = function (x, y, cols, rows, seed, pitch) {
    const { ctx, u } = this, c = Math.max(2, pitch * 0.5);
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const ph = hash(q * 7.1 + r * 13.3 + seed), v = hash(q * 3.7 + r * 9.1 + seed + Math.floor(this.mo * 0.7 + ph * 5));
      const px = x + q * pitch, py = y + r * pitch;
      if (v > 0.84) { ctx.fillStyle = ICE(0.95); ctx.fillRect(px, py, c, c); }
      else if (v > 0.58) { ctx.fillStyle = ICE(0.42); ctx.fillRect(px, py, c, c); }
      else { ctx.fillStyle = ICE(0.16); ctx.fillRect(px + c * 0.3, py + c * 0.3, c * 0.4, c * 0.4); }
    }
    void u;
  };

  // 小さな星座（中心のハブと周回する節点）
  P.w_net = function (cx, cy, R, seed) {
    const { ctx, u } = this, N = 7, p = [];
    for (let i = 0; i < N; i++) {
      const a = i * 2.4 + seed + this.mo * 0.12 * (1 + (i % 3) * 0.35), rr = R * (0.38 + 0.6 * hash(i + seed * 3));
      p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.86]);
    }
    ctx.save(); ctx.lineWidth = 1;
    ctx.strokeStyle = ICE(0.16); ctx.setLineDash([1.5 * u, 3 * u]);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = ICE(0.26);
    p.forEach(([px, py], i) => { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke(); });
    ctx.strokeStyle = ICE(0.14);
    ctx.beginPath(); p.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.stroke();
    const k = mod(this.mo * 0.5, 1), s = p[Math.floor(this.mo * 0.5) % N];
    ctx.fillStyle = '#f0faff'; ctx.fillRect(cx + (s[0] - cx) * k - 1.5, cy + (s[1] - cy) * k - 1.5, 3, 3);
    ctx.fillStyle = ICE(0.9); p.forEach(([px, py]) => ctx.fillRect(px - 1.6 * u, py - 1.6 * u, 3.2 * u, 3.2 * u));
    ctx.strokeStyle = ICE(0.9); ctx.strokeRect(cx - 3 * u, cy - 3 * u, 6 * u, 6 * u);
    ctx.restore();
  };

  // 細い目盛り帯と、ゆっくり動くマーカー
  P.w_ruler = function (x, y, w, seed = 0) {
    const { ctx, u } = this, step = 4 * u;
    for (let i = 0, px = x; px < x + w; i++, px += step) { ctx.fillStyle = ICE(i % 5 === 0 ? 0.36 : 0.16); ctx.fillRect(px, y, 1, (i % 5 === 0 ? 5 : 3) * u); }
    ctx.fillStyle = ICE(0.9 * (1 - this.q)); ctx.fillRect(x + mod(this.mo * 0.05 + seed * 0.37, 1) * w, y - 1 * u, 2, 7 * u);
  };

  // 一定時間ごとに変わる16進の読み出し
  P.w_hex = function (n, seed, rate = 1) {
    let s = '';
    for (let i = 0; i < n; i++) s += Math.floor(hash(Math.floor(this.mo * rate) + i * 3.1 + seed) * 16).toString(16).toUpperCase();
    return s;
  };

  // 一覧パネルの下端: 値の分布（0〜10を10区間）の小さなヒストグラムと、件数
  P.w_dist = function (r, vals, tag) {
    const { ctx, u } = this, bins = new Array(10).fill(0);
    vals.forEach((v) => { bins[Math.min(9, Math.max(0, Math.floor(v)))]++; });
    const mx = Math.max(1, ...bins), fb = r.y + r.h - 8 * u, bx = r.x + 52 * u, bw = r.w - 52 * u - 74 * u, pit = bw / 10;
    this.T('DIST', r.x + 16 * u, fb, { s: 8.5, f: MONO, c: 'rgba(170,200,230,.55)', ls: 1 });
    bins.forEach((c, i) => {
      const h = (1.5 + (c / mx) * 9) * u;
      ctx.fillStyle = i >= 7 ? WARM(0.8) : ICE(0.55); ctx.fillRect(bx + i * pit, fb - h, pit - 1.6 * u, h);
    });
    ctx.fillStyle = ICE(0.25); ctx.fillRect(bx, fb + 1.5, bw, 1);
    this.T(tag, r.x + r.w - 16 * u, fb, { s: 8.5, f: MONO, a: 'right', c: 'rgba(170,200,230,.55)', ls: 0.8 });
  };

  // 関連パネルの下端: 小さな星座と16進の読み出し
  P.w_netFoot = function (r, ny, seed) {
    const { u } = this;
    this.w_net(r.x + r.w - 36 * u, ny, 17 * u, seed);
    this.T(`0x${this.w_hex(8, seed, 0.6)}`, r.x + 16 * u, r.y + r.h - 14 * u, { s: 8, f: MONO, c: 'rgba(170,200,230,.4)', ls: 1 });
    this.T('LINK GRAPH', r.x + 16 * u, r.y + r.h - 26 * u, { s: 7.5, f: MONO, c: 'rgba(170,200,230,.5)', ls: 1.6 });
  };
}

import { typeCss } from './graph.js';
import { REGIONS, HOME, FEED_POOL, TACTICS } from './cti-data.js';

// CTIモードで各パネルに描く中身。Overlay の同名パネル（map / alist / elog / detail / related）の代わりに
// `c_<name>` が呼ばれる。枠・見出し・描き上げ演出は Overlay 側と共通。
export function installCtiPanels(Overlay, K) {
  const { SANS, MONO, SERIF, CJK, WHITE, DIM, LINE, HI, sm, noise, hash, mod, pad2 } = K;
  const ac = (a) => typeCss('ACTOR', a);
  const cur = (o) => o.state.cti.actors[o.state.cti.selected] || null;
  const P = Overlay.prototype;

  // 起点の地域から JAPAN へ向かう弧
  const arc = (ctx, x0, y0, x1, y1, lift) => {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - lift;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1);
    return [mx, my];
  };
  const qpt = (x0, y0, mx, my, x1, y1, k) => [(1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * mx + k * k * x1, (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * my + k * k * y1];

  P.c_map = function (r, t) {
    const { ctx, u, state } = this;
    const A = cur(this), actors = state.cti.actors;
    this.title(r, 'THREAT ORIGIN', 'x', '脅威源');
    ['ACTOR', 'CAMPAIGN', 'MALWARE', 'TTP', 'IOC', 'SECTOR'].forEach((ty, i) => {
      const y = r.y + 46 * u + i * 30 * u;
      this.rr(r.x + 10 * u, y, 22 * u, 22 * u, 5, i === 0 ? 'rgba(130,185,240,.30)' : 'rgba(120,150,190,.10)', i === 0 ? 'rgba(190,225,255,.6)' : LINE);
      this.cube(r.x + 21 * u, y + 11 * u, 5.5 * u, typeCss(ty, i === 0 ? 1 : 0.8));
    });
    const mx = r.x + 44 * u, my = r.y + 42 * u, mw = r.w - 44 * u - 14 * u, mh = Math.max(70 * u, r.h * 0.38);
    this.rr(mx, my, mw, mh, 4, 'rgba(4,10,18,.55)', LINE);
    ctx.save(); ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 4); ctx.clip();
    for (const p of this.pts) {
      const tw = 0.45 + 0.55 * Math.sin(this.mo * 1.3 + p.ph);
      ctx.fillStyle = `rgba(170,215,255,${0.14 + 0.34 * tw})`;
      ctx.fillRect(mx + p.x * mw, my + p.y * mh, p.s * u, p.s * u);
    }
    // 緯度経度の薄い格子
    ctx.fillStyle = 'rgba(170,210,245,.07)';
    for (let i = 1; i < 6; i++) ctx.fillRect(mx + (mw * i) / 6, my, 1, mh);
    for (let i = 1; i < 4; i++) ctx.fillRect(mx, my + (mh * i) / 4, mw, 1);
    const hp = [mx + HOME.p[0] * mw, my + HOME.p[1] * mh];
    // 全攻撃者の弧（薄く）。選択中は明るく、光点が走る。
    const seenReg = {};
    actors.forEach((a) => {
      const [rx, ry] = REGIONS[a.origin], x0 = mx + rx * mw, y0 = my + ry * mh, on = A && a.index === A.index;
      if (!on) { ctx.strokeStyle = ac(.10); ctx.lineWidth = 1; arc(ctx, x0, y0, hp[0], hp[1], 16 * u); ctx.stroke(); }
      seenReg[a.origin] = (seenReg[a.origin] || 0) + 1;
    });
    let sel = null;
    Object.entries(seenReg).forEach(([name, n]) => {
      const [rx, ry] = REGIONS[name], x = mx + rx * mw, y = my + ry * mh, on = A && A.origin === name;
      ctx.strokeStyle = on ? ac(.95) : ac(.40); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, (3 + n * 1.2) * u, 0, 7); ctx.stroke();
      ctx.fillStyle = on ? ac(.95) : ac(.5); ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      if (on) { sel = [x, y]; const k = (this.mo * 0.7) % 1; ctx.strokeStyle = ac(0.7 * (1 - k) * (1 - 0.6 * this.q)); ctx.beginPath(); ctx.arc(x, y, (5 + k * 14) * u, 0, 7); ctx.stroke(); }
    });
    if (A && sel) {
      ctx.lineWidth = 1.3; ctx.strokeStyle = ac(.85);
      const [qx, qy] = arc(ctx, sel[0], sel[1], hp[0], hp[1], 26 * u); ctx.setLineDash([3, 3]); ctx.lineDashOffset = -this.mo * 8; ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 3; i++) {
        const [px, py] = qpt(sel[0], sel[1], qx, qy, hp[0], hp[1], mod(this.mo * 0.35 + i / 3, 1));
        ctx.fillStyle = 'rgba(255,225,248,.95)'; ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
    }
    // 守る側（JAPAN）
    ctx.strokeStyle = 'rgba(190,240,255,.95)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(hp[0], hp[1] - 5 * u); ctx.lineTo(hp[0] + 5 * u, hp[1]); ctx.lineTo(hp[0], hp[1] + 5 * u); ctx.lineTo(hp[0] - 5 * u, hp[1]); ctx.closePath(); ctx.stroke();
    const hk = (this.mo * 0.5) % 1; ctx.strokeStyle = `rgba(190,240,255,${0.6 * (1 - hk) * (1 - 0.6 * this.q)})`; ctx.beginPath(); ctx.arc(hp[0], hp[1], (6 + hk * 12) * u, 0, 7); ctx.stroke();
    this.T(HOME.name, hp[0] - 8 * u, hp[1] - 9 * u, { s: 7.5, f: MONO, a: 'right', c: 'rgba(190,240,255,.85)', ls: 1 });
    if (sel) this.T(A.origin, sel[0], sel[1] - 8 * u, { s: 7.5, f: MONO, a: 'center', c: 'rgba(255,200,240,.85)', ls: 0.8 });
    this.mapSel = sel;
    if (this.q < 0.99) {
      const sx = mx + ((this.mo * 0.09) % 1) * mw;
      const sg = ctx.createLinearGradient(sx - 30 * u, 0, sx, 0);
      sg.addColorStop(0, 'rgba(170,215,255,0)'); sg.addColorStop(1, 'rgba(170,215,255,.14)');
      ctx.save(); ctx.globalAlpha = 1 - this.q; ctx.fillStyle = sg; ctx.fillRect(sx - 30 * u, my, 30 * u, mh); ctx.restore();
    }
    ctx.restore();

    // 地域ごとの攻撃者数
    const ry0 = my + mh + 22 * u;
    this.T('ATTRIBUTION', mx - 2, ry0 - 4, { s: 11.5, c: DIM, ls: 1.2 });
    this.w_matrix(mx + mw - 66 * u, ry0 - 15 * u, 12, 2, 5, 5.5 * u);
    const rows = Object.entries(seenReg).sort((p, q) => q[1] - p[1]);
    const rh = Math.min(22 * u, (r.y + r.h - ry0 - 8) / rows.length);
    rows.forEach(([n, c], i) => {
      const y = ry0 + i * rh, on = A && A.origin === n;
      if (on) this.rr(mx - 6, y + 2, mw + 6, rh - 2, 4, HI, ac(.5));
      this.cube(mx + 8 * u, y + rh / 2 + 1, 5 * u, typeCss('ACTOR', on ? 1 : 0.6));
      this.T(n, mx + 24 * u, y + rh / 2 + 4.5 * u, { s: 12 });
      this.T(String(c), mx + mw - 6, y + rh / 2 + 4.5 * u, { s: 12, a: 'right' });
    });
  };

  P.c_alist = function (r) {
    const { state, u, ctx } = this;
    const C = state.cti;
    this.title(r, 'THREAT ACTORS', 's', '脅威主体');
    const sorted = [...C.actors].sort((a, b) => b.sev - a.sev);
    const rh = (this.compact || this.touch ? 28 : 21.5) * u, top = r.y + 62 * u;
    const n = Math.max(3, Math.floor((r.y + r.h - top - 6 - 20 * u) / rh));
    const rows = sorted.slice(0, n);
    if (C.selected >= 0 && !rows.includes(C.actors[C.selected])) rows[n - 1] = C.actors[C.selected];
    ctx.fillStyle = LINE; ctx.fillRect(r.x + 14 * u, r.y + 36 * u, r.w - 28 * u, 1);
    this.T('Actor', r.x + 40 * u, r.y + 55 * u, { s: 11.5, c: DIM });
    this.T('Sev', r.x + r.w - 20 * u, r.y + 55 * u, { s: 11.5, c: DIM, a: 'right' });
    this.hit.alist = rows.map((a, i) => [top + i * rh, top + (i + 1) * rh, a.index]);
    rows.forEach((a, i) => {
      const y = top + i * rh, on = a.index === C.selected;
      if (on) this.rr(r.x + 10 * u, y, r.w - 20 * u, rh - 2, 3, ac(.22), ac(.6));
      this.cube(r.x + 26 * u, y + rh / 2 - 1, 5.2 * u, typeCss('ACTOR', on ? 1 : 0.7));
      ctx.font = `400 ${12 * u}px ${SANS}`;
      this.T(this.fit(a.name, r.w * 0.5 - 40 * u), r.x + 40 * u, y + rh / 2 + 3.5 * u, { s: 12 });
      const bx = r.x + r.w * 0.60, bw = r.w * 0.20;
      ctx.fillStyle = 'rgba(160,190,225,.16)'; ctx.fillRect(bx, y + rh / 2 - 1, bw, 2 * u);
      ctx.fillStyle = a.sev >= 8.5 ? 'rgba(255,205,195,.9)' : ac(.85);
      ctx.fillRect(bx, y + rh / 2 - 1, bw * (a.sev / 10), 2 * u);
      this.T(a.sev.toFixed(1), r.x + r.w - 20 * u, y + rh / 2 + 3.5 * u, { s: 12, a: 'right', c: a.sev >= 8.5 ? '#ffd9d0' : WHITE });
    });
    this.w_dist(r, C.actors.map((a) => a.sev), `${C.actors.length} ACTORS`);
  };

  const TAGC = { IOC: 'IOC', TTP: 'TTP', RPT: 'CAMPAIGN' };
  P.pushIntel = function (d) {
    const acts = this.state.cti.actors, a = acts[(Math.random() * acts.length) | 0];
    const [tag, tpl] = FEED_POOL[(Math.random() * FEED_POOL.length) | 0];
    const tt = a.used.length ? a.used[(Math.random() * a.used.length) | 0] : { id: 'T1059' };
    const msg = tpl.replace('{A}', a.name).replace('{T}', tt.id).replace('{C}', a.campaigns[0].name).replace('{S}', a.sectors[0]);
    this.ilog.unshift({ time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`, tag, msg, actor: a.index, src: a.feed });
    if (this.ilog.length > 14) this.ilog.pop();
  };

  P.c_elog = function (r, t) {
    const { ctx, u } = this;
    this.title(r, 'INTEL FEED', 'x', '情報フィード');
    if (!this.ilog.length) for (let i = 0; i < 9; i++) this.pushIntel(new Date(Date.now() - (9 - i) * 4100));
    if (t - this.lastPush > 2.6) { this.pushIntel(new Date()); this.lastPush = t; }
    const tabs = ['ALL', 'IOC', 'TTP', 'RPT'], tw = (r.w - 32 * u) / 4;
    tabs.forEach((s, i) => {
      const x = r.x + 16 * u + i * tw;
      this.rr(x, r.y + 38 * u, tw - 3, 22 * u, 3, i === 0 ? ac(.22) : 'rgba(120,150,190,.08)', i === 0 ? ac(.55) : LINE);
      this.T(s, x + (tw - 3) / 2, r.y + 53 * u, { s: 11.5, a: 'center', c: i === 0 ? '#fff' : DIM, ls: 0.4 });
    });
    this.w_bars(r.x + 16 * u, r.y + 64 * u, r.w - 32 * u, 8 * u, 9, 34);
    const rh = 19 * u, top = r.y + 78 * u, n = Math.floor((r.y + r.h - top) / rh);
    const slide = (1 - sm((t - this.lastPush) / 0.5)) * -rh;
    this.hit.elog = this.ilog.slice(0, n + 1).map((e, i) => [top + i * rh - 4 * u, top + (i + 1) * rh - 4 * u, e.actor]);
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, top - 8 * u, r.w, r.h); ctx.clip();
    this.ilog.slice(0, n + 1).forEach((e, i) => {
      const y = top + i * rh + 12 * u + slide, a = i === 0 ? sm((t - this.lastPush) / 0.5) : 1;
      ctx.save(); ctx.globalAlpha *= a;
      this.T(e.time, r.x + 16 * u, y, { s: 11.5, f: MONO, c: DIM });
      this.T(e.tag, r.x + 80 * u, y, { s: 10.5, f: MONO, c: typeCss(TAGC[e.tag], 1), ls: 0.6 });
      ctx.font = `400 ${11.5 * u}px ${SANS}`;
      this.T(this.fit(e.msg, r.x + r.w - (r.x + 114 * u) - 12 * u), r.x + 114 * u, y, { s: 11.5, c: 'rgba(205,225,245,.82)' });
      ctx.restore();
    });
    ctx.restore();
  };

  // 攻撃者プロファイル
  P.c_detail = function (r, t) {
    const { ctx, state, u } = this;
    const A = cur(this);
    this.title(r, 'ACTOR PROFILE', '', '攻撃者概要');
    this.ringHud(r.x + 50 * u, r.y + 64 * u, 29 * u, A ? { risk: A.sev } : null, t);
    ctx.font = `400 ${(this.compact ? 20 : 22) * u}px ${SANS}`;
    const nw = A ? ctx.measureText(A.name).width : 0, room = r.w - (this.compact ? 150 : 104) * u, ns = this.compact ? 20 : 22;
    this.T(A ? this.scr(A.name, (t - state.selT) / 0.5 - 0.1, 3) : '—', r.x + 92 * u, r.y + 60 * u, { s: nw > room ? ns * room / nw : ns, w: 400 });
    this.T(A ? `a.k.a. ${A.aliases.join(' / ')}` : '', r.x + 92 * u, r.y + 77 * u, { s: 9.5, c: DIM, ls: 0.6 });
    this.riskShown += ((A ? A.sev : 0) - this.riskShown) * 0.06;
    const rows = A ? [
      ['Origin', A.origin], ['Motive', `${A.motive}（${A.motiveJp}）`], ['First Seen', String(A.since)],
      ['Confidence', A.conf], ['Targets', A.sectors.join(', ')], ['Last Seen', `${A.seen} ago`],
    ] : [];
    const cnt = A ? [['Campaign', A.campaigns.length, 'CAMPAIGN'], ['Malware', A.malware.length, 'MALWARE'], ['TTP', A.used.length, 'TTP'],
      ['IOC', A.iocs.length, 'IOC'], ['Sector', A.sectors.length, 'SECTOR'], ['Active Ops', A.campaigns.filter((c) => c.active).length, 'CAMPAIGN']] : [];
    const ax = this.compact ? r.x + r.w - 16 * u : 0;
    if (this.compact) {
      this.T(this.riskShown.toFixed(1), ax, r.y + 62 * u, { s: 28, a: 'right' });
      this.T('SEVERITY / 10', ax, r.y + 78 * u, { s: 8.5, a: 'right', c: DIM, ls: 1.5 });
      const bw = r.w - 32 * u, by = r.y + 100 * u;
      this.rr(r.x + 16 * u, by, bw, 4 * u, 2, 'rgba(160,190,225,.18)');
      this.rr(r.x + 16 * u, by, Math.max(2, bw * (this.riskShown / 10)), 4 * u, 2, ac(.9));
      const k = Math.min(1, Math.max(0.75, (r.h - 130 * u) / (166 * u)));
      const cw = (r.w - 32 * u) / 2, ch = 30 * u * k, y0 = r.y + 120 * u;
      rows.forEach(([l, v], i) => {
        const x = r.x + 16 * u + (i % 2) * cw, y = y0 + Math.floor(i / 2) * ch;
        this.T(l, x, y, { s: 9.5, c: DIM, ls: 0.6 });
        ctx.font = CJK.test(v) ? `500 ${12.5 * u}px ${SERIF}` : `400 ${12.5 * u}px ${SANS}`;
        this.T(this.scr(this.fit(v, cw - 10 * u), (t - state.selT - 0.15 - i * 0.07) / 0.4, i + 20), x, y + 14 * u, { s: 12.5 });
      });
      const vy = y0 + 3 * ch + 8 * u, tw = (r.w - 32 * u) / 3;
      ctx.fillStyle = LINE; ctx.fillRect(r.x + 14 * u, vy - 12 * u, r.w - 28 * u, 1);
      this.T('ARSENAL', r.x + 16 * u, vy + 4 * u, { s: 11, ls: 0.4 });
      this.T('装備', r.x + 82 * u, vy + 4 * u, { s: 9.5, c: DIM, ls: 2.5 });
      cnt.forEach(([l, v, ty], i) => {
        const x = r.x + 16 * u + (i % 3) * tw, y = vy + 24 * u + Math.floor(i / 3) * ch;
        ctx.fillStyle = typeCss(ty, 0.9); ctx.fillRect(x, y - 13 * u, 14 * u, 1.5 * u);
        this.T(String(v), x, y, { s: 16 });
        this.T(l, x, y + 12 * u, { s: 9, c: DIM, ls: 0.5 });
      });
      return;
    }
    const k = Math.min(1, r.h / (500 * u)), rowH = 23 * u * k, vx = r.x + r.w * 0.42;
    let y = r.y + 104 * u;
    rows.forEach(([l, v], i) => {
      this.T(l, r.x + 16 * u, y + i * rowH, { s: 12.5, c: 'rgba(200,222,245,.82)' });
      ctx.font = CJK.test(v) ? `500 ${12.5 * u}px ${SERIF}` : `400 ${12.5 * u}px ${SANS}`;
      this.T(this.scr(this.fit(v, r.x + r.w - vx - 14 * u), (t - state.selT - 0.15 - i * 0.07) / 0.4, i + 20), vx, y + i * rowH, { s: 12.5 });
    });
    y += rows.length * rowH + 4 * u;
    ctx.fillStyle = LINE; ctx.fillRect(r.x + 14 * u, y - 10 * u, r.w - 28 * u, 1);
    this.T('ARSENAL', r.x + 16 * u, y + 14 * u, { s: 13, ls: 0.3 });
    this.T('装備', r.x + 92 * u, y + 14 * u, { s: 10, c: DIM, ls: 2.5 });
    this.w_matrix(r.x + r.w - 82 * u, y + 3 * u, 12, 2, 11, 5.5 * u);
    y += 36 * u * k;
    cnt.forEach(([l, v, ty], i) => {
      this.cube(r.x + 22 * u, y + i * rowH - 4 * u, 5 * u, typeCss(ty, 0.95));
      this.T(l, r.x + 34 * u, y + i * rowH, { s: 12.5, c: 'rgba(200,222,245,.82)' });
      this.T(String(v), vx + 48 * u, y + i * rowH, { s: 12.5 });
    });
    y += 6 * rowH + 2 * u;
    ctx.fillStyle = LINE; ctx.fillRect(r.x + 14 * u, y - 10 * u, r.w - 28 * u, 1);
    this.T('THREAT SCORE', r.x + 16 * u, y + 14 * u, { s: 13, ls: 0.3 });
    this.w_dial(r.x + r.w - 44 * u, y + 38 * u, 25 * u, this.riskShown / 10, { text: String(Math.round(this.riskShown * 10)), label: 'SEV %' });
    this.T(this.riskShown.toFixed(1), r.x + 16 * u, y + 56 * u * k + 8 * u, { s: 34, w: 400 });
    ctx.font = `400 ${34 * u}px ${SANS}`;
    const sw = ctx.measureText(this.riskShown.toFixed(1)).width;
    this.T('/ 10', r.x + 16 * u + sw + 6 * u, y + 56 * u * k + 8 * u, { s: 17, c: DIM });
    const by = y + 70 * u * k + 8 * u, bw = r.w - 32 * u;
    this.rr(r.x + 16 * u, by, bw, 6 * u, 3, 'rgba(160,190,225,.18)');
    const g = ctx.createLinearGradient(r.x + 16 * u, 0, r.x + 16 * u + bw, 0);
    g.addColorStop(0, ac(.6)); g.addColorStop(1, ac(1));
    this.rr(r.x + 16 * u, by, bw * (this.riskShown / 10), 6 * u, 3, g);
    const sx = r.x + 16 * u + ((this.mo * 0.35) % 1) * bw * (this.riskShown / 10);
    ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - this.q)})`; ctx.fillRect(sx, by, 2 * u, 6 * u);
  };

  // 関連情報: 痕跡・マルウェア・作戦・標的
  P.c_related = function (r) {
    const { ctx, u } = this;
    const A = cur(this);
    this.title(r, 'RELATED INTEL', 'x', '関連情報');
    const items = A ? [
      ...A.iocs.slice(0, 2).map((q) => [`${q.type}  ${q.v}`, 'IOC']),
      [A.malware[0], 'MALWARE'],
      [`${A.campaigns[0].name}  (${A.campaigns[0].year})`, 'CAMPAIGN'],
      [`${A.used.length ? `${A.used[A.used.length - 1].id}  ${TACTICS[A.used[A.used.length - 1].tactic].en}` : '—'}`, 'TTP'],
    ] : [];
    const rh = Math.min(34 * u, (r.h - 60 * u) / 5.4);
    items.forEach(([s, ty], i) => {
      const y = r.y + 44 * u + i * rh;
      ctx.fillStyle = LINE; ctx.fillRect(r.x + 14 * u, y + rh - 3, r.w - 28 * u, 1);
      this.cube(r.x + 28 * u, y + rh / 2 - 2, 8 * u, typeCss(ty, 0.95));
      ctx.font = `400 ${12.5 * u}px ${SANS}`;
      this.T(this.fit(s, r.w - 66 * u - 34 * u), r.x + 48 * u, y + rh / 2 + 3 * u, { s: 12.5 });
      ctx.strokeStyle = typeCss(ty, 0.55); ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 0; k <= 14; k++) {
        const xx = r.x + r.w - 52 * u + k * 2.6 * u, yy = y + rh / 2 + noise(k * 0.7 + i * 3 + this.mo * 1.6) * 4 * u;
        k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
    });
    this.T('...', r.x + 40 * u, r.y + 44 * u + items.length * rh + 6 * u, { s: 13, c: DIM });
    const ny = r.y + r.h - 28 * u;
    if (ny - 18 * u > r.y + 44 * u + items.length * rh + 14 * u) this.w_netFoot(r, ny, 6);
  };
  void hash;
}

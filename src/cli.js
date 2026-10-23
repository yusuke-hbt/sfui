import { STATE_NAMES } from './data.js';
import { DEFS, defOf } from './settings.js';

const PRESETS = ['iso', 'front', 'side', 'top', 'low'];
const FILTERS = ['all', 'crit', 'warn', 'ok', 'off'];
const GRID_RE = /^([a-e])([1-5])$/i;
const cell = (a) => `${'ABCDE'[a.gx]}${a.gz + 1}`;

// 画面下から開くコマンドライン。キー入力・履歴・補完・コマンド実行を受け持ち、描画は overlay.js が行う。
// ctx: { assets, state, controls, input, select(i), toggleFs(), camPreset(name), logout(), uptime(), warnTest() }
// 文字入力は隠し <input>（ctx.input）が受ける。ソフトウェアキーボード・IME・貼り付けがそのまま使え、
// キーイベントではEnter/Tab/矢印/Escなどの操作キーだけを扱う。
export class Cli {
  constructor(ctx) {
    this.c = ctx;
    this.open = false;
    this.input = ctx.input;
    this._buf = '';
    this.input.addEventListener('input', () => {
      this._buf = this.input.value; this.tab = null;
      const n = this._buf.length; this.input.setSelectionRange(n, n);   // カーソルは常に末尾
    });
    this.hist = []; this.hi = -1; this.draft = '';
    this.out = []; this.scroll = 0;
    this.tab = null;
    this.cmds = this.build();
    this.say('ASSET INTELLIGENCE // COMMAND INTERFACE  v0.7', 'ok');
    this.say("'help' でコマンド一覧。TAB で補完、↑↓ で履歴、ESC で閉じる。", 'dim');
  }

  get buf() { return this._buf; }
  set buf(v) { this._buf = v; if (this.input && this.input.value !== v) this.input.value = v; }

  say(s, k = 'info') {
    this.out.push({ s, k });
    if (this.out.length > 300) this.out.shift();
    this.scroll = 0;
  }

  // ---- アセット検索（名前の完全一致 → グリッド座標 C3 → 前方一致 → 部分一致）----
  resolve(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const A = this.c.assets;
    const ex = A.filter((a) => a.name.toLowerCase() === q);
    if (ex.length) return ex;
    const m = q.match(GRID_RE);
    if (m) return A.filter((a) => a.gx === m[1].toLowerCase().charCodeAt(0) - 97 && a.gz === +m[2] - 1);
    const pre = A.filter((a) => a.name.toLowerCase().startsWith(q));
    return pre.length ? pre : A.filter((a) => a.name.toLowerCase().includes(q) || a.label.toLowerCase().includes(q));
  }

  // ---- CTIモード: 攻撃者の検索（名前・別名の前方一致 → 部分一致）----
  resolveActor(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const A = this.c.state.cti.actors, nm = (a) => [a.name, ...a.aliases].map((s) => s.toLowerCase());
    const ex = A.filter((a) => nm(a).includes(q));
    if (ex.length) return ex;
    const pre = A.filter((a) => nm(a).some((s) => s.startsWith(q)));
    return pre.length ? pre : A.filter((a) => nm(a).some((s) => s.includes(q)) || a.stem.toLowerCase().startsWith(q));
  }

  pickActor(q) {
    const r = this.resolveActor(q);
    if (!r.length) { this.say(`no actor matches '${q}'  該当なし`, 'err'); return null; }
    if (r.length > 1) { this.say(`ambiguous '${q}': ${r.slice(0, 6).map((a) => a.name).join(' / ')}`, 'err'); return null; }
    return r[0];
  }

  pick(q) {
    const r = this.resolve(q);
    if (!r.length) { this.say(`no asset matches '${q}'  該当なし`, 'err'); return null; }
    if (r.length > 1) { this.say(`ambiguous '${q}': ${r.slice(0, 8).map((a) => a.name).join(' ')}${r.length > 8 ? ' …' : ''}`, 'err'); return null; }
    return r[0];
  }

  row(a) {
    const k = a.state === 2 ? 'err' : a.state === 1 ? 'warn' : a.state === 3 ? 'dim' : 'info';
    this.say(`${a.name.padEnd(11)}${a.type.padEnd(5)}${STATE_NAMES[a.state].padEnd(10)}${a.risk.toFixed(1).padStart(4)}   ${cell(a)}`, k);
  }

  build() {
    const c = this.c, st = c.state;
    const A = c.assets;
    const cti = () => st.mode === 'cti';
    const setMode = (m) => { if (!c.setMode(m)) return this.say(`already in ${m} mode`, 'info'); this.say(`mode → ${m}  ${m === 'cti' ? '脅威情報（CTI）' : '資産'}`, 'ok'); };
    const AC = st.cti.actors;
    const selA = (a) => { c.selectActor(a.index); this.say(`selected ${a.name}  [${a.motive}]  severity ${a.sev.toFixed(1)}  origin ${a.origin}`, 'ok'); };
    const rowA = (a) => this.say(`${a.name.padEnd(18)}${a.motive.padEnd(12)}${a.sev.toFixed(1).padStart(4)}   ${a.origin}`, a.sev >= 8.5 ? 'err' : 'info');
    const sel = (a) => { c.select(a.index); this.say(`selected ${a.name}  [${STATE_NAMES[a.state]}]  risk ${a.risk.toFixed(1)}  @ ${cell(a)}`, 'ok'); };
    const onoff = (v, cur) => (v === 'on' || v === '1' ? true : v === 'off' || v === '0' ? false : !cur);
    const list = [
      { n: ['help', 'h', '?'], a: '[cmd]', d: 'コマンド一覧 / 個別の説明', run: (x) => {
        if (x[0]) {
          const m = list.find((q) => q.n.includes(x[0].toLowerCase()));
          if (!m) return this.say(`no such command '${x[0]}'`, 'err');
          return this.say(`${m.n.join(' | ')} ${m.a}  —  ${m.d}`, 'info');
        }
        list.forEach((m) => this.say(`${m.n[0].padEnd(10)}${m.a}\t${m.d}`, 'info'));
      }, comp: () => list.map((m) => m.n[0]) },
      { n: ['fullscreen', 'fs'], a: '', d: 'フルスクリーン切り替え', run: () => {
        const on = document.fullscreenElement || document.webkitFullscreenElement;
        if (!c.toggleFs()) return this.say('fullscreen is not supported here  この端末は非対応（共有 → ホーム画面に追加 で全画面化）', 'err');
        this.say(on ? 'leaving fullscreen' : 'entering fullscreen', 'ok');
      } },
      { n: ['select', 'sel', 'cd'], a: '<name|C3>', d: 'アセットを選択（名前・前方一致・グリッド座標）', run: (x) => {
        if (cti()) { const a = x[0] && this.pickActor(x.join(' ')); if (!x[0]) this.say('usage: select <actor>', 'err'); else if (a) selA(a); return; }
        const a = x[0] && this.pick(x[0]); if (!x[0]) this.say('usage: select <name|C3>', 'err'); else if (a) sel(a);
      }, comp: () => (cti() ? AC.map((a) => a.stem.toLowerCase()) : A.map((a) => a.name)) },
      { n: ['next', 'n'], a: '', d: '次のアセットへ', run: () => (cti() ? selA(AC[(Math.max(0, st.cti.selected) + 1) % AC.length]) : sel(A[(Math.max(0, st.selected) + 1) % A.length])) },
      { n: ['prev', 'p'], a: '', d: '前のアセットへ', run: () => (cti() ? selA(AC[(Math.max(0, st.cti.selected) + AC.length - 1) % AC.length]) : sel(A[(Math.max(0, st.selected) + A.length - 1) % A.length])) },
      { n: ['crit', 'c'], a: '', d: 'criticalのアセットを巡回（リスクの高い順）', run: () => {
        if (cti()) {
          const cs = AC.filter((a) => a.sev >= 8.5).sort((p, q) => q.sev - p.sev);
          const i = cs.findIndex((a) => a.index === st.cti.selected);
          return selA(cs[(i + 1) % cs.length]);
        }
        const cs = A.filter((a) => a.state === 2).sort((p, q) => q.risk - p.risk);
        if (!cs.length) return this.say('no critical assets  危険なアセットはありません', 'info');
        const i = cs.findIndex((a) => a.index === st.selected);
        sel(cs[(i + 1) % cs.length]);
      } },
      { n: ['ls', 'list'], a: '[all|crit|warn|ok|off] [n]', d: 'アセットをリスク順に一覧', run: (x) => {
        if (cti()) {
          const n = +(x.find((t) => /^\d+$/.test(t)) || 8), rows = [...AC].sort((p, q) => q.sev - p.sev);
          this.say(`${'ACTOR'.padEnd(18)}${'MOTIVE'.padEnd(12)}${'SEV'.padStart(4)}   ORIGIN`, 'dim');
          rows.slice(0, n).forEach(rowA);
          if (rows.length > n) this.say(`… ${rows.length - n} more  （ls ${rows.length} で全件）`, 'dim');
          return;
        }
        const f = x.find((t) => FILTERS.includes(t.toLowerCase())) || 'all', n = +(x.find((t) => /^\d+$/.test(t)) || 6);
        const want = { crit: 2, warn: 1, ok: 0, off: 3 }[f];
        const rows = A.filter((a) => want === undefined || a.state === want).sort((p, q) => q.risk - p.risk);
        this.say(`${'NAME'.padEnd(11)}${'TYPE'.padEnd(5)}${'STATE'.padEnd(10)}${'RISK'.padStart(4)}   CELL`, 'dim');
        rows.slice(0, n).forEach((a) => this.row(a));
        if (rows.length > n) this.say(`… ${rows.length - n} more  （ls ${f} ${rows.length} で全件）`, 'dim');
      }, comp: () => FILTERS },
      { n: ['mode'], a: '[asset|cti]', d: 'ASSET ⇄ CTI（脅威情報）モード切り替え', run: (x) => {
        const w = (x[0] || '').toLowerCase();
        if (w && w !== 'asset' && w !== 'cti') return this.say('usage: mode [asset|cti]', 'err');
        setMode(w || (st.mode === 'cti' ? 'asset' : 'cti'));
      }, comp: () => ['asset', 'cti'] },
      { n: ['theme'], a: '[ice|amber|auto]', d: '配色テーマ（auto=モードに従う: ASSET=氷青 / CTI=琥珀）', run: (x) => {
        const w = (x[0] || '').toLowerCase();
        if (!['ice', 'amber', 'auto'].includes(w)) return this.say(`usage: theme <ice|amber|auto>   now: ${document.body.dataset.theme || 'ice'}`, 'err');
        c.setSetting('theme', w);
        this.say(`theme → ${document.body.dataset.theme || 'ice'}${w === 'auto' ? '  (follows mode)' : ''}`, 'ok');
      }, comp: () => ['ice', 'amber', 'auto'] },
      { n: ['quiet', 'calm'], a: '[on|off]', d: '静穏モード（点滅・環境アニメ・自動巡回を抑える）', run: (x) => {
        const w = (x[0] || '').toLowerCase();
        if (w && !['on', 'off'].includes(w)) return this.say('usage: quiet [on|off]', 'err');
        const on = w ? w === 'on' : !c.getSetting('quiet');
        c.setSetting('quiet', on);
        this.say(`quiet → ${on ? 'on  静穏（点滅・動きを抑制）' : 'off'}`, 'ok');
      }, comp: () => ['on', 'off'] },
      { n: ['hud', 'hide'], a: '[on|off]', d: 'オーバーレイのパネルを隠す / 戻す（on=隠す。キー H）', run: (x) => {
        const w = (x[0] || '').toLowerCase();
        if (w && !['on', 'off'].includes(w)) return this.say('usage: hud [on|off]   (on = hide panels)', 'err');
        const hide = w ? w === 'on' : !c.getHud();
        c.setHud(hide);
        this.say(`panels → ${hide ? 'hidden  パネルを退避' : 'shown  パネルを表示'}`, 'ok');
      }, comp: () => ['on', 'off'] },
      { n: ['config', 'cfg', 'settings'], a: '', d: '設定画面を開く', run: () => { this.close(); c.openConfig(); } },
      { n: ['set'], a: '[key] [value]', d: '設定の一覧 / 変更（例: set panels off）。`set reset` で初期化', run: (x) => {
        if (!x.length) {
          this.say('key\tvalue', 'dim');
          DEFS.forEach((d) => this.say(`${d.key}\t${c.getSetting(d.key)}   ${d.type === 'choice' ? '(' + d.choices.map(([v]) => v).join('|') + ')' : '(on|off)'}`, 'info'));
          return;
        }
        if (x[0] === 'reset') { c.resetSettings(); return this.say('settings reset', 'ok'); }
        const d = defOf(x[0]);
        if (!d) return this.say(`unknown setting: ${x[0]}   ('set' で一覧)`, 'err');
        const cur = c.getSetting(d.key);
        const v = x[1] === undefined ? (d.type === 'bool' ? (cur ? 'off' : 'on') : null) : x[1].toLowerCase();
        if (v === null) return this.say(`usage: set ${d.key} <${d.choices.map(([q]) => q).join('|')}>   now: ${cur}`, 'err');
        if (d.type === 'bool' && !['on', 'off', '1', '0', 'true', 'false'].includes(v)) return this.say(`usage: set ${d.key} <on|off>`, 'err');
        if (d.type === 'choice' && !d.choices.some(([q]) => q === v)) return this.say(`usage: set ${d.key} <${d.choices.map(([q]) => q).join('|')}>`, 'err');
        c.setSetting(d.key, d.type === 'bool' ? !['off', '0', 'false'].includes(v) : v);
        this.say(`${d.key} → ${c.getSetting(d.key)}`, 'ok');
      }, comp: () => DEFS.map((d) => d.key) },
      { n: ['cti'], a: '', d: 'CTI（脅威情報）モードへ', run: () => setMode('cti') },
      { n: ['asset'], a: '', d: 'ASSET（資産）モードへ', run: () => setMode('asset') },
      { n: ['info', 'i'], a: '[name]', d: 'アセット/攻撃者の詳細（省略時は選択中）', run: (x) => {
        if (cti()) {
          const a = x[0] ? this.pickActor(x.join(' ')) : AC[st.cti.selected];
          if (!a) return x[0] ? undefined : this.say('nothing selected', 'err');
          this.say(`${a.name}  [${a.motive} / ${a.motiveJp}]  severity ${a.sev.toFixed(1)}`, a.sev >= 8.5 ? 'err' : 'ok');
          this.say(`  aka ${a.aliases.join(', ')}   origin ${a.origin}   since ${a.since}   conf ${a.conf}`, 'info');
          this.say(`  targets ${a.sectors.join(', ')}`, 'info');
          this.say(`  malware ${a.malware.join(', ')}`, 'info');
          this.say(`  ops ${a.campaigns.map((q) => `${q.name}${q.active ? '*' : ''}`).join(', ')}   ttp ${a.used.length}   ioc ${a.iocs.length}`, 'info');
          return;
        }
        const a = x[0] ? this.pick(x[0]) : st.selected >= 0 ? A[st.selected] : null;
        if (!a) return x[0] ? undefined : this.say('nothing selected', 'err');
        this.say(`${a.name}  ${a.label}  [${STATE_NAMES[a.state]}]`, a.state === 2 ? 'err' : 'ok');
        this.say(`  ${a.ip}   ${a.os}   ${a.env}`, 'info');
        this.say(`  risk ${a.risk.toFixed(1)}   alerts ${a.alerts}   load ${(a.load * 100).toFixed(0)}%   cell ${cell(a)}`, 'info');
      }, comp: () => (cti() ? AC.map((a) => a.stem.toLowerCase()) : A.map((a) => a.name)) },
      { n: ['cam'], a: `<${PRESETS.join('|')}>`, d: 'カメラを視点プリセットへ移動', run: (x) => {
        const p = (x[0] || '').toLowerCase();
        if (!PRESETS.includes(p)) return this.say(`usage: cam <${PRESETS.join('|')}>`, 'err');
        c.camPreset(p); this.say(`camera → ${p}`, 'ok');
      }, comp: () => PRESETS },
      { n: ['rotate', 'rot'], a: '[on|off]', d: 'カメラの自動回転', run: (x) => { const v = onoff((x[0] || '').toLowerCase(), c.getSetting('autoRotate')); c.setSetting('autoRotate', v); this.say(`auto-rotate ${v ? 'on' : 'off'}`, 'ok'); }, comp: () => ['on', 'off'] },
      { n: ['stats'], a: '[on|off]', d: 'システムステータス（FPS等）の表示', run: (x) => { const v = onoff((x[0] || '').toLowerCase(), c.getSetting('sys')); c.setSetting('sys', v); this.say(`system stats ${v ? 'on' : 'off'}`, 'ok'); }, comp: () => ['on', 'off'] },
      { n: ['warn'], a: '', d: '選択中アセットで警告演出をテスト', run: () => { if (st.selected < 0) return this.say('nothing selected', 'err'); c.warnTest(); this.say('warning sequence', 'ok'); } },
      { n: ['clear', 'cls'], a: '', d: '出力をクリア', run: () => { this.out.length = 0; } },
      { n: ['whoami'], a: '', d: '操作員', run: () => this.say('OP-0417  ANALYST  @ CELL-07', 'info') },
      { n: ['uptime'], a: '', d: '稼働時間', run: () => { const s = Math.floor(c.uptime()); this.say(`up ${Math.floor(s / 60)}m ${s % 60}s   fps ${st.sys.fps.toFixed(0)}   ${st.sys.w}×${st.sys.h}`, 'info'); } },
      { n: ['echo'], a: '<text>', d: '文字列を表示', run: (x) => this.say(x.join(' '), 'info') },
      { n: ['logout'], a: '', d: 'ログイン画面へ戻る', run: () => { this.close(); c.logout(); } },
      { n: ['exit', 'quit', 'q'], a: '', d: 'コマンドラインを閉じる', run: () => this.close() },
    ];
    return list;
  }

  // 開く。ソフトウェアキーボードを出すため、ユーザー操作の中で同期的にフォーカスする。
  openUI() { this.open = true; this.buf = ''; this.input.focus({ preventScroll: true }); }

  close() { this.open = false; this.tab = null; this.input.blur(); }

  exec(line) {
    this.say(`▸ ${line}`, 'in');
    if (line.trim() && this.hist[this.hist.length - 1] !== line) this.hist.push(line);
    this.hi = -1;
    const [name, ...args] = line.trim().split(/\s+/);
    if (!name) return;
    const m = this.cmds.find((q) => q.n.includes(name.toLowerCase()));
    if (!m) return this.say(`command not found: ${name}  コマンドが見つかりません  ('help')`, 'err');
    try { m.run(args); } catch (e) { this.say(`error: ${e.message}`, 'err'); }
  }

  // ---- 補完 ----
  words() {
    const sp = this.buf.split(/\s+/);
    const partial = sp[sp.length - 1];
    return { idx: sp.length - 1, partial, head: this.buf.slice(0, this.buf.length - partial.length), cmd: sp[0].toLowerCase() };
  }

  cands() {
    const { idx, partial, cmd } = this.words();
    let pool = [];
    if (idx === 0) pool = this.cmds.flatMap((m) => m.n).filter((s) => s.length > 1);
    else if (idx === 1) { const m = this.cmds.find((q) => q.n.includes(cmd)); pool = m && m.comp ? m.comp() : []; }
    const p = partial.toLowerCase();
    return [...new Set(pool)].filter((s) => s.toLowerCase().startsWith(p));
  }

  ghost() {
    if (!this.buf) return '';
    const { partial } = this.words();
    const c = this.cands()[0];
    return c && c.length > partial.length ? c.slice(partial.length) : '';
  }

  complete() {
    const cs = this.cands();
    if (!cs.length) return;
    const { partial, head } = this.words();
    if (cs.length === 1) { this.buf = `${head}${cs[0]} `; return; }
    let pre = cs[0];
    for (const s of cs) while (!s.toLowerCase().startsWith(pre.toLowerCase())) pre = pre.slice(0, -1);
    if (pre.length > partial.length) this.buf = head + pre;
    else if (this.tab !== this.buf) { this.say(cs.join('  '), 'dim'); this.tab = this.buf; }
  }

  // キーを処理したら true（呼び出し側が既定動作と他のハンドラを止める）
  key(e) {
    if (e.isComposing) return false;
    if (!this.open) {
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (e.key === ':' || e.key === '/' || e.key === '`') { this.openUI(); return true; }
      if (e.key === '?') { this.openUI(); this.exec('help'); return true; }
      return false;
    }
    const k = e.key;
    if (e.ctrlKey && k === 'l') this.out.length = 0;
    else if (e.ctrlKey && (k === 'u' || k === 'c')) this.buf = '';
    else if (e.ctrlKey || e.metaKey) return false;
    else if (k === 'Escape') this.close();
    else if (k === 'Enter') { const l = this.buf; this.buf = ''; this.exec(l); }
    else if (k === 'Tab') this.complete();
    else if (k === 'ArrowUp' || k === 'ArrowDown') {
      if (!this.hist.length) return true;
      if (this.hi < 0) this.draft = this.buf;
      this.hi = k === 'ArrowUp' ? Math.min(this.hist.length - 1, this.hi + 1) : this.hi - 1;
      this.buf = this.hi < 0 ? this.draft : this.hist[this.hist.length - 1 - this.hi];
      if (this.hi < 0) this.hi = -1;
    } else if (k === 'PageUp') this.scroll = Math.min(Math.max(0, this.out.length - 1), this.scroll + 5);
    else if (k === 'PageDown') this.scroll = Math.max(0, this.scroll - 5);
    else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End') { /* カーソルは末尾固定 */ }
    else return false;   // 文字入力・Backspace・貼り付けは <input> に任せる
    return true;
  }
}

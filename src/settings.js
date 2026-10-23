// 表示オプション。ブラウザの localStorage に保存する。
// すべての入口（設定画面・コマンド・キー・チップ）は settings.set() を通り、反映は main.js の apply() が1か所で行う。

const KEY = 'sfui.settings';

// type: bool | choice。group は設定画面の見出し。
export const DEFS = [
  { key: 'panels', group: 'ASSET', gjp: '資産', label: 'Meta panels', jp: '背面パネル（IP・OS など）', type: 'bool', def: true },
  { key: 'tileNames', group: 'ASSET', gjp: '資産', label: 'Tile name print', jp: 'タイルの名前表示', type: 'bool', def: true },
  { key: 'motes', group: 'ASSET', gjp: '資産', label: 'Rising particles', jp: '立ちのぼる光の粒', type: 'bool', def: true },
  { key: 'graphLabels', group: 'ASSET', gjp: '資産', label: 'Graph labels', jp: 'グラフのラベル', type: 'bool', def: true },

  { key: 'quiet', group: 'MOTION', gjp: '動き', label: 'Quiet mode', jp: '静穏（点滅・動きを抑える）', type: 'bool', def: false },
  { key: 'autoRotate', group: 'MOTION', gjp: '動き', label: 'Camera drift', jp: 'カメラの自動回転', type: 'bool', def: true },
  { key: 'autoCycle', group: 'MOTION', gjp: '動き', label: 'Auto-cycle selection', jp: '選択の自動巡回', type: 'bool', def: true },
  { key: 'events', group: 'MOTION', gjp: '動き', label: 'Live state changes', jp: '状態のランダム変化', type: 'bool', def: true },

  { key: 'deco', group: 'HUD', gjp: '画面装飾', label: 'Rulers & scan line', jp: '端の目盛り・走査光', type: 'bool', def: true },
  { key: 'ring', group: 'HUD', gjp: '画面装飾', label: 'Instrument ring', jp: '背景の計器リング', type: 'bool', def: true },
  { key: 'hex', group: 'HUD', gjp: '画面装飾', label: 'Hex dump columns', jp: '16進ダンプ', type: 'bool', def: true },
  { key: 'readouts', group: 'HUD', gjp: '画面装飾', label: 'Readouts & links', jp: '計器値・接続線', type: 'bool', def: true },
  { key: 'warning', group: 'HUD', gjp: '画面装飾', label: 'Warning banner', jp: '警告バナー', type: 'bool', def: true },
  { key: 'sys', group: 'HUD', gjp: '画面装飾', label: 'System stats', jp: 'FPS などの表示', type: 'bool', def: true },

  { key: 'theme', group: 'LOOK', gjp: '見た目', label: 'Color theme', jp: '配色（auto=モードに従う）', type: 'choice', def: 'auto', choices: [['auto', 'AUTO'], ['ice', 'ICE'], ['amber', 'AMBER']] },
  { key: 'bloom', group: 'LOOK', gjp: '見た目', label: 'Bloom', jp: '発光のにじみ', type: 'choice', def: 'normal', choices: [['off', 'OFF'], ['low', 'LOW'], ['normal', 'MID'], ['high', 'HIGH']] },
  { key: 'grain', group: 'LOOK', gjp: '見た目', label: 'Grain & scanlines', jp: 'ノイズ・走査線', type: 'bool', def: true },

  { key: 'autoRes', group: 'PERFORMANCE', gjp: '性能', label: 'Dynamic resolution', jp: '動的解像度（FPS が落ちたら下げる）', type: 'bool', def: true },
  { key: 'maxPR', group: 'PERFORMANCE', gjp: '性能', label: 'Max pixel ratio', jp: '描画解像度の上限', type: 'choice', def: 'auto', choices: [['auto', 'AUTO'], ['1', '1×'], ['1.5', '1.5×'], ['2', '2×']] },
];

const byKey = Object.fromEntries(DEFS.map((d) => [d.key, d]));
export const defOf = (k) => byKey[k];

const norm = (d, v) => {
  if (d.type === 'bool') return v === true || v === 'on' || v === 'true' || v === '1' || v === 1;
  const s = String(v).toLowerCase();
  return d.choices.some(([c]) => c === s) ? s : d.def;
};

class Settings {
  constructor() {
    this.values = Object.fromEntries(DEFS.map((d) => [d.key, d.def]));
    this.listeners = [];
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      for (const d of DEFS) if (d.key in raw) this.values[d.key] = norm(d, raw[d.key]);
      // 旧版の quiet 単独キー
      if (!('quiet' in raw) && localStorage.getItem('sfui.quiet') === '1') this.values.quiet = true;
    } catch (e) { /* 保存なしで動く */ }
  }

  get(k) { return this.values[k]; }

  // URL の ?quiet=1 のような、保存しない一時的な上書き
  override(k, v) { const d = byKey[k]; if (d) this.values[k] = norm(d, v); }

  set(k, v, quiet) {
    const d = byKey[k];
    if (!d) return false;
    v = norm(d, v);
    if (this.values[k] === v) return true;
    this.values[k] = v;
    this.save();
    if (!quiet) this.listeners.forEach((fn) => fn(k, v));
    return true;
  }

  reset() {
    for (const d of DEFS) this.set(d.key, d.def);
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch (e) { /* 保存できなくても動く */ }
  }

  onChange(fn) { this.listeners.push(fn); }
}

export const settings = new Settings();

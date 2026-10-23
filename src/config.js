import { DEFS, settings } from './settings.js';

// 設定画面。ガラス風のモーダルで、項目は settings.js の DEFS から組み立てる。
export class ConfigScreen {
  constructor() {
    this.open = false;
    const root = this.root = document.createElement('div');
    root.id = 'cfg';
    root.innerHTML = `
      <div class="cfg-back"></div>
      <div class="cfg-frame"><div class="cfg-body">
        <div class="cfg-head"><span class="cfg-sq"></span><span class="en">CONFIG</span><span class="jp">設定</span><button class="cfg-x" tabindex="-1" aria-label="close">✕</button></div>
        <div class="cfg-list"></div>
        <div class="cfg-foot"><span class="note">設定はこのブラウザに保存されます ／ saved in this browser</span><button class="cfg-reset" tabindex="-1">RESET ／ 初期化</button></div>
      </div></div>`;
    document.body.appendChild(root);
    this.list = root.querySelector('.cfg-list');
    this.ctrls = {};
    let group = null;
    for (const d of DEFS) {
      if (d.group !== group) {
        group = d.group;
        const h = document.createElement('div');
        h.className = 'cfg-group'; h.innerHTML = `<span>${d.group}</span><i>${d.gjp}</i>`;
        this.list.appendChild(h);
      }
      const row = document.createElement('div');
      row.className = 'cfg-row';
      row.innerHTML = `<div class="lb"><b>${d.label}</b><i>${d.jp}</i></div>`;
      const ctl = document.createElement('div');
      ctl.className = d.type === 'bool' ? 'cfg-sw' : 'cfg-seg';
      if (d.type === 'bool') {
        ctl.innerHTML = '<span class="knob"></span><span class="st"></span>';
        row.addEventListener('click', () => settings.set(d.key, !settings.get(d.key)));
      } else {
        d.choices.forEach(([v, name]) => {
          const b = document.createElement('button');
          b.dataset.v = v; b.textContent = name; b.tabIndex = -1;
          b.addEventListener('click', (e) => { e.stopPropagation(); settings.set(d.key, v); });
          ctl.appendChild(b);
        });
      }
      row.appendChild(ctl);
      this.list.appendChild(row);
      this.ctrls[d.key] = ctl;
    }
    root.querySelector('.cfg-back').addEventListener('pointerdown', () => this.hide());
    root.querySelector('.cfg-x').addEventListener('click', () => this.hide());
    root.querySelector('.cfg-reset').addEventListener('click', () => settings.reset());
    // 下のキャンバスにタッチ・ホイールを渡さない
    root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    settings.onChange(() => this.sync());
    this.sync();
  }

  sync() {
    for (const d of DEFS) {
      const v = settings.get(d.key), ctl = this.ctrls[d.key];
      if (d.type === 'bool') { ctl.classList.toggle('on', !!v); ctl.querySelector('.st').textContent = v ? 'ON' : 'OFF'; }
      else ctl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    }
  }

  show() { this.open = true; this.root.classList.add('open'); this.sync(); this.list.scrollTop = 0; }
  hide() { this.open = false; this.root.classList.remove('open'); }
  toggle() { this.open ? this.hide() : this.show(); }
}

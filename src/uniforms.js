import { Vector2, Vector3 } from 'three';

// 全マテリアルで共有するユニフォーム。{ value } の参照を共有するので、ここを書き換えれば全シェーダーに反映される。
export const U = {
  uTime: { value: 0 },
  // 環境アニメ用の時計（quiet では減速して止まる）と、quiet の度合い（0=通常 〜 1=静穏）
  uMT: { value: 0 },
  uQuiet: { value: 0 },
  // すりガラスのパネル用: シーンをぼかした像と、描画バッファの大きさ(px)
  uBlur: { value: null },
  uRes: { value: new Vector2(1, 1) },
  uBoot: { value: 0 },
  uPR: { value: 1 },
  uAspect: { value: 1.78 },
  uSelA: { value: -1 },
  uSelT: { value: 99 },
  uPrevA: { value: -1 },
  uPrevT: { value: 99 },
  uSelPos: { value: new Vector2() },
  uHoverA: { value: -1 },
  uHoverK: { value: 0 },
  uHoverPos: { value: new Vector2() },
  // 背景色の変換行列（テーマ切り替え用。ice は単位行列）と最終段の色味
  uBgR: { value: new Vector3(1, 0, 0) },
  uBgG: { value: new Vector3(0, 1, 0) },
  uBgB: { value: new Vector3(0, 0, 1) },
  uTint: { value: new Vector3(0, 0.004, 0.008) },
};

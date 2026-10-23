import {
  BackSide, BoxGeometry, Color, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene, ShaderMaterial,
} from 'three';
import { U } from './uniforms.js';

// 背景色の関数。背景そのものと、不透明な床（屈折の元になる）が同じ関数で描くので継ぎ目が出ない。
export const BG_GLSL = /* glsl */`
uniform vec3 uBgR, uBgG, uBgB;
float bgH21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 bgColor(vec2 uv, float aspect, float t){
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec3 col = mix(vec3(0.002, 0.005, 0.009), vec3(0.006, 0.015, 0.026), smoothstep(1., 0.25, uv.y));
  col += vec3(0.006, 0.016, 0.027) * exp(-pow((uv.y - 0.50) / 0.16, 2.));
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float sc = 6. + fl * 8.;
    vec2 g = p * sc + vec2(t * 0.015 * (fl + 1.), fl * 5.);
    vec2 id = floor(g), f = fract(g) - .5;
    float r = bgH21(id + fl * 17.);
    vec2 off = (vec2(bgH21(id + 3.1), bgH21(id + 7.7)) - .5) * .5;
    float d = length(f - off);
    float rad = .12 + .24 * bgH21(id + 1.3);
    float disc = smoothstep(rad, rad * .6, d) * (.45 + .55 * smoothstep(rad * .6, rad, d));
    float band = exp(-pow((uv.y - 0.50 - 0.05 * fl) / (0.06 + 0.035 * fl), 2.));
    float on = step(.72, r);
    vec3 tint = bgH21(id + 9.) < .6 ? vec3(1., .60, .24) : vec3(.55, .78, 1.);
    col += tint * disc * on * band * (0.15 - fl * 0.03);
  }
  return vec3(dot(col, uBgR), dot(col, uBgG), dot(col, uBgB));   // テーマの色変換（ice は単位行列）
}`;

// 画面固定の背景。暗い霞と、地平付近に並ぶ暖色・寒色のボケ光。
export class Backdrop {
  constructor(scene) {
    this.mesh = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
      uniforms: { uTime: U.uMT, uAspect: U.uAspect, uBgR: U.uBgR, uBgG: U.uBgG, uBgB: U.uBgB },
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.); }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uAspect; varying vec2 vUv;
        ${BG_GLSL}
        void main(){ gl_FragColor = vec4(bgColor(vUv, uAspect, uTime), 1.); }`,
      depthTest: false, depthWrite: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);
  }
}

// ガラスに映り込ませる環境。暗い空間にソフトボックス（面光源）を並べ、面取り部に細長い光の帯が走るようにする。
export function buildEnvironment(renderer) {
  const env = new Scene();
  env.add(new Mesh(new BoxGeometry(60, 40, 60), new MeshBasicMaterial({ color: 0x02060c, side: BackSide })));
  const panel = (w, h, color, gain, pos, rot) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(gain), side: BackSide }));
    m.position.set(...pos); m.rotation.set(...rot);
    env.add(m);
  };
  panel(22, 12, 0xffffff, 4, [0, 18, 0], [Math.PI / 2, 0, 0]);          // 天井の大きな面光源
  panel(3, 26, 0xa8d8ff, 3.5, [-22, 4, 4], [0, Math.PI / 2, 0]);          // 左の縦ストリップ
  panel(3, 26, 0xd8efff, 3.5, [22, 4, -6], [0, -Math.PI / 2, 0]);         // 右の縦ストリップ
  panel(30, 2.2, 0xffffff, 3, [0, 6, -26], [0, 0, 0]);                  // 奥の横ストリップ
  panel(9, 4, 0xff9a4a, 3, [14, 2, 24], [0, Math.PI, 0]);               // 手前の暖色アクセント
  panel(16, 2, 0x9fd0ff, 3, [-8, 1, 26], [0, Math.PI, 0]);              // 手前の寒色ストリップ
  const pmrem = new PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}

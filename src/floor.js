import { Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { U } from './uniforms.js';
import { GRID, SPACING, TILE } from './data.js';
import { BG_GLSL } from './stage.js';

const N = GRID * GRID;

const VERT = /* glsl */`
varying vec3 vW;
varying vec4 vClip;
void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; vClip = gl_Position; }`;

// 床は1枚のワイヤーフレーム: 細かい格子、区画間を結ぶ点線、交点、外枠、アセット下の光だまり。
const FRAG = /* glsl */`
#define N ${N}
#define SP ${SPACING.toFixed(2)}
#define TH ${(TILE / 2).toFixed(2)}
#define HALF ${((GRID - 1) / 2 * SPACING + 0.05).toFixed(2)}
#define EDGE ${(GRID * SPACING / 2).toFixed(2)}
uniform float uTime, uMT, uQuiet, uBoot, uSelT, uSelA, uAspect;
uniform vec2 uSelPos;
uniform vec3 uAP[N];
uniform vec3 uAC[N];
varying vec3 vW;
varying vec4 vClip;
${BG_GLSL}
const vec3 ICE = vec3(0.62, 0.80, 0.98);
float lineAA(float d, float w){ return 1. - clamp(abs(d) / max(w, 1e-4), 0., 1.); }
void main(){
  vec2 p = vW.xz;
  float L = length(p);
  float bd = max(abs(p.x), abs(p.y));
  float fade = smoothstep(EDGE + 7., EDGE, bd);
  float rv0 = (uBoot - 0.2) * 7.0;
  float rev = smoothstep(rv0, rv0 - 3.0, L);

  vec2 cc = floor(p / SP + .5) * SP;
  vec2 q = abs(p - cc);
  float inField = step(abs(cc.x), HALF) * step(abs(cc.y), HALF);
  float underTile = inField * step(q.x, TH + 0.05) * step(q.y, TH + 0.05);

  // 細かい格子
  vec2 gp = p / 0.75;
  vec2 g = abs(fract(gp - .5) - .5) / max(fwidth(gp), vec2(1e-4));
  float fine = 1. - min(min(g.x, g.y), 1.);

  // 区画の境界に沿った点線の接続線と、交点のノード
  vec2 mp = p / SP + .5;
  vec2 fr = fract(mp);
  vec2 dEdge = min(fr, 1. - fr) * SP;
  float wv = fwidth(p.x) * 1.3;
  float lineV = lineAA(dEdge.x, wv) * step(fract(p.y * 1.3), 0.55);
  float lineH = lineAA(dEdge.y, wv) * step(fract(p.x * 1.3), 0.55);
  float inside = step(bd, EDGE + 0.01);
  float conn = max(lineV, lineH) * inside;
  float phase = (lineV > lineH ? p.y : p.x) * 0.5;
  float pulse = pow(.5 + .5 * sin(phase * 1.3 - uMT * 1.2 + floor(dot(floor(mp), vec2(3., 7.))) * 2.3), 12.) * (1. - uQuiet);
  float node = smoothstep(0.17, 0.05, length((mp - floor(mp + .5)) * SP)) * inside;

  // フィールドの外枠
  float frame = lineAA(bd - EDGE, fwidth(bd) * 1.3);

  // 不透明な床（ガラスの屈折像に入る）。遠方は背景色へ溶けて継ぎ目を消す
  vec3 bg = bgColor(vClip.xy / vClip.w * .5 + .5, uAspect, uMT);
  vec3 col = mix(bg, vec3(0.003, 0.007, 0.012), smoothstep(EDGE + 14., EDGE, bd) * 0.92);
  col += vec3(0.20, 0.34, 0.46) * fine * 0.05 * fade * (1. - underTile * 0.9);
  col += ICE * conn * (0.16 + pulse * 0.45);
  col += ICE * node * 0.45;
  col += ICE * frame * 0.25;

  for (int i = 0; i < N; i++) {
    vec2 d = p - uAP[i].xy;
    float d2 = dot(d, d);
    if (d2 < 14.) col += uAC[i] * exp(-d2 * 1.6) * uAP[i].z * 0.025;
  }
  float ring = exp(-pow((length(p - uSelPos) - uSelT * 10.) / 0.16, 2.)) * exp(-uSelT * 0.6) * step(-0.5, uSelA);
  col += vec3(0.30, 0.90, 1.0) * ring * 0.30;
  float sc = fract(uMT / 9.) * 34.;
  col += vec3(0.10, 0.50, 0.70) * exp(-pow((L - sc) / 0.30, 2.)) * 0.08 * fade * (1. - uQuiet);

  col = mix(bg, col, rev);
  gl_FragColor = vec4(col, 1.);
}`;

export class Floor {
  constructor(scene, assets) {
    this.assets = assets;
    this.ap = assets.map(() => new Vector3());
    this.ac = assets.map(() => new Vector3());
    this.mesh = new Mesh(new PlaneGeometry(160, 160).rotateX(-Math.PI / 2), new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { ...U, uAP: { value: this.ap }, uAC: { value: this.ac } },
      depthWrite: false, depthTest: false,
    }));
    this.mesh.renderOrder = -5;
    scene.add(this.mesh);
    this.update();
  }

  update() {
    this.assets.forEach((a, i) => {
      this.ap[i].set(a.x, a.z, a.load);
      this.ac[i].set(a.color[0], a.color[1], a.color[2]);
    });
  }
}

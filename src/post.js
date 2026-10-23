import { HalfFloatType, LinearFilter, ShaderMaterial, Vector2, WebGLRenderTarget } from 'three';
import { U } from './uniforms.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

// 色収差・ビネット・粒子・走査線を最終段で重ねる
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: 1 }, uTint: U.uTint, uQuiet: U.uQuiet, uFx: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uAspect, uQuiet, uFx; uniform vec3 uTint; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - .5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= 1.0 - smoothstep(0.12, 0.62, r2) * 0.78;
      col += (h(vUv * 900. + fract(uTime) * 100.) - .5) * mix(0.035, 0.008, uQuiet) * uFx;
      col *= 1.0 - 0.035 * uFx + 0.035 * uFx * sin(vUv.y * 1100.);
      col += uTint;
      gl_FragColor = vec4(col, 1.);
    }`,
};


// ここまでに描いた画面を 1/4 に縮めてぼかし、U.uBlur に置く。すりガラスのパネルが、その像を地に使う。
const QUAD_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
class BlurCapture extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
    const mk = () => new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
    this.a = mk(); this.b = mk();
    // 縮小: 双線形の4点で 4x4 を平均する
    this.down = new FullScreenQuad(new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new Vector2() } }, vertexShader: QUAD_VERT,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uTexel; varying vec2 vUv;
        void main(){ vec3 c = vec3(0.);
          for (int i = 0; i < 4; i++) { vec2 o = vec2(float(i & 1) * 2. - 1., float(i >> 1) * 2. - 1.) * uTexel; c += texture2D(tDiffuse, vUv + o).rgb; }
          gl_FragColor = vec4(min(c * 0.25, vec3(4.)), 1.); }`,
    }));
    this.blur = new FullScreenQuad(new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new Vector2() } }, vertexShader: QUAD_VERT,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270;
          c += (texture2D(tDiffuse, vUv + uDir * 1.3846).rgb + texture2D(tDiffuse, vUv - uDir * 1.3846).rgb) * 0.3162162;
          c += (texture2D(tDiffuse, vUv + uDir * 3.2308).rgb + texture2D(tDiffuse, vUv - uDir * 3.2308).rgb) * 0.0702703;
          gl_FragColor = vec4(c, 1.); }`,
    }));
    U.uBlur.value = this.b.texture;
  }

  setSize(w, h) {
    const bw = Math.max(1, Math.floor(w / 4)), bh = Math.max(1, Math.floor(h / 4));
    this.a.setSize(bw, bh); this.b.setSize(bw, bh);
    this.down.material.uniforms.uTexel.value.set(0.5 / bw, 0.5 / bh);
    this.texel = [1 / bw, 1 / bh];
  }

  render(renderer, writeBuffer, readBuffer) {
    const du = this.down.material.uniforms, bu = this.blur.material.uniforms, [tx, ty] = this.texel || [1, 1];
    du.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.a); this.down.render(renderer);
    // 横→縦を2回: 強めのぼかし
    for (let i = 0; i < 2; i++) {
      bu.tDiffuse.value = this.a.texture; bu.uDir.value.set(tx * 1.6, 0);
      renderer.setRenderTarget(this.b); this.blur.render(renderer);
      bu.tDiffuse.value = this.b.texture; bu.uDir.value.set(0, ty * 1.6);
      renderer.setRenderTarget(this.a); this.blur.render(renderer);
    }
    // 結果は a にある。パネルが読む b へ写す代わりに参照を差し替える
    U.uBlur.value = this.a.texture;
  }
}

export function createComposer(renderer, scene, camera, plateScene) {
  const size = renderer.getSize(new Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // すりガラスのパネル: 描いた画面をぼかして撮り、その上にパネルだけを（深度を保ったまま）重ねる
  const plates = [new BlurCapture(), new RenderPass(plateScene, camera)];
  plates[1].clear = false;
  plates.forEach((q) => composer.addPass(q));
  const bloom = new UnrealBloomPass(size, 0.18, 0.4, 0.5);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const fin = new ShaderPass(FinalShader);
  composer.addPass(fin);
  return { composer, bloom, fin, plates };
}

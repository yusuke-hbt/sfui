import { DirectionalLight, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { U } from './uniforms.js';
import { makeAssets, riskFor, GRID } from './data.js';
import { AssetField } from './assets.js';
import { Floor } from './floor.js';
import { ThreatGraph } from './graph.js';
import { CtiView } from './cti.js';
import { makeActors } from './cti-data.js';
import { applyTheme } from './theme.js';
import { Overlay } from './overlay.js';
import { settings } from './settings.js';
import { ConfigScreen } from './config.js';
import { Login } from './login.js';
import { Cli } from './cli.js';
import { createComposer } from './post.js';
import { Backdrop, buildEnvironment } from './stage.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('gl');
const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x010508, 1);
const scene = new Scene();
scene.environment = buildEnvironment(renderer);
// 面取り部に鋭いハイライトを出すための補助光
const key = new DirectionalLight(0xdff0ff, 2.4); key.position.set(-6, 12, 8);
const rim = new DirectionalLight(0x9fd0ff, 1.6); rim.position.set(9, 6, -7);
scene.add(key, rim);
const camera = new PerspectiveCamera(30, 1, 0.1, 200);
camera.position.set(31, 19, 38);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 22; controls.maxDistance = 70;
controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.42;
controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
controls.target.set(0, 3.0, 0);

const assets = makeAssets();
const backdrop = new Backdrop(scene);
const field = new AssetField(scene, assets);
const floor = new Floor(scene, assets);
const graph = new ThreatGraph(scene, document.getElementById('labels'));
const actors = makeActors();
const cti = new CtiView(scene, document.getElementById('labels'), actors);
renderer.info.autoReset = false;   // ポストプロセスの複数パスを合算して1フレーム分の描画量を測る
const sys = { fps: 0, ms: 0, calls: 0, tris: 0, geo: 0, w: 0, h: 0, dpr: 1, mem: 0, hist: [], n: 0, acc: 0 };
const state = { mode: 'asset', cti: { actors, selected: -1, view: cti }, assets, selected: -1, graph, events: [], cam: { az: 0, dist: 40, tx: 0, tz: 0, pol: 1 }, lock: null, selT: 0, warn: null, sys };
// QUIET: 点滅・環境アニメ・自動巡回を抑える。度合い(quiet: 0〜1)は滑らかに動き、時計(mo)は減速して止まる。
if (params.has('quiet')) settings.override('quiet', params.get('quiet') !== '0');   // 保存しない一時的な指定
let quietGoal = settings.get('quiet') ? 1 : 0;
state.quiet = quietGoal; state.mo = 0; state.quietOn = !!quietGoal; state.cfg = settings.values;
const cfgScreen = new ConfigScreen();
const overlay = new Overlay(document.getElementById('overlay'), state, document.getElementById('glass'));
// ログイン画面から始める。?skip=N（検証用）のときは省略して起動演出を N 秒進めた状態で始める。
let started = params.has('skip');
let loginT = 0;
const loginRoot = document.getElementById('login');
const login = started ? null : new Login(loginRoot, document.getElementById('loginCv'), document.getElementById('loginGlass'), () => { started = true; field.group.visible = true; clockT = 0; lastInteract = 0; overlay.chips.style.visibility = 'visible'; });
if (started) loginRoot.style.display = 'none';
overlay.chips.style.visibility = started ? 'visible' : 'hidden';   // 操作チップはログイン後だけ
field.group.visible = started;   // ログイン中は背景だけを見せる
const { composer, bloom, fin, plates } = createComposer(renderer, scene, camera, field.plateScene);

// タッチ端末は描画解像度を抑え、FPSが落ちたら段階的に下げる（余裕が戻れば戻す）
const touch = matchMedia('(pointer: coarse)').matches;
const autoResParam = params.get('autores') !== '0';
const prCapOf = () => { const m = settings.get('maxPR'); return m === 'auto' ? (touch ? 1.5 : 2) : Number(m); };
const prFloor = touch ? 0.75 : 1;
let pixelRatio = Math.min(devicePixelRatio || 1, prCapOf()), lowN = 0, highN = 0;
function applyPR() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(pixelRatio); renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio); composer.setSize(w, h);
  bloom.resolution.set(w, h);
  U.uPR.value = pixelRatio;
  U.uRes.value.set(Math.floor(w * pixelRatio), Math.floor(h * pixelRatio));
}
// 縦長の画面ほどカメラを引いて、フィールドの幅を収める
let camScale = 1;
function fitCamera(aspect) {
  // 縦長ほど引く。横長でも小さい画面（スマホ横持ち）は3Dを大きく見せるため寄る
  const f = aspect < 1 ? 1.4 : aspect < 1.2 ? 1.15 : innerWidth < 900 ? 0.92 : 1;
  if (f === camScale) return;
  camera.position.sub(controls.target).multiplyScalar(f / camScale).add(controls.target);
  camScale = f; controls.minDistance = 22 * Math.min(1, f); controls.maxDistance = 70 * Math.max(1, f);
}
function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  applyPR();
  camera.aspect = aspect;
  camera.fov = aspect < 1 ? 50 : aspect < 1.2 ? 42 : 30;
  fitCamera(aspect);
  U.uAspect.value = aspect;
  camera.updateProjectionMatrix();
  overlay.resize();
  if (login) login.resize();
}
addEventListener('resize', resize);
resize();

// 狭い画面では、パネルを避けた領域の中央に3Dが来るよう投影をずらす（シートの出し入れに合わせて滑らかに動く）
const view = { x: 0, y: 0 };
function updateView(dt) {
  const tx = overlay.compact ? innerWidth / 2 - (overlay.cx0 + overlay.cx1) / 2 : 0;
  const ty = overlay.compact ? innerHeight / 2 - (overlay.top + overlay.zb) / 2 : 0;
  const k = Math.min(1, dt * 6);
  view.x += (tx - view.x) * k; view.y += (ty - view.y) * k;
  if (!overlay.compact && Math.abs(view.x) + Math.abs(view.y) < 0.5) { if (camera.view && camera.view.enabled) { camera.clearViewOffset(); } view.x = view.y = 0; return; }
  camera.setViewOffset(innerWidth, innerHeight, view.x, view.y, innerWidth, innerHeight);   // 窓を右・下へずらすと、像は左・上へ動く
}

// ---- 選択 ----
const camGoal = new Vector3(0, 3.0, 0);
function select(i) {
  if (i === state.selected) return;
  U.uPrevA.value = U.uSelA.value; U.uPrevT.value = U.uSelT.value;
  U.uSelA.value = i; U.uSelT.value = 0;
  const a = assets[i];
  U.uSelPos.value.set(a.x, a.z);
  state.selected = i;
  graph.show(a, assets);
  state.selT = clockT;
  if (a.state === 2) state.warn = { t: clockT, name: a.name, risk: a.risk };
  camGoal.set(a.x * 0.3, 3.2, a.z * 0.3);
  lastInteract = clockT;
}

// CTIモード: 攻撃者を選ぶ（左のレールの1体。作戦・マルウェア・手口・痕跡・標的が展開する）
function selectActor(i, force) {
  if (i === state.cti.selected && !force) return;
  const a = actors[i];
  state.cti.selected = i;
  cti.select(i);
  state.selT = clockT;
  if (a.sev >= 8.5) state.warn = { t: clockT, name: a.name, risk: a.sev, label: 'CRITICAL ACTOR', jp: '脅威度' };
  lastInteract = clockT;
}

// ---- 入力 ----
const ray = new Raycaster();
const ndc = new Vector2();
let hoverIdx = -1, down = null, pointerMoved = false, lastInteract = 0;
function pick(e) {
  if (state.mode === 'cti') return cti.pickScreen(e.clientX, e.clientY, camera, innerWidth, innerHeight, e.pointerType === 'touch' ? 40 : 28);
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(field.hitMeshes, false)[0];
  return hit ? hit.object.userData.index : -1;
}
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;   // タッチにホバーは無い
  pointerMoved = true; hoverIdx = pick(e); canvas.style.cursor = hoverIdx >= 0 ? 'pointer' : 'crosshair';
  if (state.mode === 'cti') hoverIdx = -1;   // 床のホバー演出はアセット用
});
// タップで選択。2本指（ピンチ）やドラッグはカメラ操作として扱い、選択しない。
const ptrs = new Set();
let multi = false;
canvas.addEventListener('pointerdown', (e) => { ptrs.add(e.pointerId); if (ptrs.size > 1) multi = true; else down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  ptrs.delete(e.pointerId);
  if (!ptrs.size) {
    const tol = e.pointerType === 'touch' ? 14 : 5;
    if (!multi && down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < tol) {
      const i = pick(e);
      if (i >= 0) { (state.mode === 'cti' ? selectActor : select)(i); if (e.pointerType === 'touch' && navigator.vibrate) navigator.vibrate(8); }
    }
    down = null; multi = false;
  }
  lastInteract = clockT;
});
canvas.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) { down = null; multi = false; } });
// 長押しメニュー・iOSのページ拡大を抑える
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (!started || cli.open || cfgScreen.open) return;
  if (state.mode === 'cti') {
    const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (d) selectActor((Math.max(0, state.cti.selected) + d + actors.length) % actors.length);
    return;
  }
  if (state.selected < 0) return;
  const a = assets[state.selected];
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!d) return;
  const gx = a.gx + d[0], gz = a.gz + d[1];
  if (gx >= 0 && gx < GRID && gz >= 0 && gz < GRID) select(gz * GRID + gx);
});

// ---- 時間 ----
let clockT = Number(params.get('skip') || 0);
let last = performance.now();
let booted = false;
const hoverAnim = { idx: -1 };
let azC = Math.atan2(camera.position.x, camera.position.z);
const PRESETS = { iso: [31, 19, 38], front: [0, 11, 46], side: [46, 11, 0], top: [8, 46, 10], low: [30, 5, 36] };
// CTIは横に長い構図なので、少し引いた視点を基準にする
const CTI_PRESETS = { iso: [34, 19, 42], front: [0, 12, 52], side: [46, 11, 0], top: [8, 46, 10], low: [28, 5, 36] };
let camTween = null, rotDir = 1;

function dataStep(dt) {
  for (const a of assets) {
    a.loadPhase += dt;
    if (a.state === 3) { a.load = 0.05 + 0.03 * Math.sin(a.loadPhase * 2); continue; }
    const base = a.state === 2 ? 0.88 : a.state === 1 ? 0.7 : 0.5;
    const target = base + 0.28 * Math.sin(a.loadPhase * 0.7) * Math.sin(a.loadPhase * 0.23 + a.index) * (1 - state.quiet);
    a.load += (Math.min(1, Math.max(0.1, target)) - a.load) * Math.min(1, dt * 2);
  }
}

// 数秒ごとにランダムなアセットの状態が変わる（データ連動の微細な動き）
let nextEvent = 6;
function events() {
  if (!settings.get('events') || clockT < nextEvent) return;
  nextEvent = clockT + (5 + Math.random() * 6) * (quietGoal ? 4 : 1);
  const a = assets[(Math.random() * assets.length) | 0];
  a.targetState = a.targetState === 0 ? (Math.random() < 0.5 ? 1 : 2) : 0;
  a.state = a.targetState;
  a.risk = riskFor(a.state);
  a.alerts = a.state === 2 ? 3 : a.state === 1 ? 1 : 0;
  state.events.push({ t: clockT, asset: a });
  field.refreshMeta(a.index);   // 背景パネルの RISK / ALERT を更新
}

// 選択中アセットの画面座標と見かけの半径（2Dのロックオン照準用）
const lockP = new Vector3(), lockE = new Vector3(), camRight = new Vector3();
function updateLock() {
  if (state.mode === 'cti') {
    const n = cti.on && cti.graph.hubNode;
    if (!n || state.cti.selected < 0) { state.lock = null; return; }
    const w = innerWidth, h = innerHeight;
    lockP.copy(n.pos).applyMatrix4(cti.graph.group.matrixWorld).project(camera);
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    lockE.copy(n.pos).applyMatrix4(cti.graph.group.matrixWorld).addScaledVector(camRight, 1.4).project(camera);
    state.lock = { x: (lockP.x * 0.5 + 0.5) * w, y: (-lockP.y * 0.5 + 0.5) * h, r: Math.hypot((lockE.x - lockP.x) * 0.5 * w, (lockE.y - lockP.y) * 0.5 * h) };
    return;
  }
  if (state.selected < 0) { state.lock = null; return; }
  const a = assets[state.selected], w = innerWidth, h = innerHeight;
  lockP.set(a.x, a.height * 0.4, a.z).project(camera);
  camRight.setFromMatrixColumn(camera.matrixWorld, 0);
  lockE.set(a.x, a.height * 0.4, a.z).addScaledVector(camRight, 1.7).project(camera);
  state.lock = { x: (lockP.x * 0.5 + 0.5) * w, y: (-lockP.y * 0.5 + 0.5) * h, r: Math.hypot((lockE.x - lockP.x) * 0.5 * w, (lockE.y - lockP.y) * 0.5 * h) };
}

// 0.5秒ごとにFPSを平均し、描画量・解像度・メモリとあわせて state.sys に書く
function sample(raw) {
  if (raw > 2) { renderer.info.reset(); return; }   // タブが隠れていた等の長い空白は計測しない
  const i = renderer.info;
  sys.calls = i.render.calls; sys.tris = i.render.triangles; sys.geo = i.memory.geometries;
  i.reset();
  sys.n++; sys.acc += raw;
  if (sys.acc < 0.5) return;
  sys.fps = sys.n / sys.acc; sys.ms = (sys.acc / sys.n) * 1000; sys.n = 0; sys.acc = 0;
  sys.hist.push(sys.fps); if (sys.hist.length > 40) sys.hist.shift();
  sys.w = innerWidth; sys.h = innerHeight; sys.dpr = renderer.getPixelRatio();
  sys.mem = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0;
  // 動的解像度: 2秒続けて30fps未満なら一段下げ、10秒続けて余裕があれば一段戻す
  if (!autoResParam || !settings.get('autoRes')) return;
  if (sys.fps < 30) { lowN++; highN = 0; } else if (sys.fps > 56) { highN++; lowN = 0; } else { lowN = highN = 0; }
  if (lowN >= 4 && pixelRatio > prFloor) { pixelRatio = Math.max(prFloor, pixelRatio - 0.25); lowN = 0; applyPR(); }
  else if (highN >= 20 && pixelRatio < Math.min(devicePixelRatio || 1, prCapOf())) { pixelRatio = Math.min(Math.min(devicePixelRatio || 1, prCapOf()), pixelRatio + 0.25); highN = 0; applyPR(); }
}

// ---- フルスクリーン（ボタン / Fキー）----
const fsBtn = document.getElementById('fsBtn');
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const fsOK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);   // iPhone のSafariは非対応
if (!fsOK) document.body.classList.add('nofs');
const toggleFs = () => {
  if (!fsOK) return false;
  if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else { const el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen; Promise.resolve(f.call(el)).catch(() => {}); }
  return true;
};
fsBtn.addEventListener('mousedown', (e) => e.preventDefault());   // フォーカスを奪わない（Enterで再発火させない）
fsBtn.addEventListener('click', toggleFs);
// ボタンは「アイコン + 文字」。狭い画面ではCSSで文字を隠してアイコンだけにする
const btnHtml = (ic, tx) => `<span class="ic">${ic}</span><span class="tx"> ${tx}</span>`;
const fsLabel = () => { fsBtn.innerHTML = fsEl() ? btnHtml('⤡', 'EXIT FULLSCREEN ／ 全画面解除') : btnHtml('⤢', 'FULLSCREEN ／ 全画面'); fsBtn.title = fsEl() ? '全画面解除' : '全画面'; };
fsLabel();
document.addEventListener('fullscreenchange', fsLabel);
document.addEventListener('webkitfullscreenchange', fsLabel);
addEventListener('keydown', (e) => { if (started && !cli.open && !cfgScreen.open && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'f' || e.key === 'F')) toggleFs(); });

function frame(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.25, raw); last = now;
  const qd = quietGoal - state.quiet;
  state.quiet = Math.abs(qd) < 0.003 ? quietGoal : state.quiet + qd * Math.min(1, dt * 2.2);
  state.mo += dt * (1 - state.quiet);
  U.uQuiet.value = state.quiet; U.uMT.value = state.mo;
  for (const q of plates) q.enabled = field.group.visible && settings.get('panels');   // すりガラスのパネルはASSETモードだけ
  if (!started) {
    // 認証前: 本編の時計は止めたまま、暗い背景だけを描いてログイン画面を重ねる
    loginT += dt; U.uTime.value = loginT; U.uBoot.value = 0;
    composer.render(); sample(raw); login.draw(loginT);
    requestAnimationFrame(frame); return;
  }
  clockT += dt;
  U.uTime.value = clockT; U.uBoot.value = clockT;
  U.uSelT.value += dt; U.uPrevT.value += dt;

  if (!booted && clockT > 4.2) { booted = true; if (state.mode === 'asset') select(24); }
  if (booted && !quietGoal && settings.get('autoCycle') && clockT - lastInteract > 24) {
    if (state.mode === 'cti') selectActor((state.cti.selected + 1 + ((Math.random() * (actors.length - 1)) | 0)) % actors.length);
    else {
      const crit = assets.filter((a) => a.state === 2 && a.index !== state.selected);
      select(crit.length && Math.random() < 0.5 ? crit[(Math.random() * crit.length) | 0].index : (Math.random() * assets.length) | 0);
    }
  }

  // ホバー
  if (hoverIdx !== hoverAnim.idx) {
    U.uHoverK.value = Math.max(0, U.uHoverK.value - dt * 8);
    if (U.uHoverK.value <= 0.02) {
      hoverAnim.idx = hoverIdx; U.uHoverA.value = hoverIdx;
      if (hoverIdx >= 0) U.uHoverPos.value.set(assets[hoverIdx].x, assets[hoverIdx].z);
    }
  } else if (hoverIdx >= 0) U.uHoverK.value = Math.min(1, U.uHoverK.value + dt * 6);

  if (state.mode === 'cti') cti.update(dt, camera, innerWidth, innerHeight);
  else {
    dataStep(dt); events();
    field.syncDynamic(dt); floor.update(); field.panelSolo(overlay.compact);
    graph.update(dt, camera, innerWidth, innerHeight);
  }

  updateView(dt);
  controls.target.lerp(camGoal, Math.min(1, dt * 1.6));
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt / 1.4);
    const k = camTween.t * camTween.t * (3 - 2 * camTween.t);
    camera.position.lerpVectors(camTween.from, camTween.to, k);
    if (camTween.t >= 1) { azC = Math.atan2(camTween.to.x, camTween.to.z); camTween = null; }
  }
  // 構図を保つため、自動回転は一定の範囲で往復させる
  const az = controls.getAzimuthalAngle();
  if (az > azC + 0.32) rotDir = 1; else if (az < azC - 0.32) rotDir = -1;
  controls.autoRotateSpeed = rotDir * 0.35 * (1 - state.quiet);
  controls.update();
  state.cam.az = controls.getAzimuthalAngle();
  state.cam.dist = camera.position.distanceTo(controls.target);
  state.cam.tx = controls.target.x; state.cam.tz = controls.target.z;
  state.cam.pol = controls.getPolarAngle();
  fin.uniforms.uTime.value = state.mo;

  composer.render();
  sample(raw);
  updateLock();
  overlay.draw(clockT);
  requestAnimationFrame(frame);
}
// ---- モード（ASSET ⇄ CTI）----
const modeBtn = document.getElementById('modeBtn');
const modeLabel = () => { modeBtn.innerHTML = state.mode === 'cti' ? btnHtml('◈', 'ASSET MODE ／ 資産') : btnHtml('◈', 'CTI MODE ／ 脅威情報'); modeBtn.title = state.mode === 'cti' ? '資産モードへ' : '脅威情報モードへ'; };
// テーマは既定でモードに従う（ASSET=氷青 / CTI=琥珀 Amber Atlas）。`theme` コマンドで固定もできる。
let themePin = null;
function setTheme(name) {
  themePin = name === 'auto' ? null : name;
  const t = themePin || (state.mode === 'cti' ? 'amber' : 'ice');
  const changed = applyTheme(t);
  if (changed) {
    overlay.modeSwitch(clockT);
    if (state.mode === 'cti' && state.cti.selected >= 0) selectActor(state.cti.selected, true);   // 色は生成時に焼くので組み直す
  }
  return t;
}
function setMode(m) {
  if (m === state.mode) return false;
  const c = m === 'cti';
  state.mode = m; state.lock = null; state.warn = null;
  field.group.visible = !c && started; floor.mesh.visible = !c;
  graph.setVisible(!c); cti.setVisible(c);   // 3Dの切り替えを先に済ませる（配色で失敗しても画面の組が食い違わないように）
  try { applyTheme(themePin || (c ? 'amber' : 'ice')); } catch (e) { console.error('theme', e); }
  overlay.modeSwitch(clockT);
  if (c) {
    camGoal.set(0, 4.5, 0);
    selectActor(state.cti.selected >= 0 ? state.cti.selected : 1, true);
  } else if (state.selected >= 0) {
    const a = assets[state.selected];
    camGoal.set(a.x * 0.3, 3.2, a.z * 0.3); graph.show(a, assets); state.selT = clockT;
  } else camGoal.set(0, 3.0, 0);
  camTween = { from: camera.position.clone(), to: new Vector3(...(c ? CTI_PRESETS : PRESETS).iso).multiplyScalar(camScale), t: 0 };
  lastInteract = clockT;
  modeLabel();
  return true;
}
modeBtn.addEventListener('mousedown', (e) => e.preventDefault());
modeBtn.addEventListener('click', () => started && setMode(state.mode === 'cti' ? 'asset' : 'cti'));
modeLabel();
addEventListener('keydown', (e) => { if (started && !cli.open && !cfgScreen.open && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'm' || e.key === 'M')) setMode(state.mode === 'cti' ? 'asset' : 'cti'); });

// ---- 設定（settings.js）の反映。すべての入口が settings.set() を通り、ここで実際の表示に反映する ----
const quietBtn = document.getElementById('quietBtn');
const cfgBtn = document.getElementById('cfgBtn');
const hudBtn = document.getElementById('hudBtn');
const quietLabel = () => { quietBtn.innerHTML = quietGoal ? btnHtml('◉', 'QUIET ON ／ 静穏') : btnHtml('◌', 'QUIET ／ 静穏'); quietBtn.title = '静穏モード'; quietBtn.classList.toggle('on', !!quietGoal); };
// パネルの一括退避（HUD を隠す）。保存はしない一時的な状態。
const hudLabel = () => { const h = overlay.isHudHidden(); hudBtn.innerHTML = btnHtml(h ? '◧' : '▤', h ? 'PANELS OFF ／ 退避中' : 'PANELS ／ 表示'); hudBtn.title = 'パネルを隠す / 戻す (H)'; hudBtn.classList.toggle('on', h); };
const hudToggle = (v) => { overlay.setHud(v === undefined ? !overlay.isHudHidden() : v); hudLabel(); overlay.placeChips(); };
const BLOOM = { off: 0, low: 0.08, normal: 0.18, high: 0.34 };
function apply(key, v) {
  switch (key) {
    case 'quiet':
      quietGoal = v ? 1 : 0; state.quietOn = !!v;
      lastInteract = clockT;   // 解除した直後に自動巡回が走らないように
      quietLabel(); overlay.placeChips(); break;
    case 'autoRotate': controls.autoRotate = !!v; break;
    case 'motes': field.motes.visible = !!v; break;
    case 'tileNames': field.labels.visible = !!v; break;
    case 'graphLabels': graph.labelsOn = cti.graph.labelsOn = !!v; break;
    case 'theme': setTheme(v); break;
    case 'bloom': bloom.strength = params.has('bloom') ? Number(params.get('bloom')) : BLOOM[v]; break;
    case 'grain': fin.uniforms.uFx.value = v ? 1 : 0; break;
    case 'maxPR': case 'autoRes':   // 上限を変えた／動的解像度を切ったら、基準の解像度に戻す
      if (key === 'maxPR' || !v) { pixelRatio = Math.min(devicePixelRatio || 1, prCapOf()); applyPR(); }
      break;
    default: break;   // panels / autoCycle / events / deco / ring / hex / readouts / warning / sys は描画側が値を直接読む
  }
}
settings.onChange(apply);
const quietToggle = () => settings.set('quiet', !settings.get('quiet'));
quietBtn.addEventListener('mousedown', (e) => e.preventDefault());
quietBtn.addEventListener('click', () => started && quietToggle());
cfgBtn.addEventListener('mousedown', (e) => e.preventDefault());
hudBtn.addEventListener('mousedown', (e) => e.preventDefault());
hudBtn.addEventListener('click', () => started && hudToggle());
hudLabel();
cfgBtn.addEventListener('click', () => started && cfgScreen.toggle());
addEventListener('keydown', (e) => {
  if (!started || cli.open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (cfgScreen.open) { if (e.key === 'Escape') cfgScreen.hide(); return; }
  if (e.key === 'q' || e.key === 'Q') quietToggle();
  else if (e.key === 'c' || e.key === 'C') cfgScreen.show();
  else if (e.key === 'h' || e.key === 'H') hudToggle();
});

// ---- コマンドライン ----
const t0 = performance.now();
function logout() {
  if (!login) { cli.say('logout is unavailable with ?skip', 'err'); return; }
  cfgScreen.hide();
  if (state.mode === 'cti') setMode('asset');
  started = false; booted = false; clockT = 0; nextEvent = 6; hoverIdx = -1; hoverAnim.idx = -1;
  state.selected = -1; state.lock = null; state.warn = null;
  U.uSelA.value = -1; U.uPrevA.value = -1; U.uHoverA.value = -1;
  graph.dispose(); graph.pending = null; graph.beamAssets = [];
  field.group.visible = false; overlay.chips.style.visibility = 'hidden';
  overlay.reset(); login.reset(loginT); hudLabel();
}
const cli = new Cli({
  assets, state, controls, input: document.getElementById('cliIn'),
  select, toggleFs, logout,
  uptime: () => (performance.now() - t0) / 1000,
  warnTest: () => { const a = assets[state.selected]; state.warn = { t: clockT, name: a.name, risk: a.risk }; },
  camPreset: (name) => { camTween = { from: camera.position.clone(), to: new Vector3(...(state.mode === 'cti' ? CTI_PRESETS : PRESETS)[name]).multiplyScalar(camScale), t: 0 }; lastInteract = clockT; },
  setMode: (m) => setMode(m), selectActor, setTheme,
  getSetting: (k) => settings.get(k), setSetting: (k, v) => settings.set(k, v), resetSettings: () => settings.reset(), openConfig: () => cfgScreen.show(),
  getHud: () => overlay.isHudHidden(), setHud: (v) => hudToggle(v),
});
state.cli = cli;
// タッチ操作の入口（overlay.js の操作チップ・一覧タップから呼ばれる）
state.ui = {
  nav: (d) => (state.mode === 'cti'
    ? selectActor((Math.max(0, state.cti.selected) + d + actors.length) % actors.length)
    : select(state.selected < 0 ? 0 : (state.selected + d + assets.length) % assets.length)),
  mode: () => setMode(state.mode === 'cti' ? 'asset' : 'cti'),
  quiet: quietToggle,
  hud: () => hudToggle(),
  config: () => cfgScreen.toggle(),
  pick: (i) => { (state.mode === 'cti' ? selectActor : select)(i); if (touch && navigator.vibrate) navigator.vibrate(8); },
  cmd: () => (cli.open ? cli.close() : cli.openUI()),
  fs: toggleFs,
};
// 開いている間はキーをすべてコマンドラインが受ける（他のショートカットより先に捕まえる）
addEventListener('keydown', (e) => {
  if (!started || cfgScreen.open) return;
  if (cli.open && document.activeElement !== cli.input) cli.input.focus({ preventScroll: true });   // この打鍵がそのまま入力される
  if (cli.key(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

for (const [k, v] of Object.entries(settings.values)) apply(k, v);   // 保存された設定を反映
requestAnimationFrame(frame);

if (params.get('mode') === 'cti') setMode('cti');   // 検証用: ?mode=cti でCTIから始める
window.__sfui = { overlay, hudToggle, select, selectActor, setMode, setQuiet: (on) => settings.set('quiet', on), settings, cfgScreen, state, camera, controls, cli, field };

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── DOM ─────────────────────────────────────────────────────────
const viewer      = document.getElementById('viewer');
const angleSlider = document.getElementById('angle-slider');
const angleValue  = document.getElementById('angle-value');
const axisSelect  = document.getElementById('axis-select');

// ── Quantum State ────────────────────────────────────────────────
let numQubits = 1;
let state = initState(1);

function initState(n) {
  return Array.from({ length: 1 << n }, (_, i) =>
    i === 0 ? math.complex(1, 0) : math.complex(0, 0)
  );
}

function normalizeState() {
  let norm = 0;
  for (const c of state) norm += c.abs() ** 2;
  norm = Math.sqrt(norm);
  state = state.map(c => c.div(norm));
}

// 2×2 게이트를 큐빗 k (0 = 왼쪽/MSB)에 적용
function applyGateTo(gate, k) {
  const bit  = numQubits - 1 - k;
  const size = 1 << numQubits;
  const next = state.map(() => math.complex(0, 0));
  for (let i = 0; i < size; i++) {
    if ((i >> bit) & 1) continue;
    const j = i | (1 << bit);
    next[i] = gate[0][0].mul(state[i]).add(gate[0][1].mul(state[j]));
    next[j] = gate[1][0].mul(state[i]).add(gate[1][1].mul(state[j]));
  }
  state = next;
  normalizeState();
}

function applyCNOT(ctrl, tgt) {
  const ctrlBit = numQubits - 1 - ctrl;
  const tgtBit  = numQubits - 1 - tgt;
  const next = [...state];
  for (let i = 0; i < (1 << numQubits); i++) {
    if (((i >> ctrlBit) & 1) && !((i >> tgtBit) & 1)) {
      const j = i | (1 << tgtBit);
      [next[i], next[j]] = [next[j], next[i]];
    }
  }
  state = next;
}

// 큐빗 k의 축소밀도행렬 → 블로흐 벡터
function qubitBloch(k) {
  const bit = numQubits - 1 - k;
  let rho00 = 0, rho11 = 0, re01 = 0, im01 = 0;
  for (let i = 0; i < (1 << numQubits); i++) {
    if ((i >> bit) & 1) continue;
    const a = state[i], b = state[i | (1 << bit)];
    rho00 += a.abs() ** 2;
    rho11 += b.abs() ** 2;
    const ab = a.mul(b.conjugate());
    re01 += ab.re;
    im01 += ab.im;
  }
  return { x: 2 * re01, y: -2 * im01, z: rho00 - rho11 };
}

function measureAll() {
  let r = Math.random(), cum = 0, outcome = state.length - 1;
  for (let i = 0; i < state.length; i++) {
    cum += state[i].abs() ** 2;
    if (r < cum) { outcome = i; break; }
  }
  state = state.map((_, i) => i === outcome ? math.complex(1, 0) : math.complex(0, 0));
  return outcome;
}

// ── Gates ────────────────────────────────────────────────────────
const gates = {
  X: [[math.complex(0,0), math.complex(1,0)], [math.complex(1,0), math.complex(0,0)]],
  Y: [[math.complex(0,0), math.complex(0,-1)], [math.complex(0,1), math.complex(0,0)]],
  Z: [[math.complex(1,0), math.complex(0,0)], [math.complex(0,0), math.complex(-1,0)]],
  H: [[math.complex(1/Math.SQRT2,0), math.complex(1/Math.SQRT2,0)],
      [math.complex(1/Math.SQRT2,0), math.complex(-1/Math.SQRT2,0)]],
  S: [[math.complex(1,0), math.complex(0,0)], [math.complex(0,0), math.complex(0,1)]],
  T: [[math.complex(1,0), math.complex(0,0)],
      [math.complex(0,0), math.complex(Math.cos(Math.PI/4), Math.sin(Math.PI/4))]],
};

function rotationGate(axis, angle) {
  const c = Math.cos(angle / 2), s = Math.sin(angle / 2);
  const mi = math.complex(0, -1), pi = math.complex(0, 1);
  if (axis === 'X') return [[math.complex(c,0), math.complex(0,-s)], [math.complex(0,-s), math.complex(c,0)]];
  if (axis === 'Y') return [[math.complex(c,0), math.complex(-s,0)], [math.complex(s,0), math.complex(c,0)]];
  return [[math.exp(mi.mul(angle/2)), math.complex(0,0)], [math.complex(0,0), math.exp(pi.mul(angle/2))]];
}

// ── Three.js ─────────────────────────────────────────────────────
const SPHERE_R   = 1.6;
const SPACING    = 4.4;
const ARROW_NORM = SPHERE_R / 1.27; // 화살표 끝이 구 표면에 닿도록

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02050a, 0.025);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
camera.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(0x02050a); // fog 색과 동일 → 원거리 오브젝트가 자연스럽게 소멸
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(viewer.clientWidth, viewer.clientHeight);
viewer.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x5a7bff, 0.45));
const ptLight = new THREE.PointLight(0xffffff, 1.2);
ptLight.position.set(4, 4, 4);
scene.add(ptLight);

const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, {
  enableDamping: true, dampingFactor: 0.08,
  minDistance: 2, maxDistance: 40,
  autoRotate: true, autoRotateSpeed: 0.7,
});

// ── Bloch Sphere Factory ──────────────────────────────────────────
const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffbb44, emissiveIntensity: 0.5 });

// 캔버스 텍스처 → Sprite: CSS 오버레이 없이 WebGL 안에서 렌더링
function makeTextSprite(text, { color = '#aac4ff', bg = 'rgba(6,12,28,0.75)', size = 0.45 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fs = 36;
  ctx.font = `bold ${fs}px "JetBrains Mono", monospace`;
  const tw = ctx.measureText(text).width;
  const px = 14, py = 8;
  canvas.width  = tw + px * 2;
  canvas.height = fs + py * 2;
  ctx.font = `bold ${fs}px "JetBrains Mono", monospace`;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, px, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set((canvas.width / canvas.height) * size, size, 1);
  return sprite;
}

function makeRing(color, rotZ = 0) {
  const pts = Array.from({ length: 121 }, (_, i) => {
    const a = (i / 120) * Math.PI * 2;
    return new THREE.Vector3(SPHERE_R * Math.cos(a), 0, SPHERE_R * Math.sin(a));
  });
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, opacity: 0.7, transparent: true })
  );
  if (rotZ) line.rotation.z = rotZ;
  return line;
}

function makeBlochGroup(offsetX, qubitIdx) {
  const g = new THREE.Group();
  g.position.x = offsetX;

  // 반투명 구
  g.add(new THREE.Mesh(
    new THREE.SphereGeometry(SPHERE_R, 64, 64),
    new THREE.MeshPhongMaterial({ color: 0x11224a, transparent: true, opacity: 0.2, shininess: 55, side: THREE.FrontSide, depthWrite: false })
  ));

  // 적도(XZ) + 자오선(YZ) 원
  g.add(makeRing(0x6693ff));
  g.add(makeRing(0x88c0ff, Math.PI / 2));

  // 축
  const axes = new THREE.AxesHelper(2.3);
  axes.material.depthTest = false;
  axes.material.transparent = true;
  axes.material.opacity = 0.8;
  g.add(axes);

  // 화살표
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 28), arrowMat);
  shaft.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 28), arrowMat);
  head.position.y = 1.15;
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 20), arrowMat);
  tail.position.y = -0.08;
  tail.scale.set(1, 0.7, 1);
  arrow.add(shaft, head, tail);
  g.add(arrow);

  // 극·축 레이블 (Sprite → WebGL 내에서 렌더, 잔상 없음)
  const lN = makeTextSprite('|0⟩'); lN.position.set(0,  2.15, 0);
  const lS = makeTextSprite('|1⟩'); lS.position.set(0, -2.15, 0);
  const lX = makeTextSprite('X', { color: '#ff6060', size: 0.32 }); lX.position.set(2.7, 0, 0);
  const lY = makeTextSprite('Y', { color: '#60ff60', size: 0.32 }); lY.position.set(0, 0, 2.7);
  g.add(lN, lS, lX, lY);

  // 큐빗 번호 (다중 큐빗 시에만 표시)
  const lQ = makeTextSprite(`Q${qubitIdx}`, { color: '#fff', bg: 'rgba(42,92,255,0.75)' });
  lQ.position.set(0, 2.7, 0);
  lQ.name = 'qlabel';
  g.add(lQ);

  scene.add(g);
  return { group: g, arrow };
}

// ── Scene 관리 ───────────────────────────────────────────────────
let blochGroups = [];

function setupScene() {
  blochGroups.forEach(({ group }) => scene.remove(group));
  blochGroups = [];

  const totalW = (numQubits - 1) * SPACING;
  for (let k = 0; k < numQubits; k++) {
    blochGroups.push(makeBlochGroup(-totalW / 2 + k * SPACING, k));
  }

  blochGroups.forEach(({ group }) => {
    const lq = group.getObjectByName('qlabel');
    if (lq) lq.visible = numQubits > 1;
  });

  const z = [5, 9, 13][numQubits - 1];
  camera.position.set(0, 1, z);
  controls.minDistance = z * 0.35;
  controls.maxDistance = z * 3;
}

// ── 화면 갱신 ────────────────────────────────────────────────────
const UP = new THREE.Vector3(0, 1, 0);

function updateDisplay() {
  blochGroups.forEach(({ arrow }, k) => {
    const b = qubitBloch(k);
    const v = new THREE.Vector3(b.x, b.z, b.y); // Bloch z → Three.js Y
    const purity = v.length();
    if (purity < 0.001) {
      arrow.visible = false;
    } else {
      arrow.visible = true;
      v.normalize();
      arrow.quaternion.setFromUnitVectors(UP, v);
      arrow.scale.setScalar(ARROW_NORM * purity); // 얽힘 시 짧아짐
    }
    arrow.position.set(0, 0, 0);
  });
  updateStateTable();
}

function fmtC(c) {
  return `${c.re.toFixed(2)}${c.im >= 0 ? '+' : '−'}${Math.abs(c.im).toFixed(2)}i`;
}

function updateStateTable() {
  const tbody = document.getElementById('state-tbody');
  tbody.innerHTML = '';
  state.forEach((amp, i) => {
    const ket  = '|' + i.toString(2).padStart(numQubits, '0') + '⟩';
    const prob = (amp.abs() ** 2 * 100).toFixed(1) + '%';
    const tr   = document.createElement('tr');
    tr.innerHTML = `<td>${ket}</td><td>${fmtC(amp)}</td><td>${prob}</td>`;
    tbody.appendChild(tr);
  });
}

// ── 예제 프리셋 ──────────────────────────────────────────────────
const PRESETS = {
  1: [
    { name: '중첩',    desc: 'H 게이트 → 화살표가 적도(+X)로 이동. 측정하면 0과 1이 50:50',
      fn: () => applyGateTo(gates.H, 0) },
    { name: 'Y축 중첩', desc: 'RY(90°) → 화살표가 +Y축으로 이동',
      fn: () => applyGateTo(rotationGate('Y', Math.PI / 2), 0) },
  ],
  2: [
    { name: '벨 상태',  desc: 'H→CNOT 순서로 적용. 두 큐빗이 얽혀 화살표가 사라짐\n(측정하면 항상 00 또는 11)',
      fn: () => { applyGateTo(gates.H, 0); applyCNOT(0, 1); } },
    { name: '전체 중첩', desc: 'H⊗H → 4가지 결과가 각각 25%',
      fn: () => { applyGateTo(gates.H, 0); applyGateTo(gates.H, 1); } },
  ],
  3: [
    { name: 'GHZ 상태',  desc: 'H→CNOT→CNOT. 세 큐빗 모두 얽힘\n→ 화살표 셋 다 사라짐\n(측정 시 항상 000 또는 111)',
      fn: () => { applyGateTo(gates.H, 0); applyCNOT(0, 1); applyCNOT(0, 2); } },
    { name: '전체 중첩',  desc: 'H⊗H⊗H → 8가지 결과가 각각 12.5%\n각 화살표가 독립적으로 +X축',
      fn: () => { for (let k = 0; k < 3; k++) applyGateTo(gates.H, k); } },
  ],
};

function updatePresets() {
  const section = document.getElementById('presets-section');
  const list = PRESETS[numQubits] || [];
  section.innerHTML =
    `<h2>예제 — 눌러서 시작</h2>` +
    `<div class="button-row preset-row">` +
    list.map((p, i) => `<button class="preset-btn" data-idx="${i}">${p.name}</button>`).join('') +
    `</div>` +
    `<p id="preset-desc"></p>`;

  section.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = list[parseInt(btn.dataset.idx)];
      state = initState(numQubits);
      p.fn();
      updateDisplay();
      section.querySelector('#preset-desc').textContent = p.desc;
    });
  });
}

// ── UI 헬퍼 ─────────────────────────────────────────────────────
function targetQubit() {
  return parseInt(document.getElementById('target-qubit').value) || 0;
}

function rebuildSelectors() {
  const opts = Array.from({ length: numQubits },
    (_, k) => `<option value="${k}">Q${k}</option>`).join('');
  document.getElementById('target-qubit').innerHTML = opts;
  const ctrl = document.getElementById('cnot-ctrl');
  const tgt  = document.getElementById('cnot-tgt');
  ctrl.innerHTML = opts;
  tgt.innerHTML  = opts;
  if (numQubits > 1) tgt.selectedIndex = 1;
  document.getElementById('cnot-section').style.display = numQubits > 1 ? '' : 'none';
  updatePresets();
}

// ── 이벤트 ──────────────────────────────────────────────────────
document.querySelectorAll('input[name="nqubits"]').forEach(r => {
  r.addEventListener('change', () => {
    numQubits = parseInt(r.value);
    state = initState(numQubits);
    setupScene();
    rebuildSelectors();
    updateDisplay();
  });
});

document.querySelectorAll('button[data-gate]').forEach(btn => {
  btn.addEventListener('click', () => {
    const g = btn.dataset.gate, k = targetQubit();
    if (g === 'RX') applyGateTo(rotationGate('X', Math.PI / 2), k);
    else if (g === 'RY') applyGateTo(rotationGate('Y', Math.PI / 2), k);
    else applyGateTo(gates[g], k);
    updateDisplay();
  });
});

document.getElementById('reset').addEventListener('click', () => {
  state = initState(numQubits);
  updateDisplay();
});

document.getElementById('measure').addEventListener('click', () => {
  const outcome = measureAll();
  updateDisplay();
  alert(`측정 결과: |${outcome.toString(2).padStart(numQubits, '0')}⟩`);
});

document.getElementById('apply-cnot').addEventListener('click', () => {
  const ctrl = parseInt(document.getElementById('cnot-ctrl').value);
  const tgt  = parseInt(document.getElementById('cnot-tgt').value);
  if (ctrl === tgt) return alert('제어와 타겟 큐빗이 같습니다.');
  applyCNOT(ctrl, tgt);
  updateDisplay();
});

document.getElementById('apply-rotation').addEventListener('click', () => {
  applyGateTo(rotationGate(axisSelect.value, Number(angleSlider.value) * Math.PI / 180), targetQubit());
  updateDisplay();
});

angleSlider.addEventListener('input', () => {
  angleValue.textContent = `${angleSlider.value}°`;
});

// ── 렌더 루프 ────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = viewer.clientWidth / viewer.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewer.clientWidth, viewer.clientHeight);
});

// ── 초기화 ───────────────────────────────────────────────────────
camera.aspect = viewer.clientWidth / viewer.clientHeight;
camera.updateProjectionMatrix();
setupScene();
rebuildSelectors(); // 내부에서 updatePresets() 호출
updateDisplay();
animate();

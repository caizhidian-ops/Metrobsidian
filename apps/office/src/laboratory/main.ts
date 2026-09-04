import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type LabView = 'overview' | 'compute' | 'library';

interface ViewPreset {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const LAB_SCENE = {
  id: 'hailan-computational-lab',
  kind: 'interior-room',
  route: '/laboratory.html',
  size: [24, 9, 18],
  focalZones: ['compute-cluster', 'research-library'],
  performance: { maxPixelRatio: 1.5, shadowMap: 1024 },
} as const;

const mount = requireElement<HTMLElement>('#lab-scene');
const overlay = requireElement<HTMLElement>('#shelf-overlay');
const shelfFrame = requireElement<HTMLIFrameElement>('#complete-shelf');
const openShelfButton = requireElement<HTMLButtonElement>('#open-shelf');
const closeShelfButton = requireElement<HTMLButtonElement>('#close-shelf');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111b24);
scene.fog = new THREE.Fog(0x111b24, 28, 58);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
const views: Record<LabView, ViewPreset> = {
  overview: {
    position: new THREE.Vector3(17.5, 11.8, 21),
    target: new THREE.Vector3(0, 3.1, -1.8),
  },
  compute: {
    position: new THREE.Vector3(5.5, 6.4, 12.8),
    target: new THREE.Vector3(-5.2, 2.5, -3.4),
  },
  library: {
    position: new THREE.Vector3(13.5, 6.2, 8.5),
    target: new THREE.Vector3(7.1, 3, -7.2),
  },
};
camera.position.copy(views.overview.position);

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch {
  showWebglFallback();
  throw new Error('WebGL renderer unavailable.');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LAB_SCENE.performance.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', '计算科学实验室三维场景');
mount.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minDistance = 9;
controls.maxDistance = 42;
controls.minPolarAngle = Math.PI * 0.15;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.copy(views.overview.target);

const palette = {
  shell: 0x17242e,
  shellDark: 0x0b1218,
  floor: 0x26343d,
  steel: 0x354650,
  steelLight: 0x65747c,
  glass: 0x8db3bd,
  orange: 0xc87046,
  orangeLight: 0xf0a676,
  cream: 0xe8e1d5,
  blue: 0x62a9c4,
  green: 0x67c08b,
  red: 0xd76355,
  wood: 0x6f4934,
  bookNavy: 0x172d48,
  bookOrange: 0xc85b31,
};

const mats = {
  shell: standard(palette.shell, 0.78, 0.08),
  shellDark: standard(palette.shellDark, 0.62, 0.18),
  floor: standard(palette.floor, 0.8, 0.12),
  steel: standard(palette.steel, 0.42, 0.62),
  steelLight: standard(palette.steelLight, 0.4, 0.5),
  orange: standard(palette.orange, 0.52, 0.12),
  cream: standard(palette.cream, 0.84, 0.02),
  wood: standard(palette.wood, 0.66, 0.04),
  black: standard(0x090d11, 0.45, 0.45),
  screen: new THREE.MeshStandardMaterial({ color: 0x183849, emissive: palette.blue, emissiveIntensity: 0.82, roughness: 0.32 }),
  warmScreen: new THREE.MeshStandardMaterial({ color: 0x48251c, emissive: palette.orange, emissiveIntensity: 0.75, roughness: 0.35 }),
  glass: new THREE.MeshPhysicalMaterial({ color: palette.glass, transparent: true, opacity: 0.22, roughness: 0.18, metalness: 0.08, depthWrite: false, side: THREE.DoubleSide }),
};

const ledMaterials: THREE.MeshStandardMaterial[] = [];
const shelfTargets: THREE.Object3D[] = [];
const shelfGlow = new THREE.MeshStandardMaterial({
  color: palette.orange,
  emissive: palette.orange,
  emissiveIntensity: 1.25,
  roughness: 0.36,
  metalness: 0.12,
});

buildShell();
buildServerRoom();
buildWorkBench();
buildResearchLibrary();
buildEnvironmentalDetails();
buildLighting();

let activeView: LabView = 'overview';
let cameraGoal = views.overview.position.clone();
let targetGoal = views.overview.target.clone();
let shelfHovered = false;
let shelfLoaded = false;
let shelfUnloadTimer: number | undefined;
let renderRunning = false;
let frameId = 0;
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(parseView(button.dataset.view)));
});
document.querySelectorAll<HTMLElement>('[data-open-shelf]').forEach((button) => button.addEventListener('click', openShelf));
openShelfButton.addEventListener('click', openShelf);
closeShelfButton.addEventListener('click', closeShelf);
renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerleave', clearShelfHover);
renderer.domElement.addEventListener('click', onSceneClick);
controls.addEventListener('start', () => {
  cameraGoal.copy(camera.position);
  targetGoal.copy(controls.target);
});
window.addEventListener('resize', onResize);
window.addEventListener('keydown', onKeyDown);
document.addEventListener('visibilitychange', onVisibilityChange);

setTimeout(() => document.getElementById('lab-loading')?.classList.add('is-complete'), 750);
startRender();

function animate(): void {
  if (!renderRunning) return;
  frameId = requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  camera.position.lerp(cameraGoal, 0.045);
  controls.target.lerp(targetGoal, 0.045);
  controls.update();

  ledMaterials.forEach((material, index) => {
    material.emissiveIntensity = 1.3 + (Math.sin(elapsed * 1.8 + index * 0.73) + 1) * 0.55;
  });
  shelfGlow.emissiveIntensity += ((shelfHovered ? 2.6 : 1.25) - shelfGlow.emissiveIntensity) * 0.12;
  renderer.render(scene, camera);
}

function startRender(): void {
  if (renderRunning || document.hidden) return;
  renderRunning = true;
  clock.start();
  animate();
}

function stopRender(): void {
  renderRunning = false;
  cancelAnimationFrame(frameId);
  clock.stop();
}

function setView(view: LabView): void {
  activeView = view;
  cameraGoal.copy(views[view].position);
  targetGoal.copy(views[view].target);
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === activeView));
  });
}

function openShelf(): void {
  window.clearTimeout(shelfUnloadTimer);
  if (!shelfLoaded) {
    shelfFrame.src = shelfFrame.dataset.src ?? '/landing-pages/complete-shelf-v2.html';
    shelfLoaded = true;
  }
  overlay.inert = false;
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('is-open');
  stopRender();
  window.setTimeout(() => closeShelfButton.focus(), 80);
}

function closeShelf(): void {
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.inert = true;
  startRender();
  openShelfButton.focus();
  shelfUnloadTimer = window.setTimeout(() => {
    if (overlay.classList.contains('is-open')) return;
    shelfFrame.src = 'about:blank';
    shelfLoaded = false;
  }, 360);
}

function onPointerMove(event: PointerEvent): void {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hovered = raycaster.intersectObjects(shelfTargets, true).length > 0;
  if (hovered === shelfHovered) return;
  shelfHovered = hovered;
  renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
}

function clearShelfHover(): void {
  shelfHovered = false;
  renderer.domElement.style.cursor = 'grab';
}

function onSceneClick(): void {
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.intersectObjects(shelfTargets, true).length > 0) openShelf();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && overlay.classList.contains('is-open')) closeShelf();
  if (event.key.toLowerCase() === 'l' && !overlay.classList.contains('is-open')) {
    setView('library');
    openShelfButton.focus();
  }
}

function onVisibilityChange(): void {
  if (document.hidden) stopRender();
  else if (!overlay.classList.contains('is-open')) startRender();
}

function buildShell(): void {
  const shell = new THREE.Group();
  shell.name = 'laboratory-shell';
  scene.add(shell);

  shell.add(box(24, 0.45, 18, mats.floor, 0, -0.22, 0, false));
  shell.add(box(24, 8.8, 0.42, mats.shell, 0, 4.4, -9.1));
  shell.add(box(0.42, 8.8, 18, mats.shell, -12.1, 4.4, 0));

  for (let x = -11; x <= 11; x += 2) shell.add(box(0.025, 0.02, 17.6, mats.steelLight, x, 0.02, 0, false));
  for (let z = -8; z <= 8; z += 2) shell.add(box(23.6, 0.02, 0.025, mats.steelLight, 0, 0.025, z, false));

  for (const x of [-9, -3, 3, 9]) {
    shell.add(box(0.22, 0.24, 18, mats.steel, x, 8.55, 0));
    shell.add(box(4.8, 0.07, 0.15, shelfGlow, x, 8.38, -1.2, false));
  }

  const windowWall = new THREE.Group();
  for (const z of [-7.5, -2.5, 2.5, 7.5]) {
    windowWall.add(box(0.16, 7.5, 4.7, mats.glass, 12, 4, z, false));
    windowWall.add(box(0.28, 8.2, 0.18, mats.steel, 11.9, 4.1, z - 2.45));
  }
  scene.add(windowWall);

  const divider = new THREE.Group();
  divider.name = 'server-glass-partition';
  divider.add(box(0.18, 5.8, 12.5, mats.glass, -0.9, 2.9, -2.2, false));
  for (const z of [-8.25, -4.1, 0.05, 4.05]) divider.add(box(0.28, 6.2, 0.22, mats.steel, -0.8, 3.1, z));
  scene.add(divider);
}

function buildServerRoom(): void {
  const serverZone = new THREE.Group();
  serverZone.name = 'compute-cluster';
  scene.add(serverZone);

  for (const [x, z, rotation] of [
    [-9.2, -6.4, 0], [-6.4, -6.4, 0], [-3.6, -6.4, 0],
    [-9.2, -1.6, Math.PI], [-6.4, -1.6, Math.PI], [-3.6, -1.6, Math.PI],
  ] as const) serverZone.add(createServerRack(x, z, rotation));

  for (const z of [-7.5, -5.2, -3, -0.7]) {
    serverZone.add(box(0.7, 0.08, 1.4, mats.steelLight, -10.8, 0.08, z, false));
  }

  const signTexture = makeLabelTexture('COMPUTE CORE', '06 RACKS · ACTIVE');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.3), new THREE.MeshBasicMaterial({ map: signTexture, transparent: true }));
  sign.position.set(-6.4, 6.6, -8.85);
  serverZone.add(sign);
}

function createServerRack(x: number, z: number, rotation: number): THREE.Group {
  const rack = new THREE.Group();
  rack.position.set(x, 0, z);
  rack.rotation.y = rotation;
  rack.add(roundedBox(2.15, 5.5, 1.65, 0.08, mats.black, 0, 2.8, 0));
  rack.add(box(1.78, 5.05, 0.08, mats.steel, 0, 2.78, 0.87));

  for (let unit = 0; unit < 8; unit += 1) {
    const y = 0.72 + unit * 0.59;
    rack.add(box(1.5, 0.42, 0.08, unit % 3 === 0 ? mats.steelLight : mats.shell, 0, y, 0.94, false));
    for (let led = 0; led < 3; led += 1) {
      const color = led === 0 ? palette.green : led === 1 ? palette.blue : palette.orange;
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.32 });
      ledMaterials.push(material);
      rack.add(box(0.055, 0.055, 0.035, material, -0.58 + led * 0.14, y, 1.01, false));
    }
  }
  return rack;
}

function buildWorkBench(): void {
  const bench = new THREE.Group();
  bench.name = 'research-workbench';
  scene.add(bench);

  for (const [x, z, rotation] of [[2.1, 1.1, -0.05], [5.4, 1.1, 0.05], [8.7, 1.1, -0.05]] as const) {
    bench.add(box(3, 0.22, 2.1, mats.cream, x, 1.5, z));
    bench.add(box(0.16, 1.45, 1.8, mats.steel, x - 1.2, 0.75, z));
    bench.add(box(0.16, 1.45, 1.8, mats.steel, x + 1.2, 0.75, z));
    bench.add(createTerminal(x, 1.62, z - 0.3, rotation));
    bench.add(createLabStool(x, z + 1.55));
  }

  const centralTable = new THREE.Group();
  centralTable.add(roundedBox(6.8, 0.28, 2.8, 0.1, mats.wood, 4.9, 1.3, 5.9));
  centralTable.add(box(0.25, 1.25, 2.3, mats.steel, 2.2, 0.63, 5.9));
  centralTable.add(box(0.25, 1.25, 2.3, mats.steel, 7.6, 0.63, 5.9));
  centralTable.add(box(0.8, 0.08, 1.1, mats.cream, 3.6, 1.52, 5.7, false));
  centralTable.add(box(1.2, 0.1, 0.8, mats.orange, 5.1, 1.54, 5.8, false));
  bench.add(centralTable);
}

function createTerminal(x: number, y: number, z: number, rotation: number): THREE.Group {
  const terminal = new THREE.Group();
  terminal.position.set(x, y, z);
  terminal.rotation.y = rotation;
  terminal.add(roundedBox(1.75, 1.05, 0.12, 0.06, mats.black, 0, 0.72, 0));
  terminal.add(box(1.48, 0.78, 0.035, Math.round(x) % 2 ? mats.screen : mats.warmScreen, 0, 0.72, 0.075, false));
  terminal.add(box(0.14, 0.65, 0.14, mats.steel, 0, 0.08, 0));
  terminal.add(box(0.9, 0.08, 0.55, mats.steel, 0, -0.25, 0));
  terminal.add(box(1.2, 0.06, 0.4, mats.black, 0, -0.02, 0.6, false));
  return terminal;
}

function createLabStool(x: number, z: number): THREE.Group {
  const stool = new THREE.Group();
  stool.position.set(x, 0, z);
  stool.add(new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.64, 0.22, 24), mats.orange));
  stool.children[0].position.y = 0.88;
  stool.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.72, 12), mats.steel));
  stool.children[1].position.y = 0.46;
  stool.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20), mats.steel));
  stool.children[2].position.y = 0.08;
  return stool;
}

function buildResearchLibrary(): void {
  const library = new THREE.Group();
  library.name = 'research-library';
  library.position.set(7.2, 0, -8.35);
  scene.add(library);

  library.add(roundedBox(8.1, 6.4, 0.92, 0.08, mats.wood, 0, 3.2, 0));
  library.add(box(7.55, 5.86, 0.12, mats.shellDark, 0, 3.2, 0.53));
  for (const x of [-3.85, 0, 3.85]) library.add(box(0.22, 6.15, 1.05, mats.orange, x, 3.2, 0.06));
  for (const y of [0.42, 1.84, 3.26, 4.68, 6.08]) library.add(box(7.8, 0.19, 1.02, mats.orange, 0, y, 0.06));

  const bookColors = [palette.bookNavy, palette.bookOrange, 0x496271, 0xb78b5f, 0x6c7b5d, 0x8f4e43];
  let bookIndex = 0;
  for (let shelf = 0; shelf < 4; shelf += 1) {
    let x = -3.35;
    while (x < 3.25) {
      const width = 0.22 + (bookIndex % 4) * 0.055;
      const height = 0.82 + (bookIndex % 3) * 0.12;
      const material = standard(bookColors[bookIndex % bookColors.length], 0.76, 0.02);
      const book = box(width, height, 0.54, material, x, 0.97 + shelf * 1.42, 0.69, false);
      if (bookIndex % 5 === 0) book.rotation.z = -0.09;
      library.add(book);
      x += width + 0.085;
      bookIndex += 1;
    }
  }

  const labelTexture = makeLabelTexture('RESEARCH LIBRARY', 'CLICK SHELF TO READ');
  const label = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 1.05), new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true }));
  label.position.set(0, 7.05, 0.53);
  library.add(label);
  library.add(box(5.9, 0.08, 0.08, shelfGlow, 0, 6.42, 0.58, false));

  const hitArea = box(8.4, 7.3, 1.4, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }), 0, 3.55, 0.45, false);
  library.add(hitArea);
  shelfTargets.push(hitArea);

  const readingBench = new THREE.Group();
  readingBench.add(roundedBox(5.4, 0.42, 1.4, 0.18, mats.cream, 7.2, 0.5, -5.75));
  readingBench.add(box(0.28, 0.55, 1.1, mats.steel, 5.1, 0.28, -5.75));
  readingBench.add(box(0.28, 0.55, 1.1, mats.steel, 9.3, 0.28, -5.75));
  scene.add(readingBench);
}

function buildEnvironmentalDetails(): void {
  const details = new THREE.Group();
  details.name = 'laboratory-details';
  scene.add(details);

  for (const z of [-7.2, -4.8, -2.4, 0]) {
    details.add(box(0.16, 0.16, 2, mats.orange, -11.75, 6.8, z, false));
    details.add(box(1.1, 0.04, 0.04, mats.steelLight, -11.66, 6.8, z, false));
  }

  for (const x of [-9, -6.3, -3.6]) {
    const vent = new THREE.Group();
    vent.add(box(1.8, 0.06, 0.9, mats.steel, x, 0.045, 3.6, false));
    for (let bar = -0.65; bar <= 0.65; bar += 0.22) vent.add(box(0.04, 0.025, 0.72, mats.shellDark, x + bar, 0.085, 3.6, false));
    details.add(vent);
  }

  const cabinet = new THREE.Group();
  cabinet.position.set(10.6, 0, -5.7);
  cabinet.add(roundedBox(1.8, 3.2, 1.25, 0.07, mats.steel, 0, 1.62, 0));
  cabinet.add(box(1.55, 0.08, 1.3, mats.orange, 0, 2.18, 0.03, false));
  cabinet.add(box(1.55, 0.08, 1.3, mats.orange, 0, 1.1, 0.03, false));
  details.add(cabinet);
}

function buildLighting(): void {
  scene.add(new THREE.HemisphereLight(0xb9d8df, 0x13202a, 1.45));
  const key = new THREE.DirectionalLight(0xe8f4f5, 2.1);
  key.position.set(8, 15, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(LAB_SCENE.performance.shadowMap, LAB_SCENE.performance.shadowMap);
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 16;
  key.shadow.camera.bottom = -12;
  key.shadow.camera.far = 52;
  scene.add(key);

  const serverAccent = new THREE.PointLight(palette.blue, 18, 16, 2);
  serverAccent.position.set(-6.2, 4.5, -1.2);
  scene.add(serverAccent);
  const libraryAccent = new THREE.PointLight(palette.orangeLight, 22, 15, 2);
  libraryAccent.position.set(7.2, 5.6, -5.8);
  scene.add(libraryAccent);
}

function makeLabelTexture(title: string, subtitle: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(8, 14, 19, 0.94)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#c87046';
  context.lineWidth = 8;
  context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  context.fillStyle = '#f0e9dd';
  context.font = '600 66px Arial, sans-serif';
  context.letterSpacing = '8px';
  context.fillText(title, 58, 112);
  context.fillStyle = '#d99165';
  context.font = '400 32px Arial, sans-serif';
  context.letterSpacing = '5px';
  context.fillText(subtitle, 60, 180);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
  return texture;
}

function roundedBox(width: number, height: number, depth: number, radius: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, radius), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number, shadows = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
}

function standard(color: THREE.ColorRepresentation, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function parseView(value: string | undefined): LabView {
  if (value === 'compute' || value === 'library') return value;
  return 'overview';
}

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, LAB_SCENE.performance.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function showWebglFallback(): void {
  document.getElementById('lab-loading')?.setAttribute('hidden', '');
  const fallback = document.getElementById('lab-webgl-fallback');
  if (fallback) fallback.hidden = false;
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing laboratory element: ${selector}`);
  return element;
}

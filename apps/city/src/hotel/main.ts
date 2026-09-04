import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import './style.css';

const container = document.getElementById('scene')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151820);
scene.fog = new THREE.Fog(0x151820, 18, 42);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
camera.position.set(13.8, 9.2, 15.6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.target.set(0, 2.05, -0.6);
controls.minDistance = 7;
controls.maxDistance = 30;
controls.minPolarAngle = 0.38;
controls.maxPolarAngle = Math.PI / 2.02;
controls.enablePan = false;

const materials = {
  wall: new THREE.MeshStandardMaterial({ color: 0xb2aa9d, roughness: 0.93 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x5d493b, roughness: 0.75 }),
  walnut: new THREE.MeshStandardMaterial({ color: 0x4b3025, roughness: 0.62 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x251d1a, roughness: 0.72 }),
  linen: new THREE.MeshStandardMaterial({ color: 0xd8d0c3, roughness: 0.98 }),
  duvet: new THREE.MeshStandardMaterial({ color: 0xb8a78e, roughness: 0.96 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xe9e2d7, roughness: 0.95 }),
  brass: new THREE.MeshStandardMaterial({ color: 0x9c7440, roughness: 0.3, metalness: 0.7 }),
  black: new THREE.MeshStandardMaterial({ color: 0x161514, roughness: 0.5 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0x53514d, roughness: 1 }),
  green: new THREE.MeshStandardMaterial({ color: 0x385444, roughness: 0.9 }),
};

function box(
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  radius = 0.04,
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const geometry = radius > 0
    ? new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(radius, ...size.map((v) => v / 3)))
    : new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: [number, number, number],
  material: THREE.Material,
  segments = 24,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// Architectural shell
box('oak floor', [16, 0.35, 11], [0, -0.18, 0], materials.floor, 0);
box('back wall', [16, 7.2, 0.28], [0, 3.42, -5.38], materials.wall, 0);
box('left wall', [0.28, 7.2, 11], [-7.86, 3.42, 0], materials.wall, 0);

// Floor boards and skirting add scale to the room.
for (let x = -7.35; x < 8; x += 0.72) {
  box('floor seam', [0.018, 0.008, 10.7], [x, 0.012, 0], materials.darkWood, 0);
}
box('back skirting', [15.75, 0.2, 0.12], [0, 0.1, -5.18], materials.cream, 0);
box('left skirting', [0.12, 0.2, 10.5], [-7.67, 0.1, 0], materials.cream, 0);

// Window, skyline and curtains.
const nightGlass = new THREE.MeshStandardMaterial({ color: 0x172536, roughness: 0.16, metalness: 0.15, emissive: 0x0a1523, emissiveIntensity: 0.8 });
box('window glass', [6.15, 3.35, 0.08], [3.75, 4.25, -5.19], nightGlass, 0);
box('window top', [6.45, 0.13, 0.15], [3.75, 6.0, -5.11], materials.black, 0);
box('window sill', [6.45, 0.16, 0.38], [3.75, 2.55, -5.0], materials.black, 0);
box('window left', [0.13, 3.55, 0.15], [0.55, 4.27, -5.11], materials.black, 0);
box('window right', [0.13, 3.55, 0.15], [6.95, 4.27, -5.11], materials.black, 0);
box('window mullion', [0.1, 3.4, 0.12], [3.75, 4.27, -5.08], materials.black, 0);

const cityMaterial = new THREE.MeshBasicMaterial({ color: 0x29394b });
const litWindow = new THREE.MeshBasicMaterial({ color: 0xd9a45d });
const skyline = [
  [-1.8, 1.2, 0.7], [-1.0, 2.1, 0.9], [-0.1, 1.5, 0.65], [0.7, 2.6, 0.85],
  [1.55, 1.9, 0.65], [2.3, 3.1, 0.75], [3.1, 1.45, 0.9], [4.0, 2.25, 0.72], [4.8, 1.7, 0.8],
];
for (const [offset, height, width] of skyline) {
  box('city building', [width, height, 0.12], [3.75 + offset, 2.66 + height / 2, -5.23], cityMaterial, 0);
  if (height > 1.8) box('city light', [0.09, 0.08, 0.02], [3.75 + offset - 0.12, 2.9 + height * 0.58, -5.15], litWindow, 0);
}

const curtainMaterial = new THREE.MeshStandardMaterial({ color: 0x82796d, roughness: 1, side: THREE.DoubleSide });
box('curtain rail', [7.4, 0.1, 0.12], [3.75, 6.18, -4.91], materials.brass, 0);
for (let i = 0; i < 5; i++) {
  box('left curtain fold', [0.23, 3.72, 0.24], [0.18 + i * 0.2, 4.24, -4.88 + (i % 2) * 0.08], curtainMaterial, 0.09);
  box('right curtain fold', [0.23, 3.72, 0.24], [7.32 - i * 0.2, 4.24, -4.88 + (i % 2) * 0.08], curtainMaterial, 0.09);
}

// Upholstered headboard and bed.
box('headboard', [6.7, 2.1, 0.3], [-0.85, 2.2, -4.94], materials.fabric, 0.16);
for (let x = -3.45; x <= 1.75; x += 1.3) {
  box('headboard seam', [0.018, 1.82, 0.012], [x, 2.22, -4.77], materials.black, 0);
}
box('bed plinth', [6.0, 0.45, 6.25], [-0.85, 0.38, -1.9], materials.darkWood, 0.14);
box('mattress', [5.72, 0.58, 5.85], [-0.85, 0.86, -1.95], materials.cream, 0.18);
box('duvet', [5.52, 0.42, 4.05], [-0.85, 1.25, -0.95], materials.duvet, 0.2);
box('duvet fold', [5.48, 0.18, 0.92], [-0.85, 1.51, -2.47], materials.linen, 0.12, [-0.07, 0, 0]);

for (const x of [-2.18, 0.48]) {
  box('back pillow', [2.22, 0.72, 1.05], [x, 1.58, -3.72], materials.duvet, 0.22, [-0.16, 0, 0]);
  box('front pillow', [2.05, 0.58, 0.9], [x, 1.67, -3.12], materials.cream, 0.2, [-0.07, 0, 0]);
}

// Bedside tables and warm lamps.
for (const x of [-4.45, 2.75]) {
  box('nightstand', [1.25, 0.9, 1.25], [x, 0.69, -3.82], materials.walnut, 0.08);
  box('drawer line', [0.9, 0.025, 0.02], [x, 0.76, -3.18], materials.brass, 0);
  cylinder(0.06, 0.06, 0.72, [x, 1.46, -3.82], materials.brass, 14);
  cylinder(0.46, 0.68, 0.75, [x, 2.0, -3.82], new THREE.MeshStandardMaterial({ color: 0xd8c7aa, roughness: 0.92 }), 32);
}

const warmLights: THREE.PointLight[] = [];
for (const x of [-4.45, 2.75]) {
  const light = new THREE.PointLight(0xffae64, 22, 7.5, 2);
  light.position.set(x, 1.95, -3.7);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  scene.add(light);
  warmLights.push(light);
}

// Rug and bench make the foreground feel occupied.
box('rug', [8.2, 0.05, 6.3], [-0.5, 0.05, 0.25], new THREE.MeshStandardMaterial({ color: 0x726555, roughness: 1 }), 0.12);
box('bench cushion', [4.0, 0.5, 1.35], [-0.85, 0.67, 2.0], new THREE.MeshStandardMaterial({ color: 0x897663, roughness: 1 }), 0.18);
for (const x of [-2.42, 0.72]) {
  box('bench leg', [0.18, 0.62, 0.9], [x, 0.31, 2.0], materials.brass, 0.04);
}

// Desk, chair and small objects.
box('desk top', [3.35, 0.18, 1.35], [5.35, 1.55, -1.7], materials.walnut, 0.06);
for (const x of [4.0, 6.7]) box('desk leg', [0.16, 1.48, 0.95], [x, 0.8, -1.7], materials.brass, 0.03);
box('writing pad', [1.35, 0.035, 0.75], [5.25, 1.66, -1.6], materials.black, 0.03);
box('book', [0.72, 0.09, 0.5], [6.25, 1.7, -1.7], new THREE.MeshStandardMaterial({ color: 0x70483d }), 0.02, [0, 0.12, 0]);
cylinder(0.2, 0.16, 0.35, [4.35, 1.82, -1.7], materials.cream, 18);

box('chair seat', [1.25, 0.25, 1.2], [5.35, 0.95, 0.2], materials.fabric, 0.16);
box('chair back', [1.25, 1.35, 0.24], [5.35, 1.66, 0.67], materials.fabric, 0.18, [-0.12, 0, 0]);
for (const x of [4.9, 5.8]) for (const z of [-0.15, 0.52]) box('chair leg', [0.08, 0.88, 0.08], [x, 0.45, z], materials.brass, 0.02);

// Wardrobe and luggage shelf.
box('wardrobe', [2.15, 5.55, 1.6], [-6.5, 2.78, -3.8], materials.walnut, 0.06);
box('wardrobe split', [0.025, 5.1, 0.02], [-6.5, 2.82, -2.97], materials.black, 0);
for (const x of [-6.62, -6.38]) cylinder(0.035, 0.035, 0.42, [x, 2.8, -2.93], materials.brass, 12);

// Artwork on left wall.
box('art frame', [0.11, 2.65, 3.75], [-7.67, 3.75, 1.7], materials.black, 0.02);
box('art canvas', [0.07, 2.3, 3.38], [-7.6, 3.75, 1.7], new THREE.MeshStandardMaterial({ color: 0xc2ad8e, roughness: 1 }), 0.01);
box('art block', [0.04, 1.25, 1.55], [-7.54, 4.15, 1.25], new THREE.MeshBasicMaterial({ color: 0x5b554e }), 0);
box('art accent', [0.04, 0.65, 1.1], [-7.53, 3.18, 2.25], new THREE.MeshBasicMaterial({ color: 0x8c5c43 }), 0);

// Planter with hand-built leaves.
cylinder(0.52, 0.38, 0.82, [-6.15, 0.43, 3.5], new THREE.MeshStandardMaterial({ color: 0x948575, roughness: 0.95 }), 28);
for (let i = 0; i < 9; i++) {
  const angle = (i / 9) * Math.PI * 2;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 12), materials.green);
  leaf.scale.set(0.48, 1.5, 0.3);
  leaf.position.set(-6.15 + Math.sin(angle) * 0.34, 1.15 + (i % 3) * 0.22, 3.5 + Math.cos(angle) * 0.34);
  leaf.rotation.z = Math.sin(angle) * 0.65;
  leaf.rotation.x = Math.cos(angle) * 0.45;
  leaf.castShadow = true;
  scene.add(leaf);
}

// Layered lighting: cool window light + warm room pools.
const hemisphere = new THREE.HemisphereLight(0x90b2d0, 0x3b281e, 1.4);
scene.add(hemisphere);

const windowLight = new THREE.RectAreaLight(0x99c8ea, 7.5, 6, 3.5);
windowLight.position.set(3.75, 4.25, -4.7);
windowLight.lookAt(1, 1.5, 2.5);
scene.add(windowLight);

const keyLight = new THREE.DirectionalLight(0xffe0b9, 1.75);
keyLight.position.set(7, 11, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -12;
keyLight.shadow.camera.right = 12;
keyLight.shadow.camera.top = 12;
keyLight.shadow.camera.bottom = -12;
scene.add(keyLight);

const views = {
  overview: { position: new THREE.Vector3(13.8, 9.2, 15.6), target: new THREE.Vector3(-0.2, 1.9, -0.8) },
  bedside: { position: new THREE.Vector3(7.4, 4.9, 6.9), target: new THREE.Vector3(-0.85, 1.45, -2.0) },
  window: { position: new THREE.Vector3(-1.8, 4.0, 7.3), target: new THREE.Vector3(3.75, 3.75, -5.2) },
};

let targetPosition = views.overview.position.clone();
let targetLook = views.overview.target.clone();
let isFlying = false;

function setView(key: keyof typeof views): void {
  targetPosition = views[key].position.clone();
  targetLook = views[key].target.clone();
  isFlying = true;
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === key);
  });
}

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view as keyof typeof views));
});

controls.addEventListener('start', () => { isFlying = false; });
renderer.domElement.addEventListener('dblclick', () => setView('overview'));

const lightToggle = document.getElementById('light-toggle')!;
let nightMode = true;
lightToggle.addEventListener('click', () => {
  nightMode = !nightMode;
  lightToggle.setAttribute('aria-pressed', String(nightMode));
  lightToggle.querySelector('span')!.textContent = nightMode ? '夜间氛围' : '清晨氛围';
  warmLights.forEach((light) => { light.intensity = nightMode ? 22 : 5; });
  windowLight.intensity = nightMode ? 7.5 : 14;
  hemisphere.intensity = nightMode ? 1.4 : 2.3;
  keyLight.intensity = nightMode ? 1.75 : 2.8;
  renderer.toneMappingExposure = nightMode ? 1.12 : 1.35;
  scene.background = new THREE.Color(nightMode ? 0x151820 : 0x9ab1bd);
  scene.fog = new THREE.Fog(nightMode ? 0x151820 : 0x9ab1bd, 18, 42);
});

function resize(): void {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);

function animate(): void {
  requestAnimationFrame(animate);
  if (isFlying) {
    camera.position.lerp(targetPosition, 0.055);
    controls.target.lerp(targetLook, 0.055);
    if (camera.position.distanceTo(targetPosition) < 0.04 && controls.target.distanceTo(targetLook) < 0.03) isFlying = false;
  }
  controls.update();
  renderer.render(scene, camera);
}

animate();

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GALLERY } from './config';
import './style.css';

const container = document.getElementById('scene')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17191c);
scene.fog = new THREE.Fog(0x17191c, 21, 48);

const camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, 0.1, 120);
camera.position.set(...GALLERY.views.entrance.position);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, GALLERY.performance.maxPixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...GALLERY.views.entrance.target);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enablePan = false;
controls.minDistance = 7;
controls.maxDistance = 38;
controls.minPolarAngle = 0.34;
controls.maxPolarAngle = Math.PI / 2.04;

const mat = {
  wall: new THREE.MeshStandardMaterial({ color: GALLERY.palette.wall, roughness: 0.94 }),
  floor: new THREE.MeshStandardMaterial({ color: GALLERY.palette.floor, roughness: 0.62, metalness: 0.08 }),
  charcoal: new THREE.MeshStandardMaterial({ color: GALLERY.palette.charcoal, roughness: 0.5 }),
  bronze: new THREE.MeshStandardMaterial({ color: GALLERY.palette.bronze, roughness: 0.24, metalness: 0.8 }),
  signal: new THREE.MeshStandardMaterial({ color: GALLERY.palette.signal, roughness: 0.82 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xaaa69f, roughness: 0.95 }),
};

function addBox(
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  radius = 0,
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const geometry = radius > 0 ? new RoundedBoxGeometry(...size, 3, radius) : new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// Architectural shell: a larger, deliberately open exhibition volume.
addBox([GALLERY.space.width, 0.3, GALLERY.space.depth], [0, -0.16, 0], mat.floor);
addBox([GALLERY.space.width, GALLERY.space.height, 0.3], [0, 3.85, -6.85], mat.wall);
addBox([0.3, GALLERY.space.height, GALLERY.space.depth], [-9.85, 3.85, 0], mat.wall);
addBox([5.6, 5.2, 0.32], [6.9, 2.45, -6.5], mat.charcoal);
addBox([0.3, 5.5, 5.2], [9.1, 2.6, -3.6], mat.wall);

// A floor route makes circulation visible.
const routeCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(8.8, 0.035, 6.0),
  new THREE.Vector3(3.8, 0.035, 3.2),
  new THREE.Vector3(0.5, 0.035, 1.2),
  new THREE.Vector3(0.0, 0.035, -1.6),
  new THREE.Vector3(4.8, 0.035, -3.4),
]);
const routeLine = new THREE.Mesh(
  new THREE.TubeGeometry(routeCurve, 72, 0.035, 8, false),
  new THREE.MeshBasicMaterial({ color: 0xc86a42 }),
);
scene.add(routeLine);

// Central sculpture: continuous geometry gives a stronger identity than stacked boxes.
addBox([3.8, 0.45, 3.8], [-0.7, 0.25, -0.35], mat.stone, 0.08);
addBox([3.15, 0.16, 3.15], [-0.7, 0.56, -0.35], mat.charcoal, 0.04);
const sculpture = new THREE.Mesh(new THREE.TorusKnotGeometry(1.42, 0.3, 180, 28, 2, 3), mat.bronze);
sculpture.position.set(-0.7, 2.2, -0.35);
sculpture.rotation.set(0.4, 0.1, -0.2);
sculpture.castShadow = true;
scene.add(sculpture);

const halo = new THREE.Mesh(
  new THREE.TorusGeometry(2.05, 0.065, 12, 96),
  new THREE.MeshStandardMaterial({ color: 0xd3b697, roughness: 0.25, metalness: 0.75 }),
);
halo.position.set(-0.7, 2.35, -0.35);
halo.rotation.set(Math.PI / 2.5, 0.2, 0.25);
halo.castShadow = true;
scene.add(halo);

// Left-wall triptych.
const artworkColors = [0xc9c0ae, 0xb34631, 0x444947];
[-4.8, -1.8, 1.2].forEach((z, index) => {
  addBox([0.12, 2.75, 2.0], [-9.62, 3.25, z], mat.charcoal, 0.02);
  addBox([0.08, 2.45, 1.7], [-9.52, 3.25, z], new THREE.MeshStandardMaterial({ color: artworkColors[index], roughness: 0.9 }), 0.01);
  if (index === 0) addBox([0.04, 0.55, 1.05], [-9.46, 3.65, z], mat.signal);
});

// Back-wall graphic work and label rail.
addBox([4.9, 3.15, 0.14], [4.1, 3.55, -6.62], mat.charcoal, 0.02);
addBox([4.35, 2.65, 0.08], [4.1, 3.55, -6.52], new THREE.MeshStandardMaterial({ color: 0xc8c1b4, roughness: 0.96 }), 0.01);
addBox([2.7, 0.62, 0.04], [3.45, 3.92, -6.46], mat.signal);
addBox([1.05, 1.62, 0.04], [5.35, 3.18, -6.45], new THREE.MeshStandardMaterial({ color: 0x6e7774 }), 0);
for (let i = 0; i < 4; i++) addBox([1.0, 0.055, 0.08], [1.55 + i * 1.1, 1.38, -6.4], mat.charcoal);

// Side-hall sculptural studies.
const sidePlinths = [
  { x: 5.0, z: -3.8, h: 1.1 },
  { x: 7.25, z: -2.2, h: 0.72 },
];
sidePlinths.forEach(({ x, z, h }, index) => {
  addBox([1.35, h, 1.35], [x, h / 2, z], mat.stone, 0.04);
  const study = new THREE.Mesh(
    index === 0 ? new THREE.IcosahedronGeometry(0.68, 1) : new THREE.TorusGeometry(0.62, 0.18, 16, 48),
    index === 0 ? mat.signal : mat.bronze,
  );
  study.position.set(x, h + 0.75, z);
  study.rotation.set(0.35, 0.45, index * 0.7);
  study.castShadow = true;
  scene.add(study);
});

// Resting points and publication table.
for (const z of [3.2, 4.35]) {
  addBox([4.2, 0.42, 0.78], [-3.8, 0.56, z], new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 1 }), 0.12);
  for (const x of [-5.35, -2.25]) addBox([0.12, 0.58, 0.52], [x, 0.29, z], mat.charcoal, 0.02);
}
addBox([2.3, 0.16, 1.15], [5.75, 1.0, 3.75], mat.charcoal, 0.04, [0, -0.12, 0]);
for (const x of [4.85, 6.65]) addBox([0.1, 0.95, 0.75], [x, 0.5, 3.75], mat.charcoal, 0.02);
for (let i = 0; i < 4; i++) addBox([0.55, 0.055, 0.78], [5.2 + i * 0.38, 1.12 + i * 0.03, 3.75], new THREE.MeshStandardMaterial({ color: i % 2 ? 0xc6bba9 : 0xa74c38 }), 0.01, [0, -0.12, 0]);

// Curatorial track lights.
addBox([13.4, 0.1, 0.12], [-0.7, 6.75, -0.4], mat.charcoal);
const spots: THREE.SpotLight[] = [];
function addSpot(position: [number, number, number], target: [number, number, number], intensity: number): void {
  const light = new THREE.SpotLight(0xffd1a3, intensity, 18, Math.PI / 7, 0.48, 1.6);
  light.position.set(...position);
  light.target.position.set(...target);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  scene.add(light, light.target);
  const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.23, 0.48, 18), mat.charcoal);
  fixture.position.copy(light.position);
  fixture.rotation.x = Math.PI / 2;
  scene.add(fixture);
  spots.push(light);
}
addSpot([-2.4, 6.55, -0.4], [-0.7, 1.7, -0.35], 48);
addSpot([1.0, 6.55, -0.4], [-0.7, 1.7, -0.35], 45);
addSpot([-6.8, 6.55, -0.4], [-9.5, 3.0, -2.0], 28);
addSpot([5.2, 6.55, -0.4], [4.7, 2.6, -5.9], 30);

const hemisphere = new THREE.HemisphereLight(0xaebfd0, 0x24201d, 1.25);
scene.add(hemisphere);
const entranceLight = new THREE.DirectionalLight(0xe2ecf5, 2.2);
entranceLight.position.set(10, 12, 14);
entranceLight.castShadow = true;
entranceLight.shadow.mapSize.set(GALLERY.performance.shadowMap, GALLERY.performance.shadowMap);
entranceLight.shadow.camera.left = -15;
entranceLight.shadow.camera.right = 15;
entranceLight.shadow.camera.top = 15;
entranceLight.shadow.camera.bottom = -15;
scene.add(entranceLight);

type ViewName = keyof typeof GALLERY.views;
let targetPosition = new THREE.Vector3(...GALLERY.views.entrance.position);
let targetLook = new THREE.Vector3(...GALLERY.views.entrance.target);
let isFlying = false;

function setView(name: ViewName): void {
  const view = GALLERY.views[name];
  targetPosition = new THREE.Vector3(...view.position);
  targetLook = new THREE.Vector3(...view.target);
  isFlying = true;
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === name));
}

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view as ViewName));
});
controls.addEventListener('start', () => { isFlying = false; });
renderer.domElement.addEventListener('dblclick', () => setView('entrance'));

const lightToggle = document.getElementById('light-toggle')!;
let curatorial = true;
lightToggle.addEventListener('click', () => {
  curatorial = !curatorial;
  lightToggle.setAttribute('aria-pressed', String(curatorial));
  lightToggle.querySelector('span')!.textContent = curatorial ? '策展灯光' : '闭馆模式';
  spots.forEach((spot, index) => { spot.intensity = curatorial ? [48, 45, 28, 30][index] : 4; });
  hemisphere.intensity = curatorial ? 1.25 : 0.35;
  entranceLight.intensity = curatorial ? 2.2 : 0.35;
  renderer.toneMappingExposure = curatorial ? 1.18 : 0.72;
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate(time = 0): void {
  requestAnimationFrame(animate);
  sculpture.rotation.y = time * 0.00012;
  halo.rotation.z = time * -0.00008;
  if (isFlying) {
    camera.position.lerp(targetPosition, 0.055);
    controls.target.lerp(targetLook, 0.055);
    if (camera.position.distanceTo(targetPosition) < 0.04 && controls.target.distanceTo(targetLook) < 0.03) isFlying = false;
  }
  controls.update();
  renderer.render(scene, camera);
}
animate();

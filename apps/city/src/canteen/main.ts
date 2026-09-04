import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type ViewName = 'hero' | 'plan';

interface ViewPreset {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const mount = document.getElementById('scene');
if (!mount) throw new Error('Missing #scene mount point.');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeaf1f1);
scene.fog = new THREE.Fog(0xeaf1f1, 58, 115);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 180);
const views: Record<ViewName, ViewPreset> = {
  hero: { position: new THREE.Vector3(7, 7.5, 20), target: new THREE.Vector3(0, 4.5, -9) },
  plan: { position: new THREE.Vector3(32, 39, 35), target: new THREE.Vector3(0, 1.8, -2) },
};
camera.position.copy(views.hero.position);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.domElement.tabIndex = 0;
mount.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.screenSpacePanning = true;
controls.minDistance = 14;
controls.maxDistance = 84;
controls.minPolarAngle = Math.PI * 0.12;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.copy(views.hero.target);

const materials = {
  white: material(0xf5f5f1, 0.62, 0.02),
  warmWhite: material(0xecebe6, 0.75, 0.01),
  floor: material(0xdedbd3, 0.86, 0.01),
  woodFloor: material(0xc8a47e, 0.78, 0.01),
  wood: material(0xc28f58, 0.64, 0.02),
  woodLight: material(0xd8ad7a, 0.68, 0.01),
  woodDark: material(0x8d6543, 0.58, 0.03),
  blue: material(0x145b86, 0.68, 0.02),
  blueSoft: material(0x2d6f99, 0.76, 0.01),
  grey: material(0x8f9292, 0.82, 0.01),
  greyLight: material(0xbabdbd, 0.84, 0.01),
  black: material(0x252829, 0.52, 0.28),
  steel: material(0x5e6465, 0.34, 0.62),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xbcdce4,
    roughness: 0.12,
    metalness: 0.04,
    transmission: 0.62,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  marble: new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.36, metalness: 0.02 }),
  leaf: material(0x3f7448, 0.82, 0),
  leafDark: material(0x2e5c3a, 0.84, 0),
  soil: material(0x443329, 1, 0),
  glow: new THREE.MeshStandardMaterial({ color: 0xfff3d1, emissive: 0xffd887, emissiveIntensity: 1.55, roughness: 0.2 }),
};

const dayLights: THREE.Light[] = [];
const eveningLights: THREE.Light[] = [];

buildRoom();
buildServiceWall();
buildDiningTables();
buildBooths();
buildDecor();
buildLighting();

let activeView: ViewName = 'hero';
let evening = false;
let cameraGoal = views.hero.position.clone();
let targetGoal = views.hero.target.clone();

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view === 'plan' ? 'plan' : 'hero'));
});
document.getElementById('light-toggle')?.addEventListener('click', () => {
  evening = !evening;
  updateLighting();
});
controls.addEventListener('start', () => {
  cameraGoal = camera.position.clone();
  targetGoal = controls.target.clone();
});
window.addEventListener('resize', resize);
setTimeout(() => document.getElementById('loading')?.classList.add('is-complete'), 850);

animate();

function animate(): void {
  requestAnimationFrame(animate);
  camera.position.lerp(cameraGoal, 0.035);
  controls.target.lerp(targetGoal, 0.035);
  controls.update();
  renderer.render(scene, camera);
}

function setView(view: ViewName): void {
  activeView = view;
  cameraGoal = views[view].position.clone();
  targetGoal = views[view].target.clone();
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === activeView));
  });
}

function updateLighting(): void {
  const toggle = document.getElementById('light-toggle');
  toggle?.setAttribute('aria-pressed', String(evening));
  if (toggle) toggle.textContent = evening ? '日间灯光' : '晚餐灯光';
  scene.background = new THREE.Color(evening ? 0x18313f : 0xeaf1f1);
  scene.fog = new THREE.Fog(evening ? 0x18313f : 0xeaf1f1, 58, 115);
  renderer.toneMappingExposure = evening ? 0.92 : 1.08;
  dayLights.forEach((light) => { light.intensity = (light.userData.dayIntensity as number) * (evening ? 0.24 : 1); });
  eveningLights.forEach((light) => { light.intensity = (light.userData.eveningIntensity as number) * (evening ? 1.45 : 0.62); });
}

function buildRoom(): void {
  const room = new THREE.Group();
  room.name = 'canteen-shell';
  scene.add(room);

  room.add(box(46, 0.65, 36, materials.floor, 0, -0.34, 0, false));
  room.add(box(46, 0.08, 8.3, materials.floor, 0, 0.03, -10.2, false));
  room.add(box(18, 0.09, 26, materials.woodFloor, -13.5, 0.05, 4.3, false));
  room.add(box(18, 0.09, 26, materials.woodFloor, 13.5, 0.05, 4.3, false));

  room.add(box(46, 12.5, 0.55, materials.white, 0, 6.1, -17.5));
  room.add(box(0.55, 12.5, 36, materials.white, -23, 6.1, 0));
  room.add(box(0.55, 12.5, 36, materials.white, 23, 6.1, 0));

  // White beams, blue feature column, and the rhythmic slatted ceiling.
  room.add(box(46, 0.55, 1.05, materials.white, 0, 11.6, -5.5));
  room.add(box(1.8, 12.2, 1.8, materials.white, -10.7, 6.0, -5.2));
  room.add(box(2.1, 12.2, 2.1, materials.blue, 11.1, 6.0, -5.4));
  room.add(box(46, 0.18, 36, materials.warmWhite, 0, 12.22, 0, false));
  for (let z = -17; z <= 17; z += 0.72) {
    room.add(box(45.5, 0.14, 0.18, materials.greyLight, 0, 12.05, z, false));
  }
  for (let z = -14.5; z <= 15; z += 5.8) {
    room.add(box(18.5, 0.08, 0.28, materials.glow, -12.4, 11.88, z, false));
    room.add(box(18.5, 0.08, 0.28, materials.glow, 12.4, 11.88, z, false));
  }

  // Right-hand windows reproduce the bright glazed facade from the reference.
  for (let z = -13.8; z <= 13.8; z += 5.6) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(5.1, 8.2), materials.glass);
    pane.position.set(22.68, 6.4, z);
    pane.rotation.y = -Math.PI / 2;
    room.add(pane);
    room.add(box(0.22, 8.6, 0.18, materials.black, 22.48, 6.4, z - 2.65));
  }
  room.add(box(0.22, 0.22, 33, materials.black, 22.48, 2.25, 0));
  room.add(box(0.22, 0.22, 33, materials.black, 22.48, 10.55, 0));
}

function buildServiceWall(): void {
  const service = new THREE.Group();
  service.name = 'service-and-reception';
  scene.add(service);

  service.add(box(21.5, 8.8, 0.7, materials.woodLight, 0, 5.1, -17.05));
  service.add(box(15.5, 5.5, 0.24, materials.marble, 0, 5.3, -16.62));
  service.add(box(7.5, 6.8, 0.3, materials.wood, -12.1, 4.1, -16.6));
  service.add(box(7.5, 6.8, 0.3, materials.wood, 12.1, 4.1, -16.6));
  service.add(box(29.5, 1.05, 1.0, materials.woodLight, 0, 10.1, -16.5));
  service.add(box(14.8, 1.8, 2.5, materials.woodLight, 0, 0.9, -14.6));
  service.add(box(15.4, 0.32, 2.9, materials.white, 0, 1.9, -14.45));
  service.add(box(0.5, 1.5, 0.9, materials.black, 0, 2.85, -15.0));

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 2.2), new THREE.MeshStandardMaterial({ map: signTexture(), transparent: true, roughness: 0.55 }));
  sign.position.set(0, 6.15, -16.45);
  service.add(sign);

  service.add(createPlant(-7.1, -14.0, 1.0));
  service.add(createPlant(7.0, -14.0, 0.95));
  service.add(createCounterPlant(-4.7, 2.15, -14.0));
  service.add(createCounterPlant(5.2, 2.15, -14.0));
}

function buildDiningTables(): void {
  const dining = new THREE.Group();
  dining.name = 'dining-tables';
  scene.add(dining);

  const tableRows = [-8.4, -1.5, 5.5, 12.2];
  for (const z of tableRows) {
    dining.add(createTable(-7.2, z, z > 8 ? 3.7 : 4.5, 2.25));
    dining.add(createTable(7.2, z, z > 8 ? 3.7 : 4.5, 2.25));
  }
  dining.add(createRoundTable(-15.7, -6.4));
  dining.add(createRoundTable(-15.2, 4.4));
  dining.add(createRoundTable(15.7, -6.3));
  dining.add(createRoundTable(15.4, 4.3));
}

function buildBooths(): void {
  const booths = new THREE.Group();
  booths.name = 'side-booths';
  scene.add(booths);

  for (const z of [-10, -3.6, 2.8, 9.2]) {
    booths.add(createBooth(-20.25, z, 0));
    booths.add(createBooth(20.25, z, Math.PI));
  }
  // Low timber dividers and planting along the booth edges.
  booths.add(box(0.7, 2.5, 29, materials.woodLight, -18.4, 1.25, 1.8));
  booths.add(box(0.7, 2.5, 29, materials.woodLight, 18.4, 1.25, 1.8));
  for (const z of [-11.5, -5, 1.5, 8]) {
    booths.add(createCounterPlant(-18.4, 2.65, z));
    booths.add(createCounterPlant(18.4, 2.65, z));
  }
}

function buildDecor(): void {
  const decor = new THREE.Group();
  decor.name = 'decor';
  scene.add(decor);

  // Minimal blue geometric prints on the left wall.
  for (let z = -10; z <= 8; z += 6) {
    decor.add(box(0.16, 3.2, 2.35, materials.white, -22.62, 6.7, z));
    decor.add(box(0.12, 1.65, 1.1, materials.blueSoft, -22.48, 6.7, z));
  }
  decor.add(createPlant(19.8, -12.9, 1.15));
  decor.add(createPlant(20.1, 12.4, 1.08));

  // Pendant lamps above the foreground and side tables.
  const pendantPoints: Array<[number, number]> = [
    [-18, 12], [-11, 11], [11, 11], [18, 12],
    [-18, -1], [-12, -5], [12, -5], [18, -1],
  ];
  for (const [x, z] of pendantPoints) decor.add(createPendant(x, z));
}

function buildLighting(): void {
  const hemi = new THREE.HemisphereLight(0xf5fbff, 0xb7ad9e, 2.25);
  hemi.userData.dayIntensity = 2.25;
  dayLights.push(hemi);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff8e9, 3.2);
  sun.position.set(24, 29, 21);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.userData.dayIntensity = 3.2;
  dayLights.push(sun);
  scene.add(sun);

  for (const [x, z] of [[-12, -8], [0, -8], [12, -8], [-12, 5], [0, 5], [12, 5]] as Array<[number, number]>) {
    const light = new THREE.PointLight(0xffdca0, 26, 15, 1.7);
    light.position.set(x, 10.7, z);
    light.castShadow = false;
    light.userData.eveningIntensity = 26;
    eveningLights.push(light);
    scene.add(light);
  }
}

function createTable(x: number, z: number, width: number, depth: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.add(rounded(width, 0.22, depth, 0.12, materials.white, 0, 2.35, 0));
  group.add(box(0.34, 2.25, 0.34, materials.black, -width * 0.34, 1.12, 0));
  group.add(box(0.34, 2.25, 0.34, materials.black, width * 0.34, 1.12, 0));
  group.add(box(width * 0.84, 0.18, 0.8, materials.black, 0, 0.16, 0));

  const chairXs = width > 4 ? [-1.25, 1.25] : [0];
  for (const chairX of chairXs) {
    group.add(createChair(chairX, -depth * 0.95, 0, Math.PI, chairX > 0));
    group.add(createChair(chairX, depth * 0.95, 0, 0, chairX < 0));
  }
  group.add(createPlaceSetting(0, 2.5, 0));
  return group;
}

function createRoundTable(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.15, 0.2, 32), materials.white);
  top.position.y = 2.35;
  top.castShadow = true;
  group.add(top);
  group.add(box(0.42, 2.25, 0.42, materials.black, 0, 1.12, 0));
  group.add(box(2.1, 0.18, 1.2, materials.black, 0, 0.15, 0));
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    group.add(createChair(Math.cos(angle) * 3.05, Math.sin(angle) * 3.05, 0, -angle + Math.PI / 2, i % 2 === 0));
  }
  group.add(createPlaceSetting(0, 2.5, 0));
  return group;
}

function createChair(x: number, z: number, y: number, rotation: number, blue: boolean): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotation;
  const upholstery = blue ? materials.blueSoft : materials.greyLight;
  group.add(rounded(1.45, 0.24, 1.35, 0.16, upholstery, 0, 1.35, 0));
  const back = rounded(1.5, 1.75, 0.25, 0.15, upholstery, 0, 2.25, -0.55);
  back.rotation.x = -0.08;
  group.add(back);
  for (const [legX, legZ] of [[-0.55, -0.42], [0.55, -0.42], [-0.55, 0.42], [0.55, 0.42]] as Array<[number, number]>) {
    const leg = box(0.12, 1.3, 0.12, materials.black, legX, 0.65, legZ);
    leg.rotation.z = legX * 0.06;
    group.add(leg);
  }
  return group;
}

function createBooth(x: number, z: number, rotation: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  group.add(box(2.2, 2.4, 5.2, materials.woodLight, 0, 1.2, 0));
  group.add(rounded(1.2, 0.38, 4.4, 0.18, materials.blue, -1.1, 1.75, 0));
  group.add(rounded(0.3, 2.4, 4.4, 0.16, materials.blue, -1.65, 2.85, 0));
  group.add(rounded(2.5, 0.2, 2.2, 0.1, materials.white, 1.6, 2.25, 0));
  group.add(box(0.28, 2.15, 0.28, materials.black, 1.6, 1.08, 0));
  group.add(box(1.55, 0.16, 0.9, materials.black, 1.6, 0.14, 0));
  group.add(createPlaceSetting(1.6, 2.48, 0));
  return group;
}

function createPlaceSetting(x: number, y: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 24), materials.white);
  plate.position.y = 0.03;
  group.add(plate);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.25, 16), materials.white);
  cup.position.set(0.48, 0.14, -0.2);
  group.add(cup);
  group.add(createCounterPlant(0, 0.06, 0.42, 0.34));
  return group;
}

function createPendant(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.add(box(0.035, 4.4, 0.035, materials.black, 0, 9.8, 0, false));
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 24, 1, true), materials.woodLight);
  shade.position.y = 7.55;
  shade.rotation.x = Math.PI;
  group.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), materials.glow);
  bulb.position.y = 7.28;
  group.add(bulb);
  return group;
}

function createPlant(x: number, z: number, scale = 1): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.55, 1.65, 24), materials.white);
  pot.position.y = 0.82;
  pot.castShadow = true;
  group.add(pot);
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.3, 10), materials.woodDark));
  for (let i = 0; i < 12; i += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.54, 14, 10), i % 2 ? materials.leaf : materials.leafDark);
    const angle = (i / 12) * Math.PI * 2;
    leaf.scale.set(0.72, 1.6, 0.55);
    leaf.position.set(Math.cos(angle) * 0.62, 2.4 + (i % 3) * 0.45, Math.sin(angle) * 0.62);
    leaf.rotation.z = Math.cos(angle) * 0.45;
    group.add(leaf);
  }
  return group;
}

function createCounterPlant(x: number, y: number, z: number, scale = 0.52): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.3, 0.55, 18), materials.white);
  pot.position.y = 0.27;
  group.add(pot);
  for (let i = 0; i < 7; i += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), materials.leaf);
    const angle = (i / 7) * Math.PI * 2;
    leaf.scale.set(0.55, 1.4, 0.42);
    leaf.position.set(Math.cos(angle) * 0.28, 0.75 + (i % 2) * 0.18, Math.sin(angle) * 0.28);
    group.add(leaf);
  }
  return group;
}

function box(width: number, height: number, depth: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

function rounded(width: number, height: number, depth: number, radius: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, radius), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function material(color: number, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function marbleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = '#f4f1ea';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = 1.3;
  for (let i = 0; i < 17; i += 1) {
    context.strokeStyle = i % 3 === 0 ? 'rgba(160,165,163,.22)' : 'rgba(188,177,163,.16)';
    context.beginPath();
    const y = 12 + i * 15;
    context.moveTo(-30, y + Math.sin(i) * 8);
    context.bezierCurveTo(150, y - 25, 310, y + 28, 545, y - 8);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function signTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#17638f';
  context.beginPath();
  context.moveTo(252, 78);
  context.lineTo(292, 42);
  context.lineTo(350, 99);
  context.lineTo(408, 42);
  context.lineTo(448, 78);
  context.lineTo(350, 172);
  context.closePath();
  context.fill();
  context.font = '700 64px Arial, sans-serif';
  context.fillText('YUNTING', 482, 112);
  context.font = '500 24px Arial, sans-serif';
  context.fillStyle = '#7a868b';
  context.fillText('SHARED DINING · DAILY ENERGY', 484, 154);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  document.getElementById('webgl-fallback')?.removeAttribute('hidden');
});

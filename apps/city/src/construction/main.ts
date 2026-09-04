import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { setupConstructionSpatialDocuments, type ConstructionViewName } from './spatial-documents';
import { COLORS, SITE } from './config';

const C = COLORS;

const app = document.getElementById('construction-scene');
if (!app) throw new Error('Missing #construction-scene');

try {
  bootstrap(app);
} catch (error) {
  console.error(error);
  const fallback = document.getElementById('construction-webgl-fallback');
  if (fallback) fallback.hidden = false;
}

function bootstrap(container: HTMLElement): void {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe5f2, 40, 86);

  const camera = new THREE.PerspectiveCamera(fovForAspect(window.innerWidth / window.innerHeight), window.innerWidth / window.innerHeight, 0.5, 150);
  const overview = SITE.views.overview;
  camera.position.fromArray(overview.position);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.dataset.scene = SITE.id;
  container.prepend(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.fromArray(overview.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.minDistance = 18;
  controls.maxDistance = 62;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.maxPolarAngle = Math.PI * 0.48;

  addLighting(scene);
  const creativeAgentFrame = createConcreteFrame();
  scene.add(
    createGround(),
    createWrappedBuilding([-8.2, 0, -6.8], [8.2, 12.5, 5.5], 8),
    createWrappedBuilding([7.9, 0, -7.4], [9.2, 10.6, 5.2], 7),
    createTowerCrane(),
    creativeAgentFrame,
    createDumpTruck([7.4, 0, 5.8], -0.28),
    createDumpTruck([-6.9, 0, 2.2], Math.PI + 0.22),
    createExcavator(),
    createForklift(),
    createMaterialYard(),
    createSilos(),
    createWorkers(),
    createPerimeterFence(),
  );

  let flight: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  const setView = (name: ConstructionViewName): void => {
    const view = SITE.views[name];
    flight = { position: new THREE.Vector3().fromArray(view.position), target: new THREE.Vector3().fromArray(view.target) };
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.view === name));
    });
  };
  controls.addEventListener('start', () => { flight = null; });
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view as ConstructionViewName));
  });
  document.getElementById('reset-site')?.addEventListener('click', () => setView('overview'));
  renderer.domElement.addEventListener('dblclick', () => setView('overview'));

  const spatialDocuments = setupConstructionSpatialDocuments({
    renderer,
    camera,
    focusView: setView,
    anchors: new Map([[creativeAgentFrame.name, creativeAgentFrame]]),
  });

  const onResize = (): void => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = fovForAspect(camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  const startedAt = performance.now();
  const animate = (): void => {
    requestAnimationFrame(animate);
    const elapsedSeconds = (performance.now() - startedAt) / 1000;
    if (flight) {
      camera.position.lerp(flight.position, 0.085);
      controls.target.lerp(flight.target, 0.085);
      if (camera.position.distanceTo(flight.position) < 0.05 && controls.target.distanceTo(flight.target) < 0.04) flight = null;
    }
    spatialDocuments.update(elapsedSeconds);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();
}

function addLighting(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xf2f8ff, 0x776b56, 2.2));
  scene.add(new THREE.AmbientLight(0xdcecff, 0.8));
  const sun = new THREE.DirectionalLight(0xffefd3, 3.7);
  sun.position.set(-20, 34, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.near = 3;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
}

function createGround(): THREE.Group {
  const group = new THREE.Group();
  const ground = roundedBox('site-ground', [SITE.size[0], 0.45, SITE.size[1]], C.sand, [0, -0.24, 0], 0.35);
  const material = ground.material as THREE.MeshStandardMaterial;
  material.map = createGroundTexture();
  material.roughness = 0.98;
  ground.receiveShadow = true;
  group.add(ground);

  const accessRoad = roundedBox('access-road', [8.5, 0.08, 18.5], 0x897b68, [7.5, 0.05, 0.8], 0.3);
  accessRoad.receiveShadow = true;
  group.add(accessRoad);
  for (let z = -7; z <= 8; z += 2.2) group.add(box('road-marking', [0.15, 0.03, 1.0], 0xe8dcae, [7.5, 0.11, z]));
  return group;
}

function createWrappedBuilding(position: [number, number, number], size: [number, number, number], floors: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wrapped-building';
  group.position.set(...position);
  const [width, height, depth] = size;
  const floorHeight = height / floors;

  for (let floor = 0; floor <= floors; floor += 1) {
    const y = floor * floorHeight;
    const slab = box('building-slab', [width, 0.16, depth], C.concreteDark, [0, y, 0]);
    slab.castShadow = floor === floors;
    group.add(slab);
  }
  for (const x of [-width / 2 + 0.3, 0, width / 2 - 0.3]) {
    for (const z of [-depth / 2 + 0.3, depth / 2 - 0.3]) group.add(box('building-column', [0.24, height, 0.24], C.concrete, [x, height / 2, z]));
  }

  const meshMaterial = new THREE.MeshStandardMaterial({ color: C.safetyGreen, transparent: true, opacity: 0.7, roughness: 0.86, side: THREE.DoubleSide, depthWrite: false });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(width, height), meshMaterial);
  front.position.set(0, height / 2, depth / 2 + 0.08);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), meshMaterial.clone());
  side.position.set(width / 2 + 0.08, height / 2, 0);
  side.rotation.y = Math.PI / 2;
  group.add(front, side);

  for (let floor = 0; floor <= floors; floor += 1) {
    const y = floor * floorHeight;
    group.add(box('scaffold-line', [width + 0.2, 0.055, 0.05], C.warning, [0, y, depth / 2 + 0.12]));
  }
  for (let x = -width / 2; x <= width / 2; x += 1.25) group.add(box('scaffold-upright', [0.05, height, 0.05], C.safetyGreenDark, [x, height / 2, depth / 2 + 0.14]));
  return group;
}

function createTowerCrane(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'tower-crane';
  group.position.set(-1.5, 0, -2.7);
  const height = 15.2;
  const towerWidth = 1.0;
  for (const x of [-towerWidth / 2, towerWidth / 2]) {
    for (const z of [-towerWidth / 2, towerWidth / 2]) group.add(box('crane-upright', [0.12, height, 0.12], C.crane, [x, height / 2, z]));
  }
  for (let y = 0.5; y < height; y += 1.05) {
    group.add(beamBetween([-0.5, y, 0.5], [0.5, y + 0.65, 0.5], 0.055, C.craneDark));
    group.add(beamBetween([0.5, y, 0.5], [-0.5, y + 0.65, 0.5], 0.055, C.craneDark));
    group.add(beamBetween([-0.5, y, -0.5], [0.5, y + 0.65, -0.5], 0.055, C.craneDark));
    group.add(beamBetween([0.5, y, -0.5], [-0.5, y + 0.65, -0.5], 0.055, C.craneDark));
  }

  const cab = roundedBox('crane-cab', [1.45, 0.9, 1.1], C.white, [0.6, 14.8, 0], 0.12);
  const glass = box('crane-window', [0.52, 0.5, 0.04], C.blue, [0.62, 14.87, 0.57]);
  group.add(cab, glass);
  const pivot = new THREE.Group();
  pivot.position.y = 15.3;
  const jibLength = 16;
  pivot.add(box('crane-jib-top', [jibLength, 0.13, 0.13], C.crane, [3.8, 0.72, 0]));
  pivot.add(box('crane-jib-bottom', [jibLength, 0.13, 0.13], C.crane, [3.8, 0, 0]));
  for (let x = -4; x <= 11.5; x += 1.15) {
    pivot.add(beamBetween([x, 0, 0], [x + 1.15, 0.72, 0], 0.045, C.craneDark));
    pivot.add(beamBetween([x, 0.72, 0], [x + 1.15, 0, 0], 0.045, C.craneDark));
  }
  pivot.add(box('crane-counterweight', [2.2, 0.9, 1.25], C.concreteDark, [-4.1, 0.3, 0]));
  const hookLine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 8.2, 6), new THREE.MeshStandardMaterial({ color: 0x30363a }));
  hookLine.position.set(8.2, -4.0, 0);
  pivot.add(hookLine);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 8, 16, Math.PI * 1.45), new THREE.MeshStandardMaterial({ color: C.orange }));
  hook.position.set(8.2, -8.2, 0);
  hook.rotation.z = Math.PI / 2;
  pivot.add(hook);
  group.add(pivot);
  return group;
}

function createConcreteFrame(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'creative-agent-frame';
  group.position.set(3.7, 0, -1.5);
  const width = 8;
  const depth = 6;
  const levels = [0, 2.35, 4.7];
  for (const y of levels) {
    const slab = box('concrete-slab', [width, 0.28, depth], C.concrete, [0, y, 0]);
    slab.receiveShadow = true;
    group.add(slab);
  }
  for (const x of [-3.6, -1.2, 1.2, 3.6]) {
    for (const z of [-2.6, 0, 2.6]) group.add(box('concrete-column', [0.38, 5.8, 0.38], C.concreteDark, [x, 2.9, z]));
  }
  for (const x of [-3.6, -1.2, 1.2, 3.6]) {
    for (const z of [-2.6, 0, 2.6]) {
      if ((Math.abs(x) + Math.abs(z)) % 2 < 1) continue;
      group.add(beamBetween([x - 0.55, 0.2, z], [x + 0.55, 2.2, z], 0.07, C.orange));
      group.add(beamBetween([x + 0.55, 0.2, z], [x - 0.55, 2.2, z], 0.07, C.orange));
    }
  }
  const rebarMaterial = new THREE.MeshStandardMaterial({ color: 0x596269, metalness: 0.5, roughness: 0.52 });
  for (let i = 0; i < 9; i += 1) {
    const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 6), rebarMaterial);
    rebar.position.set(-3.4 + (i % 3) * 0.18, 5.8, -2.4 + Math.floor(i / 3) * 0.18);
    group.add(rebar);
  }
  const stages = [
    { label: '需求 BRIEF', color: '#3d82b5' },
    { label: '候选比较', color: '#d89122' },
    { label: '负面修复', color: '#dd7d2f' },
    { label: '常规检查', color: '#7f8f96' },
    { label: '可编辑交付', color: '#22a987' },
  ];
  stages.forEach((stage, index) => {
    const x = -3.15 + index * 1.58;
    group.add(createStageSign(index + 1, stage.label, stage.color, [x, 0.92, 3.16]));
  });
  group.add(createValidationBanner());
  return group;
}

function createStageSign(index: number, label: string, color: string, position: [number, number, number]): THREE.Group {
  const group = new THREE.Group();
  group.name = `process-stage-${index}`;
  group.position.set(...position);
  const pole = box('stage-sign-pole', [0.07, 1.15, 0.07], C.steel, [0, -0.45, -0.03]);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.42, 0.72),
    new THREE.MeshStandardMaterial({ map: createSignTexture(String(index).padStart(2, '0'), label, color), roughness: 0.72, side: THREE.DoubleSide }),
  );
  board.castShadow = true;
  group.add(pole, board);
  return group;
}

function createValidationBanner(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  context.fillStyle = '#29343a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f0cd39';
  context.fillRect(0, 0, 220, canvas.height);
  context.fillStyle = '#29343a';
  context.font = '700 62px sans-serif';
  context.textAlign = 'center';
  context.fillText('待验证', 110, 116);
  context.fillStyle = '#ffffff';
  context.font = '600 50px sans-serif';
  context.textAlign = 'left';
  context.fillText('模型能否判断美感？', 270, 116);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 1.08), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.68, side: THREE.DoubleSide }));
  banner.name = 'validation-banner';
  banner.position.set(0, 5.65, 3.17);
  banner.castShadow = true;
  return banner;
}

function createSignTexture(index: string, label: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  context.fillStyle = '#f7f4e9';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.fillRect(0, 0, 118, canvas.height);
  context.fillStyle = '#ffffff';
  context.font = '700 58px sans-serif';
  context.textAlign = 'center';
  context.fillText(index, 59, 150);
  context.fillStyle = '#28353c';
  context.font = label.length > 7 ? '600 38px sans-serif' : '700 44px sans-serif';
  context.textAlign = 'left';
  context.fillText(label, 145, 145);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDumpTruck(position: [number, number, number], rotation: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'dump-truck';
  group.position.set(...position);
  group.rotation.y = rotation;
  const chassis = roundedBox('truck-chassis', [4.8, 0.5, 1.7], 0x454b4e, [0, 0.62, 0], 0.12);
  const cab = roundedBox('truck-cab', [1.55, 1.7, 1.65], C.vehicle, [1.55, 1.45, 0], 0.18);
  const windshield = box('truck-window', [0.04, 0.68, 1.1], C.blue, [2.34, 1.72, 0]);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.75, 1.25, 1.8), new THREE.MeshStandardMaterial({ color: C.vehicle, roughness: 0.74 }));
  bed.position.set(-0.8, 1.38, 0);
  bed.rotation.z = -0.08;
  bed.castShadow = true;
  group.add(chassis, cab, windshield, bed);
  addVehicleWheels(group, [-1.35, 0.05, 1.35], 0.56, 0.42, 0.94);
  return group;
}

function createExcavator(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'excavator';
  group.position.set(-7.3, 0, -1.6);
  group.rotation.y = -0.35;
  for (const z of [-0.75, 0.75]) group.add(roundedBox('excavator-track', [3.2, 0.65, 0.5], 0x41474b, [0, 0.42, z], 0.2));
  group.add(roundedBox('excavator-body', [2.5, 0.8, 1.65], C.vehicle, [0, 1.1, 0], 0.2));
  group.add(roundedBox('excavator-cab', [1.1, 1.45, 1.4], C.vehicleDark, [-0.6, 2.05, 0], 0.14));
  group.add(box('excavator-glass', [0.05, 0.83, 0.85], C.blue, [-1.17, 2.18, 0]));
  const shoulder = new THREE.Vector3(0.85, 1.8, 0);
  const elbow = new THREE.Vector3(3.5, 4.5, 0);
  const wrist = new THREE.Vector3(5.7, 1.5, 0);
  group.add(beamBetween(shoulder.toArray(), elbow.toArray(), 0.22, C.vehicle));
  group.add(beamBetween(elbow.toArray(), wrist.toArray(), 0.18, C.vehicleDark));
  const bucket = roundedBox('excavator-bucket', [1.2, 0.8, 1.55], C.vehicleDark, [6.05, 1.0, 0], 0.18);
  bucket.rotation.z = -0.35;
  group.add(bucket);
  return group;
}

function createForklift(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'forklift';
  group.position.set(-7.1, 0, 6.4);
  group.rotation.y = 0.18;
  group.add(roundedBox('forklift-body', [2.1, 0.85, 1.3], C.vehicle, [0, 0.82, 0], 0.16));
  group.add(box('forklift-seat', [0.65, 0.75, 0.65], 0x444b50, [-0.45, 1.5, 0]));
  group.add(box('forklift-mast', [0.18, 2.9, 0.18], C.steel, [1.12, 1.55, -0.47]));
  group.add(box('forklift-mast', [0.18, 2.9, 0.18], C.steel, [1.12, 1.55, 0.47]));
  for (const z of [-0.42, 0.42]) group.add(box('forklift-fork', [2.0, 0.12, 0.12], C.steel, [1.95, 0.28, z]));
  addVehicleWheels(group, [-0.68, 0.62], 0.42, 0.32, 0.7);
  const pallet = createPalletStack();
  pallet.position.set(2.8, 0, 0);
  group.add(pallet);
  return group;
}

function createMaterialYard(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'material-yard';
  group.position.set(-0.8, 0, 6.5);

  const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0x70777a, metalness: 0.35, roughness: 0.62 });
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 8 - row; column += 1) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 4.6, 12, 1, true), pipeMaterial);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, 0.18 + row * 0.23, -2.0 + column * 0.28 + row * 0.14);
      pipe.castShadow = true;
      group.add(pipe);
    }
  }

  for (let stack = 0; stack < 3; stack += 1) {
    const rack = new THREE.Group();
    rack.position.set(-5 + stack * 2.5, 0, 0.8);
    for (const x of [-0.95, 0.95]) {
      rack.add(box('rack-upright', [0.12, 1.5, 0.12], C.orange, [x, 0.75, -0.75]));
      rack.add(box('rack-upright', [0.12, 1.5, 0.12], C.orange, [x, 0.75, 0.75]));
    }
    for (const y of [0.25, 0.72, 1.19]) {
      rack.add(box('rack-beam', [2.05, 0.1, 0.1], C.orange, [0, y, -0.75]));
      rack.add(box('material-panel', [1.8, 0.12, 1.35], C.concrete, [0, y + 0.12, 0]));
    }
    group.add(rack);
  }
  return group;
}

function createPalletStack(): THREE.Group {
  const group = new THREE.Group();
  for (let level = 0; level < 3; level += 1) {
    group.add(box('pallet-board', [1.5, 0.12, 1.15], 0x9d6d3f, [0, 0.12 + level * 0.42, 0]));
    for (const x of [-0.48, 0, 0.48]) group.add(box('concrete-block', [0.42, 0.28, 0.45], C.concrete, [x, 0.32 + level * 0.42, 0]));
  }
  return group;
}

function createSilos(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cement-silos';
  group.position.set(11.5, 0, -4.8);
  for (let i = 0; i < 4; i += 1) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 3.5, 18), new THREE.MeshStandardMaterial({ color: C.white, roughness: 0.74 }));
    body.position.set(i * 1.5, 2.35, 0);
    body.castShadow = true;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.9, 18), new THREE.MeshStandardMaterial({ color: C.white, roughness: 0.74 }));
    cone.position.set(i * 1.5, 0.65, 0);
    cone.rotation.z = Math.PI;
    cone.castShadow = true;
    group.add(body, cone);
    for (const x of [-0.4, 0.4]) group.add(box('silo-leg', [0.09, 0.7, 0.09], C.steel, [i * 1.5 + x, 0.35, 0]));
  }
  return group;
}

function createWorkers(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'site-workers';
  const positions: Array<[number, number, number]> = [
    [-4.5, 0, 4.4], [-3.6, 0, 4.1], [-2.2, 0, 1.6], [0.4, 0, 3.1], [1.2, 0, 4.0],
    [5.6, 0, 3.0], [6.3, 0, 1.7], [9.8, 0, 4.0], [-8.9, 0, 5.2], [3.4, 0, 6.6],
  ];
  positions.forEach((position, index) => {
    const worker = createWorker(index % 2 === 0 ? 0xf07b3b : 0xe9b62d);
    worker.position.set(...position);
    worker.rotation.y = (index * 0.73) % (Math.PI * 2);
    group.add(worker);
  });
  return group;
}

function createWorker(vestColor: number): THREE.Group {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd6a77d, roughness: 0.8 });
  const helmetMaterial = new THREE.MeshStandardMaterial({ color: C.warning, roughness: 0.7 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), skin);
  head.position.y = 1.35;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), helmetMaterial);
  helmet.position.y = 1.47;
  const body = roundedBox('worker-vest', [0.42, 0.58, 0.28], vestColor, [0, 0.94, 0], 0.08);
  group.add(head, helmet, body);
  for (const x of [-0.12, 0.12]) group.add(box('worker-leg', [0.12, 0.52, 0.14], 0xd8d2bd, [x, 0.4, 0]));
  return group;
}

function createPerimeterFence(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'safety-fence';
  for (let x = -14; x <= 14; x += 2) {
    group.add(box('fence-post', [0.08, 1.2, 0.08], C.steel, [x, 0.6, 10.4]));
    group.add(box('warning-rail', [1.85, 0.08, 0.08], x % 4 === 0 ? C.warning : 0x24282a, [x + 0.9, 1.05, 10.4]));
    group.add(box('warning-rail', [1.85, 0.08, 0.08], x % 4 === 0 ? 0x24282a : C.warning, [x + 0.9, 0.25, 10.4]));
  }
  return group;
}

function addVehicleWheels(group: THREE.Group, xPositions: number[], radius: number, width: number, z: number): void {
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x2f3335, roughness: 0.72 });
  const hubMaterial = new THREE.MeshStandardMaterial({ color: 0x858b89, metalness: 0.25, roughness: 0.5 });
  for (const x of xPositions) {
    for (const side of [-z, z]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18), wheelMaterial);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, radius, side);
      wheel.castShadow = true;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, width + 0.02, 16), hubMaterial);
      hub.rotation.x = Math.PI / 2;
      hub.position.copy(wheel.position);
      group.add(wheel, hub);
    }
  }
}

function beamBetween(start: [number, number, number], end: [number, number, number], radius: number, color: number): THREE.Mesh {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 6), new THREE.MeshStandardMaterial({ color, roughness: 0.66 }));
  beam.position.copy(from).add(to).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  beam.castShadow = true;
  return beam;
}

function box(name: string, size: [number, number, number], color: number, position: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.76 }));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function roundedBox(name: string, size: [number, number, number], color: number, position: [number, number, number], radius: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 4, radius), new THREE.MeshStandardMaterial({ color, roughness: 0.76 }));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  context.fillStyle = '#bda98a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(118, 97, 72, .18)';
  for (let y = 12; y < canvas.height; y += 21) {
    for (let x = 8 + ((y / 21) % 2) * 9; x < canvas.width; x += 27) context.fillRect(x, y, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 3);
  texture.anisotropy = 4;
  return texture;
}

function fovForAspect(aspect: number): number {
  if (aspect < 0.75) return 58;
  if (aspect < 1.2) return 48;
  return 39;
}

/**
 * 医院内部 · 单人病房（独立模块）
 *
 * 完全自包含：只依赖 three 标准库，不 import 项目内其它业务代码。
 * 后续优化病房画面时，只需修改本文件与同目录 style.css。
 */
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type ViewName = 'overview' | 'bed' | 'monitor';

interface RoomView {
  position: [number, number, number];
  target: [number, number, number];
}

const ROOM = {
  id: 'hospital-ward-01',
  width: 7,
  depth: 6,
  height: 3.6,
  wallThickness: 0.2,
  views: {
    overview: { position: [10, 9, 12], target: [0, 1.2, 0] },
    bed: { position: [6.2, 4.8, 5.8], target: [-0.4, 1.0, -0.6] },
    monitor: { position: [5.4, 4.2, 3.4], target: [1.7, 1.6, -2.4] },
  } satisfies Record<ViewName, RoomView>,
} as const;

const COLORS = {
  wall: 0xf3f6f8,
  trim: 0xa9cce0,
  baseboard: 0xc0cdd4,
  windowFrame: 0x8a9aa5,
  cabinetWood: 0xefe9dd,
  cabinetDoor: 0xe1d8c4,
  brass: 0xc0a878,
} as const;

const app = document.getElementById('hospital-scene');
if (!app) throw new Error('Missing #hospital-scene');

try {
  bootstrap(app);
} catch (error) {
  console.error(error);
  const fallback = document.getElementById('hospital-webgl-fallback');
  if (fallback) fallback.hidden = false;
}

function bootstrap(container: HTMLElement): void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd8e6f1);
  scene.fog = new THREE.Fog(0xd8e6f1, 18, 36);

  const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 100);
  const overview = ROOM.views.overview;
  camera.position.fromArray(overview.position);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.dataset.scene = ROOM.id;
  container.prepend(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.fromArray(overview.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 7;
  controls.maxDistance = 22;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.maxPolarAngle = Math.PI * 0.5;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;

  addLighting(scene);

  scene.add(
    createFloor(),
    createWalls(),
    createTopTrim(),
    createCeilingLamp(),
    createBedheadPanel(),
    createIVStand(),
    createPatientMonitor(),
    createMonitorCabinet(),
    createHospitalBed(),
    createNightstand(),
    createTablePlant(),
    createBigPlant(0xf2f0e8, ROOM.width / 2 - 1.3, -ROOM.depth / 2 + 1.4),
    createBigPlant(0xa17048, ROOM.width / 2 - 1.0, ROOM.depth / 2 - 1.2),
    createTrolley(),
  );

  let flight: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  const setView = (name: ViewName): void => {
    const view = ROOM.views[name];
    flight = { position: new THREE.Vector3().fromArray(view.position), target: new THREE.Vector3().fromArray(view.target) };
    controls.autoRotate = name === 'overview';
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.view === name));
    });
  };
  controls.addEventListener('start', () => { flight = null; });
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view as ViewName));
  });
  document.getElementById('reset-room')?.addEventListener('click', () => setView('overview'));
  renderer.domElement.addEventListener('dblclick', () => setView('overview'));

  const onResize = (): void => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  const animate = (): void => {
    requestAnimationFrame(animate);
    if (flight) {
      camera.position.lerp(flight.position, 0.09);
      controls.target.lerp(flight.target, 0.09);
      if (camera.position.distanceTo(flight.position) < 0.025 && controls.target.distanceTo(flight.target) < 0.025) flight = null;
    }
    controls.update();
    renderer.render(scene, camera);
  };
  animate();
}

function addLighting(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe5edf2, 0.85));

  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(6, 12, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(-5, 6, -4);
  scene.add(fill);

  const ceilingLamp = new THREE.PointLight(0xfff8e6, 1.1, 14, 2);
  ceilingLamp.position.set(-0.3, 3.2, -1.0);
  scene.add(ceilingLamp);
}

// ---------- 通用工具 ----------

function box(
  size: [number, number, number],
  color: number,
  position: [number, number, number],
  options: { roughness?: number; metalness?: number; castShadow?: boolean } = {},
): THREE.Mesh {
  const { roughness = 0.7, metalness = 0.05, castShadow = true } = options;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshStandardMaterial({ color, roughness, metalness }),
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- 房间外壳 ----------

function createFloor(): THREE.Mesh {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM.width, 0.15, ROOM.depth),
    new THREE.MeshStandardMaterial({ map: createTileTexture(), roughness: 0.45, metalness: 0.1 }),
  );
  floor.position.y = -0.075;
  floor.receiveShadow = true;
  return floor;
}

function createWalls(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ward-walls';
  const t = ROOM.wallThickness;

  // 后墙
  group.add(box([ROOM.width, ROOM.height, t], COLORS.wall, [0, ROOM.height / 2, -ROOM.depth / 2 + t / 2], { castShadow: false }));
  // 左墙
  group.add(box([t, ROOM.height, ROOM.depth], COLORS.wall, [-ROOM.width / 2 + t / 2, ROOM.height / 2, 0], { castShadow: false }));
  // 右墙（挖窗）：下段 + 上段 + 两侧 + 窗框 + 玻璃
  const rightX = ROOM.width / 2 - t / 2;
  group.add(
    box([t, 1.3, ROOM.depth], COLORS.wall, [rightX, 0.65, 0], { castShadow: false }),
    box([t, 0.6, ROOM.depth], COLORS.wall, [rightX, ROOM.height - 0.3, 0], { castShadow: false }),
  );
  const sideHeight = ROOM.height - 1.3 - 0.6;
  const sideWidth = 1.2;
  for (const z of [-(ROOM.depth / 2 - sideWidth / 2), ROOM.depth / 2 - sideWidth / 2]) {
    group.add(box([t, sideHeight, sideWidth], COLORS.wall, [rightX, 1.3 + sideHeight / 2, z], { castShadow: false }));
  }
  group.add(
    box([t + 0.04, 0.08, ROOM.depth - 2 * sideWidth], COLORS.windowFrame, [rightX, 1.3, 0], { metalness: 0.5, roughness: 0.3, castShadow: false }),
    box([t + 0.04, 0.08, ROOM.depth - 2 * sideWidth], COLORS.windowFrame, [rightX, ROOM.height - 0.6, 0], { metalness: 0.5, roughness: 0.3, castShadow: false }),
    box([t + 0.05, sideHeight - 0.16, 0.05], COLORS.windowFrame, [rightX, (1.3 + ROOM.height - 0.6) / 2, 0], { metalness: 0.5, roughness: 0.3, castShadow: false }),
  );
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(t + 0.02, sideHeight - 0.16, ROOM.depth - 2 * sideWidth - 0.04),
    new THREE.MeshPhysicalMaterial({
      color: 0xcfe1ee,
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.85,
      transparent: true,
      opacity: 0.55,
      ior: 1.5,
      thickness: 0.1,
    }),
  );
  glass.position.set(rightX, (1.3 + ROOM.height - 0.6) / 2, 0);
  group.add(glass);

  // 踢脚线
  const baseY = 0.06;
  group.add(
    box([ROOM.width, 0.12, 0.04], COLORS.baseboard, [0, baseY, -ROOM.depth / 2 + 0.12], { castShadow: false }),
    box([0.04, 0.12, ROOM.depth], COLORS.baseboard, [-ROOM.width / 2 + 0.12, baseY, 0], { castShadow: false }),
    box([0.04, 0.12, ROOM.depth], COLORS.baseboard, [ROOM.width / 2 - 0.12, baseY, 0], { castShadow: false }),
  );
  return group;
}

function createTopTrim(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'top-trim';
  const y = ROOM.height - 0.18;
  group.add(
    box([ROOM.width + 0.02, 0.18, 0.05], COLORS.trim, [0, y, -ROOM.depth / 2 + 0.06], { roughness: 0.4, castShadow: false }),
    box([0.05, 0.18, ROOM.depth + 0.02], COLORS.trim, [-ROOM.width / 2 + 0.06, y, 0], { roughness: 0.4, castShadow: false }),
    box([0.05, 0.18, ROOM.depth + 0.02], COLORS.trim, [ROOM.width / 2 - 0.06, y, 0], { roughness: 0.4, castShadow: false }),
  );
  return group;
}

// ---------- 医疗设备与家具 ----------

function createCeilingLamp(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ceiling-lamp';
  group.position.set(-0.5, 0, -1.0);
  group.add(box([0.04, 0.5, 0.04], 0x888888, [0, ROOM.height - 0.25, 0], { metalness: 0.5 }));
  group.add(box([1.4, 0.08, 1.0], 0xc0c8cc, [0, ROOM.height - 0.54, 0], { metalness: 0.55, roughness: 0.3 }));
  const panel = box([1.32, 0.04, 0.92], 0xfff5d8, [0, ROOM.height - 0.6, 0], {
    castShadow: false,
  });
  const material = panel.material as THREE.MeshStandardMaterial;
  material.emissive.setHex(0xffe6a8);
  material.emissiveIntensity = 1.6;
  material.roughness = 0.2;
  group.add(panel);
  return group;
}

function createBedheadPanel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'bedhead-panel';
  group.position.set(-0.2, 0, -ROOM.depth / 2 + 0.3);

  group.add(box([2.4, 0.4, 0.08], 0xfafcfc, [0, 1.85, 0], { metalness: 0.2, roughness: 0.4 }));
  const moduleLights = [0x54c8ed, 0xeaeaea, 0xfff0a8, 0xffd28a];
  for (let i = 0; i < 4; i += 1) {
    const x = -0.9 + i * 0.6;
    group.add(
      box([0.4, 0.32, 0.1], 0xffffff, [x, 1.85, 0.05], { metalness: 0.3, roughness: 0.5 }),
      box([0.2, 0.08, 0.04], moduleLights[i] ?? 0xeaeaea, [x, 1.78, 0.12], { castShadow: false }),
    );
  }
  const outletLights = [0x54c8ed, 0xffaa5a, 0x55cc77, 0xe7e7e7];
  for (let i = 0; i < 4; i += 1) {
    const x = -0.9 + i * 0.6;
    group.add(
      box([0.3, 0.3, 0.05], 0xe6e6e6, [x, 1.45, 0.05], { metalness: 0.3 }),
      box([0.08, 0.08, 0.04], outletLights[i] ?? 0xe7e7e7, [x, 1.45, 0.09], { castShadow: false }),
    );
  }
  group.add(box([0.04, 0.3, 0.04], 0xb8c6cf, [-0.9, 1.15, 0.1], { metalness: 0.2 }));
  return group;
}

function createIVStand(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'iv-stand';
  group.position.set(1.7, 0, -ROOM.depth / 2 + 0.55);

  group.add(
    box([0.55, 0.08, 0.55], 0xcfd4d8, [0, 0.1, 0], { metalness: 0.4 }),
    box([0.12, 0.4, 0.12], 0xb4bcc2, [0, 0.3, 0], { metalness: 0.5 }),
    box([0.06, 1.8, 0.06], 0xe0e6ea, [0, 1.35, 0], { metalness: 0.7, roughness: 0.3 }),
    box([0.04, 0.04, 0.4], 0xe0e6ea, [0, 2.25, 0.18], { metalness: 0.7 }),
    box([0.22, 0.4, 0.06], 0xd9eef3, [0, 2.05, 0.18], { roughness: 0.2 }),
    box([0.16, 0.25, 0.02], 0xa8d8e6, [0, 2.0, 0.22], { castShadow: false }),
    box([0.02, 1.2, 0.02], 0xc8d6dc, [0.08, 1.45, 0.22]),
  );
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const leg = box([0.05, 0.05, 0.35], 0xb4bcc2, [Math.cos(angle) * 0.2, 0.05, Math.sin(angle) * 0.2], { metalness: 0.5 });
    leg.rotation.y = -angle;
    group.add(leg);
  }
  return group;
}

function createPatientMonitor(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'patient-monitor';
  group.position.set(1.7, 1.7, -ROOM.depth / 2 + 0.45);

  group.add(box([0.6, 0.4, 0.16], 0xf8f8f8, [0, 0.45, 0], { metalness: 0.2, roughness: 0.4 }));
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.34),
    new THREE.MeshStandardMaterial({
      map: createMonitorTexture(),
      roughness: 0.2,
      emissive: 0x88ffcc,
      emissiveIntensity: 0.25,
    }),
  );
  screen.position.set(0, 0.46, 0.082);
  group.add(screen);
  for (const x of [-0.22, 0.22]) {
    group.add(box([0.06, 0.06, 0.06], 0x888888, [x, 0.25, 0.1], { metalness: 0.7 }));
  }
  return group;
}

function createMonitorCabinet(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'monitor-cabinet';
  group.add(
    box([0.9, 1.3, 0.4], COLORS.cabinetWood, [1.7, 0.65, -ROOM.depth / 2 + 0.3], { roughness: 0.75 }),
    box([0.7, 1.0, 0.03], COLORS.cabinetDoor, [1.7, 0.65, -ROOM.depth / 2 + 0.5], { roughness: 0.7 }),
    box([0.1, 0.04, 0.04], COLORS.brass, [1.7, 0.65, -ROOM.depth / 2 + 0.53], { metalness: 0.5 }),
  );
  return group;
}

function createHospitalBed(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'hospital-bed';
  group.position.set(-0.4, 0, -0.6);
  group.rotation.y = 0.18;

  const frameColor = 0xeae3d1;
  group.add(box([2.4, 0.18, 1.2], frameColor, [0, 0.55, 0], { roughness: 0.7 }));
  for (const dx of [-1.05, 1.05]) {
    for (const dz of [-0.45, 0.45]) {
      group.add(
        box([0.12, 0.5, 0.12], 0xe0d9c7, [dx, 0.25, dz], { roughness: 0.6 }),
        box([0.18, 0.1, 0.18], 0x666666, [dx, 0.05, dz], { metalness: 0.6, roughness: 0.4 }),
      );
    }
  }
  group.add(
    box([2.4, 0.5, 0.08], 0xefe9da, [0, 1.2, -0.6], { roughness: 0.6 }),
    box([2.4, 0.1, 0.18], 0xefe9da, [0, 1.55, -0.55], { roughness: 0.6 }),
    box([2.4, 0.4, 0.08], 0xefe9da, [0, 1.0, 0.6], { roughness: 0.6 }),
  );
  // 两侧护栏
  for (const side of [1, -1]) {
    group.add(box([2.2, 0.45, 0.04], 0xf2ecdc, [0, 0.85, side * 0.55], { metalness: 0.3, roughness: 0.4 }));
    for (let i = 0; i < 4; i += 1) {
      group.add(box([0.04, 0.45, 0.04], frameColor, [-1 + i * 0.65, 0.85, side * 0.55], { roughness: 0.5 }));
    }
    for (const x of [-1.05, 1.05]) {
      group.add(box([0.06, 0.7, 0.06], 0xc0b998, [x, 0.7, side * 0.55], { metalness: 0.4 }));
    }
  }
  group.add(
    box([2.2, 0.18, 1.0], 0xfcfaf4, [0, 0.74, 0], { roughness: 0.95 }),
    box([2.0, 0.12, 0.95], 0xffffff, [0.05, 0.88, 0.05], { roughness: 0.95 }),
    box([2.05, 0.08, 0.18], 0xf6f4ee, [0.05, 0.92, 0.4], { roughness: 0.9 }),
    box([0.7, 0.16, 0.45], 0xffffff, [0, 0.92, -0.4], { roughness: 0.95 }),
  );
  return group;
}

function createNightstand(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'nightstand';
  group.position.set(-ROOM.width / 2 + 0.55, 0, -ROOM.depth / 2 + 1.0);
  group.add(box([0.7, 0.7, 0.55], 0xeae3d1, [0, 0.35, 0], { roughness: 0.75 }));
  group.add(
    box([0.6, 0.28, 0.02], 0xe1d8c4, [0, 0.52, 0.28]),
    box([0.6, 0.28, 0.02], 0xe1d8c4, [0, 0.18, 0.28]),
    box([0.18, 0.03, 0.025], COLORS.brass, [0, 0.52, 0.3], { metalness: 0.5 }),
    box([0.18, 0.03, 0.025], COLORS.brass, [0, 0.18, 0.3], { metalness: 0.5 }),
  );
  return group;
}

function createTablePlant(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'table-plant';
  group.position.set(-ROOM.width / 2 + 0.55, 0.7, -ROOM.depth / 2 + 0.9);
  group.add(box([0.18, 0.13, 0.18], 0xc2855b, [0, 0.065, 0], { roughness: 0.8 }));
  const leafColors = [0x4caf50, 0x66bb6a, 0x81c784];
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2;
    const leaf = box([0.08, 0.28, 0.04], leafColors[i % leafColors.length] ?? 0x4caf50, [
      Math.cos(angle) * 0.07,
      0.18 + (i % 3) * 0.02,
      Math.sin(angle) * 0.07,
    ], { roughness: 0.7 });
    leaf.rotation.y = -angle;
    leaf.rotation.z = 0.15;
    group.add(leaf);
  }
  group.add(box([0.1, 0.18, 0.06], 0x4caf50, [0, 0.32, 0]));
  return group;
}

function createBigPlant(potColor: number, x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'big-plant';
  group.position.set(x, 0, z);
  group.add(box([0.65, 0.45, 0.65], potColor, [0, 0.22, 0], { roughness: 0.6 }));
  const layers = [
    { y: 0.45, r: 0.28, count: 9, scale: 0.32, color: 0x4ca64e },
    { y: 0.7, r: 0.22, count: 7, scale: 0.27, color: 0x5cc25e },
    { y: 0.95, r: 0.16, count: 5, scale: 0.22, color: 0x6dd56e },
  ];
  layers.forEach((layer, layerIndex) => {
    for (let i = 0; i < layer.count; i += 1) {
      const angle = (i / layer.count) * Math.PI * 2 + layerIndex * 0.3;
      const leaf = box([layer.scale, 0.35, layer.scale * 0.4], layer.color, [
        Math.cos(angle) * layer.r,
        layer.y,
        Math.sin(angle) * layer.r,
      ], { roughness: 0.6 });
      leaf.rotation.y = -angle;
      leaf.rotation.z = 0.3;
      group.add(leaf);
    }
  });
  return group;
}

function createTrolley(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'medical-trolley';
  group.position.set(2.0, 0, 0.8);
  group.rotation.y = -0.4;

  for (const x of [-0.35, 0.35]) {
    for (const z of [-0.25, 0.25]) {
      group.add(box([0.05, 1.0, 0.05], 0xe6eaee, [x, 0.5, z], { metalness: 0.7, roughness: 0.3 }));
    }
  }
  group.add(
    box([0.85, 0.06, 0.65], 0xf6f6f6, [0, 1.05, 0], { roughness: 0.7 }),
    box([0.85, 0.04, 0.65], 0xeaeae6, [0, 0.55, 0], { roughness: 0.7 }),
    box([0.85, 0.06, 0.65], 0xf0eee8, [0, 0.08, 0], { roughness: 0.7 }),
    box([0.85, 0.05, 0.05], 0xc8cdd2, [0, 1.05, -0.35], { metalness: 0.5 }),
  );
  group.add(
    box([0.1, 0.16, 0.08], 0x88b8c8, [-0.25, 1.16, 0], { roughness: 0.3 }),
    box([0.1, 0.16, 0.08], 0xe8c8a4, [-0.05, 1.16, -0.05], { roughness: 0.3 }),
    box([0.12, 0.12, 0.1], 0xffffff, [0.2, 1.14, 0.05], { roughness: 0.4 }),
    box([0.25, 0.04, 0.18], 0xb8c0c8, [0.18, 1.1, 0.15], { roughness: 0.6 }),
    box([0.3, 0.08, 0.2], 0xfafafa, [-0.15, 0.62, 0.0], { roughness: 0.95 }),
    box([0.25, 0.06, 0.18], 0xeaf2f6, [0.18, 0.6, 0.05], { roughness: 0.95 }),
  );
  for (const x of [-0.38, 0.38]) {
    for (const z of [-0.27, 0.27]) {
      group.add(box([0.08, 0.08, 0.12], 0x444444, [x, 0.06, z], { metalness: 0.6 }));
    }
  }
  return group;
}

// ---------- 程序化纹理 ----------

function createTileTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  context.fillStyle = '#eef3f7';
  context.fillRect(0, 0, 512, 512);
  context.strokeStyle = '#c9d4dc';
  context.lineWidth = 1.5;
  for (let i = 0; i <= 8; i += 1) {
    const p = i * 64;
    context.beginPath();
    context.moveTo(p, 0);
    context.lineTo(p, 512);
    context.stroke();
    context.beginPath();
    context.moveTo(0, p);
    context.lineTo(512, p);
    context.stroke();
  }
  context.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 6; i += 1) {
    context.fillRect((i * 89) % 500, (i * 137) % 500, 8, 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createMonitorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  context.fillStyle = '#0c1a14';
  context.fillRect(0, 0, 512, 320);
  context.strokeStyle = 'rgba(80,180,120,0.15)';
  context.lineWidth = 1;
  for (let x = 0; x < 512; x += 16) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 320);
    context.stroke();
  }
  for (let y = 0; y < 320; y += 16) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(512, y);
    context.stroke();
  }
  // ECG 主波形
  context.strokeStyle = '#4ade80';
  context.lineWidth = 2.5;
  context.beginPath();
  context.moveTo(0, 160);
  for (let x = 0; x < 512; x += 6) {
    const phase = (x + 60) % 110;
    let y = 160;
    if (phase < 6) y = 80;
    else if (phase < 12) y = 190;
    else if (phase < 18) y = 120;
    else y = 160 + Math.sin(x * 0.06) * 4;
    context.lineTo(x, y);
  }
  context.stroke();
  // SpO₂ 波形
  context.strokeStyle = '#5ac8ff';
  context.lineWidth = 2;
  context.beginPath();
  for (let x = 0; x < 512; x += 4) {
    const y = 260 + Math.sin(x * 0.04) * 8 + Math.sin(x * 0.13) * 3;
    if (x === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  // 呼吸波形
  context.strokeStyle = '#ffb84d';
  context.beginPath();
  for (let x = 0; x < 512; x += 4) {
    const y = 100 + Math.sin(x * 0.06 + 0.4) * 20;
    if (x === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  // 顶部生命体征数字
  context.textBaseline = 'top';
  context.font = 'bold 36px "Courier New", monospace';
  context.fillStyle = '#ffd24d';
  context.fillText('HR  78', 14, 14);
  context.fillStyle = '#5ac8ff';
  context.fillText('SpO₂ 98', 200, 14);
  context.fillStyle = '#ff8a5a';
  context.fillText('RR  16', 380, 14);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

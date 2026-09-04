/**
 * 学校内部 · 体素教室（独立模块）
 *
 * 完全自包含：只依赖 three 标准库，不 import 项目内其它业务代码。
 * 后续优化教室画面时，只需修改本文件与同目录 style.css。
 */
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type ViewName = 'overview' | 'podium' | 'students';

interface RoomView {
  position: [number, number, number];
  target: [number, number, number];
}

const ROOM = {
  id: 'school-classroom-01',
  width: 12,
  depth: 10,
  height: 6,
  wallThickness: 0.25,
  views: {
    overview: { position: [14, 12, 16], target: [0, 2, 0] },
    podium: { position: [7.5, 6.5, 4.5], target: [-2.8, 1.6, -2.0] },
    students: { position: [7.0, 6.0, 6.0], target: [1.2, 1.0, 2.6] },
  } satisfies Record<ViewName, RoomView>,
} as const;

const COLORS = {
  wallFront: 0xf4f0ea,
  wallSide: 0xd6dde6,
  wallBack: 0xffffff,
  baseboard: 0xb89878,
  deskWood: 0x7a4a2a,
  deskWoodDark: 0x4a2810,
  shelfWood: 0x6b3f24,
  studentYellow: 0xe6a91c,
  metalDark: 0x444444,
  metalMid: 0x333333,
} as const;

const app = document.getElementById('classroom-scene');
if (!app) throw new Error('Missing #classroom-scene');

try {
  bootstrap(app);
} catch (error) {
  console.error(error);
  const fallback = document.getElementById('classroom-webgl-fallback');
  if (fallback) fallback.hidden = false;
}

function bootstrap(container: HTMLElement): void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb5dbf3);
  scene.fog = new THREE.Fog(0xb5dbf3, 22, 44);

  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 120);
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
  controls.minDistance = 10;
  controls.maxDistance = 30;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.4;

  addLighting(scene);

  scene.add(
    createFloor(),
    createWalls(),
    createBookshelf(),
    createCompletionsSign(),
    createWallClock(),
    createWindowView(),
    createDisplayBoard(),
    createTeacherDesk(),
    createLaptop(),
    createDeskLamp(),
    createOfficeChair(),
    createTeacher(),
    createStudentDesk(0.5, 2.7, 0.25),
    createStudentDesk(2.0, 2.5, 0.1),
    createTrashBin(),
    createFloorPlant(),
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

  const startedAt = performance.now();
  const animate = (): void => {
    requestAnimationFrame(animate);
    if (flight) {
      camera.position.lerp(flight.position, 0.09);
      controls.target.lerp(flight.target, 0.09);
      if (camera.position.distanceTo(flight.position) < 0.025 && controls.target.distanceTo(flight.target) < 0.025) flight = null;
    }
    const displayScreen = scene.getObjectByName('display-screen-glow');
    if (displayScreen instanceof THREE.Mesh && displayScreen.material instanceof THREE.MeshStandardMaterial) {
      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      displayScreen.material.emissiveIntensity = 0.22 + Math.sin(elapsedSeconds * 1.4) * 0.03;
    }
    controls.update();
    renderer.render(scene, camera);
  };
  animate();
}

function addLighting(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8b890, 0.6));

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-6, 8, -4);
  scene.add(fill);
}

// ---------- 通用工具 ----------

function box(
  size: [number, number, number],
  color: number,
  position: [number, number, number],
  options: { roughness?: number; metalness?: number; castShadow?: boolean } = {},
): THREE.Mesh {
  const { roughness = 0.85, metalness = 0.02, castShadow = true } = options;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshStandardMaterial({ color, roughness, metalness }),
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function namedBox(name: string, mesh: THREE.Mesh): THREE.Mesh {
  mesh.name = name;
  return mesh;
}

// ---------- 房间外壳 ----------

function createFloor(): THREE.Mesh {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM.width, 0.2, ROOM.depth),
    new THREE.MeshStandardMaterial({ map: createWoodTexture(), roughness: 0.7 }),
  );
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  return floor;
}

function createWalls(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'classroom-walls';
  const t = ROOM.wallThickness;

  const frontWall = box([ROOM.width, ROOM.height, t], COLORS.wallFront, [0, ROOM.height / 2, -ROOM.depth / 2 + t / 2], { castShadow: false });
  const sideWall = box([t, ROOM.height, ROOM.depth], COLORS.wallSide, [ROOM.width / 2 - t / 2, ROOM.height / 2, 0], { castShadow: false });
  const backWall = box([t, ROOM.height, ROOM.depth], COLORS.wallBack, [-ROOM.width / 2 + t / 2, ROOM.height / 2, 0], { castShadow: false });
  group.add(frontWall, sideWall, backWall);

  const baseY = 0.15;
  group.add(
    box([ROOM.width, 0.3, 0.05], COLORS.baseboard, [0, baseY, -ROOM.depth / 2 + 0.18], { castShadow: false }),
    box([0.05, 0.3, ROOM.depth], COLORS.baseboard, [ROOM.width / 2 - 0.18, baseY, 0], { castShadow: false }),
    box([0.05, 0.3, ROOM.depth], COLORS.baseboard, [-ROOM.width / 2 + 0.18, baseY, 0], { castShadow: false }),
  );
  return group;
}

// ---------- 家具与陈设 ----------

function createBookshelf(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'bookshelf';
  group.position.set(-ROOM.width / 2 + 1.8, 0, -ROOM.depth / 2 + 0.55);

  const main = box([2.8, 3.6, 0.7], COLORS.shelfWood, [0, 1.8, 0], { roughness: 0.7 });
  group.add(main);
  for (let i = 0; i < 3; i += 1) {
    group.add(box([2.8, 0.06, 0.7], COLORS.shelfWood, [0, 0.9 + i * 0.95, 0.01], { roughness: 0.7 }));
  }

  const bookColors = [0x6a3aa0, 0xe25c5c, 0x4a8fcf, 0x86b54a, 0xe0a23a, 0xd44a8c];
  for (const yBase of [0.1, 1.05]) {
    let x = -1.2;
    for (const color of bookColors) {
      const bookWidth = 0.18 + ((yBase * 7 + x) % 0.07);
      const bookHeight = 0.7 + ((x * 13 + yBase * 5) % 0.15 + 0.15) % 0.15;
      const book = box([bookWidth, bookHeight, 0.55], color, [x + bookWidth / 2, yBase + bookHeight / 2, 0.05], { roughness: 0.6 });
      group.add(book);
      x += bookWidth + 0.005;
    }
  }

  const stackColors = [0x9b59ff, 0x4f9ff7, 0x35d09c, 0xffcf4a, 0xff5d6c];
  let stackY = 2.0;
  stackColors.forEach((color, index) => {
    const b = box([1.0 - index * 0.06, 0.16, 0.55], color, [0, stackY + 0.08, 0.05], { roughness: 0.55 });
    group.add(b);
    stackY += 0.16;
  });

  const tilt1 = box([0.6, 0.2, 0.5], 0xff7a3a, [-0.7, 1.7, 0.1]);
  tilt1.rotation.z = 0.3;
  const tilt2 = box([0.6, 0.2, 0.5], 0x4ac96b, [0.7, 1.7, 0.1]);
  tilt2.rotation.z = -0.25;
  group.add(tilt1, tilt2);

  group.add(
    box([0.45, 0.35, 0.5], 0x8a5a3a, [-0.9, 0.55, 0.05]),
    box([0.45, 0.35, 0.5], 0x4a8fcf, [0.9, 0.55, 0.05]),
  );
  return group;
}

function createCompletionsSign(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'completions-sign';
  group.position.set(-ROOM.width / 2 + 1.8, 4.0, -ROOM.depth / 2 + 0.42);

  group.add(box([2.5, 1.0, 0.06], 0x222222, [0, 0.45, -0.01], { roughness: 0.5 }));
  group.add(box([2.4, 0.9, 0.05], 0x111111, [0, 0.45, 0], { roughness: 0.4, castShadow: false }));

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(2.35, 0.85),
    new THREE.MeshStandardMaterial({ map: createSignTexture(), roughness: 0.3 }),
  );
  face.position.set(0, 0.45, 0.03);
  group.add(face);
  return group;
}

function createWallClock(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wall-clock';
  group.position.set(-ROOM.width / 2 + 0.45, 4.7, -ROOM.depth / 2 + 0.3);

  group.add(box([0.55, 0.55, 0.1], 0xd83a3a, [0, 0, 0]));
  group.add(box([0.45, 0.45, 0.02], 0xffffff, [0, 0, 0.07], { castShadow: false }));
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    group.add(box([0.04, 0.04, 0.02], 0x222222, [Math.cos(angle) * 0.18, Math.sin(angle) * 0.18, 0.09]));
  }
  const hour = box([0.03, 0.13, 0.01], 0x111111, [0.04, 0.04, 0.11]);
  hour.rotation.z = -0.8;
  const minute = box([0.02, 0.2, 0.01], 0x111111, [-0.02, 0.06, 0.12]);
  minute.rotation.z = 0.6;
  group.add(hour, minute);
  return group;
}

function createWindowView(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'classroom-window';
  group.position.set(0.3, 3.2, -ROOM.depth / 2 + 0.25);

  group.add(box([2.4, 2.2, 0.1], 0xffffff, [0, 0, 0]));
  group.add(box([2.2, 2.0, 0.03], 0xa8d8f0, [0, 0, 0.04], { castShadow: false }));
  group.add(box([2.2, 0.5, 0.04], 0x5fa84c, [0, -0.8, 0.05]));
  group.add(box([1.5, 0.9, 0.04], 0x3f7a35, [-0.4, -0.5, 0.04]));
  group.add(box([1.0, 0.6, 0.04], 0x4d8e44, [0.8, -0.55, 0.05]));
  group.add(box([0.15, 0.4, 0.04], 0x6b3f1f, [0.2, -0.45, 0.06]));
  group.add(box([0.5, 0.55, 0.04], 0x2f6e2a, [0.2, -0.1, 0.05]));
  group.add(
    box([0.06, 2.0, 0.02], 0xffffff, [0, 0, 0.08], { castShadow: false }),
    box([2.2, 0.06, 0.02], 0xffffff, [0, 0, 0.08], { castShadow: false }),
    box([2.6, 0.12, 0.25], 0xefeae0, [0, -1.12, 0.12]),
  );
  return group;
}

function createDisplayBoard(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'display-board';
  group.position.set(ROOM.width / 2 - 0.25, 3.4, -1);
  group.rotation.y = -Math.PI / 2;

  group.add(box([6.6, 4.4, 0.2], 0xeae0c8, [0, 0, 0]));
  const screen = box([6.2, 4.0, 0.05], 0x202428, [0, 0, 0.07], { roughness: 0.35 });
  group.add(namedBox('display-screen-glow', screen));

  const topPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(6.0, 0.3),
    new THREE.MeshStandardMaterial({ map: createDisplayTopTexture(), roughness: 0.3 }),
  );
  topPlane.position.set(0, 1.7, 0.11);
  group.add(topPlane);

  const iconColors = ['#7bc26b', '#d96a4f', '#4ba6e8', '#a05bd1'];
  const iconLabels = ['F', 'M', 'I', 'C'];
  for (let i = 0; i < 4; i += 1) {
    const cx = -2.0 + i * 1.4;
    group.add(box([1.0, 1.0, 0.06], 0x4a90e2, [cx, 0.6, 0.13]));

    const icon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshStandardMaterial({ map: createIconTexture(iconColors[i] ?? '#7bc26b', iconLabels[i] ?? 'F', i), roughness: 0.4 }),
    );
    icon.position.set(cx, 0.62, 0.17);
    group.add(icon);
  }

  const labels = ['CONTROLS', 'MOVE', 'IMAGES', 'CODE'];
  for (let i = 0; i < 4; i += 1) {
    const cx = -2.0 + i * 1.4;
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.26),
      new THREE.MeshStandardMaterial({ map: createLabelTexture(labels[i] ?? ''), transparent: true, roughness: 0.4 }),
    );
    label.position.set(cx, -0.1, 0.13);
    group.add(label);
  }

  group.add(box([6.0, 0.08, 0.02], 0xeae0c8, [0, -1.8, 0.11], { castShadow: false }));
  return group;
}

function createTeacherDesk(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'teacher-desk';
  group.position.set(-3, 0, -2.0);

  group.add(box([3.4, 0.15, 1.6], COLORS.deskWood, [0, 1.4, 0], { roughness: 0.6 }));
  for (const x of [-1.6, 1.6]) {
    for (const z of [-0.7, 0.7]) {
      group.add(box([0.15, 1.4, 0.15], COLORS.deskWoodDark, [x, 0.7, z], { roughness: 0.7 }));
    }
  }
  group.add(box([1.4, 0.45, 1.4], COLORS.deskWoodDark, [0.95, 0.95, 0], { roughness: 0.7 }));
  group.add(box([0.25, 0.05, 0.04], 0xc8a05c, [0.95, 1.05, 0.72], { metalness: 0.4 }));
  return group;
}

function createLaptop(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'laptop';
  group.position.set(-3.0, 1.5, -1.95);
  group.rotation.y = 0.3;

  group.add(box([1.3, 0.06, 0.85], 0xcfd2d6, [0, 0, 0], { roughness: 0.4, metalness: 0.3 }));
  const screenBody = box([1.3, 0.85, 0.06], 0x2b2f33, [0, 0.42, -0.38], { roughness: 0.5 });
  screenBody.rotation.x = -0.18;
  group.add(screenBody);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.7),
    new THREE.MeshStandardMaterial({ map: createLaptopScreenTexture(), roughness: 0.3 }),
  );
  screen.position.set(0, 0.46, -0.32);
  screen.rotation.x = -0.18;
  group.add(screen);

  const logo = box([0.18, 0.18, 0.01], 0xf2f2f2, [0, 0.08, -0.41], { castShadow: false });
  logo.rotation.x = -0.18;
  group.add(logo);
  return group;
}

function createDeskLamp(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'desk-lamp';
  group.position.set(-3.6, 1.5, -1.4);
  group.add(
    box([0.18, 0.06, 0.18], COLORS.metalMid, [0, 0.01, 0], { metalness: 0.5 }),
    box([0.06, 0.5, 0.06], COLORS.metalMid, [0, 0.28, 0], { metalness: 0.5 }),
  );
  const head = box([0.25, 0.16, 0.16], 0x222222, [0, 0.55, 0], { metalness: 0.6 });
  head.rotation.z = 0.3;
  group.add(head);
  return group;
}

function createOfficeChair(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'office-chair';
  group.position.set(-3.0, 0, -2.85);

  group.add(box([0.7, 0.1, 0.7], 0x222222, [0, 0.25, 0]));
  group.add(box([0.15, 0.6, 0.15], 0x444444, [0, 0.6, 0], { metalness: 0.5 }));
  group.add(box([0.95, 0.18, 0.95], 0xc8532a, [0, 1.0, 0]));
  group.add(box([0.9, 1.1, 0.18], 0xc8532a, [0, 1.55, -0.42]));
  for (const x of [-0.55, 0.55]) {
    group.add(box([0.12, 0.1, 0.6], 0x444444, [x, 1.3, -0.15], { metalness: 0.4 }));
  }
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const leg = box([0.08, 0.08, 0.55], 0x333333, [Math.cos(angle) * 0.32, 0.12, Math.sin(angle) * 0.32], { metalness: 0.5 });
    leg.rotation.y = -angle;
    group.add(leg);
  }
  return group;
}

function createTeacher(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'teacher';
  group.position.set(-2.0, 0, 1.5);
  group.rotation.y = -0.4;

  const skin = 0xf2c8a0;
  const suit = 0x6e3a22;
  const trouser = 0x4a2812;

  group.add(
    box([0.7, 0.7, 0.7], skin, [0, 2.45, 0]),
    box([0.74, 0.22, 0.74], 0x222222, [0, 2.73, -0.02]),
    box([0.72, 0.12, 0.18], 0x222222, [0, 2.62, 0.32]),
    box([0.28, 0.18, 0.28], skin, [0, 2.05, 0]),
    box([0.95, 1.0, 0.55], suit, [0, 1.5, 0]),
    box([0.4, 0.85, 0.04], 0xfafafa, [0, 1.55, 0.29]),
    box([0.14, 0.5, 0.04], 0xd92626, [0, 1.3, 0.31]),
    box([0.18, 0.12, 0.04], 0xb81d1d, [0, 1.62, 0.31]),
  );
  for (const x of [-0.58, 0.58]) {
    group.add(
      box([0.22, 0.85, 0.28], suit, [x, 1.45, 0]),
      box([0.22, 0.18, 0.22], skin, [x, 0.95, 0]),
    );
  }
  for (const x of [-0.2, 0.2]) {
    group.add(
      box([0.32, 1.0, 0.34], trouser, [x, 0.5, 0]),
      box([0.34, 0.15, 0.5], 0x222222, [x, 0.07, 0.05]),
    );
  }
  // 眼睛 + 瞳孔
  for (const x of [-0.15, 0.15]) {
    group.add(
      box([0.1, 0.12, 0.02], 0xffffff, [x, 2.5, 0.36], { castShadow: false }),
      box([0.04, 0.06, 0.02], 0x111111, [x + (x < 0 ? 0.02 : 0.02), 2.5, 0.38], { castShadow: false }),
    );
  }
  // 眼镜（六边形环）
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.4 });
  for (const x of [-0.15, 0.15]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.11, 6), frameMaterial);
    ring.position.set(x, 2.5, 0.39);
    group.add(ring);
  }
  group.add(box([0.06, 0.02, 0.02], 0x111111, [0, 2.5, 0.39], { castShadow: false }));
  group.add(box([0.18, 0.04, 0.02], 0x8c3b2a, [0, 2.27, 0.36], { castShadow: false }));
  return group;
}

function createStudentDesk(x: number, z: number, rotationY: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'student-desk';
  group.position.set(x, 0, z);
  group.rotation.y = rotationY;

  group.add(
    box([0.55, 0.65, 0.08], COLORS.studentYellow, [0, 0.9, -0.22]),
    box([0.55, 0.08, 0.55], COLORS.studentYellow, [0, 0.55, 0]),
    box([0.7, 0.06, 0.42], COLORS.studentYellow, [0, 0.78, 0.32]),
  );
  for (const lx of [-0.27, 0.27]) group.add(box([0.07, 0.78, 0.07], 0x222222, [lx, 0.4, 0.45]));
  for (const lx of [-0.22, 0.22]) {
    for (const lz of [-0.18, 0.22]) group.add(box([0.06, 0.55, 0.06], 0x222222, [lx, 0.27, lz]));
  }
  return group;
}

function createTrashBin(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'trash-bin';
  group.position.set(-0.5, 0, -1.6);
  group.add(
    box([0.5, 0.6, 0.5], 0xc4c8cc, [0, 0.3, 0], { roughness: 0.4, metalness: 0.3 }),
    box([0.55, 0.06, 0.55], 0x9aa0a8, [0, 0.62, 0], { roughness: 0.3, metalness: 0.4 }),
  );
  return group;
}

function createFloorPlant(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'floor-plant';
  group.position.set(2.8, 0, -3.0);
  group.add(box([0.45, 0.25, 0.45], 0xb87850, [0, 0.125, 0]));
  const leafColors = [0x3fa64c, 0x52b85a, 0x68c96b];
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const leaf = box([0.3, 0.4, 0.05], leafColors[i % leafColors.length] ?? 0x3fa64c, [Math.cos(angle) * 0.18, 0.42, Math.sin(angle) * 0.18]);
    leaf.rotation.y = -angle;
    group.add(leaf);
  }
  return group;
}

// ---------- 程序化纹理 ----------

function createWoodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  context.fillStyle = '#6e4a2c';
  context.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16; i += 1) {
    const y = i * 32;
    const tone = 0.85 + ((i * 37) % 25) / 100;
    context.fillStyle = `rgb(${Math.floor(110 * tone)},${Math.floor(74 * tone)},${Math.floor(44 * tone)})`;
    context.fillRect(0, y, 512, 30);
    context.strokeStyle = 'rgba(40,25,15,0.25)';
    context.lineWidth = 0.7;
    for (let k = 0; k < 6; k += 1) {
      const yy = y + ((i * 13 + k * 7) % 30);
      context.beginPath();
      context.moveTo(0, yy);
      context.bezierCurveTo(150, yy + 1, 350, yy - 1, 512, yy);
      context.stroke();
    }
    context.fillStyle = 'rgba(20,10,5,0.7)';
    context.fillRect(0, y + 29, 512, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  context.fillStyle = '#111111';
  context.fillRect(0, 0, 1024, 384);
  context.fillStyle = '#ffffff';
  context.font = 'bold 130px "Courier New", monospace';
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.fillText('COMPLETIONS:', 30, 192);
  context.textAlign = 'center';
  context.fillText('70397', 740, 192);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDisplayTopTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  context.fillStyle = '#1d2125';
  context.fillRect(0, 0, 1280, 64);
  context.fillStyle = '#ffffff';
  context.font = 'bold 38px "Courier New", monospace';
  context.textBaseline = 'middle';
  context.fillText('▼ CHOOSE A CATEGORY ▼', 30, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createIconTexture(color: string, label: string, index: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  context.fillStyle = color;
  context.fillRect(0, 0, 256, 256);
  context.fillStyle = 'rgba(0,0,0,0.25)';
  if (index === 0) {
    context.fillRect(60, 60, 140, 140);
    context.fillStyle = '#5fa84c';
    context.fillRect(80, 80, 100, 100);
  } else if (index === 1) {
    context.fillRect(70, 80, 40, 100);
    context.fillRect(140, 60, 40, 120);
  } else if (index === 2) {
    context.beginPath();
    context.arc(128, 128, 60, 0, Math.PI * 2);
    context.fill();
  } else {
    context.fillRect(60, 70, 140, 30);
    context.fillRect(60, 110, 140, 30);
    context.fillRect(60, 150, 140, 30);
  }
  context.fillStyle = '#ffffff';
  context.font = 'bold 80px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLabelTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  context.fillStyle = '#ffffff';
  context.font = 'bold 60px "Courier New", monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 256, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLaptopScreenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  const gradient = context.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, '#6dbcd6');
  gradient.addColorStop(0.5, '#76c8b4');
  gradient.addColorStop(1, '#8fb56e');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 320);
  context.fillStyle = '#4f8a4a';
  context.beginPath();
  context.moveTo(0, 220);
  context.lineTo(150, 120);
  context.lineTo(280, 200);
  context.lineTo(380, 140);
  context.lineTo(512, 210);
  context.lineTo(512, 320);
  context.lineTo(0, 320);
  context.fill();
  context.fillStyle = '#3a6a35';
  context.beginPath();
  context.moveTo(0, 250);
  context.lineTo(100, 180);
  context.lineTo(220, 250);
  context.lineTo(340, 190);
  context.lineTo(512, 250);
  context.lineTo(512, 320);
  context.lineTo(0, 320);
  context.fill();
  context.fillStyle = '#fff5b8';
  context.beginPath();
  context.arc(380, 90, 40, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

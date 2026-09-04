import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { setupHomeSpatialDocuments, type HomeViewName } from './spatial-documents';
import { COLORS, ROOM } from './config';

const app = document.getElementById('home-scene');
if (!app) throw new Error('Missing #home-scene');

try {
  bootstrap(app);
} catch (error) {
  console.error(error);
  const fallback = document.getElementById('home-webgl-fallback');
  if (fallback) fallback.hidden = false;
}

function bootstrap(container: HTMLElement): void {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb9dfff, 18, 36);

  const camera = new THREE.PerspectiveCamera(fovForAspect(window.innerWidth / window.innerHeight), window.innerWidth / window.innerHeight, 0.1, 80);
  const overview = ROOM.views.overview;
  camera.position.fromArray(overview.position);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.dataset.scene = ROOM.id;
  container.prepend(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.fromArray(overview.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 24;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.48;

  addLighting(scene);
  const desk = createDesk();
  const movingBoxes = createMovingBoxes();
  const drumPractice = createDrumPractice();
  const tennisGear = createTennisGear();
  scene.add(
    createRoomShell(),
    createCarpet(),
    desk,
    createChair(),
    createSofa(),
    createFloorLamp(),
    createWallShelves(),
    createPlant(),
    createCat(),
    createToyBall(),
    movingBoxes,
    drumPractice,
    tennisGear,
  );

  let flight: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  const setView = (name: HomeViewName): void => {
    const view = ROOM.views[name];
    flight = { position: new THREE.Vector3().fromArray(view.position), target: new THREE.Vector3().fromArray(view.target) };
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.view === name));
    });
  };
  controls.addEventListener('start', () => { flight = null; });
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view as HomeViewName));
  });
  document.getElementById('reset-room')?.addEventListener('click', () => setView('overview'));
  renderer.domElement.addEventListener('dblclick', () => setView('overview'));

  const spatialDocuments = setupHomeSpatialDocuments({
    renderer,
    camera,
    focusView: setView,
    anchors: new Map([
      [desk.name, desk],
      [movingBoxes.name, movingBoxes],
      [drumPractice.name, drumPractice],
      [tennisGear.name, tennisGear],
    ]),
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
      camera.position.lerp(flight.position, 0.09);
      controls.target.lerp(flight.target, 0.09);
      if (camera.position.distanceTo(flight.position) < 0.025 && controls.target.distanceTo(flight.target) < 0.025) flight = null;
    }
    const screen = scene.getObjectByName('computer-screen');
    if (screen instanceof THREE.Mesh && screen.material instanceof THREE.MeshStandardMaterial) {
      screen.material.emissiveIntensity = 0.38 + Math.sin(elapsedSeconds * 1.8) * 0.035;
    }
    spatialDocuments.update(elapsedSeconds);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();
}

function addLighting(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xf3f8ff, 0x354d84, 2.2));
  scene.add(new THREE.AmbientLight(0xbad9ff, 0.75));

  const sun = new THREE.DirectionalLight(0xfff0d9, 3.8);
  sun.position.set(7, 12, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 35;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);

  const screenLight = new THREE.PointLight(0x70e0dc, 1.8, 5.5, 2);
  screenLight.position.set(1.45, 2.65, -1.25);
  scene.add(screenLight);

  const deskLight = new THREE.PointLight(0xffb771, 1.35, 4.2, 2);
  deskLight.position.set(3.1, 3.15, -1.2);
  scene.add(deskLight);
}

function createRoomShell(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'room-shell';
  const [width, height, depth] = ROOM.size;

  const floor = box('floor', [width, 0.28, depth], COLORS.floor, [0, -0.14, 0]);
  floor.receiveShadow = true;
  group.add(floor);

  const backWall = box('back-wall', [width, height, 0.28], COLORS.wall, [0, height / 2, -depth / 2]);
  const leftWall = box('left-wall', [0.28, height, depth], COLORS.wallDark, [-width / 2, height / 2, 0]);
  backWall.receiveShadow = true;
  leftWall.receiveShadow = true;
  group.add(backWall, leftWall);

  group.add(
    box('back-baseboard', [width - 0.15, 0.18, 0.16], COLORS.trim, [0, 0.09, -depth / 2 + 0.18]),
    box('left-baseboard', [0.16, 0.18, depth - 0.15], COLORS.trim, [-width / 2 + 0.18, 0.09, 0]),
  );

  const wallArt = box('wall-art-frame', [3.05, 1.8, 0.14], 0xf1d89c, [1.3, 3.55, -depth / 2 + 0.24]);
  const artwork = box('wall-art', [2.72, 1.47, 0.08], 0x2958a6, [1.3, 3.55, -depth / 2 + 0.34]);
  const artMaterial = artwork.material as THREE.MeshStandardMaterial;
  artMaterial.map = createArtworkTexture();
  artMaterial.roughness = 0.68;
  group.add(wallArt, artwork);

  const windowGroup = createWindow();
  group.add(windowGroup);

  return group;
}

function createCarpet(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'carpet';
  const carpet = roundedBox('carpet-surface', [5.5, 0.12, 4.25], COLORS.carpet, [0.2, 0.08, 0.75], 0.12);
  const material = carpet.material as THREE.MeshStandardMaterial;
  material.map = createCarpetTexture();
  material.roughness = 0.92;
  carpet.receiveShadow = true;
  group.add(carpet);

  const fringeMaterial = new THREE.MeshStandardMaterial({ color: 0xb7fff1, roughness: 0.9 });
  for (let i = 0; i < 22; i += 1) {
    const x = -2.45 + i * 0.235;
    for (const z of [-1.43, 2.93]) {
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.25), fringeMaterial);
      fringe.position.set(x, 0.08, z);
      fringe.rotation.y = (i % 3 - 1) * 0.08;
      fringe.castShadow = false;
      group.add(fringe);
    }
  }
  return group;
}

function createDesk(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'desk-and-computer';
  group.position.set(1.55, 0, -1.72);

  const top = roundedBox('desk-top', [4.25, 0.26, 1.78], COLORS.desk, [0, 2.22, 0], 0.12);
  group.add(top);

  for (const x of [-1.7, 1.7]) {
    for (const z of [-0.62, 0.62]) group.add(box('desk-leg', [0.22, 2.18, 0.22], 0xe5d8e4, [x, 1.08, z]));
  }
  group.add(box('desk-apron', [3.7, 0.35, 0.18], COLORS.deskEdge, [0, 1.95, -0.7]));
  group.add(createComputer());
  group.add(createDeskLamp());
  return group;
}

function createComputer(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'computer';
  group.position.set(-0.35, 2.38, -0.08);

  const monitor = roundedBox('computer-monitor', [1.45, 1.45, 0.78], COLORS.computer, [0, 0.77, 0], 0.12);
  const screen = roundedBox('computer-screen', [1.02, 0.75, 0.045], COLORS.screen, [0, 0.88, 0.405], 0.07);
  screen.name = 'computer-screen';
  const screenMaterial = screen.material as THREE.MeshStandardMaterial;
  screenMaterial.emissive.setHex(COLORS.screenGlow);
  screenMaterial.emissiveIntensity = 0.38;
  screenMaterial.roughness = 0.28;
  const base = roundedBox('computer-base', [1.7, 0.24, 1.08], COLORS.computer, [0, 0.08, 0.05], 0.08);
  const drive = box('computer-drive', [0.45, 0.06, 0.03], COLORS.computerDark, [0.3, 0.47, 0.405]);
  const led = box('computer-led', [0.06, 0.06, 0.03], 0xee6d6d, [-0.46, 0.47, 0.405]);
  group.add(monitor, screen, base, drive, led);

  const keyboardBase = roundedBox('keyboard', [1.72, 0.1, 0.63], 0xd7cfb4, [0.2, 0.04, 0.92], 0.05);
  keyboardBase.rotation.x = -0.055;
  group.add(keyboardBase);
  const keyMaterial = new THREE.MeshStandardMaterial({ color: 0xeee9d3, roughness: 0.78 });
  const keyGeometry = new THREE.BoxGeometry(0.13, 0.035, 0.1);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      const key = new THREE.Mesh(keyGeometry, keyMaterial);
      key.position.set(-0.48 + column * 0.145, 0.12, 0.72 + row * 0.12);
      key.castShadow = true;
      group.add(key);
    }
  }

  const mouse = roundedBox('mouse', [0.32, 0.12, 0.44], COLORS.computer, [1.22, 0.08, 0.93], 0.1);
  group.add(mouse);
  return group;
}

function createChair(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'chair';
  group.position.set(1.55, 0, 1.25);
  group.rotation.y = -0.12;

  const seat = roundedBox('chair-seat', [1.45, 0.32, 1.35], COLORS.chair, [0, 1.35, 0], 0.16);
  const back = roundedBox('chair-back', [1.45, 1.65, 0.32], COLORS.chair, [0, 2.25, 0.58], 0.18);
  back.rotation.x = -0.08;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.05, 12), new THREE.MeshStandardMaterial({ color: COLORS.metal, metalness: 0.35, roughness: 0.5 }));
  stem.position.y = 0.72;
  stem.castShadow = true;
  group.add(seat, back, stem);

  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x343a50, roughness: 0.62 });
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const arm = box('chair-base-arm', [0.85, 0.09, 0.1], COLORS.metal, [Math.cos(angle) * 0.34, 0.25, Math.sin(angle) * 0.34]);
    arm.rotation.y = -angle;
    group.add(arm);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.09, 12), wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(Math.cos(angle) * 0.75, 0.14, Math.sin(angle) * 0.75);
    wheel.castShadow = true;
    group.add(wheel);
  }
  return group;
}

function createSofa(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'sofa';
  group.position.set(-2.65, 0, -2.25);

  const frame = roundedBox('sofa-frame', [3.55, 0.65, 1.5], 0xc94f83, [0, 0.5, 0], 0.2);
  const back = roundedBox('sofa-back', [3.55, 1.35, 0.38], 0xd9578a, [0, 1.4, -0.58], 0.2);
  const leftArm = roundedBox('sofa-arm', [0.38, 0.85, 1.48], 0xd9578a, [-1.58, 0.95, 0], 0.18);
  const rightArm = roundedBox('sofa-arm', [0.38, 0.85, 1.48], 0xd9578a, [1.58, 0.95, 0], 0.18);
  group.add(frame, back, leftArm, rightArm);

  for (const x of [-0.76, 0.76]) {
    const seat = roundedBox('sofa-seat-cushion', [1.42, 0.32, 1.08], 0xf17fab, [x, 0.9, 0.08], 0.16);
    const cushion = roundedBox('sofa-back-cushion', [1.36, 0.86, 0.3], 0xe96f9e, [x, 1.48, -0.32], 0.16);
    cushion.rotation.x = -0.08;
    group.add(seat, cushion);
  }

  for (const x of [-1.36, 1.36]) group.add(box('sofa-leg', [0.2, 0.32, 0.2], 0xc79a59, [x, 0.16, 0.45]));
  return group;
}

function createFloorLamp(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'floor-lamp';
  group.position.set(-4.15, 0, -1.7);
  const metal = new THREE.MeshStandardMaterial({ color: 0xf1d77c, metalness: 0.28, roughness: 0.48 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 0.16, 20), metal);
  base.position.y = 0.08;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.65, 12), metal);
  stem.position.y = 1.95;
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.72, 0.72, 18),
    new THREE.MeshStandardMaterial({ color: 0xf2dc6b, roughness: 0.72, emissive: 0x6f5317, emissiveIntensity: 0.1 }),
  );
  shade.position.y = 3.65;
  for (const part of [base, stem, shade]) part.castShadow = true;
  const bulb = new THREE.PointLight(0xffcf78, 0.9, 3.7, 2);
  bulb.position.y = 3.45;
  group.add(base, stem, shade, bulb);
  return group;
}

function createWindow(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'sunset-window';
  const x = -4.82;
  const y = 3.35;
  const z = 0.45;
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.65, 2.05),
    new THREE.MeshStandardMaterial({ map: createWindowTexture(), roughness: 0.5, emissive: 0xf07c7c, emissiveIntensity: 0.08 }),
  );
  glass.position.set(x + 0.04, y, z);
  glass.rotation.y = Math.PI / 2;
  group.add(glass);
  group.add(
    box('window-frame-top', [0.2, 0.14, 2.9], 0xf4f1df, [x, y + 1.12, z]),
    box('window-frame-bottom', [0.28, 0.22, 3.05], 0xf4f1df, [x + 0.03, y - 1.12, z]),
    box('window-frame-left', [0.2, 2.15, 0.14], 0xf4f1df, [x, y, z - 1.4]),
    box('window-frame-right', [0.2, 2.15, 0.14], 0xf4f1df, [x, y, z + 1.4]),
    box('window-frame-center', [0.22, 2.08, 0.11], 0xf4f1df, [x + 0.02, y, z]),
  );
  return group;
}

function createWallShelves(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'collection-shelves';
  group.position.set(-1.55, 0, -3.58);
  const shelfColor = 0xc7d5f0;
  for (const y of [2.15, 3.05, 3.95]) group.add(roundedBox('shelf-board', [2.75, 0.16, 0.58], shelfColor, [0, y, 0], 0.05));
  group.add(
    box('shelf-side', [0.16, 2.1, 0.58], shelfColor, [-1.3, 3.0, 0]),
    box('shelf-side', [0.16, 2.1, 0.58], shelfColor, [1.3, 3.0, 0]),
  );
  group.add(createMusicKeyboard());

  const bookColors = [0xf0798e, 0x64b5d8, 0xf0c85d, 0x7ac17b, 0x9b7ed5];
  for (let i = 0; i < 7; i += 1) {
    const book = box('shelf-book', [0.18 + (i % 2) * 0.04, 0.52 + (i % 3) * 0.08, 0.35], bookColors[i % bookColors.length], [-0.92 + i * 0.25, 3.38, 0.02]);
    book.rotation.z = (i % 3 - 1) * 0.06;
    group.add(book);
  }
  group.add(createCameraProp());

  const toy = roundedBox('shelf-console', [0.72, 0.28, 0.42], 0x50516c, [0.74, 4.18, 0], 0.07);
  const toyLight = box('shelf-console-light', [0.18, 0.04, 0.025], 0xf07286, [0.88, 4.23, 0.23]);
  group.add(toy, toyLight);
  return group;
}

function createMusicKeyboard(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'music-keyboard';
  group.position.set(0, 2.34, 0.18);
  const base = roundedBox('keyboard-body', [2.35, 0.24, 0.62], 0x33394f, [0, 0, 0], 0.07);
  group.add(base);
  const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f0e7, roughness: 0.65 });
  const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x202535, roughness: 0.55 });
  const whiteKey = new THREE.BoxGeometry(0.16, 0.05, 0.42);
  const blackKey = new THREE.BoxGeometry(0.1, 0.08, 0.26);
  for (let i = 0; i < 13; i += 1) {
    const key = new THREE.Mesh(whiteKey, whiteMaterial);
    key.position.set(-0.96 + i * 0.16, 0.15, 0.08);
    key.castShadow = true;
    group.add(key);
    if (![2, 6, 9].includes(i) && i < 12) {
      const black = new THREE.Mesh(blackKey, blackMaterial);
      black.position.set(-0.88 + i * 0.16, 0.2, -0.02);
      black.castShadow = true;
      group.add(black);
    }
  }
  return group;
}

function createCameraProp(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'camera-prop';
  group.position.set(0.78, 3.34, 0.04);
  const body = roundedBox('camera-body', [0.65, 0.48, 0.34], 0x364052, [0, 0, 0], 0.08);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.22, 16), new THREE.MeshStandardMaterial({ color: 0x1c2433, metalness: 0.3, roughness: 0.35 }));
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.26;
  lens.castShadow = true;
  const shutter = box('camera-shutter', [0.12, 0.08, 0.08], 0xc4cfdf, [-0.18, 0.29, -0.02]);
  group.add(body, lens, shutter);
  return group;
}

function createDeskLamp(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'desk-lamp';
  group.position.set(1.38, 2.38, -0.18);
  const red = new THREE.MeshStandardMaterial({ color: 0xe64f57, roughness: 0.62 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.1, 16), red);
  base.position.y = 0.05;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.72, 10), red);
  stem.position.set(0, 0.42, 0);
  stem.rotation.z = -0.28;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.42, 16), red);
  shade.position.set(0.16, 0.82, 0.03);
  shade.rotation.z = -0.35;
  for (const part of [base, stem, shade]) part.castShadow = true;
  group.add(base, stem, shade);
  return group;
}

function createPlant(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'plant';
  group.position.set(4.05, 0, -2.1);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.44, 0.78, 12), new THREE.MeshStandardMaterial({ color: 0xe9e6d9, roughness: 0.82 }));
  pot.position.y = 0.39;
  pot.castShadow = true;
  group.add(pot, box('plant-pot-band', [1.02, 0.12, 1.02], 0xaec7e8, [0, 0.55, 0]));

  const greens = [0x3f8e58, 0x62aa5f, 0x2f794d];
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2;
    const leaf = roundedBox('plant-leaf', [0.22, 1.2 + (i % 3) * 0.28, 0.4], greens[i % greens.length], [Math.cos(angle) * 0.3, 1.12 + (i % 2) * 0.2, Math.sin(angle) * 0.3], 0.1);
    leaf.rotation.z = Math.cos(angle) * 0.34;
    leaf.rotation.x = Math.sin(angle) * 0.25;
    group.add(leaf);
  }
  return group;
}

function createCat(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cat';
  group.position.set(3.05, 0, -0.85);
  group.rotation.y = -0.35;
  const fur = 0xf5f0e4;
  const patch = 0xc47a53;
  const body = roundedBox('cat-body', [0.72, 0.65, 1.15], fur, [0, 0.52, 0], 0.25);
  const head = roundedBox('cat-head', [0.72, 0.7, 0.65], fur, [0, 0.94, 0.48], 0.22);
  group.add(body, head, box('cat-patch', [0.3, 0.24, 0.05], patch, [0.12, 1.02, 0.82]));
  for (const x of [-0.22, 0.22]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.36, 4), new THREE.MeshStandardMaterial({ color: fur, roughness: 0.8 }));
    ear.position.set(x, 1.42, 0.48);
    ear.rotation.y = Math.PI / 4;
    ear.castShadow = true;
    group.add(ear);
    group.add(box('cat-leg', [0.2, 0.42, 0.24], fur, [x, 0.21, 0.34]));
    group.add(box('cat-eye', [0.06, 0.07, 0.035], 0x303746, [x, 1.05, 0.82]));
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.05, 10), new THREE.MeshStandardMaterial({ color: patch, roughness: 0.8 }));
  tail.position.set(-0.38, 0.72, -0.45);
  tail.rotation.z = 0.78;
  tail.rotation.x = 0.28;
  tail.castShadow = true;
  group.add(tail);
  return group;
}

function createToyBall(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'toy-ball';
  group.position.set(0.35, 0.48, 2.82);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf4c943, roughness: 0.7 }));
  ball.castShadow = true;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.09, 10, 28), new THREE.MeshStandardMaterial({ color: 0xe85c52, roughness: 0.68 }));
  band.rotation.x = Math.PI / 2;
  group.add(ball, band);
  return group;
}

function createMovingBoxes(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'moving-boxes';
  group.position.set(3.82, 0, 1.58);
  const cardboard = 0xc99a61;
  const tape = 0xead7a5;
  const boxes = [
    { size: [1.35, 1.05, 1.05] as [number, number, number], position: [0, 0.53, 0] as [number, number, number] },
    { size: [1.08, 0.82, 0.9] as [number, number, number], position: [-0.2, 1.46, -0.05] as [number, number, number] },
    { size: [0.72, 0.62, 0.72] as [number, number, number], position: [0.42, 1.24, 0.16] as [number, number, number] },
  ];
  boxes.forEach((item, index) => {
    const carton = roundedBox(`moving-box-${index + 1}`, item.size, cardboard, item.position, 0.06);
    group.add(carton);
    group.add(box(`moving-box-tape-${index + 1}`, [item.size[0] * 0.18, item.size[1] + 0.02, item.size[2] + 0.02], tape, item.position));
  });
  const label = box('moving-box-label', [0.62, 0.36, 0.025], 0xf3ead6, [0, 0.62, 0.54]);
  group.add(label);
  return group;
}

function createDrumPractice(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'drum-practice';
  group.position.set(-2.05, 0, 1.32);
  group.rotation.y = -0.2;
  const shellMaterial = new THREE.MeshStandardMaterial({ color: 0x9f4e78, metalness: 0.12, roughness: 0.48 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xf1e8df, roughness: 0.64 });
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xc8d0dc, metalness: 0.58, roughness: 0.32 });
  const cymbalMaterial = new THREE.MeshStandardMaterial({ color: 0xd8ac48, metalness: 0.46, roughness: 0.38 });

  const drum = (name: string, radius: number, depth: number, position: [number, number, number], rotationX = Math.PI / 2): THREE.Group => {
    const item = new THREE.Group();
    item.name = name;
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 24), shellMaterial);
    shell.rotation.x = rotationX;
    shell.castShadow = true;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, depth + 0.025, 24), headMaterial);
    head.rotation.x = rotationX;
    head.castShadow = true;
    item.position.set(...position);
    item.add(shell, head);
    return item;
  };

  group.add(
    drum('kick-drum', 0.58, 0.55, [0, 0.62, 0.28]),
    drum('snare-drum', 0.4, 0.22, [-0.72, 1.15, -0.08], 0),
    drum('tom-drum-left', 0.34, 0.3, [-0.35, 1.55, 0.03], 0),
    drum('tom-drum-right', 0.34, 0.3, [0.38, 1.52, 0.02], 0),
  );

  for (const [x, y, z] of [[-0.72, 0.58, -0.08], [-0.35, 0.82, 0.03], [0.38, 0.8, 0.02]] as Array<[number, number, number]>) {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, y + 0.45, 10), metalMaterial);
    stand.position.set(x, (y + 0.45) / 2, z);
    stand.castShadow = true;
    group.add(stand);
  }

  for (const [x, y, z] of [[-1.02, 1.82, 0], [0.98, 1.92, -0.08]] as Array<[number, number, number]>) {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, y, 10), metalMaterial);
    stand.position.set(x, y / 2, z);
    const cymbal = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.045, 28), cymbalMaterial);
    cymbal.position.set(x, y, z);
    cymbal.rotation.z = x < 0 ? -0.08 : 0.08;
    stand.castShadow = true;
    cymbal.castShadow = true;
    group.add(stand, cymbal);
  }

  const stickMaterial = new THREE.MeshStandardMaterial({ color: 0xd7aa68, roughness: 0.58 });
  for (const offset of [-0.08, 0.08]) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.85, 10), stickMaterial);
    stick.position.set(-0.72 + offset, 1.5, -0.08);
    stick.rotation.z = offset < 0 ? -0.72 : 0.72;
    stick.castShadow = true;
    group.add(stick);
  }
  return group;
}

function createTennisGear(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'tennis-gear';
  group.position.set(-4.48, 0, 1.45);
  group.rotation.y = -0.08;
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x5e8fd1, metalness: 0.18, roughness: 0.42 });
  const racketHead = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.055, 12, 36), frameMaterial);
  racketHead.position.set(0, 1.55, 0);
  racketHead.rotation.y = Math.PI / 2;
  racketHead.scale.y = 1.28;
  racketHead.castShadow = true;
  const handle = roundedBox('tennis-racket-handle', [0.12, 0.86, 0.12], 0x38465c, [0, 0.72, 0], 0.04);
  group.add(racketHead, handle);

  for (let i = -3; i <= 3; i += 1) {
    const vertical = box('tennis-string', [0.018, 0.92, 0.018], 0xe4edf5, [0.015, 1.55, i * 0.1]);
    group.add(vertical);
  }
  for (let i = -3; i <= 3; i += 1) {
    const horizontal = box('tennis-string', [0.018, 0.018, 0.72], 0xe4edf5, [0.015, 1.55 + i * 0.11, 0]);
    group.add(horizontal);
  }

  const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xcbe94a, roughness: 0.68 });
  for (const [y, z] of [[0.18, 0.38], [0.2, -0.28]] as Array<[number, number]>) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 12), ballMaterial);
    ball.position.set(0.3, y, z);
    ball.castShadow = true;
    group.add(ball);
  }
  return group;
}

function box(name: string, size: [number, number, number], color: number, position: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.72 }));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function roundedBox(name: string, size: [number, number, number], color: number, position: [number, number, number], radius: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 4, radius), new THREE.MeshStandardMaterial({ color, roughness: 0.72 }));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createCarpetTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  context.fillStyle = '#66e2d5';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#338bc0';
  for (let y = 28; y < canvas.height; y += 54) {
    for (let x = 28 + ((y / 54) % 2) * 18; x < canvas.width; x += 58) {
      context.save();
      context.translate(x, y);
      context.rotate(Math.PI / 4);
      context.fillRect(-5, -5, 10, 10);
      context.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createArtworkTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#173f8f');
  gradient.addColorStop(.45, '#f1779f');
  gradient.addColorStop(1, '#f6c76c');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(18, 44, 87, .78)';
  for (let i = 0; i < 18; i += 1) {
    const x = 10 + i * 31;
    const height = 40 + (i % 5) * 17;
    context.fillRect(x, canvas.height - height, 22, height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createWindowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#477ac5');
  sky.addColorStop(0.46, '#f08ba0');
  sky.addColorStop(0.72, '#f4b66c');
  sky.addColorStop(1, '#36547d');
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(255, 226, 154, .9)';
  context.beginPath();
  context.arc(286, 290, 54, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#294266';
  context.beginPath();
  context.moveTo(0, 390);
  context.lineTo(90, 330);
  context.lineTo(175, 405);
  context.lineTo(255, 350);
  context.lineTo(384, 418);
  context.lineTo(384, 512);
  context.lineTo(0, 512);
  context.closePath();
  context.fill();
  context.fillStyle = '#1d344f';
  for (let i = 0; i < 7; i += 1) {
    const x = 24 + i * 58;
    const h = 50 + (i % 4) * 19;
    context.fillRect(x, canvas.height - h, 38, h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function fovForAspect(aspect: number): number {
  if (aspect < 0.75) return 58;
  if (aspect < 1.2) return 48;
  return 38;
}

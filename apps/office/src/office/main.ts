import './style.css';
import { mountOfficeGallery } from '../threeui/OfficeGallery';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

mountOfficeGallery();

type ViewName = 'hero' | 'plan';

interface ViewPreset {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const app = document.getElementById('scene');
if (!app) throw new Error('Missing #scene mount point.');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdde7ea);
scene.fog = new THREE.Fog(0xdde7ea, 58, 115);

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 180);
const views: Record<ViewName, ViewPreset> = {
  hero: {
    position: new THREE.Vector3(18.5, 15.5, 41.5),
    target: new THREE.Vector3(-1.2, 5.6, -3.5),
  },
  plan: {
    position: new THREE.Vector3(34, 39, 40),
    target: new THREE.Vector3(0, 2.5, -1.5),
  },
};
camera.position.set(49, 27, 58);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.07;
renderer.domElement.tabIndex = 0;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.minDistance = 15;
controls.maxDistance = 88;
controls.minPolarAngle = Math.PI * 0.14;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.copy(views.hero.target);

const palette = {
  navy: 0x0b2c4a,
  navyDeep: 0x071d30,
  navySoft: 0x173f60,
  wood: 0xa66f3c,
  woodLight: 0xc9975f,
  walnut: 0x6d442a,
  stone: 0xece8df,
  marble: 0xf4f1ea,
  black: 0x171b1d,
  steel: 0x434a4e,
  carpet: 0x56616a,
  leather: 0xa96037,
  sofa: 0xd8d1c5,
  white: 0xf5f5f1,
  green: 0x355b3e,
  leaf: 0x426e48,
  screen: 0x1b79b6,
  warm: 0xffd79c,
};

const mats = {
  navy: standard(palette.navy, 0.54, 0.22),
  navyDeep: standard(palette.navyDeep, 0.5, 0.3),
  navySoft: standard(palette.navySoft, 0.58, 0.18),
  wood: standard(palette.wood, 0.58, 0.04),
  woodLight: standard(palette.woodLight, 0.56, 0.03),
  walnut: standard(palette.walnut, 0.48, 0.04),
  stone: standard(palette.stone, 0.72, 0.03),
  marble: new THREE.MeshStandardMaterial({ map: makeMarbleTexture(), roughness: 0.34, metalness: 0.02 }),
  black: standard(palette.black, 0.42, 0.42),
  steel: standard(palette.steel, 0.35, 0.68),
  carpet: standard(palette.carpet, 0.96, 0),
  leather: standard(palette.leather, 0.64, 0.02),
  sofa: standard(palette.sofa, 0.9, 0),
  white: standard(palette.white, 0.56, 0.02),
  planter: standard(0xf1eee6, 0.65, 0.02),
  leaf: standard(palette.leaf, 0.8, 0),
  soil: standard(0x3e3026, 1, 0),
  screen: new THREE.MeshStandardMaterial({ color: palette.screen, emissive: palette.screen, emissiveIntensity: 0.85, roughness: 0.28 }),
  warmGlow: new THREE.MeshStandardMaterial({ color: 0xffe6bd, emissive: palette.warm, emissiveIntensity: 1.7, roughness: 0.22 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xc5e2e7,
    roughness: 0.12,
    metalness: 0.06,
    transmission: 0.58,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
};

const charMats = {
  skin: standard(0xe3b184, 0.72, 0),
  skinDeep: standard(0xc68b5f, 0.7, 0),
  hairDark: standard(0x2b2320, 0.85, 0),
  hairBrown: standard(0x50331f, 0.85, 0),
  denim: standard(0x35506e, 0.85, 0),
  chino: standard(0x6a5a48, 0.9, 0),
  hoodie: standard(0x3f6d54, 0.92, 0),
  tee: standard(0x4f7f8a, 0.9, 0),
  coat: standard(0xf2f4f6, 0.66, 0.02),
  shoe: standard(0x1d2226, 0.6, 0.08),
  backpack: standard(0x8a4f2f, 0.86, 0),
  steth: standard(0x2c3a45, 0.5, 0.28),
  eyeDark: standard(0x14171a, 0.5, 0.05),
};

const interactiveScreens: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
const dayLights: THREE.Light[] = [];
const warmLights: THREE.Light[] = [];
const people: { object: THREE.Object3D; baseY: number; amp: number; phase: number }[] = [];
const movingRobots: THREE.Group[] = [];
const labEntranceTargets: THREE.Object3D[] = [];
const labEntranceGlow = new THREE.MeshStandardMaterial({
  color: 0xc87046,
  emissive: 0xc87046,
  emissiveIntensity: 1.15,
  roughness: 0.42,
  metalness: 0.12,
});
let characterPhase = 0;

buildArchitecture();
buildOutdoorGrounds();
buildCommercialSkyline();
buildInteriorDoors();
buildReception();
buildOpenOffice();
buildConferenceRoom();
buildLounge();
buildUpperMeetingRoom();
buildPlantsAndDetails();
buildPoster();
buildLaboratoryEntrance();
buildPeople();
buildLighting();

let activeView: ViewName = 'hero';
let isNight = false;
let cameraGoal = views.hero.position.clone();
let targetGoal = views.hero.target.clone();
let isUserOrbiting = false;
const labRaycaster = new THREE.Raycaster();
const labPointer = new THREE.Vector2();
let labEntranceHovered = false;
let pointerDownPosition = new THREE.Vector2();

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    setView(button.dataset.view === 'plan' ? 'plan' : 'hero');
  });
});

document.getElementById('light-toggle')?.addEventListener('click', () => {
  isNight = !isNight;
  updateLighting();
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDownPosition.set(event.clientX, event.clientY);
});
renderer.domElement.addEventListener('pointermove', onLabEntrancePointerMove);
renderer.domElement.addEventListener('pointerleave', clearLabEntranceHover);
renderer.domElement.addEventListener('click', onLabEntranceClick);

controls.addEventListener('start', () => {
  isUserOrbiting = true;
});
controls.addEventListener('end', () => {
  isUserOrbiting = false;
  cameraGoal.copy(camera.position);
  targetGoal.copy(controls.target);
});

window.addEventListener('resize', onResize);
setTimeout(() => document.getElementById('loading')?.classList.add('is-complete'), 850);

const clock = new THREE.Clock();
animate();

function animate(): void {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  if (!isUserOrbiting) {
    camera.position.lerp(cameraGoal, 0.035);
    controls.target.lerp(targetGoal, 0.035);
  }
  controls.update();

  interactiveScreens.forEach((screen, index) => {
    screen.material.emissiveIntensity = 0.72 + Math.sin(elapsed * 0.55 + index * 0.9) * 0.08;
  });
  people.forEach((part) => {
    part.object.position.y = part.baseY + Math.sin(elapsed * 1.5 + part.phase) * part.amp;
  });
  movingRobots.forEach((robot, index) => {
    const t = elapsed * (0.17 + index * 0.025) + index * 2.4;
    robot.position.x = -2.2 + Math.sin(t) * 7.1;
    robot.position.z = -5.0 + Math.cos(t * 0.72) * 1.15;
    robot.rotation.y = Math.atan2(Math.cos(t) * 7.1, -Math.sin(t * 0.72) * .83);
    const leftArm = robot.userData.leftArm as THREE.Object3D | undefined;
    const rightArm = robot.userData.rightArm as THREE.Object3D | undefined;
    const leftLeg = robot.userData.leftLeg as THREE.Object3D | undefined;
    const rightLeg = robot.userData.rightLeg as THREE.Object3D | undefined;
    const stride = Math.sin(elapsed * 2.5 + index);
    if (leftArm && rightArm && leftLeg && rightLeg) {
      leftArm.rotation.x = stride * .42;
      rightArm.rotation.x = -stride * .42;
      leftLeg.rotation.x = -stride * .24;
      rightLeg.rotation.x = stride * .24;
    }
  });
  labEntranceGlow.emissiveIntensity += ((labEntranceHovered ? 2.8 : 1.15) - labEntranceGlow.emissiveIntensity) * 0.12;
  renderer.render(scene, camera);
}

function buildOutdoorGrounds(): void {
  const grounds = new THREE.Group();
  grounds.name = 'company-outdoor-lawn';

  const campusGround = box(180, .2, 180, standard(0xb7c5ae, .98, 0), 0, -.62, 15, false);
  campusGround.receiveShadow = true;
  grounds.add(campusGround);

  const lawn = new THREE.Mesh(
    new RoundedBoxGeometry(44, 0.34, 25, 4, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x43804b, roughness: 0.98, metalness: 0 }),
  );
  lawn.position.set(0, -0.12, 28.2);
  lawn.receiveShadow = true;
  grounds.add(lawn);

  const borderMaterial = new THREE.MeshStandardMaterial({ color: 0xd7d0c3, roughness: 0.92 });
  grounds.add(
    box(44.4, 0.24, 0.34, borderMaterial, 0, 0.04, 15.7, false),
    box(0.34, 0.24, 25, borderMaterial, -22.1, 0.04, 28.2, false),
    box(0.34, 0.24, 25, borderMaterial, 22.1, 0.04, 28.2, false),
  );

  // A narrow arrival walk keeps the lawn continuous while making its relation
  // to the reception desk obvious from the default camera.
  const steppingStone = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.88 });
  for (let z = 17.2; z <= 38; z += 2.2) {
    grounds.add(roundedBox(2.5, 0.08, 1.35, 0.18, steppingStone, -3.8, 0.12, z));
  }

  const lionPlinth = roundedBox(5.3, .46, 3.1, .18, standard(0xd8d0c2, .88, .02), 12.5, .25, 25.8);
  const sculpture = createAbstractSculpture();
  sculpture.position.set(12.5, .5, 25.8);
  sculpture.rotation.y = -.38;
  grounds.add(lionPlinth, sculpture);
  scene.add(grounds);
}

function buildCommercialSkyline(): void {
  const skyline = new THREE.Group();
  skyline.name = 'commercial-district-skyline';
  const silhouettes = [
    [-39, 21, 7, 55, 0x687786], [-29, 31, 8, 58, 0x506477], [-18, 24, 7, 54, 0x75818b],
    [-7, 39, 9, 60, 0x3f566d], [5, 27, 8, 56, 0x657584], [16, 44, 10, 62, 0x354b61],
    [29, 29, 8, 57, 0x566b7d], [40, 36, 9, 61, 0x40586d],
  ] as const;

  silhouettes.forEach(([x, height, width, z, color], index) => {
    const facade = new THREE.MeshStandardMaterial({
      color,
      map: makeFacadeTexture(index),
      roughness: 0.72,
      metalness: 0.16,
    });
    const tower = box(width, height, 7 + (index % 3) * 1.4, facade, x, height / 2, z, false);
    skyline.add(tower);
    if (index % 2 === 1) {
      skyline.add(box(width * .72, 1.2, 7.6, mats.steel, x, height + .6, z, false));
    }
  });

  const boulevard = box(62, .12, 7, standard(0x4d5559, .96, .02), 0, .02, 45.5, false);
  skyline.add(boulevard);
  scene.add(skyline);
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
  toggle?.setAttribute('aria-pressed', String(isNight));
  if (toggle) toggle.title = isNight ? '切换日景' : '切换夜景';
  scene.background = new THREE.Color(isNight ? 0x071624 : 0xdde7ea);
  scene.fog = new THREE.Fog(isNight ? 0x071624 : 0xdde7ea, 58, 115);
  renderer.toneMappingExposure = isNight ? 0.85 : 1.07;
  dayLights.forEach((light) => { light.intensity = isNight ? light.intensity * 0.18 : light.userData.dayIntensity as number; });
  warmLights.forEach((light) => { light.intensity = (light.userData.nightIntensity as number) * (isNight ? 1.5 : 0.72); });
}

function buildArchitecture(): void {
  const architecture = new THREE.Group();
  architecture.name = 'office-architecture';
  scene.add(architecture);

  architecture.add(box(46, 0.7, 31, mats.stone, 0, -0.35, 0, false));
  architecture.add(box(46, 0.16, 31, standard(0xe6e0d6, 0.83, 0.01), 0, 0.02, 0, false));
  // The outer shell uses inward-facing planes. It reads as a wall from inside,
  // but disappears when the orbit camera passes outside instead of blocking the view.
  architecture.add(wallPlane(31, 18.5, mats.wood, -22.68, 9.1, 0, Math.PI / 2));
  architecture.add(wallPlane(46, 18.5, mats.stone, 0, 9.1, -15.18, 0));

  // 左侧木饰面和中央白色石材形象墙。
  architecture.add(wallPlane(11.5, 18, mats.wood, -16.5, 9, -14.62, 0));
  architecture.add(wallPlane(13.5, 17.8, mats.marble, -4.1, 8.9, -14.58, 0));
  architecture.add(box(1.05, 18.5, 1.15, mats.navyDeep, -11.5, 9.1, -14.2));
  architecture.add(box(1.05, 18.5, 1.15, mats.navyDeep, 3.15, 9.1, -14.2));

  // 局部天花板保留参考图的挑高和线性灯槽。
  architecture.add(box(46, 0.5, 17.5, mats.white, 0, 18.1, -6.3));
  architecture.add(box(7.2, 0.5, 13.5, mats.white, -18.9, 18.1, 8.6));
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(46, 31), mats.white);
  ceiling.position.set(0, 17.82, 0);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.receiveShadow = true;
  architecture.add(ceiling);

  // 二层平台、海军蓝腰线与玻璃会议室。
  architecture.add(box(19.2, 0.7, 10.5, mats.navyDeep, 12.1, 8.3, -9.7));
  architecture.add(box(20.4, 1.5, 0.75, mats.navy, 12.1, 8.0, -4.7));
  createGlassWall(architecture, 2.1, 22.1, -4.48, 8.7, 17.4, 5);
  createGlassWall(architecture, 2.1, 22.1, -14.78, 8.7, 17.4, 5);

  // 一层玻璃办公室。实验室入口正前方留出 7m 宽的完整通道。
  createGlassWall(architecture, 3.6, 5.05, -11.0, 0.3, 7.65, 1);
  createGlassWall(architecture, 12.15, 22.2, -11.0, 0.3, 7.65, 3);
  architecture.add(box(0.34, 7.35, 0.5, mats.navyDeep, 5.05, 3.82, -11.0));
  architecture.add(box(0.34, 7.35, 0.5, mats.navyDeep, 12.15, 3.82, -11.0));
  architecture.add(wallPlane(8.7, 7.2, mats.white, 8.7, 3.75, -14.48, 0));
  architecture.add(wallPlane(8.4, 7.2, mats.white, 17.8, 3.75, -14.48, 0));

  // 右侧整面落地窗和黑色窗框。
  architecture.add(box(0.28, 18, 30, mats.glass, 22.45, 9, 0));
  for (const z of [-14, -7, 0, 7, 14]) architecture.add(box(0.44, 18, 0.28, mats.black, 22.3, 9, z));
  architecture.add(box(0.5, 0.38, 30, mats.black, 22.25, 8.45, 0));

  // 线性灯槽。
  for (const [x, z, length, rotation] of [
    [-15, -7.5, 8, 0.08], [-2, -7.5, 10, -0.08], [10, -8.5, 8.5, 0.1], [17, -1.2, 7, -0.1],
    [-10, 5.8, 12, 0.04], [7.5, 5.2, 10, -0.05],
  ] as const) {
    const recess = box(length + 0.5, 0.08, 0.38, mats.black, x, 17.72, z, false);
    recess.rotation.y = rotation;
    const strip = box(length, 0.07, 0.12, mats.warmGlow, x, 17.66, z, false);
    strip.rotation.y = rotation;
    architecture.add(recess, strip);
  }
}

function buildReception(): void {
  const reception = new THREE.Group();
  reception.name = 'reception';
  reception.position.set(-3.8, 0, -7.6);
  scene.add(reception);

  reception.add(roundedBox(10.3, 1.18, 2.05, 0.13, mats.walnut, 0, .62, 0));
  reception.add(box(10.7, 0.14, 2.3, standard(0x4a4038, 0.5, 0.08), 0, 1.26, 0));
  reception.add(box(3.4, 0.48, 0.4, mats.walnut, 3.55, 1.55, 0.78));
  reception.add(createMonitor(-1.5, 1.34, -0.35, 0, 0.62));
  reception.add(createMonitor(1.3, 1.34, -0.35, 0, 0.62));
  reception.add(createPlant(4.1, 1.34, -0.15, 0.42));
  const waterBottle = createWaterBottle();
  waterBottle.position.set(3.0, 1.34, .18);
  reception.add(waterBottle);

  // Public build uses an original procedural wordmark texture.
  const logo = new THREE.Group();
  logo.position.set(-4.0, 10.2, -14.28);
  logo.add(roundedBox(8.25, 2.95, .22, .12, mats.white, 0, 0, 0));
  const logoTexture = makeWordmarkTexture();
  logoTexture.colorSpace = THREE.SRGBColorSpace;
  const logoFace = new THREE.Mesh(
    new THREE.PlaneGeometry(7.75, 2.45),
    new THREE.MeshStandardMaterial({ map: logoTexture, roughness: .72, metalness: 0 }),
  );
  logoFace.position.z = .13;
  logo.add(logoFace);
  scene.add(logo);
}

function buildInteriorDoors(): void {
  const doors = new THREE.Group();
  doors.name = 'interior-doors';
  // 只保留靠会议区的一扇宽双开门；门框、门板和把手错开深度，避免共面闪烁。
  const door = new THREE.Group();
  door.position.set(-22.2, 0, -5.3);
  door.rotation.y = Math.PI / 2;
  door.add(box(4.8, .3, .5, mats.navyDeep, 0, 6.35, 0));
  door.add(box(.3, 6.5, .5, mats.navyDeep, -2.25, 3.25, 0));
  door.add(box(.3, 6.5, .5, mats.navyDeep, 2.25, 3.25, 0));
  door.add(roundedBox(2.02, 5.8, .24, .05, mats.woodLight, -1.05, 3.1, .18));
  door.add(roundedBox(2.02, 5.8, .24, .05, mats.woodLight, 1.05, 3.1, .18));
  door.add(box(.12, 5.8, .42, mats.navyDeep, 0, 3.1, .22));
  door.add(box(.1, .62, .12, mats.steel, -.22, 2.9, .39));
  door.add(box(.1, .62, .12, mats.steel, .22, 2.9, .39));
  doors.add(door);
  scene.add(doors);
}

function buildOpenOffice(): void {
  const office = new THREE.Group();
  office.name = 'open-office';
  scene.add(office);

  const workstations = [
    [-16.4, 7.2, 0], [-11.5, 7.2, 0], [-6.6, 7.2, 0],
    [-17.2, 12.0, Math.PI], [-12.3, 12.0, Math.PI], [-7.4, 12.0, Math.PI],
    [-18.2, 2.4, 0], [-13.3, 2.4, 0],
  ] as const;
  for (const [x, z, rotation] of workstations) office.add(createWorkstation(x, z, rotation));

  office.add(box(16.3, 1.2, 0.16, mats.navy, -12.3, 1.5, 9.6));
  office.add(box(11.8, 1.2, 0.16, mats.navy, -15.7, 1.5, 4.8));
  office.add(createPrinter(-18.9, -1.3, 0, 0.86));
}

function buildConferenceRoom(): void {
  const conference = new THREE.Group();
  conference.name = 'conference-area';
  scene.add(conference);

  conference.add(box(16.0, 0.12, 9.6, mats.carpet, 12.8, 0.11, -0.5, false));
  conference.add(roundedBox(11.8, 0.38, 3.7, 0.16, mats.woodLight, 12.2, 1.8, -1.0));
  conference.add(box(1.2, 1.55, 2.6, mats.walnut, 12.2, 0.88, -1.0));
  conference.add(box(2.7, 0.05, 0.8, mats.navy, 12.2, 2.02, -1.0, false));
  conference.add(createPlant(12.2, 2.05, -1.0, 0.4));

  for (const x of [7.5, 10.5, 13.5, 16.5]) {
    conference.add(createChair(x, 1.85, 0, 1.0));
    conference.add(createChair(x, -3.75, Math.PI, 1.0));
  }
  conference.add(createChair(5.4, -1.0, Math.PI / 2, 1.04));
  conference.add(createChair(19.0, -1.0, -Math.PI / 2, 1.04));

  // 电视和白板。
  conference.add(box(4.7, 2.65, 0.25, mats.black, 9.3, 5.0, -14.12));
  const tv = box(4.25, 2.25, 0.14, mats.screen, 9.3, 5.0, -13.96, false) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  interactiveScreens.push(tv);
  conference.add(tv);
  conference.add(box(4.2, 3.0, 0.2, mats.white, 17.0, 4.8, -14.05));
  conference.add(box(4.5, 0.12, 0.3, mats.steel, 17.0, 3.25, -13.9));
  conference.add(box(0.12, 3.3, 0.12, mats.steel, 15.0, 1.58, -13.9));
  conference.add(box(0.12, 3.3, 0.12, mats.steel, 19.0, 1.58, -13.9));
}

function buildLounge(): void {
  const lounge = new THREE.Group();
  lounge.name = 'lounge';
  scene.add(lounge);
  lounge.add(box(12.8, 0.1, 8.6, standard(0x7b8080, 0.98, 0), 15.0, 0.1, 8.1, false));
  lounge.add(createSofa(18.1, 8.8, -Math.PI / 2));
  lounge.add(createSofa(13.9, 12.0, Math.PI));
  lounge.add(roundedBox(3.9, 0.55, 2.2, 0.14, standard(0x353638, 0.4, 0.18), 14.6, 0.62, 8.4));
  lounge.add(box(3.65, 0.12, 1.95, mats.marble, 14.6, 0.95, 8.4));
  lounge.add(createPlant(14.6, 1.03, 8.4, 0.42));
  lounge.add(createWaterCooler(21.1, 10.8));
}

function buildUpperMeetingRoom(): void {
  const upper = new THREE.Group();
  upper.name = 'upper-meeting-room';
  scene.add(upper);
  upper.add(box(13.6, 0.12, 6.2, mats.carpet, 13.2, 8.72, -9.7, false));
  upper.add(roundedBox(9.2, 0.3, 2.55, 0.13, mats.walnut, 12.7, 10.1, -9.8));
  upper.add(box(1.0, 1.25, 1.8, mats.walnut, 12.7, 9.4, -9.8));
  for (const x of [9.5, 12.0, 14.5, 17.0]) {
    upper.add(createChair(x, -7.8, Math.PI, 0.78, 8.55));
    upper.add(createChair(x, -11.8, 0, 0.78, 8.55));
  }
  upper.add(createPlant(20.1, 8.75, -12.7, 0.78));
  upper.add(box(6.6, 7.8, 0.42, mats.wood, 5.5, 12.5, -14.42));
}

function buildPlantsAndDetails(): void {
  const details = new THREE.Group();
  details.name = 'plants-and-details';
  scene.add(details);
  for (const [x, z, scale] of [[3.0, -7.8, 0.9], [20.0, -3.8, 0.95], [-20.4, -10.8, 0.72], [20.4, 3.0, 0.92]] as const) {
    details.add(createPlant(x, 0.05, z, scale));
  }

  // 纸张、文件架和电话，使前景工位不显得像空样板间。
  for (const [x, z] of [[-16.2, 6.6], [-11.2, 6.6], [-17.0, 11.4], [-12.1, 11.4]] as const) {
    details.add(box(0.9, 0.04, 0.62, mats.white, x + 0.7, 1.76, z, false));
    details.add(box(0.32, 0.34, 0.58, mats.navy, x - 1.15, 1.94, z, false));
  }
}

function buildLighting(): void {
  const hemi = new THREE.HemisphereLight(0xf7fbff, 0x756a5d, 2.2);
  hemi.userData.dayIntensity = 2.2;
  scene.add(hemi);
  dayLights.push(hemi);

  const ambient = new THREE.AmbientLight(0xfff8ee, 0.8);
  ambient.userData.dayIntensity = 0.8;
  scene.add(ambient);
  dayLights.push(ambient);

  const sun = new THREE.DirectionalLight(0xfff4df, 3.4);
  sun.position.set(31, 38, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.045;
  sun.userData.dayIntensity = 3.4;
  scene.add(sun);
  dayLights.push(sun);

  const fill = new THREE.DirectionalLight(0xbfdcff, 1.15);
  fill.position.set(-28, 18, 22);
  fill.userData.dayIntensity = 1.15;
  scene.add(fill);
  dayLights.push(fill);

  for (const [x, y, z, intensity] of [
    [-4, 14, -12.8, 42], [9, 15.5, -8, 34], [18, 15.5, -8, 30], [11, 7, -4, 24], [18, 5.5, 7, 24],
  ] as const) {
    const light = new THREE.PointLight(0xffd39a, intensity, 18, 2);
    light.position.set(x, y, z);
    light.userData.nightIntensity = intensity;
    light.intensity = intensity * 0.72;
    scene.add(light);
    warmLights.push(light);
  }
}

function createWorkstation(x: number, z: number, rotation: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  group.add(roundedBox(4.25, 0.22, 2.15, 0.08, mats.woodLight, 0, 1.58, 0));
  group.add(box(0.18, 1.45, 1.75, mats.steel, -1.7, 0.8, 0));
  group.add(box(0.18, 1.45, 1.75, mats.steel, 1.7, 0.8, 0));
  group.add(createMonitor(-0.45, 1.72, -0.12, 0, 0.72));
  group.add(createOfficeChair(0.4, 2.0));
  return group;
}

function createMonitor(x: number, y: number, z: number, rotation: number, scale: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);
  group.add(box(2.5, 1.45, 0.14, mats.black, 0, 1.25, 0));
  const screen = box(2.24, 1.2, 0.08, mats.screen, 0, 1.25, 0.09, false) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  interactiveScreens.push(screen);
  group.add(screen);
  group.add(box(0.16, 0.86, 0.16, mats.steel, 0, 0.42, 0));
  group.add(box(0.85, 0.1, 0.55, mats.steel, 0, 0.06, 0.05));
  return group;
}

function createOfficeChair(x: number, z: number): THREE.Group {
  const group = createChair(x, z, Math.PI, 0.8);
  const star = new THREE.Group();
  star.position.set(0, 0.2, 0);
  for (let index = 0; index < 5; index += 1) {
    const spoke = box(0.08, 0.08, 0.72, mats.black, 0, 0, -0.32, false);
    spoke.rotation.y = (Math.PI * 2 * index) / 5;
    star.add(spoke);
  }
  group.add(star);
  return group;
}

function createChair(x: number, z: number, rotation: number, scale = 1, floorY = 0): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, floorY, z);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);
  group.add(roundedBox(1.25, 0.24, 1.25, 0.12, mats.leather, 0, 1.15, 0));
  const back = roundedBox(1.28, 1.55, 0.22, 0.12, mats.leather, 0, 1.98, 0.5);
  back.rotation.x = -0.08;
  group.add(back);
  group.add(box(0.13, 1.05, 0.13, mats.steel, 0, 0.56, 0));
  group.add(box(1.1, 0.1, 0.75, mats.steel, 0, 0.2, 0));
  return group;
}

function createSofa(x: number, z: number, rotation: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  group.add(roundedBox(4.6, 0.68, 1.8, 0.2, mats.sofa, 0, 0.75, 0));
  group.add(roundedBox(4.6, 1.35, 0.44, 0.17, mats.sofa, 0, 1.6, 0.68));
  group.add(roundedBox(0.45, 1.0, 1.8, 0.15, mats.sofa, -2.12, 1.0, 0));
  group.add(roundedBox(0.45, 1.0, 1.8, 0.15, mats.sofa, 2.12, 1.0, 0));
  group.add(roundedBox(1.25, 0.78, 0.26, 0.13, standard(0x9b5f35, 0.86, 0), 1.1, 1.45, -0.25));
  return group;
}

function createPrinter(x: number, z: number, rotation: number, scale: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);
  group.add(roundedBox(2.5, 1.55, 2.0, 0.13, mats.white, 0, 0.9, 0));
  group.add(box(2.05, 0.18, 0.75, mats.black, 0, 1.25, 0.68));
  group.add(box(1.55, 0.13, 1.0, mats.steel, 0, 1.8, -0.15));
  group.add(roundedBox(2.7, 0.9, 2.25, 0.1, mats.navySoft, 0, 0.35, 0));
  return group;
}

function createWaterCooler(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.add(roundedBox(1.45, 2.5, 1.35, 0.13, mats.white, 0, 1.3, 0));
  group.add(roundedBox(1.02, .28, 1.0, .12, mats.navySoft, 0, 2.64, 0));
  group.add(box(0.92, 0.5, 0.18, mats.navySoft, 0, 1.75, 0.68));
  return group;
}

function createPlant(x: number, y: number, z: number, scale: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.58, 1.45, 20), mats.planter);
  pot.position.y = 0.74;
  pot.castShadow = true;
  pot.receiveShadow = true;
  group.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.08, 20), mats.soil);
  soil.position.y = 1.47;
  group.add(soil);
  for (let index = 0; index < 11; index += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), mats.leaf);
    const angle = (Math.PI * 2 * index) / 11;
    const radius = 0.3 + (index % 3) * 0.18;
    leaf.scale.set(0.65, 1.7 + (index % 2) * 0.35, 0.46);
    leaf.position.set(Math.cos(angle) * radius, 2.0 + (index % 4) * 0.36, Math.sin(angle) * radius);
    leaf.rotation.z = Math.cos(angle) * 0.5;
    leaf.rotation.x = Math.sin(angle) * 0.42;
    leaf.castShadow = true;
    group.add(leaf);
  }
  return group;
}

function createGlassWall(group: THREE.Group, minX: number, maxX: number, z: number, minY: number, maxY: number, panels: number): void {
  const width = maxX - minX;
  const height = maxY - minY;
  group.add(box(width, height, 0.16, mats.glass, minX + width / 2, minY + height / 2, z, false));
  for (let index = 0; index <= panels; index += 1) {
    const x = minX + (width * index) / panels;
    group.add(box(0.18, height, 0.22, mats.black, x, minY + height / 2, z));
  }
  group.add(box(width, 0.2, 0.24, mats.black, minX + width / 2, minY, z));
  group.add(box(width, 0.2, 0.24, mats.black, minX + width / 2, maxY, z));
}

function roundedBox(width: number, height: number, depth: number, radius: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const object = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, radius), material);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function box(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number, shadows = true): THREE.Mesh {
  const object = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  object.position.set(x, y, z);
  object.castShadow = shadows && !material.transparent;
  object.receiveShadow = shadows;
  return object;
}

function wallPlane(
  width: number,
  height: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  rotationY: number,
): THREE.Mesh {
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  panel.position.set(x, y, z);
  panel.rotation.y = rotationY;
  panel.receiveShadow = true;
  return panel;
}

function standard(color: THREE.ColorRepresentation, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function makeWordmarkTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 360;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = '#f5f3ee';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0b2c4a';
  context.font = '700 112px Arial, sans-serif';
  context.letterSpacing = '5px';
  context.fillText('METROBSIDIAN', 66, 190);
  context.font = '500 30px Arial, sans-serif';
  context.letterSpacing = '12px';
  context.fillText('KNOWLEDGE BECOMES PLACE', 72, 260);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePosterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 760;
  canvas.height = 1220;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = '#ebe5da';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0b2c4a';
  context.fillRect(58, 58, 644, 1104);
  context.fillStyle = '#9368df';
  context.beginPath();
  context.arc(380, 405, 232, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#f5efe5';
  context.lineWidth = 26;
  for (let radius = 88; radius <= 220; radius += 44) {
    context.beginPath();
    context.arc(380, 405, radius, -.7, Math.PI * 1.45);
    context.stroke();
  }
  context.fillStyle = '#f5efe5';
  context.font = '700 72px Arial, sans-serif';
  context.fillText('KNOWLEDGE', 98, 790);
  context.fillText('BECOMES', 98, 880);
  context.fillText('PLACE', 98, 970);
  context.font = '500 23px Arial, sans-serif';
  context.letterSpacing = '8px';
  context.fillText('METROBSIDIAN / 01', 102, 1070);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeMarbleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = '#f3f0e9';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineCap = 'round';
  for (let index = 0; index < 18; index += 1) {
    context.beginPath();
    context.strokeStyle = index % 3 === 0 ? 'rgba(144,139,131,.20)' : 'rgba(180,174,164,.12)';
    context.lineWidth = index % 4 === 0 ? 2.2 : 1;
    const startY = (index / 18) * 580 - 30;
    context.moveTo(-20, startY);
    context.bezierCurveTo(130, startY - 80, 280, startY + 70, 540, startY - 22);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.6, 1.2);
  return texture;
}

function makeFacadeTexture(seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = seed % 2 === 0 ? '#536576' : '#344b60';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 18; y < canvas.height; y += 30) {
    for (let x = 14; x < canvas.width; x += 28) {
      const lit = (x / 28 + y / 30 + seed) % 4 !== 0;
      context.fillStyle = lit ? 'rgba(244,210,145,.72)' : 'rgba(143,185,204,.28)';
      context.fillRect(x, y, 13, 13);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = camera.aspect < 0.8 ? 50 : camera.aspect < 1.2 ? 42 : 36;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- 人物（机器人 / 大学生 / 医疗白大褂）与海报 ----------

function addPeoplePart(object: THREE.Object3D, amp: number, phase: number): void {
  people.push({ object, baseY: object.position.y, amp, phase });
}

function createRobot(): THREE.Group {
  const robot = new THREE.Group();
  const phase = (characterPhase += 1.9);

  const body = roundedBox(.72, .9, .5, .14, mats.white, 0, 1.12, 0);
  const chest = roundedBox(.42, .22, .53, .08, mats.screen, 0, 1.15, .02);
  const head = roundedBox(.62, .48, .48, .14, mats.navyDeep, 0, 1.82, 0);
  const face = roundedBox(.42, .2, .04, .04, mats.screen, 0, 1.82, .27);
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 8), mats.warmGlow);
  const rightEye = leftEye.clone();
  leftEye.position.set(-.11, 1.84, .31);
  rightEye.position.set(.11, 1.84, .31);
  robot.add(body, chest, head, face, leftEye, rightEye);

  const leftArm = new THREE.Group();
  leftArm.position.set(-.48, 1.48, 0);
  leftArm.add(roundedBox(.16, .72, .18, .07, mats.navySoft, 0, -.31, 0));
  const rightArm = leftArm.clone();
  rightArm.position.x = .48;
  robot.add(leftArm, rightArm);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-.2, .72, 0);
  leftLeg.add(roundedBox(.18, .66, .22, .07, mats.steel, 0, -.28, 0));
  leftLeg.add(roundedBox(.25, .12, .4, .05, mats.black, 0, -.63, .06));
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = .2;
  robot.add(leftLeg, rightLeg);

  robot.userData.leftArm = leftArm;
  robot.userData.rightArm = rightArm;
  robot.userData.leftLeg = leftLeg;
  robot.userData.rightLeg = rightLeg;
  addPeoplePart(robot, 0.02, phase);
  return robot;
}

function createWaterBottle(): THREE.Group {
  const bottle = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(.08, .09, .34, 18),
    new THREE.MeshPhysicalMaterial({ color: 0xb8d7de, transparent: true, opacity: .72, roughness: .2 }),
  );
  body.position.y = .17;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .055, 16), mats.navySoft);
  cap.position.y = .37;
  bottle.add(body, cap);
  return bottle;
}

function createAbstractSculpture(): THREE.Group {
  const sculpture = new THREE.Group();
  const stone = standard(0xc8c0b4, .82, .04);
  const core = new THREE.Mesh(new THREE.TorusKnotGeometry(.72, .2, 80, 12), stone);
  core.rotation.set(.3, -.25, .15);
  core.position.y = .82;
  core.castShadow = true;
  core.receiveShadow = true;
  const base = roundedBox(1.65, .18, 1.05, .12, mats.stone, 0, .08, 0);
  sculpture.add(base, core);
  return sculpture;
}
interface HumanOptions {
  shirt: THREE.Material;
  pants: THREE.Material;
  hair: THREE.Material;
  skin: THREE.Material;
  hairStyle: 'cap' | 'bun';
  coat?: THREE.Material;
  backpack?: boolean;
  stethoscope?: boolean;
  medicalCross?: boolean;
}

function createHuman(options: HumanOptions): THREE.Group {
  const person = new THREE.Group();
  const phase = (characterPhase += 2.3);
  const armMat = options.coat ?? options.shirt;

  // 腿和鞋。
  person.add(roundedBox(0.16, 0.78, 0.2, 0.05, options.pants, -0.13, 0.4, 0));
  person.add(roundedBox(0.16, 0.78, 0.2, 0.05, options.pants, 0.13, 0.4, 0));
  person.add(roundedBox(0.2, 0.09, 0.36, 0.03, charMats.shoe, -0.13, 0.06, 0.03));
  person.add(roundedBox(0.2, 0.09, 0.36, 0.03, charMats.shoe, 0.13, 0.06, 0.03));

  // 上衣，可选长款白大褂。
  person.add(roundedBox(0.5, 0.62, 0.3, 0.09, options.shirt, 0, 1.09, 0));
  if (options.coat) {
    person.add(roundedBox(0.58, 0.98, 0.36, 0.1, options.coat, 0, 1.0, 0));
    person.add(roundedBox(0.34, 0.12, 0.08, 0.03, options.coat, 0, 1.5, 0.15));
    if (options.medicalCross) {
      const red = standard(0xc62828, .68, 0);
      person.add(box(.11, .32, .025, red, .16, 1.18, .195, false));
      person.add(box(.27, .11, .025, red, .16, 1.18, .2, false));
    }
  }

  // 手臂和手。
  person.add(roundedBox(0.12, 0.56, 0.14, 0.05, armMat, -0.36, 1.1, 0));
  person.add(roundedBox(0.12, 0.56, 0.14, 0.05, armMat, 0.36, 1.1, 0));
  person.add(sphere(0.055, options.skin, -0.36, 0.8, 0));
  person.add(sphere(0.055, options.skin, 0.36, 0.8, 0));

  // 脖子、头、眼睛和头发。
  person.add(box(0.12, 0.1, 0.12, options.skin, 0, 1.42, 0));
  const head = sphere(0.2, options.skin, 0, 1.58, 0);
  person.add(head);
  addPeoplePart(head, 0.03, phase);
  person.add(sphere(0.024, charMats.eyeDark, -0.07, 1.59, 0.17));
  person.add(sphere(0.024, charMats.eyeDark, 0.07, 1.59, 0.17));

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.205, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), options.hair);
  hairCap.position.set(0, 1.63, 0);
  hairCap.castShadow = true;
  person.add(hairCap);
  if (options.hairStyle === 'bun') {
    person.add(sphere(0.08, options.hair, 0, 1.76, -0.05));
  }

  // 背包与听诊器点缀。
  if (options.backpack) {
    person.add(roundedBox(0.36, 0.46, 0.16, 0.06, charMats.backpack, 0, 1.04, -0.25));
  }
  if (options.stethoscope) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 22), charMats.steth);
    loop.position.set(0, 1.46, 0);
    loop.rotation.x = Math.PI / 2;
    loop.castShadow = true;
    person.add(loop);
    person.add(box(0.02, 0.14, 0.02, charMats.steth, 0, 1.34, 0.17, false));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.018, 16), charMats.steth);
    disc.position.set(0, 1.27, 0.19);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    person.add(disc);
  }

  addPeoplePart(person, 0.014, phase + 0.6);
  return person;
}

function sphere(radius: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 14), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildPeople(): void {
  const group = new THREE.Group();
  group.name = 'people';
  scene.add(group);

  const receptionRobot = createRobot();
  receptionRobot.position.set(-2.2, 0, -5.0);
  receptionRobot.rotation.y = 0.15;
  receptionRobot.scale.setScalar(1.22);
  group.add(receptionRobot);
  movingRobots.push(receptionRobot);

  const floorRobot = createRobot();
  floorRobot.position.set(20.6, 0, -1.6);
  floorRobot.rotation.y = -2.4;
  floorRobot.scale.setScalar(1.18);
  group.add(floorRobot);

  const studentA = createHuman({ shirt: charMats.hoodie, pants: charMats.denim, hair: charMats.hairDark, skin: charMats.skin, hairStyle: 'cap', backpack: true });
  studentA.position.set(-15.8, 0, 8.9);
  studentA.rotation.y = -1.35;
  group.add(studentA);

  const studentB = createHuman({ shirt: charMats.tee, pants: charMats.chino, hair: charMats.hairBrown, skin: charMats.skinDeep, hairStyle: 'cap' });
  studentB.position.set(13.7, 0, 11.2);
  studentB.rotation.y = 0.7;
  group.add(studentB);

  const doctor = createHuman({ shirt: charMats.tee, pants: charMats.chino, hair: charMats.hairDark, skin: charMats.skin, hairStyle: 'bun', coat: charMats.coat, stethoscope: true, medicalCross: true });
  doctor.position.set(19.2, 0, 6.2);
  doctor.rotation.y = -2.3;
  group.add(doctor);

  // 前台接待与真实办公密度：接待员在台后，四名同事分布在工作位。
  const receptionist = createHuman({ shirt: mats.navySoft, pants: charMats.chino, hair: charMats.hairBrown, skin: charMats.skinDeep, hairStyle: 'bun' });
  receptionist.position.set(-3.6, .28, -9.05);
  receptionist.rotation.y = 0;
  group.add(receptionist);

  const workerData = [
    [-16.0, 1.12, 8.3, Math.PI],
    [-11.1, 1.12, 8.3, Math.PI],
    [-16.8, 1.12, 11.1, 0],
    [-11.9, 1.12, 11.1, 0],
  ] as const;
  workerData.forEach(([x, y, z, rotation], index) => {
    const worker = createHuman({
      shirt: index % 2 ? charMats.tee : charMats.hoodie,
      pants: index % 2 ? charMats.denim : charMats.chino,
      hair: index % 3 ? charMats.hairDark : charMats.hairBrown,
      skin: index % 2 ? charMats.skinDeep : charMats.skin,
      hairStyle: index === 2 ? 'bun' : 'cap',
    });
    worker.position.set(x, y, z);
    worker.rotation.y = rotation;
    worker.scale.setScalar(.88);
    group.add(worker);
  });
}

function buildPoster(): void {
  const group = new THREE.Group();
  group.name = 'metrobsidian-poster';

  const height = 4.5;
  const width = height * .62;

  group.add(box(width + 0.18, height + 0.18, 0.1, mats.navyDeep, 0, 0, 0));
  group.add(box(width, height, 0.05, mats.white, 0, 0, 0.02));

  const texture = makePosterTexture();
  texture.colorSpace = THREE.SRGBColorSpace;
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.74, metalness: 0.02 }),
  );
  poster.position.z = 0.06;
  poster.receiveShadow = true;
  group.add(poster);

  group.position.set(-8.2, 5.0, -14.3);
  scene.add(group);
}

function buildLaboratoryEntrance(): void {
  const entrance = new THREE.Group();
  entrance.name = 'laboratory-entrance';
  entrance.position.set(8.6, 0, -14.12);

  // 单层宽双开门：墙体、门板、观察窗和装饰线均分离深度，不再叠多个门框。
  entrance.add(box(6.9, .38, .62, mats.navyDeep, 0, 6.55, 0));
  entrance.add(box(.38, 6.75, .62, mats.navyDeep, -3.25, 3.28, 0));
  entrance.add(box(.38, 6.75, .62, mats.navyDeep, 3.25, 3.28, 0));
  entrance.add(roundedBox(2.85, 5.95, .3, .06, mats.navyDeep, -1.48, 3.15, .24));
  entrance.add(roundedBox(2.85, 5.95, .3, .06, mats.navyDeep, 1.48, 3.15, .24));
  entrance.add(box(.16, 5.95, .38, mats.steel, 0, 3.15, .29));
  entrance.add(box(2.25, 2.05, .08, mats.glass, -1.48, 4.2, .48, false));
  entrance.add(box(2.25, 2.05, .08, mats.glass, 1.48, 4.2, .48, false));
  entrance.add(box(4.95, .1, .1, labEntranceGlow, 0, 5.55, .56, false));
  entrance.add(box(.12, .75, .12, labEntranceGlow, -.25, 2.25, .58, false));
  entrance.add(box(.12, .75, .12, labEntranceGlow, .25, 2.25, .58, false));
  const statusLight = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), labEntranceGlow);
  statusLight.position.set(2.72, 5.95, .48);
  entrance.add(statusLight);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(4.25, 1.05),
    new THREE.MeshBasicMaterial({ map: makeLaboratoryLabelTexture(), transparent: true }),
  );
  // 标牌独立放在前方横梁上，保持可发现性，同时不与门体产生共面层。
  label.position.set(0, 7.45, 9.92);
  entrance.add(label);
  entrance.add(box(4.1, .08, .08, labEntranceGlow, 0, 6.82, 9.9, false));

  const hitArea = box(
    7.0,
    8.4,
    1.0,
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
    0,
    4.1,
    .4,
    false,
  );
  entrance.add(hitArea);
  labEntranceTargets.push(hitArea);
  scene.add(entrance);

  const path = new THREE.Group();
  path.name = 'laboratory-wayfinding';
  for (let z = -12.8; z <= -5.6; z += 1.15) {
    path.add(box(2.8, 0.035, 0.18, labEntranceGlow, 8.6, 0.08, z, false));
  }
  scene.add(path);
}

function makeLaboratoryLabelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas label context unavailable.');
  context.fillStyle = '#08131d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#c87046';
  context.lineWidth = 8;
  context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  context.fillStyle = '#f4eee6';
  context.font = '600 66px Arial, sans-serif';
  context.fillText('计算科学实验室', 54, 108);
  context.fillStyle = '#d99165';
  context.font = '400 30px Arial, sans-serif';
  context.fillText('COMPUTE · RESEARCH · LIBRARY', 56, 178);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
  return texture;
}

function onLabEntrancePointerMove(event: PointerEvent): void {
  const rect = renderer.domElement.getBoundingClientRect();
  labPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  labPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  labRaycaster.setFromCamera(labPointer, camera);
  const hovered = labRaycaster.intersectObjects(labEntranceTargets, true).length > 0;
  if (hovered === labEntranceHovered) return;
  labEntranceHovered = hovered;
  renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
}

function clearLabEntranceHover(): void {
  labEntranceHovered = false;
  renderer.domElement.style.cursor = 'grab';
}

function onLabEntranceClick(event: MouseEvent): void {
  if (pointerDownPosition.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 7) return;
  labRaycaster.setFromCamera(labPointer, camera);
  if (labRaycaster.intersectObjects(labEntranceTargets, true).length > 0) {
    window.location.assign('/laboratory.html');
  }
}

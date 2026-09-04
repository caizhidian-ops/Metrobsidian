import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import './style.css';
import { createDeepSeekCharacter, createNiuCharacter } from './characterFactory';
import { CHARACTER_SCENE, getCharacterDefinition, type CharacterId } from './config';
import { CharacterMotionController, type CharacterMotionState } from './motion';

const stage = document.getElementById('character-stage');
if (!stage) throw new Error('Missing #character-stage');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdce9ef);
scene.fog = new THREE.Fog(0xdce9ef, 24, 54);

const camera = new THREE.PerspectiveCamera(43, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.copy(CHARACTER_SCENE.camera.overview);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.domElement.setAttribute('aria-hidden', 'true');
stage.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.copy(CHARACTER_SCENE.camera.target);
controls.minDistance = 6;
controls.maxDistance = 28;
controls.minPolarAngle = Math.PI * 0.16;
controls.maxPolarAngle = Math.PI * 0.46;
controls.enablePan = false;

scene.add(new THREE.HemisphereLight(0xf5fbff, 0x61715d, 2.2));
const sun = new THREE.DirectionalLight(0xffedcf, 3.3);
sun.position.set(-8, 13, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 13;
sun.shadow.camera.bottom = -13;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 35;
sun.shadow.normalBias = 0.025;
scene.add(sun);

const floor = createEnvironment();
scene.add(floor);

const rigs = [createNiuCharacter(), createDeepSeekCharacter()];
rigs.forEach((rig) => {
  rig.root.position.fromArray(getCharacterDefinition(rig.id).spawn);
  scene.add(rig.root);
});

const selectionRing = new THREE.Mesh(
  new THREE.RingGeometry(0.92, 1.08, 48),
  new THREE.MeshBasicMaterial({ color: getCharacterDefinition('niu').accent, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
);
selectionRing.rotation.x = -Math.PI / 2;
selectionRing.position.y = 0.035;
scene.add(selectionRing);

const motion = new CharacterMotionController(rigs);
let followSelected = false;
let cameraFlight: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;

setupUi();
motion.setStateListener(updateStatus);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = new THREE.Vector2();

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown.set(event.clientX, event.clientY);
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 7) return;
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const characterHit = raycaster.intersectObjects(rigs.map((rig) => rig.root), true)[0];
  if (characterHit) {
    const rig = rigs.find((candidate) => candidate.root === findRigRoot(characterHit.object));
    if (rig) selectCharacter(rig.id);
    return;
  }
  const floorHit = raycaster.intersectObject(floor, true)[0];
  if (floorHit) motion.moveSelectedTo(floorHit.point);
});

const timer = new THREE.Timer();
timer.connect(document);
function animate(timestamp: number): void {
  requestAnimationFrame(animate);
  timer.update(timestamp);
  const delta = Math.min(timer.getDelta(), 0.05);
  const elapsed = timer.getElapsed();
  motion.update(delta, elapsed, camera);

  const selectedPosition = motion.getSelectedPosition();
  const app = document.getElementById('character-app');
  if (app) {
    app.dataset.selectedCharacter = motion.getSelectedId();
    app.dataset.selectedPosition = `${selectedPosition.x.toFixed(2)},${selectedPosition.z.toFixed(2)}`;
  }
  selectionRing.position.x = selectedPosition.x;
  selectionRing.position.z = selectedPosition.z;
  selectionRing.material.color.setHex(getCharacterDefinition(motion.getSelectedId()).accent);
  selectionRing.material.opacity = 0.62 + Math.sin(elapsed * 4) * 0.18;

  if (followSelected) {
    const offset = camera.position.clone().sub(controls.target);
    controls.target.lerp(selectedPosition.clone().setY(1.45), 1 - Math.exp(-delta * 5));
    camera.position.copy(controls.target).add(offset);
  }

  if (cameraFlight) {
    camera.position.lerp(cameraFlight.position, 1 - Math.exp(-delta * 5));
    controls.target.lerp(cameraFlight.target, 1 - Math.exp(-delta * 5));
    if (camera.position.distanceTo(cameraFlight.position) < 0.04) cameraFlight = null;
  }

  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function createEnvironment(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'character-environment';

  const ground = new THREE.Mesh(
    new RoundedBoxGeometry(CHARACTER_SCENE.size.width, 0.34, CHARACTER_SCENE.size.depth, 5, 0.35),
    new THREE.MeshStandardMaterial({ color: 0xbccfaf, roughness: 0.94 }),
  );
  ground.position.y = -0.19;
  ground.receiveShadow = true;
  group.add(ground);

  const pathMaterial = new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.96 });
  for (const [x, z, rotation] of [[-5.8, -4.7, -0.18], [0, 4.9, 0.12], [6.2, 3.8, -0.34]] as const) {
    const path = new THREE.Mesh(new RoundedBoxGeometry(6.8, 0.08, 1.3, 4, 0.22), pathMaterial);
    path.position.set(x, 0.03, z);
    path.rotation.y = rotation;
    path.receiveShadow = true;
    group.add(path);
  }

  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x91a58d, roughness: 1 });
  const plantMaterial = new THREE.MeshStandardMaterial({ color: 0x5f805c, roughness: 0.9 });
  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2;
    const radiusX = 12.2 + Math.sin(index * 1.7) * 0.7;
    const radiusZ = 7.2 + Math.cos(index * 1.3) * 0.45;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 + (index % 3) * 0.09, 0), stoneMaterial);
    stone.scale.y = 0.62;
    stone.position.set(Math.cos(angle) * radiusX, 0.15, Math.sin(angle) * radiusZ);
    stone.rotation.set(index, angle, index * 0.3);
    stone.castShadow = true;
    group.add(stone);

    if (index % 2 === 0) {
      const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + (index % 4) * 0.08, 1), plantMaterial);
      plant.scale.set(0.75, 1.4, 0.75);
      plant.position.set(Math.cos(angle + 0.08) * (radiusX - 0.4), 0.58, Math.sin(angle + 0.08) * (radiusZ - 0.25));
      plant.castShadow = true;
      group.add(plant);
    }
  }

  const portalMaterial = new THREE.MeshStandardMaterial({ color: 0x33506a, roughness: 0.52, metalness: 0.16 });
  const portal = new THREE.Group();
  const top = new THREE.Mesh(new RoundedBoxGeometry(5.2, 0.35, 0.38, 4, 0.13), portalMaterial);
  top.position.y = 3.5;
  const left = new THREE.Mesh(new RoundedBoxGeometry(0.35, 3.6, 0.38, 4, 0.13), portalMaterial);
  left.position.set(-2.43, 1.73, 0);
  const right = left.clone();
  right.position.x = 2.43;
  portal.add(top, left, right);
  portal.position.set(0, 0, -7.1);
  portal.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = true;
  });
  group.add(portal);

  return group;
}

function setupUi(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-character]').forEach((button) => {
    button.addEventListener('click', () => selectCharacter(button.dataset.character as CharacterId));
  });

  document.getElementById('wander-button')?.addEventListener('click', () => motion.toggleWander());
  document.getElementById('stop-button')?.addEventListener('click', () => motion.stopSelected());
  document.getElementById('overview-button')?.addEventListener('click', () => {
    followSelected = false;
    updateFollowButton();
    cameraFlight = {
      position: CHARACTER_SCENE.camera.overview.clone(),
      target: CHARACTER_SCENE.camera.target.clone(),
    };
  });
  document.getElementById('follow-button')?.addEventListener('click', () => {
    followSelected = !followSelected;
    cameraFlight = null;
    updateFollowButton();
  });
}

function selectCharacter(id: CharacterId): void {
  motion.select(id);
  document.querySelectorAll<HTMLButtonElement>('[data-character]').forEach((button) => {
    const active = button.dataset.character === id;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
}

function updateStatus(state: CharacterMotionState): void {
  const definition = getCharacterDefinition(state.id);
  const status = document.getElementById('character-status');
  const wanderButton = document.getElementById('wander-button');
  const copy = state.mode === 'wander'
    ? '自主巡游中'
    : state.mode === 'target'
      ? '正在前往目标点'
      : state.mode === 'manual'
        ? '由你控制移动'
        : '等待指令';
  if (status) status.textContent = `${definition.name} · ${copy}`;
  document.getElementById('character-app')?.setAttribute('data-motion', state.mode);
  if (wanderButton) {
    wanderButton.textContent = state.mode === 'wander' ? '停止自动巡游' : '开始自动巡游';
    wanderButton.setAttribute('aria-pressed', String(state.mode === 'wander'));
  }
}

function updateFollowButton(): void {
  const followButton = document.getElementById('follow-button');
  followButton?.setAttribute('aria-pressed', String(followSelected));
  followButton?.classList.toggle('is-active', followSelected);
}

function findRigRoot(object: THREE.Object3D): THREE.Object3D | null {
  let current: THREE.Object3D | null = object;
  while (current && !current.name.startsWith('character-')) current = current.parent;
  return current;
}

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { NAVIGATION_BOUNDS } from '../config/world';
import { CITY_PALETTE } from '../config/palette';
import { DayNightController } from './dayNight';

export interface NavigationState {
  camera: THREE.Vector3;
  target: THREE.Vector3;
}

export interface Viewer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  labelRenderer: CSS2DRenderer;
  controls: OrbitControls;
  dayNight: DayNightController;
  /** 平滑飞行到指定位置并看向目标点 */
  flyTo(position: THREE.Vector3, lookAt: THREE.Vector3): void;
  /** 将漫游焦点移到地图坐标，同时保持当前观看方向。 */
  moveToMapPoint(x: number, z: number): void;
  /** 为小地图等外部导航组件提供只读镜头状态。 */
  getNavigationState(): NavigationState;
  /** 复位到全局俯瞰视角 */
  resetView(): void;
  start(): void;
  dispose(): void;
}

const OVERVIEW_LOOK = new THREE.Vector3(0, 0, 0);
const OVERVIEW_POS = new THREE.Vector3(190, 255, 235);
const FLY_SPEED = 0.085;

export function createViewer(container: HTMLElement = document.getElementById('app')!): Viewer {
  // —— 场景 / 相机 ——
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CITY_PALETTE.meadowLight);
  scene.fog = new THREE.Fog(CITY_PALETTE.meadowLight, 430, 950);

  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(fovForAspect(aspect), aspect, 2, 1600);
  camera.position.copy(OVERVIEW_POS);
  camera.lookAt(OVERVIEW_LOOK);

  // —— 渲染器 ——
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = 'block';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  // —— 控制器 ——
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.panSpeed = 0.82;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 55;
  controls.maxDistance = 650;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.39;
  controls.target.copy(OVERVIEW_LOOK);

  // —— 光照：半球天光 + 带阴影的平行光（明亮日景）——
  const hemisphere = new THREE.HemisphereLight(0xf4f8ff, 0x91a58a, 2.25);
  scene.add(hemisphere);
  const ambient = new THREE.AmbientLight(0xf4f7ff, 1.15);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4da, 2.65);
  sun.position.set(-90, 150, 110);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00005;
  sun.shadow.normalBias = 0.035;
  sun.shadow.camera.left = -230;
  sun.shadow.camera.right = 230;
  sun.shadow.camera.top = 230;
  sun.shadow.camera.bottom = -230;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 600;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xb7d8ff, 0.75);
  fill.position.set(100, 65, -120);
  scene.add(fill);

  // —— 昼夜时间系统 ——
  const dayNight = new DayNightController();
  const clock = new THREE.Clock();

  // —— 相机飞行 ——
  let flyTarget: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;

  // 用户手动拖拽时取消飞行
  controls.addEventListener('start', () => {
    flyTarget = null;
  });

  function flyTo(position: THREE.Vector3, lookAt: THREE.Vector3): void {
    flyTarget = { pos: position.clone(), look: clampTarget(lookAt.clone()) };
  }

  function moveToMapPoint(x: number, z: number): void {
    const look = clampTarget(new THREE.Vector3(x, 0, z));
    const offset = camera.position.clone().sub(controls.target).setLength(
      THREE.MathUtils.clamp(camera.position.distanceTo(controls.target), 58, 86),
    );
    flyTo(look.clone().add(offset), look);
  }

  function resetView(): void {
    flyTo(OVERVIEW_POS, OVERVIEW_LOOK);
  }

  function clampTarget(target: THREE.Vector3): THREE.Vector3 {
    target.x = THREE.MathUtils.clamp(target.x, NAVIGATION_BOUNDS.minX, NAVIGATION_BOUNDS.maxX);
    target.y = THREE.MathUtils.clamp(target.y, 0, 18);
    target.z = THREE.MathUtils.clamp(target.z, NAVIGATION_BOUNDS.minZ, NAVIGATION_BOUNDS.maxZ);
    return target;
  }

  function containNavigation(): void {
    const before = controls.target.clone();
    clampTarget(controls.target);
    camera.position.add(controls.target.clone().sub(before));
  }

  // —— 动画循环 ——
  let rafId = 0;
  function animate(): void {
    rafId = requestAnimationFrame(animate);

    // 推进昼夜，应用光照/天空/雾
    const delta = Math.min(clock.getDelta(), 0.1);
    dayNight.update(delta);
    const time = dayNight.getState();
    sun.intensity = time.sunIntensity;
    sun.position.copy(time.sunPosition);
    ambient.intensity = time.ambientIntensity;
    hemisphere.intensity = time.hemisphereIntensity;
    fill.intensity = 0.75 * (0.2 + 0.8 * time.dayFactor);
    scene.background = time.sky;
    if (scene.fog) scene.fog.color.copy(time.fog);

    if (flyTarget) {
      camera.position.lerp(flyTarget.pos, FLY_SPEED);
      controls.target.lerp(flyTarget.look, FLY_SPEED);
      if (
        camera.position.distanceTo(flyTarget.pos) < 0.6 &&
        controls.target.distanceTo(flyTarget.look) < 0.3
      ) {
        flyTarget = null;
      }
    }
    controls.update();
    containNavigation();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  // —— 窗口缩放 ——
  function onResize(): void {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = fovForAspect(camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  function dispose(): void {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    labelRenderer.domElement.remove();
  }

  return {
    scene,
    camera,
    renderer,
    labelRenderer,
    controls,
    dayNight,
    flyTo,
    moveToMapPoint,
    getNavigationState: () => ({ camera: camera.position.clone(), target: controls.target.clone() }),
    resetView,
    start: () => animate(),
    dispose,
  };
}

function fovForAspect(aspect: number): number {
  if (aspect < 0.75) return 58;
  if (aspect < 1.2) return 46;
  return 38;
}

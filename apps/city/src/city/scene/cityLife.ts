import * as THREE from 'three';
import type { DayNightController } from '../core/dayNight';
import { CITY_CANAL, CITY_ROADS, PEDESTRIAN_LOOPS, TRAFFIC_LOOPS, type Point2 } from '../config/world';

const SURFACE_Y = 0.58;
const VEHICLE_COLORS = [0x315d8f, 0xc45b4d, 0xe7c85c, 0xf1ede5, 0x3f6f4f, 0x8a5a3b, 0x2463df, 0x77716a];
const CLOTH_COLORS = [0xd96a4a, 0x4a7dd9, 0x53a653, 0xd9a03f, 0x8a5a9a, 0x3aa0a0];

interface RouteMover {
  group: THREE.Group;
  route: ReadonlyArray<Point2>;
  targetIndex: number;
  speed: number;
  heading: number;
}

interface Vehicle extends RouteMover {}

interface Pedestrian extends RouteMover {
  phase: number;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

interface Lamp {
  group: THREE.Group;
  light: THREE.PointLight;
  bulb: THREE.MeshStandardMaterial;
  intensity: number;
}

export interface CityLife { dispose(): void }

export function createCityLife(scene: THREE.Scene, dayNight: DayNightController): CityLife {
  const vehicles = createVehicles();
  const pedestrians = createPedestrians();
  const lamps = createLamps();
  vehicles.forEach((item) => scene.add(item.group));
  pedestrians.forEach((item) => scene.add(item.group));
  lamps.forEach((item) => scene.add(item.group));

  let rafId = 0;
  const clock = new THREE.Clock();
  const animate = (): void => {
    rafId = requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    vehicles.forEach((vehicle) => updateRouteMover(vehicle, delta, 5.5));
    pedestrians.forEach((pedestrian) => updatePedestrian(pedestrian, delta));
    const nightAmount = dayNight.isNight() ? 1 : 0;
    lamps.forEach((lamp) => {
      lamp.light.intensity = THREE.MathUtils.lerp(lamp.light.intensity, lamp.intensity * nightAmount, 0.08);
      lamp.bulb.emissiveIntensity = THREE.MathUtils.lerp(lamp.bulb.emissiveIntensity, 3.2 * nightAmount, 0.08);
    });
  };
  animate();

  return {
    dispose() {
      cancelAnimationFrame(rafId);
      [...vehicles, ...pedestrians, ...lamps].forEach((item) => scene.remove(item.group));
    },
  };
}

// ── 车辆：闭合车道，不在端点瞬移 ─────────────────────────

function createVehicles(): Vehicle[] {
  const vehicles: Vehicle[] = [];
  TRAFFIC_LOOPS.forEach((centerLine, loopIndex) => {
    for (let lane = 0; lane < 2; lane += 1) {
      const route = offsetRectLoop(centerLine, lane === 0 ? -1.65 : 1.65);
      const orderedRoute = lane === 0 ? route : [...route].reverse();
      const startIndex = (loopIndex + lane * 2) % orderedRoute.length;
      const start = orderedRoute[startIndex];
      const targetIndex = (startIndex + 1) % orderedRoute.length;
      const group = createVehicleMesh(VEHICLE_COLORS[(loopIndex * 2 + lane) % VEHICLE_COLORS.length], lane);
      group.name = `city-vehicle-${loopIndex}-${lane}`;
      group.position.set(start.x, SURFACE_Y, start.z);
      const direction = directionTo(start, orderedRoute[targetIndex]);
      group.rotation.y = direction;
      vehicles.push({ group, route: orderedRoute, targetIndex, speed: 8 + loopIndex * 0.7, heading: direction });
    }
  });
  return vehicles;
}

function offsetRectLoop(route: ReadonlyArray<Point2>, offset: number): Point2[] {
  const xs = route.map((point) => point.x);
  const zs = route.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return route.map((point) => ({
    x: point.x === minX ? point.x + offset : point.x === maxX ? point.x - offset : point.x,
    z: point.z === minZ ? point.z + offset : point.z === maxZ ? point.z - offset : point.z,
  }));
}

function createVehicleMesh(color: number, variant: number): THREE.Group {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.24 });
  const darkPaint = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.72), roughness: 0.5 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x263b4b, roughness: 0.16, metalness: 0.22, transparent: true, opacity: 0.88 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.96 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.3, metalness: 0.75 });
  const headlight = new THREE.MeshStandardMaterial({ color: 0xfff4cf, emissive: 0xffd77c, emissiveIntensity: 1.2 });
  const taillight = new THREE.MeshStandardMaterial({ color: 0xa7211a, emissive: 0x5c0805, emissiveIntensity: 0.8 });

  const length = variant === 0 ? 4.6 : 4.1;
  group.add(box(length, 0.72, 2.05, paint, 0, 0.72, 0));
  group.add(box(length * 0.62, 0.72, 1.82, glass, -0.18, 1.35, 0));
  group.add(box(1.25, 0.22, 1.92, darkPaint, length * 0.34, 1.08, 0));
  group.add(box(0.16, 0.22, 1.55, chrome, length / 2 + 0.07, 0.63, 0));
  for (const z of [-0.72, 0.72]) {
    group.add(box(0.12, 0.28, 0.42, headlight, length / 2 + 0.09, 0.82, z));
    group.add(box(0.12, 0.26, 0.4, taillight, -length / 2 - 0.09, 0.8, z));
  }
  for (const x of [-1.35, 1.35]) {
    for (const z of [-1.03, 1.03]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 14), rubber);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.48, z);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = true;
  });
  return group;
}

// ── 行人：只走已验证的人行环路 ───────────────────────────

function createPedestrians(): Pedestrian[] {
  const people: Pedestrian[] = [];
  PEDESTRIAN_LOOPS.forEach((sourceRoute, loopIndex) => {
    for (let index = 0; index < 3; index += 1) {
      const route = index % 2 === 0 ? sourceRoute : [...sourceRoute].reverse();
      const startIndex = (index + loopIndex) % route.length;
      const start = route[startIndex];
      const targetIndex = (startIndex + 1) % route.length;
      const model = createPedestrianMesh(CLOTH_COLORS[(loopIndex * 3 + index) % CLOTH_COLORS.length], index);
      model.group.name = `city-pedestrian-${loopIndex}-${index}`;
      model.group.position.set(start.x, SURFACE_Y, start.z);
      const heading = directionTo(start, route[targetIndex]);
      model.group.rotation.y = heading;
      people.push({
        ...model,
        route,
        targetIndex,
        speed: 1.45 + index * 0.12,
        heading,
        phase: (loopIndex * 3 + index) * 0.9,
      });
    }
  });
  return people;
}

function createPedestrianMesh(color: number, variant: number): Pick<Pedestrian, 'group' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'> {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
  const trousers = new THREE.MeshStandardMaterial({ color: variant % 2 ? 0x35404f : 0x4e443e, roughness: 0.88 });
  const skin = new THREE.MeshStandardMaterial({ color: [0xe8c39a, 0xc88f68, 0xf0cfaa][variant % 3], roughness: 0.86 });
  const hair = new THREE.MeshStandardMaterial({ color: [0x2c211c, 0x58402d, 0x1d1c1b][variant % 3], roughness: 0.95 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.72, 4, 9), cloth);
  torso.position.y = 1.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), skin);
  head.position.y = 2.35;
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  hairCap.position.y = 2.42;
  const leftArm = limbGroup(0.14, 0.78, cloth, -0.47, 1.84);
  const rightArm = limbGroup(0.14, 0.78, cloth, 0.47, 1.84);
  const leftLeg = limbGroup(0.16, 0.88, trousers, -0.2, 1.02);
  const rightLeg = limbGroup(0.16, 0.88, trousers, 0.2, 1.02);
  group.add(torso, head, hairCap, leftArm, rightArm, leftLeg, rightLeg);
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = true;
  });
  return { group, leftArm, rightArm, leftLeg, rightLeg };
}

function limbGroup(radius: number, length: number, material: THREE.Material, x: number, y: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const limb = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 3, 7), material);
  limb.position.y = -length / 2;
  pivot.add(limb);
  return pivot;
}

function updatePedestrian(person: Pedestrian, delta: number): void {
  updateRouteMover(person, delta, 7);
  person.phase += delta * person.speed * 5;
  const swing = Math.sin(person.phase) * 0.52;
  person.leftArm.rotation.x = swing;
  person.rightArm.rotation.x = -swing;
  person.leftLeg.rotation.x = -swing * 0.72;
  person.rightLeg.rotation.x = swing * 0.72;
  person.group.position.y = SURFACE_Y + Math.abs(Math.sin(person.phase * 2)) * 0.035;
}

// ── 路灯：可见灯杆 + 夜间灯光 ────────────────────────────

function createLamps(): Lamp[] {
  const positions: Array<{ x: number; z: number; rotation: number }> = [];
  for (const z of CITY_ROADS.horizontal) {
    for (let x = -190; x <= 190; x += 38) {
      if (CITY_ROADS.vertical.some((roadX) => Math.abs(x - roadX) < 12) || Math.abs(x - CITY_CANAL.centerX) < 9) continue;
      positions.push({ x, z: z + 7.2, rotation: 0 });
    }
  }
  for (const x of CITY_ROADS.vertical) {
    for (let z = -150; z <= 150; z += 38) {
      if (CITY_ROADS.horizontal.some((roadZ) => Math.abs(z - roadZ) < 12)) continue;
      positions.push({ x: x + 7.2, z, rotation: Math.PI / 2 });
    }
  }
  return positions.map((position) => createLamp(position.x, position.z, position.rotation));
}

function createLamp(x: number, z: number, rotation: number): Lamp {
  const group = new THREE.Group();
  group.name = `city-streetlamp-${Math.round(x)}-${Math.round(z)}`;
  const metal = new THREE.MeshStandardMaterial({ color: 0x29333b, roughness: 0.58, metalness: 0.54 });
  const bulb = new THREE.MeshStandardMaterial({ color: 0xffe4a3, emissive: 0xffc85d, emissiveIntensity: 0 });
  group.add(box(0.24, 5.2, 0.24, metal, 0, 2.6, 0));
  group.add(box(1.4, 0.18, 0.18, metal, 0.58, 5.12, 0));
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.28, 0.35, 12), metal);
  shade.position.set(1.18, 4.94, 0);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8), bulb);
  glow.position.set(1.18, 4.78, 0);
  const light = new THREE.PointLight(0xffd98a, 0, 24, 1.7);
  light.position.copy(glow.position);
  // Keep the fixture visible without compiling dozens of real-time point
  // lights into the city shader. The emissive bulb still provides the glow.
  light.visible = false;
  group.add(shade, glow, light);
  group.position.set(x, SURFACE_Y, z);
  group.rotation.y = rotation;
  return { group, light, bulb, intensity: 4.8 };
}

function updateRouteMover(mover: RouteMover, delta: number, turnRate: number): void {
  let remaining = mover.speed * delta;
  while (remaining > 0.0001) {
    const target = mover.route[mover.targetIndex];
    const dx = target.x - mover.group.position.x;
    const dz = target.z - mover.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.001) {
      mover.targetIndex = (mover.targetIndex + 1) % mover.route.length;
      continue;
    }
    const desiredHeading = Math.atan2(-dz, dx);
    mover.heading += shortestAngle(mover.heading, desiredHeading) * Math.min(1, delta * turnRate);
    mover.group.rotation.y = mover.heading;
    const step = Math.min(remaining, distance);
    mover.group.position.x += (dx / distance) * step;
    mover.group.position.z += (dz / distance) * step;
    remaining -= step;
    if (step >= distance - 0.0001) mover.targetIndex = (mover.targetIndex + 1) % mover.route.length;
  }
}

function directionTo(from: Point2, to: Point2): number {
  return Math.atan2(-(to.z - from.z), to.x - from.x);
}

function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function box(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  return mesh;
}

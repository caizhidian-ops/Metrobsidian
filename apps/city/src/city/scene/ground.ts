import * as THREE from 'three';
import type { BuildingDef } from '../config/buildings';
import { SUPPORTING_BLOCKS } from '../config/cityLayout';
import { CITY_PALETTE } from '../config/palette';
import { CATEGORY_PLOTS, CITY_BOUNDS, CITY_CANAL, CITY_ROADS } from '../config/world';

interface BlockDef {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: number;
}

const CITY_SURFACE_Y = 0.4;
const WATER_SURFACE_Y = CITY_SURFACE_Y + 0.06;
const ROAD_HEIGHT = 0.12;
const ROAD_CENTER_Y = CITY_SURFACE_Y + ROAD_HEIGHT / 2;
const ROAD_MARKING_Y = CITY_SURFACE_Y + ROAD_HEIGHT + 0.04;

export function createGround(scene: THREE.Scene, buildings: BuildingDef[]): void {
  const horizon = new THREE.Mesh(
    new THREE.BoxGeometry(CITY_BOUNDS.width + 1800, 2, CITY_BOUNDS.depth + 1800),
    new THREE.MeshStandardMaterial({ color: CITY_PALETTE.meadowLight, roughness: 1 }),
  );
  horizon.position.y = -1.35;
  horizon.receiveShadow = true;
  scene.add(horizon);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(CITY_BOUNDS.width, 5, CITY_BOUNDS.depth),
    new THREE.MeshStandardMaterial({ color: CITY_PALETTE.meadow, roughness: 0.98 }),
  );
  base.position.y = -2.5;
  base.receiveShadow = true;
  scene.add(base);

  addLandscapePatches(scene);
  addCentralCityPlate(scene);
  addPerimeterPark(scene);
  addWater(scene);
  addRoadNetwork(scene);
  addReservablePlots(scene, buildings);
  addSupportingBlocks(scene);
  addParks(scene);
  addTrees(scene);
  addStreetLife(scene);
}

function addCentralCityPlate(scene: THREE.Scene): void {
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(220, 0.7, 188),
    new THREE.MeshStandardMaterial({ color: CITY_PALETTE.ground, roughness: 0.96 }),
  );
  plate.position.y = 0.05;
  plate.receiveShadow = true;
  scene.add(plate);
}

function addPerimeterPark(scene: THREE.Scene): void {
  const parkMaterial = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.greenLight, roughness: 1 });
  const sections = [
    { x: 0, z: -103, width: 220, depth: 16 },
    { x: 0, z: 103, width: 220, depth: 16 },
    { x: -119, z: 0, width: 16, depth: 188 },
    { x: 119, z: 0, width: 16, depth: 188 },
  ];
  for (const section of sections) {
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(section.width, 0.38, section.depth), parkMaterial);
    lawn.position.set(section.x, 0.19, section.z);
    lawn.receiveShadow = true;
    scene.add(lawn);
  }
}

function addLandscapePatches(scene: THREE.Scene): void {
  const patches = [
    { x: -170, z: -140, width: 70, depth: 44, color: CITY_PALETTE.meadowLight },
    { x: 166, z: -142, width: 76, depth: 40, color: CITY_PALETTE.greenLight },
    { x: -172, z: 140, width: 74, depth: 42, color: CITY_PALETTE.greenLight },
    { x: 168, z: 142, width: 72, depth: 42, color: CITY_PALETTE.meadowLight },
    { x: -62, z: 144, width: 84, depth: 30, color: CITY_PALETTE.meadowLight },
    { x: 70, z: -146, width: 82, depth: 28, color: CITY_PALETTE.greenLight },
  ];
  patches.forEach((patch) => {
    const field = new THREE.Mesh(
      new THREE.BoxGeometry(patch.width, 0.35, patch.depth),
      new THREE.MeshStandardMaterial({ color: patch.color, roughness: 1 }),
    );
    field.position.set(patch.x, 0.18, patch.z);
    field.receiveShadow = true;
    scene.add(field);
  });
}

function addWater(scene: THREE.Scene): void {
  const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: CITY_PALETTE.water,
    roughness: 0.16,
    metalness: 0.04,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const canal = new THREE.Mesh(new THREE.PlaneGeometry(CITY_CANAL.width, CITY_BOUNDS.depth - 12), waterMaterial);
  canal.rotation.x = -Math.PI / 2;
  canal.position.set(CITY_CANAL.centerX, WATER_SURFACE_Y, 0);
  scene.add(canal);

  for (const z of [-148, 148]) {
    const wetland = new THREE.Mesh(new THREE.CircleGeometry(10, 32), waterMaterial);
    wetland.rotation.x = -Math.PI / 2;
    wetland.scale.set(1.12, 0.72, 1);
    wetland.position.set(CITY_CANAL.centerX, WATER_SURFACE_Y, z);
    scene.add(wetland);
  }

  const embankmentMaterial = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.limestone, roughness: 0.9 });
  for (const x of [CITY_CANAL.centerX - CITY_CANAL.width / 2 - 0.55, CITY_CANAL.centerX + CITY_CANAL.width / 2 + 0.55]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, CITY_BOUNDS.depth - 10), embankmentMaterial);
    edge.position.set(x, 0.1, 0);
    edge.castShadow = true;
    edge.receiveShadow = true;
    scene.add(edge);
  }
}

function addRoadNetwork(scene: THREE.Scene): void {
  const roadMaterial = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.road, roughness: 0.94 });
  const markingMaterial = new THREE.MeshBasicMaterial({
    color: CITY_PALETTE.roadMark,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.sidewalk, roughness: 0.96 });

  const addRoad = (width: number, depth: number, x: number, z: number): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, ROAD_HEIGHT, depth), roadMaterial);
    mesh.position.set(x, ROAD_CENTER_Y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  };

  for (const z of CITY_ROADS.horizontal) addRoad(CITY_BOUNDS.width - 12, 10, 0, z);
  for (const x of CITY_ROADS.vertical) {
    let start = CITY_BOUNDS.minZ + 6;
    for (const crossingZ of CITY_ROADS.horizontal) {
      const end = crossingZ - 5;
      addRoad(10, end - start, x, (start + end) / 2);
      start = crossingZ + 5;
    }
    const end = CITY_BOUNDS.maxZ - 6;
    addRoad(10, end - start, x, (start + end) / 2);
  }

  for (const z of CITY_ROADS.horizontal) {
    const bridgeWidth = CITY_CANAL.width + 5;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(bridgeWidth, 0.8, 11.4), sidewalkMaterial);
    bridge.position.set(CITY_CANAL.centerX, 0.92, z);
    bridge.castShadow = true;
    bridge.receiveShadow = true;
    scene.add(bridge);
    for (const side of [-4.6, 4.6]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(bridgeWidth, 0.45, 0.28), markingMaterial);
      rail.position.set(CITY_CANAL.centerX, 1.65, z + side);
      scene.add(rail);
    }
  }

  const stripeGeometry = new THREE.BoxGeometry(4.4, 0.05, 0.22);
  const stripeCount = 220;
  const stripes = new THREE.InstancedMesh(stripeGeometry, markingMaterial, stripeCount);
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (const z of CITY_ROADS.horizontal) {
    for (let x = CITY_BOUNDS.minX + 16; x <= CITY_BOUNDS.maxX - 16; x += 12) {
      if (CITY_ROADS.vertical.some((roadX) => Math.abs(x - roadX) < 8)) continue;
      matrix.makeTranslation(x, ROAD_MARKING_Y, z);
      stripes.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  for (const x of CITY_ROADS.vertical) {
    for (let z = CITY_BOUNDS.minZ + 18; z <= CITY_BOUNDS.maxZ - 18; z += 22) {
      if (CITY_ROADS.horizontal.some((roadZ) => Math.abs(z - roadZ) < 8)) continue;
      matrix.makeRotationY(Math.PI / 2);
      matrix.setPosition(x, ROAD_MARKING_Y, z);
      stripes.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  stripes.count = index;
  stripes.renderOrder = 2;
  scene.add(stripes);
}

function addReservablePlots(scene: THREE.Scene, buildings: BuildingDef[]): void {
  const occupied = new Set(
    buildings.map((building) => `${building.position[0]}:${building.position[2]}`),
  );
  const plotMaterial = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.soil, roughness: 1 });
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.roadMark, roughness: 0.92 });

  CATEGORY_PLOTS.forEach(([x, z]) => {
    if (occupied.has(`${x}:${z}`)) return;
    const plot = new THREE.Mesh(new THREE.BoxGeometry(28, 0.38, 24), plotMaterial);
    plot.position.set(x, 0.32, z);
    plot.receiveShadow = true;
    scene.add(plot);
    for (const edgeZ of [-11.5, 11.5]) scene.add(boxAt(28, 0.22, 0.36, edgeMaterial, x, 0.64, z + edgeZ));
    for (const edgeX of [-13.8, 13.8]) scene.add(boxAt(0.36, 0.22, 24, edgeMaterial, x + edgeX, 0.64, z));
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.6, 0.55, 16),
      new THREE.MeshStandardMaterial({ color: CITY_PALETTE.cobalt, roughness: 0.72 }),
    );
    marker.position.set(x, 0.9, z);
    scene.add(marker);
  });
}

function boxAt(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const item = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  item.position.set(x, y, z);
  item.receiveShadow = true;
  return item;
}

function addSupportingBlocks(scene: THREE.Scene): void {
  const blocks: BlockDef[] = SUPPORTING_BLOCKS.map((block) => ({ ...block }));

  const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
  const bodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.01 });
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, blocks.length);
  bodies.castShadow = true;
  bodies.receiveShadow = true;
  const roofGeometry = new THREE.ConeGeometry(0.72, 0.34, 4);
  const roofMaterial = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.slate, roughness: 0.78 });
  const roofs = new THREE.InstancedMesh(roofGeometry, roofMaterial, blocks.length);
  roofs.castShadow = true;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0));

  blocks.forEach((block, index) => {
    matrix.compose(
      new THREE.Vector3(block.x, block.height / 2 + 0.3, block.z),
      new THREE.Quaternion(),
      new THREE.Vector3(block.width, block.height, block.depth),
    );
    bodies.setMatrixAt(index, matrix);
    bodies.setColorAt(index, new THREE.Color(block.color));
    matrix.compose(
      new THREE.Vector3(block.x, block.height + 2, block.z),
      quaternion,
      new THREE.Vector3(block.width, 5.8, block.depth),
    );
    roofs.setMatrixAt(index, matrix);
  });
  scene.add(bodies, roofs);
  addFacadeWindows(scene, blocks);
}

function addFacadeWindows(scene: THREE.Scene, blocks: BlockDef[]): void {
  const windows: Array<{ x: number; y: number; z: number; width: number }> = [];
  for (const block of blocks) {
    const floors = Math.max(2, Math.floor(block.height / 4));
    for (let floor = 0; floor < floors; floor += 1) {
      for (const offset of [-0.28, 0, 0.28]) {
        windows.push({
          x: block.x + block.width * offset,
          y: 2.8 + floor * 3.2,
          z: block.z + block.depth / 2 + 0.06,
          width: Math.min(2.1, block.width * 0.17),
        });
      }
    }
  }
  const geometry = new THREE.BoxGeometry(1, 1, 0.12);
  const material = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.glass, roughness: 0.24, metalness: 0.08 });
  const mesh = new THREE.InstancedMesh(geometry, material, windows.length);
  const matrix = new THREE.Matrix4();
  windows.forEach((window, index) => {
    matrix.compose(
      new THREE.Vector3(window.x, window.y, window.z),
      new THREE.Quaternion(),
      new THREE.Vector3(window.width, 1.2, 1),
    );
    mesh.setMatrixAt(index, matrix);
  });
  scene.add(mesh);
}

function addParks(scene: THREE.Scene): void {
  const parkMaterial = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.greenLight, roughness: 1 });
  const parks = [
    { x: -18, z: -62, width: 18, depth: 14 },
    { x: 15, z: 54, width: 15, depth: 20 },
    { x: 94, z: -62, width: 20, depth: 14 },
  ];
  for (const park of parks) {
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(park.width, 0.45, park.depth), parkMaterial);
    lawn.position.set(park.x, 0.3, park.z);
    lawn.receiveShadow = true;
    scene.add(lawn);
  }
}

function addTrees(scene: THREE.Scene): void {
  const points: Array<[number, number, number]> = [];
  for (let x = CITY_BOUNDS.minX + 14; x <= CITY_BOUNDS.maxX - 14; x += 18) {
    points.push([x, 0, CITY_BOUNDS.minZ + 9], [x, 0, CITY_BOUNDS.maxZ - 9]);
  }
  for (let z = CITY_BOUNDS.minZ + 24; z <= CITY_BOUNDS.maxZ - 24; z += 18) {
    points.push([CITY_BOUNDS.minX + 9, 0, z], [CITY_BOUNDS.maxX - 9, 0, z]);
  }
  for (const z of [-74, -45, -18, 18, 45, 74]) {
    points.push([CITY_CANAL.centerX - 8, 0, z], [CITY_CANAL.centerX + 8, 0, z]);
  }
  const groves = [
    [-188, -146], [-150, -148], [186, -146], [150, -150],
    [-188, 145], [-150, 148], [188, 145], [150, 148],
    [-48, 150], [54, -151],
  ] as const;
  groves.forEach(([centerX, centerZ], groveIndex) => {
    for (let index = 0; index < 7; index += 1) {
      const angle = (index / 7) * Math.PI * 2 + groveIndex * 0.28;
      points.push([centerX + Math.cos(angle) * (7 + (index % 3) * 3), 0, centerZ + Math.sin(angle) * (6 + (index % 2) * 4)]);
    }
  });

  const trunkGeometry = new THREE.CylinderGeometry(0.32, 0.48, 3.6, 7);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.trunk, roughness: 1 });
  const crownGeometry = new THREE.IcosahedronGeometry(2.3, 1);
  const crownMaterial = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.green, roughness: 0.94 });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, points.length);
  const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, points.length);
  trunks.castShadow = true;
  crowns.castShadow = true;
  const matrix = new THREE.Matrix4();
  points.forEach(([x, _y, z], index) => {
    matrix.makeTranslation(x, 2, z);
    trunks.setMatrixAt(index, matrix);
    const scale = 0.82 + (index % 5) * 0.06;
    matrix.compose(new THREE.Vector3(x, 5.2, z), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
    crowns.setMatrixAt(index, matrix);
    crowns.setColorAt(index, new THREE.Color(index % 7 === 0 ? CITY_PALETTE.autumn : CITY_PALETTE.green));
  });
  scene.add(trunks, crowns);
}

function addStreetLife(scene: THREE.Scene): void {
  const boatMaterial = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.ivory, roughness: 0.64 });
  for (const [z, color] of [[-48, CITY_PALETTE.cobalt], [4, CITY_PALETTE.red], [53, CITY_PALETTE.sand]] as const) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.8, 2.2), boatMaterial);
    hull.position.y = 0.65;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.8, 1.55),
      new THREE.MeshStandardMaterial({ color, roughness: 0.55 }),
    );
    cabin.position.y = 1.45;
    boat.add(hull, cabin);
    boat.position.set(CITY_CANAL.centerX, 0.12, z);
    scene.add(boat);
  }

  const lampPoints: Array<[number, number]> = [];
  for (let z = -67; z <= 67; z += 13.4) lampPoints.push([-9, z], [13, z]);
  const poleGeometry = new THREE.CylinderGeometry(0.12, 0.18, 3.8, 7);
  const poleMaterial = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.slate, roughness: 0.7 });
  const lampGeometry = new THREE.SphereGeometry(0.38, 10, 6);
  const lampMaterial = new THREE.MeshStandardMaterial({ color: CITY_PALETTE.roadMark, roughness: 0.36 });
  const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, lampPoints.length);
  const lamps = new THREE.InstancedMesh(lampGeometry, lampMaterial, lampPoints.length);
  const matrix = new THREE.Matrix4();
  lampPoints.forEach(([x, z], index) => {
    matrix.makeTranslation(x, 2.1, z);
    poles.setMatrixAt(index, matrix);
    matrix.makeTranslation(x, 4.05, z);
    lamps.setMatrixAt(index, matrix);
  });
  scene.add(poles, lamps);
}

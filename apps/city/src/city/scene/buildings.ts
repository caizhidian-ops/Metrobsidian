import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { createDeepSeekCharacter, createNiuCharacter } from '../../characters/characterFactory';
import type { BuildingDef } from '../config/buildings';
import { CITY_PALETTE } from '../config/palette';

const gltfLoader = new GLTFLoader();

export async function createBuilding(def: BuildingDef): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = `district-${def.id}`;
  group.userData.buildingId = def.id;

  const shell = standard(def.color, 0.82, 0.03);
  const stone = standard(CITY_PALETTE.limestone, 0.92, 0.02);
  const roof = standard(CITY_PALETTE.slate, 0.76, 0.08);
  const accent = standard(def.accentColor, 0.62, 0.08);
  const glass = new THREE.MeshPhysicalMaterial({
    color: CITY_PALETTE.glass,
    roughness: 0.22,
    metalness: 0.08,
    transmission: 0.12,
    transparent: true,
    opacity: 0.78,
  });

  const plinth = box(def.width * 1.3, 1.2, def.depth * 1.28, stone, 0, 0.6, 0);
  plinth.receiveShadow = true;
  group.add(plinth);
  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(def.width * 0.82, def.width * 0.87, 48),
    new THREE.MeshBasicMaterial({
      color: CITY_PALETTE.cobalt,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  selectionRing.name = 'selection-ring';
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 1.28;
  selectionRing.visible = false;
  group.userData.selectionRing = selectionRing;
  group.add(selectionRing);

  const builders: Record<string, () => void> = {
    company: () => buildCompany(group, shell, roof, glass, accent),
    home: () => buildHome(group, shell, roof, glass, accent),
    school: () => buildSchool(group, shell, roof, glass, accent),
    hospital: () => buildHospital(group, shell, roof, glass, accent),
    canteen: () => buildCanteen(group, shell, roof, glass, accent),
    construction: () => buildConstruction(group, shell, roof, glass, accent),
    characters: () => buildCharactersPlaza(group, shell, roof, glass, accent),
  };
  const fallback = builders[def.id] ?? (() => buildGeneratedDistrict(group, def, shell, roof, glass, accent));
  if (def.asset) {
    try {
      group.add(await loadBuildingAsset(def));
      addSemanticAccent(group, def, roof, accent);
    } catch (error) {
      console.warn(`Unable to load ${def.asset}; using the procedural ${def.id} building.`, error);
      fallback();
    }
  } else {
    fallback();
  }

  const label = makeLabel(def);
  label.position.set(0, def.labelHeight ?? def.height + 10, 0);
  group.add(label);
  group.position.set(...def.position);
  return group;
}

async function loadBuildingAsset(def: BuildingDef): Promise<THREE.Group> {
  if (!def.asset) throw new Error(`Missing asset for ${def.id}`);
  const model = (await gltfLoader.loadAsync(def.asset)).scene;
  model.name = `asset-${def.id}`;
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (def.asset?.includes('/assets/generated/')) tuneGeneratedMaterial(child.material, def.id === 'hospital');
    }
  });

  const initialBounds = new THREE.Box3().setFromObject(model);
  const size = initialBounds.getSize(new THREE.Vector3());
  const scale = Math.min(
    (def.width * 0.9) / Math.max(size.x, 0.001),
    def.height / Math.max(size.y, 0.001),
    (def.depth * 0.9) / Math.max(size.z, 0.001),
  );
  model.scale.multiplyScalar(scale);

  const scaledBounds = new THREE.Box3().setFromObject(model);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, 1.22 - scaledBounds.min.y, -center.z);
  return model;
}

function tuneGeneratedMaterial(material: THREE.Material | THREE.Material[], brighten: boolean): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const item of materials) {
    if (item instanceof THREE.MeshStandardMaterial) {
      // Lux3D outputs can be authored as fully metallic. Clamp the response so the
      // embedded texture remains legible without requiring an HDR environment.
      item.metalness = Math.min(item.metalness, 0.28);
      item.roughness = Math.max(item.roughness, 0.42);
      if (brighten) item.color.lerp(new THREE.Color(0xffffff), 0.35);
      item.needsUpdate = true;
    }
  }
}

function addSemanticAccent(
  group: THREE.Group,
  def: BuildingDef,
  roof: THREE.Material,
  accent: THREE.Material,
): void {
  if (def.id === 'company') {
    const logoTexture = makeCompanyLogoTexture();
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(7.6, 3.1),
      new THREE.MeshStandardMaterial({
        map: logoTexture,
        roughness: .58,
        metalness: .04,
        side: THREE.DoubleSide,
      }),
    );
    logo.name = 'company-facade-logo';
    logo.position.set(0, 12.8, def.depth * .47);
    group.add(logo);
  }
  if (def.id === 'hospital') {
    group.add(
      box(6.2, 1.7, 0.7, accent, 0, def.height * 0.7, def.depth * 0.46),
      box(1.7, 6.2, 0.7, accent, 0, def.height * 0.7, def.depth * 0.46),
    );
  }
  if (def.id === 'canteen') {
    for (const x of [-6, 0, 6]) {
      const parasol = mesh(new THREE.ConeGeometry(2.6, 1.4, 12), accent);
      parasol.position.set(x, 4.6, def.depth * 0.44);
      group.add(parasol, box(0.22, 3.2, 0.22, roof, x, 2.9, def.depth * 0.44));
    }
  }
  if (def.id === 'construction') {
    group.add(
      box(0.8, 27, 0.8, accent, def.width * 0.47, 14.7, def.depth * 0.43),
      box(22, 0.7, 0.7, accent, -1, 27.9, def.depth * 0.43),
      box(0.28, 7, 0.28, accent, -11.8, 24.2, def.depth * 0.43),
    );
  }
}

function makeCompanyLogoTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 416;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = '#f3f0e8';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#173b6b';
  context.fillRect(0, 0, 260, canvas.height);
  context.fillStyle = '#f3f0e8';
  context.font = '700 170px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('DC', 130, 218);
  context.fillStyle = '#14243a';
  context.font = '700 82px Arial';
  context.textAlign = 'left';
  context.fillText('DEEP CITY', 320, 185);
  context.fillStyle = '#c0402c';
  context.font = '500 32px Arial';
  context.fillText('COMPANY', 324, 255);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function standard(color: number, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const item = new THREE.Mesh(geometry, material);
  item.castShadow = !material.transparent;
  item.receiveShadow = true;
  return item;
}

function box(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const item = mesh(new THREE.BoxGeometry(width, height, depth), material);
  item.position.set(x, y, z);
  return item;
}

function addWindowBand(group: THREE.Group, width: number, y: number, z: number, material: THREE.Material): void {
  group.add(box(width, 1.05, 0.24, material, 0, y, z));
}

function buildCompany(group: THREE.Group, shell: THREE.Material, roof: THREE.Material, glass: THREE.Material, accent: THREE.Material): void {
  group.add(box(15, 31, 15, shell, 0, 16.7, 0));
  group.add(box(17, 1.4, 17, roof, 0, 32.8, 0));
  for (let y = 5; y < 31; y += 4) addWindowBand(group, 12.2, y, 7.62, glass);
  const crown = mesh(new THREE.CylinderGeometry(5.2, 6.8, 4.8, 8), accent);
  crown.position.y = 35.8;
  group.add(crown);
  const mast = mesh(new THREE.CylinderGeometry(0.28, 0.4, 8, 10), roof);
  mast.position.y = 42;
  group.add(mast);
}

function buildHome(group: THREE.Group, shell: THREE.Material, roof: THREE.Material, glass: THREE.Material, accent: THREE.Material): void {
  for (const [x, z, scale] of [[-6, 1, 0.9], [0, -2, 1.1], [6, 1, 0.86]] as const) {
    const width = 7.2 * scale;
    const height = 8 * scale;
    group.add(box(width, height, 8, shell, x, 1.2 + height / 2, z));
    const gable = mesh(new THREE.ConeGeometry(width * 0.72, 4.8 * scale, 4), roof);
    gable.rotation.y = Math.PI / 4;
    gable.position.set(x, height + 3.5, z);
    group.add(gable);
    group.add(box(width * 0.5, 2.2, 0.2, glass, x, 5.4, z + 4.05));
  }
  const garden = mesh(new THREE.CylinderGeometry(4.8, 5.2, 0.45, 20), accent);
  garden.position.set(0, 1.45, 7);
  group.add(garden);
}

function buildSchool(group: THREE.Group, shell: THREE.Material, roof: THREE.Material, glass: THREE.Material, accent: THREE.Material): void {
  group.add(box(25, 8, 7, shell, 0, 5.2, -5), box(7, 8, 15, shell, -9, 5.2, 2), box(7, 8, 15, shell, 9, 5.2, 2));
  group.add(box(27, 1.1, 8.5, roof, 0, 9.7, -5));
  for (const x of [-9, -5.4, -1.8, 1.8, 5.4, 9]) group.add(box(1.25, 3.2, 0.22, glass, x, 5.1, -1.4));
  group.add(box(7, 16, 7, shell, 0, 11.2, -4.5), box(8.2, 1, 8.2, accent, 0, 19.7, -4.5));
  const dome = mesh(new THREE.SphereGeometry(4.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), roof);
  dome.position.set(0, 20.2, -4.5);
  group.add(dome);
}

function buildHospital(group: THREE.Group, shell: THREE.Material, roof: THREE.Material, glass: THREE.Material, accent: THREE.Material): void {
  group.add(box(24, 9, 12, shell, 0, 5.7, 0), box(12, 10, 20, shell, 0, 13.8, 0));
  group.add(box(25.5, 1, 13.5, roof, 0, 10.7, 0));
  for (const x of [-8.5, -4.2, 4.2, 8.5]) group.add(box(2.3, 2.4, 0.24, glass, x, 6.2, 6.1));
  group.add(box(8.4, 2.2, 1, accent, 0, 20.2, 10.2), box(2.2, 8.4, 1, accent, 0, 20.2, 10.2));
}

function buildCanteen(group: THREE.Group, shell: THREE.Material, roof: THREE.Material, glass: THREE.Material, accent: THREE.Material): void {
  const hall = mesh(new THREE.CylinderGeometry(10, 11, 8.2, 28), shell);
  hall.position.y = 5.3;
  group.add(hall);
  const canopy = mesh(new THREE.CylinderGeometry(12, 10, 2, 28), roof);
  canopy.position.y = 10.2;
  group.add(canopy);
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    group.add(box(1.6, 2.8, 0.25, glass, Math.cos(angle) * 9.7, 5.5, Math.sin(angle) * 9.7));
  }
  const skylight = mesh(new THREE.CylinderGeometry(3.5, 4.6, 2.4, 20), accent);
  skylight.position.y = 12;
  group.add(skylight);
}

function buildConstruction(group: THREE.Group, shell: THREE.Material, roof: THREE.Material, glass: THREE.Material, accent: THREE.Material): void {
  for (const y of [4, 9, 14, 19]) {
    const floor = box(18, 0.7, 16, y === 19 ? shell : roof, 0, y, 0);
    floor.castShadow = false;
    group.add(floor);
  }
  for (const x of [-8, 8]) for (const z of [-7, 7]) group.add(box(0.65, 20, 0.65, glass, x, 10.5, z));
  group.add(box(1, 29, 1, accent, 9, 15.5, 7), box(25, 0.8, 0.8, accent, -2.5, 29.5, 7));
  group.add(box(0.3, 8, 0.3, accent, -11.5, 25, 7));
}

function buildCharactersPlaza(group: THREE.Group, shell: THREE.Material, roof: THREE.Material, glass: THREE.Material, accent: THREE.Material): void {
  const plaza = mesh(new THREE.CylinderGeometry(7.4, 8.1, 1.1, 32), shell);
  plaza.position.y = 1.7;
  group.add(plaza);

  const stage = mesh(new THREE.CylinderGeometry(5.4, 5.8, 0.45, 32), roof);
  stage.position.y = 2.45;
  group.add(stage);

  const portal = new THREE.Group();
  portal.add(
    box(8.8, 0.42, 0.5, accent, 0, 5.9, -3.9),
    box(0.48, 4.1, 0.5, accent, -4.16, 3.95, -3.9),
    box(0.48, 4.1, 0.5, accent, 4.16, 3.95, -3.9),
  );
  group.add(portal);

  for (const [x, z] of [[-5.6, 2.8], [5.6, 2.8], [-5.6, -1.6], [5.6, -1.6]] as const) {
    group.add(box(0.24, 1.7, 0.24, glass, x, 3.15, z));
  }

  const niu = createNiuCharacter();
  niu.root.scale.setScalar(1.55);
  niu.root.position.set(-2.15, 2.67, 0.55);
  niu.root.rotation.y = Math.PI * 0.2;
  group.add(niu.root);

  const deepseek = createDeepSeekCharacter();
  deepseek.root.scale.setScalar(1.55);
  deepseek.root.position.set(2.25, 2.67, -0.35);
  deepseek.root.rotation.y = -Math.PI * 0.26;
  group.add(deepseek.root);

  const beacon = mesh(new THREE.SphereGeometry(0.72, 20, 14), accent);
  beacon.position.set(0, 6.7, -3.9);
  beacon.castShadow = true;
  group.add(beacon);
}

function buildGeneratedDistrict(
  group: THREE.Group,
  def: BuildingDef,
  shell: THREE.Material,
  roof: THREE.Material,
  glass: THREE.Material,
  accent: THREE.Material,
): void {
  const lowerHeight = def.height * 0.58;
  group.add(box(def.width, lowerHeight, def.depth, shell, 0, 1.2 + lowerHeight / 2, 0));
  group.add(box(def.width * 0.62, def.height * 0.55, def.depth * 0.62, shell, 0, lowerHeight + def.height * 0.25, 0));
  group.add(box(def.width * 1.08, 1, def.depth * 1.08, roof, 0, lowerHeight + 1.2, 0));
  for (const x of [-0.3, 0, 0.3]) {
    group.add(box(def.width * 0.16, 2.1, 0.24, glass, def.width * x, lowerHeight * 0.62, def.depth / 2 + 0.14));
  }
  const beacon = mesh(new THREE.CylinderGeometry(2.1, 2.8, 2.4, 8), accent);
  beacon.position.y = def.height + 3;
  group.add(beacon);
}

function makeLabel(def: BuildingDef): CSS2DObject {
  const element = document.createElement('button');
  element.className = 'building-label';
  element.type = 'button';
  element.dataset.buildingId = def.id;
  element.setAttribute('aria-label', `查看${def.name}档案`);
  const name = document.createElement('strong');
  name.textContent = def.name;
  element.append(name);
  return new CSS2DObject(element);
}

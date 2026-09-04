import * as THREE from 'three';
import type { CharacterId } from './config';

export interface CharacterRig {
  id: CharacterId;
  root: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  head: THREE.Group;
  shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  animate(time: number, stride: number): void;
}

const geometry = {
  sphere: new THREE.SphereGeometry(1, 32, 20),
  limb: new THREE.CapsuleGeometry(0.18, 0.72, 6, 12),
  shortLimb: new THREE.CapsuleGeometry(0.2, 0.48, 6, 12),
  cone: new THREE.ConeGeometry(0.16, 0.72, 16),
  eye: new THREE.SphereGeometry(0.095, 16, 10),
  pupil: new THREE.SphereGeometry(0.045, 12, 8),
};

function material(color: number, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(
  source: THREE.BufferGeometry,
  surface: THREE.Material,
  scale: THREE.Vector3Tuple,
  position: THREE.Vector3Tuple,
): THREE.Mesh {
  const result = new THREE.Mesh(source, surface);
  result.scale.set(...scale);
  result.position.set(...position);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function createLimb(
  surface: THREE.Material,
  position: THREE.Vector3Tuple,
  scale: THREE.Vector3Tuple = [1, 1, 1],
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(...position);
  const shape = mesh(geometry.limb, surface, scale, [0, -0.48, 0]);
  pivot.add(shape);
  return pivot;
}

function createShadow(width: number): THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(width, 32),
    new THREE.MeshBasicMaterial({ color: 0x1d2a31, transparent: true, opacity: 0.17, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.018;
  return shadow;
}

function addEye(parent: THREE.Object3D, x: number, y: number, z: number, scaleX = 1): void {
  const white = mesh(geometry.eye, material(0xf8f4e8, 0.4), [scaleX, 1.1, 0.55], [x, y, z]);
  const pupil = mesh(geometry.pupil, material(0x28262c, 0.35), [scaleX, 1, 0.45], [x, y - 0.012, z + 0.07]);
  parent.add(white, pupil);
}

export function createNiuCharacter(): CharacterRig {
  const root = new THREE.Group();
  root.name = 'character-niu';

  const fur = material(0xdca629, 1);
  const furLight = material(0xefc65a, 0.95);
  const muzzle = material(0xb887a5, 0.82);
  const horn = material(0x514955, 0.72);
  const hoof = material(0x98758e, 0.88);
  const dark = material(0x352d35, 0.92);

  const body = mesh(geometry.sphere, fur, [0.78, 1.04, 0.56], [0, 1.55, 0]);
  const belly = mesh(geometry.sphere, furLight, [0.54, 0.75, 0.04], [0, 1.42, 0.53]);
  root.add(body, belly);

  const head = new THREE.Group();
  head.position.set(0, 2.58, 0.02);
  const skull = mesh(geometry.sphere, fur, [0.63, 0.61, 0.55], [0, 0, 0]);
  const snout = mesh(geometry.sphere, muzzle, [0.48, 0.25, 0.31], [0, -0.21, 0.48]);
  const noseLine = mesh(new THREE.TorusGeometry(0.27, 0.025, 10, 28, Math.PI), dark, [1, 0.7, 1], [0, -0.27, 0.74]);
  noseLine.rotation.z = Math.PI;
  head.add(skull, snout, noseLine);
  addEye(head, -0.25, 0.12, 0.5, 1.15);
  addEye(head, 0.25, 0.12, 0.5, 1.15);

  for (const side of [-1, 1]) {
    const hornMesh = mesh(geometry.cone, horn, [1, 1, 1], [side * 0.38, 0.58, -0.02]);
    hornMesh.rotation.z = side * -0.42;
    const ear = mesh(geometry.sphere, furLight, [0.28, 0.13, 0.2], [side * 0.59, 0.18, 0]);
    ear.rotation.z = side * -0.22;
    const brow = mesh(new THREE.BoxGeometry(0.28, 0.055, 0.055), dark, [1, 1, 1], [side * 0.24, 0.29, 0.55]);
    brow.rotation.z = side * -0.12;
    head.add(hornMesh, ear, brow);
  }
  root.add(head);

  const leftArm = createLimb(fur, [-0.68, 2.05, 0], [1.08, 1.05, 1.08]);
  const rightArm = createLimb(fur, [0.68, 2.05, 0], [1.08, 1.05, 1.08]);
  const leftHand = mesh(geometry.sphere, hoof, [0.24, 0.2, 0.2], [0, -1.0, 0.04]);
  const rightHand = leftHand.clone();
  leftArm.add(leftHand);
  rightArm.add(rightHand);

  const leftLeg = createLimb(fur, [-0.34, 0.9, 0], [1.18, 1.12, 1.18]);
  const rightLeg = createLimb(fur, [0.34, 0.9, 0], [1.18, 1.12, 1.18]);
  leftLeg.add(mesh(geometry.sphere, hoof, [0.27, 0.18, 0.4], [0, -1.05, 0.15]));
  rightLeg.add(mesh(geometry.sphere, hoof, [0.27, 0.18, 0.4], [0, -1.05, 0.15]));
  root.add(leftArm, rightArm, leftLeg, rightLeg);

  const shadow = createShadow(0.9);
  root.add(shadow);

  return {
    id: 'niu',
    root,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    head,
    shadow,
    animate(time, stride) {
      const swing = Math.sin(time * 8) * 0.65 * stride;
      leftArm.rotation.x = swing;
      rightArm.rotation.x = -swing;
      leftLeg.rotation.x = -swing;
      rightLeg.rotation.x = swing;
      body.position.y = 1.55 + Math.abs(Math.sin(time * 8)) * 0.045 * stride;
      head.rotation.z = Math.sin(time * 2.1) * 0.025 + Math.sin(time * 8) * 0.035 * stride;
    },
  };
}

export function createDeepSeekCharacter(): CharacterRig {
  const root = new THREE.Group();
  root.name = 'character-deepseek';

  const blue = material(0x4d6bfe, 0.58, 0.05);
  const blueDark = material(0x2946c7, 0.48, 0.08);
  const white = material(0xf5f8ff, 0.52);
  const joint = material(0xa8b7ff, 0.4, 0.18);

  const body = mesh(geometry.sphere, blue, [0.95, 0.83, 0.62], [0, 1.68, 0]);
  body.rotation.z = -0.08;
  const belly = mesh(geometry.sphere, white, [0.63, 0.54, 0.045], [-0.05, 1.55, 0.61]);
  belly.rotation.z = -0.25;
  root.add(body, belly);

  const head = new THREE.Group();
  head.position.set(0, 2.22, 0.02);
  const forehead = mesh(geometry.sphere, blue, [0.78, 0.55, 0.56], [-0.13, 0, 0]);
  const beak = mesh(geometry.sphere, blue, [0.49, 0.21, 0.3], [0.55, -0.18, 0.35]);
  head.add(forehead, beak);
  addEye(head, 0.17, 0.1, 0.55, 0.92);
  const eyeDrop = mesh(geometry.sphere, white, [0.07, 0.12, 0.035], [0.02, -0.07, 0.58]);
  eyeDrop.rotation.z = 0.5;
  head.add(eyeDrop);

  const tailStem = mesh(geometry.shortLimb, blueDark, [0.7, 0.92, 0.7], [-0.47, 0.55, -0.13]);
  tailStem.rotation.z = -0.52;
  const tailLeft = mesh(geometry.sphere, blue, [0.32, 0.18, 0.12], [-0.6, 0.83, -0.12]);
  const tailRight = mesh(geometry.sphere, blue, [0.32, 0.18, 0.12], [-0.2, 0.9, -0.12]);
  tailLeft.rotation.z = 0.55;
  tailRight.rotation.z = -0.55;
  head.add(tailStem, tailLeft, tailRight);
  root.add(head);

  const leftArm = createLimb(blue, [-0.72, 1.9, 0], [0.76, 0.72, 1.15]);
  const rightArm = createLimb(blue, [0.72, 1.9, 0], [0.76, 0.72, 1.15]);
  leftArm.rotation.z = -0.28;
  rightArm.rotation.z = 0.28;

  const leftLeg = createLimb(joint, [-0.32, 1.05, 0], [1.05, 0.78, 1.05]);
  const rightLeg = createLimb(joint, [0.32, 1.05, 0], [1.05, 0.78, 1.05]);
  leftLeg.add(mesh(geometry.sphere, blueDark, [0.29, 0.17, 0.38], [0, -0.86, 0.17]));
  rightLeg.add(mesh(geometry.sphere, blueDark, [0.29, 0.17, 0.38], [0, -0.86, 0.17]));
  root.add(leftArm, rightArm, leftLeg, rightLeg);

  const shadow = createShadow(1);
  root.add(shadow);

  return {
    id: 'deepseek',
    root,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    head,
    shadow,
    animate(time, stride) {
      const swing = Math.sin(time * 9) * 0.56 * stride;
      leftArm.rotation.x = swing * 0.7;
      rightArm.rotation.x = -swing * 0.7;
      leftLeg.rotation.x = -swing;
      rightLeg.rotation.x = swing;
      body.position.y = 1.68 + Math.sin(time * 2.8) * 0.025 + Math.abs(Math.sin(time * 9)) * 0.04 * stride;
      head.rotation.y = Math.sin(time * 1.7) * 0.05;
      tailLeft.rotation.z = 0.55 + Math.sin(time * 3.4) * 0.12;
      tailRight.rotation.z = -0.55 - Math.sin(time * 3.4) * 0.12;
    },
  };
}

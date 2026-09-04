import * as THREE from 'three';

export type CharacterId = 'niu' | 'deepseek';

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  accent: number;
  spawn: THREE.Vector3Tuple;
  speed: number;
}

export const CHARACTER_SCENE = {
  id: 'character-lab-01',
  route: '/characters.html',
  size: { width: 28, depth: 18 },
  camera: {
    overview: new THREE.Vector3(11.5, 8.2, 13.5),
    target: new THREE.Vector3(0, 1.35, 0),
  },
  movementBounds: {
    minX: -11.5,
    maxX: 11.5,
    minZ: -6.7,
    maxZ: 6.7,
  },
  characters: [
    { id: 'niu', name: '牛来的牛', accent: 0xdca629, spawn: [-3.2, 0, 0.4], speed: 3.2 },
    { id: 'deepseek', name: 'DeepSeek', accent: 0x4d6bfe, spawn: [3.2, 0, -0.4], speed: 3.6 },
  ] satisfies CharacterDefinition[],
} as const;

export function getCharacterDefinition(id: CharacterId): CharacterDefinition {
  return CHARACTER_SCENE.characters.find((character) => character.id === id)!;
}

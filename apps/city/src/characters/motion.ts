import * as THREE from 'three';
import type { CharacterRig } from './characterFactory';
import { CHARACTER_SCENE, getCharacterDefinition, type CharacterId } from './config';

type MotionMode = 'idle' | 'manual' | 'target' | 'wander';

export interface CharacterMotionState {
  id: CharacterId;
  mode: MotionMode;
  moving: boolean;
}

interface RuntimeCharacter {
  rig: CharacterRig;
  velocity: THREE.Vector3;
  target: THREE.Vector3 | null;
  mode: MotionMode;
  nextWanderAt: number;
}

export class CharacterMotionController {
  private readonly characters = new Map<CharacterId, RuntimeCharacter>();
  private readonly keys = new Set<string>();
  private selectedId: CharacterId = 'niu';
  private onStateChange: (state: CharacterMotionState) => void = () => undefined;
  private lastEmittedState = '';

  constructor(rigs: CharacterRig[]) {
    rigs.forEach((rig) => {
      this.characters.set(rig.id, {
        rig,
        velocity: new THREE.Vector3(),
        target: null,
        mode: 'idle',
        nextWanderAt: 0,
      });
    });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  setStateListener(listener: (state: CharacterMotionState) => void): void {
    this.onStateChange = listener;
    this.emitState();
  }

  select(id: CharacterId): void {
    this.selectedId = id;
    this.emitState();
  }

  getSelectedId(): CharacterId {
    return this.selectedId;
  }

  getSelectedPosition(target = new THREE.Vector3()): THREE.Vector3 {
    return target.copy(this.selected.rig.root.position);
  }

  moveSelectedTo(point: THREE.Vector3): void {
    const runtime = this.selected;
    runtime.target = this.clampPoint(point.clone());
    runtime.mode = 'target';
    this.emitState();
  }

  toggleWander(): void {
    const runtime = this.selected;
    if (runtime.mode === 'wander') {
      this.stopSelected();
      return;
    }
    runtime.mode = 'wander';
    runtime.target = this.randomTarget();
    runtime.nextWanderAt = 0;
    this.emitState();
  }

  stopSelected(): void {
    const runtime = this.selected;
    runtime.mode = 'idle';
    runtime.target = null;
    runtime.velocity.set(0, 0, 0);
    this.emitState();
  }

  update(delta: number, elapsed: number, camera: THREE.Camera): void {
    for (const runtime of this.characters.values()) {
      const direction = new THREE.Vector3();
      const isSelected = runtime.rig.id === this.selectedId;
      const manualDirection = isSelected ? this.getManualDirection(camera) : null;

      if (manualDirection && manualDirection.lengthSq() > 0) {
        runtime.mode = 'manual';
        runtime.target = null;
        direction.copy(manualDirection);
      } else if (runtime.mode === 'manual') {
        runtime.mode = 'idle';
      }

      if ((runtime.mode === 'target' || runtime.mode === 'wander') && runtime.target) {
        direction.copy(runtime.target).sub(runtime.rig.root.position);
        direction.y = 0;
        if (direction.length() < 0.22) {
          runtime.target = null;
          if (runtime.mode === 'target') runtime.mode = 'idle';
          if (runtime.mode === 'wander') runtime.nextWanderAt = elapsed + 0.65;
        } else {
          direction.normalize();
        }
      }

      if (runtime.mode === 'wander' && !runtime.target && elapsed >= runtime.nextWanderAt) {
        runtime.target = this.randomTarget();
      }

      const speed = getCharacterDefinition(runtime.rig.id).speed;
      const desiredVelocity = direction.multiplyScalar(speed);
      runtime.velocity.lerp(desiredVelocity, 1 - Math.exp(-delta * 9));
      if (desiredVelocity.lengthSq() === 0) runtime.velocity.multiplyScalar(Math.max(0, 1 - delta * 8));

      const moving = runtime.velocity.lengthSq() > 0.025;
      if (moving) {
        runtime.rig.root.position.addScaledVector(runtime.velocity, delta);
        this.clampPoint(runtime.rig.root.position);
        const desiredRotation = Math.atan2(runtime.velocity.x, runtime.velocity.z);
        runtime.rig.root.rotation.y = dampAngle(runtime.rig.root.rotation.y, desiredRotation, 10, delta);
      }
      runtime.rig.animate(elapsed, THREE.MathUtils.clamp(runtime.velocity.length() / speed, 0, 1));
    }
    this.emitState();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  private get selected(): RuntimeCharacter {
    return this.characters.get(this.selectedId)!;
  }

  private getManualDirection(camera: THREE.Camera): THREE.Vector3 | null {
    const x = Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft'));
    const z = Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup'));
    if (x === 0 && z === 0) return null;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    return forward.multiplyScalar(-z).addScaledVector(right, x).normalize();
  }

  private randomTarget(): THREE.Vector3 {
    const bounds = CHARACTER_SCENE.movementBounds;
    return new THREE.Vector3(
      THREE.MathUtils.lerp(bounds.minX, bounds.maxX, Math.random()),
      0,
      THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, Math.random()),
    );
  }

  private clampPoint(point: THREE.Vector3): THREE.Vector3 {
    const bounds = CHARACTER_SCENE.movementBounds;
    point.x = THREE.MathUtils.clamp(point.x, bounds.minX, bounds.maxX);
    point.y = 0;
    point.z = THREE.MathUtils.clamp(point.z, bounds.minZ, bounds.maxZ);
    return point;
  }

  private emitState(): void {
    const runtime = this.selected;
    const moving = runtime.velocity.lengthSq() > 0.025;
    const signature = `${this.selectedId}:${runtime.mode}:${moving}`;
    if (signature === this.lastEmittedState) return;
    this.lastEmittedState = signature;
    this.onStateChange({ id: this.selectedId, mode: runtime.mode, moving });
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(event.key.toLowerCase())) return;
    if (event.key.startsWith('Arrow')) event.preventDefault();
    this.keys.add(event.key.toLowerCase());
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
    this.emitState();
  };
}

function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-lambda * delta));
}

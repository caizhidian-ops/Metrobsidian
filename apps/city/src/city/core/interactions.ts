import * as THREE from 'three';
import type { Viewer } from './createViewer';

export function setupBuildingInteractions(
  viewer: Viewer,
  groups: THREE.Group[],
  onSelect: (buildingId: string) => void,
): () => void {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let selected: THREE.Group | null = null;
  let pointerStart: { x: number; y: number } | null = null;

  const findGroup = (object: THREE.Object3D | null): THREE.Group | null => {
    let current = object;
    while (current) {
      if (typeof current.userData.buildingId === 'string') return current as THREE.Group;
      current = current.parent;
    }
    return null;
  };

  const hitTest = (event: PointerEvent): THREE.Group | null => {
    const rect = viewer.renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, viewer.camera);
    return findGroup(raycaster.intersectObjects(groups, true)[0]?.object ?? null);
  };

  const select = (group: THREE.Group): void => {
    if (selected?.userData.selectionRing) selected.userData.selectionRing.visible = false;
    selected = group;
    if (selected.userData.selectionRing) selected.userData.selectionRing.visible = true;
    onSelect(String(group.userData.buildingId));
  };

  const onPointerDown = (event: PointerEvent) => {
    pointerStart = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    if (document.body.dataset.annotationMode === 'placing') return;
    if (!pointerStart) return;
    const travel = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (travel < 5) {
      const group = hitTest(event);
      if (group) select(group);
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (document.body.dataset.annotationMode === 'placing') return;
    viewer.renderer.domElement.style.cursor = hitTest(event) ? 'pointer' : 'grab';
  };

  viewer.renderer.domElement.addEventListener('pointerdown', onPointerDown);
  viewer.renderer.domElement.addEventListener('pointerup', onPointerUp);
  viewer.renderer.domElement.addEventListener('pointermove', onPointerMove);

  return () => {
    viewer.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    viewer.renderer.domElement.removeEventListener('pointerup', onPointerUp);
    viewer.renderer.domElement.removeEventListener('pointermove', onPointerMove);
  };
}

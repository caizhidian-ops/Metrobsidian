import * as THREE from 'three';

/** 新资产从上方落下，1.45s 收束并带一次轻微回弹。 */
export function animateBuildingDrop(group: THREE.Group, durationMs = 1450): Promise<void> {
  const finalY = group.position.y;
  const startY = finalY + 46;
  const startedAt = performance.now();
  group.position.y = startY;
  group.scale.multiplyScalar(0.92);
  return new Promise((resolve) => {
    const tick = (time: number) => {
      const progress = Math.min(1, (time - startedAt) / durationMs);
      const eased = easeOutBounce(progress);
      group.position.y = THREE.MathUtils.lerp(startY, finalY, eased);
      const scale = THREE.MathUtils.lerp(0.92, 1, Math.min(1, progress * 1.35));
      group.scale.setScalar(scale);
      if (progress < 1) requestAnimationFrame(tick);
      else { group.position.y = finalY; group.scale.setScalar(1); resolve(); }
    };
    requestAnimationFrame(tick);
  });
}

function easeOutBounce(value: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (value < 1 / d1) return n1 * value * value;
  if (value < 2 / d1) { const x = value - 1.5 / d1; return n1 * x * x + 0.75; }
  if (value < 2.5 / d1) { const x = value - 2.25 / d1; return n1 * x * x + 0.9375; }
  const x = value - 2.625 / d1;
  return n1 * x * x + 0.984375;
}

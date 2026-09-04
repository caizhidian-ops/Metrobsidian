/**
 * 放置逻辑：找一个真正空的生长地块（raycast 检测是否已有 3D 物体），
 * 造 BuildingDef，复用项目的 createBuilding 加载 GLB。
 */
import * as THREE from 'three';
import type { BuildingDef } from '../city/config/buildings';
import { CATEGORY_PLOTS } from '../city/config/world';
import type { Viewer } from '../city/core/createViewer';

export interface PlacerContext {
  viewer: Viewer;
  addBuilding: (def: BuildingDef) => Promise<THREE.Group>;
  takenPlotIndices: Set<number>;
}

export interface PlaceOptions {
  id: string;
  name: string;
  prompt: string;
  glbBlobUrl: string;
}

export interface PlaceResult {
  group: THREE.Group;
  plotIndex: number;
  def: BuildingDef;
}

const AI_PALETTE: ReadonlyArray<readonly [number, number]> = [
  [0xded8cd, 0x5e7da8],
  [0xe8dfcf, 0x9a704f],
  [0xdce4d7, 0x628468],
  [0xe3d9d9, 0x9b6266],
  [0xd6dde6, 0x4667ad],
  [0xf0ede5, 0xc94b4b],
  [0xc9b99d, 0xc47a3f],
  [0xe6ded2, 0xb77846],
];

/** 地块标记（土壤+边框+圆柱 marker）的最高 y，低于此值的 hit 视为地块自身，不算占用。 */
const PLOT_MARKER_MAX_Y = 1.5;
/** 建筑占地面积采样点（中心 + 四角），用于 raycast 检测。 */
const FOOTPRINT_HALF_W = 9;
const FOOTPRINT_HALF_D = 8;

export async function placeGeneratedBuilding(
  ctx: PlacerContext,
  opts: PlaceOptions,
): Promise<PlaceResult> {
  const plotIndex = findFreePlot(ctx.viewer.scene, ctx.takenPlotIndices);
  if (plotIndex < 0) {
    throw new Error(`${CATEGORY_PLOTS.length} 个生长地块已全部被占用（含装饰建筑），无法放置新建筑`);
  }
  ctx.takenPlotIndices.add(plotIndex);

  const [x, z] = CATEGORY_PLOTS[plotIndex] ?? [0, 0];
  const [color, accentColor] = AI_PALETTE[plotIndex % AI_PALETTE.length] ?? [0xded8cd, 0x5e7da8];
  const def: BuildingDef = {
    id: opts.id,
    name: opts.name,
    color,
    accentColor,
    width: 20,
    depth: 18,
    height: 15 + (plotIndex % 3) * 3,
    position: [x, 0, z],
    asset: opts.glbBlobUrl,
    tagline: 'AI 生成建筑',
    summary: `由文字“${opts.prompt}”生成的 3D 建筑。`,
  };

  const group = await ctx.addBuilding(def);
  ctx.viewer.moveToMapPoint(x, z);
  return { group, plotIndex, def };
}

export function computeTakenPlotIndices(buildings: BuildingDef[]): Set<number> {
  const taken = new Set<number>();
  for (const building of buildings) {
    const index = CATEGORY_PLOTS.findIndex(([x, z]) =>
      Math.abs(building.position[0] - x) < 1 && Math.abs(building.position[2] - z) < 1,
    );
    if (index >= 0) taken.add(index);
  }
  return taken;
}

/**
 * 找一个真正空的地块：既不在 takenPlotIndices 里（已被生成建筑占用），
 * 也没有装饰建筑等 3D 物体占据（raycast 检测）。
 */
function findFreePlot(scene: THREE.Scene, taken: Set<number>): number {
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const sampleOffsets: Array<[number, number]> = [
    [0, 0],
    [-FOOTPRINT_HALF_W, -FOOTPRINT_HALF_D],
    [FOOTPRINT_HALF_W, -FOOTPRINT_HALF_D],
    [-FOOTPRINT_HALF_W, FOOTPRINT_HALF_D],
    [FOOTPRINT_HALF_W, FOOTPRINT_HALF_D],
  ];

  for (let i = 0; i < CATEGORY_PLOTS.length; i += 1) {
    if (taken.has(i)) continue;
    const [cx, cz] = CATEGORY_PLOTS[i] ?? [0, 0];
    let occupied = false;
    for (const [ox, oz] of sampleOffsets) {
      origin.set(cx + ox, 50, cz + oz);
      raycaster.set(origin, down);
      raycaster.far = 48; // y=50 → y=2
      const hits = raycaster.intersectObjects(scene.children, true);
      if (hits.some((hit) => hit.point.y > PLOT_MARKER_MAX_Y)) {
        occupied = true;
        break;
      }
    }
    if (!occupied) return i;
  }
  return -1;
}

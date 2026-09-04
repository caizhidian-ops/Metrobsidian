import { CATEGORY_PLOTS, CITY_CANAL, CITY_ROADS, PEDESTRIAN_LOOPS, TRAFFIC_LOOPS, UPLOAD_PLOTS_BY_CATEGORY } from './world.ts';

export interface Point2 { x: number; z: number }
export interface Rect { id?: string; minX: number; maxX: number; minZ: number; maxZ: number }
export interface BuildingPlot extends Point2 { id: string; width: number; depth: number }

export const CANAL_ZONE: Rect = {
  id: 'canal',
  minX: CITY_CANAL.centerX - CITY_CANAL.width / 2,
  maxX: CITY_CANAL.centerX + CITY_CANAL.width / 2,
  minZ: -164,
  maxZ: 164,
};

export const ROAD_ZONES: ReadonlyArray<Rect> = [
  ...CITY_ROADS.horizontal.map((z) => ({ id: `road-z-${z}`, minX: -204, maxX: 204, minZ: z - 5, maxZ: z + 5 })),
  ...CITY_ROADS.vertical.map((x) => ({ id: `road-x-${x}`, minX: x - 5, maxX: x + 5, minZ: -164, maxZ: 164 })),
];

/** 核心建筑唯一地块来源；尺寸是建筑本体尺寸，验证时会计入 1.3 倍基座。 */
export const BUILDING_PLOTS: ReadonlyArray<BuildingPlot> = [
  { id: 'company', x: -52, z: -48, width: 26, depth: 26 },
  { id: 'home', x: 62, z: -48, width: 22, depth: 20 },
  { id: 'school', x: -68, z: 48, width: 26, depth: 20 },
  { id: 'hospital', x: 70, z: 48, width: 24, depth: 20 },
  { id: 'canteen', x: -25, z: 72, width: 20, depth: 16 },
  { id: 'construction', x: 50, z: 76, width: 18, depth: 18 },
  { id: 'museum', x: 80, z: -72, width: 22, depth: 16 },
];

/** 新分类建筑只能生长在外围预留地块，避开道路与中央水系。 */
export { CATEGORY_PLOTS, PEDESTRIAN_LOOPS, TRAFFIC_LOOPS, UPLOAD_PLOTS_BY_CATEGORY };

/** 少量白色辅助建筑只分布在外侧，不与核心建筑、道路和可入驻地块争夺视觉中心。 */
export const SUPPORTING_BLOCKS: ReadonlyArray<BuildingPlot & { height: number; color: number }> = [
  { id: 'support-west-1', x: -164, z: -70, width: 18, depth: 18, height: 13, color: 0xe3ddd1 },
  { id: 'support-west-2', x: -154, z: -38, width: 18, depth: 16, height: 16, color: 0xd5cdbf },
  { id: 'support-west-3', x: -164, z: 38, width: 17, depth: 17, height: 12, color: 0xe6dfd2 },
  { id: 'support-west-4', x: -154, z: 70, width: 18, depth: 19, height: 15, color: 0xdad4c9 },
  { id: 'support-east-1', x: 164, z: -70, width: 19, depth: 17, height: 14, color: 0xd9d0c1 },
  { id: 'support-east-2', x: 154, z: -38, width: 16, depth: 17, height: 12, color: 0xe8e2d7 },
  { id: 'support-east-3', x: 164, z: 38, width: 16, depth: 17, height: 13, color: 0xd8d1c6 },
  { id: 'support-east-4', x: 154, z: 70, width: 17, depth: 19, height: 15, color: 0xe7dfd1 },
];

export function buildingPosition(id: string): [number, number, number] {
  const plot = BUILDING_PLOTS.find((candidate) => candidate.id === id);
  if (!plot) throw new Error(`Unknown core building plot: ${id}`);
  return [plot.x, 0, plot.z];
}

export function intersectsRect(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

export function pointInRect(point: Point2, rect: Rect): boolean {
  return point.x > rect.minX && point.x < rect.maxX && point.z > rect.minZ && point.z < rect.maxZ;
}

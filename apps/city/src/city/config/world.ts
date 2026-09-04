export const CITY_BOUNDS = {
  width: 420,
  depth: 340,
  minX: -210,
  maxX: 210,
  minZ: -170,
  maxZ: 170,
} as const;

export const NAVIGATION_BOUNDS = {
  minX: -172,
  maxX: 172,
  minZ: -138,
  maxZ: 138,
} as const;

export const CITY_ROADS = {
  horizontal: [-96, 0, 96],
  vertical: [-120, 0, 120],
} as const;

/** 中轴是道路；窄河道向东侧让位，只作为景观与分区辅助。 */
export const CITY_CANAL = {
  centerX: 32,
  width: 7,
} as const;

/** 外围可入驻地块；新知识库一级文件夹会稳定分配到其中一块。 */
export const CATEGORY_PLOTS: ReadonlyArray<readonly [number, number]> = [
  [-170, -145], [-85, -145], [82, -145], [170, -145],
  [170, 145], [82, 145], [-85, 145], [-170, 145],
];

/** 每个核心分类的首个上传资产优先落在近邻绿地，后续资产再回退到外圈地块。 */
export const UPLOAD_PLOTS_BY_CATEGORY: Readonly<Record<string, readonly [number, number]>> = {
  company: [-88, -48], home: [92, -48], school: [-98, 48], hospital: [100, 48],
  canteen: [-54, 76], construction: [78, 76], characters: [-92, -74], museum: [52, -76], novel: [52, -76],
};

export interface Point2 { x: number; z: number }

/** 车辆沿这些闭合道路环行驶（避河、不穿楼）。 */
export const TRAFFIC_LOOPS: ReadonlyArray<ReadonlyArray<Point2>> = [
  [{ x: -120, z: -96 }, { x: 120, z: -96 }, { x: 120, z: 0 }, { x: -120, z: 0 }],
  [{ x: -120, z: 0 }, { x: 120, z: 0 }, { x: 120, z: 96 }, { x: -120, z: 96 }],
];

/** 每条人行环路只位于单个陆地区块内，不跨河、不穿楼。 */
export const PEDESTRIAN_LOOPS: ReadonlyArray<ReadonlyArray<Point2>> = [
  [{ x: -108, z: -84 }, { x: -12, z: -84 }, { x: -12, z: -12 }, { x: -108, z: -12 }],
  [{ x: -108, z: 12 }, { x: -12, z: 12 }, { x: -12, z: 84 }, { x: -108, z: 84 }],
  [{ x: 44, z: -84 }, { x: 108, z: -84 }, { x: 108, z: -12 }, { x: 44, z: -12 }],
  [{ x: 37, z: 12 }, { x: 108, z: 12 }, { x: 108, z: 89 }, { x: 37, z: 89 }],
];

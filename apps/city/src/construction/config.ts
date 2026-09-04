export type ViewName = 'overview' | 'structure' | 'equipment' | 'inspection';

interface SiteView {
  position: [number, number, number];
  target: [number, number, number];
}

interface ConstructionSceneContract {
  id: string;
  kind: 'construction-site';
  route: '/construction.html';
  size: [number, number];
  focalObjects: readonly string[];
  supportingZones: readonly string[];
  views: Record<ViewName, SiteView>;
}

export const SITE: ConstructionSceneContract = {
  id: 'construction-site-06',
  kind: 'construction-site',
  route: '/construction.html',
  size: [30, 22],
  focalObjects: ['tower-crane', 'concrete-frame'],
  supportingZones: ['wrapped-buildings', 'equipment-yard', 'material-yard'],
  views: {
    overview: { position: [31, 24, 34], target: [0, 3.2, -0.6] },
    structure: { position: [20, 15, 19], target: [3.8, 4.3, -2.5] },
    equipment: { position: [21, 9.5, 24], target: [0, 1.2, 4.2] },
    inspection: { position: [14.5, 8.8, 15.5], target: [3.7, 2.8, 1.1] },
  },
};

export const COLORS = {
  sand: 0xbda98a,
  sandDark: 0x9d896d,
  concrete: 0xc8c9c3,
  concreteDark: 0x8f9697,
  safetyGreen: 0x22a987,
  safetyGreenDark: 0x167762,
  crane: 0xe7a32a,
  craneDark: 0xa76d16,
  vehicle: 0xf1c54e,
  vehicleDark: 0xc99325,
  steel: 0x59636a,
  orange: 0xe67e28,
  blue: 0x3d82b5,
  white: 0xe9ece8,
  warning: 0xf0cd39,
};

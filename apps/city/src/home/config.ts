export type ViewName = 'overview' | 'desk' | 'lounge' | 'practice';

interface RoomView {
  position: [number, number, number];
  target: [number, number, number];
}

interface HomeRoomScene {
  id: string;
  kind: 'interior-room';
  route: '/home.html';
  size: [number, number, number];
  openSides: ['front', 'right'];
  focalObjects: readonly string[];
  supportingObjects: readonly string[];
  views: Record<ViewName, RoomView>;
}

export const ROOM: HomeRoomScene = {
  id: 'home-study-01',
  kind: 'interior-room',
  route: '/home.html',
  size: [10, 6.4, 8],
  openSides: ['front', 'right'],
  focalObjects: ['carpet', 'computer', 'desk', 'chair'],
  supportingObjects: ['sofa', 'floor-lamp', 'window', 'shelves', 'keyboard', 'plant', 'cat', 'toy-ball', 'moving-boxes', 'drum-practice', 'tennis-gear'],
  views: {
    overview: { position: [10.8, 9.2, 12.8], target: [0, 1.55, -0.25] },
    desk: { position: [7.2, 5.1, 6.9], target: [1.6, 1.75, -1.55] },
    lounge: { position: [6.8, 5.7, 8.2], target: [-2.35, 1.65, -2.05] },
    practice: { position: [6.3, 4.8, 7.8], target: [-1.9, 1.2, 1.15] },
  },
};

export const COLORS = {
  wall: 0x6e90dd,
  wallDark: 0x516eaf,
  floor: 0x5279c6,
  trim: 0x91b3f2,
  carpet: 0x66e2d5,
  carpetPattern: 0x338bc0,
  desk: 0xf5edf2,
  deskEdge: 0xd9c7dd,
  computer: 0xe6dfbf,
  computerDark: 0xc7bd99,
  screen: 0x24394e,
  screenGlow: 0x76d7d5,
  chair: 0xed6f9e,
  chairDark: 0xb84672,
  metal: 0x6e7393,
};

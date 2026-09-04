export const GALLERY = {
  id: 'form-void-gallery',
  kind: 'exhibition',
  route: '/gallery.html',
  space: { width: 20, height: 8, depth: 14, openSides: ['front', 'right'] },
  palette: {
    wall: 0xd8d3c8,
    floor: 0x3d3b38,
    charcoal: 0x171716,
    bronze: 0x9f603c,
    signal: 0xc8452f,
  },
  views: {
    entrance: { position: [18, 11.5, 21], target: [-0.5, 2.15, -0.8] },
    sculpture: { position: [8.7, 5.8, 8.4], target: [-0.2, 2.0, -0.2] },
    sideHall: { position: [8.15, 4.8, 5.9], target: [4.8, 1.8, -3.35] },
  },
  lightingModes: ['curatorial', 'after-hours'],
  performance: { maxPixelRatio: 2, shadowMap: 2048 },
} as const;

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDING_PLOTS,
  CANAL_ZONE,
  CATEGORY_PLOTS,
  PEDESTRIAN_LOOPS,
  ROAD_ZONES,
  SUPPORTING_BLOCKS,
  TRAFFIC_LOOPS,
  UPLOAD_PLOTS_BY_CATEGORY,
  intersectsRect,
  pointInRect,
  type Rect,
} from '../src/city/config/cityLayout.ts';
import { CITY_ROADS } from '../src/city/config/world.ts';

function footprint(x: number, z: number, width: number, depth: number): Rect {
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}

test('core and reservable building footprints do not occupy roads or the canal', () => {
  const plots = [
    ...BUILDING_PLOTS.map((plot) => ({ ...plot, width: plot.width * 1.3, depth: plot.depth * 1.28 })),
    ...CATEGORY_PLOTS.map(([x, z], index) => ({ id: `category-${index}`, x, z, width: 28, depth: 24 })),
  ];
  for (const plot of plots) {
    const area = footprint(plot.x, plot.z, plot.width, plot.depth);
    assert.equal(intersectsRect(area, CANAL_ZONE), false, `${plot.id} overlaps canal`);
    for (const road of ROAD_ZONES) assert.equal(intersectsRect(area, road), false, `${plot.id} overlaps ${road.id}`);
  }
});

test('core building footprints do not overlap each other', () => {
  const coreAreas = BUILDING_PLOTS.map((plot) => ({
    id: plot.id,
    area: footprint(plot.x, plot.z, plot.width * 1.3, plot.depth * 1.28),
  }));
  for (let left = 0; left < coreAreas.length; left += 1) {
    for (let right = left + 1; right < coreAreas.length; right += 1) {
      assert.equal(
        intersectsRect(coreAreas[left].area, coreAreas[right].area),
        false,
        `${coreAreas[left].id} overlaps ${coreAreas[right].id}`,
      );
    }
  }
});

test('supporting buildings stay peripheral and clear of roads, water, and reservable plots', () => {
  const reservableAreas = CATEGORY_PLOTS.map(([x, z]) => footprint(x, z, 28, 24));
  assert.ok(SUPPORTING_BLOCKS.length <= 8, 'supporting mass should remain subordinate to core buildings');
  for (const block of SUPPORTING_BLOCKS) {
    assert.ok(Math.abs(block.x) >= 145, `${block.id} is not peripheral`);
    const area = footprint(block.x, block.z, block.width, block.depth);
    assert.equal(intersectsRect(area, CANAL_ZONE), false, `${block.id} overlaps canal`);
    for (const road of ROAD_ZONES) assert.equal(intersectsRect(area, road), false, `${block.id} overlaps ${road.id}`);
    for (const plot of reservableAreas) assert.equal(intersectsRect(area, plot), false, `${block.id} overlaps a reservable plot`);
  }
});

test('first upload plots sit near core categories without entering roads, water, or core footprints', () => {
  const coreAreas = BUILDING_PLOTS.map((plot) => footprint(plot.x, plot.z, plot.width * 1.3, plot.depth * 1.28));
  for (const [category, [x, z]] of Object.entries(UPLOAD_PLOTS_BY_CATEGORY)) {
    const area = footprint(x, z, 20 * 1.3, 18 * 1.28);
    assert.equal(intersectsRect(area, CANAL_ZONE), false, `${category} upload plot overlaps canal`);
    for (const road of ROAD_ZONES) assert.equal(intersectsRect(area, road), false, `${category} upload plot overlaps ${road.id}`);
    for (const core of coreAreas) assert.equal(intersectsRect(area, core), false, `${category} upload plot overlaps core building`);
  }
});

test('pedestrian route segments stay off water, roads, and building footprints', () => {
  const buildingAreas = BUILDING_PLOTS.map((plot) => footprint(plot.x, plot.z, plot.width * 1.3, plot.depth * 1.28));
  for (const loop of PEDESTRIAN_LOOPS) {
    assert.ok(loop.length >= 4);
    for (let index = 0; index < loop.length; index += 1) {
      const from = loop[index];
      const to = loop[(index + 1) % loop.length];
      for (let step = 0; step <= 20; step += 1) {
        const ratio = step / 20;
        const point = { x: from.x + (to.x - from.x) * ratio, z: from.z + (to.z - from.z) * ratio };
        assert.equal(pointInRect(point, CANAL_ZONE), false, `pedestrian route enters canal at ${point.x},${point.z}`);
        for (const road of ROAD_ZONES) assert.equal(pointInRect(point, road), false, `pedestrian route enters ${road.id}`);
        for (const [buildingIndex, building] of buildingAreas.entries()) {
          assert.equal(
            pointInRect(point, building),
            false,
            `pedestrian route enters ${BUILDING_PLOTS[buildingIndex]?.id} at ${point.x},${point.z}`,
          );
        }
      }
    }
  }
});

test('traffic routes are closed and remain on configured road centerlines', () => {
  for (const loop of TRAFFIC_LOOPS) {
    assert.ok(loop.length >= 4);
    for (let index = 0; index < loop.length; index += 1) {
      const from = loop[index];
      const to = loop[(index + 1) % loop.length];
      const horizontal = from.z === to.z;
      const vertical = from.x === to.x;
      assert.ok(horizontal || vertical);
      assert.ok(
        (horizontal && CITY_ROADS.horizontal.some((roadZ) => roadZ === from.z))
          || (vertical && CITY_ROADS.vertical.some((roadX) => roadX === from.x)),
        `traffic segment is off-road: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`,
      );
    }
  }
});

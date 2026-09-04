import type { BuildingDef } from '../config/buildings';
import { CITY_BOUNDS, CITY_ROADS } from '../config/world';
import type { Viewer } from '../core/createViewer';
import './minimap.css';

interface MinimapOptions {
  viewer: Viewer;
  buildings: BuildingDef[];
  onSelectBuilding: (buildingId: string) => void;
}

export function setupMinimap({ viewer, buildings, onSelectBuilding }: MinimapOptions): () => void {
  const minimap = required<HTMLElement>('minimap');
  const stage = required<HTMLElement>('minimap-stage');
  const canvas = required<HTMLCanvasElement>('minimap-canvas');
  const markers = required<HTMLElement>('minimap-markers');
  const toggle = required<HTMLButtonElement>('minimap-toggle');
  const context = canvas.getContext('2d');
  if (!context) {
    minimap.dataset.state = 'error';
    minimap.setAttribute('aria-label', '城市小地图暂不可用');
    return () => undefined;
  }

  buildings.forEach((building) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'minimap__marker';
    button.dataset.buildingId = building.id;
    button.style.setProperty('--marker-x', `${toPercent(building.position[0], CITY_BOUNDS.minX, CITY_BOUNDS.maxX)}%`);
    button.style.setProperty('--marker-y', `${toPercent(building.position[2], CITY_BOUNDS.minZ, CITY_BOUNDS.maxZ)}%`);
    button.setAttribute('aria-label', `定位到${building.name}`);
    button.title = building.name;
    button.addEventListener('click', () => onSelectBuilding(building.id));
    markers.append(button);
  });

  const toggleCollapsed = () => {
    const collapsed = minimap.classList.toggle('is-collapsed');
    toggle.textContent = collapsed ? '+' : '−';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? '展开小地图' : '收起小地图');
  };
  toggle.addEventListener('click', toggleCollapsed);

  const onBuildingSelected = (event: Event) => {
    const buildingId = (event as CustomEvent<{ buildingId: string }>).detail.buildingId;
    markers.querySelectorAll<HTMLButtonElement>('.minimap__marker').forEach((marker) => {
      const active = marker.dataset.buildingId === buildingId;
      marker.classList.toggle('is-active', active);
      marker.setAttribute('aria-current', active ? 'location' : 'false');
    });
    if (buildingId) {
      minimap.dataset.state = 'success';
      window.setTimeout(() => { minimap.dataset.state = 'ready'; }, 700);
    }
  };
  window.addEventListener('memory-city:building-selected', onBuildingSelected);

  let frameId = 0;
  const render = () => {
    frameId = requestAnimationFrame(render);
    if (minimap.classList.contains('is-collapsed')) return;
    drawMap(context, canvas, stage, viewer);
  };
  minimap.dataset.state = 'loading';
  frameId = requestAnimationFrame(() => {
    minimap.dataset.state = 'ready';
    render();
  });

  return () => {
    cancelAnimationFrame(frameId);
    toggle.removeEventListener('click', toggleCollapsed);
    window.removeEventListener('memory-city:building-selected', onBuildingSelected);
  };
}

function drawMap(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  viewer: Viewer,
): void {
  const rect = stage.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio, 2);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);

  const styles = getComputedStyle(document.documentElement);
  const paper = styles.getPropertyValue('--color-paper-2').trim();
  const paper3 = styles.getPropertyValue('--color-paper-3').trim();
  const rule = styles.getPropertyValue('--color-rule-strong').trim();
  const accent = styles.getPropertyValue('--color-accent').trim();
  const ink = styles.getPropertyValue('--color-ink').trim();
  const water = styles.getPropertyValue('--color-map-water').trim();
  const pad = 8;
  const mapWidth = rect.width - pad * 2;
  const mapHeight = rect.height - pad * 2;
  const mapX = (x: number) => pad + toRatio(x, CITY_BOUNDS.minX, CITY_BOUNDS.maxX) * mapWidth;
  const mapY = (z: number) => pad + toRatio(z, CITY_BOUNDS.minZ, CITY_BOUNDS.maxZ) * mapHeight;

  context.fillStyle = paper;
  context.fillRect(0, 0, rect.width, rect.height);
  context.fillStyle = paper3;
  context.fillRect(pad, pad, mapWidth, mapHeight);

  context.fillStyle = water;
  context.fillRect(mapX(-6.5), pad, Math.max(4, mapX(10.5) - mapX(-6.5)), mapHeight);
  context.strokeStyle = rule;
  context.lineWidth = 1;
  context.beginPath();
  CITY_ROADS.horizontal.forEach((z) => {
    context.moveTo(pad, mapY(z));
    context.lineTo(rect.width - pad, mapY(z));
  });
  CITY_ROADS.vertical.forEach((x) => {
    context.moveTo(mapX(x), pad);
    context.lineTo(mapX(x), rect.height - pad);
  });
  context.stroke();

  const navigation = viewer.getNavigationState();
  const targetX = mapX(navigation.target.x);
  const targetY = mapY(navigation.target.z);
  const viewX = navigation.target.x - navigation.camera.x;
  const viewY = navigation.target.z - navigation.camera.z;
  const angle = Math.atan2(viewY, viewX);
  context.save();
  context.translate(targetX, targetY);
  context.rotate(angle);
  context.fillStyle = accent;
  context.beginPath();
  context.moveTo(9, 0);
  context.lineTo(-6, -5);
  context.lineTo(-3, 0);
  context.lineTo(-6, 5);
  context.closePath();
  context.fill();
  context.restore();
  context.strokeStyle = ink;
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(targetX, targetY, 7, 0, Math.PI * 2);
  context.stroke();
}

function toRatio(value: number, min: number, max: number): number {
  return (value - min) / (max - min);
}

function toPercent(value: number, min: number, max: number): number {
  return toRatio(value, min, max) * 100;
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing minimap element: #${id}`);
  return element as T;
}

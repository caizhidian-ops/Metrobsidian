import './style.css';
import { BUILDINGS, type BuildingDef } from './config/buildings';
import { hydrateKnowledge } from './config/knowledge';
import { createViewer } from './core/createViewer';
import { setupBuildingInteractions } from './core/interactions';
import { createBuilding } from './scene/buildings';
import { createCityLife } from './scene/cityLife';
import { createGround } from './scene/ground';
import { animateBuildingDrop } from './scene/dropAnimation';
import { setupAnnotations } from './ui/annotations';
import { setupCityAgents } from './agents';
import { setupCollaboration } from './ui/collaboration';
import { setupFileDrop } from './ui/fileDrop';
import { setupAssets } from './ui/assets';
import { setupPipelineStatus, type PipelinePhase } from './ui/pipelineStatus';
import { computeTarget, setupHud } from './ui/hud';
import { setupMinimap } from './ui/minimap';
import {
  autoMaterializeUploadedDocuments,
  fetchBuildings,
  fetchGenesisJob,
  fetchKnowledge,
  type ApiBuilding,
  type GenesisJob,
  type UploadResponse,
} from './api';
import { setupGenerator } from '../generator/main';
import { mountDeepCityHero } from '../threeui/DeepCityHero';

const AI_PALETTE: ReadonlyArray<readonly [number, number]> = [
  [0xded8cd, 0x5e7da8], [0xe8dfcf, 0x9a704f], [0xdce4d7, 0x628468], [0xe3d9d9, 0x9b6266],
  [0xd6dde6, 0x4667ad], [0xf0ede5, 0xc94b4b], [0xc9b99d, 0xc47a3f], [0xe6ded2, 0xb77846],
];

let cityStarted = false;
mountDeepCityHero(() => {
  if (cityStarted) return;
  cityStarted = true;
  void bootstrap().catch(showFallback);
});

async function bootstrap(): Promise<void> {
  // 知识服务未启动时保留构建期的静态演示数据。
  const [apiDocuments, apiBuildings] = await Promise.all([fetchKnowledge(), fetchBuildings()]);
  if (apiDocuments && apiDocuments.length > 0) hydrateKnowledge(apiDocuments);
  mergeBuildingDefinitions(apiBuildings);

  const viewer = createViewer();
  createGround(viewer.scene, BUILDINGS);
  viewer.start();

  const groups = await Promise.all(BUILDINGS.map(createBuilding));
  groups.forEach((group) => viewer.scene.add(group));
  const targets = BUILDINGS.map(computeTarget);
  const hud = setupHud(viewer, BUILDINGS, targets);
  const assets = setupAssets();
  const pipelineStatus = setupPipelineStatus();
  const addBuilding = async (def: BuildingDef, animate = false) => {
    if (!BUILDINGS.some((building) => building.id === def.id)) BUILDINGS.push(def);
    const group = await createBuilding(def);
    viewer.scene.add(group);
    groups.push(group);
    hud.registerBuilding(def, computeTarget(def));
    if (animate) await animateBuildingDrop(group);
    void assets.refresh();
    return group;
  };
  setupFileDrop({
    onPhase(phase, detail) { pipelineStatus.set(phase, detail); },
    async onKnowledgeChanged(response: UploadResponse) {
      let candidates = 0;
      let generatedBuildings = 0;
      if (response.total > 0) {
        const requestKey = `upload-${Date.now().toString(36)}-${response.items.map((item) => item.document_id).sort().join('-')}`;
        const pipeline = await autoMaterializeUploadedDocuments(requestKey, response.items.map((item) => item.document_id));
        candidates = pipeline.candidates.length;
        await Promise.all(pipeline.jobs.map((job) => waitForGenesisJob(job, (phase) => pipelineStatus.set(phase))));
        pipelineStatus.set('placing');
        generatedBuildings = await syncDiscoveredBuildings((def) => addBuilding(def, true));
        pipelineStatus.set('complete');
      }
      const documents = await fetchKnowledge();
      if (documents) {
        hydrateKnowledge(documents);
        hud.refreshKnowledge();
      }
      return { candidates, generatedBuildings };
    },
  });
  setupBuildingInteractions(viewer, groups, (buildingId) => {
    const building = BUILDINGS.find((candidate) => candidate.id === buildingId);
    if (building?.roomScene) {
      window.location.assign(building.roomScene);
      return;
    }
    hud.selectBuilding(buildingId);
  });
  setupCollaboration(viewer);
  setupMinimap({ viewer, buildings: BUILDINGS, onSelectBuilding: hud.selectBuilding });
  setupAnnotations(viewer);
  setupCityAgents(viewer, BUILDINGS);
  createCityLife(viewer.scene, viewer.dayNight);

  setupGenerator({
    viewer,
    existingBuildings: BUILDINGS,
    addBuilding: (def) => addBuilding(def, true),
  });

  (window as unknown as { __dayNight: typeof viewer.dayNight }).__dayNight = viewer.dayNight;
  (window as unknown as { __scene: typeof viewer.scene }).__scene = viewer.scene;
}

function mergeBuildingDefinitions(apiBuildings: ApiBuilding[] | null): void {
  apiBuildings?.filter((building) => building.is_discovered).forEach((building, index) => {
    const def = toBuildingDef(building, index);
    if (def && !BUILDINGS.some((existing) => existing.id === def.id)) BUILDINGS.push(def);
  });
}

async function syncDiscoveredBuildings(addBuilding: (def: BuildingDef) => Promise<unknown>): Promise<number> {
  const apiBuildings = await fetchBuildings();
  if (!apiBuildings) return 0;
  let added = 0;
  for (const [index, building] of apiBuildings.filter((candidate) => candidate.is_discovered).entries()) {
    if (BUILDINGS.some((existing) => existing.id === building.id)) continue;
    const def = toBuildingDef(building, index);
    if (!def) continue;
    await addBuilding(def);
    added += 1;
  }
  return added;
}

function toBuildingDef(building: ApiBuilding, index: number): BuildingDef | null {
  if (!building.position || !building.asset) return null;
  const [color, accentColor] = AI_PALETTE[index % AI_PALETTE.length] ?? [0xded8cd, 0x5e7da8];
  return {
    id: building.id,
    name: building.name,
    color,
    accentColor,
    width: 20,
    depth: 18,
    height: 15 + (index % 3) * 3,
    position: building.position,
    asset: building.asset,
    tagline: 'AI 生成建筑',
    summary: building.description || '由新知识候选生成。',
  };
}

async function waitForGenesisJob(initial: GenesisJob, onPhase: (phase: PipelinePhase) => void): Promise<GenesisJob> {
  let job = initial;
  const deadline = Date.now() + 11 * 60 * 1000;
  while (job.state === 'running' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    job = await fetchGenesisJob(job.job_id);
    if (job.result.phase && isPipelinePhase(job.result.phase)) onPhase(job.result.phase);
  }
  if (job.state === 'ready') return job;
  if (job.state === 'failed') throw new Error(`建筑生成失败：${job.result.error ?? '未知错误'}`);
  throw new Error('建筑生成超时，可在知识服务中继续查看任务状态');
}

function isPipelinePhase(value: string): value is PipelinePhase {
  return ['planning_prompt', 'generating_image', 'generating_3d', 'saving_asset'].includes(value);
}

function showFallback(error: unknown): void {
  console.error(error);
  const fallback = document.getElementById('webgl-fallback');
  if (fallback) fallback.hidden = false;
}

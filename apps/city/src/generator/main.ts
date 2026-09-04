/**
 * 文字生成 3D 建筑 —— 编排层（UI + 流程 + 持久化恢复）
 *
 * 流程：用户输入提示词 → 文生图（/api/t2i）→ 图生3D（/api/i2d/create + poll）
 *     → 下载 GLB → 缓存 IndexedDB → 复用项目 createBuilding 加载 → 放到空地块
 *
 * 完全自包含：只 import three 类型 + 项目 Viewer/BuildingDef/CATEGORY_PLOTS，
 * 不依赖 HUD 内部结构，UI 独立注入 body。
 */
import './style.css';
import * as THREE from 'three';
import type { BuildingDef } from '../city/config/buildings';
import { CATEGORY_PLOTS } from '../city/config/world';
import type { Viewer } from '../city/core/createViewer';
import { textToImage } from './textToImage';
import { create3DTask, pollUntilDone } from './imageTo3D';
import { placeGeneratedBuilding, computeTakenPlotIndices, type PlaceResult } from './placer';
import { loadMeta, saveMeta, saveGlb, loadGlb, type GeneratedBuildingMeta } from './storage';

export interface GeneratorContext {
  viewer: Viewer;
  addBuilding: (def: BuildingDef) => Promise<THREE.Group>;
  existingBuildings: BuildingDef[];
}

const POLL_INTERVAL_MS = 12000;
const NAME_MAX = 16;

export function setupGenerator(ctx: GeneratorContext): void {
  const takenPlotIndices = computeTakenPlotIndices(ctx.existingBuildings);
  const ui = buildUi();

  void restorePersistedBuildings(ctx, takenPlotIndices, ui).catch((error) => {
    console.warn('[generator] 恢复已生成建筑失败:', error);
  });

  ui.generateButton.addEventListener('click', () => {
    void runGeneration(ctx, takenPlotIndices, ui);
  });

  ui.toggleButton.addEventListener('click', () => ui.togglePanel());
  ui.closeButton.addEventListener('click', () => ui.closePanel());
  ui.promptInput.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !ui.generateButton.disabled) {
      event.preventDefault();
      void runGeneration(ctx, takenPlotIndices, ui);
    }
  });
}

// ---------- 持久化恢复 ----------

async function restorePersistedBuildings(
  ctx: GeneratorContext,
  takenPlotIndices: Set<number>,
  ui: GeneratorUi,
): Promise<void> {
  const metas = loadMeta();
  if (metas.length === 0) return;
  ui.setStatus(`恢复 ${metas.length} 个已生成建筑…`);
  for (const meta of metas) {
    try {
      const buffer = await loadGlb(meta.id);
      if (!buffer) {
        console.warn(`[generator] IndexedDB 中无 GLB: ${meta.id}`);
        continue;
      }
      takenPlotIndices.add(meta.plotIndex);
      const blobUrl = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
      const def = buildDefFromMeta(meta, blobUrl);
      await ctx.addBuilding(def);
    } catch (error) {
      console.warn(`[generator] 恢复 ${meta.id} 失败:`, error);
    }
  }
  ui.setStatus('就绪');
}

// ---------- 主流程 ----------

async function runGeneration(
  ctx: GeneratorContext,
  takenPlotIndices: Set<number>,
  ui: GeneratorUi,
): Promise<void> {
  const prompt = ui.promptInput.value.trim();
  if (!prompt) {
    ui.setError('请输入提示词');
    return;
  }

  ui.setBusy(true);
  ui.setError('');
  ui.hidePreview();

  try {
    // 1. 文生图
    ui.setStatus('生成图片中…');
    ui.setProgress(1);
    const { imageUrl, augmentedPrompt } = await textToImage(prompt, ui.stylePresetCheckbox.checked);
    ui.showPreview(imageUrl);

    // 2. 图生 3D —— 创建任务
    ui.setStatus('提交 3D 生成任务…');
    ui.setProgress(2);
    const { taskid } = await create3DTask(imageUrl);

    // 3. 轮询
    ui.setStatus('生成 3D 中…（预计 1-2 分钟）');
    ui.setProgress(3);
    const glbUrl = await pollUntilDone(taskid, POLL_INTERVAL_MS, (elapsedMs) => {
      ui.setStatus(`生成 3D 中… 已用 ${Math.round(elapsedMs / 1000)} 秒`);
    });

    // 4. 下载 GLB
    ui.setStatus('下载模型…');
    ui.setProgress(4);
    const buffer = await downloadGlb(glbUrl);

    // 5. 放置
    ui.setStatus('放置到城市…');
    ui.setProgress(5);
    const id = makeId();
    const blobUrl = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
    const result: PlaceResult = await placeGeneratedBuilding(
      { viewer: ctx.viewer, addBuilding: ctx.addBuilding, takenPlotIndices },
      { id, name: deriveName(prompt), prompt, glbBlobUrl: blobUrl },
    ).catch((error) => {
      URL.revokeObjectURL(blobUrl);
      throw error;
    });

    // 6. 持久化
    await saveGlb(id, buffer);
    const meta: GeneratedBuildingMeta = {
      id,
      name: result.def.name,
      prompt,
      augmentedPrompt,
      plotIndex: result.plotIndex,
      createdAt: new Date().toISOString(),
    };
    const metas = loadMeta();
    metas.push(meta);
    saveMeta(metas);

    ui.setStatus(`✓ 已放置「${result.def.name}」`);
    ui.setProgress(6);
    ui.promptInput.value = '';
  } catch (error) {
    ui.setError(error instanceof Error ? error.message : String(error));
    ui.setStatus('失败');
  } finally {
    ui.setBusy(false);
  }
}

async function downloadGlb(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载 GLB 失败 (${response.status})`);
  return response.arrayBuffer();
}

function makeId(): string {
  return `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveName(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.length > NAME_MAX ? trimmed.slice(0, NAME_MAX) + '…' : trimmed;
}

function buildDefFromMeta(meta: GeneratedBuildingMeta, glbBlobUrl: string): BuildingDef {
  const [x, z] = CATEGORY_PLOTS[meta.plotIndex] ?? [0, 0];
  return {
    id: meta.id,
    name: meta.name,
    color: 0xded8cd,
    accentColor: 0x5e7da8,
    width: 20,
    depth: 18,
    height: 15 + (meta.plotIndex % 3) * 3,
    position: [x, 0, z],
    asset: glbBlobUrl,
    tagline: 'AI 生成建筑',
    summary: `由文字“${meta.prompt}”生成的 3D 建筑。`,
  };
}

// ---------- UI 构建 ----------

interface GeneratorUi {
  toggleButton: HTMLButtonElement;
  panel: HTMLElement;
  closeButton: HTMLButtonElement;
  promptInput: HTMLTextAreaElement;
  stylePresetCheckbox: HTMLInputElement;
  generateButton: HTMLButtonElement;
  progressEl: HTMLElement;
  statusEl: HTMLElement;
  errorEl: HTMLElement;
  previewImg: HTMLImageElement;
  setBusy(busy: boolean): void;
  setStatus(text: string): void;
  setProgress(step: number): void;
  setError(text: string): void;
  showPreview(url: string): void;
  hidePreview(): void;
  togglePanel(): void;
  closePanel(): void;
}

function buildUi(): GeneratorUi {
  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'gen-toggle';
  toggleButton.textContent = '✨ 生成建筑';
  toggleButton.setAttribute('aria-label', 'AI 生成 3D 建筑');
  (document.getElementById('generator-trigger-slot') ?? document.body).appendChild(toggleButton);

  const panel = document.createElement('section');
  panel.className = 'gen-panel';
  panel.setAttribute('aria-label', 'AI 生成 3D 建筑面板');
  panel.hidden = true;
  panel.innerHTML = `
    <header class="gen-head">
      <strong>AI 生成建筑</strong>
      <button type="button" class="gen-close" aria-label="关闭">✕</button>
    </header>
    <label class="gen-field">
      <span>提示词</span>
      <textarea class="gen-prompt" rows="3" placeholder="例如：红色屋顶的木屋 / futuristic glass tower / 古典中式亭子"></textarea>
      <small class="gen-hint">⌘/Ctrl + Enter 快速生成</small>
    </label>
    <label class="gen-preset">
      <input type="checkbox" class="gen-style-preset" checked />
      <span>建筑风格预设（推荐：自动加 isometric + 白底 + 单主体，3D 重建更稳）</span>
    </label>
    <button type="button" class="gen-go" disabled>生成</button>
    <ol class="gen-steps">
      <li data-step="1">生成图片</li>
      <li data-step="2">提交 3D 任务</li>
      <li data-step="3">生成 3D 模型</li>
      <li data-step="4">下载模型</li>
      <li data-step="5">放置到城市</li>
      <li data-step="6">完成</li>
    </ol>
    <p class="gen-status">就绪</p>
    <p class="gen-error" hidden></p>
    <img class="gen-preview" alt="生成的参考图" hidden />
  `;
  document.body.appendChild(panel);

  const promptInput = panel.querySelector<HTMLTextAreaElement>('.gen-prompt')!;
  const stylePresetCheckbox = panel.querySelector<HTMLInputElement>('.gen-style-preset')!;
  const generateButton = panel.querySelector<HTMLButtonElement>('.gen-go')!;
  const closeButton = panel.querySelector<HTMLButtonElement>('.gen-close')!;
  const progressEl = panel.querySelector<HTMLElement>('.gen-steps')!;
  const statusEl = panel.querySelector<HTMLElement>('.gen-status')!;
  const errorEl = panel.querySelector<HTMLElement>('.gen-error')!;
  const previewImg = panel.querySelector<HTMLImageElement>('.gen-preview')!;

  promptInput.addEventListener('input', () => {
    generateButton.disabled = promptInput.value.trim().length === 0;
  });

  const ui: GeneratorUi = {
    toggleButton,
    panel,
    closeButton,
    promptInput,
    stylePresetCheckbox,
    generateButton,
    progressEl,
    statusEl,
    errorEl,
    previewImg,
    setBusy(busy) {
      generateButton.disabled = busy || promptInput.value.trim().length === 0;
      generateButton.textContent = busy ? '生成中…' : '生成';
    },
    setStatus(text) { statusEl.textContent = text; },
    setProgress(step) {
      progressEl.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
        const liStep = Number(li.dataset.step);
        li.classList.toggle('done', liStep < step);
        li.classList.toggle('active', liStep === step);
      });
    },
    setError(text) {
      if (text) {
        errorEl.textContent = text;
        errorEl.hidden = false;
      } else {
        errorEl.hidden = true;
      }
    },
    showPreview(url) {
      previewImg.src = url;
      previewImg.hidden = false;
    },
    hidePreview() {
      previewImg.hidden = true;
      previewImg.removeAttribute('src');
    },
    togglePanel() {
      panel.hidden = !panel.hidden;
      toggleButton.classList.toggle('active', !panel.hidden);
      if (!panel.hidden) promptInput.focus();
    },
    closePanel() {
      panel.hidden = true;
      toggleButton.classList.remove('active');
    },
  };
  return ui;
}

export type PipelinePhase = 'idle' | 'upload' | 'classifying' | 'planning_prompt' | 'generating_image' | 'generating_3d' | 'saving_asset' | 'placing' | 'complete' | 'error';

const PHASE_COPY: Record<PipelinePhase, string> = {
  idle: '等待投递', upload: '正在上传文件', classifying: '正在理解与分类',
  planning_prompt: 'DeepSeek 正在规划建筑', generating_image: '正在生成 2K 建筑图',
  generating_3d: '正在生成 3D 资产', saving_asset: '正在保存资产', placing: '正在放入城市',
  complete: '建筑已入城', error: '任务失败',
};

export function setupPipelineStatus() {
  const root = required<HTMLElement>('pipeline-status');
  const copy = required<HTMLElement>('pipeline-status-copy');
  return {
    set(phase: PipelinePhase, detail?: string) {
      root.dataset.phase = phase;
      copy.textContent = detail || PHASE_COPY[phase];
      const rank = phaseRank(phase);
      root.querySelectorAll<HTMLElement>('li[data-phase]').forEach((item, index) => {
        item.classList.toggle('is-active', index === rank);
        item.classList.toggle('is-done', index < rank || phase === 'complete');
      });
    },
  };
}

function phaseRank(phase: PipelinePhase): number {
  if (phase === 'upload') return 0;
  if (phase === 'classifying' || phase === 'planning_prompt' || phase === 'generating_image') return 1;
  if (phase === 'generating_3d' || phase === 'saving_asset' || phase === 'placing') return 2;
  if (phase === 'complete') return 3;
  return -1;
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

import { uploadFiles, type UploadResponse, type UploadResult } from '../api';

interface FileDropOptions {
  onKnowledgeChanged(response: UploadResponse): Promise<{ generatedBuildings: number; candidates: number } | void> | void;
  onPhase?(phase: 'upload' | 'classifying' | 'error', detail?: string): void;
}

export function setupFileDrop(options: FileDropOptions): void {
  const zone = required<HTMLElement>('file-drop-zone');
  const button = required<HTMLButtonElement>('file-drop-button');
  const input = required<HTMLInputElement>('file-input');
  const status = required<HTMLElement>('file-drop-status');
  const results = required<HTMLElement>('file-drop-results');
  let dragDepth = 0;

  const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files');

  window.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    document.body.dataset.fileDragging = 'true';
    zone.classList.add('is-dragging');
  });
  window.addEventListener('dragover', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (event) => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) clearDragState();
  });
  window.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    clearDragState();
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) void submit(files);
  });

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) void submit(files);
  });

  function clearDragState(): void {
    dragDepth = 0;
    delete document.body.dataset.fileDragging;
    zone.classList.remove('is-dragging');
  }

  async function submit(files: File[]): Promise<void> {
    zone.dataset.state = 'uploading';
    options.onPhase?.('upload');
    button.disabled = true;
    status.textContent = `正在解析并分类 ${files.length} 个文件…`;
    results.hidden = true;
    results.replaceChildren();
    try {
      const response = await uploadFiles(files);
      options.onPhase?.('classifying');
      renderResults(response);
      status.textContent = response.review > 0
        ? '文件已归档，正在按关键词分类并生成建筑…'
        : '文件已归档，正在刷新城市…';
      const update = await options.onKnowledgeChanged(response);
      zone.dataset.state = response.review > 0 ? 'review' : 'success';
      if (update?.generatedBuildings) {
        zone.dataset.state = 'success';
        status.textContent = `${response.total} 个文件已分类，${update.generatedBuildings} 栋新建筑已放入城市`;
      } else if (response.review > 0) {
        status.textContent = update?.candidates
          ? `${response.review} 个新颖文档已聚合，暂无新建筑`
          : `${response.review} 个新颖文档已进入候选池（同主题至少 3 份）`;
      } else {
        status.textContent = `${response.total} 个文件已完成归档与放置`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败，请确认知识服务已启动';
      options.onPhase?.('error', message);
      zone.dataset.state = 'error';
      status.textContent = message;
    } finally {
      button.disabled = false;
    }
  }

  function renderResults(response: UploadResponse): void {
    results.replaceChildren(...response.items.slice(0, 4).map(resultItem));
    if (response.items.length > 4) {
      const more = document.createElement('li');
      more.textContent = `另有 ${response.items.length - 4} 个文件已处理`;
      results.append(more);
    }
    results.hidden = false;
  }

  function resultItem(item: UploadResult): HTMLLIElement {
    const row = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = item.title;
    const placement = document.createElement('span');
    if (item.status === 'review') placement.textContent = '待确认分类';
    else if (item.status === 'duplicate') placement.textContent = `已存在 · ${item.building_name ?? '待确认'}`;
    else placement.textContent = `→ ${item.building_name ?? item.building_id ?? '待确认'}`;
    row.append(title, placement);
    return row;
  }
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: #${id}`);
  return element as T;
}

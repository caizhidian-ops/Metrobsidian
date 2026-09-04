import * as THREE from 'three';
import type { Viewer } from '../core/createViewer';

type AnnotationStatus = 'open' | 'in-progress' | 'resolved';

interface StoredVector3 { x: number; y: number; z: number }

interface Annotation {
  id: string;
  comment: string;
  status: AnnotationStatus;
  point: StoredVector3;
  camera: StoredVector3;
  target: StoredVector3;
  screenshot: string;
  createdAt: string;
}

interface AnnotationDraft {
  point: THREE.Vector3;
  camera: THREE.Vector3;
  target: THREE.Vector3;
  screenshot: string;
}

const STORAGE_KEY = 'memory-city:annotations:v1';
const STATUS_LABELS: Record<AnnotationStatus, string> = {
  open: '待处理',
  'in-progress': '处理中',
  resolved: '已解决',
};

export function setupAnnotations(viewer: Viewer): () => void {
  const trigger = required<HTMLButtonElement>('annotation-trigger');
  const panel = required<HTMLElement>('annotation-panel');
  const close = required<HTMLButtonElement>('annotation-close');
  const count = required<HTMLElement>('annotation-count');
  const empty = required<HTMLElement>('annotation-empty');
  const list = required<HTMLOListElement>('annotation-list');
  const exportButton = required<HTMLButtonElement>('annotation-export');
  const modeHint = required<HTMLElement>('annotation-mode-hint');
  const dialog = required<HTMLDialogElement>('annotation-dialog');
  const form = required<HTMLFormElement>('annotation-form');
  const preview = required<HTMLImageElement>('annotation-preview');
  const coordinate = required<HTMLElement>('annotation-coordinate');
  const comment = required<HTMLTextAreaElement>('annotation-comment');
  const status = required<HTMLSelectElement>('annotation-status');
  const cancel = required<HTMLButtonElement>('annotation-cancel');
  const cancelX = required<HTMLButtonElement>('annotation-cancel-x');
  const canvas = viewer.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const markerGroup = new THREE.Group();
  markerGroup.name = 'annotation-markers';
  markerGroup.userData.annotationOverlay = true;
  viewer.scene.add(markerGroup);

  let annotations = loadAnnotations();
  let placing = false;
  let draft: AnnotationDraft | null = null;
  let pointerStart: { x: number; y: number } | null = null;

  const setPanelOpen = (open: boolean): void => {
    panel.hidden = !open;
    panel.setAttribute('aria-hidden', String(!open));
    document.body.dataset.annotationsOpen = String(open);
  };

  const setPlacing = (active: boolean): void => {
    placing = active;
    document.body.dataset.annotationMode = active ? 'placing' : '';
    trigger.setAttribute('aria-pressed', String(active));
    trigger.classList.toggle('is-active', active);
    modeHint.hidden = !active;
    canvas.style.cursor = active ? 'crosshair' : 'grab';
    if (active) setPanelOpen(true);
  };

  const render = (): void => {
    count.textContent = `${annotations.length} 条评论`;
    empty.hidden = annotations.length > 0;
    exportButton.disabled = annotations.length === 0;
    list.replaceChildren();
    markerGroup.children.forEach((child) => {
      const material = (child as THREE.Sprite).material;
      if (material instanceof THREE.SpriteMaterial) {
        material.map?.dispose();
        material.dispose();
      }
    });
    markerGroup.clear();

    annotations.forEach((annotation, index) => {
      markerGroup.add(createMarker(annotation, index + 1));
      const item = document.createElement('li');
      item.className = 'annotation-card';
      item.dataset.status = annotation.status;

      const focusButton = document.createElement('button');
      focusButton.type = 'button';
      focusButton.className = 'annotation-card__focus';
      focusButton.setAttribute('aria-label', `回到评论 ${index + 1} 的原视角`);
      const image = document.createElement('img');
      image.src = annotation.screenshot;
      image.alt = '';
      const body = document.createElement('span');
      const meta = document.createElement('small');
      meta.textContent = `#${index + 1} · ${formatPoint(annotation.point)}`;
      const text = document.createElement('strong');
      text.textContent = annotation.comment;
      body.append(meta, text);
      focusButton.append(image, body);
      focusButton.addEventListener('click', () => {
        setPlacing(false);
        viewer.flyTo(fromStored(annotation.camera), fromStored(annotation.target));
      });

      const controls = document.createElement('div');
      controls.className = 'annotation-card__controls';
      const select = document.createElement('select');
      select.setAttribute('aria-label', `评论 ${index + 1} 状态`);
      (Object.keys(STATUS_LABELS) as AnnotationStatus[]).forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = STATUS_LABELS[value];
        option.selected = value === annotation.status;
        select.append(option);
      });
      select.addEventListener('change', () => {
        annotation.status = select.value as AnnotationStatus;
        persist();
        render();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '删除';
      remove.setAttribute('aria-label', `删除评论 ${index + 1}`);
      remove.addEventListener('click', () => {
        annotations = annotations.filter((candidate) => candidate.id !== annotation.id);
        persist();
        render();
      });
      controls.append(select, remove);
      item.append(focusButton, controls);
      list.append(item);
    });
  };

  const persist = (): void => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
  };

  const hitPoint = (event: PointerEvent): THREE.Vector3 | null => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, viewer.camera);
    const hit = raycaster.intersectObjects(viewer.scene.children, true).find(({ object }) => !isAnnotationObject(object));
    return hit?.point.clone() ?? null;
  };

  const beginDraft = async (point: THREE.Vector3): Promise<void> => {
    const navigation = viewer.getNavigationState();
    draft = {
      point,
      camera: navigation.camera,
      target: navigation.target,
      screenshot: await captureScreenshot(viewer),
    };
    setPlacing(false);
    preview.src = draft.screenshot;
    coordinate.textContent = `坐标 ${formatPoint(toStored(point))}`;
    comment.value = '';
    status.value = 'open';
    dialog.showModal();
    comment.focus();
  };

  const discardDraft = (): void => {
    draft = null;
    if (dialog.open) dialog.close();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!placing) return;
    pointerStart = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!placing || !pointerStart) return;
    const travel = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (travel >= 5) return;
    const point = hitPoint(event);
    if (point) void beginDraft(point);
  };

  trigger.addEventListener('click', () => setPlacing(!placing));
  close.addEventListener('click', () => { setPlacing(false); setPanelOpen(false); });
  cancel.addEventListener('click', discardDraft);
  cancelX.addEventListener('click', discardDraft);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!draft || !comment.value.trim()) return;
    annotations.unshift({
      id: crypto.randomUUID(),
      comment: comment.value.trim(),
      status: status.value as AnnotationStatus,
      point: toStored(draft.point),
      camera: toStored(draft.camera),
      target: toStored(draft.target),
      screenshot: draft.screenshot,
      createdAt: new Date().toISOString(),
    });
    try {
      persist();
      render();
      discardDraft();
      setPanelOpen(true);
    } catch (error) {
      console.error(error);
      coordinate.textContent = '浏览器存储空间不足，请先导出并删除部分评论。';
    }
  });
  exportButton.addEventListener('click', () => {
    const original = exportButton.textContent;
    try {
      exportButton.dataset.state = 'success';
      exportButton.textContent = '文档已生成';
      exportDocument(annotations);
    } catch (error) {
      console.error(error);
      exportButton.dataset.state = 'error';
      exportButton.textContent = '导出失败，请重试';
    }
    window.setTimeout(() => {
      delete exportButton.dataset.state;
      exportButton.textContent = original;
    }, 2_000);
  });
  canvas.addEventListener('pointerdown', onPointerDown, true);
  canvas.addEventListener('pointerup', onPointerUp, true);

  render();

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown, true);
    canvas.removeEventListener('pointerup', onPointerUp, true);
    markerGroup.removeFromParent();
    delete document.body.dataset.annotationMode;
    delete document.body.dataset.annotationsOpen;
  };
}

function createMarker(annotation: Annotation, number: number): THREE.Sprite {
  const markerCanvas = document.createElement('canvas');
  markerCanvas.width = 96;
  markerCanvas.height = 112;
  const context = markerCanvas.getContext('2d')!;
  context.fillStyle = '#d73f32';
  context.beginPath();
  context.arc(48, 42, 28, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(34, 62);
  context.lineTo(48, 102);
  context.lineTo(62, 62);
  context.fill();
  context.fillStyle = '#fff';
  context.font = '600 28px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(number), 48, 42);
  const texture = new THREE.CanvasTexture(markerCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.position.copy(fromStored(annotation.point)).add(new THREE.Vector3(0, 5.5, 0));
  sprite.scale.set(8, 9.3, 1);
  sprite.renderOrder = 100;
  sprite.userData.annotationOverlay = true;
  return sprite;
}

function isAnnotationObject(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData.annotationOverlay) return true;
    current = current.parent;
  }
  return false;
}

async function captureScreenshot(viewer: Viewer): Promise<string> {
  viewer.renderer.render(viewer.scene, viewer.camera);
  const source = viewer.renderer.domElement;
  const width = Math.min(720, source.width);
  const height = Math.round(width * source.height / source.width);
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  output.getContext('2d')!.drawImage(source, 0, 0, width, height);
  return output.toDataURL('image/jpeg', 0.72);
}

function exportDocument(annotations: Annotation[]): void {
  const cards = annotations.map((annotation, index) => `
    <article>
      <img src="${annotation.screenshot}" alt="评论 ${index + 1} 的 3D 视角截图">
      <div><p class="meta">#${index + 1} · ${escapeHtml(STATUS_LABELS[annotation.status])} · ${escapeHtml(formatPoint(annotation.point))}</p>
      <h2>${escapeHtml(annotation.comment)}</h2>
      <p>相机：${escapeHtml(formatPoint(annotation.camera))}<br>观察目标：${escapeHtml(formatPoint(annotation.target))}<br>创建时间：${escapeHtml(new Date(annotation.createdAt).toLocaleString('zh-CN'))}</p></div>
    </article>`).join('');
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>知识都市空间评论</title><style>body{max-width:960px;margin:40px auto;padding:0 24px;font:16px/1.6 system-ui;color:#292722}header{border-bottom:2px solid #292722;margin-bottom:32px}article{display:grid;grid-template-columns:280px 1fr;gap:24px;padding:24px 0;border-bottom:1px solid #ccc}img{width:100%;border:1px solid #bbb}.meta{color:#b54936;font:12px monospace}h2{font-size:20px}@media(max-width:650px){article{grid-template-columns:1fr}}</style><header><p>KNOWLEDGE CITY / SPATIAL REVIEW</p><h1>空间评论文档</h1><p>共 ${annotations.length} 条评论 · 导出于 ${new Date().toLocaleString('zh-CN')}</p></header>${cards}</html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `knowledge-city-annotations-${new Date().toISOString().slice(0, 10)}.html`;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function loadAnnotations(): Annotation[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

function toStored(vector: THREE.Vector3): StoredVector3 { return { x: vector.x, y: vector.y, z: vector.z }; }
function fromStored(vector: StoredVector3): THREE.Vector3 { return new THREE.Vector3(vector.x, vector.y, vector.z); }
function formatPoint(vector: StoredVector3): string { return `X ${vector.x.toFixed(1)} · Y ${vector.y.toFixed(1)} · Z ${vector.z.toFixed(1)}`; }
function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
}

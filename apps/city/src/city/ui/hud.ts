import * as THREE from 'three';
import type { BuildingDef } from '../config/buildings';
import {
  KNOWLEDGE_DOCUMENTS,
  contentFor,
  documentOverrideFor,
  documentsFor,
  renderMarkdown,
  saveDocumentOverride,
  type KnowledgeDocument,
} from '../config/knowledge';
import type { Viewer } from '../core/createViewer';

export interface BuildingTarget {
  cameraPos: THREE.Vector3;
  lookAt: THREE.Vector3;
}

export interface HudController {
  selectBuilding(buildingId: string): void;
  openDocument(documentId: string): void;
  refreshKnowledge(): void;
  /** 运行时注册 AI 生成建筑，使其可选中并出现在城市索引中。 */
  registerBuilding(def: BuildingDef, target: BuildingTarget): void;
}

export function computeTarget(def: BuildingDef): BuildingTarget {
  const lookAt = new THREE.Vector3(def.position[0], def.height * 0.45, def.position[2]);
  const cameraPos = lookAt.clone().add(new THREE.Vector3(38, 42, 48));
  return { cameraPos, lookAt };
}

export function setupHud(viewer: Viewer, buildings: BuildingDef[], targets: BuildingTarget[]): HudController {
  const list = required<HTMLElement>('building-list');
  const buildingPanel = required<HTMLElement>('building-panel');
  const libraryDialog = required<HTMLDialogElement>('library-dialog');
  const commandDialog = required<HTMLDialogElement>('command-dialog');
  const commandInput = required<HTMLInputElement>('command-input');
  const commandResults = required<HTMLElement>('command-results');
  const documentViewer = required<HTMLElement>('document-viewer');
  const documentEditor = required<HTMLTextAreaElement>('document-editor');
  const editDocument = required<HTMLButtonElement>('edit-document');
  const cancelDocument = required<HTMLButtonElement>('cancel-document');
  const saveDocument = required<HTMLButtonElement>('save-document');
  const documentSaveStatus = required<HTMLElement>('document-save-status');
  const enterRoom = required<HTMLButtonElement>('enter-room');
  const openLibraryButton = required<HTMLButtonElement>('open-library');
  const appContent = required<HTMLElement>('app-content');
  const buildingById = new Map(buildings.map((building, index) => [building.id, { building, target: targets[index] }]));
  let currentBuildingId = '';
  let commandItems: HTMLButtonElement[] = [];
  let commandIndex = 0;
  let activeDocument: KnowledgeDocument | null = null;

  required<HTMLElement>('document-total').textContent = `${KNOWLEDGE_DOCUMENTS.length} 份可查看文档`;
  required<HTMLElement>('district-total').textContent = `${buildings.length} 个知识分区`;

  buildings.forEach((building) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.buildingId = building.id;
    button.setAttribute('aria-pressed', 'false');
    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = building.name;
    const meta = document.createElement('small');
    meta.textContent = `${building.tagline} · ${documentsFor(building.id).length}`;
    text.append(name, meta);
    button.append(text);
    button.addEventListener('click', () => selectBuilding(building.id));
    item.append(button);
    list.append(item);
  });

  const refreshKnowledge = (): void => {
    required<HTMLElement>('document-total').textContent = `${KNOWLEDGE_DOCUMENTS.length} 份可查看文档`;
    list.querySelectorAll<HTMLButtonElement>('button[data-building-id]').forEach((button) => {
      const buildingId = button.dataset.buildingId ?? '';
      const meta = button.querySelector<HTMLElement>('small');
      const building = buildingById.get(buildingId)?.building;
      if (meta && building) meta.textContent = `${building.tagline} · ${documentsFor(buildingId).length}`;
    });
    if (currentBuildingId) selectBuilding(currentBuildingId);
  };

  const selectBuilding = (buildingId: string): void => {
    const entry = buildingById.get(buildingId);
    if (!entry) return;
    currentBuildingId = buildingId;
    viewer.flyTo(entry.target.cameraPos, entry.target.lookAt);
    const documents = documentsFor(buildingId);
    required<HTMLElement>('building-code').textContent = '';
    required<HTMLElement>('building-count').textContent = `${documents.length} 份文档`;
    required<HTMLElement>('building-name').textContent = entry.building.name;
    required<HTMLElement>('building-tagline').textContent = entry.building.tagline;
    required<HTMLElement>('building-summary').textContent = entry.building.summary;
    // 能力驱动：有独立 3D 空间 → “进入房间”；有知识文档 → “查看档案”
    enterRoom.hidden = !entry.building.roomScene;
    if (entry.building.roomScene) {
      enterRoom.textContent = entry.building.roomSceneLabel ?? '进入房间';
      enterRoom.onclick = () => window.location.assign(entry.building.roomScene!);
    }
    openLibraryButton.hidden = documents.length === 0;
    buildingPanel.hidden = false;
    buildingPanel.setAttribute('aria-hidden', 'false');
    document.body.dataset.buildingSelected = 'true';
    list.querySelectorAll<HTMLButtonElement>('button[data-building-id]').forEach((button) => {
      const active = button.dataset.buildingId === buildingId;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll<HTMLElement>('.building-label').forEach((label) => {
      label.classList.toggle('is-active', label.dataset.buildingId === buildingId);
    });
    window.dispatchEvent(new CustomEvent('memory-city:building-selected', { detail: { buildingId } }));
  };

  const showDocument = (knowledgeDocument: KnowledgeDocument): void => {
    activeDocument = knowledgeDocument;
    setEditMode(false);
    documentViewer.innerHTML = renderMarkdown(contentFor(knowledgeDocument));
    documentViewer.scrollTop = 0;
    documentSaveStatus.textContent = documentOverrideFor(knowledgeDocument.id) ? '已保存到此浏览器' : '源文档';
    required<HTMLElement>('document-list').querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      const active = button.dataset.documentId === knowledgeDocument.id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
  };

  const setEditMode = (editing: boolean): void => {
    documentViewer.hidden = editing;
    documentEditor.hidden = !editing;
    editDocument.hidden = editing || !activeDocument;
    cancelDocument.hidden = !editing;
    saveDocument.hidden = !editing;
    required<HTMLElement>('document-list').querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = editing;
    });
  };

  const beginEdit = (): void => {
    if (!activeDocument) return;
    documentEditor.value = contentFor(activeDocument);
    documentSaveStatus.textContent = '编辑中 · 尚未保存';
    setEditMode(true);
    documentEditor.focus();
  };

  const cancelEdit = (): void => {
    if (!activeDocument) return;
    setEditMode(false);
    documentSaveStatus.textContent = documentOverrideFor(activeDocument.id) ? '已保存到此浏览器' : '源文档';
    documentViewer.focus();
  };

  const saveEdit = (): void => {
    if (!activeDocument) return;
    const content = documentEditor.value;
    if (!content.trim()) {
      documentEditor.setAttribute('aria-invalid', 'true');
      documentSaveStatus.textContent = '文档内容不能为空';
      return;
    }
    documentEditor.removeAttribute('aria-invalid');
    try {
      saveDocumentOverride(activeDocument.id, content);
    } catch {
      saveDocument.dataset.state = 'error';
      documentSaveStatus.textContent = '保存失败 · 请检查浏览器存储权限';
      window.setTimeout(() => { delete saveDocument.dataset.state; }, 1200);
      return;
    }
    documentViewer.innerHTML = renderMarkdown(content);
    documentViewer.scrollTop = 0;
    setEditMode(false);
    documentSaveStatus.textContent = '已保存到此浏览器';
    saveDocument.dataset.state = 'success';
    window.setTimeout(() => { delete saveDocument.dataset.state; }, 700);
    documentViewer.focus();
  };

  editDocument.addEventListener('click', beginEdit);
  cancelDocument.addEventListener('click', cancelEdit);
  saveDocument.addEventListener('click', saveEdit);
  documentEditor.addEventListener('input', () => {
    documentEditor.removeAttribute('aria-invalid');
    documentSaveStatus.textContent = '编辑中 · 尚未保存';
  });
  documentEditor.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveEdit();
    }
  });

  const openLibrary = (buildingId: string, documentId?: string): void => {
    const entry = buildingById.get(buildingId);
    if (!entry) return;
    const documents = documentsFor(buildingId);
    required<HTMLElement>('library-code').textContent = `${documents.length} 份文档`;
    required<HTMLElement>('library-title').textContent = `${entry.building.name}档案`;
    const documentList = required<HTMLElement>('document-list');
    documentList.replaceChildren();
    documents.forEach((knowledgeDocument) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.documentId = knowledgeDocument.id;
      const title = document.createElement('strong');
      title.textContent = knowledgeDocument.title;
      const summary = document.createElement('span');
      summary.textContent = knowledgeDocument.summary;
      button.append(title, summary);
      button.addEventListener('click', () => showDocument(knowledgeDocument));
      item.append(button);
      documentList.append(item);
    });
    const firstDocument = documents.find((document) => document.id === documentId) ?? documents[0];
    if (firstDocument) showDocument(firstDocument);
    else documentViewer.textContent = '该分区暂无可查看文档。';
    appContent.inert = true;
    libraryDialog.showModal();
  };

  const closeLibrary = (): void => {
    setEditMode(false);
    libraryDialog.close();
  };
  required<HTMLButtonElement>('open-library').addEventListener('click', () => {
    if (currentBuildingId) openLibrary(currentBuildingId);
  });
  document.querySelector<HTMLElement>('[data-close-library]')?.addEventListener('click', closeLibrary);
  libraryDialog.addEventListener('click', (event) => {
    if (event.target === libraryDialog) closeLibrary();
  });
  libraryDialog.addEventListener('close', () => { appContent.inert = false; });
  documentViewer.addEventListener('click', (event) => {
    const link = (event.target as HTMLElement).closest<HTMLButtonElement>('.document-link[data-document-file]');
    if (!link?.dataset.documentFile || !currentBuildingId) return;
    const target = documentsFor(currentBuildingId).find((candidate) => candidate.filename === link.dataset.documentFile);
    if (target) showDocument(target);
  });

  const commandCandidates = () => [
    ...buildings.map((building) => ({
      id: building.id,
      type: 'building' as const,
      title: building.name,
      meta: building.tagline,
      keywords: `${building.name} ${building.tagline} ${building.summary}`,
    })),
    ...KNOWLEDGE_DOCUMENTS.map((document) => ({
      id: document.id,
      type: 'document' as const,
      title: document.title,
      meta: `${buildingById.get(document.buildingId)?.building.name ?? ''} · 文档`,
      keywords: `${document.title} ${document.summary}`,
    })),
  ];

  const renderCommandResults = (query = ''): void => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    const candidates = commandCandidates()
      .filter((candidate) => !normalized || candidate.keywords.toLocaleLowerCase('zh-CN').includes(normalized))
      .slice(0, 10);
    commandResults.replaceChildren();
    commandItems = candidates.map((candidate, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'command-result';
      button.setAttribute('role', 'option');
      button.dataset.resultType = candidate.type;
      button.dataset.resultId = candidate.id;
      const label = document.createElement('strong');
      label.textContent = candidate.title;
      const meta = document.createElement('span');
      meta.textContent = candidate.meta;
      button.append(label, meta);
      button.addEventListener('click', () => activateCommand(button));
      button.classList.toggle('is-active', index === 0);
      button.setAttribute('aria-selected', String(index === 0));
      commandResults.append(button);
      return button;
    });
    commandIndex = 0;
    if (!commandItems.length) {
      const empty = document.createElement('p');
      empty.className = 'command-empty';
      empty.textContent = '没有匹配的建筑或文档。';
      commandResults.append(empty);
    }
  };

  const activateCommand = (button: HTMLButtonElement): void => {
    commandDialog.close();
    if (button.dataset.resultType === 'building') selectBuilding(button.dataset.resultId ?? '');
    else if (button.dataset.resultId) openDocument(button.dataset.resultId);
  };

  const openCommand = (): void => {
    renderCommandResults();
    commandInput.value = '';
    appContent.inert = true;
    commandDialog.showModal();
    commandInput.focus();
  };
  required<HTMLButtonElement>('command-trigger').addEventListener('click', openCommand);
  commandInput.addEventListener('input', () => renderCommandResults(commandInput.value));
  commandInput.addEventListener('keydown', (event) => {
    if (!commandItems.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      commandIndex = (commandIndex + (event.key === 'ArrowDown' ? 1 : -1) + commandItems.length) % commandItems.length;
      commandItems.forEach((item, index) => {
        item.classList.toggle('is-active', index === commandIndex);
        item.setAttribute('aria-selected', String(index === commandIndex));
      });
      commandItems[commandIndex].scrollIntoView({ block: 'nearest' });
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      activateCommand(commandItems[commandIndex]);
    }
  });
  commandDialog.addEventListener('click', (event) => {
    if (event.target === commandDialog) commandDialog.close();
  });
  commandDialog.addEventListener('close', () => { appContent.inert = false; });

  const reset = () => {
    viewer.resetView();
    buildingPanel.hidden = true;
    buildingPanel.setAttribute('aria-hidden', 'true');
    currentBuildingId = '';
    document.body.dataset.buildingSelected = 'false';
    list.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.classList.remove('is-active'));
    window.dispatchEvent(new CustomEvent('memory-city:building-selected', { detail: { buildingId: '' } }));
  };
  required<HTMLButtonElement>('reset-view').addEventListener('click', reset);
  document.querySelector<HTMLAnchorElement>('.brand')?.addEventListener('click', (event) => {
    event.preventDefault();
    reset();
  });
  document.addEventListener('click', (event) => {
    const label = (event.target as HTMLElement).closest<HTMLElement>('.building-label[data-building-id]');
    const building = label?.dataset.buildingId ? buildingById.get(label.dataset.buildingId)?.building : undefined;
    if (building?.roomScene) {
      window.location.assign(building.roomScene);
      return;
    }
    if (label?.dataset.buildingId) selectBuilding(label.dataset.buildingId);
  });
  window.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (commandDialog.open) commandDialog.close();
      else openCommand();
      return;
    }
    if (libraryDialog.open || commandDialog.open) return;
    if (event.key === 'r' || event.key === 'R') reset();
    const index = Number(event.key) - 1;
    if (index >= 0 && index < buildings.length) selectBuilding(buildings[index].id);
  });

  function openDocument(documentId: string): void {
    const knowledgeDocument = KNOWLEDGE_DOCUMENTS.find((candidate) => candidate.id === documentId);
    if (!knowledgeDocument) return;
    selectBuilding(knowledgeDocument.buildingId);
    openLibrary(knowledgeDocument.buildingId, knowledgeDocument.id);
  }

  function registerBuilding(def: BuildingDef, target: BuildingTarget): void {
    if (buildingById.has(def.id)) return;
    buildingById.set(def.id, { building: def, target });
    buildings.push(def);
    required<HTMLElement>('district-total').textContent = `${buildings.length} 个知识分区`;

    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.buildingId = def.id;
    button.setAttribute('aria-pressed', 'false');
    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = def.name;
    const meta = document.createElement('small');
    meta.textContent = `${def.tagline} · ${documentsFor(def.id).length}`;
    text.append(name, meta);
    button.append(text);
    button.addEventListener('click', () => selectBuilding(def.id));
    item.append(button);
    list.append(item);

    const label = document.querySelector<HTMLElement>(`.building-label[data-building-id="${def.id}"]`);
    if (label) label.classList.add('is-generated');
  }

  return { selectBuilding, openDocument, refreshKnowledge, registerBuilding };
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: #${id}`);
  return element as T;
}

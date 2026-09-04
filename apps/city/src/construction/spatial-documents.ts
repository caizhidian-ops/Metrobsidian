import * as THREE from 'three';
import { contentFor, documentsFor, renderMarkdown, type KnowledgeDocument } from '../city/config/knowledge';

export type ConstructionViewName = 'overview' | 'structure' | 'equipment' | 'inspection';

interface ConstructionDocumentBinding {
  filename: string;
  anchorId: string;
  view: ConstructionViewName;
  role: string;
  status: string;
  location: string;
  color: number;
  beaconPosition: [number, number, number];
}

interface ResolvedBinding extends ConstructionDocumentBinding {
  document: KnowledgeDocument;
  anchor: THREE.Object3D;
  beacon: THREE.Group;
}

interface SetupOptions {
  renderer: THREE.WebGLRenderer;
  camera: THREE.Camera;
  anchors: Map<string, THREE.Object3D>;
  focusView(view: ConstructionViewName): void;
}

export interface ConstructionSpatialDocumentController {
  update(elapsedSeconds: number): void;
}

const BINDINGS: ConstructionDocumentBinding[] = [
  {
    filename: '有品味的创意Agent_未完成设想.md',
    anchorId: 'creative-agent-frame',
    view: 'inspection',
    role: '未完成设想',
    status: '待验证',
    location: '结构区 · 五阶段施工框架',
    color: 0xe7a32a,
    beaconPosition: [0, 7.05, 0],
  },
];

export function setupConstructionSpatialDocuments(options: SetupOptions): ConstructionSpatialDocumentController {
  const constructionDocuments = documentsFor('construction');
  const resolved = BINDINGS.map((binding) => resolveBinding(binding, constructionDocuments, options.anchors));
  const bindingByFilename = new Map(resolved.map((binding) => [binding.filename, binding]));
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const canvas = options.renderer.domElement;
  const tooltip = required<HTMLElement>('construction-document-tooltip');
  const dialog = required<HTMLDialogElement>('construction-document-dialog');
  const shortcuts = required<HTMLElement>('construction-document-shortcuts');
  let pointerDown: { x: number; y: number } | null = null;

  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '可交互的施工工地，可点击在建结构阅读文档');

  resolved.forEach((binding, index) => {
    binding.anchor.userData.constructionDocumentFilename = binding.filename;
    binding.anchor.add(binding.beacon);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.filename = binding.filename;
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    const text = document.createElement('strong');
    text.textContent = shortTitle(binding.document.title);
    const status = document.createElement('small');
    status.textContent = binding.status;
    button.append(number, text, status);
    button.addEventListener('click', () => openBinding(binding));
    shortcuts.append(button);
  });

  const hitBinding = (event: PointerEvent): ResolvedBinding | null => {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, options.camera);
    const intersections = raycaster.intersectObjects(resolved.map((binding) => binding.anchor), true);
    for (const intersection of intersections) {
      let object: THREE.Object3D | null = intersection.object;
      while (object) {
        const filename = object.userData.constructionDocumentFilename;
        if (typeof filename === 'string') return bindingByFilename.get(filename) ?? null;
        object = object.parent;
      }
    }
    return null;
  };

  canvas.addEventListener('pointermove', (event) => {
    const binding = hitBinding(event);
    canvas.style.cursor = binding ? 'pointer' : 'grab';
    if (!binding) {
      tooltip.hidden = true;
      return;
    }
    required<HTMLElement>('construction-tooltip-title').textContent = binding.document.title;
    required<HTMLElement>('construction-tooltip-status').textContent = `${binding.location} · ${binding.status}`;
    tooltip.style.left = `${Math.min(event.clientX + 16, window.innerWidth - 270)}px`;
    tooltip.style.top = `${Math.min(event.clientY + 16, window.innerHeight - 92)}px`;
    tooltip.hidden = false;
  });
  canvas.addEventListener('pointerleave', () => {
    canvas.style.cursor = 'grab';
    tooltip.hidden = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) {
      pointerDown = null;
      return;
    }
    pointerDown = null;
    const binding = hitBinding(event);
    if (binding) openBinding(binding);
  });

  required<HTMLButtonElement>('close-construction-reader').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    shortcuts.querySelectorAll('button').forEach((button) => button.classList.remove('is-active'));
  });
  window.addEventListener('keydown', (event) => {
    if (!dialog.open && event.key === '1') openBinding(resolved[0]);
  });

  function openBinding(binding: ResolvedBinding): void {
    tooltip.hidden = true;
    options.focusView(binding.view);
    required<HTMLElement>('construction-reader-meta').textContent = `${binding.role} · ${binding.status} · ${binding.location}`;
    required<HTMLElement>('construction-reader-title').textContent = binding.document.title;
    required<HTMLElement>('construction-reader-body').innerHTML = renderMarkdown(contentFor(binding.document));
    shortcuts.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.filename === binding.filename);
    });
    dialog.showModal();
  }

  return {
    update(elapsedSeconds: number): void {
      resolved.forEach((binding, index) => {
        const pulse = 1 + Math.sin(elapsedSeconds * 1.8 + index) * 0.08;
        binding.beacon.scale.setScalar(pulse);
      });
    },
  };
}

function resolveBinding(binding: ConstructionDocumentBinding, documents: KnowledgeDocument[], anchors: Map<string, THREE.Object3D>): ResolvedBinding {
  const document = documents.find((candidate) => candidate.filename === binding.filename);
  if (!document) throw new Error(`Missing construction document: ${binding.filename}`);
  const anchor = anchors.get(binding.anchorId);
  if (!anchor) throw new Error(`Missing construction document anchor: ${binding.anchorId}`);
  const beacon = createBeacon(binding.color);
  beacon.position.set(...binding.beaconPosition);
  return { ...binding, document, anchor, beacon };
}

function createBeacon(color: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'construction-document-beacon';
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, metalness: 0.15, roughness: 0.3 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 12), material);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.055, 10, 30), material.clone());
  ring.rotation.x = Math.PI / 2;
  group.add(core, ring);
  return group;
}

function shortTitle(title: string): string {
  return title.split(/[（(]/, 1)[0].trim();
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing construction UI element: #${id}`);
  return element as T;
}

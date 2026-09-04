import * as THREE from 'three';
import { contentFor, documentsFor, renderMarkdown, type KnowledgeDocument } from '../city/config/knowledge';

export type HomeViewName = 'overview' | 'desk' | 'lounge' | 'practice';

type DocumentState = 'material' | 'active' | 'paused';

interface HomeDocumentBinding {
  filename: string;
  anchorId: string;
  view: HomeViewName;
  role: string;
  status: string;
  location: string;
  state: DocumentState;
  color: number;
  beaconPosition: [number, number, number];
}

interface ResolvedBinding extends HomeDocumentBinding {
  document: KnowledgeDocument;
  anchor: THREE.Object3D;
  beacon: THREE.Group;
}

interface SetupOptions {
  renderer: THREE.WebGLRenderer;
  camera: THREE.Camera;
  anchors: Map<string, THREE.Object3D>;
  focusView(view: HomeViewName): void;
}

export interface HomeSpatialDocumentController {
  update(elapsedSeconds: number): void;
}

const BINDINGS: HomeDocumentBinding[] = [
  {
    filename: '搬家清单_去地点版.md',
    anchorId: 'moving-boxes',
    view: 'lounge',
    role: '生活材料',
    status: '可查阅',
    location: '材料箱',
    state: 'material',
    color: 0x40b7aa,
    beaconPosition: [0, 2.45, 0],
  },
  {
    filename: '注意力与价值输出_私人工作笔记改写.md',
    anchorId: 'desk-and-computer',
    view: 'desk',
    role: '持续笔记',
    status: '进行中',
    location: '书桌',
    state: 'active',
    color: 0xf0a33a,
    beaconPosition: [1.25, 3.95, 0.18],
  },
  {
    filename: '架子鼓练习_进行中.md',
    anchorId: 'drum-practice',
    view: 'practice',
    role: '练习记录',
    status: '进行中',
    location: '架子鼓练习角',
    state: 'active',
    color: 0xf0a33a,
    beaconPosition: [0, 2.55, 0],
  },
  {
    filename: '网球练习_雨天暂停.md',
    anchorId: 'tennis-gear',
    view: 'lounge',
    role: '运动记录',
    status: '雨天暂停 2 周',
    location: '窗边网球拍',
    state: 'paused',
    color: 0x6096d8,
    beaconPosition: [0.15, 2.75, 0],
  },
];

export function setupHomeSpatialDocuments(options: SetupOptions): HomeSpatialDocumentController {
  const homeDocuments = documentsFor('home');
  const resolved = BINDINGS.map((binding) => resolveBinding(binding, homeDocuments, options.anchors));
  const bindingByFilename = new Map(resolved.map((binding) => [binding.filename, binding]));
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const canvas = options.renderer.domElement;
  const tooltip = required<HTMLElement>('home-document-tooltip');
  const dialog = required<HTMLDialogElement>('home-document-dialog');
  const shortcuts = required<HTMLElement>('home-document-shortcuts');
  let pointerDown: { x: number; y: number } | null = null;

  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '可交互的家庭房间，可从文档列表聚焦房间物件');

  resolved.forEach((binding, index) => {
    binding.anchor.userData.homeDocumentFilename = binding.filename;
    binding.anchor.add(binding.beacon);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.state = binding.state;
    button.dataset.filename = binding.filename;
    const number = document.createElement('span');
    number.textContent = String(index + 1);
    const title = document.createElement('strong');
    title.textContent = shortTitle(binding.document.title);
    const status = document.createElement('small');
    status.textContent = binding.status;
    button.append(number, title, status);
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
        const filename = object.userData.homeDocumentFilename;
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
    required<HTMLElement>('home-tooltip-title').textContent = binding.document.title;
    required<HTMLElement>('home-tooltip-status').textContent = `${binding.location} · ${binding.status}`;
    tooltip.dataset.state = binding.state;
    tooltip.style.left = `${Math.min(event.clientX + 16, window.innerWidth - 250)}px`;
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

  required<HTMLButtonElement>('close-home-reader').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    shortcuts.querySelectorAll('button').forEach((button) => button.classList.remove('is-active'));
  });

  window.addEventListener('keydown', (event) => {
    if (dialog.open) return;
    const index = Number(event.key) - 1;
    if (index >= 0 && index < resolved.length) openBinding(resolved[index]);
  });

  function openBinding(binding: ResolvedBinding): void {
    tooltip.hidden = true;
    options.focusView(binding.view);
    required<HTMLElement>('home-reader-meta').textContent = `${binding.role} · ${binding.status} · ${binding.location}`;
    required<HTMLElement>('home-reader-title').textContent = binding.document.title;
    required<HTMLElement>('home-reader-body').innerHTML = renderMarkdown(contentFor(binding.document));
    shortcuts.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.filename === binding.filename);
    });
    dialog.showModal();
  }

  return {
    update(elapsedSeconds: number): void {
      resolved.forEach((binding, index) => {
        const pulse = 1 + Math.sin(elapsedSeconds * 2 + index * 0.85) * (binding.state === 'paused' ? 0.035 : 0.09);
        binding.beacon.scale.setScalar(pulse);
        binding.beacon.rotation.y += 0.004;
      });
    },
  };
}

function resolveBinding(binding: HomeDocumentBinding, documents: KnowledgeDocument[], anchors: Map<string, THREE.Object3D>): ResolvedBinding {
  const document = documents.find((candidate) => candidate.filename === binding.filename);
  if (!document) throw new Error(`Missing home document: ${binding.filename}`);
  const anchor = anchors.get(binding.anchorId);
  if (!anchor) throw new Error(`Missing home document anchor: ${binding.anchorId}`);
  const beacon = createBeacon(binding.color, binding.state);
  beacon.position.set(...binding.beaconPosition);
  return { ...binding, document, anchor, beacon };
}

function createBeacon(color: number, state: DocumentState): THREE.Group {
  const group = new THREE.Group();
  group.name = `document-beacon-${state}`;
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: state === 'paused' ? 0.38 : 0.75,
    metalness: 0.08,
    roughness: 0.32,
    transparent: true,
    opacity: state === 'paused' ? 0.72 : 0.94,
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 12), material);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.035, 10, 28), material.clone());
  ring.rotation.x = Math.PI / 2;
  group.add(core, ring);
  return group;
}

function shortTitle(title: string): string {
  return title.split(/[（(]/, 1)[0].trim();
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing home UI element: #${id}`);
  return element as T;
}

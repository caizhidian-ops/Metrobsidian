import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Viewer } from '../core/createViewer';

interface UserIdentity { id: string; name: string }
interface PresenceMessage { type: 'presence'; users: UserIdentity[] }
interface PointerMessage { type: 'pointer'; user: UserIdentity; point: [number, number, number]; sentAt: number }
interface WelcomeMessage { type: 'welcome'; room: string; user: UserIdentity }
type ServerMessage = PresenceMessage | PointerMessage | WelcomeMessage;

interface RemotePulse {
  group: THREE.Group;
  sprite: THREE.Sprite;
  label: HTMLElement;
  startedAt: number;
}

const POINTER_LIFETIME = 2_800;

export function setupCollaboration(viewer: Viewer): () => void {
  const panel = required<HTMLElement>('collaboration-panel');
  const status = required<HTMLElement>('collaboration-status');
  const count = required<HTMLElement>('collaboration-count');
  const roomLabel = required<HTMLElement>('collaboration-room');
  const usersList = required<HTMLUListElement>('collaboration-users');
  const canvas = viewer.renderer.domElement;
  const query = new URLSearchParams(location.search);
  const room = sanitizeToken(query.get('room')) || 'memory-city';
  const user = getIdentity(query.get('name'));
  const endpoint = getEndpoint(query.get('ws'));
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pulses: RemotePulse[] = [];
  let socket: WebSocket | null = null;
  let reconnectTimer = 0;
  let reconnectAttempt = 0;
  let disposed = false;
  let pointerStart: { x: number; y: number } | null = null;

  document.body.dataset.collaboration = 'true';
  roomLabel.textContent = room;
  renderUsers([user]);

  function setConnection(state: 'connecting' | 'online' | 'offline', label: string): void {
    panel.dataset.state = state;
    status.textContent = label;
  }

  function connect(): void {
    if (disposed) return;
    setConnection('connecting', reconnectAttempt ? '正在重连' : '正在连接');
    socket = new WebSocket(endpoint);
    socket.addEventListener('open', () => {
      reconnectAttempt = 0;
      setConnection('online', '实时在线');
      socket?.send(JSON.stringify({ type: 'join', room, user }));
    });
    socket.addEventListener('message', (event) => {
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
      if (message.type === 'presence') renderUsers(message.users);
      if (message.type === 'pointer') addRemotePulse(message);
    });
    socket.addEventListener('close', () => {
      if (disposed) return;
      setConnection('offline', '连接已断开');
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(connect, Math.min(5_000, 600 * 2 ** reconnectAttempt));
    });
    socket.addEventListener('error', () => socket?.close());
  }

  function renderUsers(users: UserIdentity[]): void {
    count.textContent = `${users.length} 人在线`;
    usersList.replaceChildren();
    users.forEach((candidate) => {
      const item = document.createElement('li');
      const dot = document.createElement('i');
      const name = document.createElement('span');
      name.textContent = candidate.id === user.id ? `${candidate.name}（我）` : candidate.name;
      item.append(dot, name);
      usersList.append(item);
    });
  }

  function addRemotePulse(message: PointerMessage): void {
    const group = new THREE.Group();
    group.position.set(...message.point).add(new THREE.Vector3(0, 3.2, 0));
    group.userData.collaborationOverlay = true;
    const texture = createDotTexture();
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(7, 7, 1);
    sprite.renderOrder = 110;
    group.add(sprite);

    const label = document.createElement('span');
    label.className = 'remote-pointer-label';
    label.textContent = message.user.name;
    const labelObject = new CSS2DObject(label);
    labelObject.position.set(0, 4.2, 0);
    group.add(labelObject);
    viewer.scene.add(group);
    pulses.push({ group, sprite, label, startedAt: performance.now() });
  }

  function hitPoint(event: PointerEvent): THREE.Vector3 | null {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, viewer.camera);
    const hit = raycaster.intersectObjects(viewer.scene.children, true).find(({ object }) => !isCollaborationObject(object));
    return hit?.point.clone() ?? null;
  }

  const onPointerDown = (event: PointerEvent): void => { pointerStart = { x: event.clientX, y: event.clientY }; };
  const onPointerUp = (event: PointerEvent): void => {
    if (!pointerStart || socket?.readyState !== WebSocket.OPEN) return;
    const travel = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (travel >= 5) return;
    const point = hitPoint(event);
    if (point) socket.send(JSON.stringify({ type: 'pointer', point: point.toArray() }));
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);

  let raf = 0;
  const animatePulses = (now: number): void => {
    for (let index = pulses.length - 1; index >= 0; index -= 1) {
      const pulse = pulses[index];
      const progress = (now - pulse.startedAt) / POINTER_LIFETIME;
      if (progress >= 1) {
        pulse.group.removeFromParent();
        pulse.sprite.material.map?.dispose();
        pulse.sprite.material.dispose();
        pulse.label.remove();
        pulses.splice(index, 1);
      } else {
        pulse.sprite.material.opacity = 1 - Math.max(0, progress - 0.55) / 0.45;
        pulse.sprite.scale.setScalar(7 + Math.sin(progress * Math.PI * 6) * 0.8);
        pulse.label.style.opacity = String(pulse.sprite.material.opacity);
      }
    }
    raf = requestAnimationFrame(animatePulses);
  };
  raf = requestAnimationFrame(animatePulses);
  connect();

  return () => {
    disposed = true;
    window.clearTimeout(reconnectTimer);
    cancelAnimationFrame(raf);
    socket?.close();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    pulses.forEach((pulse) => pulse.group.removeFromParent());
    delete document.body.dataset.collaboration;
  };
}

function createDotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.strokeStyle = 'rgba(230, 48, 42, .32)';
  context.lineWidth = 10;
  context.beginPath();
  context.arc(64, 64, 50, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = '#e6302a';
  context.beginPath();
  context.arc(64, 64, 23, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function isCollaborationObject(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData.collaborationOverlay) return true;
    current = current.parent;
  }
  return false;
}

function getEndpoint(value: string | null): string {
  if (value && /^wss?:\/\//.test(value)) return value;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.hostname}:8787`;
}

function getIdentity(requestedName: string | null): UserIdentity {
  const existingId = sessionStorage.getItem('memory-city:user-id');
  const id = existingId || crypto.randomUUID().replace(/-/g, '');
  sessionStorage.setItem('memory-city:user-id', id);
  const suffix = id.slice(-4).toUpperCase();
  const name = requestedName?.trim().slice(0, 32) || `访客-${suffix}`;
  return { id, name };
}

function sanitizeToken(value: string | null): string {
  return value && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : '';
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

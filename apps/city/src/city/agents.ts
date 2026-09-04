import * as THREE from 'three';
import { createDeepSeekCharacter, createNiuCharacter, type CharacterRig } from '../characters/characterFactory';
import type { BuildingDef } from './config/buildings';
import type { Viewer } from './core/createViewer';

type Role = 'deepseek' | 'niu';
type Task = { id: string; prompt: string; roles: Role[]; targetBuilding: string; targetPath: string; state: string; summary: string; error: string; conversationTurns: number };

const DEFAULT_AGENT_URL = 'http://127.0.0.1:8790';

export function setupCityAgents(viewer: Viewer, buildings: BuildingDef[]): void {
  const endpoint = new URLSearchParams(location.search).get('agent') || DEFAULT_AGENT_URL;
  const plaza = buildingPosition(buildings, 'characters') ?? new THREE.Vector3(68, 0, 52);
  const buildingPositions = new Map(buildings.map((building) => [building.id, new THREE.Vector3(...building.position)]));
  const agents = new Map<Role, AgentVisual>([
    ['deepseek', createAgent('deepseek', createDeepSeekCharacter(), plaza.clone().add(new THREE.Vector3(2.4, 0, -1.2)))],
    ['niu', createAgent('niu', createNiuCharacter(), plaza.clone().add(new THREE.Vector3(-2.4, 0, 1.2)))],
  ]);
  agents.forEach((agent) => viewer.scene.add(agent.rig.root));

  const dialog = required<HTMLDialogElement>('agent-task-dialog');
  const logDialog = required<HTMLDialogElement>('agent-log-dialog');
  const logContent = required<HTMLElement>('agent-log-content');
  const form = required<HTMLFormElement>('agent-task-form');
  const list = required<HTMLElement>('agent-task-list');
  const status = required<HTMLElement>('agent-task-form-status');
  const panelStatus = required<HTMLElement>('agent-task-status');
  const roleCards = new Map<Role, { state: HTMLElement; activity: HTMLElement }>([
    ['deepseek', { state: required('agent-deepseek-state'), activity: required('agent-deepseek-activity') }],
    ['niu', { state: required('agent-niu-state'), activity: required('agent-niu-activity') }],
  ]);
  const buildingSelect = required<HTMLSelectElement>('agent-target-building');
  buildings.forEach((building) => buildingSelect.add(new Option(building.name, building.id)));
  buildingSelect.value = 'characters';
  panelStatus.textContent = '等待任务';
  roleCards.forEach((card) => { card.state.textContent = '本地巡游'; card.activity.textContent = '下发任务后才会连接 Agent 服务。'; });
  let tasks: Task[] = [];
  let encounterTaskId = '';
  let lastTime = performance.now();
  let refreshTimer: number | undefined;

  required<HTMLButtonElement>('agent-task-trigger').addEventListener('click', () => dialog.showModal());
  required<HTMLButtonElement>('agent-task-panel-new').addEventListener('click', () => dialog.showModal());
  required<HTMLButtonElement>('agent-task-close').addEventListener('click', () => dialog.close());
  required<HTMLButtonElement>('agent-log-close').addEventListener('click', () => logDialog.close());
  required<HTMLButtonElement>('agent-task-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const roles = values.getAll('roles');
    const prompt = String(values.get('prompt') ?? '').trim();
    if (!roles.length || !prompt) { status.textContent = '请选择角色并写下任务。'; return; }
    status.textContent = '正在派发任务…';
    try {
      const task = await request<Task>(endpoint, '/tasks', {
        method: 'POST', body: JSON.stringify({ roles, prompt, targetBuilding: values.get('targetBuilding'), targetPath: values.get('targetPath') }),
      }, 'task');
      status.textContent = `已派发 ${task.id.slice(0, 8)}。`;
      form.reset();
      dialog.close();
      await refresh();
      startPolling();
    } catch (error) { status.textContent = error instanceof Error ? error.message : '任务派发失败。'; }
  });

  const refresh = async () => {
    try {
      tasks = (await request<Task[]>(endpoint, '/tasks', {}, 'tasks')).slice(0, 8);
      panelStatus.textContent = tasks.length ? `${tasks.filter((task) => task.state !== 'completed').length} 个任务进行中` : '等待任务';
      renderRoleCards(roleCards, tasks);
      renderTaskList(list, tasks, async (taskId, action) => {
        await request<Task>(endpoint, `/tasks/${taskId}/${action}`, { method: 'POST' }, 'task');
        await refresh();
        if (action === 'resume') startPolling();
      }, async (taskId) => {
        const result = await request<string>(endpoint, `/tasks/${taskId}/log`, {}, 'content');
        logContent.textContent = result;
        logDialog.showModal();
      });
      if (!tasks.some((task) => !['completed', 'cancelled'].includes(task.state))) stopPolling();
    } catch {
      panelStatus.textContent = '服务未连接';
      roleCards.forEach((card) => { card.state.textContent = '服务未连接'; card.activity.textContent = '启动本地 Agent 服务后重试。'; });
    }
  };

  const startPolling = () => {
    if (refreshTimer !== undefined) return;
    refreshTimer = window.setInterval(() => void refresh(), 1_500);
  };
  const stopPolling = () => {
    if (refreshTimer === undefined) return;
    window.clearInterval(refreshTimer);
    refreshTimer = undefined;
  };

  const tick = (time: number) => {
    requestAnimationFrame(tick);
    const delta = Math.min((time - lastTime) / 1_000, 0.05);
    lastTime = time;
    for (const [role, visual] of agents) {
      const task = tasks.find((candidate) => candidate.roles.includes(role) && !['completed', 'cancelled'].includes(candidate.state));
      const target = task && !['returning', 'paused'].includes(task.state)
        ? buildingPositions.get(task.targetBuilding) ?? plaza
        : plaza.clone().add(role === 'deepseek' ? new THREE.Vector3(2.4, 0, -1.2) : new THREE.Vector3(-2.4, 0, 1.2));
      const direction = target.clone().sub(visual.rig.root.position); direction.y = 0;
      const moving = direction.length() > 0.22;
      if (moving) {
        direction.normalize();
        visual.rig.root.position.addScaledVector(direction, delta * 5.4);
        visual.rig.root.rotation.y = dampAngle(visual.rig.root.rotation.y, Math.atan2(direction.x, direction.z), delta);
      }
      visual.rig.animate(time / 1_000, moving ? 0.85 : 0);
    }
    const shared = tasks.find((task) => task.roles.length === 2 && !['completed', 'cancelled', 'paused'].includes(task.state));
    const deepseek = agents.get('deepseek')!;
    const niu = agents.get('niu')!;
    if (shared && deepseek.rig.root.position.distanceTo(niu.rig.root.position) < 4 && encounterTaskId !== shared.id) {
      encounterTaskId = shared.id;
      void request(endpoint, `/tasks/${shared.id}/encounter`, { method: 'POST' }, 'task').catch(() => undefined);
    }
    if (!shared || deepseek.rig.root.position.distanceTo(niu.rig.root.position) >= 4) encounterTaskId = '';
  };
  requestAnimationFrame(tick);
}

interface AgentVisual { role: Role; rig: CharacterRig; }

function createAgent(role: Role, rig: CharacterRig, position: THREE.Vector3): AgentVisual {
  rig.root.scale.setScalar(1.15);
  rig.root.position.copy(position);
  return { role, rig };
}

function buildingPosition(buildings: BuildingDef[], id: string): THREE.Vector3 | undefined {
  const building = buildings.find((candidate) => candidate.id === id);
  return building ? new THREE.Vector3(...building.position) : undefined;
}

function renderTaskList(container: HTMLElement, tasks: Task[], control: (taskId: string, action: 'pause' | 'resume' | 'cancel') => Promise<void>, showLog: (taskId: string) => Promise<void>): void {
  container.replaceChildren();
  if (!tasks.length) { container.textContent = '还没有任务。'; return; }
  tasks.forEach((task) => {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = `${task.roles.map((role) => role === 'deepseek' ? 'DeepSeek' : '牛来的牛').join(' + ')} · ${labelFor(task.state)}`;
    const copy = document.createElement('span');
    copy.textContent = task.error || task.summary || task.prompt;
    const actions = document.createElement('div');
    actions.className = 'agent-task-list__actions';
    const action = task.state === 'paused' ? 'resume' : 'pause';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = action === 'resume' ? '继续' : '暂停';
    toggle.disabled = ['completed', 'cancelled'].includes(task.state);
    toggle.addEventListener('click', () => void control(task.id, action));
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';
    cancel.disabled = ['completed', 'cancelled'].includes(task.state);
    cancel.addEventListener('click', () => void control(task.id, 'cancel'));
    const details = document.createElement('button');
    details.type = 'button';
    details.textContent = '工作记录';
    details.addEventListener('click', () => void showLog(task.id));
    actions.append(toggle, cancel, details);
    item.append(title, copy, actions);
    container.append(item);
  });
}

function renderRoleCards(cards: Map<Role, { state: HTMLElement; activity: HTMLElement }>, tasks: Task[]): void {
  for (const role of ['deepseek', 'niu'] as const) {
    const card = cards.get(role)!;
    const task = tasks.find((candidate) => candidate.roles.includes(role));
    if (!task) { card.state.textContent = '等待任务'; card.activity.textContent = '本地巡游，不请求 Agent API。'; continue; }
    card.state.textContent = labelFor(task.state);
    const target = task.targetBuilding ? `目标：${task.targetBuilding}` : '角色广场';
    card.activity.textContent = task.error || task.summary || `${target} · ${task.prompt}`;
  }
}

async function request<T>(endpoint: string, path: string, options: RequestInit, key: 'task' | 'tasks' | 'content'): Promise<T> {
  const response = await fetch(`${endpoint}${path}`, { headers: { 'content-type': 'application/json' }, ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '本地 Agent 服务请求失败。');
  return body[key];
}

function labelFor(state: string): string {
  return ({ queued: '排队', walking_to_building: '前往建筑', reading: '阅读中', editing: '编辑中', verifying: '验证中', returning: '返回广场', completed: '已完成', paused: '已暂停', cancelled: '已取消' } as Record<string, string>)[state] ?? state;
}
function required<T extends HTMLElement>(id: string): T { const node = document.getElementById(id); if (!node) throw new Error(`Missing #${id}`); return node as T; }
function dampAngle(current: number, target: number, delta: number): number { const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current)); return current + difference * (1 - Math.exp(-10 * delta)); }

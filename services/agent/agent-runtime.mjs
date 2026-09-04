import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, mkdir, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', '.next', '.cache']);
const TEXT_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.css', '.html', '.csv']);
const MAX_FILE_BYTES = 180_000;
const MAX_CONTEXT_BYTES = 240_000;
const MAX_FILES = 48;
const CONVERSATION_COOLDOWN_MS = 120_000;
const MAX_CONVERSATION_TURNS = 10;

export class AgentRuntime {
  constructor({ root, modelClient = createDeepSeekClient(), now = () => Date.now(), sleep = delay }) {
    this.root = resolve(root);
    this.modelClient = modelClient;
    this.now = now;
    this.sleep = sleep;
    this.tasks = new Map();
    this.listeners = new Set();
    this.lastConversationAt = 0;
  }

  async initialize() {
    this.root = await realpath(this.root);
    await mkdir(this.memoryDir, { recursive: true });
    await mkdir(this.tasksDir, { recursive: true });
    for (const role of ['deepseek', 'niu']) {
      const path = this.memoryPath(role);
      try { await stat(path); } catch { await writeFile(path, `# ${role === 'deepseek' ? 'DeepSeek' : '牛来的牛'} 记忆\n`, 'utf8'); }
    }
    try { this.lastConversationAt = Number((await readFile(this.conversationPath, 'utf8')).match(/last-conversation-at: (\d+)/)?.[1] ?? 0); } catch { await writeFile(this.conversationPath, '# 角色对话\n', 'utf8'); }
    await this.loadTasks();
  }

  get memoryDir() { return resolve(this.root, 'agents', 'memory'); }
  get tasksDir() { return resolve(this.root, 'agents', 'tasks'); }
  get conversationPath() { return resolve(this.memoryDir, 'conversations.md'); }
  memoryPath(role) { return resolve(this.memoryDir, `${role}.md`); }

  snapshot() {
    return [...this.tasks.values()].map((task) => publicTask(task));
  }

  async taskLog(id) {
    if (!this.tasks.has(id)) throw new Error('未找到任务。');
    return readFile(resolve(this.tasksDir, `${id}.md`), 'utf8');
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async createTask(input) {
    const roles = normalizeRoles(input.roles);
    const prompt = String(input.prompt ?? '').trim();
    if (!prompt || prompt.length > 4_000) throw new Error('任务描述不能为空且不得超过 4000 字。');
    const targetPath = input.targetPath ? await this.toRelativePath(input.targetPath, { allowMissing: false }) : '';
    const task = {
      id: randomUUID(), prompt, roles, targetBuilding: sanitizeToken(input.targetBuilding) || 'characters', targetPath,
      state: 'queued', createdAt: this.now(), updatedAt: this.now(), phases: [], summary: '', error: '', paused: false,
      conversationTurns: 0,
    };
    this.tasks.set(task.id, task);
    await this.persistTask(task, '任务已创建，角色将在城市中前往目标建筑。');
    this.emit('task-created', publicTask(task));
    void this.run(task.id);
    return publicTask(task);
  }

  async controlTask(id, action) {
    const task = this.tasks.get(id);
    if (!task) throw new Error('未找到任务。');
    if (action === 'pause') {
      task.paused = true; task.state = 'paused';
      await this.persistTask(task, '用户暂停任务。');
    } else if (action === 'resume') {
      task.paused = false; task.state = 'queued';
      await this.persistTask(task, '用户恢复任务。'); void this.run(task.id);
    } else if (action === 'cancel') {
      task.paused = true; task.state = 'cancelled';
      await this.persistTask(task, '用户取消任务。');
    } else throw new Error('不支持的任务操作。');
    this.emit('task-updated', publicTask(task));
    return publicTask(task);
  }

  async run(id) {
    const task = this.tasks.get(id);
    if (!task || task.paused || task.state === 'completed' || task.state === 'cancelled') return;
    try {
      await this.transition(task, 'walking_to_building', '角色正前往目标建筑。');
      await this.sleep(650);
      if (task.paused) return;
      await this.transition(task, 'reading', 'DeepSeek 正在读取受限项目上下文。');
      const context = await this.readContext(task.targetPath);
      const summary = await this.modelClient.summarize({ prompt: task.prompt, context, task });
      task.summary = trim(summary, 12_000);
      await this.appendMemory('deepseek', task, `阅读结论：\n${task.summary}`);
      await this.persistTask(task, `DeepSeek 阅读结论：\n${task.summary}`);
      if (task.roles.includes('niu')) {
        await this.transition(task, 'editing', '牛来的牛正在执行允许的写入或搬运。');
        const plan = await this.modelClient.planEdits({ prompt: task.prompt, context, summary: task.summary, task });
        const edits = await this.applyPlan(plan, task);
        await this.appendMemory('niu', task, `完成 ${edits.length} 项写入或搬运：\n${edits.map((item) => `- ${item}`).join('\n') || '- 无需文件变更'}`);
        await this.persistTask(task, `牛来的牛完成：\n${edits.map((item) => `- ${item}`).join('\n') || '- 无需文件变更'}`);
      }
      await this.transition(task, 'verifying', '正在运行任务指定的验证。');
      const checks = await this.runVerification(task.plan);
      await this.persistTask(task, checks.length ? `验证结果：\n${checks.map((check) => `- ${check}`).join('\n')}` : '任务没有要求可执行验证。');
      await this.transition(task, 'returning', '角色正返回角色广场。');
      await this.sleep(650);
      if (task.paused) return;
      await this.transition(task, 'completed', '任务完成，角色已返回角色广场。');
    } catch (error) {
      task.state = 'paused'; task.paused = true; task.error = error instanceof Error ? error.message : String(error);
      await this.persistTask(task, `任务暂停：${task.error}`);
      this.emit('task-updated', publicTask(task));
    }
  }

  async maybeConverse(task) {
    if (this.now() - this.lastConversationAt < CONVERSATION_COOLDOWN_MS) {
      await this.persistTask(task, '角色相遇，但对话仍在两分钟冷却期内。');
      return;
    }
    const turns = await this.modelClient.converse({ prompt: task.prompt, summary: task.summary, maxTurns: MAX_CONVERSATION_TURNS });
    const normalized = Array.isArray(turns) ? turns.slice(0, MAX_CONVERSATION_TURNS).map((turn) => ({
      role: turn?.role === 'niu' ? 'niu' : 'deepseek', content: trim(String(turn?.content ?? ''), 2_000),
    })).filter((turn) => turn.content) : [];
    if (!normalized.length) return;
    this.lastConversationAt = this.now(); task.conversationTurns = normalized.length;
    const log = normalized.map((turn) => `- ${turn.role === 'niu' ? '牛来的牛' : 'DeepSeek'}：${turn.content}`).join('\n');
    await this.persistTask(task, `角色相遇对话（${normalized.length} 轮）：\n${log}`);
    await this.appendMemory('deepseek', task, `角色对话：\n${log}`);
    await this.appendMemory('niu', task, `角色对话：\n${log}`);
    await writeFile(this.conversationPath, `# 角色对话\n\n<!-- last-conversation-at: ${this.lastConversationAt} -->\n\n## ${new Date(this.lastConversationAt).toISOString()} · ${task.id}\n\n${log}\n`, 'utf8');
    this.emit('conversation', { taskId: task.id, turns: normalized });
  }

  async encounter(id) {
    const task = this.tasks.get(id);
    if (!task || task.paused || task.roles.length !== 2 || ['completed', 'cancelled'].includes(task.state)) return { started: false };
    await this.maybeConverse(task);
    return { started: task.conversationTurns > 0 };
  }

  async applyPlan(plan, task) {
    task.plan = plan;
    const operations = Array.isArray(plan?.operations) ? plan.operations.slice(0, 12) : [];
    const results = [];
    for (const operation of operations) {
      if (operation?.type === 'write') {
        const path = await this.toRelativePath(operation.path, { allowMissing: true });
        const content = String(operation.content ?? '');
        if (!content || Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error(`拒绝写入 ${path}：内容为空或过大。`);
        await mkdir(dirname(resolve(this.root, path)), { recursive: true });
        await writeFile(resolve(this.root, path), content, 'utf8');
        results.push(`写入 ${path}`);
      } else if (operation?.type === 'copy') {
        const source = await this.toRelativePath(operation.source, { allowMissing: false });
        const target = await this.toRelativePath(operation.target, { allowMissing: true });
        const content = await readFile(resolve(this.root, source), 'utf8');
        await mkdir(dirname(resolve(this.root, target)), { recursive: true });
        await writeFile(resolve(this.root, target), content, 'utf8');
        results.push(`复制 ${source} 至 ${target}（保留源文件）`);
      } else if (operation?.type === 'move' || operation?.type === 'delete') {
        throw new Error('角色禁止删除文件；搬运会以保留源文件的复制方式执行。');
      }
    }
    return results;
  }

  async runVerification(plan) {
    const commands = Array.isArray(plan?.verification) ? plan.verification.slice(0, 3) : [];
    const results = [];
    for (const command of commands) {
      const allowed = verificationCommand(command);
      if (!allowed) throw new Error(`拒绝未授权的验证命令：${String(command)}`);
      const result = await run(this.root, allowed.command, allowed.args);
      results.push(`${allowed.label}：${result.code === 0 ? '通过' : `失败（退出码 ${result.code}）`}\n${trim(result.output, 3_000)}`);
      if (result.code !== 0) throw new Error(`验证失败：${allowed.label}`);
    }
    return results;
  }

  async readContext(targetPath) {
    const paths = targetPath ? [targetPath] : await this.listReadableFiles();
    let remaining = MAX_CONTEXT_BYTES;
    const chunks = [];
    for (const path of paths) {
      if (remaining <= 0) break;
      const content = await readFile(resolve(this.root, path), 'utf8');
      const snippet = content.slice(0, Math.min(content.length, remaining));
      chunks.push(`## ${path}\n${snippet}`);
      remaining -= Buffer.byteLength(snippet);
    }
    return chunks.join('\n\n');
  }

  async listReadableFiles() {
    const result = [];
    const visit = async (directory) => {
      if (result.length >= MAX_FILES) return;
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (result.length >= MAX_FILES) return;
        if (entry.isDirectory()) {
          if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(resolve(directory, entry.name));
          continue;
        }
        const path = resolve(directory, entry.name);
        if (!TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
        const info = await stat(path);
        if (info.size <= MAX_FILE_BYTES) result.push(relative(this.root, path));
      }
    };
    await visit(this.root);
    return result;
  }

  async toRelativePath(value, { allowMissing }) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('缺少有效文件路径。');
    const candidate = resolve(this.root, value);
    if (!isInside(this.root, candidate)) throw new Error('拒绝访问项目目录之外的路径。');
    const path = relative(this.root, candidate);
    if (path.split(sep).some((segment) => IGNORED_DIRECTORIES.has(segment))) throw new Error('拒绝访问受保护目录。');
    if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) throw new Error('仅允许文本或 Markdown 文件。');
    try {
      const resolved = await realpath(candidate);
      if (!isInside(this.root, resolved)) throw new Error('拒绝通过符号链接访问项目外路径。');
    } catch (error) {
      if (!allowMissing) throw error;
      const parent = await existingParent(candidate);
      if (!isInside(this.root, parent)) throw new Error('拒绝通过符号链接写入项目外路径。');
    }
    return path.split(sep).join('/');
  }

  async transition(task, state, message) {
    task.state = state; task.updatedAt = this.now();
    await this.persistTask(task, message);
    this.emit('task-updated', publicTask(task));
  }

  async appendMemory(role, task, text) {
    const path = this.memoryPath(role);
    const existing = await readFile(path, 'utf8');
    const entry = `\n## ${new Date(this.now()).toISOString()} · ${task.id}\n\n任务：${task.prompt}\n\n${text}\n`;
    await writeFile(path, `${existing}${entry}`, 'utf8');
  }

  async persistTask(task, entry) {
    task.updatedAt = this.now(); task.phases.push({ at: task.updatedAt, state: task.state, entry });
    const header = [
      `# 任务 ${task.id}`,
      '',
      `- 状态：${task.state}`,
      `- 角色：${task.roles.join(', ')}`,
      `- 建筑：${task.targetBuilding}`,
      `- 路径：${task.targetPath || '整个项目（受限文本文件）'}`,
      `- 创建：${new Date(task.createdAt).toISOString()}`,
      `- 更新：${new Date(task.updatedAt).toISOString()}`,
      '',
      '## 指令', '', task.prompt, '', '## 工作记录', '',
    ];
    const log = task.phases.map((phase) => `### ${new Date(phase.at).toISOString()} · ${phase.state}\n\n${phase.entry}\n`).join('\n');
    await writeFile(resolve(this.tasksDir, `${task.id}.md`), `${header.join('\n')}${log}`, 'utf8');
  }

  async loadTasks() {
    const entries = await readdir(this.tasksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const content = await readFile(resolve(this.tasksDir, entry.name), 'utf8');
      const id = entry.name.slice(0, -3);
      const state = content.match(/- 状态：(.+)/)?.[1]?.trim();
      const prompt = content.match(/## 指令\n\n([\s\S]*?)\n\n## 工作记录/)?.[1]?.trim();
      if (!state || !prompt) continue;
      this.tasks.set(id, { id, prompt, roles: ['deepseek'], targetBuilding: 'characters', targetPath: '', state, createdAt: this.now(), updatedAt: this.now(), phases: [], summary: '', error: '', paused: state === 'paused', conversationTurns: 0 });
    }
  }

  emit(type, payload) { this.listeners.forEach((listener) => listener({ type, payload })); }
}

export function createDeepSeekClient({ apiKey = process.env.DEEPSEEK_API_KEY, baseUrl = process.env.DEEPSEEK_BASE_URL ?? '', model = process.env.DEEPSEEK_MODEL ?? '', fetchImpl = fetch } = {}) {
  const request = async (messages) => {
    if (!apiKey || !baseUrl || !model) throw new Error('请设置 DEEPSEEK_API_KEY、DEEPSEEK_BASE_URL 和 DEEPSEEK_MODEL。');
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages, temperature: 0.2 }) });
    if (!response.ok) throw new Error(`DeepSeek 请求失败：HTTP ${response.status}`);
    const json = await response.json();
    return String(json?.choices?.[0]?.message?.content ?? '');
  };
  return {
    summarize: async ({ prompt, context }) => request([{ role: 'system', content: '你是只读研究角色。只给出可审计的简短摘要、涉及文件和下一步建议；不要泄露密钥，不要输出隐藏推理。' }, { role: 'user', content: `任务：${prompt}\n\n项目文本：\n${context}` }]),
    planEdits: async ({ prompt, context, summary }) => {
      const raw = await request([{ role: 'system', content: '你为本地编辑角色制定受限计划。只返回 JSON：{"operations":[{"type":"write","path":"相对路径","content":"完整内容"}|{"type":"copy","source":"相对路径","target":"相对路径"}],"verification":["npm run build"|"npm test"|"npm run test:agents"|"npm run test:collab"]}。verification 只在任务确实需要时给出。禁止 delete 或 move，禁止项目外路径。' }, { role: 'user', content: `任务：${prompt}\n摘要：${summary}\n文本：\n${context}` }]);
      return parseJson(raw);
    },
    converse: async ({ prompt, summary, maxTurns }) => {
      const raw = await request([{ role: 'system', content: `两个角色相遇并交接工作。只返回 JSON 数组，每项为 {"role":"deepseek"|"niu","content":"简短可审计消息"}，最多 ${maxTurns} 项。` }, { role: 'user', content: `任务：${prompt}\n结论：${summary}` }]);
      return parseJson(raw);
    },
  };
}

function normalizeRoles(value) {
  const roles = Array.isArray(value) ? value : [value];
  const normalized = [...new Set(roles.filter((role) => role === 'deepseek' || role === 'niu'))];
  if (!normalized.length) throw new Error('请选择至少一个角色。');
  return normalized;
}

function isInside(root, path) { return path === root || path.startsWith(`${root}${sep}`); }
function sanitizeToken(value) { return typeof value === 'string' && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : ''; }
function trim(value, max) { return value.length > max ? `${value.slice(0, max)}…` : value; }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function parseJson(value) { try { return JSON.parse(String(value).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new Error('DeepSeek 返回的任务格式无效，已暂停等待重试。'); } }
function publicTask(task) { return { id: task.id, prompt: task.prompt, roles: task.roles, targetBuilding: task.targetBuilding, targetPath: task.targetPath, state: task.state, createdAt: task.createdAt, updatedAt: task.updatedAt, summary: task.summary, error: task.error, conversationTurns: task.conversationTurns }; }

async function existingParent(path) {
  let current = dirname(path);
  while (current !== dirname(current)) {
    try { return await realpath(current); } catch { current = dirname(current); }
  }
  return realpath(current);
}

function verificationCommand(value) {
  const commands = {
    'npm run build': { command: 'npm', args: ['run', 'build'], label: 'npm run build' },
    'npm test': { command: 'npm', args: ['test'], label: 'npm test' },
    'npm run test:agents': { command: 'npm', args: ['run', 'test:agents'], label: 'npm run test:agents' },
    'npm run test:collab': { command: 'npm', args: ['run', 'test:collab'], label: 'npm run test:collab' },
  };
  return typeof value === 'string' ? commands[value] : undefined;
}

function run(cwd, command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, shell: false });
    let output = '';
    child.stdout.on('data', (chunk) => { output = trim(`${output}${chunk}`, 8_000); });
    child.stderr.on('data', (chunk) => { output = trim(`${output}${chunk}`, 8_000); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

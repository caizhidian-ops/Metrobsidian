import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AgentRuntime } from './agent-runtime.mjs';

const client = {
  summarize: async () => '已阅读 README，建议补充摘要。',
  planEdits: async () => ({ operations: [{ type: 'write', path: 'notes/result.md', content: '# 结果\n' }, { type: 'copy', source: 'README.md', target: 'notes/README-copy.md' }] }),
  converse: async () => [{ role: 'deepseek', content: '我已总结。' }, { role: 'niu', content: '我会写入结果。' }],
};

async function runtime() {
  const root = await mkdtemp(join(tmpdir(), 'city-agent-'));
  await writeFile(join(root, 'README.md'), '# Source\n', 'utf8');
  const value = new AgentRuntime({ root, modelClient: client, sleep: async () => undefined, now: (() => { let time = 1_700_000_000_000; return () => ++time; })() });
  await value.initialize();
  return { root, value };
}

test('runs a two-role task, persists Markdown memory, and retains copy sources', async () => {
  const { root, value } = await runtime();
  const task = await value.createTask({ roles: ['deepseek', 'niu'], prompt: '总结并整理 README', targetPath: 'README.md', targetBuilding: 'company' });
  await waitFor(() => value.snapshot().find((item) => item.id === task.id)?.state === 'completed');
  assert.match(await readFile(join(root, 'agents', 'memory', 'deepseek.md'), 'utf8'), /阅读结论/);
  assert.match(await readFile(join(root, 'agents', 'memory', 'niu.md'), 'utf8'), /写入 notes\/result.md/);
  assert.equal(await readFile(join(root, 'README.md'), 'utf8'), '# Source\n');
  assert.equal(await readFile(join(root, 'notes', 'README-copy.md'), 'utf8'), '# Source\n');
  assert.match(await readFile(join(root, 'agents', 'tasks', `${task.id}.md`), 'utf8'), /任务完成/);
});

test('rejects project escapes, protected directories, and delete operations', async () => {
  const { value } = await runtime();
  await assert.rejects(value.createTask({ roles: ['deepseek'], prompt: '读取', targetPath: '../outside.md' }), /项目目录之外/);
  await assert.rejects(value.toRelativePath('.git/config', { allowMissing: false }), /受保护目录/);
  await assert.rejects(value.applyPlan({ operations: [{ type: 'delete', path: 'README.md' }] }, {}), /禁止删除/);
});

async function waitFor(predicate, timeout = 1_500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('task timeout');
}

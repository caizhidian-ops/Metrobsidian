import { generationApiUrl } from './apiBase';

/**
 * 图生 3D 调用（经本地代理，密钥在服务端）
 *
 * 代理路由：
 *   POST /api/i2d/create  body {imageUrl}  → {taskid}
 *   GET  /api/i2d/poll?taskid=N            → {status, done, failed, glbUrl, error, pollIntervalMs}
 *
 * lux3D 是异步任务，需轮询直到 done=true 或 failed=true。
 */

export interface CreateTaskResult {
  taskid: number;
}

export interface PollResult {
  status: number | null;
  done: boolean;
  failed: boolean;
  glbUrl: string | null;
  error: string | null;
  pollIntervalMs: number;
}

export async function create3DTask(imageUrl: string): Promise<CreateTaskResult> {
  const response = await fetch(generationApiUrl('/i2d/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
  });
  if (!response.ok) {
    const detail = await safeJson(response);
    throw new Error(`创建 3D 任务失败 (${response.status}): ${detail?.error ?? response.statusText}`);
  }
  const data = await response.json() as CreateTaskResult & { error?: string };
  if (data.error) throw new Error(data.error);
  if (typeof data.taskid !== 'number') throw new Error('代理未返回 taskid');
  return { taskid: data.taskid };
}

export async function poll3DTask(taskid: number): Promise<PollResult> {
  const response = await fetch(generationApiUrl(`/i2d/poll?taskid=${encodeURIComponent(taskid)}`));
  if (!response.ok) {
    const detail = await safeJson(response);
    throw new Error(`查询 3D 任务失败 (${response.status}): ${detail?.error ?? response.statusText}`);
  }
  const data = await response.json() as PollResult & { error?: string };
  if (data.error && !data.failed) throw new Error(data.error);
  return {
    status: data.status ?? null,
    done: data.done === true,
    failed: data.failed === true,
    glbUrl: data.glbUrl ?? null,
    error: data.error ?? null,
    pollIntervalMs: data.pollIntervalMs ?? 12000,
  };
}

/** 轮询直到完成或失败，每次回调用于 UI 更新已耗时。 */
export async function pollUntilDone(
  taskid: number,
  intervalMs: number,
  onTick: (elapsedMs: number) => void,
): Promise<string> {
  const startedAt = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await poll3DTask(taskid);
    if (result.done && result.glbUrl) return result.glbUrl;
    if (result.failed) throw new Error(result.error ?? '3D 生成失败');
    onTick(Date.now() - startedAt);
    await sleep(intervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeJson(response: Response): Promise<{ error?: string; detail?: unknown } | null> {
  try {
    return (await response.json()) as { error?: string; detail?: unknown };
  } catch {
    return null;
  }
}

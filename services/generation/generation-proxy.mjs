/**
 * 生成代理服务（generation-proxy）
 *
 * 职责单一：把浏览器的生成请求转发到文生图 + lux3D，密钥留服务端。
 * 纯 Node 内置 http 模块，无新增依赖。
 *
 * 路由：
 *   POST /prompt/plan          {category,title,summary}    → {prompt, plannedBy}
 *   POST /t2i                  {prompt, stylePreset}      → {imageUrl, augmentedPrompt}
 *   POST /i2d/create           {imageUrl}                 → {taskid}
 *   GET  /i2d/poll?taskid=N                              → {status, done, glbUrl, error}
 *   GET  /health                                          → {ok: true}
 *
 * 启动：npm run service:generation
 * 默认端口 8788（可通过 GEN_PROXY_PORT 调整）。
 *
 * 密钥从 .env.local 读取，浏览器永远拿不到。
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createGenerationProvider } from './generation-provider.mjs';
import { isConfigured, luxResultFrom, luxTaskIdFrom } from './generation-contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '..', '.env.local');

// ---------- 加载 .env.local ----------
async function loadEnv() {
  let raw = '';
  try {
    raw = await readFile(envPath, 'utf8');
  } catch {
    console.warn(`[gen-proxy] 未读取 ${envPath}，将使用当前进程环境变量。`);
  }
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    env[key] = value;
  }
  return env;
}

const ENV = { ...await loadEnv(), ...process.env };

const T2I_BASE_URL = ENV.T2I_BASE_URL ?? '';
const T2I_API_KEY = ENV.T2I_API_KEY ?? '';
const T2I_MODEL = ENV.T2I_MODEL ?? '';
const T2I_ENDPOINT = ENV.T2I_ENDPOINT ?? '/images/generations';
const T2I_RESOLUTION = ENV.T2I_RESOLUTION ?? '2k';
const T2I_POLL_INTERVAL_MS = Number.parseInt(ENV.T2I_POLL_INTERVAL_MS ?? '3000', 10);
const T2I_MAX_POLL_MS = Number.parseInt(ENV.T2I_MAX_POLL_MS ?? '120000', 10);

const DEEPSEEK_BASE_URL = ENV.DEEPSEEK_BASE_URL ?? '';
const DEEPSEEK_API_KEY = ENV.DEEPSEEK_API_KEY ?? '';
const DEEPSEEK_MODEL = ENV.DEEPSEEK_MODEL ?? '';

const LUX3D_BASE_URL = ENV.LUX3D_BASE_URL ?? '';
const LUX3D_API_KEY = ENV.LUX3D_API_KEY ?? '';
const LUX3D_VERSION = ENV.LUX3D_VERSION ?? 'G1';
const LUX3D_FACE_COUNT = Number.parseInt(ENV.LUX3D_FACE_COUNT ?? '200000', 10);
const LUX3D_POLL_INTERVAL_MS = Number.parseInt(ENV.LUX3D_POLL_INTERVAL_MS ?? '12000', 10);

const HOST = ENV.GEN_PROXY_HOST ?? '127.0.0.1';
const PORT = Number.parseInt(ENV.GEN_PROXY_PORT ?? '8788', 10);
const ALLOWED_ORIGINS = new Set((ENV.GEN_PROXY_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean));
const MAX_REQUEST_BYTES = Number.parseInt(ENV.GEN_PROXY_MAX_REQUEST_BYTES ?? '1048576', 10);

const provider = createGenerationProvider({
  deepseekBaseUrl: DEEPSEEK_BASE_URL,
  deepseekApiKey: DEEPSEEK_API_KEY,
  deepseekModel: DEEPSEEK_MODEL,
  t2iBaseUrl: T2I_BASE_URL,
  t2iApiKey: T2I_API_KEY,
  t2iModel: T2I_MODEL,
  t2iResolution: T2I_RESOLUTION,
  t2iEndpoint: T2I_ENDPOINT,
  t2iPollIntervalMs: T2I_POLL_INTERVAL_MS,
  t2iMaxPollMs: T2I_MAX_POLL_MS,
});

// ---------- 通用 HTTP 转发 ----------
async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: response.ok, status: response.status, json };
}

async function getJson(url, headers) {
  const response = await fetch(url, { method: 'GET', headers });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: response.ok, status: response.status, json };
}

// ---------- 业务路由 ----------
async function handleTextToImage(req) {
  const { prompt, stylePreset = true } = req;
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return { status: 400, body: { error: 'prompt 必填' } };
  }
  if (![T2I_BASE_URL, T2I_API_KEY, T2I_MODEL].every(isConfigured)) {
    return { status: 503, body: { error: '文生图服务未配置：请设置 T2I_BASE_URL、T2I_API_KEY 和 T2I_MODEL' } };
  }
  try {
    const result = await provider.generateImage(prompt, stylePreset);
    return { status: 200, body: result };
  } catch (error) {
    return { status: 502, body: { error: String(error?.message ?? error) } };
  }
}

async function handlePromptPlan(req) {
  if (![DEEPSEEK_BASE_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL].every(isConfigured)) {
    return { status: 503, body: { error: '语言模型未配置：请设置 DEEPSEEK_BASE_URL、DEEPSEEK_API_KEY 和 DEEPSEEK_MODEL' } };
  }
  try {
    return { status: 200, body: await provider.planBuildingPrompt(req) };
  } catch (error) {
    return { status: 502, body: { error: String(error?.message ?? error) } };
  }
}

async function handleCreate3D(req) {
  const { imageUrl } = req;
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
    return { status: 400, body: { error: 'imageUrl 必须是 http(s) URL' } };
  }
  if (!isConfigured(LUX3D_BASE_URL) || !isConfigured(LUX3D_API_KEY)) {
    return { status: 503, body: { error: 'Lux3D 未配置：请设置 LUX3D_BASE_URL 和 LUX3D_API_KEY' } };
  }
  const { ok, status, json } = await postJson(
    `${LUX3D_BASE_URL}/generate/img-to-3d/task/create`,
    { Authorization: LUX3D_API_KEY }, // lux3D 不带 Bearer 前缀
    {
      img: imageUrl,
      version: LUX3D_VERSION,
      faceCount: LUX3D_FACE_COUNT,
      outputFormat: ['glb'],
      aiPredictSize: true,
    },
  );
  if (!ok) {
    return { status: 502, body: { error: `lux3D 创建任务失败 ${status}`, detail: json } };
  }
  const taskid = luxTaskIdFrom(json);
  if (taskid === null) {
    return { status: 502, body: { error: 'lux3D 未返回 taskid', detail: json } };
  }
  return { status: 200, body: { taskid, raw: json } };
}

async function handlePoll3D(taskid) {
  if (!taskid) return { status: 400, body: { error: 'taskid 必填' } };
  if (!isConfigured(LUX3D_BASE_URL) || !isConfigured(LUX3D_API_KEY)) {
    return { status: 503, body: { error: 'Lux3D 未配置：请设置 LUX3D_BASE_URL 和 LUX3D_API_KEY' } };
  }
  const { ok, status, json } = await getJson(
    `${LUX3D_BASE_URL}/generate/task/get?taskid=${encodeURIComponent(taskid)}`,
    { Authorization: LUX3D_API_KEY },
  );
  if (!ok) {
    return { status: 502, body: { error: `lux3D 查询失败 ${status}`, detail: json } };
  }
  const { status: taskStatus, done, failed, glbUrl } = luxResultFrom(json);
  const error = failed ? `任务${taskStatus === 4 ? '失败' : '已取消'}` : null;
  return {
    status: 200,
    body: { status: taskStatus, done, failed, glbUrl, error, pollIntervalMs: LUX3D_POLL_INTERVAL_MS, raw: json },
  };
}

// ---------- HTTP 服务器 ----------
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!ALLOWED_ORIGINS.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_REQUEST_BYTES) {
      const error = new Error('request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error('invalid JSON body');
    error.statusCode = 400;
    throw error;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (!applyCors(req, res)) { sendJson(res, 403, { error: 'origin not allowed' }); return; }
  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }

  try {
    if (path === '/health' && req.method === 'GET') {
      const configured = {
        languageModel: [DEEPSEEK_BASE_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL].every(isConfigured),
        imageGeneration: [T2I_BASE_URL, T2I_API_KEY, T2I_MODEL].every(isConfigured),
        imageTo3d: [LUX3D_BASE_URL, LUX3D_API_KEY].every(isConfigured),
      };
      sendJson(res, 200, { ok: true, configured });
      return;
    }
    if (path === '/prompt/plan' && req.method === 'POST') {
      const body = await readBody(req);
      const result = await handlePromptPlan(body);
      sendJson(res, result.status, result.body);
      return;
    }
    if (path === '/t2i' && req.method === 'POST') {
      const body = await readBody(req);
      const result = await handleTextToImage(body);
      sendJson(res, result.status, result.body);
      return;
    }
    if (path === '/i2d/create' && req.method === 'POST') {
      const body = await readBody(req);
      const result = await handleCreate3D(body);
      sendJson(res, result.status, result.body);
      return;
    }
    if (path === '/i2d/poll' && req.method === 'GET') {
      const taskid = url.searchParams.get('taskid');
      const result = await handlePoll3D(taskid);
      sendJson(res, result.status, result.body);
      return;
    }
    sendJson(res, 404, { error: `未知路由 ${req.method} ${path}` });
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    if (status >= 500) console.error('[gen-proxy] request failed:', error);
    sendJson(res, status, { error: String(error?.message ?? error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[gen-proxy] running at http://${HOST}:${PORT}`);
  console.log(`[gen-proxy] 文生图: ${T2I_BASE_URL}${T2I_ENDPOINT} (model=${T2I_MODEL})`);
  console.log(`[gen-proxy] 建筑指令: ${DEEPSEEK_BASE_URL} (model=${DEEPSEEK_MODEL})`);
  console.log(`[gen-proxy] 图生3D: ${LUX3D_BASE_URL} (version=${LUX3D_VERSION}, faceCount=${LUX3D_FACE_COUNT})`);
  if (!T2I_API_KEY) console.warn('[gen-proxy] ⚠️ T2I_API_KEY 未配置');
  if (!DEEPSEEK_API_KEY) console.warn('[gen-proxy] ⚠️ DEEPSEEK_API_KEY 未配置，建筑生成任务会在规划阶段停止');
  if (!LUX3D_API_KEY) console.warn('[gen-proxy] ⚠️ LUX3D_API_KEY 未配置');
});

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { AgentRuntime } from './agent-runtime.mjs';

const port = Number.parseInt(process.env.AGENT_PORT ?? '8790', 10);
const host = process.env.AGENT_HOST ?? '127.0.0.1';
const allowedOrigins = new Set(
  (process.env.AGENT_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const runtime = new AgentRuntime({ root: process.env.AGENT_ROOT ?? process.cwd() });
await runtime.initialize();

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) return send(response, 403, { error: 'origin not allowed' });
  if (origin) response.setHeader('access-control-allow-origin', origin);
  response.setHeader('vary', 'Origin');
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  if (request.method === 'OPTIONS') return response.writeHead(204).end();
  try {
    if (request.method === 'GET' && request.url === '/health') return send(response, 200, { ok: true });
    if (request.method === 'GET' && request.url === '/tasks') return send(response, 200, { tasks: runtime.snapshot() });
    const log = request.url?.match(/^\/tasks\/([\w-]+)\/log$/);
    if (request.method === 'GET' && log) return send(response, 200, { content: await runtime.taskLog(log[1]) });
    if (request.method === 'POST' && request.url === '/tasks') return send(response, 201, { task: await runtime.createTask(await body(request)) });
    const match = request.url?.match(/^\/tasks\/([\w-]+)\/(pause|resume|cancel)$/);
    if (request.method === 'POST' && match) return send(response, 200, { task: await runtime.controlTask(match[1], match[2]) });
    const encounter = request.url?.match(/^\/tasks\/([\w-]+)\/encounter$/);
    if (request.method === 'POST' && encounter) return send(response, 200, await runtime.encounter(encounter[1]));
    return send(response, 404, { error: 'not found' });
  } catch (error) {
    return send(response, 400, { error: error instanceof Error ? error.message : String(error) });
  }
});

const wss = new WebSocketServer({ server, path: '/events', maxPayload: 16_384 });
runtime.subscribe((event) => {
  const payload = JSON.stringify(event);
  wss.clients.forEach((socket) => {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  });
});

server.listen(port, host, () => console.log(`Local city agent server: http://${host}:${port}`));

function send(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function body(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 64_000) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

import { WebSocket, WebSocketServer } from 'ws';

const port = Number.parseInt(process.env.COLLAB_PORT ?? '8787', 10);
const host = process.env.COLLAB_HOST ?? '127.0.0.1';
const allowedOrigins = new Set(
  (process.env.COLLAB_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const clients = new Map();

const server = new WebSocketServer({
  host,
  port,
  maxPayload: 2_048,
  verifyClient: ({ origin }) => !origin || allowedOrigins.has(origin),
});

server.on('connection', (socket) => {
  clients.set(socket, { room: '', user: null, alive: true, lastPointerAt: 0 });
  socket.on('pong', () => {
    const state = clients.get(socket);
    if (state) state.alive = true;
  });
  socket.on('message', (buffer) => handleMessage(socket, buffer.toString()));
  socket.on('close', () => {
    const state = clients.get(socket);
    clients.delete(socket);
    if (state?.room) broadcastPresence(state.room);
  });
});

function handleMessage(socket, raw) {
  const state = clients.get(socket);
  if (!state) return;
  let message;
  try { message = JSON.parse(raw); } catch { return; }

  if (message?.type === 'join') {
    const room = validToken(message.room, 64);
    const id = validToken(message.user?.id, 64);
    const name = validName(message.user?.name);
    if (!room || !id || !name) return socket.close(1008, 'invalid join');
    state.room = room;
    state.user = { id, name };
    socket.send(JSON.stringify({ type: 'welcome', room, user: state.user }));
    broadcastPresence(room);
    return;
  }

  if (message?.type === 'pointer' && state.room && state.user) {
    const now = Date.now();
    if (now - state.lastPointerAt < 80 || !validPoint(message.point)) return;
    state.lastPointerAt = now;
    broadcast(state.room, { type: 'pointer', user: state.user, point: message.point, sentAt: now }, socket);
  }
}

function broadcastPresence(room) {
  const users = [...clients.values()]
    .filter((state) => state.room === room && state.user)
    .map((state) => state.user);
  broadcast(room, { type: 'presence', users });
}

function broadcast(room, message, except = null) {
  const payload = JSON.stringify(message);
  clients.forEach((state, socket) => {
    if (socket !== except && state.room === room && socket.readyState === WebSocket.OPEN) socket.send(payload);
  });
}

function validPoint(point) {
  return Array.isArray(point) && point.length === 3
    && point.every((value) => Number.isFinite(value) && Math.abs(value) < 10_000);
}

function validToken(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength && /^[a-zA-Z0-9_-]+$/.test(value) ? value : '';
}

function validName(value) {
  if (typeof value !== 'string') return '';
  const name = value.trim().slice(0, 32);
  return name && !/[<>]/.test(name) ? name : '';
}

const heartbeat = setInterval(() => {
  clients.forEach((state, socket) => {
    if (!state.alive) return socket.terminate();
    state.alive = false;
    socket.ping();
  });
}, 30_000);

server.on('close', () => clearInterval(heartbeat));
server.on('listening', () => console.log(`3D collaboration server: ws://${host}:${port}`));

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { WebSocket } from 'ws';

const port = 18_787;
const endpoint = `ws://127.0.0.1:${port}`;
const serverPath = fileURLToPath(new URL('./collaboration-server.mjs', import.meta.url));

test('isolates rooms and broadcasts presence plus pointer events', async (context) => {
  const server = spawn(process.execPath, [serverPath], {
    env: { ...process.env, COLLAB_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  context.after(() => server.kill());
  await waitForOutput(server.stdout, 'collaboration server');

  const alpha = await connect('alpha', 'room-one', '小林');
  const alphaPresencePromise = waitForMessage(alpha, (message) => message.type === 'presence' && message.users.length === 2);
  const beta = await connect('beta', 'room-one', '小周');
  const isolated = await connect('isolated', 'room-two', '隔离用户');
  context.after(() => [alpha, beta, isolated].forEach((socket) => socket.close()));

  const alphaPresence = await alphaPresencePromise;
  assert.deepEqual(alphaPresence.users.map((user) => user.name).sort(), ['小周', '小林']);

  const betaPointer = waitForMessage(beta, (message) => message.type === 'pointer');
  alpha.send(JSON.stringify({ type: 'pointer', point: [12.5, 3, -8] }));
  const pointer = await betaPointer;
  assert.deepEqual(pointer.point, [12.5, 3, -8]);
  assert.equal(pointer.user.name, '小林');

  await assert.rejects(waitForMessage(isolated, (message) => message.type === 'pointer', 180));
});

async function connect(id, room, name) {
  const socket = new WebSocket(endpoint);
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'join', room, user: { id, name } }));
  await waitForMessage(socket, (message) => message.type === 'welcome');
  return socket;
}

function waitForMessage(socket, predicate, timeout = 1_500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('message timeout'));
    }, timeout);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

function waitForOutput(stream, text) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 2_000);
    stream.on('data', (chunk) => {
      if (!chunk.toString().includes(text)) return;
      clearTimeout(timer);
      resolve();
    });
  });
}

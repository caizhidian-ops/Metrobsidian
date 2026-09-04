import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationProvider, imageUrlFrom } from './generation-provider.mjs';
import { isConfigured, luxResultFrom, luxTaskIdFrom } from './generation-contract.mjs';

const config = {
  deepseekBaseUrl: 'http://deepseek.test/v1', deepseekApiKey: 'test-only', deepseekModel: 'test-language-model',
  t2iBaseUrl: 'http://image.test/v1', t2iApiKey: 'test-only', t2iModel: 'test-image-model', t2iResolution: '2k',
  t2iEndpoint: '/images/generations', t2iPollIntervalMs: 1, t2iMaxPollMs: 100,
};

test('plans a building prompt with DeepSeek only when requested', async () => {
  const calls = [];
  const provider = createGenerationProvider(config, {
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return response({ choices: [{ message: { content: '温暖的家庭小楼，木质与白墙' } }] });
    },
  });
  const result = await provider.planBuildingPrompt({ category: '家庭', title: '生活记忆馆', summary: '日常生活文档' });
  assert.match(result.prompt, /家庭小楼/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://deepseek.test/v1/chat/completions');
});

test('submits Image-2 at 2k and polls the async task', async () => {
  const calls = [];
  const responses = [
    response({ id: 'task-image-1', status: 'queued' }),
    response({ id: 'task-image-1', status: 'completed', result: { data: [{ url: 'https://image.test/building.png' }] } }),
  ];
  const provider = createGenerationProvider(config, {
    fetchImpl: async (url, options) => { calls.push({ url, options }); return responses.shift(); },
    sleepImpl: async () => undefined,
  });
  const result = await provider.generateImage('建筑指令', false);
  const requestBody = JSON.parse(calls[0].options.body);
  assert.equal(requestBody.model, 'test-image-model');
  assert.equal(requestBody.resolution, '2k');
  assert.equal(calls[1].url, 'http://image.test/v1/images/generations/task-image-1');
  assert.equal(result.imageUrl, 'https://image.test/building.png');
});

test('extracts compatible immediate and async image payloads', () => {
  assert.equal(imageUrlFrom({ data: [{ url: 'a' }] }), 'a');
  assert.equal(imageUrlFrom({ result: { data: [{ url: 'b' }] } }), 'b');
});

test('rejects placeholder secrets and normalizes Lux3D response variants', () => {
  assert.equal(isConfigured('你的-ToAPIs-API-Key'), false);
  assert.equal(isConfigured('real-looking-key'), true);
  assert.equal(luxTaskIdFrom({ d: '12345' }), 12345);
  assert.equal(luxTaskIdFrom({ data: { taskId: 67890 } }), 67890);
  assert.deepEqual(
    luxResultFrom({ d: { status: '3', outputs: [{ content: 'https://cdn.test/model.zip' }, { url: 'https://cdn.test/model.glb?sig=1' }] } }),
    { status: 3, done: true, failed: false, glbUrl: 'https://cdn.test/model.glb?sig=1' },
  );
});

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

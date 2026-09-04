const DEFAULT_STYLE = [
  'front elevation of a single standalone building',
  'slightly cartoon-realistic architectural visualization',
  'beautiful proportions, warm material detail, clear doors and windows',
  'centered composition, clean light background, no people, no text, no watermark',
  'designed for reliable image-to-3D reconstruction',
].join(', ');

export function createGenerationProvider(config, { fetchImpl = fetch, sleepImpl = delay } = {}) {
  const auth = (key) => ({ Authorization: `Bearer ${key}` });

  async function planBuildingPrompt(input) {
    const fallback = `${DEFAULT_STYLE}, ${input.category || '新知识分类'}, ${input.title || '知识建筑'}, ${input.summary || ''}`.trim();
    if (!config.deepseekApiKey) return { prompt: fallback, plannedBy: 'fallback' };
    const response = await jsonRequest(
      `${trimSlash(config.deepseekBaseUrl)}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth(config.deepseekApiKey) },
        body: JSON.stringify({
          model: config.deepseekModel,
          temperature: 0.55,
          messages: [
            {
              role: 'system',
              content: '你是建筑视觉策划。输出一段可直接交给生图模型的中文提示词：单体建筑正面，略带卡通与写实结合，以好看和图生3D稳定为先。不要文字、人物、复杂背景或解释。',
            },
            {
              role: 'user',
              content: `分类：${input.category || '新知识'}\n建筑名：${input.title || '新建筑'}\n文件摘要：${input.summary || '无'}`,
            },
          ],
        }),
      },
      fetchImpl,
    );
    const prompt = response.json?.choices?.[0]?.message?.content?.trim();
    if (!response.ok || !prompt) throw new Error(`DeepSeek 建筑指令生成失败（HTTP ${response.status}）`);
    return { prompt: `${DEFAULT_STYLE}, ${prompt}`, plannedBy: config.deepseekModel };
  }

  async function generateImage(prompt, stylePreset = true) {
    const augmentedPrompt = stylePreset ? `${DEFAULT_STYLE}, ${prompt}` : prompt;
    const base = trimSlash(config.t2iBaseUrl);
    const endpoint = normalizePath(config.t2iEndpoint);
    const created = await jsonRequest(
      `${base}${endpoint}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth(config.t2iApiKey) },
        body: JSON.stringify({
          model: config.t2iModel,
          prompt: augmentedPrompt,
          n: 1,
          size: '1:1',
          resolution: config.t2iResolution,
          response_format: 'url',
        }),
      },
      fetchImpl,
    );
    if (!created.ok) {
      const detail = created.json?.error?.message ?? created.json?.error ?? created.json?.message ?? '';
      throw new Error(`文生图上游错误 ${created.status}${detail ? `：${detail}` : ''}`);
    }
    const immediate = imageUrlFrom(created.json);
    if (immediate) return { imageUrl: immediate, augmentedPrompt };
    const taskId = created.json?.id;
    if (!taskId) throw new Error('文生图未返回任务 ID 或图片 URL');

    const deadline = Date.now() + config.t2iMaxPollMs;
    while (Date.now() < deadline) {
      await sleepImpl(config.t2iPollIntervalMs);
      const polled = await jsonRequest(`${base}${endpoint}/${encodeURIComponent(taskId)}`, {
        method: 'GET', headers: auth(config.t2iApiKey),
      }, fetchImpl);
      if (!polled.ok) throw new Error(`查询文生图任务失败 ${polled.status}`);
      const imageUrl = imageUrlFrom(polled.json);
      if (polled.json?.status === 'completed' && imageUrl) return { imageUrl, augmentedPrompt };
      if (polled.json?.status === 'failed') {
        throw new Error(polled.json?.error?.message || '文生图任务失败');
      }
    }
    throw new Error('文生图任务超时');
  }

  return { planBuildingPrompt, generateImage };
}

export function imageUrlFrom(payload) {
  return payload?.result?.data?.[0]?.url
    ?? payload?.data?.[0]?.url
    ?? payload?.url
    ?? null;
}

async function jsonRequest(url, options, fetchImpl) {
  const response = await fetchImpl(url, options);
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: response.ok, status: response.status, json };
}

function trimSlash(value) { return String(value || '').replace(/\/$/, ''); }
function normalizePath(value) { const path = String(value || ''); return path.startsWith('/') ? path : `/${path}`; }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

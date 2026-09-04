import { generationApiUrl } from './apiBase';

/**
 * 文生图调用（经本地代理，密钥在服务端）
 *
 * 代理路由：POST /api/t2i  body {prompt, stylePreset}
 * 返回：{imageUrl, augmentedPrompt}
 */

export interface TextToImageResult {
  imageUrl: string;
  augmentedPrompt: string;
}

export async function textToImage(prompt: string, stylePreset: boolean): Promise<TextToImageResult> {
  const response = await fetch(generationApiUrl('/t2i'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, stylePreset }),
  });
  if (!response.ok) {
    const detail = await safeJson(response);
    throw new Error(`文生图失败 (${response.status}): ${detail?.error ?? response.statusText}`);
  }
  const data = await response.json() as TextToImageResult & { error?: string };
  if (data.error) throw new Error(data.error);
  if (!data.imageUrl) throw new Error('文生图未返回图片 URL');
  return { imageUrl: data.imageUrl, augmentedPrompt: data.augmentedPrompt ?? prompt };
}

async function safeJson(response: Response): Promise<{ error?: string; detail?: unknown } | null> {
  try {
    return (await response.json()) as { error?: string; detail?: unknown };
  } catch {
    return null;
  }
}

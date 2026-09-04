const configuredBase = import.meta.env.VITE_GENERATION_API ?? 'http://127.0.0.1:8788';

/**
 * 生成服务是独立本地进程。使用显式地址，避免在 Vite preview 或静态页面中
 * 把 /api/* 误发给前端服务器并得到 404。
 */
export function generationApiUrl(path: string): string {
  const base = configuredBase.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

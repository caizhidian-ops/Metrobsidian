export function isConfigured(value) {
  const normalized = String(value ?? '').trim();
  return Boolean(normalized) && !/^(your-|placeholder|\u4f60的-)/i.test(normalized);
}

export function luxTaskIdFrom(payload) {
  const raw = payload?.d?.taskid ?? payload?.d?.taskId ?? payload?.d ?? payload?.data?.taskid ?? payload?.data?.taskId;
  const numeric = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  return Number.isSafeInteger(numeric) ? numeric : null;
}

export function luxResultFrom(payload) {
  const data = payload?.d ?? payload?.data ?? {};
  const status = Number.isFinite(Number(data.status)) ? Number(data.status) : null;
  const outputs = Array.isArray(data.outputs) ? data.outputs : [];
  const urls = outputs.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (!entry || typeof entry !== 'object') return [];
    return [entry.content, entry.url].filter((value) => typeof value === 'string');
  });
  const glbUrl = urls.find((value) => /\.glb(?:\?|$)/i.test(value)) ?? null;
  return {
    status,
    done: status === 3,
    failed: status === 4 || status === 6,
    glbUrl,
  };
}

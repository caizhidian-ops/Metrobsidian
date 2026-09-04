/**
 * services/knowledge API 客户端。
 *
 * 知识从后端 API 加载（取代 import.meta.glob 构建期静态入口）。
 * 后端未启动或请求失败时，调用方回退到 config/knowledge 的静态演示数据。
 */
import type { KnowledgeDocument } from './config/knowledge';

const API_BASE = import.meta.env.VITE_KNOWLEDGE_API ?? 'http://127.0.0.1:8000';

export interface ApiPlacement {
  id: string;
  document_id: string;
  primary_building_id: string | null;
  secondary_building_ids: string[];
  confidence: number;
  margin: number;
  reason: string;
  state: 'proposed' | 'confirmed' | 'rejected' | 'needs_review';
}

export interface ApiDocument {
  id: string;
  title: string;
  summary: string;
  text: string;
  mime_type: string;
  placement?: ApiPlacement;
}

export interface UploadResult {
  document_id: string;
  title: string;
  mime_type: string;
  parse_status: 'ready' | 'unsupported' | 'failed' | 'needs_ocr';
  status: 'placed' | 'review' | 'duplicate';
  building_id: string | null;
  building_name: string | null;
  confidence: number;
  reason: string;
}

export interface UploadResponse {
  items: UploadResult[];
  total: number;
  placed: number;
  review: number;
}

export interface ApiBuilding {
  id: string;
  name: string;
  description: string;
  is_discovered: boolean;
  asset: string | null;
  position: [number, number, number] | null;
}

export interface GenesisJob {
  job_id: string;
  candidate_id: string;
  state: 'running' | 'ready' | 'failed' | 'cancelled';
  result: {
    building_id?: string;
    error?: string;
    phase?: string;
    prompt?: string;
    image_url?: string;
    asset?: string;
  };
}

export interface AutoMaterializeResponse {
  candidates: Array<{ candidate_id: string; proposed_name: string; state: string }>;
  jobs: GenesisJob[];
}

/** 拉取后端记录的建筑列表（含 AI 生成的 discovered 建筑 + asset/position）。失败返回 null。 */
export async function fetchBuildings(): Promise<ApiBuilding[] | null> {
  try {
    const data = await fetchJSON<{ items: ApiBuilding[] }>(`${API_BASE}/api/buildings`);
    return data.items;
  } catch {
    return null;
  }
}

function toKnowledgeDocument(doc: ApiDocument, buildingId: string): KnowledgeDocument {
  return {
    id: doc.id,
    buildingId,
    title: doc.title,
    summary: doc.summary,
    filename: doc.title,
    content: doc.text,
  };
}

/** 拉取所有建筑及其已确认的知识文档。失败返回 null（调用方回退静态数据）。 */
export async function fetchKnowledge(): Promise<KnowledgeDocument[] | null> {
  try {
    const buildings = await fetchJSON<{ items: { id: string }[] }>(`${API_BASE}/api/buildings`);
    const buildingIds = buildings.items.map((b) => b.id);

    const docs: KnowledgeDocument[] = [];
    for (const buildingId of buildingIds) {
      const res = await fetchJSON<{ items: ApiDocument[] }>(
        `${API_BASE}/api/buildings/${buildingId}/documents`,
      );
      for (const d of res.items) {
        // 已确认的文档才展示到建筑内（proposed/needs_review 走收件箱）
        const primary = d.placement?.primary_building_id ?? buildingId;
        docs.push(toKnowledgeDocument(d, primary));
      }
    }
    return docs;
  } catch {
    return null;
  }
}

/** 拉取待确认分类建议（归档收件箱）。失败返回 null。 */
export async function fetchInbox(): Promise<unknown | null> {
  try {
    return await fetchJSON(`${API_BASE}/api/placements/inbox`);
  } catch {
    return null;
  }
}

/** 拖放上传：任意格式均可归档；能提取正文的格式会参与完整语义分类。 */
export async function uploadFiles(files: File[]): Promise<UploadResponse> {
  const items: UploadResult[] = [];
  for (const file of files) {
    const resp = await fetch(`${API_BASE}/api/files/upload`, {
      method: 'POST',
      headers: {
        'X-File-Name': encodeURIComponent(file.name),
        'X-File-Type': file.type || 'application/octet-stream',
      },
      body: file,
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });
    if (!resp.ok) {
      const payload = await resp.json().catch(() => null) as { detail?: string } | null;
      throw new Error(payload?.detail ?? `${file.name} 上传失败（HTTP ${resp.status}）`);
    }
    items.push(await resp.json() as UploadResult);
  }
  return {
    items,
    total: items.length,
    placed: items.filter((item) => (item.status === 'placed' || item.status === 'duplicate') && item.building_id).length,
    review: items.filter((item) => item.status === 'review').length,
  };
}

/** 由本次上传明确触发：按关键词分类形成候选，并幂等发起建筑生成。 */
export async function autoMaterializeUploadedDocuments(idempotencyKey: string, documentIds: string[]): Promise<AutoMaterializeResponse> {
  const resp = await fetch(`${API_BASE}/api/building-genesis/auto-materialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotency_key: idempotencyKey, document_ids: documentIds }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const payload = await resp.json().catch(() => null) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `建筑生成启动失败（HTTP ${resp.status}）`);
  }
  return await resp.json() as AutoMaterializeResponse;
}

export async function fetchGenesisJob(jobId: string): Promise<GenesisJob> {
  return await fetchJSON<GenesisJob>(`${API_BASE}/api/building-genesis/jobs/${encodeURIComponent(jobId)}`);
}

async function fetchJSON<T>(url: string): Promise<T> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return (await resp.json()) as T;
}

/**
 * 持久化：localStorage 存建筑元数据 + IndexedDB 存 GLB 二进制。
 *
 * 刷新页面后建筑仍在，无需重新生成。
 * GLB 下载 URL 仅 2 小时有效，所以必须把二进制落盘到 IndexedDB。
 */

const META_KEY = 'memory-city:generated-buildings:v1';
const DB_NAME = 'memory-city';
const STORE_NAME = 'glb-cache';
const DB_VERSION = 1;

export interface GeneratedBuildingMeta {
  id: string;
  name: string;
  prompt: string;
  augmentedPrompt: string;
  plotIndex: number;
  createdAt: string;
}

export function loadMeta(): GeneratedBuildingMeta[] {
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is GeneratedBuildingMeta =>
      typeof item === 'object'
      && item !== null
      && typeof (item as GeneratedBuildingMeta).id === 'string'
      && typeof (item as GeneratedBuildingMeta).plotIndex === 'number',
    );
  } catch {
    return [];
  }
}

export function saveMeta(list: GeneratedBuildingMeta[]): void {
  localStorage.setItem(META_KEY, JSON.stringify(list));
}

export async function saveGlb(id: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(buffer, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function loadGlb(id: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  const result = await new Promise<ArrayBuffer | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result instanceof ArrayBuffer ? request.result : null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

export async function deleteGlb(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

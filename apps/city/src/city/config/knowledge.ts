import type { BuildingDef } from './buildings';
import { CATEGORY_PLOTS } from './world';

export interface KnowledgeDocument {
  id: string;
  buildingId: string;
  title: string;
  summary: string;
  filename: string;
  content: string;
}

export interface DocumentOverride {
  content: string;
  updatedAt: string;
}

const DOCUMENT_OVERRIDE_KEY = 'memory-city:document-overrides:v1';

/**
 * 知识库一级目录 → 3D 建筑映射（依据《content/demo-knowledge-base/建筑映射.md》）：
 * 公司=01_工作、家庭=04_生活、学校=02_学习、医院=06_复盘、食堂=08_创作、施工工地=07_灵感。
 * 未列出的目录（如 03_案例、05_健康）自动成为动态分类建筑。
 */
const BUILDING_BY_FOLDER: Record<string, string> = {
  '01_工作': 'company',
  '04_生活': 'home',
  '02_学习': 'school',
  '06_复盘': 'hospital',
  '08_创作': 'canteen',
  '07_灵感': 'construction',
};

const modules = import.meta.glob('../../../../../content/demo-knowledge-base/**/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const discoveredFolders = [...new Set(
  Object.keys(modules)
    .map((path) => {
      const parts = path.split('/');
      return parts[parts.length - 2] ?? '';
    })
    .filter((folder) => Boolean(folder) && folder !== 'demo-knowledge-base'),
)].sort((a, b) => a.localeCompare(b, 'zh-CN'));

const dynamicFolders = discoveredFolders
  .filter((folder) => !BUILDING_BY_FOLDER[folder])
  .slice(0, CATEGORY_PLOTS.length);

const dynamicPalette = [
  [0xded8cd, 0x5e7da8],
  [0xe8dfcf, 0x9a704f],
  [0xdce4d7, 0x628468],
  [0xe3d9d9, 0x9b6266],
] as const;

const BUILDING_NAME_BY_FOLDER: Record<string, string> = {
  '03_案例': '案例档案馆',
  '05_健康': '健康中心',
  '99_历史_建筑档案': '历史建筑档案馆',
};

export const DISCOVERED_CATEGORY_BUILDINGS: BuildingDef[] = dynamicFolders.map((folder, index) => {
  const id = `category-${stableHash(folder).toString(36)}`;
  const [x, z] = CATEGORY_PLOTS[index];
  const [color, accentColor] = dynamicPalette[index % dynamicPalette.length];
  BUILDING_BY_FOLDER[folder] = id;
  return {
    id,
    name: BUILDING_NAME_BY_FOLDER[folder] ?? folder,
    color,
    accentColor,
    width: 20,
    depth: 18,
    height: 15 + (index % 3) * 3,
    position: [x, 0, z],
    asset: '/assets/kenney-city/building-j.glb',
    tagline: '新分类 · 自动入驻',
    summary: `知识库发现“${BUILDING_NAME_BY_FOLDER[folder] ?? folder}”分区，已自动分配到生长地块。`,
  };
});

export const KNOWLEDGE_DOCUMENTS: KnowledgeDocument[] = Object.entries(modules)
  .flatMap(([path, content]) => {
    const parts = path.split('/');
    const filename = parts[parts.length - 1] ?? '';
    const folder = parts[parts.length - 2] ?? '';
    const buildingId = BUILDING_BY_FOLDER[folder];
    if (!buildingId) return [];

    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? filename.replace(/\.md$/, '');
    const summary = content
      .split(/\n\s*\n/)
      .map((block) => block.replace(/^#+\s+.*$/gm, '').replace(/^>\s?/gm, '').trim())
      .find((block) => block.length > 18)
      ?.replace(/[*_`]/g, '')
      .slice(0, 92) ?? '已收录的知识档案。';

    return [{
      id: `${buildingId}-${filename.replace(/\.md$/, '')}`,
      buildingId,
      title,
      summary,
      filename,
      content,
    }];
  })
  .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));

export function documentsFor(buildingId: string): KnowledgeDocument[] {
  return KNOWLEDGE_DOCUMENTS.filter((document) => document.buildingId === buildingId);
}

/**
 * 用 API 返回的知识替换运行时文档列表（原地清空 + 填充，保持 const 引用不变，
 * 使 hud.ts 等消费方无需改动）。API 无数据或失败时调用方不应调用本函数。
 */
export function hydrateKnowledge(documents: KnowledgeDocument[]): void {
  KNOWLEDGE_DOCUMENTS.splice(0, KNOWLEDGE_DOCUMENTS.length, ...documents);
}

export function documentOverrideFor(documentId: string): DocumentOverride | null {
  return readDocumentOverrides()[documentId] ?? null;
}

export function contentFor(knowledgeDocument: KnowledgeDocument): string {
  return documentOverrideFor(knowledgeDocument.id)?.content ?? knowledgeDocument.content;
}

export function saveDocumentOverride(documentId: string, content: string): DocumentOverride {
  const overrides = readDocumentOverrides();
  const override = { content, updatedAt: new Date().toISOString() };
  overrides[documentId] = override;
  localStorage.setItem(DOCUMENT_OVERRIDE_KEY, JSON.stringify(overrides));
  return override;
}

function readDocumentOverrides(): Record<string, DocumentOverride> {
  try {
    const value = JSON.parse(localStorage.getItem(DOCUMENT_OVERRIDE_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(value).flatMap(([id, candidate]) => {
        if (!candidate || typeof candidate !== 'object') return [];
        const content = Reflect.get(candidate, 'content');
        const updatedAt = Reflect.get(candidate, 'updatedAt');
        return typeof content === 'string' && typeof updatedAt === 'string'
          ? [[id, { content, updatedAt }]]
          : [];
      }),
    );
  } catch {
    return {};
  }
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function renderMarkdown(markdown: string): string {
  const escape = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const inline = (value: string) => escape(value)
    .replace(/\[([^\]]+)\]\(([^)]+\.md)\)/g, '<button class="document-link" type="button" data-document-file="$2">$1</button>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');

  const lines = markdown.split('\n');
  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) html.push(`</${listType}>`);
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 1, 4);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (line.startsWith('> ')) {
      closeList();
      html.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
      continue;
    }
    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${inline(unordered[1])}</li>`);
      continue;
    }
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${inline(ordered[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return html.join('');
}

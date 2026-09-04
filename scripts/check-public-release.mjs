import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const required = [
  'README.md', 'README.zh-CN.md', 'LICENSE', 'SECURITY.md',
  'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md', '.env.example',
  '.github/workflows/ci.yml', 'apps/city/package.json',
  'apps/office/package.json', 'services/knowledge/README.md',
];
const forbiddenPaths = [
  'PLAN.md', 'apps/city/.hallmark', 'apps/city/server',
  'apps/city/package-lock.json', 'apps/office/package-lock.json',
  'apps/office/public/ventured-logo.jpg', 'apps/office/public/ventured-poster.png',
];
const textExtensions = new Set(['.md', '.txt', '.py', '.ts', '.tsx', '.mjs', '.js', '.json', '.html', '.css', '.yml', '.yaml', '.example']);
const forbiddenPatterns = [
  [/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/, 'private key'],
  [/ghp_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/github_pat_[A-Za-z0-9_]{30,}/, 'GitHub fine-grained token'],
  [/sk-[A-Za-z0-9_-]{20,}/, 'API secret'],
  [/[A-Za-z]:[\\/](?:Users|Documents|SecondBrain)[\\/]/i, 'local absolute path'],
  [/\/Users\/[A-Za-z0-9._-]+\//, 'macOS home path'],
  [/xsec_token=/, 'share token'],
  [/[A-Z0-9._%+-]+@(?:gmail|qq|163|126|outlook|hotmail)\.[A-Z]{2,}/i, 'personal email'],
  [/(?:路|街)\s*\d{2,}\s*(?:号|弄)?/, 'precise address-like detail'],
  [/@[\u4e00-\u9fff]{2,4}(?![\u4e00-\u9fff])/, 'personal assignee-like mention'],
];

const failures = [];
for (const path of required) {
  if (!(await exists(resolve(root, path)))) failures.push(`missing required file: ${path}`);
}
for (const path of forbiddenPaths) {
  if (await exists(resolve(root, path))) failures.push(`forbidden path exists: ${path}`);
}

for (const file of await walk(root)) {
  const local = relative(root, file).replaceAll('\\', '/');
  if (local === 'scripts/check-public-release.mjs') continue;
  if (local.startsWith('.git/') || local.includes('/node_modules/') || local.includes('/dist/')) continue;
  const extension = extname(file).toLowerCase();
  if (!textExtensions.has(extension) && !file.endsWith('.env.example')) continue;
  const info = await stat(file);
  if (info.size > 2_000_000) continue;
  let content;
  try { content = await readFile(file, 'utf8'); } catch { continue; }
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(content)) failures.push(`${label}: ${local}`);
  }
}

if (failures.length) {
  console.error('Public release check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Public release check passed.');

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', 'dist'].includes(entry.name)) continue;
      result.push(...await walk(path));
    } else if (entry.isFile()) result.push(path);
  }
  return result;
}

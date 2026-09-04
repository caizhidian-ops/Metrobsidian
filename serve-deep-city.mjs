import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const cityRoot = resolve(projectRoot, 'apps', 'city', 'dist');
const officeRoot = resolve(projectRoot, 'apps', 'office', 'dist');
const host = process.env.DEEP_CITY_HOST ?? '127.0.0.1';
const port = Number(process.env.DEEP_CITY_PORT || 5190);
const officeRoutes = new Set(['/office.html', '/laboratory.html']);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function candidateRoots(pathname) {
  if (officeRoutes.has(pathname) || pathname.startsWith('/landing-pages/')) return [officeRoot];
  if (pathname.startsWith('/assets/gallery/')) return [officeRoot, cityRoot];
  if (pathname.startsWith('/assets/')) return [cityRoot, officeRoot];
  return [cityRoot, officeRoot];
}

function safePath(root, requested) {
  const filePath = resolve(root, requested);
  const local = relative(root, filePath);
  if (!local || (!local.startsWith('..') && !isAbsolute(local))) return filePath;
  return null;
}

createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  for (const root of candidateRoots(pathname)) {
    const filePath = safePath(root, requested);
    if (!filePath) continue;
    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(body);
      return;
    } catch {
      // Try the next build root.
    }
  }
  response.writeHead(404).end('Not found');
}).listen(port, host, () => {
  console.log(`Metrobsidian preview: http://${host}:${port}/`);
});

// Banc d'aperçu navigateur : sert le dépôt et injecte `cale.js` à la place du pont
// Electron (assets lus par fetch, sauvegarde en mémoire, pas de réseau). Sert à
// capturer menus et HUD avec un navigateur sans fenêtre, sans lancer l'exécutable.
//
//   node tools/apercu/banc.mjs [port]          puis  tools/apercu/capturer.sh
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, '../..');
const port = +(process.argv[2] || 8931);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

http.createServer(async (q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  try {
    if (u === '/' || u === '/apercu.html') {
      const cale = await readFile(path.join(ici, 'cale.js'), 'utf8');
      const html = (await readFile(path.join(racine, 'index.html'), 'utf8'))
        .replace('<script type="importmap">', `<script>${cale}</script>\n<script type="importmap">`);
      r.writeHead(200, { 'content-type': types['.html'], 'cache-control': 'no-store' });
      return r.end(html);
    }
    const f = path.join(racine, u);
    if (!f.startsWith(racine)) { r.writeHead(403); return r.end(); }
    const b = await readFile(f);
    r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    r.end(b);
  } catch { r.writeHead(404); r.end('404'); }
}).listen(port, '0.0.0.0', () => console.log('banc prêt sur le port', port));

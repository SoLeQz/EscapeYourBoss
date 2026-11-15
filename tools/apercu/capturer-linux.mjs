// Captures du banc d'aperçu avec le Chromium sans fenêtre de Playwright, sous Linux/WSL.
// Aucun processus Windows : voir la mémoire « apercu-captures-linux ».
//
//   node tools/apercu/banc.mjs 8931 &
//   LD_LIBRARY_PATH=<libs nss/nspr/asound> node tools/apercu/capturer-linux.mjs plan.json
//
// plan.json : { "url": "scenario=jeu&niveau=1", "largeur": 1600, "hauteur": 900,
//               "vues": [ { "sortie": "a.png", "js": "expression évaluée avant la capture" } ] }
// Dans `js`, `g` est le jeu ; `vue(x,y,z, cx,cy,cz, fov)` place une caméra libre et rend une image.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const cache = path.join(homedir(), '.cache/ms-playwright');
const shell = path.join(cache, readdirSync(cache).find(d => d.startsWith('chromium_headless_shell')), 'chrome-headless-shell-linux64/chrome-headless-shell');
const port = 9300 + (process.pid % 500);
const proc = spawn(shell, ['--headless', `--remote-debugging-port=${port}`, '--no-sandbox', '--hide-scrollbars', '--mute-audio',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'eyb-apercu-'))}`,
  `--window-size=${plan.largeur || 1600},${plan.hauteur || 900}`, 'about:blank'], { stdio: 'ignore' });
const dormir = ms => new Promise(r => setTimeout(r, ms));
try {
  let cible;
  for (let i = 0; i < 50 && !cible; i++) {
    await dormir(200);
    cible = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).then(l => l.find(p => p.type === 'page')).catch(() => null);
  }
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  let id = 0; const attente = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && attente.has(m.id)) { attente.get(m.id)(m); attente.delete(m.id); } };
  const cdp = (method, params = {}) => new Promise(r => { attente.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluer = async expression => {
    const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: `http://127.0.0.1:${plan.port || 8931}/apercu.html?${plan.url || ''}` });
  for (let i = 0; ; i++) {
    if (i > (plan.patience || 600)) throw new Error('le banc n’est jamais prêt : ' + await evaluer(
      `JSON.stringify([window.__erreurs, !!window.__game, document.getElementById('chargement')?.className, document.getElementById('chargement')?.textContent.trim().slice(0, 200)])`).catch(e => e.message));
    await dormir(500);
    if (await evaluer(`document.documentElement.dataset.apercu === 'pret'`).catch(() => false)) break;
  }
  await evaluer(`window.g = window.__game; window.vue = (x, y, z, cx, cy, cz, fov = 50) => {
    const c = g.camera; c.fov = fov; c.updateProjectionMatrix(); c.position.set(x, y, z); c.lookAt(cx, cy, cz);
    (g.post?.composer || { render: () => g.renderer.render(g.scene, c) }).render(); return c.position.toArray(); }; 1`);
  for (const v of plan.vues || [{ sortie: 'apercu.png' }]) {
    if (v.js) console.log(v.sortie, '→', JSON.stringify(await evaluer(v.js)));
    await dormir(v.attente ?? 400);
    const r = await cdp('Page.captureScreenshot', { format: v.sortie.endsWith('.jpg') ? 'jpeg' : 'png', quality: 88 });
    writeFileSync(v.sortie, Buffer.from(r.result.data, 'base64'));
  }
  const erreurs = await evaluer('JSON.stringify(window.__erreurs || [])');
  if (erreurs !== '[]') console.log('erreurs de page :', erreurs);
  ws.close();
} finally { proc.kill('SIGKILL'); }

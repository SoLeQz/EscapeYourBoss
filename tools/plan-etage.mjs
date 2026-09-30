// Plan d'un étage vu de dessus, en PNG : murs, vitrages, meubles, collègues (cônes
// de vision), rondes, départ, sorties, objets et canards. Outil de conception des
// niveaux, relu comme une planche Blender.
//
//   node --import ./tests/personnages/resolveur.mjs tools/plan-etage.mjs 7 plan-7.png
import '../tests/personnages/dom-bouchon.mjs';
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { NIVEAUX, PLANS, pnjDuNiveau } from '../src/levels.js';
import { buildLevel } from '../src/level.js';
import { buildMaterials } from '../src/materials.js';
import { ecrirePNG8 } from './blender/png.mjs';

const warn = console.warn; console.warn = (...a) => { if (!String(a[0]).includes('serialize Texture')) warn(...a); };
const [id, sortie] = process.argv.slice(2);
const niv = NIVEAUX.find(n => String(n.id) === id);
if (!niv) throw Error('Niveau inconnu : ' + id);
const level = buildLevel(new THREE.Scene(), buildMaterials(), PLANS[niv.plan], niv);

const E = 24, X0 = -22, Z0 = -18, W = 44 * E, H = 36 * E;
const rgb = new Float32Array(W * H * 3).fill(0.1);
const px = x => (x - X0) * E, pz = z => (z - Z0) * E;
const hex = c => [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255];
function point(x, y, c, a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (Math.floor(y) * W + Math.floor(x)) * 3;
  for (let k = 0; k < 3; k++) rgb[i + k] = rgb[i + k] * (1 - a) + c[k] * a;
}
function rect(x1, z1, x2, z2, c, a = 1) {
  for (let y = Math.floor(pz(z1)); y < Math.ceil(pz(z2)); y++) for (let x = Math.floor(px(x1)); x < Math.ceil(px(x2)); x++) point(x, y, c, a);
}
function disque(x, z, r, c, a = 1) {
  for (let y = pz(z - r); y < pz(z + r); y++) for (let xx = px(x - r); xx < px(x + r); xx++)
    if (Math.hypot(xx - px(x), y - pz(z)) < r * E) point(xx, y, c, a);
}
function ligne(a, b, c, e = 1) {
  const n = Math.ceil(Math.hypot(px(b.x) - px(a.x), pz(b.z) - pz(a.z)));
  for (let i = 0; i <= n; i++) { const t = i / Math.max(1, n); disque(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, e / E, c); }
}
function cone(x, z, yaw, fov, dist, c) {
  for (let y = pz(z - dist); y < pz(z + dist); y++) for (let xx = px(x - dist); xx < px(x + dist); xx++) {
    const dx = (xx - px(x)) / E, dz = (y - pz(z)) / E, d = Math.hypot(dx, dz);
    if (d > dist || d < .01) continue;
    const ang = Math.acos((dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d);
    if (ang < fov / 2) point(xx, y, c, 0.16 * (1 - d / dist) + 0.04);
  }
}

// grille de 1 m
for (let x = -21; x <= 21; x++) rect(x - .02, -17, x + .02, 17, [.16, .16, .18]);
for (let z = -17; z <= 17; z++) rect(-21, z - .02, 21, z + .02, [.16, .16, .18]);
for (const o of level.obstacles) {
  const c = o.kind === 'stores' ? hex(0xb08f5a) : o.seeThrough ? hex(0x5fb7d4) : o.h >= 2.5 ? hex(0xd8cdb8)
    : o.kind === 'desk' ? hex(0xc58b52) : o.kind === 'architecture' ? hex(0x6a6f78) : hex(0x8a9aa8);
  rect(o.x1, o.z1, o.x2, o.z2, c, o.noClip ? .45 : .95);
}
const pnj = pnjDuNiveau(niv);
for (const n of pnj) {
  const fov = (n.fov ?? 80) * Math.PI / 180, dist = n.dist ?? 11;
  cone(n.x, n.z, n.yaw ?? 0, fov + (n.kind === 'seated' ? 2 * (n.scanAmp ?? 62) * Math.PI / 180 : 0), dist, n.boss ? hex(0xff5040) : hex(0xffd24a));
  for (const route of [n.waypoints, n.coffeeRoute].filter(Boolean)) {
    for (let i = 0; i < route.length - (route === n.coffeeRoute ? 1 : 0); i++)
      ligne({ x: route[i][0], z: route[i][1] }, { x: route[(i + 1) % route.length][0], z: route[(i + 1) % route.length][1] }, n.boss ? hex(0xff8070) : hex(0xa0d0ff), 1.2);
  }
}
for (const n of pnj) { disque(n.x, n.z, .32, n.boss ? hex(0xff3020) : hex(0xffb020)); ligne(n, { x: n.x + Math.sin(n.yaw ?? 0) * .7, z: n.z + Math.cos(n.yaw ?? 0) * .7 }, [0, 0, 0], 2); }
const d = level.playerStart;
disque(d.x, d.z, .38, hex(0x40e070)); ligne(d, { x: d.x + Math.sin(d.yaw) * .9, z: d.z + Math.cos(d.yaw) * .9 }, [0, 0, 0], 2);
for (const it of level.interactables) { disque(it.x, it.z, it.r, hex(0x40ff90), .18); disque(it.x, it.z, .28, hex(0x40ff90)); }
for (const o of level.ramassables) disque(o.x, o.z, .26, o.id === 'canard' ? hex(0xffe030) : hex(0xffffff));
for (const it of level.accessoires || []) disque(it.x, it.z, .18, hex(0xff60c0));
for (const c of level.canards || []) { disque(c.x, c.z, .3, [0, 0, 0]); disque(c.x, c.z, .22, hex(0xffe030)); }
writeFileSync(sortie, ecrirePNG8({ width: W, height: H, rgb }));
console.log(`Étage ${niv.id} (${niv.plan}, ${niv.orientation || 'origine'}) → ${sortie}`);

// Étages : cohérence des plans et des effectifs (sans rendu).
import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NIVEAUX, PLANS, pnjDuNiveau } from '../../src/levels.js';
import { buildLevel, hasLOS } from '../../src/level.js';
import { buildMaterials } from '../../src/materials.js';
import { NPC } from '../../src/npc.js';
import { Player } from '../../src/player.js';
import { creerNavigation } from '../../src/navigation.js';
import { actionAccessible } from '../../src/office.js';
import { PORTEE_CANARD } from '../../src/interactifs.js';

const warn = console.warn; console.warn = (...a) => { if (!String(a[0]).includes('serialize Texture')) warn(...a); };

// Chaises : celles des postes (level.js, poste) et celle du directeur (bureauDirection).
function chaises(plan) {
  const r = plan.postes.map(([x, z, , rot = 0]) => ({ x: x - 0.25 * Math.cos(rot) + 1.05 * Math.sin(rot),
    z: z + 0.25 * Math.sin(rot) + 1.05 * Math.cos(rot), yaw: rot + Math.PI }));
  const nord = plan.bossSalle === 'nord';
  r.push({ x: 16, z: (nord ? -9.6 : 10.6) - 1.3 * (nord ? 1 : -1), yaw: nord ? 0 : Math.PI });
  return r;
}
const angle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
let assis = 0;
for (const niv of NIVEAUX) {
  const plan = PLANS[niv.plan];
  for (const n of niv.pnj(plan).filter(n => n.kind === 'seated' || n.kind === 'boss')) {
    const c = chaises(plan).sort((a, b) => Math.hypot(a.x - n.x, a.z - n.z) - Math.hypot(b.x - n.x, b.z - n.z))[0];
    const d = Math.hypot(c.x - n.x, c.z - n.z);
    assert(d < 0.3, `Étage ${niv.id} : ${n.name} assis à ${d.toFixed(2)} m de la chaise la plus proche`);
    assert(angle(n.yaw, c.yaw) < 0.1, `Étage ${niv.id} : ${n.name} tourne le dos à son poste (${n.yaw.toFixed(2)} au lieu de ${c.yaw.toFixed(2)})`);
    assis++;
  }
}
console.log(`Étages : ${assis} collègues assis, tous sur une chaise et face à leur poste.`);

// Départ sûr : immobile au point de départ, personne ne doit rien remarquer pendant
// 8 s, rondes et balayages compris (cône, ronde et balayage : cf. plan C).
const scene = new THREE.Scene(), MAT = buildMaterials();
for (const niv of NIVEAUX) {
  const l = buildLevel(scene, MAT, PLANS[niv.plan], niv);
  const p = new Player(scene, l); p.reset();
  const npcs = pnjDuNiveau(niv).map(c => new NPC(scene, c, l));
  const game = { player: p, audio: { step() {} }, hunting: false, npcs };
  for (let t = 0; t < 8; t += 1 / 30) for (const n of npcs) {
    n.update(1 / 30, game);
    assert(n.suspicion === 0, `Étage ${niv.id} : ${n.name} remarque Lao D à son départ (${t.toFixed(1)} s)`);
  }
  for (const n of npcs) n.dispose(); l.dispose(); scene.remove(p.mesh, p.outline);
}
console.log(`Départs : ${NIVEAUX.length} étages, personne ne voit Lao D pendant les 8 premières secondes.`);

// Accessibilité : depuis le départ, tout ce qui se ramasse ou s'utilise doit être
// atteignable (salle secrète ouverte). Grille de 10 cm, rayon du joueur.
let verifies = 0;
for (const niv of NIVEAUX) {
  const l = buildLevel(scene, MAT, PLANS[niv.plan], niv);
  for (const a of l.accessoires) if (a.type === 'passage') { a.obstacle.noClip = true; a.obstacle.seeThrough = true; }
  const nav = creerNavigation(l.obstacles, { rayon: 0.34, cellule: 0.1 });
  const idx = (x, z) => Math.floor((z - nav.z0) / nav.cellule) * nav.nx + Math.floor((x - nav.x0) / nav.cellule);
  const atteint = new Uint8Array(nav.nx * nav.nz), file = [idx(l.playerStart.x, l.playerStart.z)];
  assert(nav.libre[file[0]], `Étage ${niv.id} : départ dans un obstacle`);
  atteint[file[0]] = 1;
  while (file.length) {
    const c = file.pop(), i = c % nav.nx, k = (c - i) / nav.nx;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, kk = k + dk, n = kk * nav.nx + ii;
      if (ii < 0 || kk < 0 || ii >= nav.nx || kk >= nav.nz || atteint[n] || !nav.libre[n]) continue;
      const x = nav.x0 + (ii + .5) * nav.cellule, z = nav.z0 + (kk + .5) * nav.cellule;
      if (Math.abs(x) > 19.4 || Math.abs(z) > 15.4) continue;   // bornes du joueur (player.js)
      atteint[n] = 1; file.push(n);
    }
  }
  const points = function* (x, z, r) {
    for (let dz = -r; dz <= r; dz += 0.05) for (let dx = -r; dx <= r; dx += 0.05) {
      if (Math.hypot(dx, dz) > r) continue;
      const n = idx(x + dx, z + dz); if (atteint[n]) yield { x: x + dx, z: z + dz };
    }
  };
  const accessible = (cible, r, los = false) => {
    for (const p of points(cible.x, cible.z, r)) if (!los || (cible.id === 'canard' ? hasLOS(l.obstacles, {...p,y:1.6}, {x:cible.x,y:cible.y+.26,z:cible.z}) : actionAccessible({ ...cible, r }, { pos: p }, l.obstacles))) return true;
    return false;
  };
  for (const c of l.canards) { assert(accessible(c, PORTEE_CANARD - 0.03, true), `Étage ${niv.id} : canard ${c.index} hors d'atteinte (${c.x}, ${c.z})`); verifies++; }
  for (const o of l.ramassables) { assert(accessible(o, 1.2), `Étage ${niv.id} : ${o.nom} hors d'atteinte`); verifies++; }
  for (const it of l.interactables) { assert(accessible(it, it.r - 0.05, true), `Étage ${niv.id} : sortie ${it.id} inaccessible`); verifies++; }
  for (const a of l.accessoires.filter(a => a.r > 0)) { assert(accessible(a, a.r - 0.05, a.type !== 'carton'), `Étage ${niv.id} : ${a.id} inaccessible`); verifies++; }
  assert.equal(l.canards.length, 3, `Étage ${niv.id} : trois canards attendus`);
  l.dispose();
}
console.log(`Accessibilité : ${verifies} canards, objets, sorties et accessoires atteignables depuis le départ.`);

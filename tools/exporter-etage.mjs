// Exporte un étage tel que le jeu le construit (modèles Blender chargés, décor fusionné,
// orientation appliquée) en OBJ à couleurs de sommet, pour une revue de mise en place
// dans Blender (tools/blender/apercu_etage.py). Les matières texturées reçoivent leur
// teinte moyenne ; les accessoires gardent leurs couleurs de sommet.
//
//   node --import ./tests/personnages/resolveur.mjs tools/exporter-etage.mjs 7 etage-7.obj
import '../tests/personnages/dom-bouchon.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { prechargerDecorBlender } from '../src/decor-blender.js';
import { prechargerAccessoires, prechargerMobilier } from '../src/accessoires-blender.js';
import { NIVEAUX, PLANS, pnjDuNiveau } from '../src/levels.js';
import { buildLevel } from '../src/level.js';
import { buildMaterials } from '../src/materials.js';

const warn = console.warn; console.warn = (...a) => { if (!String(a[0]).includes('serialize Texture')) warn(...a); };
const lire = async n => { const b = readFileSync(new URL('../assets/' + n, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
await prechargerDecorBlender(lire); await prechargerAccessoires(lire); await prechargerMobilier(lire);
const [id, sortie] = process.argv.slice(2);
const niv = NIVEAUX.find(n => String(n.id) === id);
const MAT = buildMaterials();
const level = buildLevel(new THREE.Scene(), MAT, PLANS[niv.plan], niv);
level.root.updateMatrixWorld(true);

// Teintes représentatives des matières texturées (creer_decor.py, materials.js).
const TEINTES = { bois: 0xb39871, boisFonce: 0x5d493a, aluSombre: 0x3a4444, alu: 0xa2aba5, plastiqueNoir: 0x242c2b,
  plastiqueBlanc: 0xdadbcf, tissuChaise: 0x3e5a55, tissuCanape: 0xbb7658, beton: 0xb3b1a4, pierre: 0x8d9487,
  murAccent: 0x3c6561, moquette: 0x5b6266, mur: 0xe6e1d6, plafond: 0xf0eee8, cloison: 0x8a9a94, papier: 0xf1efe8,
  carton: 0xbf9463, laiton: 0xa79d7f, terreCuite: 0xa2643c, feuillage: 0x3e7a42, cableNoir: 0x15171a };
const nomDe = new Map(Object.entries(MAT).filter(([, m]) => m?.isMaterial).map(([k, m]) => [m.uuid, k]));
const couleurDe = m => {
  const nom = nomDe.get(m.uuid);
  if (nom && TEINTES[nom] != null) return new THREE.Color(TEINTES[nom]);
  return m.map ? new THREE.Color(0xd8d4c8) : (m.color || new THREE.Color(0xcccccc)).clone();
};

const lignes = [], v = new THREE.Vector3();
let base = 1;
const ajouter = (geo, matrice, mat) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, col = mat.vertexColors ? g.attributes.color : null;
  // couleurs écrites en sRGB (0–1) : les couleurs de sommet du jeu sont linéaires
  const srgb = x => x <= .0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - .055;
  const hex = couleurDe(mat).getHex(), fixe = [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(matrice);
    const [r, gg, b] = col ? [col.getX(i), col.getY(i), col.getZ(i)].map(srgb) : fixe;
    lignes.push(`v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)} ${r.toFixed(3)} ${gg.toFixed(3)} ${b.toFixed(3)}`);
  }
  for (let i = 0; i < p.count; i += 3) lignes.push(`f ${base + i} ${base + i + 1} ${base + i + 2}`);
  base += p.count;
};
level.root.traverse(o => {
  if (!o.isMesh) return;
  for (let p = o; p; p = p.parent) if (!p.visible) return;
  if (o.material.transparent && o.material.opacity < 0.5) return;
  if (o.isInstancedMesh) {
    const m = new THREE.Matrix4();
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); ajouter(o.geometry, new THREE.Matrix4().multiplyMatrices(o.matrixWorld, m), o.material); }
  } else ajouter(o.geometry, o.matrixWorld, o.material);
});
// collègues : un simple jalon (hauteur 1,75 m) et leur direction de regard
for (const n of pnjDuNiveau(niv)) {
  const g = new THREE.CylinderGeometry(.2, .2, 1.2, 10).translate(0, .6, 0);
  ajouter(g, new THREE.Matrix4().makeTranslation(n.x, 0, n.z), new THREE.MeshBasicMaterial({ color: n.boss ? 0xff3020 : 0xffb020 }));
  const f = new THREE.ConeGeometry(.15, .45, 8).rotateX(Math.PI / 2).translate(0, 1.45, .3);
  ajouter(f, new THREE.Matrix4().makeRotationY(n.yaw ?? 0).setPosition(n.x, 0, n.z), new THREE.MeshBasicMaterial({ color: 0x111111 }));
}
writeFileSync(sortie, lignes.join('\n') + '\n');
// Vues de revue (repère d'origine, portées dans celui de l'étage) : caméra, cible.
const plan = PLANS[niv.plan], R = level.repere, P = (x, y, z) => { const q = R.p(x, z); return [q.x, y, q.z]; };
const vues = { dessus: null,
  reprographie: [P(-14.2, 1.75, -10.6), P(-18.4, .9, -14.6)],
  hall: [P(13.2, 1.75, 4.2), P(18.8, 1.0, -1.2)],
  couloir: [P(8, 1.75, 11), P(8, 1.0, -14)],
  direction: plan.bossSalle === 'nord' ? [P(12.6, 2.2, -4.6), P(17.2, .8, -12.5)] : [P(12.6, 2.2, 6.6), P(17.2, .8, 12.5)],
  reunion: plan.bossSalle === 'nord' ? [P(12.6, 2.2, 6.6), P(16.5, .8, 11)] : [P(12.6, 2.2, -4.6), P(16.5, .8, -10)],
  postes: [P(plan.postes[0][0] + 3.5, 1.75, plan.postes[0][1] + 3.2), P(plan.postes[0][0], .9, plan.postes[0][1])],
};
if (plan.casiers?.length) { const [a, b] = plan.casiers[0]; vues.casiers = [P(-.5, 1.7, (a + b) / 2 + 2.5), P(3.3, 1.0, (a + b) / 2)]; }
if (plan.canape) vues.salon = [P(plan.canape[0] + 4, 1.75, plan.canape[1] + 2.5), P(plan.canape[0], .5, plan.canape[1])];
else if (plan.detente) vues.salon = [P(plan.detente.table[0] + 3.5, 1.75, plan.detente.table[1] + 2.5), P(...[plan.detente.table[0], .5, plan.detente.table[1]])];
if (plan.pieceSecrete) vues.secret = [P(-15.6, 1.9, 12.2), P(-18.6, .7, 14.6)];
writeFileSync(sortie.replace(/\.obj$/, '.json'), JSON.stringify(vues));
console.log(`Étage ${niv.id} → ${sortie} (${Math.round(base / 3)} triangles)`);

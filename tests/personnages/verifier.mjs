import './dom-bouchon.mjs';
import * as THREE from 'three';
import { geometriesCorps, geometrieAccessoire, surfaceTete, surfaceBuste, nomsOs } from '../../src/body.js';
import { makeCharacter, animerVisage, setSeated } from '../../src/characters.js';

const geos = geometriesCorps();
let ok = true;
for (const [nom, g] of Object.entries(geos)) {
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  let nan = 0; for (const v of p) if (!Number.isFinite(v)) nan++;
  for (const v of n) if (!Number.isFinite(v)) nan++;
  g.computeBoundingBox();
  const b = g.boundingBox;
  console.log(`${nom.padEnd(8)} sommets ${String(p.length / 3).padStart(5)} tris ${String(g.index.count / 3).padStart(5)} NaN ${nan}` +
    `  y ${b.min.y.toFixed(3)}..${b.max.y.toFixed(3)}  x ±${Math.max(-b.min.x, b.max.x).toFixed(3)}  z ${b.min.z.toFixed(3)}..${b.max.z.toFixed(3)}`);
  if (nan) ok = false;
  // indices valides
  const max = Math.max(...g.index.array);
  if (max >= p.length / 3) { console.log('  INDEX HORS LIMITE', max); ok = false; }
  // poids de skin
  const si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array;
  for (let i = 0; i < si.length; i += 4) {
    const s = sw[i] + sw[i + 1];
    if (Math.abs(s - 1) > 1e-4 || si[i] > 15 || si[i + 1] > 15) { console.log('  SKIN INVALIDE', i, si[i], si[i+1], s); ok = false; break; }
  }
}
for (const nom of ['sangles', 'cordon']) for (const v of [false, true]) {
  const g = geometrieAccessoire(nom, v);
  const p = g.attributes.position.array; let nan = 0; for (const x of p) if (!Number.isFinite(x)) nan++;
  console.log(`${nom}${v ? '/veste' : '/chemise'} sommets ${p.length / 3} NaN ${nan}`);
  if (nan) ok = false;
}

// --- emboîtements : extension max en x des jambes vs bassin, par tranche ---
const tranche = (g, y0, y1) => {
  const p = g.attributes.position.array; let mx = 0, mz = -9, mzn = 9;
  for (let i = 0; i < p.length; i += 3) if (p[i + 1] >= y0 && p[i + 1] < y1) { mx = Math.max(mx, Math.abs(p[i])); mz = Math.max(mz, p[i + 2]); mzn = Math.min(mzn, p[i + 2]); }
  return { mx, mz, mzn };
};
console.log('\nsurface visage (locale tête) y=0.006 x=0.037 →', surfaceTete(0.006, 0.037).p.map(v => v.toFixed(4)));
console.log('surface torse (locale buste) y=0.45 x=0 →', surfaceBuste(0.45, 0).p.map(v => v.toFixed(4)));
console.log('surface veste (locale buste) y=0.45 x=0 →', surfaceBuste(0.45, 0, { veste: true }).p.map(v => v.toFixed(4)));

// --- personnage complet ---
const { group, parts } = makeCharacter({ veste: 0x4c5464, cravate: 0x82333d, lunettes: true, sac: true, badge: true, chemise: 0xf2ead8 });
let meshes = 0, skinned = 0, tris = 0;
group.traverse(o => { if (o.isSkinnedMesh) skinned++; else if (o.isMesh) meshes++; if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
console.log(`\nLao D : ${skinned} maillages skinnés, ${meshes} rigides, ${Math.round(tris)} triangles`);
for (const k of ['head', 'teteMicro', 'torso', 'armL', 'elbowL', 'legL', 'kneeL', 'footL', 'visage', 'regard', 'paupiere', 'bouche', 'cravate', 'sangles', 'cordon', 'ceinture'])
  if (!parts[k]) { console.log('  PART MANQUANTE', k); ok = false; }
// animation : aucune exception, paupières et bouche toujours dans la scène
for (let i = 0; i < 300; i++) animerVisage(parts, 1 / 60, { tension: i > 150 ? 0.8 : 0, parle: i % 50 < 20 });
const dansScene = (o) => { let p = o; while (p) { if (p === group) return true; p = p.parent; } return false; };
if (!dansScene(parts.paupiere)) { console.log('  PAUPIÈRE HORS SCÈNE'); ok = false; }
if (!dansScene(parts.regard)) { console.log('  REGARD HORS SCÈNE'); ok = false; }
if (parts.regard.children.length === 0) { console.log('  REGARD VIDE'); ok = false; }
if (parts.paupiere.children.length === 0) { console.log('  PAUPIERES VIDES'); ok = false; }
console.log('regard', parts.regard.children.length, 'maillages · paupieres', parts.paupiere.children.length,
  '· scale.y', parts.paupiere.scale.y.toFixed(3));
if (!dansScene(parts.bouche)) { console.log('  BOUCHE HORS SCÈNE'); ok = false; }
console.log('respiration torso.scale', parts.torso.scale.toArray().map(v => v.toFixed(3)), ' teteMicro', parts.teteMicro.rotation.toArray().slice(0,3).map(v => v.toFixed(3)));
setSeated(parts);
// clone (contour du joueur) : même nombre de nœuds
const cl = group.clone(true); let a = 0, b = 0; group.traverse(() => a++); cl.traverse(() => b++);
console.log('clone nœuds', a, b, a === b ? 'ok' : 'DIFFÉRENT');
const npc = makeCharacter({ chignon: true, badge: true });
let m2 = 0; npc.group.traverse(o => { if (o.isMesh) m2++; });
console.log('collègue sans veste :', m2, 'maillages');
console.log(ok ? '\nTOUT OK' : '\nÉCHECS');
process.exit(ok ? 0 : 1);

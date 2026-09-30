// Validation des ressources réellement livrées, puis des six niveaux construits
// avec elles : géométrie, collisions, budgets et durée de vie des ressources.
import assert from 'node:assert/strict';
import { HUMOUR } from '../../src/humour.js';
import { readFileSync } from 'node:fs';
import { prechargerDecorBlender, etatDecorBlender } from '../../src/decor-blender.js';
await assert.rejects(prechargerDecorBlender(async()=>null),/Décor Blender absent/);
assert.deepEqual(etatDecorBlender(),{},'Chargement partiel exposé au jeu');
const etat=await prechargerDecorBlender(async nom=>{
  const b=readFileSync(new URL('../../assets/'+nom,import.meta.url));
  return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
});
assert.deepEqual(Object.keys(etat),['bureau','chaise','escalier','porte',...HUMOUR.map(h=>h.modele)]);
for(const [nom,info] of Object.entries(etat)){
  assert(info.triangles>100 && info.triangles<20000,nom+' : géométrie inattendue');
  assert(info.pieces<=7,nom+' : lots par matériau non fusionnés');
}
console.log('Modèles Blender chargés :',JSON.stringify(etat));
// Accessoires des étages (canards, distributeur, pièce secrète…), eux aussi dans les budgets.
const { prechargerAccessoires } = await import('../../src/accessoires-blender.js');
const accessoires=await prechargerAccessoires(async nom=>{
  const b=readFileSync(new URL('../../assets/'+nom,import.meta.url));
  return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
});
console.log('Accessoires Blender chargés :',Object.keys(accessoires).join(', '));
// Mobilier v02 : le meuble codé est remplacé par son modèle Blender, emprises identiques.
const { prechargerMobilier } = await import('../../src/accessoires-blender.js');
const mobilier=await prechargerMobilier(async nom=>{
  const b=readFileSync(new URL('../../assets/'+nom,import.meta.url));
  return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
});
assert.deepEqual(readFileSync(new URL('../../assets/mobilier-v02.glb',import.meta.url)),readFileSync(new URL('../../art/mobilier-v02/mobilier-v02.glb',import.meta.url)),
  'Le mobilier du jeu doit être l’export du .blend');
for(const [id,info] of Object.entries(mobilier)) assert(info.triangles>100 && info.triangles<5000,id+' : géométrie inattendue');
console.log('Mobilier v02 chargé :',Object.keys(mobilier).length,'modèles,',Math.round(Object.values(mobilier).reduce((s,m)=>s+m.triangles,0)),'triangles');
const { prechargerDepartements } = await import('../../src/accessoires-blender.js');
await prechargerDepartements(async nom=>{const b=readFileSync(new URL('../../assets/'+nom,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
// Chaque meuble tient dans l'obstacle de sa version codée (level.js), à 5 cm près :
// ce qu'on voit est ce qui bloque. Largeur x, profondeur z, dans le repère du modèle.
{
  const { lotsAccessoire } = await import('../../src/accessoires-blender.js');
  const EMPRISES = { photocopieuse: [2.0, 1.8], fontaine: [.5, .5], 'machine-cafe': [.64, .6], casier: [.62, .75], 'casier-b': [.62, .75],
    'cartons-pile': [.84, .76], canape: [2.2, 1.1], fauteuil: [.6, .6], 'table-basse': [1.2, 1.2], 'bureau-direction': [3.0, 1.6],
    'table-reunion': [4.4, 1.8], 'bibliotheque-direction': [3.2, 1.3], cloison: [1.2, .16], 'cloison-notes': [1.2, .16] };
  for (const [id, [w, d]] of Object.entries(EMPRISES)) {
    let x = 0, z = 0;
    for (const l of lotsAccessoire(id)) { const p = l.geometry.attributes.position; for (let i = 0; i < p.count; i++) { x = Math.max(x, Math.abs(p.getX(i))); z = Math.max(z, Math.abs(p.getZ(i))); } }
    assert(x <= w / 2 + .05 && z <= d / 2 + .05, `${id} dépasse son emprise : ${(2 * x).toFixed(2)} × ${(2 * z).toFixed(2)} m pour ${w} × ${d}`);
  }
}
// Posés, pas flottants : chaque canard et chaque objet repose sur le meuble (Blender)
// qui le porte, au demi-centimètre près, sans traverser un autre objet.
{
  const THREE = await import('three');
  await import('../personnages/dom-bouchon.mjs');
  const { NIVEAUX, PLANS } = await import('../../src/levels.js');
  const { buildLevel } = await import('../../src/level.js');
  const { buildMaterials } = await import('../../src/materials.js');
  const M = buildMaterials(), ray = new THREE.Raycaster(); let poses = 0;
  for (const n of NIVEAUX) {
    const l = buildLevel(new THREE.Scene(), M, PLANS[n.plan], n); l.root.updateMatrixWorld(true);
    const exclus = new Set(); for (const o of l.ramassables) o.group.traverse(m => exclus.add(m));
    const cibles = []; l.root.traverse(o => { if (o.isMesh && !o.isInstancedMesh && !o.material.transparent && !exclus.has(o)) cibles.push(o); });
    const appui = (x, y, z) => { ray.set(new THREE.Vector3(x, y + .3, z), new THREE.Vector3(0, -1, 0)); return ray.intersectObjects(cibles, false)[0]?.point.y ?? 0; };
    for (const c of l.canards) {
      const e = c.y - appui(c.x, c.y, c.z);
      assert(Math.abs(e) <= .005, `Étage ${n.id} : canard ${c.index} ${e > 0 ? 'flotte' : 'enfoncé'} de ${(Math.abs(e) * 100).toFixed(1)} cm`); poses++;
    }
    for (const o of l.ramassables) {
      const base = o.y - (o.id === 'portable' ? .011 : .004), e = base - appui(o.x, o.y, o.z);
      assert(Math.abs(e) <= .005, `Étage ${n.id} : ${o.nom} ${e > 0 ? 'flotte' : 'enfoncé'} de ${(Math.abs(e) * 100).toFixed(1)} cm`); poses++;
    }
    l.dispose();
  }
  console.log(`Posés : ${poses} canards et objets reposent sur leur meuble Blender.`);
}
await import('./verifier.mjs');
await import('../transitions/ressources.mjs');
assert.deepEqual(etatDecorBlender(),etat,'Cache altéré par une transition');

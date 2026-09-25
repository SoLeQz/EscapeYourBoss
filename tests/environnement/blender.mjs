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
await import('./verifier.mjs');
await import('../transitions/ressources.mjs');
assert.deepEqual(etatDecorBlender(),etat,'Cache altéré par une transition');

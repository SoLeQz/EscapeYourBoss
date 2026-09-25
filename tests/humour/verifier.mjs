// Les accessoires ne doivent ni cacher les objets de mission, ni déborder dans
// les passages. Les emprises historiques et budgets sont vérifiés ensuite.
import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {prechargerDecorBlender} from '../../src/decor-blender.js';
import {buildLevel} from '../../src/level.js';
import {buildMaterials} from '../../src/materials.js';
import {NIVEAUX,PLANS} from '../../src/levels.js';
import {HUMOUR} from '../../src/humour.js';
const ctx=document.createElement().getContext();for(const k of ['save','restore','translate','arc'])ctx[k]=()=>{};
await prechargerDecorBlender(async nom=>{const b=readFileSync(new URL('../../assets/'+nom,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
const mat=buildMaterials(),scene=new THREE.Scene();
// Volumes autorisés : machine à café, photocopieuse, escalier condamné,
// table de réunion, casier, table de réunion. Les feuilles dépassent de 30 cm
// devant le bac de sortie, sans empiéter sur un passage utile. Ni couloir ni poste libre.
const emprises=[[[18.28,1.4,-1.50],[18.92,2.10,-.90]],
 [[-19.4,0,-15.4],[-17.4,1.50,-13.29]],[[7.74,0,12.76],[8.26,.80,13.28]],
 [[16.9,.79,-10.15],[17.6,1.60,-9.5]],[[2.925,1.85,.95],[3.72,3.25,2.10]],
 [[14.15,.79,10.80],[14.85,1.40,11.70]]];
assert.equal(new Set(HUMOUR.map(h=>h.modele)).size,6,'Les étages doivent avoir des accessoires distincts');
for(const [i,n] of NIVEAUX.entries()){
 const l=buildLevel(scene,mat,PLANS[n.plan],n),h=l.root.userData.humour;
 assert(h.charge,'Accessoire Blender absent du niveau '+n.id);
 const [min,max]=emprises[i],b=h.limites;
 for(let k=0;k<3;k++)assert(b.min[k]>=min[k]-1e-5&&b.max[k]<=max[k]+1e-5,`Étage ${n.id} : accessoire hors de son support (${k}) : ${JSON.stringify(b)}`);
 const volume=new THREE.Box3(new THREE.Vector3(...b.min),new THREE.Vector3(...b.max));
 for(const o of l.ramassables){assert(volume.distanceToPoint(o.group.position)>.22,'L’objet de mission est masqué par le gag : '+o.id);}
 assert(!l.interactables.some(it=>it.id.startsWith('humour')),'Un décor ne doit pas devenir un faux objectif');
 l.dispose();assert.equal(scene.children.length,0);
}
await import('../environnement/verifier.mjs');
await import('../transitions/ressources.mjs');
console.log('Six scènes Blender distinctes : supports, objets de mission, circulation et transitions OK.');

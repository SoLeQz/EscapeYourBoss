import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {prechargerDecorBlender} from '../../src/decor-blender.js';
import {prechargerMobilier,prechargerAccessoires,prechargerDepartements,lotsAccessoire} from '../../src/accessoires-blender.js';
import {DEPARTEMENTS,materiauxDepartement,pointDecouverte} from '../../src/departements.js';
import {buildMaterials} from '../../src/materials.js';
import {buildLevel} from '../../src/level.js';
import {NIVEAUX,PLANS} from '../../src/levels.js';
import {SECRETS,noterSecret,nettoyerSecrets} from '../../src/secrets.js';
import {Interactifs} from '../../src/interactifs.js';
const lire=async n=>{const b=readFileSync(new URL('../../assets/'+n,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
await prechargerDecorBlender(lire);await prechargerMobilier(lire);await prechargerAccessoires(lire);const kit=await prechargerDepartements(lire);
assert.equal(Object.keys(kit).length,22);
assert.deepEqual(readFileSync(new URL('../../assets/departements-v01.glb',import.meta.url)),readFileSync(new URL('../../art/departements-v01/departements-v01.glb',import.meta.url)));
const M=buildMaterials(),couleur=M.mur.color.getHex(),scene=new THREE.Scene(),rapport=[];
for(const [i,n] of NIVEAUX.entries()){
 const d=DEPARTEMENTS[i],theme=materiauxDepartement(M,n),p=PLANS[n.plan];
 assert.equal(materiauxDepartement(M,n),theme,'Cache de palette instable');assert.equal(theme.mur.map,M.mur.map,'Texture dupliquée');assert.equal(M.mur.color.getHex(),couleur,'Palette de base modifiée');
 const meshes=lotsAccessoire('rangement-'+d.id);assert(meshes.length);
 const b=new THREE.Box3();for(const m of meshes){m.geometry.computeBoundingBox();b.union(m.geometry.boundingBox)}
 assert(b.min.x>=-.311&&b.max.x<=.311&&b.min.z>=-.376&&b.max.z<=.376&&Math.abs(b.max.y-1.848)<.001,'Rangement hors emprise : '+d.id);
 const l=buildLevel(scene,M,p,n);assert.equal(l.root.userData.departement.id,d.id);
 const ids=[];let lots=0,triangles=0;l.root.traverse(o=>{if(o.userData.accessoire)ids.push(o.userData.accessoire);if(o.isMesh){lots++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3}});
 assert(ids.includes('rangement-'+d.id)&&ids.includes('poste-'+d.id),'Kit absent en jeu : '+d.id);
 if(d.id==='direction'){assert(ids.includes('vitrine-direction'));assert(!ids.includes('cartons-pile'))}
 assert(lots<=110&&triangles<=270000,`${d.id} dépasse le budget : ${lots} / ${triangles}`);
 const it=l.accessoires.find(a=>a.type==='observation');assert(it);assert(SECRETS.some(s=>s.id===it.secret));
 assert.deepEqual({x:it.x,z:it.z},l.repere.p(...Object.values(pointDecouverte(n,p))));
 const etat={},messages=[],j={player:{},ui:{toast:(...a)=>messages.push(a)},decouvrir:id=>noterSecret(etat,id)};const interactifs=new Interactifs(j);
 interactifs.interagir(it);interactifs.interagir(it);assert.deepEqual(etat.secrets,[it.secret]);assert.equal(messages.length,2,'La découverte doit rester relisible');
 assert.deepEqual(nettoyerSecrets(etat,NIVEAUX.map(n=>n.id)).secrets,[it.secret]);
 rapport.push({id:n.id,departement:d.id,lots,triangles:Math.round(triangles)});l.dispose();assert.equal(scene.children.length,0);
}
assert.equal(new Set(DEPARTEMENTS.map(d=>d.motif)).size,10);assert.equal(new Set(DEPARTEMENTS.map(d=>d.etage)).size,10);
console.log('Départements : 22 modèles issus de Blender, dix palettes isolées, emprises des rangements, budgets, dix découvertes relisibles et sauvegardées.');console.table(rapport);

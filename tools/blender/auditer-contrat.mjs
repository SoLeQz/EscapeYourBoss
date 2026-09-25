// Lecture du modèle existant uniquement. Aucun export de sa géométrie.
import '../../tests/personnages/dom-bouchon.mjs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { makeCharacter, HEIGHT } from '../../src/characters.js';
import { nomsOs } from '../../src/body.js';

const look = {
  chemise:0xf2ead8,pantalon:0x555a66,cheveux:0x14100d,peau:0xf1c096,
  veste:0x4c5464,cravate:0x82333d,lunettes:true,sac:true,badge:true,
};
const {group,parts}=makeCharacter(look);
group.updateMatrixWorld(true);
const position = o => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).toArray();
const noms=nomsOs(),os=noms.map(nom=>group.getObjectByName(nom));
const stats={appels:0,surfacesSkinnees:0,triangles:0,materiaux:0};
const mats=new Set();
const maillages=[];
group.traverse(o=>{
  if(!o.isMesh)return;
  const triangles=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
  const materials=[].concat(o.material);materials.forEach(m=>mats.add(m));
  stats.appels+=Array.isArray(o.material)?o.geometry.groups.length:1;
  stats.triangles+=triangles;stats.surfacesSkinnees+=o.isSkinnedMesh?1:0;
  maillages.push({type:o.type,triangles,parent:o.parent?.name||o.parent?.type,
    morphs:o.morphTargetInfluences?.length||0});
});
stats.materiaux=mats.size;
const boite=new THREE.Box3().setFromObject(group);
const rapport={schema:1,revisionThree:THREE.REVISION,unite:'metre',haut:'+Y',avant:'+Z',
  look,hauteurs:HEIGHT,stats,boite:{min:boite.min.toArray(),max:boite.max.toArray()},
  os:os.map(o=>({nom:o.name,parent:o.parent?.isBone?o.parent.name:null,
    position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray(),
    ordreEuler:o.rotation.order,monde:position(o),matriceMonde:o.matrixWorld.toArray()})),
  pivots:Object.fromEntries(Object.entries(parts).filter(([,p])=>p?.isObject3D).map(([cle,p])=>[cle,{
    type:p.type,os:p.isBone?p.name:null,parent:p.parent?.name||Object.entries(parts).find(([,v])=>v===p.parent)?.[0]||'group',
    position:p.position.toArray(),quaternion:p.quaternion.toArray(),monde:position(p)}])),
  maillages,sources:Object.fromEntries(['src/body.js','src/characters.js','src/player.js','src/emotes.js','src/resources.js'].map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]))};
writeFileSync(new URL('../../tests/blender/audit/contrat.json',import.meta.url),JSON.stringify(rapport,null,2)+'\n');
console.log(JSON.stringify({revisionThree:rapport.revisionThree,os:os.length,...stats,boite:rapport.boite},null,2));

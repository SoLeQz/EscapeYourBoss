// Maquette fidèle du joueur courant pour travailler les animations dans Blender.
import '../../tests/personnages/dom-bouchon.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {prechargerAnatomieBlender} from '../../src/anatomie-blender.js';
import {makeCharacter} from '../../src/characters.js';
import {nomsOs} from '../../src/body.js';
await prechargerAnatomieBlender(async n=>{const b=readFileSync(new URL('../../assets/'+n,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
const {group,parts}=makeCharacter({chemise:0xf2ead8,pantalon:0x555a66,cheveux:0x14100d,peau:0xf1c096,veste:0x4c5464,cravate:0x82333d,lunettes:true,sac:true,badge:true});
group.updateMatrixWorld(true);const objets=[];group.traverse(o=>objets.push(o));const ids=new Map(objets.map((o,i)=>[o,i]));
const data={schema:1,os:nomsOs(),controls:Object.fromEntries(Object.entries(parts).filter(([,v])=>v?.isObject3D).map(([k,v])=>[k,ids.get(v)])),nodes:objets.map(o=>{
 const n={id:ids.get(o),name:o.name,type:o.type,parent:ids.get(o.parent)??null,matrix:o.matrix.toArray(),world:o.matrixWorld.toArray()};
 if(o.isMesh){const g=o.geometry;n.mesh={attributes:Object.fromEntries(Object.entries(g.attributes).filter(([k])=>['position','normal','color','skinIndex','skinWeight'].includes(k)).map(([k,a])=>[k,{size:a.itemSize,values:Array.from({length:a.count*a.itemSize},(_,i)=>a['get'+['X','Y','Z','W'][i%a.itemSize]](Math.floor(i/a.itemSize)))}])),index:g.index?Array.from(g.index.array):null,morphs:Object.fromEntries(Object.entries(o.morphTargetDictionary||{}).map(([k,i])=>[k,Array.from(g.morphAttributes.position[i].array)])),relative:g.morphTargetsRelative,skin:!!o.isSkinnedMesh,color:o.material.color.toArray(),roughness:o.material.roughness??.8,metalness:o.material.metalness??0};}
 return n;
})};
const out=process.argv[2];if(!out)throw Error('Chemin de sortie requis');writeFileSync(out,JSON.stringify(data));console.log('Atelier :',data.nodes.length,'nœuds,',data.os.length,'os, joueur Blender courant.');

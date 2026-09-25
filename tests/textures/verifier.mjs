import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {lirePNG} from '../../tools/blender/png.mjs';
import {MATIERES_BLENDER,prechargerTexturesBlender,texturesBlender,etatTexturesBlender} from '../../src/textures-blender.js';
import {prechargerDecorBlender} from '../../src/decor-blender.js';
import {buildMaterials,buildCharacterMaterials} from '../../src/materials.js';
const lire=async nom=>{const b=readFileSync(new URL('../../assets/'+nom,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
await assert.rejects(prechargerTexturesBlender(async()=>null),/Texture Blender absente/);
assert.deepEqual(etatTexturesBlender(),{});
await prechargerTexturesBlender(lire,async bytes=>lirePNG(Buffer.from(bytes)));
let count=0,memory=0;
for(const nom of Object.keys(MATIERES_BLENDER)){
 const cartes=texturesBlender(nom);assert(cartes,nom);
 for(const [canal,t] of Object.entries(cartes)){
  count++;memory+=t.image.width*t.image.height*4*4/3;
  assert.equal(t.colorSpace,canal==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace,'Espace couleur incorrect : '+t.name);
  const rgb=t.image.rgb;
  if(canal==='normalMap')for(let i=0;i<rgb.length;i+=3){
    const n=Array.from(rgb.subarray(i,i+3),v=>v*2-1);
    assert(Math.abs(Math.hypot(...n)-1)<.015&&n[2]>.8,'Normale corrompue : '+t.name);
  }
  if(canal==='roughnessMap')for(const v of rgb)assert(v>=.38&&v<=1,'Rugosité hors budget artistique : '+t.name);
  // Le raccord ne doit pas produire une ligne plus forte que le grain intérieur.
  const {width:w,height:h}=t.image;let edge=0,inside=0;
  for(let y=0;y<h;y++)for(let c=0;c<3;c++){
    edge+=Math.abs(rgb[(y*w+w-1)*3+c]-rgb[y*w*3+c]);
    inside+=Math.abs(rgb[(y*w+Math.floor(w/2))*3+c]-rgb[(y*w+Math.floor(w/2)-1)*3+c]);
  }
  assert(edge<=inside*4+h*.012,'Couture excessive : '+t.name);
 }
}
assert.equal(count,19);assert(memory<40*1024*1024);
const M=buildMaterials(),C=buildCharacterMaterials();
assert.equal(M.cloison.map,M.tissuChaise.map);assert.equal(M.tissuCanape.map,M.tissuChaise.map);
assert.equal(M.bois.map,M.boisFonce.map);assert.equal(C.chaussure.normalMap,texturesBlender('cuir').normalMap);
for(const k of ['bois','boisFonce','alu','aluSombre'])assert.equal(M[k].roughness,1,'Carte de rugosité multipliée une seconde fois : '+k);
await prechargerDecorBlender(lire);
await import('../environnement/verifier.mjs');
await import('../transitions/ressources.mjs');
console.log(`7 matières Blender, ${count} cartes partagées, ${(memory/1024/1024).toFixed(1)} Mio estimés avec mipmaps. Normales, rugosité, raccords et transitions OK.`);

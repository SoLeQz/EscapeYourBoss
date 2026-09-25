import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { projeterRepere } from '../../src/reperes.js';
import { makeLabelSprite, makeIconSprite, makeBubbleSprite } from '../../src/characters.js';
import { Minimap } from '../../src/minimap.js';

const camera=new THREE.PerspectiveCamera(60,16/9,.1,100);camera.position.set(0,0,0);camera.lookAt(0,0,-1);camera.updateMatrixWorld();
for(const [w,h] of [[1424,821],[960,560],[1920,1080]]) {
  camera.aspect=w/h;camera.updateProjectionMatrix();
  const devant=projeterRepere({x:0,y:0,z:-10},camera,w,h);
  assert(!devant.horsChamp);assert.equal(devant.x,w/2);assert.equal(devant.y,h/2);
  const derriere=projeterRepere({x:0,y:0,z:10},camera,w,h);
  assert(derriere.horsChamp&&derriere.y>h/2,'Objectif derrière projeté devant');
  for(const p of [{x:100,y:0,z:-1},{x:-100,y:0,z:-1},{x:0,y:100,z:-1},{x:0,y:-100,z:-1},{x:0,y:0,z:0}]) {
    const r=projeterRepere(p,camera,w,h);assert(r.horsChamp);
    assert([r.x,r.y,r.angle].every(Number.isFinite));
    assert(r.x>=0&&r.x<=w&&r.y>=0&&r.y<=h,'Repère hors écran');
  }
}
for(const sprite of [makeLabelSprite('POSTE LIBRE','Abri · 12 s max'),makeIconSprite('!'),makeBubbleSprite('Salut')]) {
  assert.equal(sprite.material.depthWrite,false,'Rectangle transparent écrit dans la profondeur');
}

// Vérifie l'ordre de dessin : un objectif doit rester au-dessus des cônes,
// puis disparaître au ramassage sans être renuméroté quand il en reste deux.
const operations=[];
const ctx=new Proxy({}, {get:(t,k)=>t[k]??((...args)=>operations.push([k,...args])),set:(t,k,v)=>{t[k]=v;return true}});
globalThis.window={devicePixelRatio:1};
const canvas={width:210,height:172,clientWidth:210,clientHeight:172,getContext:()=>ctx};
const objets=[{x:0,z:0,pris:false},{x:1,z:1,pris:false}];
const level={obstacles:[],interactables:[],ramassables:objets};
const m=new Minimap(canvas,level);m.fondNiveau=level;m.fond={};
const game={showCones:true,player:{pos:{x:0,z:0},yaw:0},npcs:[{pos:{x:0,z:0},state:'repere',suspicion:1,headYaw:0,fov:1,viewDist:9,isBoss:true}]};
m.draw(game);
const restore=operations.findIndex(o=>o[0]==='restore');
const nums=operations.flatMap((o,i)=>o[0]==='fillText'?[{texte:o[1],i}]:[]);
assert.deepEqual(nums.map(n=>n.texte),['1','2']);assert(nums.every(n=>n.i>restore));
operations.length=0;objets[0].pris=true;m.draw(game);
assert.deepEqual(operations.filter(o=>o[0]==='fillText').map(o=>o[1]),['2']);
objets[1].pris=true;operations.length=0;m.draw(game);assert(!operations.some(o=>o[0]==='fillText'));
console.log('Repères : projection, arrière caméra, petites fenêtres, profondeur des sprites et ordre de mini-carte OK.');

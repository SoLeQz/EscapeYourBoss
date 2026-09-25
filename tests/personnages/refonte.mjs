// Régressions observables : surfaces à l'envers, yeux qui ne se ferment pas,
// chaussures en l'air et hauteur de perception différente du modèle.
import './dom-bouchon.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { geometriesCorps } from '../../src/body.js';
import { makeCharacter } from '../../src/characters.js';
import { Player } from '../../src/player.js';

const geos=geometriesCorps();
const avant=new THREE.MeshBasicMaterial({side:THREE.FrontSide});
for(const [nom,x,y,minZ] of [['haut',0,1.32,.09],['bas',.105,.50,.03],['peau',0,1.52,.03]]) {
  const mesh=new THREE.Mesh(geos[nom],avant);mesh.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(x,y,1),new THREE.Vector3(0,0,-1));
  const hit=ray.intersectObject(mesh)[0];
  assert(hit && hit.point.z>minZ,nom+' : la face extérieure disparaît');
  assert(hit.face.normal.z>0,nom+' : normale tournée vers le corps');
}
const {group,parts}=makeCharacter({veste:0x4c5464,cravate:0x82333d,lunettes:true,sac:true,badge:true});
group.updateMatrixWorld(true);
const regard=new THREE.Raycaster(new THREE.Vector3(.036,1.636,.4),new THREE.Vector3(0,0,-1));
parts.clignement.morphTargetInfluences[0]=0;
assert.equal(regard.intersectObject(parts.clignement).length,0,'Paupière devant la pupille au repos');
parts.clignement.morphTargetInfluences[0]=1;
const fermeture=regard.intersectObject(parts.clignement)[0];
const pupille=regard.intersectObject(parts.regard,true)[0];
assert(fermeture && pupille && fermeture.distance < pupille.distance-.0005,
  'La paupière fermée laisse dépasser la pupille');
for(const values of Object.values(parts.clignement.geometry.morphAttributes))
  for(const a of values)for(const v of a.array)assert(Number.isFinite(v));
const ids=geos.hautHabille.index.array,p=geos.hautHabille.attributes.position;
for(let i=0;i<ids.length;i+=3){
  const tri=[ids[i],ids[i+1],ids[i+2]];
  const x=tri.reduce((a,k)=>a+Math.abs(p.getX(k)),0)/3,y=tri.reduce((a,k)=>a+p.getY(k),0)/3;
  assert(!(x>.17 && y>1 && y<1.25),'Une manche interne peut traverser la veste');
}
const player=new Player(new THREE.Scene(),{playerStart:{x:0,z:0,yaw:0},obstacles:[]});
const point=new THREE.Vector3();
for(const c of [0,.25,.5,.75,1]) {
  player.crouch=c;player.animate(0);player.mesh.updateMatrixWorld(true);
  for(const pied of [player.parts.footL,player.parts.footR]) {
    let sol=Infinity;
    pied.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;
      for(let i=0;i<p.count;i++)sol=Math.min(sol,point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).y);
    });
    assert(Math.abs(sol)<.004,`Accroupissement ${c} : semelle à ${sol} m du sol`);
  }
  const oeil=player.parts.head.getWorldPosition(point).y;
  assert(Math.abs(oeil-player.eyeY)<.012,`Accroupissement ${c} : hauteur des yeux incohérente`);
}
let appels=0,tris=0;group.traverse(o=>{if(o.isMesh){appels++;tris+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
assert(appels<=44,`Budget : ${appels} appels, plafond 44`);
assert(tris<38000,`Budget : ${tris} triangles, plafond 38000`);
console.log(`Refonte : orientation, clignement, couches, appui au sol et perception OK. ${appels} appels, ${tris} triangles.`);

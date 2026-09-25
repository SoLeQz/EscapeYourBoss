import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Player} from '../../src/player.js';
import {Entrees} from '../../src/input.js';
import {EMOTES} from '../../src/emotes.js';
const p=new Player(new THREE.Scene(),{playerStart:{x:0,z:0,yaw:0},obstacles:[]});
const input=new Entrees(),v=new THREE.Vector3();
const bones=['root','upper','head','armL','armR','elbowL','elbowR','legL','legR','kneeL','kneeR','footL','footR','mainL','mainR'];
assert.deepEqual(EMOTES.map(e=>e.id),['tchao','arrogance','moulin','takeL','67','ela-ke-leitada']);
function pieds(){
  p.mesh.updateMatrixWorld(true);let sol=Infinity;
  for(const foot of [p.parts.footL,p.parts.footR])foot.traverse(o=>{
    if(!o.isMesh)return;const a=o.geometry.attributes.position;
    for(let i=0;i<a.count;i++)sol=Math.min(sol,v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).y);
  });return sol;
}
let pireSol=0,pireAngle=0;
for(const [index,e] of EMOTES.entries()){
  const debut=e.echantillon(0),fin=e.echantillon(1);
  for(const k of Object.keys(debut))assert(Math.abs(debut[k]-fin[k])<1e-10,'Une scène doit revenir à sa pose neutre');
  p.reset();input.clear();p.declencherEmote(index);let previous=null;
  for(let f=0;f<Math.ceil((e.duree+.3)*120);f++){
    p.update(1/120,input,0);
    const values=bones.flatMap(k=>p.parts[k].rotation.toArray().slice(0,3));
    assert(values.every(Number.isFinite));
    if(previous)pireAngle=Math.max(pireAngle,...values.map((val,i)=>Math.abs(val-previous[i])));
    previous=values;
    if(p.emote?.poids>.99){const sol=pieds();pireSol=Math.max(pireSol,Math.abs(sol));assert(sol>-.012&&sol<.012,`${e.id} : appui à ${sol}`);}
  }
  assert.equal(p.emote,null);assert(Math.abs(p.parts.root.position.x)<1e-6);
  assert(Math.abs(p.parts.root.position.y-.85)<.001);
  // Interrompre dans la préparation, la pose forte, puis la récupération.
  for(const fraction of [.15,.5,.85])for(const hz of [30,60,144])for(const touche of ['KeyW','ControlLeft']){
    p.reset();input.clear();p.declencherEmote(index);
    for(let i=0;i<Math.ceil(e.duree*fraction*hz);i++)p.update(1/hz,input,0);
    const temps=p.emote.t;input.add(touche);
    p.update(1/hz,input,0);assert(p.emote.coupee);assert.equal(p.emote.t,temps,'Le clip coupé continue de progresser');
    for(let i=1;i<Math.ceil(.22*hz);i++)p.update(1/hz,input,0);
    assert.equal(p.emote,null,`${e.id} : interruption trop lente à ${hz} Hz`);
    if(touche==='KeyW')assert(p.pos.z>.1,'La sortie d’emote retarde le déplacement');
    else assert(p.crouch>.5,'La sortie d’emote bloque l’accroupissement');
  }
}
// Marche/course et déplacement accroupi : la chaussure d'appui reste au sol.
for(const [speed,running,crouch] of [[2.9,false,0],[5,true,0],[1.3,false,1]]){
  p.reset();p.speed=speed;p.running=running;p.crouch=crouch;
  for(let f=0;f<180;f++){p.animate(1/60);const sol=pieds();assert(Math.abs(sol)<.004,`Allure ${speed} : semelle à ${sol}`);}
}
assert(pireAngle<.24,`Cassure entre images : ${pireAngle}`);
p.reset();input.clear();p.working={};assert.equal(p.declencherEmote(7),null);assert(p.working);
for(let i=0;i<120;i++)p.animate(1/60);
const avant=p.parts.armL.rotation.x;p.working=null;p.animate(1/60);
assert(Math.abs(p.parts.armL.rotation.x-avant)<.3,'Sortie de poste brutale');
for(let i=0;i<90;i++)p.animate(1/60);assert(Math.abs(p.parts.armL.rotation.x)<.005);
p.reset();p.oisif=10;p.regard=.8;p.reset();assert.equal(p.oisif,0);assert.equal(p.regard,0);
console.log(`${EMOTES.length} scènes, ${EMOTES.length*18} interruptions marche/accroupi à 30/60/144 Hz, appui des vraies semelles ±${(pireSol*1000).toFixed(1)} mm, variation maximale ${(pireAngle*180/Math.PI).toFixed(1)}° par image à 120 Hz. Retour du poste et index invalides OK.`);

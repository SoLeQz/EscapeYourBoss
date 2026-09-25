import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../../src/player.js';
import { NPC } from '../../src/npc.js';
import { Entrees } from '../../src/input.js';
import { mesurerVue, bilanVisibilite, directionMenace } from '../../src/perception.js';
import { mixSpatial, GameAudio } from '../../src/audio.js';
import { creerInteractions, lancerDiversion, actionAccessible } from '../../src/office.js';
import { DUREE_TRAVAIL, travailProtege, avancerTravail } from '../../src/travail.js';
import { EMOTES } from '../../src/emotes.js';
import { NIVEAUX, PLANS } from '../../src/levels.js';
import { buildLevel } from '../../src/level.js';
import { buildMaterials } from '../../src/materials.js';

const warn = console.warn; console.warn = (...a) => { if (!String(a[0]).includes('serialize Texture')) warn(...a); };
const scene = new THREE.Scene();
const level = { obstacles: [{x1:-2,x2:2,z1:1,z2:2,h:2}], playerStart:{x:0,z:0,yaw:0} };
const p = new Player(scene,level), input = new Entrees();
input.add('KeyW'); input.add('ShiftLeft');
for(let i=0;i<180;i++) p.update(1/60,input,0);
assert(p.pos.z < .67 && p.speed < .001 && !p.running && !p.moving);
assert.equal(p.noiseRadius,0); assert(p.stamina > .99);
assert(Math.abs(p.parts.legL.rotation.x)<.001);
console.log('Collision : animation, bruit et sprint arrêtés contre le mur.');
const n = {pos:{x:0,z:0}, eyeY:1.6, headYaw:0, viewDist:12, hearDist:2, fov:Math.PI/2};
const cible = {pos:{x:0,z:6},chestY:1.3};
const meuble=[{x1:-1,x2:1,z1:3,z2:4,h:1.15}];
assert(mesurerVue(n,cible,meuble).visible);
cible.chestY=.52;
assert(!mesurerVue(n,cible,meuble).visible);
assert(mesurerVue(n,cible,meuble).masque);
cible.pos.x=3;
assert(mesurerVue(n,cible,meuble).visible, 'Un meuble à côté ne doit pas cacher');
cible.pos={x:0,z:-6}; assert(!mesurerVue(n,cible,[]).visible);
const mix=bilanVisibilite([{sawThisFrame:true,vue:{masque:false}},{sawThisFrame:false,vue:{masque:true}}]);
assert(mix.visible && mix.masque, 'Un collègue masqué n’annule pas un autre témoin');
assert(bilanVisibilite([{sawThisFrame:true},{sawThisFrame:false}]).visible);
console.log('Visibilité : hauteur, occlusion réelle, angle et témoin supplémentaire vérifiés.');
assert(mixSpatial({x:5,z:0},{x:0,z:0},0).pan < 0);
assert(mixSpatial({x:5,z:0},{x:0,z:0},Math.PI).pan > 0);
assert(mixSpatial({x:20,z:0},{x:0,z:0},0).gain < mixSpatial({x:2,z:0},{x:0,z:0},0).gain);
assert(Math.abs(directionMenace({x:0,z:-3},{x:0,z:0},0))===Math.PI);
const audio = new GameAudio();
for(const method of ['alerte','alerteCramee','alarm','fail','boing','fanfare','sifflet','trompette']) assert.equal(audio[method],undefined);
console.log('Sons : panorama lié à la caméra, atténuation et suppression des alertes/emotes.');

p.level.obstacles=[];input.clear();
const poses=[];
for(let i=0;i<EMOTES.length;i++) {
  p.reset();p.declencherEmote(i);let maxY=0;const signature=[];
  for(let f=0;f<Math.ceil((EMOTES[i].duree+.6)*60);f++) {
    p.update(1/60,input,0);maxY=Math.max(maxY,p.parts.root.position.y-.85);
    if(f%20===0) signature.push(...['armL','armR','elbowL','elbowR','mainL','mainR','legL','legR','upper','head'].flatMap(k=>p.parts[k].rotation.toArray().slice(0,3)));
    p.mesh.updateMatrixWorld(true);
    for(const k of ['armL','armR','legL','head']) assert(p.parts[k].matrixWorld.elements.every(Number.isFinite));
  }
  assert.equal(p.emote,null);
  assert(Math.abs(p.parts.root.position.y-.85)<.001);
  assert(Math.abs(p.parts.legL.rotation.z)<.001);
  if(EMOTES[i].id==='celebration') assert(maxY>.3, `Saut trop faible : ${maxY}`);
  poses.push(signature);
}
for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++) {
  const m=Math.min(poses[i].length,poses[j].length);
  // Les poignets et coudes distinguent notamment le 67 : inclure ces articulations.
  const ecart=Math.sqrt(poses[i].slice(0,m).reduce((sum,v,k)=>sum+(v-poses[j][k])**2,0)/m);
  assert(ecart>.16,`Emotes trop similaires : ${EMOTES[i].id} / ${EMOTES[j].id} (${ecart})`);
}
p.declencherEmote(1);for(let f=0;f<60;f++)p.update(1/60,input,0);
input.add('KeyW');for(let f=0;f<40;f++)p.update(1/60,input,0);assert.equal(p.emote,null);
console.log(`${EMOTES.length} emotes : poses distinctes, fin et interruption sans résidu.`);

const ctx=document.createElement().getContext();for(const key of ['save','restore','translate','arc'])ctx[key]=()=>{};
const mat=buildMaterials();
for(const niv of NIVEAUX) {
  const plan=PLANS[niv.plan],l=buildLevel(scene,mat,plan,niv);
  const npcs=niv.pnj(plan).map(cfg=>({cfg}));
  const actions=creerInteractions(l,plan,npcs);
  assert.equal(actions.filter(a=>a.type==='travail').length,2,`Deux postes libres à l'étage ${niv.id}`);
  for(const it of actions) assert(actionAccessible(it,{pos:{x:it.x,z:it.z}},l.obstacles),`Action inaccessible : ${niv.id}/${it.id}`);
  l.dispose();
}
const fake = (x,suspicion=0) => ({pos:{x,z:-14},suspicion,say(){}});
const colleagues=[fake(-15),fake(-15,.7),fake(5)];
const it={source:{x:-18,z:-14}};let calls=0;
assert.equal(lancerDiversion(it,colleagues,{impression(){calls++;}}),1);
assert.equal(lancerDiversion(it,colleagues,{impression(){calls++;}}),0);
assert.equal(calls,1);assert.equal(colleagues[1].diversion,undefined);
console.log('Bureau : 2 postes libres accessibles par étage ; diversion limitée et alerte préservée.');

// Seuils inchangés par un faux « couvert », vrais effets de la comédie.
const actual = new NPC(scene,{name:'Test',role:'collègue',x:0,z:0,yaw:0,kind:'seated',scanAmp:0}, {obstacles:[]});
const player={pos:new THREE.Vector3(0,0,6),chestY:1.3,crouch:0,running:false,moving:false,noiseRadius:0, inCover:true};
const game={player,audio:{step(){}},showCones:true,showLabels:true};
actual.update(.1,game);const normal=actual.suspicion;
assert(!actual.hausseEpaules && !actual.bubble, 'Fausse réaction d’alerte au démarrage');
actual.reset();player.inCover=false;actual.update(.1,game);assert.equal(actual.suspicion,normal);
// La protection fonctionne près/loin, face au boss, même déjà soupçonné.
for (const boss of [false, true]) for (const distance of [1.5, 6]) {
  actual.isBoss=boss; actual.reset(); actual.suspicion=.92; actual.state='observation';
  player.pos.set(0,0,distance);
  player.working={type:'travail',x:0,z:distance,restant:DUREE_TRAVAIL};
  game.hunting=true;
  for(let i=0;i<90;i++) {
    actual.update(1/60,game);
    assert.equal(actual.state,'travail', 'Collègue rouge malgré la protection');
    assert(!actual.bang.visible, 'Point d’exclamation conservé');
  }
  assert(actual.suspicion<.92, 'Les soupçons doivent retomber');
}
// Une bascule rapide ne gomme pas la méfiance : elle ne paie que du temps protégé.
actual.reset();actual.suspicion=.8;actual.state='observation';
actual.update(1/60,game);assert(actual.suspicion>.75 && actual.state==='travail');
player.working=null;actual.update(1/60,game);
assert.equal(actual.state,'observation', 'Les soupçons ont été effacés par un appui éclair');
actual.reset();player.working={type:'travail',x:0,z:6,restant:0};actual.update(.1,game);
assert(actual.suspicion>0, 'Protection d’un poste épuisé');
player.working={type:'travail',x:5,z:6,restant:12};assert(!travailProtege(player));
actual.dispose();
console.log('Protection : collègues et boss, de près/de loin, soupçons en baisse et aucune remise à zéro par spam.');

// Durée cumulée, avertissement unique, expiration exacte et retour au risque.
p.reset();input.clear();const bureau={type:'travail',x:p.pos.x,z:p.pos.z,restant:DUREE_TRAVAIL};
p.working=bureau;
for(let i=0;i<120;i++) avancerTravail(p,1/60);
assert(Math.abs(bureau.restant-10)<1e-6);
input.add('KeyW');p.update(1/60,input,0);assert(!travailProtege(p));
input.clear();p.pos.set(bureau.x,0,bureau.z);p.vel.set(0,0,0);p.moving=false;
p.working=bureau;assert(Math.abs(bureau.restant-10)<1e-6, 'Budget rechargé en se rasseyant');
let avertis=0, expires=0;
for(let i=0;i<600;i++) {
  const event=avancerTravail(p,1/60);
  if(event==='avertir')avertis++;
  if(event==='expire')expires++;
}
assert.equal(avertis,1);assert.equal(expires,1);assert.equal(bureau.restant,0);
assert.equal(p.working,null);assert(!travailProtege(p));
p.working={type:'travail',x:p.pos.x,z:p.pos.z,restant:12};p.declencherEmote(0);
assert(!travailProtege(p),'Une emote conserve la protection');
p.emote=null;p.working={type:'travail',x:p.pos.x,z:p.pos.z,restant:12};
input.bascules.accroupir=true;p.update(1/60,input,0);assert(!travailProtege(p));
p.reset();assert(!travailProtege(p));
console.log('Crédit : 12 s cumulées, alerte à 3 s, expiration, déplacement, emote et accroupissement vérifiés.');

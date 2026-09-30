import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {prechargerAnatomieBlender} from '../../src/anatomie-blender.js';
import {Player} from '../../src/player.js';
import {EMOTES} from '../../src/emotes.js';
await prechargerAnatomieBlender(async n=>{const b=readFileSync(new URL('../../assets/'+n,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
for(const [id,dossier,v] of [['67','tendances-v05','v05'],['ela-ke-leitada','tendances-v05','v05'],
 ['aura-farming','tendances-v07','v07'],['griddy','tendances-v07','v07'],['floss','tendances-v07','v07']]){
 const source=JSON.parse(readFileSync(new URL(`../../art/emotes/${dossier}/${id}-export/${id}-${v}.json`,import.meta.url),'utf8'));
 const runtime=(await import(`../../assets/emote-${id}-${v}.js`)).default;
 assert.deepEqual(runtime,source,'Le runtime doit être exactement la sortie du .blend');
 const blend=readFileSync(new URL(`../../art/emotes/${dossier}/${id}-${v}.blend`,import.meta.url));assert(blend.length>100000,'Source Blender manquante');
 const e=EMOTES.find(e=>e.id===id);assert.equal(e.sourceBlender,source.source);assert.equal(e.duree,source.duree);
}
const p=new Player(new THREE.Scene(),{playerStart:{x:0,z:0,yaw:0},obstacles:[]});
const point=new THREE.Vector3(),q=new THREE.Quaternion();
function pose(id,t){p.reset();p.pos.set(0,0,0);p.yaw=0;p.declencherEmote(EMOTES.findIndex(e=>e.id===id));for(let elapsed=0;elapsed<t;elapsed+=1/120)p.animate(Math.min(1/120,t-elapsed));p.mesh.updateMatrixWorld(true);}
let hauts=[],bas=[];
for(let t=.75;t<3.7;t+=.08){
 pose('67',t);
 for(const side of ['L','R']){const normal=new THREE.Vector3(0,0,1).applyQuaternion(p.parts['main'+side].getWorldQuaternion(q));assert(normal.y>.82,`67 : paume ${side} tournée vers le bas à ${t}`);}
 const left=p.parts.mainL.getWorldPosition(point).y,right=p.parts.mainR.getWorldPosition(point).y;hauts.push(left-right);bas.push(p.parts.root.position.x);
 assert(p.parts._mainsBlender.every(m=>m.morphTargetInfluences[m.morphTargetDictionary.Ouvert]>.85),'Paumes non ouvertes');
}
assert(Math.max(...hauts)>.17&&Math.min(...hauts)<-.17,'Les mains ne se relaient pas en hauteur');
// Ela Ké Leitada : les contacts de la vidéo de référence doivent tomber juste dans le jeu.
const monde=n=>p.parts[n].getWorldPosition(new THREE.Vector3());
const T=k=>.692+.3526*k;
for(const t of [.69,1.04,1.40,1.75,T(22),T(24)]){pose('ela-ke-leitada',t);const d=monde('doigtsR').distanceTo(monde('bouche'));assert(d<.075,`Main droite loin de la bouche à ${t.toFixed(2)} s : ${d.toFixed(3)} m`);
 const pouce=monde('mainL'),torse=monde('upper');assert(pouce.z-torse.z>.2&&pouce.y>torse.y+.25,`Pouce pas devant la poitrine à ${t.toFixed(2)} s`);}
pose('ela-ke-leitada',T(15.9));assert(monde('doigtsL').distanceTo(monde('bouche'))<.075,'Main gauche loin de la bouche');
for(const t of [T(9.3),T(19.5),T(26),T(28.6)]){pose('ela-ke-leitada',t);const d=monde('doigtsR').distanceTo(monde('mainL'));assert(d<.09,`Main droite pas sur la montre à ${t.toFixed(2)} s : ${d.toFixed(3)} m`);
 assert(monde('mainL').y>monde('upper').y+.25,'Montre trop basse');}
pose('ela-ke-leitada',T(10.4));assert(monde('doigtsR').distanceTo(monde('bouche'))<.12,'Doigts loin du menton');
// Gestes v07 évalués sur le personnage réellement utilisé dans le jeu.
const grille=(bpm,t0)=>k=>t0+k*60/bpm,TG=grille(158,.35),TF=grille(128,.35),TU=grille(130,.35);
for(const t of [TG(4.5),TG(6.5)]){pose('griddy',t);const tete=monde('head');
 for(const side of ['L','R']){const m=monde('main'+side);assert(Math.abs(m.y-tete.y)<.15&&m.z>tete.z+.08&&Math.abs(m.x)<.18,`Griddy : main ${side} loin des yeux à ${t.toFixed(2)} s`);}
 assert(p.parts._mainsBlender.every(m=>m.morphTargetInfluences[m.morphTargetDictionary.Cercle]>.9),'Griddy : anneaux index-pouce absents');}
for(const [k,avant,arriere] of [[2,'footL','footR'],[4,'footR','footL']]){pose('griddy',TG(k));
 assert(monde(avant).z-monde(arriere).z>.13,`Griddy : talon ${avant} non avancé`);assert(new THREE.Vector3(0,0,1).applyQuaternion(p.parts[avant].getWorldQuaternion(new THREE.Quaternion())).y>.25,'Griddy : pointe non relevée');}
// Le retour devant précède l'inversion : six balancements par cycle.
for(const [k,croise,sens,devant] of [[.5,'mainR',-1,true],[1.35,'mainL',1,false],[2.15,'mainR',-1,true],[3,'mainL',1,true],[3.85,'mainR',-1,false],[4.65,'mainL',1,true]]){
 pose('floss',TF(k));const m=monde(croise),torse=monde('upper');
 assert(m.x*sens>.005,`Floss : ${croise} ne croise pas à ${k}`);
 assert(devant?m.z>torse.z+.12:m.z<torse.z-.12,`Floss : ${croise} pas ${devant?'devant':'derrière'} à ${k}`);
 assert(p.parts.root.position.x*sens<0,'Floss : bassin non opposé aux bras');
}
// Les paumes d'Aura gardent une séparation, et le pointé reste devant le buste.
for(const k of [1,2.5,4,5,6,7,9.5,11.5,13.5]){pose('aura-farming',TU(k));
 assert(monde('mainL').distanceTo(monde('mainR'))>.065,'Aura : mains superposées');
 assert(Math.abs(p.parts.root.rotation.z)<.08,'Aura : buste trop agité');}
for(const [k,side] of [[9.5,'R'],[11.5,'L']]){pose('aura-farming',TU(k));assert(monde('main'+side).z>monde('upper').z+.25,'Aura : geste pas projeté devant');}
// Contrôle continu : un poignet ne doit pas traverser le centre du bassin.
// Les captures des seules poses fortes ne détecteraient pas ce défaut de trajet.
p.reset();p.declencherEmote(EMOTES.findIndex(e=>e.id==='floss'));
for(let t=0;t<EMOTES.find(e=>e.id==='floss').duree;t+=1/120){
 p.animate(1/120);p.mesh.updateMatrixWorld(true);const bassin=monde('upper');
 for(const side of ['L','R']){const m=monde('main'+side);
  const dedans=m.y>bassin.y-.13&&m.y<bassin.y+.23&&Math.abs(m.x-bassin.x)<.13&&Math.abs(m.z-bassin.z)<.11;
  assert(!dedans,`Floss : poignet ${side} dans le bassin à ${t.toFixed(3)} s`);
 }
}
// Take the L : la lettre se lit de face (retour joueur : elle était à l'envers, « ⅃ »).
// Vue de face, la droite de l'écran est +x : index vers le haut, pouce vers +x.
{const bout=(nom,poignet)=>{const m=p.parts._mainsBlender.find(m=>m.name.includes(nom)),v=new THREE.Vector3();let loin=null,d=-1;
  for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,v);v.applyMatrix4(m.matrixWorld);const e=v.distanceTo(poignet);if(e>d){d=e;loin=v.clone();}}return loin;};
 for(const t of [.8,1.25,1.57,1.9,2.24,2.6,2.91,3.25,3.6]){pose('takeL',t);const w=monde('mainL'),index=bout('doigtsL',w).sub(w).normalize(),pouce=bout('pouceL',w).sub(w).normalize();
  assert(index.y>.85&&pouce.x>.85,`Take the L à ${t} s : L à l'envers (index ${index.toArray().map(v=>v.toFixed(2))}, pouce ${pouce.toArray().map(v=>v.toFixed(2))})`);}}
let minSol=Infinity,maxSol=-Infinity;
for(let t=.3;t<11.4;t+=.07){
 pose('ela-ke-leitada',t);assert(p.pos.length()<1e-8,'Une emote doit conserver la position de collision');
 let sol=Infinity;
 for(const side of ['L','R'])p.parts['foot'+side].traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++)sol=Math.min(sol,point.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).y)});
 minSol=Math.min(minSol,sol);maxSol=Math.max(maxSol,sol);
}
assert(minSol>-.005&&maxSol<.005,'Pieds flottants ou enterrés');
pose('67',2);p.syncOutline();for(let i=0;i<p._srcNodes.length;i++)if(p._srcNodes[i].morphTargetInfluences)assert.deepEqual(p._dstNodes[i].morphTargetInfluences,p._srcNodes[i].morphTargetInfluences);
// Musique Ela Ké Leitada : fichier présent, entièrement couvert par la danse, suivi par l'audio.
const jamal=EMOTES.find(e=>e.id==='ela-ke-leitada');assert.equal(jamal.son.fichier,'emote-ela-ke-leitada-son-v01.mp3');
assert.deepEqual(EMOTES.filter(e=>e.son).map(e=>e.id),['ela-ke-leitada'],'Seul l’extrait déjà fourni est livré ; aucun original ne doit être prétendu présent');
function dureeMp3(fichier){
 const mp3=readFileSync(new URL('../../assets/'+fichier,import.meta.url));let trames=0;
 for(let i=mp3[0]===0x49?10+(mp3[6]<<21|mp3[7]<<14|mp3[8]<<7|mp3[9]):0;i+4<=mp3.length;){const h=mp3.readUInt32BE(i);if((h>>>21)!==0x7ff){i++;continue}const br=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320][h>>>12&15],sr=[44100,48000,32000][h>>>10&3];if(!br||!sr){i++;continue}trames++;i+=Math.floor(144*br*1000/sr)+(h>>>9&1)}
 return trames*1152/48000;
}
// Chaque musique est entièrement couverte par sa danse, sans long silence final.
for(const e of EMOTES.filter(e=>e.son)){const d=dureeMp3(e.son.fichier);assert(d>5&&d<=e.duree&&e.duree-d<.8,`${e.id} : son de ${d} s pour une danse de ${e.duree} s`);}
const dureeSon=dureeMp3(jamal.son.fichier);assert(dureeSon>11,'Extrait Ela Ké Leitada tronqué');
// Les pistes synthétiques v06 ne doivent plus accompagner les nouvelles courbes.
for(const id of ['aura-farming','griddy','floss'])assert.equal(EMOTES.find(e=>e.id===id).son,null);
const {GameAudio}=await import('../../src/audio.js');const journal=[];
const ctx={currentTime:0,createGain:()=>({gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(v,t){journal.push(['fondu',v,t])}},connect(n){return n},disconnect(){}}),
 createBufferSource:()=>({connect(n){return n},disconnect(){},start(w,o){journal.push(['start',o])},stop(t){journal.push(['stop',t])}}),decodeAudioData:async()=>({duration:dureeSon})};
const audio=new GameAudio();audio.ctx=ctx;audio.master=ctx.createGain();await audio.chargerSon(jamal.son.fichier,async()=>new ArrayBuffer(8));
const emote={def:jamal,t:.5};audio.suivreMusique(emote);assert.deepEqual(journal.pop(),['start',.5],'Départ à la position de la danse');
ctx.currentTime=1;emote.t=1.55;audio.suivreMusique(emote);assert.equal(journal.length,0,'Relance inutile alors que le son est calé');
emote.t=2;audio.suivreMusique(emote);assert.deepEqual(journal.at(-1),['start',2],'Pas de recalage après un retard');journal.length=0;
audio.suivreMusique(null);assert(journal.some(([k])=>k==='stop')&&journal.some(([k,v])=>k==='fondu'&&v===0)&&!audio.musique,'Musique non coupée');journal.length=0;
emote.t=dureeSon+.1;audio.suivreMusique(emote);assert.equal(journal.length,0,'Musique relancée après sa fin');
audio.suivreMusique({def:EMOTES.find(e=>e.id==='67'),t:1});assert.equal(journal.length,0,'Le 67 reste muet');
// Musique du coéquipier : seconde piste, placée à sa position, indépendante de la sienne.
const gainSimple=ctx.createGain;ctx.createGain=()=>{const g=gainSimple();g.gain.setTargetAtTime=v=>journal.push(['volume',v]);return g};
ctx.createStereoPanner=()=>({pan:{setTargetAtTime(){}},connect(n){return n},disconnect(){}});
ctx.currentTime=0;audio.listen({x:0,z:0},0);audio.suivreMusiqueDistante({def:jamal,t:.5},{x:9,z:0});
assert(journal.some(([k,v])=>k==='start'&&v===.5)&&audio.musiqueDistante&&!audio.musique,'Piste du coéquipier absente');
assert(Math.abs(journal.find(([k])=>k==='volume')[1]-.375)<1e-9,'Volume à 9 m : moitié du volume de près');
journal.length=0;audio.suivreMusiqueDistante(null);assert(journal.some(([k])=>k==='stop')&&!audio.musiqueDistante,'Piste du coéquipier non coupée');
await import('../animations/verifier.mjs');
await import('../gameplay/verifier.mjs');
console.log('Clips Blender : provenance, paumes en haut, alternance, doigts, contacts main-bouche/montre d’Ela Ké Leitada, anneaux des mains et talons du Griddy, six balancements du Floss, isolations et pointés d’Aura Farming, L de Take the L lisible de face, appuis, contour et musiques OK.');

import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { prechargerAccessoires, etatAccessoires } from '../../src/accessoires-blender.js';
import { buildMaterials } from '../../src/materials.js';
import { buildLevel, collide } from '../../src/level.js';
import { NIVEAUX, PLANS, pnjDuNiveau } from '../../src/levels.js';
import { Player } from '../../src/player.js';
import { Interactifs, DUREE_OBSCURITE, diversionDistributeur } from '../../src/interactifs.js';
import { Multijoueur } from '../../src/multijoueur.js';
import { avancerTravail, travailProtege } from '../../src/travail.js';
import * as Secrets from '../../src/secrets.js';
import * as Store from '../../src/store.js';
await prechargerAccessoires(async n => {const b=readFileSync(new URL('../../assets/'+n,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
assert.equal(Object.keys(etatAccessoires()).length,11);
assert.deepEqual(readFileSync(new URL('../../assets/accessoires-v01.glb',import.meta.url)),readFileSync(new URL('../../art/accessoires-v01/accessoires-v01.glb',import.meta.url)));
const scene=new THREE.Scene(), mat=buildMaterials();
const muet=new Proxy({}, {get:()=>()=>{}});
const creer=index=>{
 const niv=NIVEAUX[index],level=buildLevel(scene,mat,PLANS[niv.plan],niv),p=new Player(scene,level);
 const j={level,player:p,niveau:niv,niveauIndex:index,npcs:[],audio:muet,ui:muet,timeLeft:100,elapsed:0,hunting:false,etat:structuredClone(Store.DEFAUT),secrets:[],eclairages:[],
  eclairageCoupe(c){this.eclairages.push(c)},decouvrir(id){this.secrets.push(id)},ramasserCanard(c){Secrets.noterCanard(this.etat,niv.id,c.index)}};
 j.interactifs=new Interactifs(j);j.interactifs.preparer(level);return j;
};
const j=creer(6),i=j.interactifs;
j.npcs=[{viewDist:12,cone:new THREE.Group(),pos:new THREE.Vector3(0,0,0),suspicion:0,say(){}}];
const disj=i.liste.find(a=>a.type==='disjoncteur');
i.interagir(disj);assert(Math.abs(j.npcs[0].viewDist-6.6)<1e-9);assert.equal(i.obscurite,DUREE_OBSCURITE);
for(let f=0;f<901;f++)i.mettreAJour(1/60);
assert.equal(j.npcs[0].viewDist,12);assert.equal(j.eclairages.at(-1),false);
i.interagir(disj);assert(i.obscurite<=0,'Disjoncteur réutilisé');
const passage=i.liste.find(a=>a.type==='passage');j.level.nav={};i.interagir(passage);
assert(passage.ouvert&&passage.obstacle.noClip&&j.level.nav===undefined);
const distributeur=i.liste.find(a=>a.type==='distributeur');i.interagir(distributeur);
for(let f=0;f<250;f++)i.mettreAJour(1/60);
assert.equal(distributeur.etat,'coince');
const guest=creer(6);guest.coequipier=new Player(scene,guest.level);guest.multi={id:2};guest.player.reseauId=2;guest.coequipier.reseauId=1;guest.coequipiers=new Map([[1,guest.coequipier]]);
guest.interactifs.appliquerEtat(i.etat());
assert(guest.interactifs.liste.find(a=>a.type==='passage').ouvert);
assert.equal(guest.interactifs.liste.find(a=>a.type==='distributeur').etat,'coince');
i.reinitialiser();assert(!passage.ouvert&&!passage.obstacle.noClip);
// L'étagère se referme et se rouvre des deux côtés, jamais sur quelqu'un.
{
 const k=creer(6),ki=k.interactifs,porte=ki.liste.find(a=>a.type==='passage'),[dehors,dedans]=porte.cotes;
 assert(ki.dansPiece(porte,{pos:new THREE.Vector3(dedans.x,0,dedans.z)})&&!ki.dansPiece(porte,{pos:new THREE.Vector3(dehors.x,0,dehors.z)}),'Côtés de l’étagère');
 k.player.pos.set(dehors.x,0,dehors.z);assert(ki.accessibles(k.player).includes(porte));ki.interagir(porte);assert(porte.ouvert);
 const o=porte.obstacle;k.player.pos.set((o.x1+o.x2)/2,0,(o.z1+o.z2)/2);ki.interagir(porte);assert(porte.ouvert,'Étagère refermée sur le joueur');
 k.player.pos.set(dedans.x,0,dedans.z);assert(ki.accessibles(k.player).includes(porte),'Étagère inaccessible depuis la salle');
 assert.equal(ki.libelle(porte,k.player),'Refermer l’étagère');k.level.nav={};ki.interagir(porte);
 assert(!porte.ouvert&&!o.noClip&&!o.seeThrough&&k.level.nav===undefined,'Étagère non refermée');
 for(let f=0;f<120;f++)ki.mettreAJour(1/60);assert.equal(porte.roles.porte?.rotation.y??0,0);
 assert.equal(ki.libelle(porte,k.player),'Pousser l’étagère');
 const p=k.player.pos.clone();for(let f=0;f<60;f++){p.x+=Math.sign(dehors.x-dedans.x)*.05;collide(k.level.obstacles,p,.34)}assert(ki.dansPiece(porte,{pos:p}),'On traverse l’étagère fermée');
 const invite=creer(6);invite.interactifs.appliquerEtat({...ki.etat(),a:ki.etat().a.map((v,n)=>ki.liste[n]===porte?{...v,ouvert:true}:v)});
 const pi=invite.interactifs.liste.find(a=>a.type==='passage');assert(pi.ouvert&&pi.obstacle.noClip);
 invite.interactifs.appliquerEtat(ki.etat());assert(!pi.ouvert&&!pi.obstacle.noClip,'Fermeture non partagée');
 // Enfermé pendant la traque : le directeur vise l'étagère, puis tire le livre rouge.
 assert.deepEqual(ki.cibleTraque(k.player),dehors);assert.equal(ki.cibleTraque({pos:new THREE.Vector3(0,0,0)}),null);
 const boss={isBoss:true,pos:new THREE.Vector3(dehors.x,0,dehors.z),say(){}};k.npcs=[boss];ki.mettreAJour(1/60);assert(!porte.ouvert,'Ouverte hors traque');
 k.hunting=true;ki.mettreAJour(1/60);assert(porte.ouvert,'Le directeur n’ouvre pas');
}
// Micro-sieste : on s'allonge vraiment dans le hamac, puis on se relève.
{
 const {commencerSieste,avancerSieste,reveiller,refusSieste,SIESTE}=await import('../../src/sieste.js');
 const k=creer(6),hamac=k.interactifs.liste.find(a=>a.type==='sieste'),p=k.player,L=hamac.lit;
 assert(L&&L.tete,'Hamac sans lit');assert.equal(refusSieste(p,{hunting:true})[0],'Pas le moment de dormir');assert.equal(refusSieste(p),null);
 p.pos.set(hamac.x,0,hamac.z);p.stress=.9;p.stamina=.1;commencerSieste(p,hamac);
 const entree={actif:()=>false,bascules:{}};
 for(let f=0;f<120;f++){p.update(1/60,entree,0)}
 assert(Math.abs(p.mesh.rotation.x+Math.PI/2)<.02,'Pas allongé');
 p.mesh.updateMatrixWorld(true);const tete=p.parts.head.getWorldPosition(new THREE.Vector3()),pied=p.parts.footL.getWorldPosition(new THREE.Vector3());
 assert(tete.distanceTo(new THREE.Vector3(L.tete.x,tete.y,L.tete.z))<.35,'Tête loin de l’oreiller : '+tete.toArray());
 assert(tete.y>.65&&tete.y<1.15&&pied.y>.5&&pied.y<1.15,`Hauteurs hors de la toile : tête ${tete.y.toFixed(2)}, pied ${pied.y.toFixed(2)}`);
 assert(Math.hypot(pied.x-L.x,pied.z-L.z)<1.3,'Pieds hors du hamac');
 let secret=false;for(let f=0;f<SIESTE.secret*60+2;f++)if(avancerSieste(p,1/60)==='secret')secret=true;
 assert(secret&&p.stress===0&&p.stamina===1,'Sieste sans effet');assert(p.pos.distanceTo(new THREE.Vector3(hamac.x,0,hamac.z))<1e-9,'Le joueur a glissé');
 p.update(1/60,{actif:a=>a==='avancer',bascules:{}},0);assert(p.sieste.reveil,'Bouger ne réveille pas');
 assert(reveiller(p)>SIESTE.secret);for(let f=0;f<120;f++)p.update(1/60,entree,0);
 assert(Math.abs(p.mesh.rotation.x)<.01&&p.mesh.position.distanceTo(p.pos)<.05&&p._lit===null,'Pas relevé');
}
const b=creer(7),bi=b.interactifs,box=bi.liste.find(a=>a.type==='carton');
b.player.pos.set(box.x,0,box.z);bi.interagir(box);assert.equal(b.player.deguisement,'carton');assert(!b.player.mesh.visible&&box.obstacle.noClip);
b.player.setOutline(1);assert(!b.player.outline.visible);assert.equal(b.player.declencherEmote(0),null);
const p=b.player.pos.clone();bi.interagir(box);assert.equal(b.player.deguisement,null);assert(b.player.mesh.visible&&!box.obstacle.noClip);
assert(b.player.pos.equals(p),'Sortir du carton téléporte le joueur');const valide=p.clone();collide(b.level.obstacles,valide,b.player.radius);assert(valide.distanceTo(p)<.01);
const client=creer(7);client.coequipier=new Player(scene,client.level);client.multi={id:2};client.player.reseauId=2;client.coequipier.reseauId=1;client.coequipiers=new Map([[1,client.coequipier]]);
b.coequipier=new Player(scene,b.level);b.coequipier.reseauId=2;b.coequipiers=new Map([[2,b.coequipier]]);b.coequipier.pos.set(box.x,0,box.z);bi.interagir(box,b.coequipier);
client.interactifs.appliquerEtat(bi.etat());assert.equal(client.player.deguisement,'carton');assert.equal(client.interactifs.liste.find(a=>a.type==='carton').porte,client.player);
client.player.pos.x+=.2;client.interactifs.mettreAJour(.1,true);assert(!client.player.mesh.visible);
bi.reinitialiser();client.interactifs.appliquerEtat(bi.etat());assert.equal(client.player.deguisement,null);
// L'invité n'exécute jamais une seconde fois l'effet des accessoires.
client.npcs=[{suspicion:0,pos:new THREE.Vector3(),lastSeen:new THREE.Vector3()}];
const robot=client.interactifs.robots[0];client.player.pos.set(robot.pos.x,0,robot.pos.z);client.interactifs.mettreAJour(.1,true);assert.equal(client.npcs[0].suspicion,0);
// Crédit partagé réel : l'hôte consomme la même instance de poste pour son invité.
const poste={id:'travail-1',type:'travail',x:0,z:0,restant:12};
const h={player:b.player,coequipier:b.coequipier,coequipiers:b.coequipiers,actionsBureau:[poste]};const m=new Multijoueur(h,{surEvenement(){}});m.role='hote';
m.pairs.set(2,{etat:{x:0,z:0,yaw:0,c:0,r:0,m:0,v:0,e:-1,w:{id:poste.id,restant:12},s:0}});
for(let f=0;f<800;f++){m.animerCoequipier(1/60);avancerTravail(h.coequipier,1/60)}
assert.equal(poste.restant,0);assert(!travailProtege(h.coequipier));
// Les découvertes survivent à la sauvegarde et les anciennes données sont nettoyées.
const etat=structuredClone(Store.DEFAUT);assert(Secrets.noterCanard(etat,10,2));assert(!Secrets.noterCanard(etat,10,2));
assert(Secrets.noterSecret(etat,'nacelle'));assert(!Secrets.noterSecret(etat,'inconnu'));
globalThis.window={jeuStore:{charger:async()=>({...etat,canards:{10:[2,2,-1,99],999:[0]}})}};
const charge=await Store.charger();assert.deepEqual(charge.canards,{10:[2]});assert.deepEqual(charge.secrets,['nacelle']);
console.log('Accessoires Blender : 11 modèles, coupure temporaire, bibliothèque, distributeur, carton et réinitialisation. Coop : autorité, carton distant et crédit de travail limité. Collection sauvegardée.');

// Migration 1.8 : conserver le souvenir et la cape, sans comparer 6 et 10 étages.
globalThis.window.jeuStore.charger=async()=>({niveauxFinis:[1,2,3,4,5,6],records:{speedrun:123}});
const ancien=await Store.charger();assert.equal(ancien.records.speedrun,undefined);assert.equal(ancien.records.speedrunSixEtages,123);
const {estDebloquee,PIECES}=await import('../../src/garde-robe.js');assert(estDebloquee(PIECES.torse.find(p=>p.id==='cape'),ancien));
// Le bilan réel ne valide plus un entraînement commencé au dernier étage.
const vm=await import('node:vm');
const texte=readFileSync(new URL('../../src/main.js',import.meta.url),'utf8');
const elements=new Map(),doc={exitPointerLock(){},querySelector(){return null},getElementById(id){if(!elements.has(id))elements.set(id,{});return elements.get(id)}};
const {nouveautes}=await import('../../src/garde-robe.js');
const {heurePointage,noteDepart}=await import('../../src/intranet.js');
const Game=vm.runInNewContext(texte.slice(texte.indexOf('class Game {'),texte.indexOf('// Le verrouillage échoue'))+'\nGame',
 {document:doc,NIVEAUX,nouveautes,formaterTemps:String,heurePointage,noteDepart,SORTIES:{stairs:{nom:'Escaliers'}}});
const partie=Object.create(Game.prototype);
Object.assign(partie,{state:'play',mode:'speedrun',niveauIndex:9,niveau:NIVEAUX[9],elapsed:30,srDepart:9,srTemps:0,srSplits:[],etat:structuredClone(Store.DEFAUT),audio:muet,ui:muet,sauver(){}});
partie.terminerNiveau('stairs');assert.equal(partie.etat.records.speedrun,undefined);
console.log('Progression : ancien record conservé, cape préservée, entraînement exclu du record à dix étages.');

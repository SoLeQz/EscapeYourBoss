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
const elements=new Map(),doc={exitPointerLock(){},getElementById(id){if(!elements.has(id))elements.set(id,{});return elements.get(id)}};
const {nouveautes}=await import('../../src/garde-robe.js');
const Game=vm.runInNewContext(texte.slice(texte.indexOf('class Game {'),texte.indexOf('// Le verrouillage échoue'))+'\nGame',
 {document:doc,NIVEAUX,nouveautes,formaterTemps:String,SORTIES:{stairs:{nom:'Escaliers'}}});
const partie=Object.create(Game.prototype);
Object.assign(partie,{state:'play',mode:'speedrun',niveauIndex:9,niveau:NIVEAUX[9],elapsed:30,srDepart:9,srTemps:0,srSplits:[],etat:structuredClone(Store.DEFAUT),audio:muet,ui:muet,sauver(){}});
partie.terminerNiveau('stairs');assert.equal(partie.etat.records.speedrun,undefined);
console.log('Progression : ancien record conservé, cape préservée, entraînement exclu du record à dix étages.');

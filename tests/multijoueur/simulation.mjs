import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import {Multijoueur} from '../../src/multijoueur.js';
const envoyes=[],actions=[];
const jeu={mode:'multi',niveauIndex:5,niveauAttendu:5,coequipiers:new Map([[2,{}],[3,{}],[4,{}]]),actionDistante:(...a)=>actions.push(a)};
const m=new Multijoueur(jeu,{envoyer:x=>envoyes.push(x),surEvenement(){}});m.role='hote';m.connecte=true;m.manche=7;
for(const id of [2,3,4])m.pairs.set(id,{id,nom:'J'+id,pret:null,sorti:false,etat:null});
const msg=(de,t,extra={})=>m.surMessage({de,t,idx:5,manche:7,...extra});
msg(2,'pret',{index:5});msg(3,'pret',{index:5});assert.equal(m.pretIndex,null);
msg(4,'pret',{index:5});assert.equal(m.pretIndex,5);
for(const de of [2,3])msg(de,'joueur',{x:0,z:0,yaw:0,c:0,v:0,s:1});assert(!m.sortiDistant);
msg(4,'joueur',{x:0,z:0,yaw:0,c:0,v:0,s:1});assert(m.sortiDistant);
msg(3,'action',{id:'acc:2'});assert.deepEqual(actions,[['acc:2',3]]);
msg(4,'action',{id:'ancien',manche:6});assert.equal(actions.length,1);
m.envoyer({t:'cafe'},4);assert.equal(envoyes.at(-1)._pour,4);
m.reinitialiser();assert(!m.sortiDistant);assert([...m.pairs.values()].every(p=>!p.etat));
// Un invité charge plus vite que l'hôte : sa disponibilité ne doit pas se perdre.
jeu.niveauIndex=-1;msg(4,'pret',{index:5});assert.equal(m.pairs.get(4).pret,5);
// Le monde et les résultats ne sont acceptés que depuis l'hôte.
const client={mode:'multi',niveauIndex:5,coequipiers:new Map(),player:{stamina:0,stress:.8}};
const c=new Multijoueur(client,{surEvenement(){}});c.role='invite';c.id=4;c.manche=7;c.pairs.set(1,{});c.pairs.set(2,{});
c.surMessage({de:2,t:'monde',idx:5,manche:7,el:99});assert.equal(c.monde,null);
c.surMessage({de:1,t:'monde',idx:5,manche:6,el:99});assert.equal(c.monde,null);
c.surMessage({de:1,t:'monde',idx:5,manche:7,el:12});assert.equal(c.monde.el,12);
console.log('Simulation : tous prêts, tous sortis, expéditeur et destinataire distincts, anciens messages ignorés, autorité de l’hôte.');

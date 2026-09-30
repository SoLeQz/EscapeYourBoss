import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {creerSession,rechercherParties,lireAdresse}=createRequire(import.meta.url)('../../electron/reseau.cjs');
const ports={portJeu:47900,portDecouverte:47901};
const attendre=(fn,ms=4000)=>new Promise((res,rej)=>{const t=Date.now(),i=setInterval(()=>{const v=fn();if(v){clearInterval(i);res(v)}else if(Date.now()-t>ms){clearInterval(i);rej(Error('Délai : '+fn))}},10)});
assert.deepEqual(lireAdresse('nom.ply.gg:12345'),{hote:'nom.ply.gg',port:12345});
assert.deepEqual(lireAdresse('[::1]:47900'),{hote:'::1',port:47900});
for(const s of ['',':123','nom:','nom:abc','nom:70000'])assert.throws(()=>lireAdresse(s));
const sessions=[],events=[];
function creer(version='1.10.0'){const e=[];events.push(e);const s=creerSession({version,evenement:x=>e.push(x),adresseEcoute:'127.0.0.1',...ports});sessions.push(s);return s}
const h=creer(),a=creer(),b=creer(),c=creer();
try{
 await h.heberger('Hôte');
 let annonces=await rechercherParties({duree:1200,version:'1.10.0',portDecouverte:ports.portDecouverte});
 assert(annonces.some(p=>p.joueurs===1&&p.max===4&&p.place));
 for(const [i,s] of [a,b,c].entries()){await s.rejoindre('127.0.0.1:47900','Ami '+i);await attendre(()=>events[i+1].some(e=>e.type==='connecte'))}
 await attendre(()=>events.slice(0,4).every(e=>e.some(x=>x.type==='effectif'&&x.joueurs.length===4)));
 const ids=events.slice(1,4).map(e=>e.find(x=>x.type==='connecte').id);assert.equal(new Set(ids).size,3);
 // Identité authentifiée et relais entre tous les invités, sans boucle ni doublon.
 a.envoyer({t:'joueur',de:999,_pour:999,x:42});
 await attendre(()=>events.slice(0,4).filter((_,i)=>i!==1).every(e=>e.some(x=>x.type==='message'&&x.msg.x===42)));
 for(const i of [0,2,3])assert.equal(events[i].find(e=>e.type==='message'&&e.msg.x===42).msg.de,ids[0]);
 assert(!events[1].some(e=>e.type==='message'&&e.msg.x===42));
 h.envoyer({t:'cafe',_pour:ids[1]});await attendre(()=>events[2].some(e=>e.msg?.t==='cafe'));
 assert(!events[1].some(e=>e.msg?.t==='cafe'));assert(!events[3].some(e=>e.msg?.t==='cafe'));
 a.envoyer({t:'gagne'});a.envoyer({t:'monde'});await new Promise(r=>setTimeout(r,100));
 assert(!events[0].some(e=>['gagne','monde'].includes(e.msg?.t)));
 const cinquieme=creer();await cinquieme.rejoindre('127.0.0.1:47900','Cinquième');
 await attendre(()=>events[4].some(e=>e.type==='deconnecte'&&/complète/.test(e.raison)));
 // Une déconnexion libère une place sans couper les autres connexions.
 b.fermer();await attendre(()=>events[0].some(e=>e.type==='parti'&&e.id===ids[1]));assert(h.connecte&&a.connecte&&c.connecte);
 h.envoyer({t:'lancer',index:0});const tardif=creer();await tardif.rejoindre('127.0.0.1:47900','Tardif');
 await attendre(()=>events[5].some(e=>e.type==='deconnecte'&&/en cours/.test(e.raison)));
 h.envoyer({t:'menu'});const ancien=creer('1.9.0');await ancien.rejoindre('127.0.0.1:47900','Ancien');
 await attendre(()=>events[6].some(e=>e.type==='deconnecte'&&/Versions différentes/.test(e.raison)));
 const nouveau=creer();await nouveau.rejoindre('127.0.0.1:47900','Nouveau');await attendre(()=>events[7].some(e=>e.type==='connecte'));
 assert(events[7].find(e=>e.type==='connecte').id!==ids[1]);
 h.fermer();await attendre(()=>events[1].some(e=>e.type==='deconnecte'));
 console.log('Réseau à 4 : salon, identités, relais, message ciblé, 5e refusé, départ, reconnexion, partie en cours et versions vérifiés.');
}finally{for(const s of sessions)s.fermer()}

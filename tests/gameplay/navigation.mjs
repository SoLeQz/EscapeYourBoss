// Le directeur, en traque, doit contourner murs et bureaux pour rejoindre Lao D
// (retour utilisateur : il restait collé au premier mur rencontré).
import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NPC } from '../../src/npc.js';
import { NIVEAUX, PLANS } from '../../src/levels.js';
import { buildLevel } from '../../src/level.js';
import { buildMaterials } from '../../src/materials.js';
import { creerNavigation, chemin, ligneLibre } from '../../src/navigation.js';
import { collide } from '../../src/level.js';

const warn = console.warn; console.warn = (...a) => { if (!String(a[0]).includes('serialize Texture')) warn(...a); };
const ctx=document.createElement().getContext();for(const key of ['save','restore','translate','arc'])ctx[key]=()=>{};
// Unité : un mur entre le boss et la cible, avec une ouverture sur le côté.
{
  const obstacles=[{x1:-5,x2:3,z1:-.1,z2:.1,h:2}];
  const nav=creerNavigation(obstacles);
  assert(!ligneLibre(nav,{x:0,z:-1.5},{x:0,z:1.5}),'Le mur doit bloquer la ligne droite');
  const c=chemin(nav,{x:0,z:-1.5},{x:0,z:1.5});
  assert(c&&c.length>=2,'Chemin de contournement attendu');
  assert(c.some(p=>p.x>3.3),'Le chemin doit passer par l’ouverture');
  assert.deepEqual(c.at(-1),{x:0,z:1.5},'Le chemin finit sur la cible');
  let prev={x:0,z:-1.5};for(const p of c){assert(ligneLibre(nav,prev,p),'Tronçon qui traverse un mur');prev=p;}
}
const scene=new THREE.Scene(),mat=buildMaterials();
let essais=0,pire=0;
for(const niv of NIVEAUX){
  const plan=PLANS[niv.plan],level=buildLevel(scene,mat,plan,niv);
  const cfg=niv.pnj(plan).find(c=>c.boss);assert(cfg,`Pas de directeur à l'étage ${niv.id}`);
  const nav=creerNavigation(level.obstacles);
  // cibles : départ du joueur + cellules libres réparties dans l'étage (tirage fixe)
  const cibles=[{x:plan.depart.x,z:plan.depart.z}];
  let graine=7;const alea=()=>((graine=(graine*16807)%2147483647)/2147483647);
  while(cibles.length<7){
    const i=Math.floor(alea()*nav.nx),k=Math.floor(alea()*nav.nz);
    if(!nav.libre[k*nav.nx+i])continue;
    const p={x:nav.x0+(i+.5)*nav.cellule,z:nav.z0+(k+.5)*nav.cellule};
    if(!chemin(nav,{x:cfg.x,z:cfg.z},p))continue;  // hors des pièces accessibles
    cibles.push(p);
  }
  for(const cible of cibles){
    const boss=new NPC(scene,cfg,level);boss.reset();
    const game={hunting:true,player:{pos:new THREE.Vector3(cible.x,0,cible.z)}};
    const joueur={...cible};collide(level.obstacles,joueur,.3);game.player.pos.set(joueur.x,0,joueur.z);
    let t=0,arrive=false,immobile=0,dernier={x:boss.pos.x,z:boss.pos.z};
    for(;t<60;t+=1/60){
      boss.bossBehaviour(1/60,game);
      if(Math.hypot(boss.pos.x-game.player.pos.x,boss.pos.z-game.player.pos.z)<1.2){arrive=true;break;}
      if(Math.round(t*60)%60===0){
        immobile=Math.hypot(boss.pos.x-dernier.x,boss.pos.z-dernier.z)<.1?immobile+1:0;dernier={x:boss.pos.x,z:boss.pos.z};
        assert(immobile<3,`Directeur bloqué à l'étage ${niv.id} en (${boss.pos.x.toFixed(1)}, ${boss.pos.z.toFixed(1)}) vers (${cible.x.toFixed(1)}, ${cible.z.toFixed(1)})`);
      }
    }
    assert(arrive,`Directeur jamais arrivé à l'étage ${niv.id} vers (${cible.x.toFixed(1)}, ${cible.z.toFixed(1)})`);
    essais++;pire=Math.max(pire,t);
    scene.remove(boss.mesh);
  }
  level.dispose();
}
console.log(`Navigation : directeur en traque sur ${essais} trajets dans les ${NIVEAUX.length} étages, jamais bloqué, pire trajet ${pire.toFixed(1)} s.`);

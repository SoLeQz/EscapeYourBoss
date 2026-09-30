import * as THREE from 'three';
import { departementDuNiveau, pointDecouverte } from './departements.js';
import { panneauGraphique } from './environment.js';
import { poserAccessoire,lotsAccessoire } from './accessoires-blender.js';

// Habillage dans le repère d'origine. Tout volume reste plaqué sur une surface
// existante ou sous 2 cm au sol : ni nouvelle couverture fictive ni obstacle invisible.
export function habillerDepartement(root,M,plan,niveau){
 const d=departementDuNiveau(niveau),stats={id:d.id,motif:d.motif,rangements:plan.casiers.length,postes:plan.postes.length};
 root.userData.departement=stats;
 const sol=(x,z,w,h,m,y=.023)=>{
  const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);o.rotation.x=-Math.PI/2;o.position.set(x,y,z);o.receiveShadow=true;root.add(o);return o;
 };
 const box=(x,y,z,w,h,depth,m)=>{
  const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,depth),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;root.add(o);return o;
 };
 // Composition du sol propre au service ; uniquement les îlots de mobilier,
 // jamais un balisage qui pourrait être confondu avec une sortie ou une cachette.
 for(const [x,z,,yaw=0] of plan.postes){
  const droit=Math.abs(Math.sin(yaw))<.5;
  if(['rh','marketing'].includes(d.id)){
   const o=new THREE.Mesh(new THREE.CircleGeometry(1.22,24),M.deptAccent);o.rotation.x=-Math.PI/2;o.position.set(x,.022,z);o.receiveShadow=true;root.add(o);
  }else if(['it','support','studio'].includes(d.id)){
   const w=droit?2.42:1.38,h=droit?1.38:2.42;
   for(const sign of [-1,1]){sol(x+sign*w/2,z,.035,h,M.deptSecondaire);sol(x,z+sign*h/2,w,.035,M.deptSecondaire)}
  }else if(['finance','juridique','direction'].includes(d.id)){
   sol(x,z,droit?2.5:1.45,droit?1.45:2.5,M.deptAccent);
   sol(x,z,droit?2.4:1.35,droit?1.35:2.4,M.moquette,.024);
  }
 }
 if(d.id==='logistique')for(const [x,z] of plan.cartons)for(const sign of [-1,1])sol(x+sign*.5,z,.07,.90,M.deptSecondaire);
 if(d.id==='archives')for(const [x,z] of plan.cartons){sol(x,z+.44,.8,.035,M.deptSecondaire);sol(x-.46,z,.035,.8,M.deptSecondaire)}
 // Rythme mural : jardin vertical, ondes, galerie, ou rails techniques.
 // Le mur nord est plein. Les moulures restent dans ses 6 derniers centimètres.
 if(['rh','support','juridique','direction'].includes(d.id)){
  for(let i=0;i<11;i++){
   const h=d.id==='support'?1.2+Math.abs(Math.sin(i*.6))*1.2:2.4;
   box(-14.4+i*.63,1.78,-15.94,.17,h,.045,d.id==='direction'?M.boisFonce:M.deptAccent);
  }
 }else if(['it','studio','archives','logistique'].includes(d.id)){
  for(const y of [.32,2.85])box(-9,y,-15.95,14,.055,.045,M.deptSecondaire);
 }else if(d.id==='marketing'){
  // Grandes pastilles sérigraphiées autour des panneaux, évocatrices d'un studio.
  for(const [x,y,r] of [[-15.2,2.3,.66],[-5.9,1.4,.5]]){
   const o=new THREE.Mesh(new THREE.CircleGeometry(r,32),M.deptSecondaire);o.position.set(x,y,-15.93);root.add(o);
  }
 }
 if(['studio','marketing'].includes(d.id)&&lotsAccessoire('moodboard').length){
  poserAccessoire('moodboard',root,M,{x:-1.3,y:2.15,z:15.90,yaw:Math.PI});
 }
 // Une seule découverte lisible de près, présentée sur le vrai tableau d'équipe.
 // Le point est DEVANT le mur afin de rester accessible avec la vérification LOS.
 return {id:'observation-'+d.id,type:'observation',...pointDecouverte(niveau,plan),r:1.65,
  label:'Examiner · '+d.secret,titre:d.secret,texte:d.chute,secret:'departement-'+d.id};
}

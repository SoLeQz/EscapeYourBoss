// Revue des six scènes dans Electron, avec les véritables GLB et textures.
module.exports=async({js,shot,step,wait})=>{
 for(let i=0;i<6;i++){
  await step('humour-niveau-'+(i+1),`(async()=>{
   const g=__game;await g.demarrerNiveau(${i});masquerPNJ();g.player.mesh.visible=false;
   const {HUMOUR}=await import('./src/humour.js'),h=HUMOUR[${i}],info=g.level.root.userData.humour;
   if(!info?.charge||info.id!==h.id)throw Error('Scène humoristique absente');
   let lots=0,triangles=0;g.level.root.traverse(o=>{if(o.isMesh){lots++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3}});
   if(lots>100||triangles>260000)throw Error('Budget du décor dépassé');
   const c=document.createElement('canvas').getContext('2d');
   for(const [texte,taille,gras] of [[h.titre,h.titre.length>20?31:35,true],...h.lignes.map(t=>[t,22,false]),[h.pied,11,false]]){
     c.font=(gras?'700':'400')+' '+taille+'px Arial, sans-serif';
     if(c.measureText(texte).width>456)throw Error('Texte coupé : '+texte);
   }
   vueDecor(...h.vue);for(let f=0;f<8;f++)await new Promise(requestAnimationFrame);
   return {niveau:g.niveau.id,humour:info,lots,triangles,textures:g.renderer.info.memory.textures,
     geometries:g.renderer.info.memory.geometries,transition:g.derniereTransition};
  })()`);
  await wait(500);await shot('niveau-'+(i+1)+'.jpg');
 }
 // Revenir au premier niveau détecte aussi des ressources détruites à tort.
 await step('retour-et-camera-jouable',`(async()=>{
   const g=__game;await g.demarrerNiveau(0);document.getElementById('revue-decor').remove();
   g.updateCamera=window.__cameraJeu;g.updateCamera(1,true);
   for(let f=0;f<8;f++)await new Promise(requestAnimationFrame);
   return {etat:g.state,erreurs:window.__erreurs,humour:g.level.root.userData.humour};
 })()`);
 await wait(500);await shot('en-jeu.jpg');
};

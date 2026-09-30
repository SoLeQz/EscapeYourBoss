// Revue du build livré : dix ambiances au même cadrage, puis mobilier de près.
module.exports=async({js,shot,step,wait})=>{
 await step('kit-departements',`import('./src/accessoires-blender.js').then(m=>{const kit=m.etatDepartements();if(Object.keys(kit).length!==22)throw Error('Kit incomplet');return kit})`);
 for(let i=0;i<10;i++){
  await step('departement-'+(i+1),`(async()=>{
   const g=__game;await g.demarrerNiveau(${i});if(g.state!=='play')throw Error('Transition inachevée');g.step=()=>{};g.updateCamera=()=>{};masquerPNJ();g.player.mesh.visible=false;g.player.outline.visible=false;
   const {DEPARTEMENTS}=await import('./src/departements.js');const d=DEPARTEMENTS[${i}],l=g.level,R=l.repere;
   if(l.root.userData.departement.id!==d.id)throw Error('Identité perdue');
   let lots=0,triangles=0;const modeles=new Set();l.root.traverse(o=>{if(o.isMesh){lots++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3}if(o.userData.accessoire)modeles.add(o.userData.accessoire)});
   if(!modeles.has('rangement-'+d.id)||!modeles.has('poste-'+d.id))throw Error('Modèle de département absent');
   if(lots>110||triangles>270000)throw Error('Budget dépassé');
   window.vueEtage=(p,c)=>vueDecor([R.x(p[0]),p[1],R.z(p[2])],[R.x(c[0]),c[1],R.z(c[2])]);
   vueEtage([-2,7.8,14],[-7,0,-4]);
   return {id:g.niveau.id,departement:d.id,titre:g.niveau.titre,lots,triangles,transition:g.derniereTransition,textureMax:g.renderer.capabilities.maxTextureSize};
  })()`);
  await wait(550);await shot('departement-'+(i+1)+'-ensemble.jpg');
  await js(`(()=>{const g=__game;vueEtage([-2,2.7,-5],[3.2,1,-11.8])})()`);await wait(350);await shot('departement-'+(i+1)+'-rangement.jpg');
  await step('decouverte-'+(i+1),`(()=>{const g=__game,it=g.interactifs.liste.find(a=>a.type==='observation');if(!it)throw Error('Observation absente');g.player.pos.set(it.x,0,it.z);if(!g.interactifs.accessibles(g.player).includes(it))throw Error('Découverte inaccessible');g.interactifs.interagir(it);if(!g.etat.secrets.includes(it.secret))throw Error('Découverte non sauvegardée');return {id:it.secret,texte:it.texte}})()`);
 }
 await step('lecture-panneaux',`(()=>{const g=__game,m=[];g.level.root.traverse(o=>{if(o.material?.map?.image?.getContext)m.push(o.material.map.image)});const dims=[...new Set(m)].map(c=>[c.width,c.height]);if(dims.some(([w,h])=>w>4096||h>4096))throw Error('Atlas trop grand');return dims})()`);
 await step('camera-jouable',`(async()=>{const g=__game;await g.demarrerNiveau(8);g.preparation=false;g.ui.setGuide('','','');document.getElementById('revue-decor').remove();g.updateCamera=window.__cameraJeu;g.updateCamera(1,true);return {titre:g.niveau.titre,etat:g.state,voile:document.getElementById('chargement').className}})()`);await wait(1200);await shot('departement-it-en-jeu.jpg');
};

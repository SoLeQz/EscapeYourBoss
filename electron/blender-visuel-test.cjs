// Jalon B : comparaison artistique uniquement. Aucun remplacement en partie normale.
async function atelier() {
  if (!window.jeuTest) throw new Error('Atelier réservé au profil isolé');
  const THREE=await import('three');
  const {lirePersonnageGLB}=await import('./src/personnage-glb.js');
  const g=window.__game;
  g.renderer.setAnimationLoop(null);
  const nouveau=await lirePersonnageGLB('lao-d-v03.glb');
  if(nouveau.secours!==false)throw new Error('Le modèle Blender doit être réellement chargé');
  document.body.replaceChildren(g.renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xc2c8c6);scene.environment=g.scene.environment;
  const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.03,30);
  scene.add(new THREE.HemisphereLight(0xe9f4ff,0x746755,2));
  const light=new THREE.DirectionalLight(0xffedd9,3.2);light.position.set(-3,5,4);scene.add(light);
  light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-2;light.shadow.camera.right=2;
  light.shadow.camera.top=3;light.shadow.camera.bottom=-1;light.shadow.bias=-.00015;light.shadow.normalBias=.015;
  const fill=new THREE.DirectionalLight(0xc4dfff,1.5);fill.position.set(3,2,-3);scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x9ca7a3,roughness:1}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const p=g.player;p.reset();p.pos.set(0,0,0);p.yaw=0;p.speed=0;p.working=null;p.crouch=0;p.animate(0);
  scene.add(p.mesh,nouveau.group);
  const canon=['root','upper','head','teteMicro','armL','elbowL','mainL','armR','elbowR','mainR','legL','kneeL','footL','legR','kneeR','footR'];
  function transmettrePose(){
    for(const key of canon){const src=p.parts[key],dst=nouveau.parts[key];dst.position.copy(src.position);dst.quaternion.copy(src.quaternion);dst.scale.copy(src.scale);}
    nouveau.group.position.copy(p.mesh.position);nouveau.group.quaternion.copy(p.mesh.quaternion);nouveau.actualiserPose();
  }
  function pose(nom,t=0){
    p.reset();p.pos.set(0,0,0);p.yaw=0;
    if(nom==='accroupi')p.crouch=1;
    if(nom==='travail')p.working={};
    if(nom==='marche'){p.speed=2.8;p.phase=t;}
    for(let i=0;i<(nom==='travail'?90:1);i++)p.animate(1/60);
    p.parts.torso.scale.setScalar(1);p.parts.teteMicro.rotation.set(0,0,0);
    p.parts.regard.position.set(0,0,0);p.parts.clignement.morphTargetInfluences[0]=0;
    transmettrePose();return {pose:nom,phase:p.phase};
  }
  function vue(modele,pos){
    p.mesh.visible=modele==='avant';nouveau.group.visible=modele==='apres';
    camera.position.set(...pos.slice(0,3));camera.lookAt(0,pos[3],0);
  }
  function stats(group){
    let appels=0,triangles=0,skins=0;const materials=new Set();
    group.traverse(o=>{if(!o.isMesh)return;appels+=Array.isArray(o.material)?o.geometry.groups.length:1;
      triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;
      if(o.isSkinnedMesh)skins++;for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
    return {appels,triangles,skins,materiaux:materials.size};
  }
  pose('repos');vue('apres',[1.8,1.35,3.6,.93]);
  await g.renderer.compileAsync(scene,camera);
  g.renderer.setAnimationLoop(()=>g.renderer.render(scene,camera));
  window.__blenderB={nouveau,p,scene,camera,vue,pose,g};
  const couts={avant:stats(p.mesh),apres:stats(nouveau.group)};
  return {source:nouveau.source,secours:nouveau.secours,couts,
    limites:'Proposition artistique : doigts, expressions, contour et poses extrêmes à finaliser au jalon C. Pas de mesure FPS.'};
}
module.exports=async({js,shot,step,wait})=>{
  await step('blender-identite',`(${atelier.toString()})()`);
  if(!await js('!!window.__blenderB'))return;
  const vues=[['face-corps',[0,1.2,3.9,.93]],['trois-quarts',[1.8,1.35,3.6,.93]],
    ['visage',[0,1.65,1.05,1.59]],['profil',[1.2,1.63,.12,1.57]],['dos',[-1.6,1.45,-3.6,.95]],
    ['distance-jeu',[2.8,2.3,-5.2,1.0]],['epaules-face',[.7,1.58,1.3,1.33]],
    ['epaules-profil',[1.05,1.5,0,1.34]],['epaules-dos',[-.7,1.6,-1.35,1.33]]];
  for(const [nom,pos] of vues){
    for(const modele of ['avant','apres']){
      await js(`__blenderB.vue(${JSON.stringify(modele)},${JSON.stringify(pos)})`);
      await wait(650);await shot(modele+'-'+nom+'.jpg');
    }
  }
  for(const [nom,t] of [['accroupi',0],['travail',0],['marche',.8],['marche',2.8]]){
    await step('blender-pose-'+nom+'-'+t,`__blenderB.pose(${JSON.stringify(nom)},${t})`);
    await js(`__blenderB.vue('apres',[1.8,1.35,3.6,.93])`);
    await wait(650);await shot('pose-'+nom+'-'+t+'.jpg');
    await js(`__blenderB.vue('apres',[.75,1.48,1.2,${nom==='accroupi'?.95:nom==='travail'?1.0:1.32}])`);
    await wait(650);await shot('epaules-'+nom+'-'+t+'.jpg');
  }
  await step('blender-fin',`(()=>{const a=__blenderB;a.g.renderer.setAnimationLoop(null);a.nouveau.dispose();return {atelierFerme:true}})()`);
};

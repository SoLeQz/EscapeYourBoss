// Propositions artistiques des collègues. Atelier isolé, aucun PNJ remplacé.
async function atelier() {
  if (!window.jeuTest) throw new Error('Atelier réservé au profil isolé');
  const THREE=await import('three');
  const {lirePersonnageGLB}=await import('./src/personnage-glb.js');
  const {setSeated}=await import('./src/characters.js');
  const g=window.__game;g.renderer.setAnimationLoop(null);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xc2c8c6);scene.environment=g.scene.environment;
  const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.03,30);
  scene.add(new THREE.HemisphereLight(0xe9f4ff,0x746755,2));
  const light=new THREE.DirectionalLight(0xffedd9,3.2);light.position.set(-3,5,4);scene.add(light);
  light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-4,right:4,top:3,bottom:-1});
  light.shadow.bias=-.00015;light.shadow.normalBias=.015;
  const fill=new THREE.DirectionalLight(0xc4dfff,1.5);fill.position.set(3,2,-3);scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x9ca7a3,roughness:1}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const fiches=[['directeur-v01.glb','Directeur Wang','Le patron'],['zhang-v01.glb','Zhang Jie','Cheffe d’équipe'],['liu-v01.glb','Lao Liu','Sécurité'],['lao-d-v03.glb','Lao D','Le joueur — référence']];
  const modeles=[];
  for(const [fichier,nom,role] of fiches){
    const m=await lirePersonnageGLB(fichier);if(m.secours!==false)throw new Error('Import réel requis : '+fichier);
    m.nom=nom;m.role=role;m.repos=Object.fromEntries(Object.entries(m.parts).map(([k,b])=>[k,{position:b.position.clone(),quaternion:b.quaternion.clone(),scale:b.scale.clone()}]));
    scene.add(m.group);modeles.push(m);
  }
  document.body.replaceChildren(g.renderer.domElement);
  const titre=document.createElement('div');Object.assign(titre.style,{position:'fixed',top:'24px',left:'32px',color:'#263a3e',fontFamily:'system-ui',fontSize:'26px',fontWeight:'700',pointerEvents:'none'});document.body.append(titre);
  const sousTitre=document.createElement('div');Object.assign(sousTitre.style,{position:'fixed',top:'61px',left:'33px',color:'#41575a',fontFamily:'system-ui',fontSize:'14px',pointerEvents:'none'});document.body.append(sousTitre);
  function pose(m,nom='repos',t=0){
    for(const [k,b] of Object.entries(m.parts)){const r=m.repos[k];b.position.copy(r.position);b.quaternion.copy(r.quaternion);b.scale.copy(r.scale);}
    const p=m.parts;p.armL.rotation.z=.06;p.armR.rotation.z=-.06;p.elbowL.rotation.x=p.elbowR.rotation.x=-.22;
    if(nom==='assis'){setSeated(p);p.root.position.y-=.37;}
    if(nom==='marche'){
      const s=Math.sin(t),c=Math.cos(t);p.legL.rotation.x=s*.52;p.legR.rotation.x=-s*.52;
      p.kneeL.rotation.x=Math.max(0,-s)*.75;p.kneeR.rotation.x=Math.max(0,s)*.75;
      p.armL.rotation.x=-s*.4;p.armR.rotation.x=s*.4;p.root.position.y+=Math.abs(c)*.018;
    }
    m.actualiserPose();
  }
  function vue(index,nom='corps',position='repos'){
    for(const [i,m] of modeles.entries()){m.group.visible=index===-1||i===index;m.group.position.set(index===-1?(i-1.5)*.95:0,0,0);m.group.rotation.y=index===-1?.15:0;pose(m,position,.9);}
    const vues={corps:[1.8,1.35,3.6,.93],face:[0,1.65,1.05,1.59],dos:[-1.6,1.45,-3.6,.95],profil:[1.2,1.63,.12,1.57],assis:[1.7,1.2,3.2,.7]};
    const pos=index===-1?(nom==='dos'?[0,1.9,-7.7,.93]:[0,1.8,7.7,.93]):vues[nom];
    camera.position.set(...pos.slice(0,3));camera.lookAt(0,pos[3],0);
    titre.textContent=index===-1?'Escape your boss — propositions Blender':modeles[index].nom;
    sousTitre.textContent=index===-1?'Directeur Wang · Zhang Jie · Lao Liu · Lao D (référence)':modeles[index].role+' · '+position+' · proposition v01';
  }
  function stats(m){let triangles=0,appels=0,skins=0;const mats=new Set();
    m.group.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;appels+=Array.isArray(o.material)?o.geometry.groups.length:1;if(o.isSkinnedMesh)skins++;for(const mat of [].concat(o.material))mats.add(mat);}});
    return {source:m.source,triangles,appels,skins,materiaux:mats.size};
  }
  function verifierPose(m){
    const point=new THREE.Vector3(),box=new THREE.Box3();let echantillons=0;
    m.group.traverse(o=>{if(!o.isSkinnedMesh)return;
      const pos=o.geometry.attributes.position;
      for(let i=0;i<pos.count;i+=17){point.fromBufferAttribute(pos,i);o.applyBoneTransform(i,point).applyMatrix4(o.matrixWorld);
        if(!point.toArray().every(Number.isFinite))throw new Error('Sommet non fini : '+m.source);box.expandByPoint(point);echantillons++;}
    });
    const taille=box.getSize(new THREE.Vector3());if(taille.y<.8||taille.y>2||taille.x>1.6||taille.z>1.5)throw new Error('Déformation anormale : '+m.source);
    return {echantillons,taille:taille.toArray()};
  }
  function verifierManches(m){
    // Les poignets de veste doivent suivre les bras, sans rester liés au buste.
    // Ce défaut peut conserver une boîte englobante normale tout en créant une membrane.
    const point=new THREE.Vector3();let controles=0,poidsBusteMax=0;
    m.group.traverse(o=>{
      if(!o.isSkinnedMesh||!o.material.name.startsWith('02 '))return;
      const {position,skinIndex,skinWeight}=o.geometry.attributes;
      const composantes=['getX','getY','getZ','getW'];
      for(let i=0;i<position.count;i++){
        point.fromBufferAttribute(position,i);o.applyBoneTransform(i,point).applyMatrix4(o.matrixWorld);
        if(point.y<.895||point.y>1.015||Math.abs(point.x)<.205)continue;
        controles++;
        for(const c of composantes)if(o.skeleton.bones[skinIndex[c](i)].name==='buste')poidsBusteMax=Math.max(poidsBusteMax,skinWeight[c](i));
      }
    });
    if(controles<10||poidsBusteMax>.025)throw new Error('Manches attachées au buste : '+m.source+' / '+poidsBusteMax+' / '+controles);
    return {controles,poidsBusteMax};
  }
  function verifierAnimations(){
    const resultats=[];
    for(const m of modeles.slice(0,3)){
      m.group.position.set(0,0,0);m.group.rotation.set(0,0,0);
      pose(m);const repos=verifierPose(m),manches=verifierManches(m);pose(m,'assis');const assis=verifierPose(m);
      for(let i=0;i<=120;i++){pose(m,'marche',i/120*Math.PI*2);verifierPose(m);}
      pose(m);const retour=verifierPose(m);
      if(repos.taille.some((v,i)=>Math.abs(v-retour.taille[i])>1e-6))throw new Error('Retour au repos incorrect');
      resultats.push({source:m.source,repos,assis,manches,imagesMarche:121,retourRepos:true});
    }
    return resultats;
  }
  vue(-1);await g.renderer.compileAsync(scene,camera);g.renderer.setAnimationLoop(()=>g.renderer.render(scene,camera));
  window.__collegues={modeles,vue,verifierAnimations,g,scene,floor};
  return {couts:modeles.map(stats),limites:'Atelier artistique. Expressions, doigts, contour et intégration des PNJ en partie restent à finaliser.'};
}
module.exports=async({js,shot,step,wait})=>{
  await step('collegues-imports',`(${atelier.toString()})()`);
  if(!await js('!!window.__collegues'))return;
  await step('collegues-poses',`__collegues.verifierAnimations()`);
  for(const vue of ['corps','dos']){await js(`__collegues.vue(-1,'${vue}')`);await wait(700);await shot('ensemble-'+vue+'.jpg');}
  for(const [i,nom] of ['directeur','zhang','liu'].entries()){
    for(const vue of ['corps','face','profil','dos']){await js(`__collegues.vue(${i},'${vue}')`);await wait(650);await shot(nom+'-'+vue+'.jpg');}
    for(const pose of ['assis','marche']){await js(`__collegues.vue(${i},'${pose==='assis'?'assis':'corps'}','${pose}')`);await wait(650);await shot(nom+'-'+pose+'.jpg');}
  }
  await step('collegues-fin',`(()=>{const a=__collegues;a.g.renderer.setAnimationLoop(null);for(const m of a.modeles)m.dispose();a.floor.geometry.dispose();a.floor.material.dispose();return {atelierFerme:true}})()`);
};

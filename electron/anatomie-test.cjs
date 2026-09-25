// Anatomie réellement utilisée en partie : comparaison, gestes, visages et six niveaux.
async function atelier(){
  const THREE=await import('three');const {makeCharacter}=await import('./src/characters.js');
  const {EMOTES}=await import('./src/emotes.js');const g=window.__game;
  g.renderer.setAnimationLoop(null);g.step=()=>{};g.preparation=false;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xc2c8c6);scene.environment=g.scene.environment;
  scene.add(new THREE.HemisphereLight(0xe9f4ff,0x746755,2));
  for(const [color,power,pos] of [[0xffedd9,3.2,[-3,5,4]],[0xc4dfff,1.5,[3,2,-3]]]){const l=new THREE.DirectionalLight(color,power);l.position.set(...pos);scene.add(l);}
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x9ca7a3,roughness:1}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.02,30);
  const p=g.player;p.reset();p.pos.set(0,0,0);p.yaw=0;p.animate(0);scene.add(p.mesh);
  const ancien=makeCharacter({anatomie:false,veste:0x4c5464,cravate:0x82333d,lunettes:true,sac:true,badge:true});scene.add(ancien.group);
  const variants=['direction','chignon','securite'].map(profilVisage=>makeCharacter({profilVisage,veste:profilVisage==='securite'?0x273344:0x554b43,cravate:0x693736,lunettes:profilVisage==='direction',chignon:profilVisage==='chignon'}));
  variants.forEach(c=>scene.add(c.group));
  document.body.replaceChildren(g.renderer.domElement);
  const titre=document.createElement('div');Object.assign(titre.style,{position:'fixed',top:'22px',left:'28px',font:'700 24px system-ui',color:'#243b3b'});document.body.append(titre);
  const render=()=>g.renderer.render(scene,camera);
  function vue(modele,pos,label){p.mesh.visible=modele==='apres';ancien.group.visible=modele==='avant';variants.forEach((c,i)=>c.group.visible=modele===['direction','chignon','securite'][i]);camera.position.set(...pos.slice(0,3));camera.lookAt(pos[4]||0,pos[3],pos[5]||0);titre.textContent=label||modele;render();}
  function pose(index,t){p.reset();p.pos.set(0,0,0);p.yaw=0;if(index>=0)p.declencherEmote(index);if(index===-2)p.crouch=1;if(index===-3)p.working={};for(let elapsed=0;elapsed<t;elapsed+=1/120)p.animate(Math.min(1/120,t-elapsed));p.parts.clignement.morphTargetInfluences[0]=0;return {emote:p.emote?.def.id,source:p.mesh.userData.anatomieBlender,mains:p.parts._mainsBlender.map(m=>m.morphTargetInfluences)};}
  async function video(i){pose(i,0);vue('apres',[1.4,1.35,3.6,.94],EMOTES[i].nom);const canvas=g.renderer.domElement,stream=canvas.captureStream(30),mime=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(x=>MediaRecorder.isTypeSupported(x));const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000}),chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};const done=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=reject});rec.start();let start=performance.now(),last=start,elapsed=0;while(elapsed<EMOTES[i].duree+.25){await new Promise(requestAnimationFrame);const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;elapsed+=dt;p.animate(dt);render();}rec.stop();await done;stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:mime});return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob)});}
  vue('apres',[1.4,1.35,3.6,.94]);await g.renderer.compileAsync(scene,camera);g.renderer.setAnimationLoop(render);
  window.__anatomie={p,g,scene,camera,vue,pose,video};
  return {source:p.mesh.userData.anatomieBlender,variantes:variants.map(c=>c.group.userData.anatomieBlender)};
}
module.exports=async({js,shot,step,wait})=>{
  await step('anatomie-en-partie',`(async()=>{const g=__game,resultats=[];for(let i=0;i<6;i++){await g.demarrerNiveau(i);g.step=()=>{};const modeles=[g.player.mesh,...g.npcs.map(n=>n.mesh)];if(modeles.some(m=>!m.userData.anatomieBlender))throw Error('Personnage sans anatomie Blender au niveau '+(i+1));resultats.push({niveau:i+1,personnages:modeles.map(m=>m.userData.anatomieBlender)});}await g.demarrerNiveau(0);return resultats})()`);
  await step('atelier',`(${atelier.toString()})()`);if(!await js('!!window.__anatomie'))return;
  const vues=[['corps',[1.4,1.35,3.6,.94]],['visage',[.3,1.67,.78,1.62]],['face',[0,1.66,.72,1.62]],['profil',[.8,1.65,.10,1.62]],['mains',[-.45,.91,.60,.76,-.245]],['dos',[-1.4,1.45,-3.4,.96]]];
  for(const [nom,pos] of vues)for(const modele of ['avant','apres']){await js(`__anatomie.vue('${modele}',${JSON.stringify(pos)},'${modele==='avant'?'Avant':'Blender — en jeu'} · ${nom}')`);await wait(650);await shot(modele+'-'+nom+'.jpg');}
  for(const modele of ['direction','chignon','securite']){await js(`__anatomie.vue('${modele}',[.3,1.67,.78,1.62])`);await wait(650);await shot('visage-'+modele+'.jpg');}
  await js(`__anatomie.vue('apres',[0,1.66,.72,1.62],'Clignement');__anatomie.p.parts.clignement.morphTargetInfluences[0]=1`);await wait(650);await shot('clignement.jpg');
  const defs=await js(`import('./src/emotes.js').then(m=>m.EMOTES.map(e=>({id:e.id,apercu:e.apercu,duree:e.duree})))`);
  const fs=require('node:fs'),path=require('node:path');const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6)||path.join(require('electron').app.getPath('temp'),'selftest');
  for(const [i,e] of defs.entries()){
    await step('emote-'+e.id,`__anatomie.pose(${i},${e.apercu})`);await js(`__anatomie.vue('apres',[1.4,1.35,3.6,.94],'${e.id}')`);await wait(650);await shot('emote-'+e.id+'.jpg');
    if(!process.argv.includes('--rapide'))fs.writeFileSync(path.join(out,e.id+'.webm'),Buffer.from(await js(`__anatomie.video(${i})`),'base64'));
  }
  for(const [nom,id] of [['accroupi',-2],['travail',-3]]){await step(nom,`__anatomie.pose(${id},1.5)`);await js(`__anatomie.vue('apres',[1.4,1.35,3.6,.94],'${nom}')`);await wait(650);await shot(nom+'.jpg');}
  // Raccord cou/col accroupi (tête relevée) : profil et trois-quarts rapprochés.
  for(const [nom,pos] of [['accroupi-profil',[.72,1.0,.40,.95,0,.40]],['accroupi-cou',[.42,1.02,.98,.95,0,.40]]]){await js(`__anatomie.pose(-2,1.5);__anatomie.vue('apres',${JSON.stringify(pos)},'${nom}')`);await wait(650);await shot(nom+'.jpg');}
  await js('__anatomie.g.renderer.setAnimationLoop(null)');
};
// Atelier réutilisable pour la revue des nouveaux clips Blender.
module.exports.atelier=atelier;

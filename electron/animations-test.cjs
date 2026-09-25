// Atelier d'animation du joueur réel ; le GLB est comparé séparément.
async function atelier() {
  const THREE=await import('three');
  const {EMOTES}=await import('./src/emotes.js');
  const {lirePersonnageGLB}=await import('./src/personnage-glb.js');
  const g=window.__game;g.renderer.setAnimationLoop(null);g.step=()=>{};
  const p=g.player;p.reset();g.input.clear();
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xc2c8c6);scene.environment=g.scene.environment;
  const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.03,30);
  camera.position.set(1.7,1.45,3.9);camera.lookAt(0,.94,0);
  scene.add(new THREE.HemisphereLight(0xe9f4ff,0x746755,2));
  const key=new THREE.DirectionalLight(0xffedd9,3.2);key.position.set(-3,5,4);scene.add(key);
  key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-3,right:3,top:3,bottom:-1});
  key.shadow.bias=-.00015;key.shadow.normalBias=.015;
  const fill=new THREE.DirectionalLight(0xc4dfff,1.5);fill.position.set(3,2,-3);scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x9ca7a3,roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor,p.mesh);
  const glb=await lirePersonnageGLB('lao-d-v03.glb');scene.add(glb.group);glb.group.visible=false;
  const canon=['root','upper','head','teteMicro','armL','elbowL','mainL','armR','elbowR','mainR','legL','kneeL','footL','legR','kneeR','footR'];
  let comparaison=false;
  function transmettre(){
    for(const k of canon){const a=p.parts[k],b=glb.parts[k];b.position.copy(a.position);b.quaternion.copy(a.quaternion);b.scale.copy(a.scale);}
    glb.group.position.copy(p.mesh.position);glb.group.position.x+=1.1;glb.group.quaternion.copy(p.mesh.quaternion);glb.actualiserPose();
  }
  const rendu=()=>{if(comparaison)transmettre();g.renderer.render(scene,camera);};
  document.body.replaceChildren(g.renderer.domElement);
  const titre=document.createElement('div');Object.assign(titre.style,{position:'fixed',top:'24px',left:'30px',font:'700 25px system-ui',color:'#243b3b'});document.body.append(titre);
  function reset(){p.reset();p.pos.set(0,0,0);p.yaw=0;p.animate(0);comparaison=false;glb.group.visible=false;camera.position.set(1.7,1.45,3.9);camera.lookAt(0,.94,0);}
  function pose(index,temps,duo=false){
    reset();p.declencherEmote(index);for(let t=0;t<temps-1e-6;t+=1/120)p.animate(Math.min(1/120,temps-t));
    comparaison=duo;glb.group.visible=duo;
    if(duo){p.mesh.position.x=-.55;camera.position.set(.25,1.5,5);camera.lookAt(0,.92,0);}
    titre.textContent=EMOTES[index].nom+(duo?' — joueur actuel / aperçu Blender':'');rendu();
    return {id:EMOTES[index].id,temps,hauteur:p.parts.root.position.y,blender:duo?glb.source:null};
  }
  async function video(index){
    reset();const def=index<0?{id:'locomotion',nom:'Marche · course · accroupi · travail',duree:12}:EMOTES[index];
    if(index>=0)p.declencherEmote(index);titre.textContent=def.nom;g.renderer.setAnimationLoop(null);
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=Math.round(960*g.renderer.domElement.height/g.renderer.domElement.width);
    const ctx=canvas.getContext('2d');const stream=canvas.captureStream(30);
    const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)throw new Error('Encodeur WebM indisponible');
    const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000}),chunks=[];
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    const fini=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=reject;});
    rec.start();let previous=performance.now(),temps=0,images=0,deltaMax=0;const debut=previous;
    while(temps<def.duree+.35){
      await new Promise(requestAnimationFrame);const now=performance.now(),dt=Math.min((now-previous)/1000,.05);previous=now;
      deltaMax=Math.max(deltaMax,dt);temps+=dt;
      if(index<0){
        const vitesse=temps<1.2?0:temps<3?2.9:temps<4.5?5:temps<6.7?0:temps<8.2?1.3:0;
        p.speed+=(vitesse-p.speed)*(1-Math.exp(-12*dt));p.running=temps>=3&&temps<4.5;
        const crouch=temps>=5.4&&temps<8.6?1:0;p.crouch+=(crouch-p.crouch)*(1-Math.exp(-9*dt));
        p.working=temps>=9.2&&temps<10.5?{}:null;
      }
      p.animate(dt);rendu();images++;
      ctx.drawImage(g.renderer.domElement,0,0,canvas.width,canvas.height);
      ctx.fillStyle='#183332';ctx.font='bold 23px system-ui';ctx.fillText(def.nom,24,36);
      ctx.font='14px system-ui';ctx.fillText('Escape your boss · animation du joueur',24,59);
      ctx.fillStyle='#5e8c80';ctx.fillRect(24,canvas.height-22,(canvas.width-48)*Math.min(1,temps/def.duree),4);
    }
    rec.stop();await fini;stream.getTracks().forEach(t=>t.stop());g.renderer.setAnimationLoop(rendu);
    const blob=new Blob(chunks,{type:mime});
    const donnees=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});
    return {donnees,id:def.id,images,secondes:(performance.now()-debut)/1000,deltaMax,octets:blob.size,mime};
  }
  reset();await g.renderer.compileAsync(scene,camera);g.renderer.setAnimationLoop(rendu);
  window.__animations={p,g,scene,camera,pose,video,glb,reset};
  return {emotes:EMOTES.map(e=>({id:e.id,duree:e.duree,apercu:e.apercu})),sourceComparaison:glb.source,
    limitesBlender:'V03 : transfert du corps seulement ; doigts et expressions non pilotés, poids extrêmes à finaliser.'};
}
module.exports=async({js,shot,step,wait})=>{
  await step('roue-6',`(async()=>{
    const g=window.__game;await g.demarrerNiveau(0);g.step=()=>{};g.preparation=false;
    const ok=(v,m)=>{if(!v)throw Error(m);};
    ok(g.roueCases.length===6,'La roue ne comporte pas six emotes');
    g.ouvrirRoue();g.fermerRoue(false);ok(!g.player.emote,'Le centre lance une emote');
    const indices=[];
    for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI/3,x=Math.cos(a)*180,y=Math.sin(a)*180;
      g.ouvrirRoue();g.bougerRoue(x,y);indices.push(g.roueSel);g.fermerRoue(false);
    }
    ok(indices.join()==='0,1,2,3,4,5','Secteurs incorrects');
    const selection=[];
    for(let i=1;i<=6;i++){
      g.player.emote=null;g.ouvrirRoue();dispatchEvent(new KeyboardEvent('keydown',{code:'Digit'+i}));
      g.fermerRoue(true);ok(!!g.player.emote,'Touche sans emote');selection.push(g.player.emote.def.id);
    }
    g.player.emote=null;g.ouvrirRoue();dispatchEvent(new KeyboardEvent('keydown',{code:'Digit8'}));
    ok(g.roueSel===-1,'Une touche supprimée sélectionne encore une case');
    g.bougerRoue(0,-180);return {indices,selection,note:document.getElementById('roue-note').textContent};
  })()`);
  await wait(700);await shot('roue-6.jpg');await js('__game.fermerRoue(false)');
  await step('atelier',`(${atelier.toString()})()`);if(!await js('!!window.__animations'))return;
  const defs=await js(`import('./src/emotes.js').then(m=>m.EMOTES.map(e=>({id:e.id,apercu:e.apercu,duree:e.duree})))`);
  const fs=require('node:fs'),path=require('node:path');
  const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6)||path.join(require('electron').app.getPath('temp'),'selftest');
  for(const [i,e] of defs.entries()){
    await step('video-'+e.id,`__animations.pose(${i},0)`);
    const {donnees,...rapport}=await js(`__animations.video(${i})`);
    fs.writeFileSync(path.join(out,e.id+'.webm'),Buffer.from(donnees,'base64'));
    fs.writeFileSync(path.join(out,e.id+'-video.json'),JSON.stringify(rapport,null,2));
    for(const t of [.55,e.apercu,e.duree-.5]){
      await js(`__animations.pose(${i},${t})`);await wait(650);await shot(e.id+'-'+t+'.jpg');
    }
    await step('blender-'+e.id,`__animations.pose(${i},${e.apercu},true)`);await wait(650);await shot(e.id+'-blender.jpg');
  }
  const {donnees:film,...rapportLocomotion}=await js('__animations.video(-1)');
  fs.writeFileSync(path.join(out,'locomotion.webm'),Buffer.from(film,'base64'));
  fs.writeFileSync(path.join(out,'locomotion-video.json'),JSON.stringify(rapportLocomotion,null,2));
  await step('fin',`(()=>{const a=__animations;a.g.renderer.setAnimationLoop(null);a.glb.dispose();return {fini:true}})()`);
};

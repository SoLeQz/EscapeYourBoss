// Revue sous Windows, profil temporaire. Même cadrage avant/après.
module.exports = async ({ js, shot, step, wait }) => {
  await step('version-livree', `(async()=>{
    const {EMOTES}=await import('./src/emotes.js');
    const {etatDecorBlender}=await import('./src/decor-blender.js');
    const {HUMOUR}=await import('./src/humour.js');
    const version=await window.jeuAssets.version(),decor=etatDecorBlender();
    if(version!==${JSON.stringify(require('../package.json').version)})throw Error('Mauvaise version : '+version);
    if(EMOTES.length!==4)throw Error('La roue contient '+EMOTES.length+' emotes');
    if(Object.keys(decor).length!==4+HUMOUR.length)throw Error('Décor Blender absent');
    if(document.getElementById('version-jeu').textContent!=='Version '+version)throw Error('Version non affichée');
    return {version,emotes:EMOTES.map(e=>e.nom||e.name||e.id),decor};
  })()`);
  await step('preparer-revue', `(async()=>{
    const g=window.__game;await g.demarrerNiveau(0);
    window.__stepDecor=g.step;g.step=()=>{};window.__cameraJeu=g.updateCamera;g.updateCamera=()=>{};
    const style=document.createElement('style');style.id='revue-decor';
    style.textContent='#hud,.screen,#vignette,#sous-titres,#toast,#guide,#menaces{display:none!important}';document.head.appendChild(style);
    window.masquerPNJ=()=>g.npcs.forEach(n=>{n.cone.visible=false;n.label.visible=false;n.bang.visible=false;});masquerPNJ();
    window.vueDecor=(p,c)=>{g.camera.position.set(...p);g.camera.lookAt(...c)};
    const objets={};g.level.root.traverse(o=>{if(o.userData.decorBlender)objets[o.userData.decorBlender]=(objets[o.userData.decorBlender]||0)+1;});
    for(const fichier of ['bureau-v01.glb','chaise-v01.glb','escalier-v01.glb','porte-escalier-v01.glb'])if(!objets[fichier])throw Error('Modèle absent de la partie : '+fichier);
    return {etat:g.state,obstacles:g.level.obstacles.length,objets};
  })()`);
  if(process.argv.includes('--humour')) return require('./humour-test.cjs')({js,shot,step,wait});
  if(process.argv.includes('--textures')) return require('./textures-test.cjs')({js,shot,step,wait});
  if(process.argv.includes('--passage')) {
    await step('passage-niveau-6', `(async()=>{
      const g=window.__game;await g.demarrerNiveau(5);masquerPNJ();
      const p=g.player;const commandes={actif:a=>a==='avancer',bascules:{}};
      const parcours=[];
      for(const [depart,cap] of [[13.2,-Math.PI/2],[10.8,Math.PI/2]]) {
        p.pos.set(depart,0,12.7);p.vel.set(0,0,0);
        for(let i=0;i<65;i++)p.update(1/60,commandes,cap);
        if(Math.abs(p.pos.x-depart)<2)throw Error('Passage bloqué : '+p.pos.x);
        if(Math.abs(p.pos.z-12.7)>.01)throw Error('Déviation dans le passage');
        parcours.push({depart,arrivee:p.pos.x});
      }
      p.mesh.visible=false;vueDecor([9.5,1.7,12.7],[14,1.5,12.7]);
      return {niveau:g.niveau.id,parcours};
    })()`);
    await wait(750);await shot('passage-vers-reunion.jpg');
    await step('passage-vue-inverse', `(()=>{vueDecor([15,1.75,13],[9,1.4,12.7]);return 'OK'})()`);
    await wait(750);await shot('passage-vers-escalier.jpg');
    return;
  }
  const vues=[
    ['open-space',[-2,2.5,11],[-11,1.2,-8]],
    ['poste',[-10.7,1.7,5.5],[-9,.85,3.1]],
    ['hall',[8.7,2.05,4.5],[20,1.7,1.3]],
    ['cafe',[15.4,1.75,1.4],[18.8,1.2,-1.4]],
    ['reunion',[13.2,1.9,7.2],[17,.95,12.2]],
    ['direction',[13.2,2.1,-5.8],[17,1.2,-12.4]],
    ['escalier-acces',[8,1.8,9.65],[8,1.25,13.6]],
    ['escalier-volume',[5.35,2.5,13.8],[9.1,-.9,16.05]],
    ['baie',[-13,1.9,5],[-23,1.2,-3]],
  ];
  for(const [nom,p,c] of vues){
    await step(nom,`(()=>{vueDecor(${JSON.stringify(p)},${JSON.stringify(c)});return 'OK'})()`);
    await wait(750);await shot(nom+'.jpg');
  }
  if(!process.argv.includes('--decor-vues'))for(const i of [0,1,2,3,4,5]) {
    await step('etage-'+(i+1),`(async()=>{
      const g=window.__game;await g.demarrerNiveau(${i});masquerPNJ();vueDecor([-2,2.5,11],[-11,1.2,-8]);
      let lots=0,triangles=0;g.level.root.traverse(o=>{if(o.isMesh){lots++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3}});
      if(lots>100)throw Error('Budget de 100 lots dépassé : '+lots);
      const frame=()=>new Promise(requestAnimationFrame);for(let i=0;i<30;i++)await frame();
      let last=await frame();const temps=[];for(let i=0;i<120;i++){const t=await frame();temps.push(t-last);last=t;}temps.sort((a,b)=>a-b);
      return {lots,triangles,obstacles:g.level.obstacles.length,transition:g.derniereTransition,
        msMedian:temps[60],msP95:temps[114],textures:g.renderer.info.memory.textures,geometries:g.renderer.info.memory.geometries,
        qualite:g.qualite,resolution:[g.renderer.domElement.width,g.renderer.domElement.height]};
    })()`);
    await wait(750);await shot('etage-'+(i+1)+'.jpg');
  }
  await step('camera-jouable',`(async()=>{const g=window.__game;await g.demarrerNiveau(0);
    document.getElementById('revue-decor').remove();g.updateCamera=window.__cameraJeu;g.updateCamera(1,true);
    return {etat:g.state,erreurs:window.__erreurs};})()`);
  await wait(750);await shot('en-jeu.jpg');
};

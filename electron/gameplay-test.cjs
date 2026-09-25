// Profil de sauvegarde isolé. Simulation manuelle, rendu réel Windows.
module.exports = async ({ js, shot, step, wait }) => {
  await step('preparer', `(async()=>{
    const g=window.__game; await g.demarrerNiveau(0);
    g.__step=g.step; g.step=()=>{};
    window.check=(ok,why)=>{if(!ok)throw Error(why)};
    window.ticks=(seconds)=>{for(let f=0;f<seconds*60;f++)if(g.state==='play')g.__step(1/60)};
    return {actions:g.actionsBureau.map(a=>({id:a.id,x:a.x,z:a.z})),etat:g.state};
  })()`);
  if (process.argv.includes('--reperes')) return require('./reperes-test.cjs')({ js, shot, step, wait });
  if (process.argv.includes('--travail')) return require('./travail-test.cjs')({ js, shot, step, wait });
  await step('briefing-et-tutorial', `(()=>{
    const g=window.__game;
    ticks(30);check(g.elapsed===0,'Le briefing consomme le chrono');
    check(g.npcs.every(n=>n.suspicion===0),'Repérage pendant le briefing');
    g.input.add('KeyW');ticks(.5);g.input.clear();
    check(!g.preparation && g.elapsed>0,'Le déplacement ne lance pas la partie');
    return {elapsed:g.elapsed,guide:document.getElementById('guide').textContent};
  })()`);
  await wait(650);await shot('01-guide.jpg');
  await step('silence-roue-et-alertes', `(()=>{
    const g=window.__game,a=g.audio,sons=[];
    const burst=a.burst,noise=a.noiseHit;
    a.burst=(...v)=>sons.push('burst');a.noiseHit=(...v)=>sons.push('noise');
    try {
      g.ouvrirRoue();g.fermerRoue(true);check(!g.player.emote,'Centre de roue non annulable');
      g.ouvrirRoue();g.bougerRoue(0,-180);g.fermerRoue(true);
      check(g.player.emote?.def.id==='tchao','Mauvaise sélection de roue');
      const n=g.npcs[0];n.state='doute';n.onChangementEtat('travail',g);
      n.state='observation';n.onChangementEtat('doute',g);g.lose(n);
      check(sons.length===0,'Son déclenché par emote/détection : '+sons);
      return {sons,emote:g.player.emote.def.id};
    } finally {a.burst=burst;a.noiseHit=noise;g.rejouerNiveau();g.preparation=false;}
  })()`);
  await step('roue-selection', `(()=>{const g=window.__game;g.ouvrirRoue();g.bougerRoue(130,-130);return g.roueSel})()`);
  await wait(650);await shot('02-roue.jpg');
  await step('poste-travail', `(()=>{
    const g=window.__game;g.fermerRoue(false);g.apprentissage=null;
    const it=g.actionsBureau.find(a=>a.type==='travail');
    g.player.pos.set(it.x,0,it.z);g.tryInteract();
    check(g.player.working===it,'Impossible de travailler');ticks(1);
    check(g.player.workBlend>.95,'Pose assise absente');
    g.__camera=g.updateCamera;g.updateCamera=()=>{};
    g.camera.position.set(it.x+2,2,it.z+2.6);g.camera.lookAt(it.x,.9,it.z-.4);
    return {reste:it.restant,pose:g.player.workBlend};
  })()`);
  await wait(350);await shot('03-travail.jpg');
  await step('travail-interruption-et-limite', `(()=>{
    const g=window.__game;g.updateCamera=g.__camera;
    const it=g.player.working;g.input.add('KeyS');ticks(.2);g.input.clear();
    check(!g.player.working,'Le déplacement ne quitte pas le poste');
    g.player.pos.set(it.x,0,it.z);g.tryInteract();ticks(13);
    check(!g.player.working && it.restant===0,'Travail non limité à 12 secondes');
    check(!it.marker.visible,'Un poste épuisé promet encore un abri');
    return {reste:it.restant,etat:g.state};
  })()`);
  await step('diversion', `(()=>{
    const g=window.__game;g.rejouerNiveau();g.preparation=false;
    const it=g.actionsBureau[0];g.player.pos.set(it.x,0,it.z);
    g.tryInteract();check(it.utilise,'Imprimante inutilisable');
    const nb=g.npcs.filter(n=>n.diversion).length;check(nb>0,'Aucun collègue distrait');
    const ts=g.npcs.filter(n=>n.diversion).map(n=>n.diversion.t);
    g.tryInteract();check(g.npcs.filter(n=>n.diversion).every((n,i)=>n.diversion.t===ts[i]),'Diversion réutilisable');
    return {nb,restant:it.restant};
  })()`);
  await step('menaces', `(()=>{
    const g=window.__game;g.rejouerNiveau();g.preparation=false;
    const n=g.npcs[0];n.pos.set(g.player.pos.x,0,g.player.pos.z+6);
    n.suspicion=.65;n.sawThisFrame=true;
    g.updateCamera(1,true);g.ui.setThreats(g.npcs,g.player,g.camera,g.camYaw);
    check(document.querySelectorAll('.menace').length>0,'Menace derrière la caméra absente');
    return document.getElementById('menaces').textContent;
  })()`);
  await wait(650);await shot('04-menace.jpg');
  for(const index of [4,5]) {
    await step('depart-'+(index+1), `(async()=>{
      const g=window.__game;await g.demarrerNiveau(${index});ticks(30);
      check(g.elapsed===0 && g.npcs.every(n=>n.suspicion===0),'Départ dangereux pendant le briefing');
      const prepare={elapsed:g.elapsed,timeLeft:g.timeLeft,preparation:g.preparation};
      g.input.add('KeyW');ticks(.02);g.input.clear();ticks(8);
      check(g.state==='play','Départ trop brutal après le premier mouvement');
      const apres={elapsed:g.elapsed,suspicion:Math.max(...g.npcs.map(n=>n.suspicion))};
      g.rejouerNiveau();ticks(.1);return {prepare,apres};
    })()`);
    await wait(650);await shot('depart-'+(index+1)+'.jpg');
  }
  await step('scene-emotes', `(async()=>{
    const g=window.__game;await g.demarrerNiveau(0);g.preparation=false;g.apprentissage=null;
    g.npcs.forEach(n=>{n.mesh.visible=false;n.cone.visible=false;});
    g.ui.setGuide('','','');g.ui.setThreats([],g.player,g.camera,g.camYaw);
    g.player.pos.set(-12,0,-.4);g.player.yaw=.25;
    g.updateCamera=()=>{};g.camera.position.set(-10.5,2.1,3.5);g.camera.lookAt(-12,1,-.4);
    return 'Prêt';
  })()`);
  const nbEmotes=await js(`import('./src/emotes.js').then(m=>m.EMOTES.length)`);
  for(let i=0;i<nbEmotes;i++) {
    await step('emote-'+i, `(async()=>{
      const g=window.__game,p=g.player;p.emote=null;p.declencherEmote(${i});
      const values=[];for(let f=0;f<90;f++) {
        p.update(1/60,g.input,g.camYaw);values.push(p.parts.root.position.y);
        if(f%3===0)await new Promise(requestAnimationFrame);
      }
      return {id:p.emote?.def.id,heightMin:Math.min(...values),heightMax:Math.max(...values)};
    })()`);
    await wait(650);await shot('emote-'+i+'.jpg');
  }
  await step('sortie-et-transition', `(async()=>{
    const g=window.__game;g.updateCamera=g.__camera;g.rejouerNiveau();g.preparation=false;
    g.npcs.forEach(n=>{n.pos.set(-18,0,-14);n.suspicion=0;});
    const it=g.level.interactables.find(a=>a.id==='stairs');
    g.player.pos.set(it.x,0,it.z);g.tryInteract();ticks(1);
    check(g.player.exitPose?.progress>0,'Aucune animation de sortie');
    ticks(.4);check(g.state==='over','Sortie incomplète');
    await g.demarrerNiveau(1);check(g.state==='play' && g.preparation,'Transition cassée');
    return {niveau:g.niveau.id,transition:g.derniereTransition,errors:window.__erreurs};
  })()`);
};

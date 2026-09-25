// Appelé par --selftest --gameplay --travail ; profil temporaire, vrai rendu.
module.exports = async ({ js, shot, step, wait }) => {
  await step('poste-face-aux-observateurs', `(()=>{
    const g=window.__game;g.rejouerNiveau();g.preparation=false;g.apprentissage=null;
    g.ui.setGuide('','','');g.ui.subT=0;g.ui.el.subtitle.style.opacity=0;
    g.conseilT=0;g.ambianceT=1000;g.hunting=true;
    const poste=window.posteTest=g.actionsBureau.find(a=>a.type==='travail');
    const autres=g.actionsBureau.filter(a=>a.type==='travail' && a!==poste);
    window.observateurs=[g.npcs.find(n=>n.cfg.kind==='patrol'),g.boss];
    for(const n of g.npcs){n.behave=()=>{n.speed=0};n.pos.set(-18,0,-14);}
    observateurs.forEach((n,i)=>{
      n.pos.set(poste.x+(i ? -1.6:1.6),0,poste.z+.3);
      n.yaw=n.headYaw=Math.atan2(poste.x-n.pos.x,poste.z-n.pos.z);
      n.walking=true;n.suspicion=.9;n.state='observation';
    });
    g.player.pos.set(poste.x,0,poste.z);g.tryInteract();ticks(1);
    check(g.player.working===poste && g.state==='play','Travail inaccessible');
    check(observateurs.every(n=>n.sawThisFrame),'Observateurs sans vue réelle sur le siège');
    check(observateurs.every(n=>n.state==='travail' && !n.bang.visible),'Collègue rouge au travail');
    check(observateurs.every(n=>n.suspicion>0 && n.suspicion<.9),'Mémoire des soupçons incorrecte');
    check(!g.player.outline.visible,'Contour d’alerte malgré la protection');
    check(document.getElementById('det-wrap').classList.contains('protege'),'Jauge de protection absente');
    g.ui.setThreats(g.npcs,g.player,g.camera,g.camYaw);
    check(!document.querySelector('.menace'),'Flèche menaçante malgré la protection');
    const ctx=g.minimap.g,fill=ctx.fill,colors=[];
    ctx.fill=function(...args){colors.push(this.fillStyle.replace(/\\s/g,''));return fill.apply(this,args)};
    try {g.minimap.draw(g)} finally {ctx.fill=fill}
    const cones=colors.filter(c=>c.startsWith('rgba'));
    check(cones.length===g.npcs.length && cones.every(c=>c==='rgba(255,225,150,0.14)'), 'Cône menaçant sur la mini-carte : '+cones);

    g.__camera=g.updateCamera;g.updateCamera=()=>{};
    g.camera.position.set(poste.x+3.8,2.4,poste.z+3.8);g.camera.lookAt(poste.x,1,poste.z-.3);
    return {restant:poste.restant,observateurs:observateurs.map(n=>({nom:n.name,visible:n.sawThisFrame,etat:n.state,suspicion:n.suspicion})),autres:autres.map(a=>a.restant)};
  })()`);
  await wait(650);await shot('travail-protege.jpg');
  await step('pause-conserve-credit', `(async()=>{
    const g=window.__game,avant=posteTest.restant;g.pause();
    await new Promise(r=>setTimeout(r,300));ticks(2);
    check(posteTest.restant===avant,'Crédit consommé pendant la pause');
    g.resume();return {avant,apres:posteTest.restant};
  })()`);
  await step('quitter-et-reprendre', `(()=>{
    const g=window.__game,avant=posteTest.restant;
    g.tryInteract();ticks(.05);
    check(!g.player.working && !document.getElementById('det-wrap').classList.contains('protege'),'Protection conservée après départ');
    check(observateurs.some(n=>n.state==='observation'),'Soupçons effacés en tapotant E');
    g.tryInteract();ticks(.05);
    check(g.player.working===posteTest,'Impossible de reprendre le temps restant');
    check(posteTest.restant<avant,'Le poste a rechargé');
    check(observateurs.every(n=>n.state==='travail'),'Rouge après reprise du poste');
    return {avant,apres:posteTest.restant};
  })()`);
  await step('avertissement', `(()=>{
    ticks(8.2);const g=window.__game;
    check(posteTest.restant>2 && posteTest.restant<=3,'Mauvais seuil d’avertissement');
    check(document.getElementById('det-wrap').classList.contains('protection-fin'),'Avertissement visuel absent');
    check(document.getElementById('toast').textContent.includes('3 secondes'),'Avertissement avant expiration absent');
    check(observateurs.every(n=>n.state==='travail'),'Rouge avant expiration');
    return {restant:posteTest.restant,message:document.getElementById('det-txt').textContent};
  })()`);
  await wait(650);await shot('travail-fin-proche.jpg');
  await step('expiration-et-poste-epuise', `(()=>{
    const g=window.__game;ticks(2.9);
    check(posteTest.restant===0 && !g.player.working,'Crédit non épuisé');
    check(observateurs.some(n=>n.suspicion>0),'Détection encore bloquée après expiration');
    check(!document.getElementById('det-wrap').classList.contains('protege'),'Protection visuelle restée active');
    g.tryInteract();check(!g.player.working,'Poste épuisé réactivable');
    const autre=g.actionsBureau.find(a=>a.type==='travail' && a!==posteTest);
    check(autre.restant===12,'Crédit du second poste modifié');
    return {restant:posteTest.restant,autre:autre.restant,suspicion:observateurs.map(n=>n.suspicion),etat:g.state};
  })()`);
  await wait(650);await shot('travail-expire.jpg');
  await step('nouvel-essai', `(()=>{
    const g=window.__game;g.rejouerNiveau();
    check(g.actionsBureau.filter(a=>a.type==='travail').every(a=>a.restant===12),'Crédit non réinitialisé avec l’étage');
    check(!g.player.working,'Protection conservée après restart');
    check(!document.getElementById('det-wrap').classList.contains('protege'),'Jauge non remise à zéro');
    return {etat:g.state,preparation:g.preparation,erreurs:window.__erreurs};
  })()`);
};

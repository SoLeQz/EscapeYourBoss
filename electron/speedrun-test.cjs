// Vérifie le modèle réellement soumis au rendu, après une coop puis sur dix étages.
module.exports = async ({js,shot,step,wait}) => {
  await step('speedrun-meme-etage', `(async()=>{
    const g=__game,i=g.niveauIndex;
    g.lancerSpeedrun(i);while(g.state==='loading')await new Promise(r=>setTimeout(r,50));
    if(!g.player.mesh.visible || g.player.exitPose || g.player.deguisement)throw Error('Joueur non rétabli');
    if(g.coequipier?.mesh.visible)throw Error('Ancien coéquipier visible en solo');
    if(g.player.decalage.x || g.player.decalage.z)throw Error('Départ solo décalé');
    g.state='menu';g.lancerSpeedrun(0);return {etage:i+1,visible:g.player.mesh.visible};
  })()`);
  for(let i=0;i<10;i++) {
    await step('speedrun-visible-'+(i+1), `(async()=>{
      const g=__game,attendre=ms=>new Promise(r=>setTimeout(r,ms)),debut=performance.now();
      while(g.niveauIndex!==${i} || g.state!=='play') {
        if(performance.now()-debut>30000)throw Error('Transition bloquée : '+g.state+' / '+g.niveauIndex);
        await attendre(50);
      }
      if(!g.player.mesh.visible || g.coequipier?.mesh.visible)throw Error('Visibilité incorrecte au départ');
      let dessins=0;const rappels=[];
      g.player.mesh.traverse(o=>{if(o.isMesh){const ancien=o.onAfterRender;rappels.push([o,ancien]);o.onAfterRender=function(...args){dessins++;ancien.apply(this,args)}}});
      try{await attendre(900)}finally{for(const [o,ancien] of rappels)o.onAfterRender=ancien}
      if(!dessins)throw Error('Aucun maillage du joueur rendu');
      g.preparation=false;g.npcs.forEach(n=>{n.gainRate=0;n.suspicion=0});g.timeLeft=500;
      // Déplacement réel puis nouvelle vérification : la pose reste visible.
      const depart=g.player.pos.clone();g.input.add('KeyW');await attendre(200);g.input.clear();
      if(!g.player.mesh.visible || g.player.pos.distanceTo(depart)<.01)throw Error('Joueur immobile ou masqué');
      return {etage:${i+1},dessins,visible:g.player.mesh.visible,position:g.player.mesh.position.toArray()};
    })()`);
    if([0,4,9].includes(i))await shot('speedrun-etage-'+(i+1)+'.jpg');
    await step('speedrun-sortie-'+(i+1), `(async()=>{
      const g=__game;g.level.ramassables.forEach((o,k)=>g.ramasserObjet(k));
      const it=g.level.interactables.find(a=>a.id==='stairs')||g.level.interactables.find(a=>a.id==='elevator')||g.level.interactables.find(a=>a.id==='nacelle');
      g.player.pos.set(it.x,0,it.z);g.player.vel.set(0,0,0);g.tryInteract();
      if(!g.exitSeq)throw Error('Sortie refusée : '+JSON.stringify({etat:g.state,preparation:g.preparation,proche:g.nearestInteractable()?.id,attendu:it.id,travail:g.player.working?.id,manque:g.objetsRestants(it.id).map(o=>o.id)}));
      const debut=performance.now();while(g.state==='play'){if(performance.now()-debut>8000)throw Error('Sortie bloquée : '+JSON.stringify({seq:g.exitSeq,pos:g.player.pos,sortie:it,etat:g.state}));await new Promise(r=>setTimeout(r,50))}
      return {sortie:it.id,splits:g.srSplits.length};
    })()`);
  }
  await step('speedrun-bilan', `(()=>{const g=__game;if(g.srSplits.length!==10||!document.getElementById('suite-titre').textContent.includes('Speedrun terminé'))throw Error('Bilan incomplet');if(__erreurs.length)throw Error(__erreurs.join(';'));return {splits:10,erreurs:__erreurs}})()`);
};

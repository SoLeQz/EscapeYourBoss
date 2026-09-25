module.exports = async function testerTransitions({ js, step, shot, wait }) {
  await step('instrumentation', `(() => {
    const g = window.__game;
    window.__transitions = [];
    const charge = g.chargerNiveau;
    g.chargerNiveau = function(i) {
      const t = performance.now();
      try { return charge.call(this, i); }
      finally { window.__transitions.push({index:i, constructionMs:performance.now()-t}); }
    };
    window.__gaps = []; let avant = performance.now();
    window.__sonde = setInterval(() => { const now = performance.now();
      if (now-avant > 100) window.__gaps.push(now-avant); avant=now; }, 25);
    g.lancerCampagne(0);
    return 'Campagne, transitions par bouton, vsync normale';
  })()`);
  await step('commandes-guide-et-roue', `(() => {
    const g=window.__game;g.rejouerNiveau();g.input.add('KeyW');g.step(1/60);g.input.clear();
    g.ouvrirRoue();dispatchEvent(new KeyboardEvent('keydown',{code:'Digit7',bubbles:true}));
    if(g.roueSel!==6)throw Error('Sélection numérique de la roue incorrecte');
    dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',bubbles:true}));
    if(g.roueOuverte || g.player.emote)throw Error('Annulation de roue incorrecte');
    g.pause();document.getElementById('btn-guide').click();
    if(g.apprentissage!==null || g.state!=='play')throw Error('Guide non désactivable');
    return 'Sélection 1–8, annulation Échap et guide facultatif : OK';
  })()`);
  const tours = process.argv.includes('--transition-suites') ? 0 : process.argv.includes('--endurance-transitions') ? 3 : 1;
  for (let tour = 0; tour < tours; tour++) {
    for (let i = 0; i < 6; i++) {
      await step(`campagne-${tour + 1}-etage-${i + 1}`, `(async () => {
        const g=window.__game;
        const attendre=ms=>new Promise(r=>setTimeout(r,ms));
        const attendreEtat=async (fn,msg) => { const t=performance.now();
          while(!fn()) { if(performance.now()-t>60000) throw new Error(msg+' / état '+g.state+' / '+JSON.stringify(window.__erreurs)); await attendre(50); }
        };
        const depart=performance.now();
        if (${i} === 0) g.lancerCampagne(0);
        else document.getElementById('btn-suivant').click();
        await attendreEtat(()=>g.niveauIndex===${i} && ['play','pause'].includes(g.state),'Transition bloquée');
        if (g.state==='pause') g.resume();
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const chargeMs=performance.now()-depart;
        const frame=g.imagesRendues; await attendre(350);
        if(g.imagesRendues<=frame) throw new Error('Rendu arrêté après transition');
        if(window.__erreurs.length) throw new Error(window.__erreurs.join('; '));
        if(g.renderer.info.memory.textures > 125 || g.renderer.info.memory.geometries > 330)
          throw new Error('Accumulation de ressources graphiques');
        g.input.add('KeyW'); await attendre(40); g.input.clear();
        g.npcs.forEach(n=>n.gainRate=0);
        for(const o of g.level.ramassables) { g.player.pos.set(o.x,0,o.z); await attendre(70); }
        if(g.objetsRestants().length) throw new Error('Objectif non ramassé');
        const sortie=g.level.interactables.find(e=>e.id==='stairs') || g.level.interactables[0];
        g.player.pos.set(sortie.x,0,sortie.z); g.tryInteract();
        await attendreEtat(()=>g.state==='over','Sortie bloquée');
        if(!document.getElementById('screen-suite').classList.contains('on')) throw new Error('Bilan absent');
        return { niveau:g.niveauIndex, chargeMs, construction:window.__transitions.at(-1),
          textures:g.renderer.info.memory.textures, geometries:g.renderer.info.memory.geometries,
          programmes:g.renderer.info.programs.length, gaps:window.__gaps.splice(0),
          contextLost:g.renderer.getContext().isContextLost() };
      })()`);
    }
  }
  if (process.argv.includes('--transition-suites')) {
    await step('speedrun-six-etages', `(async () => {
      const g=window.__game, resultats=[];
      const attendre=ms=>new Promise(r=>setTimeout(r,ms));
      const pret=async i=>{const t=performance.now();while(g.niveauIndex!==i || !['play','pause'].includes(g.state)) {
        if(performance.now()-t>30000) throw new Error('Speedrun bloqué vers '+i); await attendre(50);
      } if(g.state==='pause') g.resume();};
      const nombreLumieres=()=>{let n=0;g.scene.traverseVisible(o=>{if(o.isPointLight)n++;});return n;};
      g.lancerSpeedrun(0);
      await pret(0); const lumiereReference=nombreLumieres();
      for(let i=0;i<6;i++) {
        await pret(i);
        if(nombreLumieres()!==lumiereReference) throw new Error('Nombre de lumières variable');
        g.input.add('KeyW'); await attendre(40); g.input.clear();
        g.npcs.forEach(n=>n.gainRate=0);
        for(const o of g.level.ramassables) {g.player.pos.set(o.x,0,o.z);await attendre(100);}
        if(g.objetsRestants().length) throw new Error('Objectif manquant');
        if(nombreLumieres()!==lumiereReference) throw new Error('Ramassage retire une lumière');
        if(g.lumieresObjets.some(l=>l.intensity!==0)) throw new Error('Lueur reste après ramassage');
        const sortie=g.level.interactables.find(e=>e.id==='stairs')||g.level.interactables[0];
        g.player.pos.set(sortie.x,0,sortie.z);g.tryInteract();
        const t=performance.now();while(g.state!=='over'){if(performance.now()-t>10000)throw new Error('Sortie bloquée');await attendre(50);}
        resultats.push({niveau:i, textures:g.renderer.info.memory.textures, geometries:g.renderer.info.memory.geometries});
        if(i<5) await pret(i+1);
      }
      if(g.srSplits.length!==6)throw new Error('Splits speedrun incomplets');
      if(!document.getElementById('suite-titre').textContent.includes('Speedrun terminé'))throw new Error('Bilan speedrun absent');
      return resultats;
    })()`);
    await step('erreur-recuperable', `(async () => {
      const g=window.__game, compile=g.renderer.compileAsync;
      const records=JSON.stringify(g.etat.records);
      g.renderer.compileAsync=()=>Promise.reject(new Error('TEST_CHARGEMENT_INJECTE'));
      try { await g.demarrerNiveau(0); } finally { g.renderer.compileAsync=compile; }
      if(g.state!=='load-error' || document.getElementById('chargement-reessayer').hidden)throw new Error('Erreur silencieuse');
      if(document.getElementById('chargement').classList.contains('parti'))throw new Error('Message erreur masqué');
      const temps=g.elapsed;await new Promise(r=>setTimeout(r,150));
      if(g.elapsed!==temps)throw new Error('Chrono avance pendant erreur');
      document.getElementById('chargement-reessayer').click();
      const t=performance.now();while(g.state==='loading'){if(performance.now()-t>30000)throw new Error('Nouvel essai bloqué');await new Promise(r=>setTimeout(r,50));}
      if(g.state!=='play' || g.niveauIndex!==0)throw new Error('Reprise impossible');
      if(JSON.stringify(g.etat.records)!==records)throw new Error('Progression modifiée par erreur');
      const frame=g.imagesRendues;await new Promise(r=>setTimeout(r,200));
      if(g.imagesRendues<=frame)throw new Error('Rendu ne reprend pas');
      return 'Erreur affichée, chrono suspendu, retry et progression conservée : OK';
    })()`);
    await step('annuler-transition-speedrun', `(async () => {
      const g=window.__game;
      g.mode='speedrun'; g.terminerNiveau('stairs'); g.rejouerNiveau();
      await new Promise(r=>setTimeout(r,1000));
      if(g.niveauIndex!==0 || g.state!=='play')throw new Error('Ancien départ auto encore actif');
      g.pause();
      return 'Recommencer annule la transition différée : OK';
    })()`);
  }
  await shot('transition-terminee.jpg');
  await step('fin', `clearInterval(window.__sonde), window.__erreurs`);
};

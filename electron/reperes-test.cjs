module.exports = async ({js,shot,step,wait}) => {
  await step('postes-sans-rectangle',`(()=>{
    const g=window.__game;g.preparation=false;g.apprentissage=null;
    const it=g.actionsBureau.find(a=>a.type==='travail');
    g.player.pos.set(it.x+1.2,0,it.z+1.4);ticks(.02);
    g.__camera=g.updateCamera;g.updateCamera=()=>{};
    g.camera.position.set(it.x+2.4,2.1,it.z+3.4);g.camera.lookAt(it.x,1.2,it.z-.4);
    g.recenserOverlays();const visibles=g.actionsBureau.filter(a=>a.marker.visible);
    check(visibles.some(a=>a===it),'Poste non affiché');
    check(g.actionsBureau.every(a=>g.overlays.includes(a.marker)&&!a.marker.material.depthWrite),'Sprite participe à la profondeur');
    const restaurer=g.masquerOverlays();check(visibles.every(a=>!a.marker.visible),'Sprite présent en passe AO');restaurer();
    check(visibles.every(a=>a.marker.visible),'Étiquette non restaurée');
    return {etiquettes:visibles.length,qualite:g.qualite};
  })()`);
  await wait(650);await shot('poste-libre.jpg');
  for(const index of [1,3,5]) {
    await step('objectifs-niveau-'+(index+1),`(async()=>{
      const g=window.__game;g.updateCamera=g.__camera;await g.demarrerNiveau(${index});
      g.updateCamera(1,true);g.ui.setObjectives(g.level.ramassables,g.player,g.camera);
      const attendus=g.level.ramassables.length;
      check(document.querySelectorAll('.repere-objet').length===attendus,'Repères manquants');
      check(!document.getElementById('legende-objets').hidden,'Légende absente');
      const lampes=[];g.scene.traverse(o=>{if(o.isLight)lampes.push(o.uuid)});window.lampesAvant=lampes;
      return {attendus,repères:[...document.querySelectorAll('.repere-objet')].map(e=>e.textContent)};
    })()`);
    await wait(650);await shot('objectifs-niveau-'+(index+1)+'.jpg');
    await step('objet-proche-'+(index+1),`(()=>{
      const g=window.__game,o=g.level.ramassables.at(-1);g.preparation=false;g.apprentissage=null;
      g.ui.setGuide('','','');g.updateCamera=()=>{};
      g.camera.position.set(o.x+2.4,2.05,o.z+3.5);g.camera.lookAt(o.x,o.y,o.z);
      g.player.pos.set(o.x+.8,0,o.z+1.6);g.player.update(0,g.input,g.camYaw);
      return {id:o.id,position:o.group.position.toArray()};
    })()`);
    await wait(650);await shot('objet-proche-'+(index+1)+'.jpg');
    await step('ramassage-reessai-'+(index+1),`(()=>{
      const g=window.__game;
      g.npcs.forEach(n=>{n.pos.set(-2,0,14);n.suspicion=0;n.diversion=null;});
      for(const o of g.level.ramassables){g.player.pos.set(o.x,0,o.z+1);ticks(.02);check(o.pris&&!o.group.visible,'Objet non ramassé');}
      g.ui.setObjectives(g.level.ramassables,g.player,g.camera);
      check(document.querySelectorAll('.repere-objet').length===0,'Repère restant après ramassage');
      check(document.getElementById('legende-objets').hidden,'Légende conservée sans objet');
      const lampes=[];g.scene.traverse(o=>{if(o.isLight)lampes.push(o.uuid)});
      check(JSON.stringify(lampes)===JSON.stringify(lampesAvant),'Nombre de lumières modifié au ramassage');
      g.rejouerNiveau();g.ui.setObjectives(g.level.ramassables,g.player,g.camera);
      check(document.querySelectorAll('.repere-objet').length===g.level.ramassables.length,'Repères perdus au nouvel essai');
      g.ouvrirRoue();g.ui.setObjectives([],g.player,g.camera);check(!document.querySelector('.repere-objet'),'Repères devant la roue');g.fermerRoue(false);
      return 'Ramassage, ressources, nouvel essai et masquage roue : OK';
    })()`);
  }
  await step('sorties-animees',`(async()=>{
    const g=window.__game;await g.demarrerNiveau(0);g.preparation=false;
    const it=g.level.interactables.find(i=>i.id==='stairs');g.player.pos.set(it.x,0,it.z);g.tryInteract();ticks(.5);
    check(g.level.escalier.door.rotation.y<-.8,'Porte d’escalier immobile');
    g.player.pos.set(8,0,8);ticks(.02);check(!g.exitSeq&&g.level.escalier.door.rotation.y===0,'Porte non refermée après annulation');
    g.player.pos.set(it.x,0,it.z);g.tryInteract();ticks(.8);
    g.updateCamera=()=>{};g.camera.position.set(8,2.1,10.1);g.camera.lookAt(8,.7,15);
    return {ouverture:g.level.escalier.door.rotation.y};
  })()`);
  await wait(650);await shot('escalier-ouvert.jpg');
  await step('cabine-ascenseur',`(()=>{
    const g=window.__game;g.rejouerNiveau();g.preparation=false;
    g.npcs.forEach(n=>{n.pos.set(-18,0,-14);n.update=()=>{};n.suspicion=0;});
    const it=g.level.interactables.find(i=>i.id==='elevator');g.player.pos.set(it.x,0,it.z);g.tryInteract();ticks(3.15);
    check(g.exitSeq?.id==='elevator','Séquence ascenseur interrompue : '+g.state);
    check(g.level.elevatorPanels.every(d=>Math.abs(d.position.z-1.5)>1.1),'Portes non ouvertes');
    g.camera.position.set(16.5,1.55,1.5);g.camera.lookAt(22.2,1.3,1.5);
    return {etat:g.state,portes:g.level.elevatorPanels.map(d=>d.position.z)};
  })()`);
  await wait(650);await shot('cabine-ascenseur.jpg');
  await step('transitions-nettoyage',`(async()=>{
    const g=window.__game;g.updateCamera=g.__camera;await g.demarrerNiveau(0);
    g.ui.setObjectives(g.level.ramassables,g.player,g.camera);
    check(!document.querySelector('.repere-objet'),'Ancien objectif conservé');
    check(g.level.escalier.door.rotation.y===0,'Porte ouverte au nouvel étage');
    check(!window.__erreurs.length,'Erreur JavaScript');
    return {niveau:g.niveauIndex,erreurs:window.__erreurs};
  })()`);
};

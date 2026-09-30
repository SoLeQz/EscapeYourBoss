// Parcours réel 1.9 : démarrage, dix étages, secrets persistés et sorties jouées.
module.exports = async ({js,shot,step,wait}) => {
  const outil=`const g=__game,ok=(v,m)=>{if(!v)throw Error(m)};`;
  await step('carnet',`(()=>{${outil}document.getElementById('btn-secrets').click();ok(!document.getElementById('menu-secrets').hidden,'Carnet absent');ok(document.querySelectorAll('#secrets-liste .secret-carte').length===12,'Douze secrets');return document.getElementById('secrets-compteur').textContent})()`);
  await shot('01-carnet.jpg');
  const fenetre=require('electron').BrowserWindow.getAllWindows()[0],taille=fenetre.getBounds();
  fenetre.setSize(960,600);await wait(300);
  await step('menus-petite-fenetre',`(()=>{${outil}g.menu.mode='speedrun';g.menu.ouvrir('menu-niveaux');
    const cartes=[...document.querySelectorAll('.carte-niveau')];ok(cartes.length===10,'Dix cartes');
    cartes.at(-1).scrollIntoView({block:'center'});ok(cartes.at(-1).getBoundingClientRect().bottom<=innerHeight,'Dernier étage inaccessible');
    g.menu.ouvrir('menu-principal');document.getElementById('btn-quitter').scrollIntoView({block:'center'});
    ok(document.getElementById('btn-quitter').getBoundingClientRect().bottom<=innerHeight,'Bas du menu inaccessible');return {largeur:innerWidth,hauteur:innerHeight};})()`);
  fenetre.setBounds(taille);

  for(let i=0;i<10;i++) {
    await step('charger-'+(i+1),`(async()=>{${outil}g.state='menu';await g.demarrerNiveau(${i});ok(g.state==='play','Chargement');ok(g.level.canards.length===3,'Canards');return {niveau:g.niveau.id,orientation:g.niveau.orientation,sorties:g.level.interactables.map(x=>x.id)}})()`);
    if([4,6,7,9].includes(i)) {await wait(850);await shot('etage-'+(i+1)+'.jpg')}
  }
  await step('piece-et-coupure',`(async()=>{${outil}g.state='menu';await g.demarrerNiveau(6);g.preparation=false;g.state='pause';g.ui.setGuide('','','');
    const ints=g.interactifs,porte=ints.liste.find(a=>a.type==='passage'),disj=ints.liste.find(a=>a.type==='disjoncteur');
    ints.interagir(porte);ints.interagir(disj);for(let i=0;i<100;i++)ints.mettreAJour(1/60);
    ok(porte.ouvert&&porte.obstacle.noClip,'Passage');ok(ints.obscurite>0,'Coupure');
    const R=g.level.repere,p=R.p(-17,12.8);g.player.pos.set(p.x,0,p.z);g.player.animate(0);g.camYaw=R.yaw(Math.PI);g.updateCamera(1,true);
    for(const type of ['bouton','arcade','sieste'])ints.interagir(ints.liste.find(a=>a.type===type));
    const c=g.level.canards[0];g.ramasserCanard(c);await g.sauver();
    return {secrets:g.etat.secrets,canards:g.etat.canards,lumieres:g.lampes.map(l=>l.intensity)};})()`);
  await wait(900); await shot('salle-secrete.jpg');
  await step('persistance',`(async()=>{${outil}await new Promise(r=>setTimeout(r,300));const s=await jeuStore.charger();ok(s.secrets.includes('salle-secrete'),'Secret non sauvegardé');ok(s.canards['7'].includes(0),'Canard non sauvegardé');g.rejouerNiveau();ok(g.level.canards[0].pris,'Canard réapparu');ok(!g.interactifs.liste.find(a=>a.type==='passage').ouvert,'Porte non refermée');return true})()`);
  await step('carton',`(async()=>{${outil}g.state='menu';await g.demarrerNiveau(7);g.preparation=false;g.state='pause';g.ui.setGuide('','','');const it=g.interactifs.liste.find(a=>a.type==='carton');g.player.pos.set(it.x,0,it.z);g.interactifs.interagir(it);g.player.animate(0);g.updateCamera(1,true);ok(!g.player.mesh.visible&&g.player.deguisement==='carton','Carton absent');return true})()`);
  await wait(900); await shot('carton.jpg');
  for(const [idx,id] of [[6,'toboggan'],[7,'nacelle']]) {
    await step('sortie-'+id,`(async()=>{${outil}g.state='menu';await g.demarrerNiveau(${idx});g.preparation=false;
      for(const n of g.npcs){n.gainRate=0;n.suspicion=0}g.timeLeft=500;
      for(const o of g.level.ramassables)g.ramasserObjet(g.level.ramassables.indexOf(o));
      const porte=g.interactifs.liste.find(a=>a.type==='passage');if(porte)g.interactifs.interagir(porte);
      const it=g.level.interactables.find(a=>a.id==='${id}');g.player.pos.set(it.x,0,it.z);g.player.vel.set(0,0,0);g.tryInteract();
      ok(g.exitSeq?.id==='${id}','Mauvaise interaction de sortie');
      for(let f=0;f<240&&g.state==='play';f++)g.step(1/60);
      ok(g.state==='over','La sortie ne termine pas le niveau');return {etat:g.state,decouverte:g.etat.secrets.includes('${id}')};})()`);
    await wait(900); await shot('sortie-'+id+'.jpg');
  }
  await step('erreurs',`(()=>{${outil}ok(!__erreurs.length,JSON.stringify(__erreurs));return {erreurs:__erreurs,fps:g.fps}})()`);
};

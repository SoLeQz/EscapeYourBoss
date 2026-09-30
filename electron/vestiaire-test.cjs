// Vestiaire, sous Windows : EscapeYourBoss.exe --selftest --vestiaire --out=C:\chemin\rapport
// Parcours à la souris (vrais clics sur l'interface), captures corps et gros plan,
// puis la tenue enregistrée doit se retrouver en jeu.
module.exports = async ({ js, shot, step, wait }) => {
  const outils = `const g=__game,ok=(v,m)=>{if(!v)throw Error(m)},$=id=>document.getElementById(id),
    clic=el=>{ok(el,'Élément absent');el.click()},onglet=nom=>clic([...document.querySelectorAll('.vest-onglet')].find(b=>b.textContent.includes(nom))),
    carte=nom=>[...document.querySelectorAll('.vest-carte')].find(b=>b.textContent.includes(nom)),
    pieces=()=>{const r=new Set();g.player.mesh.traverse(o=>{if(o.isMesh&&o.name.startsWith('Garde-robe:'))r.add(o.name.split(':')[1])});return [...r].sort()};`;
  await step('ouvrir', `(async()=>{${outils}
    ok(g.state==='menu','Le vestiaire s’ouvre depuis le menu');clic($('btn-vestiaire'));
    ok(g.vestiaire&&$('screen-vestiaire').classList.contains('on'),'Écran du vestiaire absent');ok(g.player.mesh.visible,'Mannequin invisible');
    ok(document.querySelectorAll('.vest-onglet').length===8,'Onglets');ok(pieces().length===0,'Lao D d’origine attendu');
    const verrous=[...document.querySelectorAll('.vest-carte.verrou')].length;
    return {compteur:$('vest-compteur').textContent,titre:$('vest-titre-badge').textContent,verrousOngletChapeau:verrous};
  })()`);
  await wait(900); await shot('vestiaire-01-ouverture.jpg');
  await step('conditions-et-couleurs', `(async()=>{${outils}
    const {PIECES,conditionDeblocage,nomCouleur,PALETTES}=await import('./src/garde-robe.js');
    const onglets={tete:'Chapeau',yeux:'Lunettes',torse:'Cou',dos:'Dos'},verrous=[];
    for(const [slot,nom] of Object.entries(onglets)){
      onglet(nom);for(const p of PIECES[slot].filter(p=>p.debloque)){
        const b=carte(p.nom);ok(b.disabled&&b.querySelector('small')?.textContent===conditionDeblocage(p),'Condition absente : '+p.nom);
        ok(getComputedStyle(b).opacity==='1','Condition trop effacée');verrous.push(p.nom);
      }
    }
    onglet('Tenues');ok(carte('Employé du mois').textContent.includes('niveau 6 en solo'),'Couronne sans objectif');
    ok(carte('Employé du mois').textContent.includes('niveau 5 en solo'),'Jetpack sans objectif');
    ok(carte('Héros').textContent.includes('10 niveaux depuis le premier'),'Speedrun incomplet');
    const finis=[...g.etat.niveauxFinis];g.etat.niveauxFinis=[4,5];g.menu.majVestiaire();
    ok(!carte('Employé du mois').textContent.includes('niveau 5 en solo'),'Objectif déjà obtenu encore affiché');
    ok(carte('Employé du mois').disabled,'Tenue débloquée trop tôt');g.etat.niveauxFinis=finis;
    onglet('Chapeau');clic(carte('Casquette'));
    const boutons=[...document.querySelectorAll('.vest-teinte')];
    for(const [i,b] of boutons.entries())ok(b.textContent===nomCouleur(PALETTES.accent[i],'accent')&&b.title===b.textContent,'Nom de couleur absent');
    clic(boutons[1]);ok(document.querySelector('.vest-teinte.choisi').getAttribute('aria-label')==='Bleu azur','Mauvais nom sélectionné');
    return {verrous,couleurs:boutons.map(b=>b.textContent)};
  })()`);
  await step('nuancier-lisible',`(()=>{${outils}
    const dernier=[...document.querySelectorAll('.vest-teinte')].at(-1);dernier.scrollIntoView({block:'end'});
    ok(dernier.getBoundingClientRect().bottom<=$('vest-contenu').getBoundingClientRect().bottom+1,'Couleurs inaccessibles');return true;
  })()`);
  await wait(600);await shot('vestiaire-couleurs-nommees.jpg');
  await step('conditions-tenues',`(()=>{${outils}onglet('Tenues');carte('Employé du mois').scrollIntoView({block:'end'});return carte('Employé du mois').textContent})()`);
  await wait(600);await shot('vestiaire-conditions-tenues.jpg');
  await step('essayer', `(async()=>{${outils}
    onglet('Chapeau');ok(carte('Couronne').disabled,'La couronne doit être verrouillée sur un profil neuf');
    clic(carte('Bonnet'));ok(g.vestiaire.brouillon.tete==='bonnet','Bonnet non essayé');
    const teintes=document.querySelectorAll('.vest-teinte');ok(teintes.length>=10,'Nuancier du chapeau absent');clic(teintes[1]);
    onglet('Lunettes');clic(carte('Aviateur'));onglet('Cheveux');clic(carte('guidon'));
    onglet('Cou');clic(carte('papillon'));onglet('Dos');clic(carte('livreur'));
    onglet('Tenue');clic(document.querySelector('.vest-teinte.sans'));ok(g.vestiaire.brouillon.veste===null,'Sans veste');
    ok(pieces().join()==='aviateur,bonnet,moustache-guidon,noeud-papillon,sac-livreur','Pièces portées : '+pieces());
    return {brouillon:g.vestiaire.brouillon,titre:$('vest-titre-badge').textContent};
  })()`);
  await wait(900); await shot('vestiaire-02-essai-corps.jpg');
  await step('gros-plan', `(()=>{${outils}clic($('vest-zoom'));ok(g.vestiaire.zoom==='tete','Zoom');return g.vestiaire.zoom})()`);
  await wait(1200); await shot('vestiaire-03-essai-tete.jpg');
  await step('tout-debloquer', `(()=>{${outils}
    g.etat.niveauxFinis=[1,2,3,4,5,6];g.etat.records.speedrun=300;g.menu.majVestiaire();clic($('vest-zoom'));
    onglet('Tenues');clic(carte('Employé du mois'));ok(g.vestiaire.brouillon.tete==='couronne'&&g.vestiaire.brouillon.dos==='jetpack','Tenue du mois');
    ok(g.player.emote,'Une tenue toute faite lance une danse');
    return {pieces:pieces(),compteur:$('vest-compteur').textContent,titre:$('vest-titre-badge').textContent};
  })()`);
  await wait(1500); await shot('vestiaire-04-employe-du-mois.jpg');
  for (const t of ['Vendredi', 'stagiaire', 'Agent', 'Directeur', 'Inspection', 'Pot', 'Héros']) {
    await step('tenue-' + t, `(()=>{${outils}g.player.emote=null;onglet('Tenues');clic(carte(${JSON.stringify(t)}));return pieces()})()`);
    await wait(700); await shot('vestiaire-tenue-' + t.toLowerCase() + '.jpg');
  }
  await step('tourner', `(()=>{${outils}
    const z=$('vestiaire-scene'),r=z.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,avant=g.vestiaire.tour;
    z.dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:y,pointerId:1,bubbles:true}));
    z.dispatchEvent(new PointerEvent('pointermove',{clientX:x+180,clientY:y,pointerId:1,bubbles:true}));
    z.dispatchEvent(new PointerEvent('pointerup',{clientX:x+180,clientY:y,pointerId:1,bubbles:true}));
    ok(!g.vestiaire.auto&&Math.abs(g.vestiaire.tour-avant-2.16)<.01,'Rotation à la souris');return g.vestiaire.tour;
  })()`);
  await step('surprise-annuler', `(async()=>{${outils}
    const tirages=[];for(let i=0;i<4;i++){g.player.emote=null;clic($('vest-surprise'));tirages.push(pieces().join('+'))}
    clic($('vest-danse'));ok(g.player.emote,'Danser');await new Promise(r=>setTimeout(r,500));
    clic($('vest-annuler'));ok(!g.vestiaire&&$('screen-start').classList.contains('on'),'Retour au menu');await new Promise(r=>setTimeout(r,300));
    ok(g.etat.apparence==null&&pieces().length===0,'Annuler garde la tenue d’origine');ok(!g.audio.musique,'Musique coupée en quittant');
    return tirages;
  })()`);
  await step('enregistrer', `(async()=>{${outils}
    clic($('btn-vestiaire'));onglet('Tenues');clic(carte('Héros'));const voulu=pieces();clic($('vest-garder'));
    ok(g.etat.apparence?.torse==='cape','Tenue non enregistrée');ok(pieces().join()===voulu.join(),'Tenue perdue en quittant');
    clic($('btn-vestiaire'));dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));ok(!g.vestiaire,'Échap ferme le vestiaire');
    await g.demarrerNiveau(0);ok(pieces().join()===voulu.join(),'La tenue doit se retrouver en jeu : '+pieces());
    g.preparation=false;const t0=performance.now(),n0=g.imagesRendues;await new Promise(r=>setTimeout(r,2000));
    return {pieces:pieces(),fps:(g.imagesRendues-n0)/((performance.now()-t0)/1000)};
  })()`);
  await wait(400); await shot('vestiaire-05-en-jeu.jpg');
};

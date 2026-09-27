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

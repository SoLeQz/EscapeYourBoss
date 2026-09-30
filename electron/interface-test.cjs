// Revue de l'interface « Méridien Connect » et de la borne « Juste 5 minutes ».
// EscapeYourBoss.exe --selftest --interface --out=C:\chemin\rapport
// Chaque écran est ouvert par le vrai code, contrôlé, puis photographié.
module.exports = async ({ js, shot, step, wait }) => {
  const ok = `const ok=(v,m)=>{if(!v)throw Error(m)},$=id=>document.getElementById(id),g=__game;`;
  await step('accueil', `(async()=>{${ok}
    ok($('screen-start').classList.contains('on'),'Portail absent');
    ok(document.querySelector('.logo-sortie'),'Logo de sortie de secours absent');
    await new Promise(r=>setTimeout(r,1200));
    ok(/^17:59:\\d\\d$/.test($('portail-heure').textContent),'Horloge de l’accueil : '+$('portail-heure').textContent);
    ok($('fil-notifications').children.length===4,'Fil de notifications incomplet');
    ok($('kpi-liste').querySelectorAll('dt').length===7,'Indicateurs incomplets');
    ok(document.querySelectorAll('#menu-principal .menu-btn').length===7,'Sept entrées attendues');
    const r=document.querySelector('.logo-sortie').getBoundingClientRect();ok(r.width>300&&r.top>=0,'Logo mal placé');
    return {heure:$('portail-heure').textContent,badge:$('badge-acces').textContent};
  })()`);
  await wait(500); await shot('interface-01-accueil.jpg');
  await step('survol', `(()=>{${ok}const b=$('btn-speedrun');b.focus();return getComputedStyle(b).backgroundSize})()`);
  await wait(300); await shot('interface-02-survol.jpg');
  await step('etages', `(async()=>{${ok}$('btn-campagne').click();await new Promise(r=>setTimeout(r,300));
    ok(document.querySelectorAll('.carte-niveau').length===10,'Dix étages');ok($('fiche-etage').textContent.includes('ÉTAGE'),'Fiche d’étage vide');
    document.querySelectorAll('.carte-niveau')[0].dispatchEvent(new Event('mouseenter'));
    ok($('portail-chemin').textContent.includes('Tableau des étages'),'Fil d’Ariane');return $('fiche-etage').querySelector('h3').textContent})()`);
  await wait(400); await shot('interface-03-etages.jpg');
  for (const [nom, id] of [['options', 'menu-options'], ['touches', 'menu-touches'], ['secrets', 'menu-secrets'], ['multi', 'menu-multi']]) {
    await step(nom, `(()=>{${ok}g.menu.ouvrir('${id}');ok(!$('${id}').hidden,'Panneau fermé');return $('portail-chemin').textContent})()`);
    await wait(400); await shot(`interface-04-${nom}.jpg`);
  }
  await step('vestiaire', `(async()=>{${ok}g.menu.ouvrir('menu-principal');$('btn-vestiaire').click();await new Promise(r=>setTimeout(r,1200));ok($('screen-vestiaire').classList.contains('on'),'Vestiaire');return 1})()`);
  await wait(600); await shot('interface-05-vestiaire.jpg');
  await step('vestiaire-fermer', `(()=>{${ok}$('vest-annuler').click();return $('screen-start').classList.contains('on')})()`);
  await step('chargement', `(()=>{${ok}g.ui.loading('Étage 22 — 18:20','Préparation de l’étage…');ok($('chargement-afficheur').textContent==='22','Afficheur');return 1})()`);
  await wait(500); await shot('interface-06-chargement.jpg');
  await step('en-jeu', `(async()=>{${ok}g.ui.loading(null);await g.demarrerNiveau(1);g.preparation=false;g.apprentissage=null;
    await new Promise(r=>setTimeout(r,1500));g.ui.toast('Canard de débogage trouvé !','1/3 dans cet étage',6,'trouvaille');
    ok(getComputedStyle($('keys')).backgroundColor!=='rgba(0, 0, 0, 0)','Pense-bête');return $('mission').textContent})()`);
  await wait(500); await shot('interface-07-hud.jpg');
  await step('alerte', `(async()=>{${ok}const n=g.npcs[0];g.step=()=>{};g.ui.setDetection(.75,n.name,'observation',true);g.ui.setPrompt('<kbd>E</kbd> Faire semblant de travailler · 12 s');
    g.ui.toast('Tu souffles trop fort','On t’a entendu.',6,'alerte');ok($('det-etat').textContent==='Observé','État de détection');return 1})()`);
  await wait(400); await shot('interface-08-alerte.jpg');
  await step('pause', `(()=>{${ok}g.pause();ok($('screen-pause').classList.contains('on'),'Pause');ok($('pause-message').textContent.startsWith('Réponse automatique'),'Message d’absence');return 1})()`);
  await wait(500); await shot('interface-09-pause.jpg');
  await step('echec', `(async()=>{${ok}g.resume();g.lose(g.boss);await new Promise(r=>setTimeout(r,900));ok($('fail-who').textContent.includes('Wang'),'Organisateur');return $('fail-duree').textContent})()`);
  await wait(300); await shot('interface-10-convocation.jpg');
  await step('ticket', `(async()=>{${ok}await g.demarrerNiveau(1);g.preparation=false;g.elapsed=63.4;g.terminerNiveau('elevator');await new Promise(r=>setTimeout(r,900));
    ok($('suite-heure').textContent.startsWith('Sortie pointée'),'Heure de pointage');ok(document.querySelector('#screen-suite .tampon'),'Tampon de note');return $('suite-titre').textContent})()`);
  await wait(300); await shot('interface-11-ticket.jpg');

  // ------------------------------------------------ borne d'arcade
  await step('borne-intro', `(async()=>{${ok}await g.demarrerNiveau(6);g.preparation=false;g.apprentissage=null;await new Promise(r=>setTimeout(r,1200));
    if(g.etat.cantine)g.etat.cantine.introVue=false;g.ouvrirMachine();ok(g.machine?.ouverte,'Machine fermée');ok(g.state==='arcade','L’étage doit attendre');
    ok(!document.querySelector('.mas-intro').hidden,'Écran d’accueil de la machine');return 1})()`);
  await wait(1200); await shot('interface-12-borne-intro.jpg');
  await step('borne-tour', `(async()=>{${ok}document.querySelector('.mas-continuer').click();const m=g.machine,avant=m.etat.solde;
    let graine=7;m.alea=()=>((graine=(graine*16807)%2147483647)/2147483647);
    document.querySelector('.mas-tourner').click();await new Promise(r=>setTimeout(r,4200));
    ok(m.etat.solde!==avant||m.etat.tours>0,'Aucun tour joué');ok(document.querySelectorAll('.mas-rouleau .mas-case').length===20,'Vingt cases visibles');
    return {solde:m.etat.solde,tours:m.etat.tours}})()`);
  await wait(300); await shot('interface-13-borne-jeu.jpg');
  await step('borne-celebration', `(async()=>{${ok}const m=g.machine;m.sauter=false;const p=m.celebrer('mega',62.4);await new Promise(r=>setTimeout(r,2200));return 1})()`);
  await shot('interface-14-borne-mega-gain.jpg');
  await step('borne-celebration-fin', `(async()=>{g.machine.passer();await new Promise(r=>setTimeout(r,600));return document.querySelector('.mas-celebration').hidden})()`);
  await step('borne-table', `(()=>{${ok}document.querySelector('.mas-menu').click();ok(document.querySelectorAll('.mas-ligne-gain').length===10,'Table des gains');return 1})()`);
  await wait(400); await shot('interface-15-borne-table-des-gains.jpg');
  await step('borne-regles', `(()=>{document.querySelector('[data-onglet="regles"]').click();return document.querySelectorAll('.mas-schema').length})()`);
  await wait(300); await shot('interface-16-borne-regles.jpg');
  await step('borne-achat', `(()=>{${ok}g.machine.fermerPanneaux();document.querySelector('.mas-achat').click();ok(document.querySelectorAll('.mas-carte-achat').length===2,'Deux achats');return 1})()`);
  await wait(300); await shot('interface-17-borne-achat.jpg');
  await step('borne-bonus', `(async()=>{${ok}const m=g.machine;m.etat.turbo=true;document.querySelector('[data-achat="pause"]').click();
    document.querySelector('.mas-oui-non .oui').click();await new Promise(r=>setTimeout(r,3500));ok(m.enBonus,'Bonus non lancé');return 1})()`);
  await shot('interface-18-borne-debut-bonus.jpg');
  await step('borne-bonus-tours', `(async()=>{document.querySelector('.mas-panneau .mas-continuer')?.click();await new Promise(r=>setTimeout(r,5000));return document.querySelector('.mas-restants').textContent})()`);
  await shot('interface-19-borne-tours-gratuits.jpg');
  await step('borne-bonus-fin', `(async()=>{${ok}const m=g.machine;for(let i=0;i<200&&m.enBonus;i++){m.passer();document.querySelector('.mas-panneau:not([hidden]) .mas-continuer')?.click();await new Promise(r=>setTimeout(r,250));}
    ok(!m.enBonus,'Bonus jamais terminé');return m.etat.solde})()`);
  // on doit toujours pouvoir partir : Échap pendant un tour règle le tour et ferme la borne
  await step('borne-echap-en-plein-tour', `(async()=>{${ok}const m=g.machine;m.etat.turbo=false;document.querySelector('.mas-tourner').click();
    await new Promise(r=>setTimeout(r,150));ok(m.occupee,'Tour non lancé');
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape',bubbles:true}));await new Promise(r=>setTimeout(r,3500));
    ok(!m.ouverte&&g.state==='play','La borne doit se fermer pendant un tour');g.ouvrirMachine();ok(m.ouverte&&!m.occupee,'Réouverture');return m.etat.solde})()`);
  await step('borne-quitter',`(()=>{${ok}g.fermerMachine();ok(g.state==='play','Retour au jeu');ok(!g.machine.ouverte,'Machine encore ouverte');return g.etat.cantine.solde})()`);
};

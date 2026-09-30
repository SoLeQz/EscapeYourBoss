// Cale du pont Electron pour l'aperçu navigateur (injectée par banc.mjs).
// ?scenario=nom choisit l'état à afficher ; ?etat=<json> fournit une sauvegarde.
(() => {
  const q = new URLSearchParams(location.search);
  window.jeuTest = true;
  window.__erreurs = [];
  window.jeuAssets = {
    lire: n => fetch('assets/' + n).then(r => r.ok ? r.arrayBuffer() : null),
    version: async () => q.get('version') || 'aperçu',
  };
  let sauvegarde = null;
  try { sauvegarde = q.get('etat') ? JSON.parse(q.get('etat')) : null; } catch { /* sauvegarde vide */ }
  window.jeuStore = { charger: async () => sauvegarde, sauver: async d => { sauvegarde = d; return true; } };
  // Scénario : une fois le jeu démarré, on amène l'interface dans l'état voulu.
  // En jeu, on attend que le décor soit compilé.
  // Rendu logiciel : qualité basse en jeu, et la boucle est figée avant la capture.
  const jouer = async (g, pause, index = +(q.get('niveau') || 1)) => {
    g.setQualite?.('bas', true);
    await g.demarrerNiveau(index); g.preparation = false; g.apprentissage = null; await pause(1500);
  };
  window.__scenariosApercu = {
    menu: async () => {},
    niveaux: async g => { g.menu.mode = 'campagne'; g.menu.ouvrir('menu-niveaux'); },
    speedrun: async g => { g.menu.mode = 'speedrun'; g.menu.ouvrir('menu-niveaux'); },
    options: async g => g.menu.ouvrir('menu-options'),
    touches: async g => g.menu.ouvrir('menu-touches'),
    secrets: async g => g.menu.ouvrir('menu-secrets'),
    multi: async g => g.menu.ouvrir('menu-multi'),
    vestiaire: async (g, pause) => { g.ouvrirVestiaire(); g.menu.majVestiaire(); await pause(1500); },
    chargement: async (g, pause) => { g.ui.loading('Étage 22 — 18:20', 'Préparation de l’étage…'); await pause(300); },
    jeu: async (g, pause) => { await jouer(g, pause); g.ui.toast('Canard de débogage trouvé !', '1/3 dans cet étage'); await pause(300); },
    guide: async (g, pause) => { await g.demarrerNiveau(0); await pause(2500); },
    alerte: async (g, pause) => { await jouer(g, pause); const n = g.npcs[0]; n.suspicion = .7; g.ui.setDetection(.7, n.name, 'observation', true); g.ui.setPrompt('<kbd>E</kbd> Faire semblant de travailler · 12 s'); await pause(300); },
    roue: async (g, pause) => { await jouer(g, pause); g.ouvrirRoue(); g.roueSel = 2; g.majRoue(); await pause(600); },
    pause: async (g, pause) => { await jouer(g, pause); g.pause(); await pause(600); },
    echec: async (g, pause) => { await jouer(g, pause); g.lose(g.boss); await pause(800); },
    suite: async (g, pause) => { await jouer(g, pause); g.elapsed = 63.4; g.terminerNiveau('elevator'); await pause(800); },
    arcade: async (g, pause) => { await jouer(g, pause, 6); const a = g.interactifs.liste.find(i => i.type === 'arcade'); if (a) g.interactifs.interagir(a); await pause(1200); },
    // Salle de sieste : ?vue=porte pour l'étagère refermée vue de l'intérieur.
    hamac: async (g, pause) => {
      await jouer(g, pause, 6); const I = g.interactifs, R = g.level.repere;
      I.interagir(I.liste.find(a => a.type === 'passage'));
      const h = I.liste.find(a => a.type === 'sieste');
      g.player.pos.set(h.x, 0, h.z); g.basculerSieste(h);
      for (let i = 0; i < 150; i++) g.step(1 / 30);
      g.camYaw = R.yaw(+(q.get('lacet') || 2.4)); g.camPitch = +(q.get('tangage') || 0.3); g.camDist = 3.2;
      for (let i = 0; i < 40; i++) g.updateCamera(1 / 30, true);
    },
    'salle-fermee': async (g, pause) => {
      await jouer(g, pause, 6); const I = g.interactifs, R = g.level.repere, porte = I.liste.find(a => a.type === 'passage');
      I.interagir(porte); const [, dedans] = porte.cotes; g.player.pos.set(dedans.x - R.x(1.2), 0, dedans.z); g.player.yaw = R.yaw(Math.PI / 2);
      I.interagir(porte); for (let i = 0; i < 60; i++) g.step(1 / 30);
      g.camYaw = R.yaw(+(q.get('lacet') || 1.9)); g.camPitch = 0.2; g.camDist = 3.4;
      for (let i = 0; i < 40; i++) g.updateCamera(1 / 30, true); g.ui.setPrompt(g.interactifs.libelle(porte, g.player));
    },
    survol: async (g, pause) => { document.getElementById('btn-speedrun').focus(); await pause(400); },
    // Borne « Juste 5 minutes » : graine fixe pour des tirages reproductibles.
    'machine-intro': async (g, pause) => { await jouer(g, pause, 6); g.etat.cantine = null; g.ouvrirMachine(); await pause(1800); },
    machine: async (g, pause) => { await ouvrirBorne(g, pause); document.querySelector('.mas-tourner').click(); await pause(+(q.get('attente') || 6000)); },
    'machine-gain': async (g, pause) => { await ouvrirBorne(g, pause); g.machine.celebrer(q.get('palier') || 'mega', 62.4); await pause(2400); },
    'machine-table': async (g, pause) => { await ouvrirBorne(g, pause); document.querySelector('.mas-menu').click(); await pause(600); },
    'machine-regles': async (g, pause) => { await ouvrirBorne(g, pause); g.machine.panneauMenu('regles'); await pause(600); },
    'machine-achat': async (g, pause) => { await ouvrirBorne(g, pause); document.querySelector('.mas-achat').click(); await pause(600); },
    'machine-bonus': async (g, pause) => {
      await ouvrirBorne(g, pause); const m = g.machine; m.occupee = true;
      m.jouerBonusComplet(q.get('type') || 'pause', 1); await pause(1500);
      if (q.get('etape') !== 'annonce') { document.querySelector('.mas-panneau .mas-continuer')?.click(); await pause(+(q.get('attente') || 9000)); }
    },
  };
  async function ouvrirBorne(g, pause) {
    await jouer(g, pause, 6);
    g.etat.cantine = { introVue: true, solde: 1000, mise: 1 };
    g.ouvrirMachine();
    let graine = +(q.get('graine') || 11); g.machine.alea = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
    await pause(600);
  }
  const nom = q.get('scenario') || 'menu';
  const attendre = () => new Promise(r => { const t = setInterval(() => {
    if (window.__game && document.getElementById('chargement')?.classList.contains('parti')) { clearInterval(t); r(window.__game); }
  }, 100); });
  const pause = ms => new Promise(r => setTimeout(r, ms));
  window.addEventListener('DOMContentLoaded', async () => {
    const g = await attendre();
    const scenarios = window.__scenariosApercu || {};
    try { await (scenarios[nom] || (async () => {}))(g, pause, q); }
    catch (e) { window.__erreurs.push('scénario : ' + e.message); }
    // En rendu logiciel, une image peut prendre plus d'une seconde et les transitions
    // CSS n'avancent qu'à chaque image : on les termine pour photographier l'état posé.
    for (const a of document.getAnimations()) {
      if (Number.isFinite(a.effect?.getComputedTiming().endTime)) try { a.finish(); } catch { /* animation déjà retirée */ }
    }
    // une dernière image, puis plus rien ne bouge : la capture n'attend pas le GPU logiciel
    // ?vivant=1 : la boucle continue, pour piloter le jeu au clavier et à la souris
    if (!q.has('vivant') && (g.state !== 'menu' || g.machine?.ouverte)) { g.renderer.setAnimationLoop(null); try { g.frame(); } catch { /* image finale facultative */ } }
    document.documentElement.dataset.apercu = 'pret';
    if (window.__erreurs.length) {
      const d = document.createElement('pre');
      d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:999;margin:0;padding:8px;background:#900;color:#fff;font:12px monospace;white-space:pre-wrap';
      d.textContent = window.__erreurs.join('\n'); document.body.appendChild(d);
    }
  });
})();

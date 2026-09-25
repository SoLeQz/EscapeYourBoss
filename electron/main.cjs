// Processus principal Electron : une fenêtre, le jeu dedans, rien d'autre.
const { app, BrowserWindow, Menu, screen, ipcMain } = require('electron');
const path = require('node:path');

// Sur un portable à deux cartes, Chromium choisit par défaut le GPU
// intégré. Ce commutateur réclame explicitement la carte dédiée : sur une
// machine avec un GPU NVIDIA ou AMD, c'est le plus gros gain disponible.
app.commandLine.appendSwitch('force_high_performance_gpu');

// Pendant l'autotest seulement : on lève le plafond vsync, sinon toutes
// les mesures saturent à 60 et on ne voit plus la marge disponible.
if (process.argv.includes('--selftest')) {
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  if (!process.argv.includes('--transitions') && !process.argv.includes('--gameplay') && !process.argv.includes('--blender') && !process.argv.includes('--animations') && !process.argv.includes('--anatomie') && !process.argv.includes('--tendances') && !process.argv.includes('--multi')) {
    app.commandLine.appendSwitch('disable-gpu-vsync');
    app.commandLine.appendSwitch('disable-frame-rate-limit');
  }
  app.setPath('userData', require('node:fs').mkdtempSync(path.join(app.getPath('temp'), 'partir-selftest-')));
}
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// WebGL reste possible même sans pilote correct (VM, bureau à distance)
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

let win = null;

function createWindow() {
  // on se place explicitement sur l'écran principal : en multi-écran,
  // Electron ouvre sinon la fenêtre sur le mauvais moniteur.
  const wa = screen.getPrimaryDisplay().workArea;
  const w = Math.max(900, Math.min(1440, wa.width - 40));
  const h = Math.max(560, Math.min(860, wa.height - 40));

  win = new BrowserWindow({
    x: Math.round(wa.x + (wa.width - w) / 2),
    y: Math.round(wa.y + (wa.height - h) / 2),
    width: w,
    height: h,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#12101a',
    title: "Escape your boss",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      additionalArguments: process.argv.includes('--selftest') ? ['--jeu-selftest'] : [],
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      // Jeu solo hors navigateur : la barrière anti-autoplay n'a aucun sens
      // ici et laissait le contexte audio suspendu tant que rien n'avait été
      // cliqué, ce qui retardait le décodage du mp3.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  const selftest = process.argv.includes('--selftest');
  win.once('ready-to-show', () => { win.show(); if (!selftest) win.focus(); });
  if (selftest) win.webContents.once('did-finish-load', () => runSelfTest(win));
  // filet de sécurité : si 'ready-to-show' ne part pas, on affiche quand même
  setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); }, 4000);

  // La capture de souris a besoin que la fenêtre garde le focus.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); event.preventDefault(); }
  });
}

// --- sauvegarde sur disque, dans le dossier utilisateur ---
const fsp = require('node:fs/promises');
const { lireSauvegarde } = require('./sauvegarde.cjs');
const cheminSauvegarde = () => path.join(app.getPath('userData'), 'progression.json');

ipcMain.handle('store:charger', async () => {
  // Le premier lancement du nouveau titre reprend la sauvegarde de
  // PartirALHeure. Les écritures suivantes vont dans EscapeYourBoss.
  return lireSauvegarde(cheminSauvegarde(), process.argv.includes('--selftest') ? null
    : path.join(app.getPath('appData'), 'PartirALHeure', 'progression.json'));
});
ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('asset:lire', async (_e, nom) => {
  // on n'autorise qu'un nom de fichier simple dans assets/
  if (!/^[\w.-]+$/.test(String(nom))) return null;
  try {
    const buf = await fsp.readFile(path.join(__dirname, '..', 'assets', nom));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch (e) { console.error('asset illisible :', nom, e.message); return null; }
});

ipcMain.handle('store:sauver', async (_e, donnees) => {
  try {
    await fsp.mkdir(app.getPath('userData'), { recursive: true });
    await fsp.writeFile(cheminSauvegarde(), JSON.stringify(donnees, null, 2), 'utf8');
    return true;
  } catch (e) { console.error('sauvegarde impossible :', e.message); return false; }
});

// --- multijoueur en réseau local : une session réseau par fenêtre ---
const reseau = require('./reseau.cjs');
const sessionsReseau = new Map();
function sessionPour(wc) {
  if (!sessionsReseau.has(wc.id)) {
    const session = reseau.creerSession({
      version: app.getVersion(),
      // En autotest, l'hôte n'écoute que la machine locale (pas d'alerte du pare-feu).
      adresseEcoute: process.argv.includes('--selftest') ? '127.0.0.1' : '0.0.0.0',
      evenement: e => { if (!wc.isDestroyed()) wc.send('reseau:evenement', e); },
    });
    sessionsReseau.set(wc.id, session);
    wc.once('destroyed', () => { session.fermer(); sessionsReseau.delete(wc.id); });
  }
  return sessionsReseau.get(wc.id);
}
ipcMain.handle('reseau:heberger', (e, nom) => sessionPour(e.sender).heberger(nom));
ipcMain.handle('reseau:rejoindre', (e, ip, nom) => sessionPour(e.sender).rejoindre(ip, nom));
ipcMain.handle('reseau:rechercher', () => reseau.rechercherParties({ version: app.getVersion() }));
ipcMain.handle('reseau:adresses', () => reseau.adressesLocales().map(a => a.ip));
ipcMain.handle('reseau:fermer', e => { sessionPour(e.sender).fermer(); return true; });
ipcMain.on('reseau:envoyer', (e, msg) => sessionPour(e.sender).envoyer(msg));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------------------------------------------------------------------------
//  Mode --selftest : joue une partie scriptée, capture la fenêtre, écrit un
//  rapport JSON puis quitte. Sert à valider le build sans intervention.
//  Usage : EscapeYourBoss.exe --selftest --out=C:\chemin\rapport
// ---------------------------------------------------------------------------
async function runSelfTest(target) {
  const fs = require('node:fs');
  const outArg = process.argv.find(a => a.startsWith('--out='));
  const out = outArg ? outArg.slice(6) : path.join(app.getPath('temp'), 'selftest');
  fs.mkdirSync(out, { recursive: true });

  const logs = [];
  target.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) logs.push(`[${level === 3 ? 'error' : 'warn'}] ${message}`.slice(0, 400));
  });
  target.webContents.on('render-process-gone', (_e, d) => logs.push('[crash] ' + d.reason));

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const js = expr => target.webContents.executeJavaScript(expr, true);
  const shot = async name => {
    // Le compositeur Windows peut différer une capture d'une fenêtre masquée.
    // Demander une surface visible avant chaque capture, uniquement en test.
    if (!target.webContents.debugger.isAttached()) target.webContents.debugger.attach('1.3');
    await target.webContents.debugger.sendCommand('Page.bringToFront');
    const img = await target.webContents.capturePage();
    fs.writeFileSync(path.join(out, name), name.endsWith('.jpg') ? img.toJPEG(88) : img.toPNG());
  };

  const steps = [];
  const step = async (name, expr) => {
    try { steps.push({ name, result: await js(expr) }); }
    catch (e) { steps.push({ name, error: e.message }); }
    fs.writeFileSync(path.join(out, 'progression-test.json'), JSON.stringify({ steps, logs }, null, 2));
  };

  for (let i = 0; i < 120; i++) {
    if (await js("!!window.__game && document.getElementById('chargement').classList.contains('parti')")) break;
    await wait(250);
  }
  await wait(600);
  await shot('01-accueil.png');
  await step('boot', `JSON.stringify({ booted: !!window.__game,
      erreur: document.getElementById('boot-error').textContent || null,
      profil: window.__game ? window.__game.profil : null,
      chrono: window.__game ? window.__game.chrono : null,
      pnj: window.__game ? window.__game.npcs.length : 0,
      obstacles: window.__game ? window.__game.level.obstacles.length : 0 })`);

  if (process.argv.includes('--blender') || process.argv.includes('--personnage') || process.argv.includes('--gameplay') || process.argv.includes('--decor') || process.argv.includes('--transitions') || process.argv.includes('--multi')) {
    const test = process.argv.includes('--multi') ? './multi-test.cjs' : process.argv.includes('--blender') ? (process.argv.includes('--collegues') ? './blender-collegues-test.cjs' : process.argv.includes('--visuel') ? './blender-visuel-test.cjs' : './blender-test.cjs') : process.argv.includes('--personnage') ? (process.argv.includes('--tendances') ? './tendances-test.cjs' : process.argv.includes('--anatomie') ? './anatomie-test.cjs' : process.argv.includes('--animations') ? './animations-test.cjs' : './personnage-test.cjs') : process.argv.includes('--gameplay') ? './gameplay-test.cjs'
      : process.argv.includes('--transitions') ? './transitions-test.cjs' : './decor-test.cjs';
    await require(test)({ js, shot, step, wait });
    const erreursPage = await js('window.__erreurs || []');
    fs.writeFileSync(path.join(out, 'rapport.json'), JSON.stringify({ steps, consoleErrors: logs, erreursPage }, null, 2));
    // Tous les parcours spécialisés propagent leurs échecs au processus appelant.
    app.exit(steps.some(s => s.error) || erreursPage.length || logs.some(l => /^\[(error|crash)\]/.test(l)) ? 1 : 0);
    return;
  }

  await step('menu', `JSON.stringify({
      menuVisible: !document.getElementById('screen-start').hidden,
      panneau: ['menu-principal','menu-niveaux','menu-touches','menu-options']
        .find(id => !document.getElementById(id).hidden),
      niveaux: window.__game ? window.__game.constructor.name : '?',
    })`);

  // parcours des menus : niveaux, commandes, options
  await step('menu-niveaux', `(() => {
      document.getElementById('btn-campagne').click();
      const cartes = [...document.querySelectorAll('.carte-niveau')];
      return JSON.stringify({ cartes: cartes.length,
        verrouilles: cartes.filter(c => c.classList.contains('verrou')).length }); })()`);
  await wait(350); await shot('10-menu-niveaux.png');
  await step('menu-touches', `(() => {
      document.querySelector('[data-retour]').click();
      document.getElementById('btn-commandes').click();
      return document.querySelectorAll('.ligne-touche').length + ' actions remappables'; })()`);
  await wait(350); await shot('11-menu-touches.png');
  await step('menu-options', `(() => {
      document.querySelectorAll('[data-retour]')[1].click();
      document.getElementById('btn-options').click();
      return document.querySelectorAll('.ligne-option').length + ' options'; })()`);

  await wait(350);
  await shot('26-options.png');
  await step('ux-menus', `(() => {
      const g = window.__game;
      const assert = (v, m) => { if (!v) throw new Error(m); };
      g.menu.mode = 'speedrun';
      g.menu.majNiveaux(); g.menu.majNiveaux(); g.menu.majNiveaux();
      assert(document.querySelectorAll('#record-speedrun').length === 1, 'Record dupliqué');
      g.menu.mode = 'campagne'; g.menu.majNiveaux();
      assert(!document.getElementById('record-speedrun'), 'Record speedrun encore présent');
      for (const b of document.querySelectorAll('.carte-niveau.verrou')) assert(b.disabled, 'Étage verrouillé activable');
      const avant = g.showCones;
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', bubbles: true }));
      assert(g.showCones === avant, 'Raccourci de jeu actif dans le menu');
      g.menu.ouvrir('menu-touches'); g.menu.ecoute = { action: 'interagir', slot: 0 };
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true, cancelable: true }));
      assert(g.etat.touches.interagir[0] === 'KeyF', 'Remappage perdu');
      assert(document.querySelector('[data-touche="interagir"]').textContent === 'F', 'Aide non remappée');
      assert(!g.input.has('KeyF'), 'Remappage transmis au jeu');
      g.etat.touches.interagir = ['KeyE']; g.appliquerTouches();
      g.menu.ouvrir('menu-principal');
      return 'Navigation, verrouillage, remappage et raccourcis : OK'; })()`);

  await step('demarrage', `(() => { const g = window.__game;
      g.menu.ouvrir('menu-principal'); g.lancerCampagne(0); return g.state; })()`);
  await wait(900);

  // marche vers le nord pendant 2 s
  await step('marche', `(async () => { const g = window.__game;
      const d0 = { x: g.player.pos.x, z: g.player.pos.z };
      const f0 = g.renderer.info.render.frame, t0 = performance.now();
      g.input.add('KeyW'); await new Promise(r => setTimeout(r, 2000)); g.input.delete('KeyW');
      return JSON.stringify({
        depart: [+d0.x.toFixed(2), +d0.z.toFixed(2)],
        arrivee: [+g.player.pos.x.toFixed(2), +g.player.pos.z.toFixed(2)],
        camYaw: +g.camYaw.toFixed(2),
        avance: +Math.hypot(g.player.pos.x-d0.x, g.player.pos.z-d0.z).toFixed(2),
        fps_reel: +g.fps.toFixed(0),
        images: g.imagesRendues,
        triangles: g.renderer.info.render.triangles }); })()`);
  await shot('02-jeu.png');

  // ---- portrait du personnage ----
  await step('portrait', `(async () => { const g = window.__game;
      g.camDist = 2.5; g.camYaw = Math.PI * 0.72; g.camPitch = 0.12;
      g.player.pos.set(-13.5, 0, 6.5); g.input.add('KeyW');
      await new Promise(r => setTimeout(r, 900)); g.input.delete('KeyW');
      await new Promise(r => setTimeout(r, 200));
      return 'ok'; })()`);
  await shot('08-perso-marche.png');
  // portrait DE FACE : la caméra se place devant le personnage
  // L'orientation du personnage est DÉRIVÉE de celle de la caméra :
  // pour le voir de face, il doit regarder vers elle, donc
  // yaw = camYaw + PI. Fixer yaw à 0 en espérant la face ne marchait
  // pas — c'est ce qui faisait filmer le sac à dos aux portraits.
  const pose = async (nom, fichier, { dist, yaw, pitch, tourne, avant = '', attente = 700 }) => {
    await step(nom, `(async () => { const g = window.__game;
        g.camDist = ${dist}; g.camYaw = ${yaw}; g.camPitch = ${pitch};
        // la caméra vise un point décalé de 52 cm sur le côté
        // (over-the-shoulder) : on compense, sinon les portraits
        // cadrent le personnage de trois-quarts et hors centre
        g.player.pos.set(-13.5 + Math.cos(g.camYaw) * 0.52, 0,
                         7.5 - Math.sin(g.camYaw) * 0.52);
        g.player.vel.set(0, 0, 0);
        g.player.yaw = g.camYaw + (${tourne});
        ${avant}
        await new Promise(r => setTimeout(r, ${attente}));
        return JSON.stringify({ yaw: +g.player.yaw.toFixed(2), cam: +g.camYaw.toFixed(2) }); })()`);
    await shot(fichier);
  };
  const FACE = 'Math.PI', DOS = '0', PROFIL = 'Math.PI / 2';
  await pose('portrait-visage', '14-visage.png', { dist: 1.9, yaw: 0, pitch: -0.02, tourne: FACE });
  await pose('profil', '16-profil.png', { dist: 2.4, yaw: 0, pitch: 0.06, tourne: PROFIL });
  await pose('dos', '17-dos.png', { dist: 2.4, yaw: 0, pitch: 0.10, tourne: DOS });
  await pose('trois-quarts', '20-trois-quarts.png',
    { dist: 2.1, yaw: 0, pitch: 0.04, tourne: 'Math.PI * 0.72' });
  await pose('gros-plan', '21-gros-plan.png', { dist: 1.1, yaw: 0, pitch: -0.14, tourne: FACE });
  // torse sans le sac : le harnais et la besace masquent la cravate,
  // les revers et les boutons, qui sont justement ce qu'on veut juger
  await pose('gros-plan-torse', '23-torse.png', { dist: 1.5, yaw: 0, pitch: 0.06, tourne: FACE,
    avant: `const p = g.player.parts;
        if (p.sac) p.sac.visible = false;
        if (p.sangles) p.sangles.visible = false;` });
  await step('sac-remis', `(() => { const p = window.__game.player.parts;
      if (p.sac) p.sac.visible = true;
      if (p.sangles) p.sangles.visible = true; return 'ok'; })()`);
  // « Take the L » saisie en pleine tenue : le L doit se lire de face,
  // main gauche au front, pouce vers la droite du spectateur.
  //
  // L'emote est lancée par son INDEX dans la roue, donc l'étape renvoie
  // l'identifiant obtenu : si l'ordre de la roue change, on le voit dans
  // le rapport au lieu de photographier une autre danse.
  const lancer = (i) => `g.player.emote = null;
      window.__idEmote = (g.player.declencherEmote(${i}) || {}).id;`;
  await pose('emote-take-l', '24-take-the-l.png',
    { dist: 2.5, yaw: 0, pitch: 0.02, tourne: FACE, attente: 1500, avant: lancer(3) });
  await step('emote-take-l-id', 'window.__idEmote');
  await pose('emote-take-l-profil', '25-take-the-l-profil.png',
    { dist: 2.5, yaw: 0, pitch: 0.02, tourne: PROFIL, attente: 1400, avant: lancer(3) });
  // --- roue d'emotes : ouverture, sélection, exécution ---
  await step('roue', `(async () => { const g = window.__game;
      g.ouvrirRoue();
      await new Promise(r => setTimeout(r, 250));
      const ouverte = document.getElementById('roue').classList.contains('on');
      const cases = document.querySelectorAll('.roue-case').length;
      // on pousse la souris vers le bas-droite : doit sélectionner un autre secteur
      const avant = g.roueSel;
      for (let i = 0; i < 12; i++) g.bougerRoue(18, 14);
      const apres = g.roueSel;
      const nom = document.querySelector('#roue-centre .t').textContent;
      await new Promise(r => setTimeout(r, 200));
      return JSON.stringify({ ouverte, cases, avant, apres, selection: nom,
        cameraFigee: g.roueOuverte }); })()`);
  await shot('18-roue.png');
  await step('roue-execution', `(async () => { const g = window.__game;
      g.fermerRoue(true);
      await new Promise(r => setTimeout(r, 300));
      return JSON.stringify({ fermee: !document.getElementById('roue').classList.contains('on'),
        emoteEnCours: g.player.emote ? g.player.emote.def.id : null,
        temoins: g.temoinsEmote }); })()`);
  await shot('19-emote-roue.png');

  // --- emotes : déclenchement, animation, réaction des collègues ---
  await step('emotes', `(async () => { const g = window.__game;
      const vus = [];
      g.player.emote = null;                 // la roue vient d'en lancer une
      const { EMOTES } = await import('./src/emotes.js');
      for (let i = 0; i < EMOTES.length; i++) {
        const def = g.player.declencherEmote(i);
        if (!def) { vus.push('refusée'); break; }
        g.reagirEmote(def);
        await new Promise(r => setTimeout(r, 120));
        const bouge = Math.abs(g.player.parts.armL.rotation.x) +
                      Math.abs(g.player.parts.upper.rotation.y);
        vus.push(def.id + '/silencieuse' + (bouge > 0.02 ? '+anim' : '+FIGÉ'));
        g.player.emote = null;                 // on enchaîne pour tester le tirage
        await new Promise(r => setTimeout(r, 60));
      }
      return JSON.stringify({ tirages: vus, temoins: g.temoinsEmote }); })()`);
  await shot('15-emote.png');

  // interruption par le déplacement
  await step('emote-interrompue', `(async () => { const g = window.__game;
      g.player.declencherEmote();
      await new Promise(r => setTimeout(r, 200));
      const avant = !!g.player.emote;
      g.input.add('KeyW');
      await new Promise(r => setTimeout(r, 400));
      g.input.delete('KeyW');
      const coupee = g.player.emote ? g.player.emote.coupee : true;
      await new Promise(r => setTimeout(r, 500));
      return JSON.stringify({ lancee: avant, coupee, disparue: !g.player.emote }); })()`);
  await step('portrait2', `(async () => { const g = window.__game;
      g.input.bascules.accroupir = true; await new Promise(r => setTimeout(r, 900));
      g.input.add('KeyW'); await new Promise(r => setTimeout(r, 700)); g.input.delete('KeyW');
      return 'ok'; })()`);
  await shot('09-perso-accroupi.png');
  await step('portrait3', `(() => { const g = window.__game;
      g.input.bascules.accroupir = false; g.camDist = 4.4; g.camYaw = Math.PI;
      g.camPitch = 0.30; g.player.pos.set(-15.2, 0, 5.4); return 'ok'; })()`);
  await wait(600);

  // ---- équité des derniers étages ----
  //
  // Mesure objective : combien de secondes tient-on au point de départ
  // SANS BOUGER ? Si on se fait repérer en quelques secondes sans avoir
  // rien fait, l'étage n'est pas difficile, il est cassé.
  await step('equite', `(async () => {
      const g = window.__game;
      const attendre = ms => new Promise(r => setTimeout(r, ms));
      const res = {};
      for (const idx of [4, 5]) {
        g.lancerCampagne(idx);
        await attendre(1400);
        g.player.vel.set(0, 0, 0);
        const t0 = performance.now();
        let pire = 0;
        while (g.state === 'play' && performance.now() - t0 < 35000) {
          await attendre(150);
          g.player.vel.set(0, 0, 0);          // on reste strictement immobile
          pire = Math.max(pire, Math.max(...g.npcs.map(n => n.suspicion)));
        }
        res['etage' + (idx + 1)] = {
          survie_immobile: +((performance.now() - t0) / 1000).toFixed(1),
          suspicion_max: +pire.toFixed(2),
          etat: g.state,
          ecranEchec: document.getElementById('screen-fail').classList.contains('on'),
          ecranSuite: document.getElementById('screen-suite').classList.contains('on'),
          niveauCharge: g.niveau.id,
          suspicions: g.npcs.map(n => n.name + ':' + n.suspicion.toFixed(2)).join(' '),
          limite: g.niveau.limite,
        };
      }
      g.lancerCampagne(0); await attendre(1200);
      return JSON.stringify(res, null, 1);
    })()`);

  // ---- diagnostic ciel ----
  await step('ciel', `(() => {
      const g = window.__game;
      let sky = null, villes = [];
      g.scene.traverse(o => {
        if (o.isMesh && o.geometry?.type === 'SphereGeometry' && o.material?.side === 1) sky = o;
      });
      g.level.root.traverse(o => { if (o.material === g.MAT.verreFenetre) villes.push(o); });
      return JSON.stringify({
        ciel_trouve: !!sky,
        ciel_a_map: !!sky?.material?.map,
        ciel_map_taille: sky?.material?.map?.image?.width + 'x' + sky?.material?.map?.image?.height,
        ciel_colorSpace: JSON.stringify(sky?.material?.map?.colorSpace),
        ciel_color: sky?.material?.color?.toArray()?.map(v => +v.toFixed(2)),
        ciel_visible: sky?.visible,
        vitres_baie: villes.length,
        toneMapping: g.renderer.toneMapping, expo: g.renderer.toneMappingExposure,
      });
    })()`);

  // captures isolantes : sans vitrage, puis sans ville
  await step('isoler', `(async () => { const g = window.__game;
      window.__vitres = []; g.level.root.traverse(o => {
        if (o.material === g.MAT.verreFenetre) { window.__vitres.push(o); o.visible = false; } });
      return 'vitres masquées: ' + window.__vitres.length; })()`);
  await wait(700); await shot('06-sans-vitrage.png');

  await step('isoler2', `(async () => { const g = window.__game;
      window.__villes = [];
      g.scene.children.forEach(o => {
        if (o.isMesh && o.geometry?.type === 'PlaneGeometry' && o.material?.fog === false) {
          window.__villes.push(o); o.visible = false; } });
      return 'plans ville masqués: ' + window.__villes.length; })()`);
  await wait(700); await shot('07-ciel-nu.png');
  await step('restaurer', `(window.__vitres||[]).forEach(o=>o.visible=true),
      (window.__villes||[]).forEach(o=>o.visible=true), 'ok'`);
  await wait(400);

  // ---- où passe le temps ? ----
  await step('goulot', `(async () => {
      const g = window.__game;
      const attendre = ms => new Promise(r => setTimeout(r, ms));
      const mesure = async () => { g.fpsFenetre.length = 0; await attendre(2000); return Math.round(g.fps); };
      const res = {};
      g.lancerCampagne(5);                       // l'étage le plus chargé
      await attendre(1500);

      let maillages = 0, sprites = 0;
      g.scene.traverse(o => { if (o.isMesh) maillages++; if (o.isSprite) sprites++; });
      let maillagesPnj = 0;
      for (const n of g.npcs) n.mesh.traverse(o => { if (o.isMesh) maillagesPnj++; });
      res.fusion = g.level.statsFusion;
      res.maillages_scene = maillages;
      res.maillages_pnj = maillagesPnj;
      res.sprites = sprites;

      res.reference = await mesure();

      // 1. sans les personnages
      g.npcs.forEach(n => { n.mesh.visible = false; n.cone.visible = false; });
      g.player.mesh.visible = false;
      res.sans_personnages = await mesure();
      g.npcs.forEach(n => { n.mesh.visible = true; n.cone.visible = true; });
      g.player.mesh.visible = true;

      // 2. sans les ombres
      g.lumieres.soleil.castShadow = false;
      res.sans_ombres = await mesure();
      g.lumieres.soleil.castShadow = true;

      // 3. moitié moins de pixels
      g.renderer.setPixelRatio(0.7); g.onResize();
      res.demi_resolution = await mesure();
      g.renderer.setPixelRatio(window.__R.pixelRatioDe(g.qualite)); g.onResize();

      // 4. sans post-traitement du tout
      const sauv = g.qualite;
      g.setQualite('bas', true); await attendre(800);
      res.sans_post = await mesure();
      g.setQualite(sauv, true); await attendre(800);

      // On revient à l'étage 1 : l'étage 6 lance la chasse dès le départ
      // et fausserait toutes les étapes suivantes.
      g.lancerCampagne(0); await attendre(1200);
      return JSON.stringify(res, null, 1);
    })()`);

  // ---- banc d'essai : les trois paliers réels ----
  await step('banc', `(async () => {
      const g = window.__game;
      const attendre = ms => new Promise(r => setTimeout(r, ms));
      const mesure = async () => { g.fpsFenetre.length = 0; await attendre(2200); return Math.round(g.fps); };
      const gl = g.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const res = { gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL).slice(0, 58) : '?',
                    auto: g.qualite };
      for (const q of ['bas', 'moyen', 'haut', 'ultra']) {
        g.setQualite(q, true);
        res[q] = await mesure() + ' fps @ ' + g.renderer.domElement.width + 'x' + g.renderer.domElement.height;
      }
      g.setQualite(res.auto, true);
      g.repliFait = true;              // pas de repli auto pendant les tests
      return JSON.stringify(res, null, 1);
    })()`);

  // strafe : à camYaw = PI (vue par défaut), D doit emmener vers +X
  await step('strafe', `(async () => { const g = window.__game;
      g.camYaw = Math.PI; const x0 = g.player.pos.x;
      g.input.add('KeyD'); await new Promise(r => setTimeout(r, 700)); g.input.delete('KeyD');
      const dD = g.player.pos.x - x0;
      const x1 = g.player.pos.x;
      g.input.add('KeyA'); await new Promise(r => setTimeout(r, 700)); g.input.delete('KeyA');
      const dA = g.player.pos.x - x1;
      return JSON.stringify({ D_vers_la_droite: +dD.toFixed(2), A_vers_la_gauche: +dA.toFixed(2),
        correct: dD > 0.2 && dA < -0.2 }); })()`);

  // accroupi
  await step('accroupi', `(async () => { const g = window.__game;
      const f0 = g.renderer.info.render.frame;
      g.input.add('ControlLeft');
      await new Promise(r => setTimeout(r, 1200));
      return JSON.stringify({ crouch: +g.player.crouch.toFixed(2),
        touche_vue: g.input.has('ControlLeft'), wantCrouch: g.player.wantCrouch,
        frames_pendant_attente: g.renderer.info.render.frame - f0,
        etat: document.getElementById('state-chip').textContent }); })()`);
  await shot('03-accroupi.png');

  // sortie par les escaliers
  await step('escaliers', `(async () => { const g = window.__game; g.input.delete('ControlLeft');
      g.player.pos.set(8, 0, 12.6); await new Promise(r => setTimeout(r, 300));
      const invite = document.getElementById('prompt').textContent;
      g.tryInteract(); await new Promise(r => setTimeout(r, 3500));
      return JSON.stringify({ invite, etat: g.state, victoire: document.getElementById('screen-suite').classList.contains('on') }); })()`);
  await shot('04-victoire.png');

  // échec : on se plante debout dans le champ de vision du boss et on attend
  await step('echec', `(async () => { const g = window.__game;
      g.rejouerNiveau(); await new Promise(r => setTimeout(r, 500));
      g.player.pos.set(16, 0, -6.5);            // plein cône du directeur, sans couvert
      const boss = g.npcs.find(n => n.isBoss);
      const t0 = performance.now();
      while (g.state === 'play' && performance.now() - t0 < 8000)
        await new Promise(r => setTimeout(r, 100));
      return JSON.stringify({ secondes_avant_reperage: +((performance.now()-t0)/1000).toFixed(1),
        suspicion_boss: +boss.suspicion.toFixed(2), etat: g.state,
        ecran_echec: document.getElementById('screen-fail').classList.contains('on'),
        replique: document.getElementById('fail-line').textContent.slice(0, 70) }); })()`);
  await shot('05-echec.png');

  // enchaînement : on force la fin de l'étage 1 et on vérifie le déblocage
  await step('enchainement', `(async () => { const g = window.__game;
      g.lancerCampagne(0); await new Promise(r => setTimeout(r, 600));
      g.terminerNiveau('stairs'); await new Promise(r => setTimeout(r, 400));
      const suiteVisible = document.getElementById('screen-suite').classList.contains('on');
      const debloques = g.etat.niveauxFinis.slice();
      document.getElementById('btn-suivant').click();
      await new Promise(r => setTimeout(r, 1400));
      return JSON.stringify({ suiteVisible, debloques,
        niveauCourant: g.niveauIndex + 1, titre: g.niveau.titre, etat: g.state,
        pnj: g.npcs.length, obstacles: g.level.obstacles.length }); })()`);
  await shot('12-niveau2.png');

  // speedrun : chrono cumulé, tous les étages ouverts
  await step('speedrun', `(async () => { const g = window.__game;
      g.lancerSpeedrun(0); await new Promise(r => setTimeout(r, 700));
      const chrono = document.getElementById('chrono-sr').classList.contains('on');
      g.terminerNiveau('stairs'); await new Promise(r => setTimeout(r, 1500));
      return JSON.stringify({ chronoAffiche: chrono, mode: g.mode,
        niveauCourant: g.niveauIndex + 1, splits: g.srSplits.length,
        cumul: +g.srTemps.toFixed(1) }); })()`);

  // chargement du dernier étage (plan C, le plus chargé)
  await step('dernier-etage', `(async () => { const g = window.__game;
      g.mode = 'campagne'; g.lancerCampagne(5);
      await new Promise(r => setTimeout(r, 1200));
      g.fpsFenetre.length = 0;                 // on écarte l'à-coup de chargement
      await new Promise(r => setTimeout(r, 2500));
      return JSON.stringify({ titre: g.niveau.titre, pnj: g.npcs.length,
        objets: g.level.ramassables.length, sorties: g.level.interactables.length,
        obstacles: g.level.obstacles.length, fps: +g.fps.toFixed(0) }); })()`);
  await shot('13-niveau6.png');

  // Un collègue de près : les améliorations du joueur doivent se voir
  // sur lui aussi. EN DERNIER, parce que s'approcher à 1,5 m d'un PNJ
  // le fait repérer : placée plus haut, cette étape faisait échouer la
  // partie et toutes les captures suivantes montraient l'écran de fin.
  await step('collegue', `(async () => { const g = window.__game;
      const n = g.npcs[0]; if (!n) return 'aucun';
      g.player.pos.set(n.pos.x + 1.6, 0, n.pos.z - 0.9); g.player.vel.set(0, 0, 0);
      g.camDist = 2.3; g.camYaw = -Math.PI / 2; g.camPitch = 0.02;
      await new Promise(r => setTimeout(r, 700));
      return JSON.stringify({ nom: n.name, veste: !!n.look && !!n.look.veste }); })()`);
  await shot('22-collegue.png');

  await step('silence-alertes', `(() => {
    const g=window.__game, a=g.audio, appels=[];
    const burst=a.burst, noise=a.noiseHit;
    a.burst=()=>appels.push('note'); a.noiseHit=()=>appels.push('bruit');
    try {
      const n=g.npcs[0];n.state='doute';n.onChangementEtat('travail',g);
      n.state='observation';n.onChangementEtat('doute',g);
      if(appels.length)throw Error('Détection audible');
      return {appels,banqueSupprimee:typeof a.alerteCramee==='undefined'};
    } finally {a.burst=burst;a.noiseHit=noise;}
  })()`);

  await step('ux-pause-reprise', `(async () => {
      const g = window.__game;
      const assert = (v, m) => { if (!v) throw new Error(m); };
      g.rejouerNiveau();
      g.input.add('KeyW'); g.ouvrirRoue();
      dispatchEvent(new Event('blur'));
      assert(g.state === 'pause' && g.input.size === 0 && !g.roueOuverte, 'Perte de focus sans pause propre');
      const temps = g.elapsed;
      await new Promise(r => setTimeout(r, 200));
      assert(g.elapsed === temps, 'Le chrono continue pendant la pause');
      document.getElementById('btn-pause-options').click();
      assert(g.state === 'pause' && !document.getElementById('menu-options').hidden, 'Options de pause');
      dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }));
      assert(document.getElementById('screen-pause').classList.contains('on'), 'Retour des options');
      g.resume();
      assert(document.getElementById('objectifs').classList.contains('on'), 'Objectifs perdus à la reprise');
      g.player.epuise = true; g.player.running = true; g.player.speed = 5; g.player.declencherEmote(0);
      g.rejouerNiveau();
      assert(!g.player.epuise && !g.player.running && !g.player.emote && g.player.speed === 0, 'État joueur conservé au restart');
      assert(g.scene.children.filter(o => o.geometry?.type === 'SphereGeometry' && o.geometry.parameters.radius === 190).length === 1, 'Ciel créé plusieurs fois');
      g.pause();
      return 'Pause, options, chrono gelé, reprise et restart : OK'; })()`);

  await step('ux-hud-compact', `(() => {
      const g = window.__game;
      g.resume();
      const d = document.getElementById('det-wrap').getBoundingClientRect();
      const s = document.getElementById('chrono-sr'); s.classList.add('on');
      const r = s.getBoundingClientRect();
      if (d.left < r.right && d.right > r.left && d.top < r.bottom && d.bottom > r.top)
        throw new Error('Chrono et détection se chevauchent');
      s.classList.remove('on');
      g.pause();
      return 'Chrono distinct de la détection : OK'; })()`);

  let erreursPage = [];
  try { erreursPage = JSON.parse(await js('JSON.stringify(window.__erreurs || [])')); }
  catch { /* page morte */ }
  fs.writeFileSync(path.join(out, 'rapport.json'),
    JSON.stringify({ steps, consoleErrors: logs, erreursPage }, null, 2));
  app.quit();
}

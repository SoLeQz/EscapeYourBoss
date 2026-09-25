// Autotest multijoueur : deux fenêtres du même exécutable, l'une héberge, l'autre
// rejoint par la découverte réseau (127.0.0.1). Tout passe par le vrai réseau TCP/UDP.
const { BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

module.exports = async ({ js, shot, step, wait }) => {
  const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) || path.join(require('electron').app.getPath('temp'), 'selftest');
  // Côte à côte, sans recouvrement : Windows ralentit une fenêtre masquée (≈ 10 i/s).
  const { screen } = require('electron'), zone = screen.getPrimaryDisplay().workArea, demi = Math.floor(zone.width / 2);
  BrowserWindow.getAllWindows()[0].setBounds({ x: zone.x, y: zone.y, width: demi, height: Math.min(zone.height, 700) });
  const invite = new BrowserWindow({ x: zone.x + demi, y: zone.y, width: demi, height: Math.min(zone.height, 700), show: true, title: 'Invité',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true,
      nodeIntegration: false, backgroundThrottling: false, additionalArguments: ['--jeu-selftest'] } });
  await invite.loadFile(path.join(__dirname, '..', 'index.html'));
  const js2 = e => invite.webContents.executeJavaScript(e, true);
  const shot2 = async nom => fs.writeFileSync(path.join(out, nom), (await invite.webContents.capturePage()).toJPEG(88));
  for (let i = 0; i < 160 && !(await js2("!!window.__game && document.getElementById('chargement').classList.contains('parti')")); i++) await wait(250);
  const step2 = async (nom, e) => step(nom, `Promise.resolve(${JSON.stringify(nom)})`).then(async () => {
    // exécute dans la fenêtre invitée, consigne le résultat comme une étape
    let r; try { r = await js2(e); } catch (err) { r = { erreur: err.message }; }
    return r;
  });
  const attendre = async (fenetre, cond, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await fenetre(cond)) return true; await wait(150); }
    const diag = "JSON.stringify({etat:__game.state,prep:__game.preparation,niveau:__game.niveauIndex,mode:__game.mode,connecte:__game.multi.connecte,pret:__game.multi.pretIndex,monde:__game.multi.monde?.idx})";
    throw Error('Délai dépassé : ' + cond + ' · hôte ' + await js(diag) + ' · invité ' + await js2(diag));
  };
  const resultats = {};
  const etape = async (nom, f) => { try { resultats[nom] = await f(); await step(nom, `(${JSON.stringify(resultats[nom])})`); } catch (e) { await step(nom, `(()=>{throw Error(${JSON.stringify(e.message)})})()`); } };

  await etape('heberger', async () => {
    const r = await js(`(async()=>{const g=__game;g.menu.ouvrir('menu-multi');document.getElementById('multi-nom').value='Lao D';document.getElementById('btn-heberger').click();await new Promise(r=>setTimeout(r,600));return {role:g.multi.role,statut:document.getElementById('multi-statut').textContent}})()`);
    if (r.role !== 'hote') throw Error('Hôte non ouvert : ' + r.statut);
    return r;
  });
  await etape('decouverte', async () => {
    const r = await js2(`(async()=>{const g=__game;g.menu.ouvrir('menu-multi');document.getElementById('multi-nom').value='Ami';document.getElementById('btn-chercher').click();
      for(let i=0;i<40&&!document.querySelector('#multi-parties .menu-btn');i++)await new Promise(r=>setTimeout(r,100));
      const b=document.querySelector('#multi-parties .menu-btn');return {trouve:!!b,texte:b?.textContent,statut:document.getElementById('multi-statut').textContent}})()`);
    if (!r.trouve || !/Lao D/.test(r.texte)) throw Error('Partie non découverte : ' + r.statut);
    return r;
  });
  await etape('connexion', async () => {
    await js2(`document.querySelector('#multi-parties .menu-btn').click()`);
    await attendre(js, '__game.multi.connecte'); await attendre(js2, '__game.multi.connecte');
    await wait(400);
    return { hote: await js('[__game.multi.role,__game.multi.nomDistant]'), invite: await js2('[__game.multi.role,__game.multi.nomDistant]') };
  });
  await shot('multi-salon-hote.jpg'); await shot2('multi-salon-invite.jpg');

  await etape('lancement', async () => {
    await js(`document.getElementById('multi-etage').value='1';document.getElementById('btn-multi-lancer').click()`);
    await attendre(js, "__game.state==='play'&&!__game.preparation", 30000);
    await attendre(js2, "__game.state==='play'&&!__game.preparation", 30000);
    return { hote: await js('[__game.mode,__game.niveauIndex]'), invite: await js2('[__game.mode,__game.niveauIndex]') };
  });
  await wait(1200);
  await shot('multi-jeu-hote.jpg'); await shot2('multi-jeu-invite.jpg');

  await etape('coequipier-suivi', async () => {
    // l'invité se déplace (téléporté pour le test) : l'hôte doit le voir au même endroit
    const i0 = await js('__game.imagesRendues||0');
    await js2(`(()=>{const p=__game.player;p.pos.x+=1.5;p.pos.z+=.8})()`);
    await wait(900);
    const imagesHote = (await js('__game.imagesRendues||0')) - i0;
    // position réelle de l'invité (la collision a pu le repousser d'un meuble)
    const cible = await js2(`(()=>{const p=__game.player;return {x:p.pos.x,z:p.pos.z}})()`);
    const vu = await js(`(()=>{const c=__game.coequipier,d=__game.multi.etatDistant;return {x:c.pos.x,z:c.pos.z,visible:c.mesh.visible,recu:d&&{x:d.x,z:d.z}}})()`);
    const encore = await js2(`(()=>{const p=__game.player;return {x:p.pos.x,z:p.pos.z,v:p.speed,etat:__game.state,prep:__game.preparation}})()`);
    const ecart = Math.hypot(vu.x - cible.x, vu.z - cible.z);
    if (!vu.visible || ecart > .25) throw Error(`Coéquipier mal placé chez l'hôte (${ecart.toFixed(2)} m) ` + JSON.stringify({cible,vu,encore,imagesHote}));
    return { ecart: +ecart.toFixed(3), imagesHote };
  });
  await etape('collegues-synchronises', async () => {
    await wait(500);
    const h = await js('__game.npcs.map(n=>[n.pos.x,n.pos.z])'), i = await js2('__game.npcs.map(n=>[n.pos.x,n.pos.z])');
    const pire = Math.max(...h.map((p, k) => Math.hypot(p[0] - i[k][0], p[1] - i[k][1])));
    if (h.length !== i.length || pire > .8) throw Error('Collègues désynchronisés : ' + pire.toFixed(2) + ' m');
    return { collegues: h.length, ecartMax: +pire.toFixed(3) };
  });
  await etape('objet-partage', async () => {
    const n = await js2('__game.level.ramassables.length');
    if (!n) return { objets: 0 };
    await js2(`(()=>{const o=__game.level.ramassables[0];__game.player.pos.set(o.x,0,o.z)})()`);
    await attendre(js, '__game.level.ramassables[0].pris', 5000);
    return { objets: n, prisChezHote: true };
  });
  await etape('perception-invite', async () => {
    // l'hôte se cache loin ; l'invité se plante devant un collègue assis
    // point réellement vu par un collègue (champ + ligne de vue), calculé chez l'hôte
    const r = await js(`(async()=>{const g=__game,{mesurerVue}=await import('./src/perception.js');
      for(const n of g.npcs.filter(n=>!n.isBoss))for(const d of [1.6,2.2,3,4])for(const a of [0,-.3,.3,-.6,.6]){
        const h=n.headYaw+a,ex=n.pos.x+Math.sin(h)*d,ez=n.pos.z+Math.cos(h)*d;
        const faux={pos:{x:ex,z:ez},chestY:1.3,eyeY:1.62,crouch:0};
        if(g.level.obstacles.some(o=>ex>o.x1-.4&&ex<o.x2+.4&&ez>o.z1-.4&&ez<o.z2+.4))continue;
        if(mesurerVue(n,faux,g.level.obstacles).visible){n.suspicion=0;return {i:g.npcs.indexOf(n),ex,ez,d,a}}}
      return null})()`);
    if (!r) throw Error('Aucun point visible trouvé pour le test');
    await js2(`__game.player.pos.set(${r.ex},0,${r.ez});__game.player.working=null`);
    await wait(1500);
    const s = await js(`(()=>{const n=__game.npcs[${r.i}];return {suspicion:n.suspicion,vu:Math.hypot(n.lastSeen.x-(${r.ex}),n.lastSeen.z-(${r.ez}))}})()`);
    if (!(s.suspicion > .05) || s.vu > 1.5) throw Error('Le collègue de l’hôte ne perçoit pas l’invité : ' + JSON.stringify(s));
    return s;
  });
  await shot('multi-perception-hote.jpg'); await shot2('multi-perception-invite.jpg');
  await etape('defaite-partagee', async () => {
    await js(`__game.lose(__game.npcs[0])`);  // la détection elle-même est couverte par les tests solo
    await attendre(js, "__game.state==='over'", 5000);
    await attendre(js2, "__game.state==='over'&&document.getElementById('screen-fail').classList.contains('on')", 5000);
    return { hote: 'fail', invite: 'fail' };
  });
  await shot2('multi-defaite-invite.jpg');
  await etape('relance-et-victoire', async () => {
    await js(`document.getElementById('btn-retry').click()`);
    await attendre(js, "__game.state==='play'&&!__game.preparation", 30000);
    await attendre(js2, "__game.state==='play'&&!__game.preparation", 30000);
    await wait(500);
    // les deux sortent (la séquence d'ascenseur est testée en solo) : victoire commune
    await js2(`(()=>{const m=__game.multi;m.sortiLocal=true;m.envoiT=0;m.envoyerJoueur(0)})()`);
    await wait(400);
    await js(`(()=>{const g=__game,m=g.multi;m.sortiLocal=true;m.routeSortie='stairs';g.verifierSortieMulti()})()`);
    await attendre(js, "document.getElementById('screen-suite').classList.contains('on')", 5000);
    await attendre(js2, "document.getElementById('screen-suite').classList.contains('on')", 5000);
    return { hote: await js("document.getElementById('suite-titre').textContent"), invite: await js2("document.getElementById('btn-suivant').textContent") };
  });
  await shot('multi-victoire-hote.jpg'); await shot2('multi-victoire-invite.jpg');
  await etape('deconnexion', async () => {
    await js(`document.getElementById('btn-suivant').click()`);  // l'hôte lance l'étage suivant
    await attendre(js2, "__game.state==='play'", 30000);
    await js2('__game.multi.quitter()');
    await attendre(js, "__game.state==='menu'&&!document.getElementById('menu-multi').hidden", 5000);
    return { hote: await js("document.getElementById('multi-statut').textContent") };
  });
  invite.destroy();
  await js('__game.multi.quitter()');
};

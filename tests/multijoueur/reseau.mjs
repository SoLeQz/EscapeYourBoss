// Couche réseau du multijoueur, testée en Node pur (hôte + invité sur la même machine).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { creerSession, rechercherParties } = createRequire(import.meta.url)('../../electron/reseau.cjs');
const PORTS = { portJeu: 47900, portDecouverte: 47901 };
const attendre = (liste, pred, ms = 3000) => new Promise((res, rej) => {
  const t0 = Date.now(), iv = setInterval(() => { const e = liste.find(pred); if (e) { clearInterval(iv); res(e); } else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('délai : ' + pred)); } }, 10);
});
const evH = [], evI = [];
const hote = creerSession({ version: '1.6.0', evenement: e => evH.push(e), adresseEcoute: '127.0.0.1', ...PORTS });
const invite = creerSession({ version: '1.6.0', evenement: e => evI.push(e), ...PORTS });
await hote.heberger('Lao D');
// découverte par balise UDP (au moins via 127.0.0.1)
const parties = await rechercherParties({ duree: 1500, version: '1.6.0', portDecouverte: PORTS.portDecouverte });
const p = parties.find(x => x.nom === 'Lao D');
assert(p && p.compatible && p.port === PORTS.portJeu, 'Partie non découverte : ' + JSON.stringify(parties));
await invite.rejoindre('127.0.0.1', 'Ami', PORTS.portJeu);
assert.equal((await attendre(evH, e => e.type === 'connecte')).nom, 'Ami');
assert.equal((await attendre(evI, e => e.type === 'connecte')).role, 'invite');
// messages dans les deux sens, y compris plusieurs dans un même paquet TCP
for (let i = 0; i < 50; i++) invite.envoyer({ t: 'joueur', i, x: i * .1 });
hote.envoyer({ t: 'monde', npcs: [{ x: 1, z: 2 }], texte: 'Où est passé Lao D ? 🙂\nligne' });
await attendre(evH, e => e.type === 'message' && e.msg.i === 49);
assert.equal(evH.filter(e => e.type === 'message').length, 50, 'Messages perdus ou dupliqués');
assert.equal((await attendre(evI, e => e.type === 'message')).msg.texte, 'Où est passé Lao D ? 🙂\nligne');
// un troisième joueur est refusé
const evT = [], tiers = creerSession({ version: '1.6.0', evenement: e => evT.push(e), ...PORTS });
await tiers.rejoindre('127.0.0.1', 'Intrus', PORTS.portJeu);
assert.match((await attendre(evT, e => e.type === 'deconnecte')).raison, /complète/);
// déconnexion de l'invité signalée à l'hôte
invite.fermer();
await attendre(evH, e => e.type === 'deconnecte');
// version différente refusée des deux côtés
const evV = [], vieux = creerSession({ version: '1.5.0', evenement: e => evV.push(e), ...PORTS });
await vieux.rejoindre('127.0.0.1', 'Vieux', PORTS.portJeu);
assert.match((await attendre(evV, e => e.type === 'deconnecte')).raison, /Versions différentes|Version différente/);
// hôte injoignable
await assert.rejects(creerSession({ version: '1.6.0', evenement: () => {}, portJeu: 47999 }).rejoindre('127.0.0.1', 'X', 47999), /Aucune partie/);
hote.fermer(); tiers.fermer(); vieux.fermer();
console.log(`Réseau : découverte UDP, connexion, ${50 + 1} messages, 3e joueur refusé, version vérifiée, déconnexion signalée.`);

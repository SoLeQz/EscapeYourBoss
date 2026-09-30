// « Juste 5 minutes » : règles de la machine à sous de la borne d'arcade.
// Lecture des lignes, sauvages, multiplicateurs, sorties, tours gratuits,
// plafond et taux de redistribution mesuré sur une graine fixe (reproductible).
import assert from 'node:assert/strict';
import { SYMBOLES, LIGNES, COLONNES, RANGEES, MISES, GAIN_MAX, BONUS, TOURS_RELANCE, evaluer, tirerGrille,
  jouerTour, jouerBonus, hasard, palier, nettoyerCantine, bonusDeSorties } from '../../src/machine-a-sous-regles.js';
import { DESSINS } from '../../src/machine-a-sous-symboles.js';

// Grille à la main : une lettre par symbole, rangées de haut en bas.
const code = { t: 'trombone', a: 'agrafeuse', p: 'postit', c: 'tasse', u: 'tampon', v: 'cravate', o: 'portable', b: 'badge', d: 'directeur', w: 'sauvage', s: 'sortie' };
function grille(rangees, canards = {}) {
  const g = Array.from({ length: COLONNES }, () => []);
  rangees.forEach((ligne, r) => [...ligne].forEach((ch, c) => { g[c][r] = ch === 'k' ? { s: 'canard', m: canards[`${c},${r}`] ?? 2 } : { s: code[ch] }; }));
  return g;
}

// ---------------------------------------------------------------- catalogue
assert.equal(LIGNES.length, 14);
for (const l of LIGNES) { assert.equal(l.length, COLONNES); assert(l.every(r => r >= 0 && r < RANGEES)); }
assert.equal(new Set(LIGNES.map(String)).size, LIGNES.length, 'Lignes en double');
for (const id of Object.keys(SYMBOLES)) assert(DESSINS[id]?.startsWith('<svg'), 'Dessin manquant : ' + id);
for (const [id, s] of Object.entries(SYMBOLES)) if (s.gains) assert(s.gains[0] < s.gains[1] && s.gains[1] < s.gains[2], 'Gains non croissants : ' + id);

// ---------------------------------------------------------------- lecture des lignes
{ // 5 trombones sur la ligne 1 (rangée du milieu haute)
  const r = evaluer(grille(['aaaaa', 'ttttt', 'pcpcp', 'ucucu']), 1);
  const l1 = r.gains.find(g => g.ligne === 0);
  assert.equal(l1.symbole, 'trombone'); assert.equal(l1.nombre, 5); assert.equal(l1.gain, SYMBOLES.trombone.gains[2]);
}
{ // mise proportionnelle
  const a = evaluer(grille(['aaaaa', 'ttttt', 'pcpcp', 'ucucu']), 1).total, b = evaluer(grille(['aaaaa', 'ttttt', 'pcpcp', 'ucucu']), 5).total;
  assert(Math.abs(b - 5 * a) < 0.011);
}
{ // le réveil remplace, la sortie interrompt
  const r = evaluer(grille(['pcpcp', 'bwbsb', 'cpcpc', 'upupu']), 1);
  const l1 = r.gains.find(g => g.ligne === 0);
  assert.equal(l1.symbole, 'badge'); assert.equal(l1.nombre, 3, 'La sortie ne remplace rien');
  assert.deepEqual(r.sorties, [[3, 1]]);
}
{ // canards : les multiplicateurs de la ligne s'additionnent
  const r = evaluer(grille(['pcpcp', 'dkkdt', 'cpcpc', 'upupu'], { '1,1': 5, '2,1': 2 }), 1);
  const l1 = r.gains.find(g => g.ligne === 0);
  assert.equal(l1.nombre, 4); assert.equal(l1.mult, 7); assert.equal(l1.gain, SYMBOLES.directeur.gains[1] * 7);
}
{ // une ligne qui commence par des sauvages prend la meilleure lecture
  const r = evaluer(grille(['pcpcp', 'wwwdd', 'cpcpc', 'upupu']), 1);
  const l1 = r.gains.find(g => g.ligne === 0);
  assert.equal(l1.symbole, 'directeur', 'Cinq directeurs valent mieux que trois réveils'); assert.equal(l1.nombre, 5);
  assert.equal(evaluer(grille(['pcpcp', 'wwwtt', 'cpcpc', 'upupu']), 1).gains.find(g => g.ligne === 0).symbole, 'sauvage');
  const seul = evaluer(grille(['pcpcp', 'wwwuv', 'cpcpc', 'upupu']), 1).gains.find(g => g.ligne === 0);
  assert.equal(seul.symbole, 'sauvage', 'Trois réveils valent mieux que quatre tampons');
}
{ // rien à gauche : pas de gain
  const r = evaluer(grille(['tptpt', 'ptptp', 'cucuc', 'ucucu']), 1);
  assert.equal(r.total, 0); assert.equal(r.gains.length, 0);
}
assert.equal(bonusDeSorties(2), null); assert.equal(bonusDeSorties(3), 'pause'); assert.equal(bonusDeSorties(5), 'super');

// ---------------------------------------------------------------- tirage
const alea = hasard(20260930);
for (let i = 0; i < 20000; i++) {
  const g = tirerGrille(alea, 'base');
  for (let c = 0; c < COLONNES; c++) {
    assert(g[c].filter(x => x.s === 'sortie').length <= 1, 'Deux sorties sur un rouleau');
    if (c === 0) assert(!g[c].some(x => x.s === 'canard' || x.s === 'sauvage'), 'Sauvage sur le premier rouleau');
    if (c === 4) assert(!g[c].some(x => x.s === 'sauvage'), 'Réveil sur le dernier rouleau');
    for (const x of g[c]) if (x.s === 'canard') assert([2, 3, 5, 10, 25, 100].includes(x.m));
  }
}

// ---------------------------------------------------------------- tours gratuits
for (const type of ['pause', 'super']) for (let k = 0; k < 300; k++) {
  const b = jouerBonus(type, 1, alea);
  assert(b.tours.length >= BONUS[type].tours || b.tours.at(-1).plafond, 'Bonus trop court sans avoir atteint le gain max');
  assert(b.total <= GAIN_MAX + 1e-9, 'Plafond dépassé');
  const vus = new Map();
  for (const t of b.tours) {
    for (const [cle, m] of vus) {
      const [c, r] = cle.split(',').map(Number), x = t.grille[c][r];
      assert.equal(x.s, 'canard', 'Un canard collé a disparu');
      assert(x.m >= m + (type === 'super' ? 1 : 0), 'Multiplicateur collé qui baisse');
    }
    t.grille.forEach((col, c) => col.forEach((x, r) => { if (x.s === 'canard') vus.set(`${c},${r}`, x.m); }));
    if (t.relance) assert.equal(t.relance, TOURS_RELANCE);
  }
  assert(Math.abs(b.tours.at(-1).cumul - b.total) < 1e-9);
}

// ---------------------------------------------------------------- taux de redistribution (graine fixe)
const g2 = hasard(4242), N = 400000, NB = 30000;
let ligne = 0, declenche = { pause: 0, super: 0 }, gagnants = 0, maxTour = 0;
for (let i = 0; i < N; i++) {
  const t = jouerTour(1, g2); ligne += t.total; gagnants += t.total > 0;
  maxTour = Math.max(maxTour, t.total); if (t.bonus) declenche[t.bonus]++;
}
assert(maxTour <= GAIN_MAX, 'Tour au-delà du plafond');
const moyenne = {};
for (const type of ['pause', 'super']) { let s = 0; for (let i = 0; i < NB; i++) s += jouerBonus(type, 1, g2).total; moyenne[type] = s / NB; }
const rtp = ligne / N + declenche.pause / N * moyenne.pause + declenche.super / N * moyenne.super;
assert(rtp > 0.945 && rtp < 0.985, `Redistribution hors cible : ${(rtp * 100).toFixed(1)} %`);
for (const type of ['pause', 'super']) {
  const r = moyenne[type] / BONUS[type].prix;
  assert(r > 0.92 && r < 0.99, `Achat ${type} : ${(r * 100).toFixed(1)} %`);
}
const frequence = gagnants / N;
assert(frequence > 0.22 && frequence < 0.32, 'Fréquence de gain inhabituelle');

// ---------------------------------------------------------------- paliers et sauvegarde
assert.equal(palier(14, 1), null); assert.equal(palier(15, 1), 'gros'); assert.equal(palier(60, 1), 'mega');
assert.equal(palier(150, 1), 'epique'); assert.equal(palier(GAIN_MAX, 1), 'max');
assert.equal(nettoyerCantine(null), null);
const c = nettoyerCantine({ solde: -4, mise: 3, tours: 'x', son: false, historique: [{ heure: '12:00:00', mise: 1, gain: 2 }, null, 7] });
assert.equal(c.solde, 1000); assert.equal(c.mise, 1); assert.equal(c.tours, 0); assert.equal(c.son, false); assert.equal(c.historique.length, 1);
assert.deepEqual(nettoyerCantine(JSON.parse(JSON.stringify(c))), c);
assert(MISES.every((m, i) => i === 0 || m > MISES[i - 1]));

console.log(`Machine à sous : 14 lignes, sauvages et multiplicateurs, sorties, canards collés, plafond ${GAIN_MAX}× ; `
  + `redistribution ${(rtp * 100).toFixed(1)} % (graine fixe), achats ${(moyenne.pause / 100 * 100).toFixed(1)} % / ${(moyenne.super / 400 * 100).toFixed(1)} %, `
  + `un tour gagnant sur ${(1 / frequence).toFixed(1)}.`);

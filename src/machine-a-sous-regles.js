// ============================================================
//  « Juste 5 minutes » — la machine à sous de la salle de sieste.
//  Règles pures (aucun DOM) : tirage, lignes, multiplicateurs, tours
//  gratuits, achat de bonus, plafond de gain. Monnaie fictive (tickets
//  restaurant, « TR ») : rien ne s'achète, rien ne se retire.
//
//  5 rouleaux × 4 rangées, 14 lignes, gains de gauche à droite.
//  Le taux de redistribution est mesuré par simulation dans
//  tests/interface/machine-a-sous.mjs (cible 96 %, tolérance ±1,5 %).
// ============================================================

export const COLONNES = 5, RANGEES = 4;

// Gains en multiples de la mise totale, pour 3, 4 et 5 symboles alignés.
// Les fournitures de bureau sont les « petites cartes », les personnages les gros lots.
export const SYMBOLES = {
  trombone:  { nom: 'Trombone',          gains: [0.6, 1.2, 3] },
  agrafeuse: { nom: 'Agrafeuse',         gains: [0.6, 1.2, 3] },
  postit:    { nom: 'Post-it',           gains: [0.6, 1.8, 3.6] },
  tasse:     { nom: 'Tasse de café',     gains: [0.6, 1.8, 3.6] },
  tampon:    { nom: 'Tampon URGENT',     gains: [1.2, 2.4, 6] },
  cravate:   { nom: 'Cravate',           gains: [1.8, 3.6, 9] },
  portable:  { nom: 'Ordinateur',        gains: [2.4, 6, 15] },
  badge:     { nom: 'Badge d’accès',     gains: [3, 9, 24] },
  directeur: { nom: 'Le directeur',      gains: [6, 18, 60] },
  sauvage:   { nom: 'Réveil « 5 min »',  gains: [6, 30, 150], sauvage: true },
  canard:    { nom: 'Canard multiplicateur', sauvage: true, multiplicateur: true },
  sortie:    { nom: 'Sortie de secours', dispersion: true },
};
export const ORDRE = Object.keys(SYMBOLES);

// 14 lignes : rangée visitée sur chaque rouleau (0 = en haut).
export const LIGNES = [
  [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [0, 0, 0, 0, 0], [3, 3, 3, 3, 3],
  [0, 1, 2, 1, 0], [3, 2, 1, 2, 3], [1, 2, 3, 2, 1], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 3], [3, 3, 2, 1, 0], [1, 0, 0, 0, 1], [2, 3, 3, 3, 2],
  [0, 1, 1, 1, 0], [3, 2, 2, 2, 3],
];

export const MISES = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
export const MISE_DEFAUT = 1;
export const GAIN_MAX = 5000;              // × la mise, par tour ou par bonus complet
export const SOLDE_INITIAL = 1000;
export const AVANCE_SUR_SALAIRE = 500;

// Multiplicateur porté par un canard : (valeur, poids).
export const MULTIPLICATEURS = [[2, 50], [3, 26], [5, 13], [10, 7], [25, 3], [100, 1]];

// Poids de tirage par rouleau, dans l'ordre de ORDRE (trombone … sortie).
// Le réveil « 5 min » ne tombe que sur les rouleaux 2 à 4, les canards sur 2 à 5.
const SAUVAGE_BASE = 3.2;
const P = (bas, haut, sauvage, canard, sortie) => [...bas, ...haut, sauvage, canard, sortie];
// Pendant les tours gratuits : plus de canards (ils restent collés). Leur poids
// dépend du bonus, réglé pour que chaque achat redistribue ~96 % de son prix.
export const poidsBonus = canard => [
  P([30, 30, 26, 26, 22], [16, 12, 9, 6], 0, 0, 2),
  P([30, 30, 26, 26, 22], [16, 12, 9, 6], 3, canard, 2),
  P([30, 30, 26, 26, 22], [16, 12, 9, 6], 3, canard, 2),
  P([30, 30, 26, 26, 22], [16, 12, 9, 6], 3, canard, 2),
  P([30, 30, 26, 26, 22], [16, 12, 9, 6], 0, canard, 2),
];
export const POIDS = {
  base: [
    P([30, 30, 26, 26, 22], [16, 12, 9, 6], 0, 0, 3.25),
    P([30, 30, 26, 26, 22], [16, 12, 9, 6], SAUVAGE_BASE, 2.2, 3.25),
    P([30, 30, 26, 26, 22], [16, 12, 9, 6], SAUVAGE_BASE, 2.2, 3.25),
    P([30, 30, 26, 26, 22], [16, 12, 9, 6], SAUVAGE_BASE, 2.2, 3.25),
    P([30, 30, 26, 26, 22], [16, 12, 9, 6], 0, 2.2, 3.25),
  ],
};

// Fonctions de bonus : tours gratuits, collants, et prix à l'achat (× la mise).
export const BONUS = {
  pause:  { nom: 'Pause café',       tours: 10, prix: 100, croissance: 0, canards: 4.02, description: 'Les canards restent collés jusqu’à la fin.' },
  super:  { nom: 'Super pause café', tours: 13, prix: 400, croissance: 1, canards: 4.09, description: 'Les canards restent collés et leur multiplicateur gagne +1 à chaque tour.' },
};
export const TOURS_RELANCE = 5;           // 3 sorties pendant le bonus

// ------------------------------------------------------------ hasard
// Générateur reproductible pour les tests (mulberry32).
export function hasard(graine = Date.now()) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function tirerPondere(poids, alea) {
  let total = 0; for (const p of poids) total += p;
  let r = alea() * total;
  for (let i = 0; i < poids.length; i++) { r -= poids[i]; if (r < 0) return i; }
  return poids.length - 1;
}
export function tirerMultiplicateur(alea) {
  return MULTIPLICATEURS[tirerPondere(MULTIPLICATEURS.map(m => m[1]), alea)][0];
}

// Une grille : grille[rouleau][rangée] = { s, m? }. Une seule sortie par rouleau.
// `mode` : 'base', ou une table de poids par rouleau (tours gratuits).
export function tirerGrille(alea, mode = 'base', collants = null) {
  const g = [];
  for (let c = 0; c < COLONNES; c++) {
    const col = [];
    let sortie = false;
    for (let r = 0; r < RANGEES; r++) {
      const fixe = collants?.[c]?.[r];
      if (fixe) { col.push({ ...fixe, colle: true }); continue; }
      let s;
      const poids = Array.isArray(mode) ? mode[c] : POIDS[mode][c];
      do { s = ORDRE[tirerPondere(poids, alea)]; } while (s === 'sortie' && sortie);
      if (s === 'sortie') sortie = true;
      col.push(s === 'canard' ? { s, m: tirerMultiplicateur(alea) } : { s });
    }
    g.push(col);
  }
  return g;
}

// ------------------------------------------------------------ évaluation
// Pour chaque ligne : le plus long alignement depuis la gauche, les sauvages
// (réveil et canards) remplaçant tout sauf la sortie. Les multiplicateurs des
// canards de l'alignement s'additionnent. On garde la meilleure lecture.
export function evaluer(grille, mise) {
  const gains = [];
  for (let l = 0; l < LIGNES.length; l++) {
    const cases = LIGNES[l].map((r, c) => grille[c][r]);
    let meilleur = null;
    for (const cible of candidats(cases)) {
      let n = 0;
      while (n < COLONNES && correspond(cases[n], cible)) n++;
      if (n < 3) continue;
      const table = SYMBOLES[cible].gains;
      const mult = cases.slice(0, n).reduce((s, x) => s + (x.s === 'canard' ? x.m : 0), 0) || 1;
      const gain = arrondir(table[n - 3] * mise * mult);
      if (!meilleur || gain > meilleur.gain) meilleur = { ligne: l, symbole: cible, nombre: n, mult, gain,
        cases: LIGNES[l].slice(0, n).map((r, c) => [c, r]) };
    }
    if (meilleur) gains.push(meilleur);
  }
  const sorties = [];
  grille.forEach((col, c) => col.forEach((x, r) => { if (x.s === 'sortie') sorties.push([c, r]); }));
  return { gains, total: arrondir(gains.reduce((s, g) => s + g.gain, 0)), sorties };
}
function candidats(cases) {
  // symbole de tête, ou le premier symbole ordinaire après des sauvages, ou le réveil seul
  const premier = cases.find(x => !SYMBOLES[x.s].sauvage);
  const liste = new Set();
  if (premier && !SYMBOLES[premier.s].dispersion) liste.add(premier.s);
  if (cases.some(x => x.s === 'sauvage') || cases[0].s === 'canard') liste.add('sauvage');
  return liste;
}
function correspond(x, cible) {
  if (x.s === 'sortie') return false;
  if (cible === 'sauvage') return !!SYMBOLES[x.s].sauvage;
  return x.s === cible || !!SYMBOLES[x.s].sauvage;
}
export const arrondir = v => Math.round(v * 100) / 100;

// ------------------------------------------------------------ un tour payant
export function bonusDeSorties(n) { return n >= 4 ? 'super' : n === 3 ? 'pause' : null; }

export function jouerTour(mise, alea) {
  const grille = tirerGrille(alea, 'base');
  const res = evaluer(grille, mise);
  const total = Math.min(res.total, GAIN_MAX * mise);
  return { grille, ...res, total, plafond: total < res.total, bonus: bonusDeSorties(res.sorties.length) };
}

// ------------------------------------------------------------ tours gratuits
// Séquence complète, calculée d'avance : l'interface ne fait que la dérouler.
export function jouerBonus(type, mise, alea) {
  const def = BONUS[type];
  let restants = def.tours, cumul = 0, n = 0;
  const collants = Array.from({ length: COLONNES }, () => Array(RANGEES).fill(null));
  const poids = poidsBonus(def.canards);
  const tours = [];
  while (restants > 0) {
    restants--; n++;
    // Super : chaque canard déjà collé gagne +1 avant le tirage.
    if (def.croissance) for (const col of collants) for (let r = 0; r < RANGEES; r++) if (col[r]) col[r] = { ...col[r], m: col[r].m + def.croissance };
    const grille = tirerGrille(alea, poids, collants);
    grille.forEach((col, c) => col.forEach((x, r) => { if (x.s === 'canard') collants[c][r] = { s: 'canard', m: x.m }; }));
    const res = evaluer(grille, mise);
    let gain = res.total;
    const plafond = cumul + gain >= GAIN_MAX * mise;
    if (plafond) gain = arrondir(GAIN_MAX * mise - cumul);
    cumul = arrondir(cumul + gain);
    const relance = res.sorties.length >= 3 ? TOURS_RELANCE : 0;
    restants += relance;
    tours.push({ numero: n, grille, gains: res.gains, sorties: res.sorties, gain, cumul, restants, relance });
    if (plafond) { restants = 0; tours.at(-1).plafond = true; break; }
  }
  return { type, tours, total: cumul };
}

// Palier de célébration d'un gain (× la mise).
export function palier(gain, mise) {
  const x = gain / mise;
  return x >= GAIN_MAX ? 'max' : x >= 100 ? 'epique' : x >= 50 ? 'mega' : x >= 15 ? 'gros' : null;
}
export const PALIERS = { gros: 'Gros gain', mega: 'Méga gain', epique: 'Gain épique', max: 'Gain max' };

// État de la borne dans la sauvegarde : tout ce qui n'a pas de sens est remis à zéro.
export function nettoyerCantine(brut) {
  if (!brut || typeof brut !== 'object') return null;
  const nombre = (v, d, min = 0, max = 1e9) => Number.isFinite(v) && v >= min && v <= max ? arrondir(v) : d;
  return {
    solde: nombre(brut.solde, SOLDE_INITIAL), mise: MISES.includes(brut.mise) ? brut.mise : MISE_DEFAUT,
    tours: Math.floor(nombre(brut.tours, 0)), meilleur: nombre(brut.meilleur, 0),
    turbo: !!brut.turbo, son: brut.son !== false, introVue: !!brut.introVue, arretBonus: brut.arretBonus !== false,
    historique: Array.isArray(brut.historique) ? brut.historique.slice(0, 20).filter(h => h && typeof h === 'object')
      .map(h => ({ heure: String(h.heure || '').slice(0, 8), mise: nombre(h.mise, 0), gain: nombre(h.gain, 0), bonus: String(h.bonus || '').slice(0, 40) })) : [],
  };
}

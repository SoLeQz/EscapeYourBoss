import { NIVEAUX } from './levels.js';

// ============================================================
//  Vestiaire : ce que Lao D peut porter.
//
//  Les pièces sont modélisées dans Blender (tools/blender/creer_garde_robe.py,
//  assets/garde-robe-v01.glb) ; ce module ne contient que le catalogue et les
//  règles : apparence sauvegardée, pièces à débloquer en jouant, tenues toutes
//  faites, tirage « Surprise », titre du badge et remarques des collègues.
//  Purement cosmétique : rien ici ne change la détection.
// ============================================================

export const VISAGES = [
  { id: 'employe', nom: 'Lao D', icone: '🙂' },
  { id: 'direction', nom: 'Air de chef', icone: '🧐' },
  { id: 'chignon', nom: 'Chignon', icone: '💁' },
  { id: 'securite', nom: 'Coupe réglementaire', icone: '💂' },
];

// emplacement → pièces. `teinte` : la pièce prend la couleur choisie pour son emplacement ;
// `rentreChignon` : le chignon passe sous la pièce (les casquettes le laissent sortir derrière).
export const PIECES = {
  tete: [
    { id: 'aucun', nom: 'Tête nue', icone: '🙂' },
    { id: 'casquette', nom: 'Casquette', icone: '🧢', teinte: true },
    { id: 'bonnet', nom: 'Bonnet à pompon', icone: '🎿', teinte: true, rentreChignon: true },
    { id: 'casque-audio', nom: 'Casque audio', icone: '🎧', teinte: true },
    { id: 'bandeau', nom: 'Bandeau de sport', icone: '🏃', teinte: true },
    { id: 'chapeau-melon', nom: 'Chapeau melon', icone: '🎩', teinte: true },
    { id: 'chapeau-fete', nom: 'Chapeau de fête', icone: '🥳', teinte: true },
    { id: 'oreilles-chat', nom: 'Oreilles de chat', icone: '🐱', teinte: true },
    { id: 'casque-chantier', nom: 'Casque de chantier', icone: '👷' },
    { id: 'casquette-helice', nom: 'Casquette à hélice', icone: '🚁', debloque: { etage: 3 } },
    { id: 'couronne', nom: 'Couronne de l’employé du mois', icone: '👑', debloque: { etage: 6 } },
  ],
  yeux: [
    { id: 'aucun', nom: 'Sans lunettes', icone: '👀' },
    { id: 'classiques', nom: 'Lunettes de bureau', icone: '👓' },
    { id: 'rondes', nom: 'Lunettes rondes', icone: '⭕' },
    { id: 'aviateur', nom: 'Aviateur', icone: '🕶️' },
    { id: 'lunettes-3d', nom: 'Lunettes 3D', icone: '🎬' },
    { id: 'pixel', nom: 'Lunettes pixel', icone: '😎', debloque: { etage: 4 } },
  ],
  moustache: [
    { id: 'aucune', nom: 'Rasé de près', icone: '🪒' },
    { id: 'moustache-brosse', nom: 'Moustache brosse', icone: '🥸' },
    { id: 'moustache-guidon', nom: 'Moustache guidon', icone: '🎭' },
  ],
  cou: [
    { id: 'cravate', nom: 'Cravate', icone: '👔', teinte: true },
    { id: 'noeud-papillon', nom: 'Nœud papillon', icone: '🎀', teinte: true },
    { id: 'collier-fleurs', nom: 'Collier de fleurs', icone: '🌺' },
    { id: 'aucun', nom: 'Col ouvert', icone: '👕' },
  ],
  torse: [
    { id: 'aucun', nom: 'Rien de plus', icone: '🧍' },
    { id: 'gilet-fluo', nom: 'Gilet fluo', icone: '🦺', debloque: { etage: 2 } },
    { id: 'cape', nom: 'Cape de super-héros', icone: '🦸', teinte: true, debloque: { speedrun: true } },
  ],
  dos: [
    { id: 'sac', nom: 'Sac à dos', icone: '🎒' },
    { id: 'sac-banane', nom: 'Sac banane', icone: '👝', teinte: true },
    { id: 'sac-livreur', nom: 'Sac de livreur', icone: '📦', teinte: true },
    { id: 'jetpack', nom: 'Jetpack', icone: '🚀', debloque: { etage: 5 } },
    { id: 'aucun', nom: 'Les mains libres', icone: '🙌' },
  ],
};

// Les pièces qui ont besoin des sangles du sac pour tenir.
export const SANGLES = new Set(['sac-livreur', 'jetpack']);

export const PALETTES = {
  peau: [0xf1c096, 0xffdcb8, 0xe3ae80, 0xc98c5a, 0x9c6640, 0x6e452a],
  cheveux: [0x14100d, 0x3b2a1d, 0x6b4a2b, 0xb07a3c, 0xdcb56c, 0x9c3b1f, 0xdedede, 0xff5fa2, 0x3d7bff, 0x2ecc71, 0x8e44ad],
  chemise: [0xf2ead8, 0xffffff, 0xa9d1ff, 0xffc2d6, 0xfff3a0, 0x9be7c4, 0xff7a3d, 0x6a4c93, 0x2b2b2b],
  veste: [null, 0x4c5464, 0x1d1f24, 0x2e4a7a, 0x6b3b3f, 0x3f5e3a, 0xb8a07a, 0xe8e8e8, 0xff4081],
  pantalon: [0x555a66, 0x1d1f24, 0x2e4a7a, 0xb8a07a, 0x7a2e2e, 0x3f5e3a, 0xe8e8e8],
  cravate: [0x82333d, 0x1d1f24, 0x2e4a7a, 0xd4af37, 0x2ecc71, 0xff4081, 0xff7a3d, 0x8e44ad],
  accent: [0xc62828, 0x1e88e5, 0x43a047, 0xfdd835, 0x8e24aa, 0xff6d00, 0x212121, 0xfafafa, 0xff4081, 0x00bcd4],
};

// Noms affichés dans les nuanciers. Les valeurs numériques restent celles des
// sauvegardes et des matériaux ; aucune conversion de la tenue n'est nécessaire.
const NOMS_PALETTES = {
  peau: ['Beige doré', 'Beige clair', 'Miel', 'Caramel', 'Brun chaud', 'Brun profond'],
  cheveux: ['Noir', 'Brun foncé', 'Châtain', 'Châtain doré', 'Blond', 'Auburn', 'Argent', 'Rose bonbon', 'Bleu électrique', 'Vert émeraude', 'Violet'],
  chemise: ['Ivoire', 'Blanc', 'Bleu ciel', 'Rose pâle', 'Jaune pastel', 'Vert menthe', 'Corail', 'Prune', 'Anthracite'],
  veste: ['Sans veste', 'Gris ardoise', 'Noir charbon', 'Bleu marine', 'Bordeaux', 'Vert forêt', 'Beige sable', 'Gris perle', 'Rose vif'],
  pantalon: ['Gris acier', 'Noir charbon', 'Bleu marine', 'Beige sable', 'Rouge brique', 'Vert forêt', 'Gris perle'],
  cravate: ['Lie-de-vin', 'Noir charbon', 'Bleu marine', 'Or', 'Vert émeraude', 'Rose vif', 'Corail', 'Violet'],
  accent: ['Rouge', 'Bleu azur', 'Vert', 'Jaune soleil', 'Violet vif', 'Orange', 'Noir', 'Blanc cassé', 'Rose vif', 'Turquoise'],
};
export function nomCouleur(c, palette) {
  if (c === null) return 'Sans veste';
  const index = PALETTES[palette]?.indexOf(c) ?? -1;
  if (index >= 0) return NOMS_PALETTES[palette][index];
  // Une tenue toute faite peut utiliser une teinte d'un autre nuancier.
  for (const [cle, couleurs] of Object.entries(PALETTES)) {
    const i = couleurs.indexOf(c);
    if (i >= 0) return NOMS_PALETTES[cle][i];
  }
  return 'Couleur personnalisée';
}

export const APPARENCE_DEFAUT = Object.freeze({
  visage: 'employe', peau: 0xf1c096, cheveux: 0x14100d,
  chemise: 0xf2ead8, veste: 0x4c5464, pantalon: 0x555a66, cravate: 0x82333d, badge: true,
  tete: 'aucun', yeux: 'classiques', moustache: 'aucune', cou: 'cravate', torse: 'aucun', dos: 'sac',
  couleurs: Object.freeze({ tete: 0xc62828, torse: 0xc62828, dos: 0xc62828 }),
});

const piece = (emplacement, id) => PIECES[emplacement].find(p => p.id === id);
const couleur = (v, d) => Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : d;

// Toute valeur inconnue, tronquée ou hors palette ramène la valeur par défaut :
// une sauvegarde abîmée ou un coéquipier d'une autre version ne casse rien.
export function nettoyerApparence(a) {
  const d = APPARENCE_DEFAUT, s = a && typeof a === 'object' ? a : {};
  const r = {
    visage: VISAGES.some(v => v.id === s.visage) ? s.visage : d.visage,
    peau: couleur(s.peau, d.peau), cheveux: couleur(s.cheveux, d.cheveux), chemise: couleur(s.chemise, d.chemise),
    veste: s.veste === null ? null : couleur(s.veste, d.veste), pantalon: couleur(s.pantalon, d.pantalon),
    cravate: couleur(s.cravate, d.cravate), badge: typeof s.badge === 'boolean' ? s.badge : d.badge,
    couleurs: {},
  };
  for (const e of Object.keys(PIECES)) r[e] = piece(e, s[e]) ? s[e] : d[e];
  for (const e of ['tete', 'torse', 'dos']) r.couleurs[e] = couleur(s.couleurs?.[e], d.couleurs[e]);
  return r;
}

// Options de makeCharacter (characters.js) pour une apparence.
export function optionsPersonnage(a) {
  const x = nettoyerApparence(a);
  return {
    profilVisage: x.visage, peau: x.peau, cheveux: x.cheveux, chemise: x.chemise, veste: x.veste, pantalon: x.pantalon,
    cravate: x.cou === 'cravate' ? x.cravate : null, lunettes: x.yeux === 'classiques', sac: x.dos === 'sac',
    sangles: SANGLES.has(x.dos), badge: x.badge, sansChignon: !!piece('tete', x.tete).rentreChignon,
    garde: {
      tete: x.tete, yeux: x.yeux, moustache: x.moustache, cou: x.cou, torse: x.torse, dos: x.dos,
      couleurs: { tete: x.couleurs.tete, torse: x.couleurs.torse, dos: x.couleurs.dos, cou: x.cravate, moustache: x.cheveux },
    },
  };
}

// ------------------------------------------------------------ déblocages
export function estDebloquee(p, etat) {
  if (!p?.debloque) return true;
  if (p.debloque.etage) return (etat?.niveauxFinis || []).includes(p.debloque.etage);
  if (p.debloque.speedrun) return etat?.records?.speedrun != null || etat?.records?.speedrunSixEtages != null;
  return false;
}
export function conditionDeblocage(p) {
  if (!p?.debloque) return '';
  if (p.debloque.etage) {
    const niveau = NIVEAUX.find(n => n.id === p.debloque.etage);
    return `Termine le niveau ${p.debloque.etage} en solo${niveau ? ' · ' + niveau.titre : ''}`;
  }
  if (p.debloque.speedrun) return `Termine un speedrun complet : les ${NIVEAUX.length} niveaux depuis le premier, en solo`;
  return '';
}
export function compterPieces(etat) {
  const toutes = Object.values(PIECES).flat().filter(p => !['aucun', 'aucune'].includes(p.id));
  return { debloquees: toutes.filter(p => estDebloquee(p, etat)).length, total: toutes.length };
}
// Pièces débloquées par une progression : pour l'annoncer en fin d'étage.
export function nouveautes(avant, apres) {
  return Object.values(PIECES).flat().filter(p => p.debloque && !estDebloquee(p, avant) && estDebloquee(p, apres));
}
// Une apparence ne garde que des pièces débloquées (sauvegarde copiée d'un autre profil, etc.).
export function restreindre(a, etat) {
  const x = nettoyerApparence(a);
  for (const e of Object.keys(PIECES)) if (!estDebloquee(piece(e, x[e]), etat)) x[e] = APPARENCE_DEFAUT[e];
  return x;
}

// ------------------------------------------------------------ tenues toutes faites
export const TENUES = [
  { id: 'lundi', nom: 'Lundi matin', icone: '☕', a: {} },
  { id: 'vendredi', nom: 'Vendredi décontracté', icone: '🌴',
    a: { veste: null, chemise: 0xff7a3d, cou: 'collier-fleurs', yeux: 'aviateur', tete: 'casquette', dos: 'sac-banane',
         pantalon: 0xb8a07a, couleurs: { tete: 0x00bcd4, dos: 0xfdd835, torse: 0xc62828 } } },
  { id: 'stagiaire', nom: 'Le stagiaire', icone: '🎒',
    a: { veste: null, chemise: 0xa9d1ff, cou: 'aucun', tete: 'casque-audio', yeux: 'rondes', dos: 'sac-livreur',
         couleurs: { tete: 0x212121, dos: 0x43a047, torse: 0xc62828 } } },
  { id: 'agent', nom: 'Agent secret', icone: '🕵️',
    a: { veste: 0x1d1f24, chemise: 0xffffff, pantalon: 0x1d1f24, cravate: 0x1d1f24, yeux: 'aviateur', badge: false, tete: 'aucun' } },
  { id: 'chef', nom: 'Directeur en herbe', icone: '🎩',
    a: { visage: 'direction', veste: 0x6b3b3f, cou: 'noeud-papillon', cravate: 0xd4af37, tete: 'chapeau-melon', moustache: 'moustache-guidon',
         couleurs: { tete: 0x6b3b3f, torse: 0xc62828, dos: 0xc62828 } } },
  { id: 'chantier', nom: 'Inspection surprise', icone: '🦺',
    a: { tete: 'casque-chantier', torse: 'gilet-fluo', veste: null, chemise: 0x2e4a7a, cou: 'aucun', yeux: 'classiques' } },
  { id: 'fete', nom: 'Pot de départ', icone: '🥳',
    a: { tete: 'chapeau-fete', cou: 'collier-fleurs', yeux: 'lunettes-3d', couleurs: { tete: 0x8e24aa, torse: 0xc62828, dos: 0xc62828 } } },
  { id: 'heros', nom: 'Héros de la pause café', icone: '🦸',
    a: { torse: 'cape', tete: 'bandeau', veste: null, chemise: 0x1e88e5, pantalon: 0x1d1f24, cou: 'aucun', yeux: 'pixel',
         couleurs: { tete: 0xfdd835, torse: 0xc62828, dos: 0xc62828 } } },
  { id: 'mois', nom: 'Employé du mois', icone: '👑',
    a: { tete: 'couronne', cou: 'noeud-papillon', cravate: 0xc62828, dos: 'jetpack', yeux: 'pixel' } },
];
export function tenue(id) {
  const t = TENUES.find(x => x.id === id);
  if (!t) return null;
  return nettoyerApparence({ ...APPARENCE_DEFAUT, ...t.a, couleurs: { ...APPARENCE_DEFAUT.couleurs, ...t.a.couleurs } });
}
export function tenueDisponible(id, etat) {
  const a = tenue(id);
  return !!a && Object.keys(PIECES).every(e => estDebloquee(piece(e, a[e]), etat));
}

// Pour une tenue complète, expliquer seulement les pièces encore à obtenir.
export function piecesManquantes(id, etat) {
  const a = tenue(id);
  if (!a) return [];
  return Object.keys(PIECES).map(e => piece(e, a[e])).filter(p => !estDebloquee(p, etat));
}

// ------------------------------------------------------------ surprise
// Une tenue au hasard parmi les pièces débloquées, avec des couleurs qui vont ensemble.
export function apparenceSurprise(etat, alea = Math.random) {
  const choisir = liste => liste[Math.floor(alea() * liste.length) % liste.length];
  const a = { visage: choisir(VISAGES).id, couleurs: {} };
  for (const [e, liste] of Object.entries(PIECES)) {
    const libres = liste.filter(p => estDebloquee(p, etat));
    // un peu de retenue : une chance sur trois de rester sobre
    a[e] = alea() < .33 && libres.some(p => p.id === APPARENCE_DEFAUT[e]) ? APPARENCE_DEFAUT[e] : choisir(libres).id;
  }
  for (const k of ['peau', 'cheveux', 'chemise', 'veste', 'pantalon', 'cravate']) a[k] = choisir(PALETTES[k]);
  for (const e of ['tete', 'torse', 'dos']) a.couleurs[e] = choisir(PALETTES.accent);
  a.badge = alea() < .7;
  return nettoyerApparence(a);
}

// ------------------------------------------------------------ badge et collègues
// Le badge change d'intitulé selon la tenue : la pièce la plus voyante décide.
const TITRES = [
  ['couronne', 'Employé du mois (autoproclamé)'], ['jetpack', 'Responsable des sorties rapides'],
  ['cape', 'Super-héros de la pause café'], ['gilet-fluo', 'Technicien de maintenance (officiellement)'],
  ['casquette-helice', 'Ingénieur en aérodynamique'], ['pixel', 'Stagiaire en vibes'],
  ['casque-chantier', 'Inspecteur des travaux finis'], ['chapeau-fete', 'Organisateur du pot de départ'],
  ['collier-fleurs', 'Ambassadeur du vendredi'], ['sac-livreur', 'Livreur égaré au 23e'],
  ['chapeau-melon', 'Consultant très cher'], ['moustache-guidon', 'Directeur artistique'],
  ['oreilles-chat', 'Chargé de la mascotte'], ['lunettes-3d', 'Analyste en relief'],
  ['casque-audio', 'Concentré. Ne pas déranger.'], ['aviateur', 'Pilote de réunion'],
  ['noeud-papillon', 'Maître de cérémonie'], ['bonnet', 'Arrivé ce matin de la montagne'],
];
export function titreBadge(a) {
  const x = nettoyerApparence(a), portees = new Set([x.tete, x.yeux, x.moustache, x.cou, x.torse, x.dos]);
  const t = TITRES.find(([id]) => portees.has(id));
  if (t) return t[1];
  return x.veste === null ? 'Développeur, version décontractée' : 'Développeur, version réunion';
}

// Remarques des collègues quand ils remarquent la tenue (bulles de texte, aucun effet de jeu).
const REMARQUES = {
  'gilet-fluo': ['Ah, c’est la maintenance.', 'Encore une alarme incendie ?'],
  couronne: ['Il se prend pour qui, lui ?', 'Employé du mois ? On est en fin de mois.'],
  cape: ['Super-stagiaire ?', 'On vole pas dans les couloirs.'],
  'casquette-helice': ['C’est quoi ce bruit d’hélice ?'],
  jetpack: ['Il n’y a pas de piste d’envol ici.', 'Ça passe à la sécurité, ça ?'],
  pixel: ['Deal with it, apparemment.'],
  'chapeau-fete': ['C’est ton pot de départ ? Déjà ?'],
  'collier-fleurs': ['On est vendredi, peut-être ?'],
  'oreilles-chat': ['Miaou ? Sérieusement ?'],
  'chapeau-melon': ['Le consultant est arrivé.'],
  'moustache-guidon': ['Belle moustache. Suspecte, mais belle.'],
  'sac-livreur': ['Vous livrez quel étage ?'],
  'casque-chantier': ['Les travaux, c’est au 19e.'],
};
export function remarqueTenue(a, alea = Math.random) {
  const x = nettoyerApparence(a);
  const lignes = [x.tete, x.yeux, x.moustache, x.cou, x.torse, x.dos].flatMap(id => REMARQUES[id] || []);
  return lignes.length ? lignes[Math.floor(alea() * lignes.length) % lignes.length] : null;
}

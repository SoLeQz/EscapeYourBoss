// ============================================================
//  Méridien Connect : le contenu de l'intranet détourné par l'interface.
//
//  Tout le texte « d'ambiance » des menus vit ici : notifications internes,
//  indicateurs de performance (calculés sur la vraie progression du joueur),
//  astuces RH du chargement, messages d'absence de la pause, convocations
//  de l'écran d'échec. Fonctions pures, sans DOM : testées en Node
//  (tests/interface/verifier.mjs). Règle : l'humour entoure l'information,
//  il ne la remplace jamais.
// ============================================================
import { NIVEAUX } from './levels.js';
import { SECRETS, canardsTrouves } from './secrets.js';
import { DEPARTEMENTS } from './departements.js';

const hex = n => '#' + n.toString(16).padStart(6, '0');
const dept = id => hex(DEPARTEMENTS.find(d => d.id === id)?.accent ?? 0x234b49);
const tirer = (liste, alea) => liste[Math.floor(alea() * liste.length) % liste.length];

// ------------------------------------------------------------ notifications
// `boss` : la notification vient du directeur (marquée d'un point d'exclamation).
export const NOTIFICATIONS = [
  { de: 'Direction · M. Wang', objet: 'Petite question', texte: 'Tu as cinq minutes ? C’est rapide. Promis.', couleur: dept('direction'), boss: true },
  { de: 'Direction · M. Wang', objet: 'RE: RE: RE: Point rapide', texte: '?', couleur: dept('direction'), boss: true },
  { de: 'Direction · M. Wang', objet: 'Avant que tu partes', texte: 'Juste deux, trois retouches. Pour demain matin.', couleur: dept('direction'), boss: true },
  { de: 'Ressources humaines', objet: 'Rappel', texte: 'La bonne humeur est obligatoire du lundi au vendredi, et conseillée le samedi.', couleur: dept('rh') },
  { de: 'Ressources humaines', objet: 'Employé du mois', texte: 'Félicitations au ficus de l’accueil. Jamais en retard, jamais en congé.', couleur: dept('rh') },
  { de: 'Service informatique', objet: 'Sécurité', texte: 'Votre mot de passe expire dans 0 jour. Merci de ne pas le changer.', couleur: dept('it') },
  { de: 'Service informatique', objet: 'Maintenance', texte: 'Le serveur de production fonctionne uniquement quand quelqu’un le regarde.', couleur: dept('it') },
  { de: 'Services généraux', objet: 'Machine à café', texte: 'En maintenance préventive jusqu’à nouvel ordre. Le nouvel ordre est attendu en 2031.', couleur: dept('logistique') },
  { de: 'Comité bien-être', objet: 'Afterwork', texte: 'Afterwork obligatoire ce soir de 18 h à 23 h 30. Tenue décontractée exigée.', couleur: dept('marketing') },
  { de: 'Finance & contrôle', objet: 'Notes de frais', texte: 'Les trombones sont désormais facturés à l’unité. Les agrafes au mètre.', couleur: dept('finance') },
  { de: 'Juridique', objet: 'Charte du départ', texte: 'La charte du départ à l’heure est disponible, page 1 sur 900.', couleur: dept('juridique') },
  { de: 'Marketing', objet: 'Lancement', texte: 'RIEN™ arrive en format familial. Merci d’en parler autour de vous.', couleur: dept('marketing') },
  { de: 'Sécurité de l’immeuble', objet: 'Issues de secours', texte: 'Elles sont réservées aux urgences. Partir à l’heure n’est pas une urgence.', couleur: '#14a052' },
  { de: 'Accueil', objet: 'Objets trouvés', texte: 'Des canards en caoutchouc ont été signalés dans les étages. Merci de ne pas les nourrir.', couleur: dept('rh') },
  { de: 'Archives', objet: 'Dossier 404', texte: 'Le formulaire de recherche du formulaire de recherche est introuvable.', couleur: dept('archives') },
  { de: 'Support clients', objet: 'Ticket 000001', texte: 'Le client de 1998 est toujours en ligne. Il vous salue.', couleur: dept('support') },
];

// Une sélection pour l'accueil : un message du directeur, puis l'actualité de
// l'immeuble, plus une notification qui dépend de la progression.
export function notificationsDuMoment(etat, alea = Math.random, nombre = 4) {
  const boss = NOTIFICATIONS.filter(n => n.boss), autres = NOTIFICATIONS.filter(n => !n.boss);
  const choix = [tirer(boss, alea)];
  const dyn = notificationProgression(etat, alea);
  if (dyn) choix.push(dyn);
  const pool = [...autres];
  while (choix.length < nombre && pool.length) choix.push(pool.splice(Math.floor(alea() * pool.length) % pool.length, 1)[0]);
  return choix.map((n, i) => ({ ...n, heure: heureNotification(i) }));
}

export function notificationProgression(etat, alea = Math.random) {
  const finis = etat?.niveauxFinis?.length || 0, canards = canardsTrouves(etat), total = NIVEAUX.length * 3;
  const options = [];
  if (finis === 0) options.push({ de: 'Ressources humaines', objet: 'Bienvenue', texte: 'Votre période d’essai commence ce soir. Elle ne finit jamais.', couleur: dept('rh') });
  if (finis > 0 && finis < NIVEAUX.length) options.push({ de: 'Direction · M. Wang', objet: 'Constat', texte: `Tu as quitté ${finis} étage${finis > 1 ? 's' : ''} à l’heure. On en reparlera à ton entretien annuel.`, couleur: dept('direction'), boss: true });
  if (finis >= NIVEAUX.length) options.push({ de: 'Direction', objet: 'Distinction', texte: 'Le trophée « Parti à l’heure » vous attend au 2e étage. Premier lauréat depuis 1998.', couleur: dept('direction') });
  if (canards < total) options.push({ de: 'Accueil', objet: 'Inventaire', texte: `Il reste ${total - canards} canard${total - canards > 1 ? 's' : ''} de débogage dans l’immeuble. Ils nous regardent.`, couleur: dept('rh') });
  if (etat?.records?.speedrun != null) options.push({ de: 'Finance & contrôle', objet: 'Audit', texte: `Votre départ en ${formaterDuree(etat.records.speedrun)} a été jugé « suspicieusement efficace ».`, couleur: dept('finance') });
  return options.length ? tirer(options, alea) : null;
}

function heureNotification(i) { return ['17:59', '17:58', '17:55', '17:42', '16:03', 'hier'][i] || 'hier'; }

// ------------------------------------------------------------ indicateurs
// De vrais chiffres, présentés comme des objectifs de performance.
export function indicateurs(etat, session = {}) {
  const finis = etat?.niveauxFinis?.length || 0, canards = canardsTrouves(etat), trouvees = etat?.secrets?.length || 0;
  const record = etat?.records?.speedrun;
  return [
    ['Étages quittés à l’heure', `${finis}/${NIVEAUX.length}`, finis < NIVEAUX.length],
    ['Canards de débogage', `${canards}/${NIVEAUX.length * 3}`, canards < NIVEAUX.length * 3],
    ['Bruits de couloir vérifiés', `${trouvees}/${SECRETS.length}`, trouvees < SECRETS.length],
    ['Record de fuite chronométrée', record != null ? formaterDuree(record) : 'non homologué', record == null],
    ['Convocations ce soir', String(session.convocations || 0), (session.convocations || 0) > 0],
    ['Heures sup’ non déclarées', formaterHeures(session.surPlace || 0), true],
    ['Taux de présence', '100 %', false],
  ];
}
// L'avis du manager, selon la progression : c'est le tampon du bulletin.
export function appreciation(etat) {
  const finis = etat?.niveauxFinis?.length || 0;
  return finis >= NIVEAUX.length ? 'Trop autonome' : finis >= 5 ? 'À surveiller' : finis > 0 ? 'Peut mieux faire' : 'Présent';
}

// ------------------------------------------------------------ horloge de l'accueil
// 17:59 à perpétuité : la fin de journée est toujours dans une minute.
export function heureBloquee(secondes) {
  const s = Math.floor(secondes) % 60;
  return `17:59:${String(s).padStart(2, '0')}`;
}

// ------------------------------------------------------------ chargement
export const ASTUCES = [
  'Astuce RH : accroupi, tu passes sous les cloisons. Et sous les radars.',
  'Astuce RH : un poste libre fait illusion 12 secondes. Au-delà, ce serait du vrai travail.',
  'Astuce RH : la photocopieuse imprime 200 pages. Personne ne sait pourquoi. Tout le monde regarde.',
  'Astuce RH : le directeur prend son café à heure fixe. C’est la seule chose fixe chez lui.',
  'Astuce RH : un carton immobile est un carton. Un carton qui marche est un problème.',
  'Astuce RH : le disjoncteur raccourcit les regards pendant 14 secondes. Et la facture d’électricité.',
  'Astuce RH : courir fait du bruit. Marcher aussi, mais moins. Ne pas exister reste l’idéal.',
  'Astuce RH : les canards de débogage ne mordent pas. Ce n’est pas prouvé.',
  'Astuce RH : certaines bibliothèques cachent plus que des livres.',
  'Astuce RH : l’ascenseur fait « ding ». Le directeur aussi, à sa manière.',
];
export function astuce(alea = Math.random) { return tirer(ASTUCES, alea); }
// « Étage 22 — 18:20 » → « 22 » pour l'afficheur de l'ascenseur.
export function etageDuTitre(titre) { return /Étage (\d+)/.exec(titre || '')?.[1] || '··'; }

// ------------------------------------------------------------ pause
export const MESSAGES_ABSENCE = [
  'Réponse automatique : je suis actuellement absent de mon poste. Pour toute urgence, merci de ne pas me contacter.',
  'Réponse automatique : pause non déclarée. Mon manager n’en saura rien. Probablement.',
  'Réponse automatique : je reviens dans 5 minutes. Des vraies, pas celles du directeur.',
  'Réponse automatique : je suis en réunion avec moi-même. Elle se passe très bien.',
];
export function messageAbsence(alea = Math.random) { return tirer(MESSAGES_ABSENCE, alea); }

// ------------------------------------------------------------ échec
export function convocation(npc, alea = Math.random) {
  const heures = 1 + Math.floor(alea() * 3), minutes = [15, 30, 45][Math.floor(alea() * 3) % 3];
  return {
    organisateur: npc ? `${npc.name}${npc.role ? ' · ' + npc.role : ''}` : 'Directeur Wang',
    duree: `${heures} h ${minutes} (prévu : 5 min)`,
  };
}

// ------------------------------------------------------------ fin d'étage
// La note, telle qu'un tampon de pointeuse l'imprimerait.
export function noteDepart(secondes) {
  return secondes < 45 ? { lettre: 'S', mot: 'Éclair' } : secondes < 75 ? { lettre: 'A', mot: 'Propre' }
    : secondes < 110 ? { lettre: 'B', mot: 'Ça passe' } : { lettre: 'C', mot: 'De justesse' };
}
export function heurePointage(heureDepart, elapsed) {
  const total = heureDepart + Math.floor(elapsed);
  return `${String(Math.floor(total / 3600) % 24).padStart(2, '0')}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}`;
}

export function formaterDuree(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60), r = (s % 60).toFixed(1);
  return m > 0 ? `${m}:${r.padStart(4, '0')}` : `${r} s`;
}
export function formaterHeures(s) {
  const t = Math.floor(s);
  return `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

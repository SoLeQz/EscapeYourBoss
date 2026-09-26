// ============================================================
//  Plans d'étage et progression
//
//  Un « plan » décrit la géométrie variable d'un étage : portes,
//  postes de travail, cloisons, quelle salle vitrée sert de bureau
//  au directeur. La coque (murs extérieurs, baie, couloir, hall
//  d'ascenseur, cage d'escalier) ne change pas — c'est elle qui
//  garantit que chaque étage reste lisible et jouable.
//
//  Chaque niveau combine un plan, un effectif de collègues, une
//  heure de la journée et des objectifs.
// ============================================================

const PI2 = Math.PI / 2;

export const PLANS = {
  // ---------------- A : open space classique, deux rangées ----------------
  A: {
    portesOS: [[-8, -5], [6, 9]],
    postes: [
      [-15, -9, 'code', 0], [-9, -9, 'sheet', 0], [-3, -9, 'graph', 0],
      [-15, 3, 'code', 0], [-9, 3, 'graph', 0], [-3, 3, 'sheet', 0],
    ],
    cloisons: [
      [-16.6, -9.78, -1.9, -9.62], [-16.6, 2.22, -1.9, 2.38],
      [-12.08, -9.7, -11.92, -8.3], [-6.08, -9.7, -5.92, -8.3],
      [-12.08, 2.3, -11.92, 3.7], [-6.08, 2.3, -5.92, 3.7],
    ],
    casiers: [[-13.4, -10.8], [-2.6, 0.6], [9.6, 12.4]],
    plantes: [[-19.2, -6], [-19.2, 8], [0.5, -6], [0.5, 10], [10.5, -13], [10.5, 9]],
    cartons: [[-0.4, -11.2], [-1.6, 10.8]],
    detente: { table: [0.2, 6.6], fauteuils: [[-1.4, 6.6, PI2], [0.2, 5.2, 0]] },
    canape: [-19.0, 13.5],
    bossSalle: 'nord', porteBoss: [-9, -7], porteReunion: [10, 12],
    depart: { x: -15.2, z: 5.4, yaw: Math.PI },
  },

  // ---------------- B : postes en colonnes, circulation verticale ----------------
  B: {
    portesOS: [[-13, -10], [1, 4]],
    postes: [
      [-16.5, -10, 'code', PI2], [-16.5, -1, 'sheet', PI2], [-16.5, 8, 'graph', PI2],
      [-9.5, -10, 'graph', PI2], [-9.5, -1, 'code', PI2], [-9.5, 8, 'sheet', PI2],
      [-2.5, -10, 'sheet', PI2], [-2.5, 5, 'code', PI2],
    ],
    cloisons: [
      [-13.18, -13.5, -13.02, 11.5], [-6.18, -13.5, -6.02, 11.5],
      [-18.2, -5.68, -14.8, -5.52], [-11.2, -5.68, -7.8, -5.52],
      [-18.2, 3.32, -14.8, 3.48], [-11.2, 3.32, -7.8, 3.48],
    ],
    casiers: [[-15.2, -12.6], [3.0, 5.6], [12.8, 15.2]],
    // pas de plante devant la porte du directeur (z = 8..10 sur ce plan)
    plantes: [[-19.2, 2], [-19.2, 13], [1.6, -8], [1.6, 9], [10.5, -13], [10.6, 13]],
    cartons: [[1.5, -13.5], [-19.0, -12.5]],
    detente: { table: [1.5, 12.5], fauteuils: [[0.2, 12.5, PI2], [1.5, 11.1, 0]] },
    canape: [-19.0, -3],
    bossSalle: 'sud', porteBoss: [8, 10], porteReunion: [-14, -12],
    depart: { x: -17.5, z: 12.5, yaw: 0 },
  },

  // ---------------- C : box denses, couloirs étroits ----------------
  C: {
    portesOS: [[-2, 1]],
    postes: [
      [-15, -10.6, 'code', 0], [-15, -7.2, 'sheet', 0],
      [-8, -10.6, 'graph', 0], [-8, -7.2, 'code', 0],
      [-15, 4.4, 'sheet', 0], [-15, 7.8, 'graph', 0],
      [-8, 4.4, 'code', 0], [-8, 7.8, 'sheet', 0],
    ],
    cloisons: [
      [-16.6, -8.98, -13.4, -8.82], [-9.6, -8.98, -6.4, -8.82],
      [-16.6, 6.02, -13.4, 6.18], [-9.6, 6.02, -6.4, 6.18],
      [-11.58, -12.4, -11.42, -5.4], [-11.58, 3.0, -11.42, 10.0],
      [-18.5, -2.08, -4.5, -1.92], [-4.58, -12.4, -4.42, -5.4],
      [-4.58, 3.0, -4.42, 10.0], [-18.5, 11.42, -4.5, 11.58],
    ],
    casiers: [[-14.8, -12.4], [-0.6, 2.6], [8.0, 10.6]],
    // pas de plante entre x = -20 et -18,5 : c'est l'unique passage
    // ouest à travers la longue cloison z = -2
    plantes: [[-19.2, -9.5], [-19.2, 9.5], [1.4, -13], [1.4, 6], [10.5, -13], [10.5, 9]],
    cartons: [[-2.6, -8], [-2.6, 8], [-19.0, 4.5]],
    detente: { table: [-19.0, 14.0], fauteuils: [[-17.6, 14.0, PI2], [-19.0, 12.6, 0]] },
    canape: null,
    bossSalle: 'nord', porteBoss: [-6, -4.4], porteReunion: [12, 14],
    // Trois pièges successifs ont été nécessaires pour comprendre ce
    // qu'est un départ sûr :
    //   (-17,5 ; -11,5) : à 1,40 m de Zhang Jie et dans son cône.
    //   (-8 ; -12)      : hors cône, mais à 0,8 m de son ITINÉRAIRE —
    //                     sûr à t=0, fatal quatre secondes après.
    //   (-5 ; 7,5)      : hors cône et loin des rondes, mais dans le
    //                     BALAYAGE de Zhou Min (±62° en plus du champ).
    // Un départ doit être validé contre les trois : cône, ronde, balayage.
    depart: { x: -3, z: 2.5, yaw: Math.PI },
  },
};

// ------------------------------------------------------------
//  Effectifs réutilisables
// ------------------------------------------------------------
const LOOKS = {
  wang: { chemise: 0xc9d8ea, pantalon: 0x43474f, cheveux: 0x120e0b, peau: 0xefbe97, badge: true },
  li: { carrure: .93, chemise: 0xf0d6dd, pantalon: 0x3a3e46, cheveux: 0x1a1310, peau: 0xf7cba7, chignon: true, badge: true },
  zhang: { chemise: 0xe3dcc6, pantalon: 0x5f4757, cheveux: 0x1d1512, peau: 0xe9b58e, veste: 0x5e4b5a, chignon: true, badge: true },
  liu: { carrure: 1.06, chemise: 0xc3ccd4, pantalon: 0x454951, cheveux: 0x34302c, peau: 0xdda878, veste: 0x3f4550, lunettes: true, badge: true },
  chen: { chemise: 0xe2e8ee, pantalon: 0x363b43, cheveux: 0x14100d, peau: 0xf4c7a2, lunettes: true, badge: true },
  ma: { chemise: 0xd8e6d2, pantalon: 0x3f4a42, cheveux: 0x1b1613, peau: 0xe3ae86, badge: true },
  zhou: { carrure: .95, chemise: 0xeae0ee, pantalon: 0x4a4352, cheveux: 0x241c18, peau: 0xf2c6a4, chignon: true, badge: true },
  boss: { carrure: 1.15, chemise: 0xe8eef4, pantalon: 0x22262e, cheveux: 0x2a2320, peau: 0xe6b288, veste: 0x2b3140, lunettes: true, badge: true, cravate: 0x6e2b33 },
};

const LIGNES_COLLEGUE = [
  'Hé ? Tu vas où ?', 'Lao D, tu m’aides sur ce tableau ?', 'Le directeur te cherche.',
  'Tu files déjà ?', 'Toujours là ?',
];
export const LIGNES_BOSS = [
  'Lao D, on revoit vite fait le plan — juste 5 minutes.',
  "Lao D, t'es pas encore parti ? Parfait, viens en salle de réunion.",
  'Tu pars déjà ? Faut avoir la niaque, à ton âge.',
  "Justement, j'ai pensé à deux-trois retouches. Pour demain matin.",
];

// Fabriques : un PNJ assis à un poste, un patrouilleur, le directeur.
const assis = (nom, role, look, x, z, yaw, opt = {}) => ({
  name: nom, role, kind: 'seated', look: LOOKS[look],
  x, z, yaw, fov: opt.fov ?? 74, dist: opt.dist ?? 9.5, gain: opt.gain ?? 0.75,
  scanAmp: opt.scanAmp ?? 62, scanSpeed: opt.scanSpeed ?? 0.4,
  lines: opt.lines ?? LIGNES_COLLEGUE,
});
const patrouille = (nom, role, look, waypoints, opt = {}) => ({
  name: nom, role, kind: 'patrol', look: LOOKS[look],
  x: waypoints[0][0], z: waypoints[0][1], yaw: 0,
  fov: opt.fov ?? 84, dist: opt.dist ?? 11.5, gain: opt.gain ?? 0.9,
  speed: opt.speed ?? 1.55, pause: opt.pause ?? 1.8, waypoints,
  lines: opt.lines ?? LIGNES_COLLEGUE,
});
// Le directeur occupe la salle vitrée indiquée par le plan. Son trajet
// vers la machine à café contourne son bureau, sort par la porte de la
// cage et traverse le couloir — d'où le passage devant l'ascenseur.
const routeCafe = (plan) => {
  const nord = plan.bossSalle === 'nord';
  const zPorte = (plan.porteBoss[0] + plan.porteBoss[1]) / 2;
  const zSiege = nord ? -11.2 : 12.2;
  const zDegage = nord ? -6.4 : 7.4;
  return [
    [18.6, zSiege],
    [18.6, zDegage],
    [13.2, zPorte],
    [9.6, zPorte],
    [9.6, nord ? -2 : -1],
    [16.6, -1.6],
  ];
};

const directeur = (plan, opt = {}) => {
  const nord = plan.bossSalle === 'nord';
  return {
    name: 'Directeur Wang', role: 'le boss', kind: 'boss', boss: true, look: LOOKS.boss,
    x: 16, z: nord ? -10.9 : 11.9, yaw: nord ? 0 : Math.PI,
    fov: opt.fov ?? 104, dist: opt.dist ?? 17, gain: opt.gain ?? 1.15,
    decay: 0.3, hear: 3.2, scanAmp: 40, scanSpeed: 0.36,
    sitMin: opt.sitMin ?? 16, sitVar: opt.sitVar ?? 12,
    coffeeRoute: routeCafe(plan), coffeeYaw: Math.PI / 2,
    lines: LIGNES_BOSS,
  };
};

// Rondes valides pour chaque plan (vérifiées par les tests Node).
const RONDES = {
  A: {
    openspace: [[-17.3, -13], [1.5, -13], [1.5, -3], [-17.3, -3], [-17.3, 8], [1.5, 8], [1.5, -3], [-17.3, -3]],
    couloir: [[8, -13], [8, -1], [10, 4], [8, 9.5], [8, -1], [6, -9]],
  },
  B: {
    // les cloisons verticales x = -13,1 et -6,1 courent de z = -13,5 à 11,5 :
    // on ne traverse qu'au nord ou au sud de leurs extrémités
    openspace: [[-14.2, -14.3], [-14.2, 12.8], [-4.5, 12.8], [-4.5, -14.3]],
    couloir: [[8, -14], [8, -2], [10, 3], [8, 10], [8, -2], [6, -12]],
  },
  C: {
    // boucle nord : la longue cloison z = -2 coupe l'étage en deux
    openspace: [[-18.0, -12.8], [-6.0, -12.8], [-6.0, -4.0], [-18.0, -4.0]],
    couloir: [[8, -14], [8, 0], [10, 5], [8, 10.5], [8, 0], [6, -10]],
  },
};

// ------------------------------------------------------------
//  Sorties
//
//  Ascenseur : la sortie évidente, au bout du chemin naturel. Il faut y
//  rester 3,4 s et le « ding » fait lever la tête du directeur. Quand ses
//  stores sont baissés (`stores`), il ne voit pas le hall depuis son bureau :
//  la fenêtre, c'est tant qu'il est assis ; le danger, sa pause café.
//
//  Escalier : porte coupe-feu verrouillée après 18 h. Elle ne s'ouvre
//  qu'avec le passe de la sécurité, facultatif, posé dans un endroit
//  différent à chaque étage — loin de l'escalier ou sous un regard. C'est
//  lui qui fixe le prix de la sortie discrète (1,3 s, sans bruit).
// ------------------------------------------------------------
const passe = (x, z, y) => ({ id: 'passe', nom: 'le passe de la sécurité', ouvre: 'stairs', x, z, y });

// ------------------------------------------------------------
//  Les niveaux
// ------------------------------------------------------------
export const NIVEAUX = [
  {
    id: 1, plan: 'A', titre: 'Étage 23 — 18:00',
    sousTitre: 'Un mardi comme les autres. Le directeur est en visio, stores baissés.',
    heure: 18 * 3600, limite: 185, soleil: { elevation: 11.5, azimut: -92, intensite: 4.4 },
    eclairage: 1.0, stores: true, sorties: ['elevator', 'stairs'],
    // Passe sur les casiers du fond, à l'opposé de l'escalier : l'ascenseur
    // est la sortie naturelle, l'escalier un détour par tout l'étage.
    objets: [passe(3.1, -12.1, 1.87)],
    pnj: (p) => [
      assis('Xiao Wang', 'collègue', 'wang', -9.25, -7.95, Math.PI),
      assis('Xiao Li', 'collègue', 'li', -3.25, 4.05, Math.PI, { scanAmp: 70, scanSpeed: 0.33 }),
      patrouille('Zhang Jie', 'chef d’équipe', 'zhang', RONDES.A.openspace, { pause: 2.2, speed: 1.4 }),
      directeur(p, { sitMin: 22, sitVar: 14 }),
    ],
    conseil: 'Stores baissés : assis, le directeur ne voit pas l’ascenseur. File quand il n’est pas en pause café.',
  },
  {
    id: 2, plan: 'A', titre: 'Étage 23 — 18:20',
    sousTitre: 'Ton badge est resté près de la photocopieuse. Sans lui, pas de portique en bas.',
    heure: 18 * 3600 + 1200, limite: 175, soleil: { elevation: 9.5, azimut: -94, intensite: 4.2 },
    eclairage: 1.0, stores: true, sorties: ['elevator', 'stairs'],
    // Le passe attend en salle de réunion, au bout de la ronde du vigile.
    objets: [{ id: 'badge', nom: 'ton badge', x: -18.4, z: -14.3, y: 1.29 }, passe(14.2, 10.4, 0.80)],
    pnj: (p) => [
      assis('Xiao Wang', 'collègue', 'wang', -9.25, -7.95, Math.PI),
      assis('Xiao Li', 'collègue', 'li', -3.25, 4.05, Math.PI),
      patrouille('Zhang Jie', 'chef d’équipe', 'zhang', RONDES.A.openspace, { speed: 1.5 }),
      patrouille('Lao Liu', 'sécurité', 'liu', RONDES.A.couloir, { speed: 1.65, pause: 1.4, dist: 12.5 }),
      directeur(p, { sitMin: 18, sitVar: 10 }),
    ],
    conseil: 'Le badge est obligatoire. Le passe de l’escalier traîne en salle de réunion, sur la ronde du vigile.',
  },
  {
    id: 3, plan: 'B', titre: 'Étage 19 — 18:45',
    sousTitre: 'Escaliers condamnés pour travaux. Il ne reste que l’ascenseur.',
    heure: 18 * 3600 + 2700, limite: 170, soleil: { elevation: 7.5, azimut: -96, intensite: 3.9 },
    eclairage: 1.0, stores: true, sorties: ['elevator'], objets: [],
    pnj: (p) => [
      assis('Xiao Wang', 'collègue', 'wang', -15.35, -10, -PI2),
      assis('Xiao Chen', 'collègue', 'chen', -8.35, -1, -PI2, { scanAmp: 80 }),
      assis('Xiao Ma', 'collègue', 'ma', -1.35, -10, -PI2),
      patrouille('Zhang Jie', 'chef d’équipe', 'zhang', RONDES.B.openspace, { speed: 1.6 }),
      patrouille('Lao Liu', 'sécurité', 'liu', RONDES.B.couloir, { speed: 1.75, pause: 1.2, dist: 13 }),
      directeur(p, { sitMin: 15, sitVar: 9 }),
    ],
    conseil: 'Une seule sortie : l’ascenseur, trois secondes immobile. Le directeur passe au café juste à côté.',
  },
  {
    id: 4, plan: 'B', titre: 'Étage 19 — 19:30',
    sousTitre: 'La moitié des néons sont coupés. Stores levés : le directeur surveille le hall.',
    heure: 19 * 3600 + 1800, limite: 165, soleil: { elevation: 3.2, azimut: -99, intensite: 2.6 },
    eclairage: 0.45, sorties: ['elevator', 'stairs'],
    // Plan B : réunion au nord, direction au sud. Portable près du bord de la table.
    // Le passe est sur la machine à café : les deux sorties passent par le hall,
    // l'une y attend 3,4 s, l'autre ne fait qu'y entrer et en ressortir.
    objets: [{ id: 'portable', nom: 'ton portable', x: 16, z: -10.4, y: 0.80 }, passe(18.45, -1.2, 1.41)],
    pnj: (p) => [
      assis('Xiao Wang', 'collègue', 'wang', -15.35, -10, -PI2),
      assis('Xiao Ma', 'collègue', 'ma', -1.35, -10, -PI2),
      assis('Zhou Min', 'collègue', 'zhou', -8.35, 8, -PI2, { scanAmp: 75 }),
      patrouille('Zhang Jie', 'chef d’équipe', 'zhang', RONDES.B.openspace, { speed: 1.7, pause: 1.4 }),
      patrouille('Lao Liu', 'sécurité', 'liu', RONDES.B.couloir, { speed: 1.8, pause: 1.1, dist: 13 }),
      directeur(p, { sitMin: 11, sitVar: 6 }),
    ],
    conseil: 'Portable en salle de réunion. Le passe est sur la machine à café, en plein hall : entre et ressors vite.',
  },
  {
    id: 5, plan: 'C', titre: 'Étage 12 — 20:15',
    sousTitre: 'Box serrés, couloirs étroits. On se croise vite, ici.',
    heure: 20 * 3600 + 900, limite: 160, soleil: { elevation: 0.5, azimut: -101, intensite: 1.2 },
    eclairage: 0.7, stores: true, sorties: ['elevator', 'stairs'],
    // Passe sur le bureau du directeur. Assis, il bloque le passe mais ne voit
    // pas le hall ; en pause café, c'est l'inverse. Deux fenêtres opposées.
    objets: [passe(14.75, -9.0, 0.80)],
    pnj: (p) => [
      assis('Xiao Wang', 'collègue', 'wang', -15.25, -6.15, Math.PI),
      assis('Xiao Li', 'collègue', 'li', -8.25, -6.15, 0),
      assis('Xiao Ma', 'collègue', 'ma', -15.25, 8.85, Math.PI),
      assis('Zhou Min', 'collègue', 'zhou', -8.25, 3.35, 0),
      patrouille('Zhang Jie', 'chef d’équipe', 'zhang', RONDES.C.openspace, { speed: 1.62, pause: 1.5 }),
      patrouille('Lao Liu', 'sécurité', 'liu', RONDES.C.couloir, { speed: 1.7, pause: 1.3, dist: 12.5 }),
      directeur(p, { sitMin: 12, sitVar: 6 }),
    ],
    conseil: 'Le passe est sur le bureau du directeur : prends-le pendant sa pause café. Sinon, l’ascenseur.',
  },
  {
    id: 6, plan: 'C', titre: 'Étage 12 — 21:00',
    sousTitre: 'Le directeur range son bureau. Il sera dans le couloir dans une minute.',
    heure: 21 * 3600, limite: 66, soleil: { elevation: -1.5, azimut: -104, intensite: 0.6 },
    eclairage: 0.5, sorties: ['elevator', 'stairs'],
    // Le portable était posé sur le bureau du directeur pendant qu'il
    // chassait : deux objectifs incompatibles. Il passe en salle de
    // réunion, qui reste un détour risqué mais franchissable.
    // L'escalier est ici la voie rapide (la salle de réunion donne sur le
    // palier) : le passe, sur l'armoire de reprographie, en est le prix.
    objets: [
      { id: 'badge', nom: 'ton badge', x: -18.4, z: -14.3, y: 1.29 },
      { id: 'portable', nom: 'ton portable', x: 16, z: 11, y: 0.80 },
      passe(2.3, -14.8, 1.86),
    ],
    pnj: (p) => [
      assis('Xiao Wang', 'collègue', 'wang', -15.25, -6.15, Math.PI),
      assis('Xiao Li', 'collègue', 'li', -8.25, -6.15, 0),
      assis('Xiao Ma', 'collègue', 'ma', -15.25, 8.85, Math.PI),
      assis('Zhou Min', 'collègue', 'zhou', -8.25, 3.35, 0, { dist: 10.5 }),
      patrouille('Zhang Jie', 'chef d’équipe', 'zhang', RONDES.C.openspace, { speed: 1.68, pause: 1.35 }),
      patrouille('Lao Liu', 'sécurité', 'liu', RONDES.C.couloir, { speed: 1.78, pause: 1.2, dist: 12.5 }),
      directeur(p, { sitMin: 14, sitVar: 6, dist: 15 }),
    ],
    conseil: 'Portable en salle de réunion, collée à l’escalier. Le passe est sur l’armoire de reprographie.',
  },
];

export const RONDES_PAR_PLAN = RONDES;

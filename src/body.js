import { partager } from './resources.js';
import * as THREE from 'three';

// ============================================================
//  Corps articulé
//
//  Le corps n'est pas un assemblage de primitives rigides posées
//  les unes sur les autres — c'est ce qui donnait l'aspect
//  Playmobil : une sphère d'épaule sur une capsule de bras laisse
//  une jonction visible dès que le membre tourne.
//
//  Ici chaque membre est un TUBE CONTINU, droit en pose de repos,
//  dont les sommets sont pondérés sur deux os. La flexion vient du
//  squelette : la surface se plie au lieu de se casser.
//
//  Les vêtements posés SUR le corps (revers, col, cravate, sangles,
//  cordon de badge) sont des RUBANS générés à partir de la surface
//  réelle du tube qu'ils habillent. Avant, ces pièces étaient des
//  boîtes placées à des cotes fixes : la cravate et les boutons
//  étaient enfouis dans la poitrine, ce qui laissait le torse nu.
// ============================================================

// Pose de repos. Les positions reprennent exactement celles des
// anciens pivots, pour que le code d'animation reste inchangé.
//
// `teteBase` est le pivot que pilotent player.js, npc.js et les
// emotes (parts.head). `tete`, son enfant, porte la peau du crâne et
// n'appartient qu'aux micro-mouvements de animerVisage : les deux
// couches ne se marchent pas dessus.
const OS = [
  ['racine', null, [0, 0.85, 0]],
  ['buste', 'racine', [0, 0, 0]],
  ['teteBase', 'buste', [0, 0.78, 0]],
  ['tete', 'teteBase', [0, 0, 0]],
  ['epauleL', 'buste', [-0.215, 0.53, 0]],
  ['coudeL', 'epauleL', [0, -0.27, 0]],
  ['mainL', 'coudeL', [0, -0.27, 0]],
  ['epauleR', 'buste', [0.215, 0.53, 0]],
  ['coudeR', 'epauleR', [0, -0.27, 0]],
  ['mainR', 'coudeR', [0, -0.27, 0]],
  ['hancheL', 'racine', [-0.105, 0, 0]],
  ['genouL', 'hancheL', [0, -0.43, 0]],
  ['chevilleL', 'genouL', [0, -0.38, 0]],
  ['hancheR', 'racine', [0.105, 0, 0]],
  ['genouR', 'hancheR', [0, -0.43, 0]],
  ['chevilleR', 'genouR', [0, -0.38, 0]],
];

const INDEX = new Map(OS.map((o, i) => [o[0], i]));

// Position absolue d'un os en pose de repos.
const MONDE = (() => {
  const m = new Map();
  for (const [nom, parent, p] of OS) {
    const base = parent ? m.get(parent) : [0, 0, 0];
    m.set(nom, [base[0] + p[0], base[1] + p[1], base[2] + p[2]]);
  }
  return m;
})();

// Fabrique une hiérarchie d'os neuve (chaque personnage a la sienne).
//
// Le Skeleton n'est PAS créé ici : son constructeur calcule les matrices
// inverses de liaison à partir des matrices monde des os. Tant que la
// hiérarchie n'a pas été attachée à la scène et mise à jour, ces matrices
// valent l'identité — et le maillage part en spaghetti. C'est à l'appelant
// de faire updateMatrixWorld() puis d'appeler lierSquelette().
export function construireSquelette() {
  const os = OS.map(([nom, , p]) => {
    const b = new THREE.Bone(); b.name = nom;
    b.position.set(p[0], p[1], p[2]);
    return b;
  });
  OS.forEach(([, parent], i) => {
    if (parent) os[INDEX.get(parent)].add(os[i]);
  });
  return { os, racine: os[0] };
}

// À appeler une fois la racine attachée et les matrices monde à jour.
export function lierSquelette(os) {
  return new THREE.Skeleton(os);
}

export function nomsOs() { return OS.map(o => o[0]); }

// ------------------------------------------------------------
//  Génération des tubes
// ------------------------------------------------------------

// 1 unité UV = 0,9 m de surface, quel que soit le tube. Avant, chaque
// tube étirait sa texture sur [0,1] : la maille du tissu était deux
// fois plus grosse sur le torse que sur les bras, et la couture des
// UV tombait au milieu de la poitrine.
const ECHELLE_UV = 0.9;

const lisse = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.max(0, Math.min(1, t));

// Interpolation Catmull-Rom sur une composante, pour que le profil
// ne présente pas de cassure d'un point de contrôle à l'autre.
function crom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Section transversale paramétrable.
//
// Un cercle ne fait pas une tête : le visage est plat devant, le crâne
// rond derrière, la mâchoire presque carrée. On autorise donc un rayon
// avant différent de l'arrière, et un exposant de superellipse (1 =
// ellipse, < 1 = section carrée). L'angle 0 pointe vers +z (devant).
function section(a, rx, rzAvant, rzArriere, exp) {
  const sa = Math.sin(a), ca = Math.cos(a);
  const px = Math.sign(sa) * Math.pow(Math.abs(sa), exp);
  const pz = Math.sign(ca) * Math.pow(Math.abs(ca), exp);
  return [px * rx, pz * (ca >= 0 ? rzAvant : rzArriere)];
}

// Sculpt léger du visage, en mètres : orbites creusées, pommettes,
// sillon sous la lèvre et menton. Un même relief place aussi les yeux
// et la bouche : pas de coordonnées d'accessoires devinées.
function reliefVisage(x, y, z) {
  if (z <= 0) return 0;
  const g = (cx, cy, sx, sy) => Math.exp(-(((Math.abs(x) - cx) / sx) ** 2) - ((y - cy) / sy) ** 2);
  const face = Math.min(1, z / 0.065);
  return face * (-0.009 * g(0.036, 1.636, 0.022, 0.014)
    + 0.008 * g(0.054, 1.612, 0.024, 0.017)
    - 0.006 * g(0.056, 1.584, 0.020, 0.017)
    + 0.005 * g(0, 1.565, 0.035, 0.012)
    - 0.003 * g(0, 1.581, 0.026, 0.005));
}

function perimetre(s) {
  let l = 0, prev = null;
  for (let j = 0; j <= 48; j++) {
    const d = section(j / 48 * Math.PI * 2, s.r[0], s.r[1], s.rzB, s.exp);
    if (prev) l += Math.hypot(d[0] - prev[0], d[1] - prev[1]);
    prev = d;
  }
  return l;
}

function echantillonner(pts, sousDiv) {
  const out = [];
  const at = i => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    const n = i === pts.length - 2 ? sousDiv + 1 : sousDiv;
    for (let k = 0; k < n; k++) {
      const t = k / sousDiv;
      const comp = (f) => crom(f(a), f(b), f(c), f(d), t);
      out.push({
        p: [comp(q => q.p[0]), comp(q => q.p[1]), comp(q => q.p[2])],
        r: [Math.max(0.004, comp(q => q.r[0])), Math.max(0.004, comp(q => q.r[1]))],
        rzB: Math.max(0.004, comp(q => q.rzB ?? q.r[1])),
        exp: Math.max(0.35, comp(q => q.exp ?? 1)),
        // les os ne s'interpolent pas : on mélange les deux voisins
        osA: b.os, osB: c.os, melange: lisse(t),
      });
    }
  }
  return out;
}

// Construit un tube autour d'une chaîne de points de contrôle. Les
// anneaux sont horizontaux : en pose de repos, tous les membres sont
// verticaux.
//
//  arc(y)  : ouverture variable selon la hauteur → [début, fin]. C'est
//            ce qui donne le V d'une veste ou la fenêtre d'une coupe de
//            cheveux, impossibles avec une ouverture constante.
//  depart  : angle de la couture (par défaut derrière pour un anneau
//            complet, sinon 0 pour que l'ouverture soit centrée devant).
//  bombe   : hauteur du dôme des bouchons, en fraction du petit rayon.
//  bord(a,t): décalage vertical d'un sommet (angle a, t = 0 au premier
//            anneau, 1 au dernier) — un bord libre ondulé ou en biais.
function tube(pts, { segments = 14, sousDiv = 3, capHaut = true, capBas = true,
                     arcDeb = 0, arcFin = Math.PI * 2, arc = null, ferme = true,
                     depart = null, bombe = 0.25, bord = null, plis = null, angles = null } = {}) {
  const ech = echantillonner(pts, sousDiv);
  const pos = [], uv = [], idx = [], si = [], sw = [];
  const N = segments;
  const monte = pts.at(-1).p[1] > pts[0].p[1];
  const complet = !arc && Math.abs(arcFin - arcDeb - Math.PI * 2) < 1e-6;
  const dep = depart ?? (complet ? Math.PI : 0);

  // Rayon moyen : un U en mètres, cohérent d'un tube à l'autre.
  let rMoy = 0;
  for (const s of ech) rMoy += perimetre(s);
  rMoy /= ech.length * 2 * Math.PI;

  // Sur un tube FERMÉ, le tour doit porter un nombre entier de tuiles,
  // sinon la texture ne se raccorde pas à la couture et une bande
  // verticale traverse le torse. Les `repeat` des personnages valent 3
  // ou 9, donc on arrondit au tiers de tuile. L'étirement vaut au pire
  // un sixième, invisible ; la couture, elle, se voyait.
  let echelleU = 1;
  if (complet) {
    const tuiles = Math.PI * 2 * rMoy / ECHELLE_UV * 3;
    if (tuiles >= 1) echelleU = Math.round(tuiles) / tuiles;
  }

  // longueur cumulée pour un V en mètres
  const longueurs = [0];
  for (let i = 1; i < ech.length; i++) {
    const a = ech[i - 1].p, b = ech[i].p;
    longueurs.push(longueurs[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }

  for (let i = 0; i < ech.length; i++) {
    const s = ech[i];
    const iA = INDEX.get(s.osA), iB = INDEX.get(s.osB);
    const wB = iA === iB ? 0 : s.melange;
    const [d0, d1] = arc ? arc(s.p[1]) : [arcDeb, arcFin];
    const t = ech.length > 1 ? i / (ech.length - 1) : 0;
    for (let j = 0; j <= N; j++) {
      const a = angles ? angles[j] : dep + d0 + (j / N) * (d1 - d0);
      let [dx, dz] = section(a, s.r[0], s.r[1], s.rzB, s.exp);
      if (plis) { const k = plis(a, s.p[1]); dx *= k; dz *= k; }
      const x = s.p[0] + dx, y = s.p[1] + (bord ? bord(a, t) : 0), z = s.p[2] + dz;
      pos.push(x, y, z + (pts === CHAINE_TETE ? reliefVisage(x, y, z) : 0));
      uv.push(a * rMoy * echelleU / ECHELLE_UV, longueurs[i] / ECHELLE_UV);
      si.push(iA, iB, 0, 0);
      sw.push(1 - wB, wB, 0, 0);
    }
  }

  for (let i = 0; i < ech.length - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1;
      // sin/cos parcourt les anneaux dans le sens horaire vu du dessus.
      // Une chaîne montante et une descendante ont des faces opposées.
      if (monte) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }

  // bouchons : un sommet central légèrement bombé
  const bouchon = (iEch, sens) => {
    if (!ferme) return;
    const s = ech[iEch];
    const iA = INDEX.get(s.osA), iB = INDEX.get(s.osB);
    const wB = iA === iB ? 0 : s.melange;
    const centre = pos.length / 3;
    const h = Math.min(s.r[0], s.r[1]) * bombe;
    pos.push(s.p[0], s.p[1] + sens * h, s.p[2]);
    uv.push(Math.PI * rMoy * echelleU / ECHELLE_UV, longueurs[iEch] / ECHELLE_UV);
    si.push(iA, iB, 0, 0);
    sw.push(1 - wB, wB, 0, 0);
    const base = iEch * (N + 1);
    for (let j = 0; j < N; j++) {
      if (sens > 0) idx.push(centre, base + j, base + j + 1);
      else idx.push(centre, base + j + 1, base + j);
    }
  };
  if (capBas) bouchon(0, monte ? -1 : 1);
  if (capHaut) bouchon(ech.length - 1, monte ? 1 : -1);

  return { pos, uv, idx, si, sw };
}

// ------------------------------------------------------------
//  Surface d'une chaîne : les vêtements se posent DESSUS
// ------------------------------------------------------------

// Profil interpolé (linéaire) d'une chaîne à la hauteur y.
function profil(chaine, y) {
  const c = chaine[0].p[1] <= chaine[chaine.length - 1].p[1] ? chaine : [...chaine].reverse();
  let i = 0;
  while (i < c.length - 2 && y > c[i + 1].p[1]) i++;
  const a = c[i], b = c[i + 1];
  const t = clamp01((y - a.p[1]) / (b.p[1] - a.p[1] || 1));
  const L = (u, v) => u + (v - u) * t;
  return {
    p: [L(a.p[0], b.p[0]), y, L(a.p[2], b.p[2])],
    r: [L(a.r[0], b.r[0]), L(a.r[1], b.r[1])],
    rzB: L(a.rzB ?? a.r[1], b.rzB ?? b.r[1]),
    exp: L(a.exp ?? 1, b.exp ?? 1),
    osA: a.os, osB: b.os, melange: lisse(t),
  };
}

// Point de la surface à la hauteur y et à l'angle `ang`, poussé de
// `decal` le long de la normale. Renvoie aussi la normale et les os
// porteurs, pour que le ruban suive la même déformation que le tube.
function sur(chaine, y, ang, decal = 0) {
  const s = profil(chaine, y);
  const [dx, dz] = section(ang, s.r[0], s.r[1], s.rzB, s.exp);
  const rz = dz >= 0 ? s.r[1] : s.rzB;
  let nx = dx / (s.r[0] * s.r[0]), nz = dz / (rz * rz);
  const l = Math.hypot(nx, nz) || 1;
  nx /= l; nz /= l;
  return {
    p: [s.p[0] + dx + nx * decal, y, s.p[2] + dz + nz * decal
      + (chaine === CHAINE_TETE ? reliefVisage(s.p[0] + dx, y, s.p[2] + dz) : 0)],
    n: [nx, 0, nz],
    os: [s.osA, s.osB, s.melange],
  };
}

// Même chose à l'abscisse x donnée, côté avant (cote = 1) ou arrière.
function surX(chaine, y, x, cote = 1, decal = 0) {
  const s = profil(chaine, y);
  const cible = Math.min(Math.abs(x), s.r[0] * 0.999);
  let lo = 0, hi = Math.PI / 2;
  for (let k = 0; k < 24; k++) {
    const m = (lo + hi) / 2;
    if (section(m, s.r[0], s.r[1], s.rzB, s.exp)[0] < cible) lo = m; else hi = m;
  }
  let a = (lo + hi) / 2;
  if (x < 0) a = -a;
  if (cote < 0) a = Math.PI - a;
  return sur(chaine, y, a, decal);
}

// Ruban à deux bords et à épaisseur : une bande de tissu posée sur
// une surface. `sections` : [{ a, b, n, os }] où a et b sont les deux
// bords, n la normale extérieure, os [osA, osB, mélange].
function ruban(sections, { epaisseur = 0.004, largeurUV = null } = {}) {
  const pos = [], uv = [], idx = [], si = [], sw = [];
  const K = sections.length;
  let l = 0;
  for (let i = 0; i < K; i++) {
    const s = sections[i];
    if (i > 0) {
      const p = sections[i - 1];
      l += Math.hypot((s.a[0] + s.b[0]) / 2 - (p.a[0] + p.b[0]) / 2,
                      (s.a[1] + s.b[1]) / 2 - (p.a[1] + p.b[1]) / 2,
                      (s.a[2] + s.b[2]) / 2 - (p.a[2] + p.b[2]) / 2);
    }
    const w = largeurUV ?? Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]);
    const iA = INDEX.get(s.os[0]), iB = INDEX.get(s.os[1]);
    const wB = iA === iB ? 0 : s.os[2];
    const e = epaisseur;
    // 4 sommets : dessus a, dessus b, dessous b, dessous a
    const quatre = [
      s.a, s.b,
      [s.b[0] - s.n[0] * e, s.b[1] - s.n[1] * e, s.b[2] - s.n[2] * e],
      [s.a[0] - s.n[0] * e, s.a[1] - s.n[1] * e, s.a[2] - s.n[2] * e],
    ];
    const u = [0, w, w, 0];
    for (let q = 0; q < 4; q++) {
      pos.push(...quatre[q]);
      uv.push(u[q] / ECHELLE_UV, l / ECHELLE_UV);
      si.push(iA, iB, 0, 0);
      sw.push(1 - wB, wB, 0, 0);
    }
    if (i > 0) {
      const p = 4 * (i - 1), c = 4 * i;
      // dessus, dessous, chant a, chant b
      idx.push(p, p + 1, c, c, p + 1, c + 1);
      idx.push(p + 3, c + 3, p + 2, p + 2, c + 3, c + 2);
      idx.push(p, c, p + 3, p + 3, c, c + 3);
      idx.push(p + 1, p + 2, c + 1, c + 1, p + 2, c + 2);
    }
  }
  // extrémités
  idx.push(0, 3, 1, 1, 3, 2);
  const f = 4 * (K - 1);
  idx.push(f, f + 1, f + 3, f + 3, f + 1, f + 2);
  const a = new THREE.Vector3().fromArray(pos, idx[0] * 3);
  const b = new THREE.Vector3().fromArray(pos, idx[1] * 3);
  const c = new THREE.Vector3().fromArray(pos, idx[2] * 3);
  if (b.sub(a).cross(c.sub(a)).dot(new THREE.Vector3(...sections[0].n)) < 0)
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  return { pos, uv, idx, si, sw };
}

// Assemble plusieurs morceaux en une seule géométrie indexée.
function assembler(morceaux) {
  const pos = [], uv = [], idx = [], si = [], sw = [];
  for (const m of morceaux) {
    const dec = pos.length / 3;
    pos.push(...m.pos); uv.push(...m.uv); si.push(...m.si); sw.push(...m.sw);
    for (const i of m.idx) idx.push(i + dec);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  souderNormales(g);
  return g;
}

// computeVertexNormals moyenne les normales des faces qui partagent un
// INDEX, pas une position. À la couture d'un tube fermé, les deux bords
// occupent le même point mais portent deux indices : leurs normales ne
// sont jamais moyennées, et une arête de lumière court du haut en bas du
// torse. On les recoud ici, par position.
//
// Les bords libres (ouverture de veste, coupe de cheveux) ne sont pas
// concernés : leurs deux lèvres sont à des positions différentes, donc
// l'arête voulue reste nette.
function souderNormales(g) {
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  const paquets = new Map();
  for (let i = 0; i < p.length; i += 3) {
    // au dixième de millimètre : deux sommets « au même endroit »
    const cle = `${Math.round(p[i] * 1e4)},${Math.round(p[i + 1] * 1e4)},${Math.round(p[i + 2] * 1e4)}`;
    let l = paquets.get(cle);
    if (!l) paquets.set(cle, l = []);
    l.push(i);
  }
  for (const l of paquets.values()) {
    if (l.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of l) { x += n[i]; y += n[i + 1]; z += n[i + 2]; }
    const d = Math.hypot(x, y, z);
    if (d < 1e-6) continue;
    x /= d; y /= d; z /= d;
    for (const i of l) { n[i] = x; n[i + 1] = y; n[i + 2] = z; }
  }
  g.attributes.normal.needsUpdate = true;
}

// ------------------------------------------------------------
//  Le corps
// ------------------------------------------------------------
const P = (x, y, z, rx, rz, os) => ({ p: [x, y, z], r: [rx, rz], os });
// Point de contrôle de tête : rayon avant et arrière distincts, et
// exposant de superellipse. Toujours porté par l'os `tete`.
const Q = (x, y, z, rx, rzAvant, rzArriere, exp) =>
  ({ p: [x, y, z], r: [rx, rzAvant], rzB: rzArriere, exp, os: 'tete' });

// Bras de chemise : manche LONGUE, jusqu'à la manchette.
//
// Correctif du « Rayman » : les deux premiers points de contrôle sont
// portés par `buste`, pas par l'épaule. La naissance du bras est donc
// COUSUE au torse — quand l'épaule tourne, ces sommets restent sur le
// tronc et la surface s'étire au lieu de se décoller.
//
// Le troisième point est le deltoïde : c'est le volume qui manquait et
// qui faisait lire « cylindre posé à côté du torse ».
// La naissance du bras est SOUS la ligne d'épaule du torse (1,425 à
// 1,468). Elle était à 1,482, soit au-dessus : le tube dépassait du
// tronc et montait jusqu'au cou, ce qui donnait deux rouleaux pendants
// en guise d'épaules et effaçait toute la carrure.
function chaineBras(cote) {
  const x = MONDE.get(cote < 0 ? 'epauleL' : 'epauleR')[0];
  const eL = cote < 0 ? 'epauleL' : 'epauleR';
  const cL = cote < 0 ? 'coudeL' : 'coudeR';
  const mL = cote < 0 ? 'mainL' : 'mainR';
  // Rayons MESURÉS contre le corps : le deltoïde faisait 8,1 cm de
  // rayon, soit 16 cm de diamètre pour un torse de 36 cm de large. Le
  // bras débordait de 11 cm au-delà de la carrure et chevauchait le
  // tronc de 6 cm — d'où deux rouleaux pendus de part et d'autre, sans
  // ligne d'épaule. Un deltoïde d'adulte fait 5,5 cm de rayon.
  return [P(x * 0.50, 1.450, -0.005, 0.036, 0.036, 'buste'),   // naissance, noyée dans le trapèze
          P(x * 0.78, 1.434, -0.002, 0.048, 0.047, 'buste'),   // transition cousue au torse
          P(x * 0.97, 1.402, 0, 0.057, 0.055, eL),             // deltoïde
          P(x, 1.340, 0, 0.053, 0.051, eL),
          P(x, 1.225, 0, 0.047, 0.046, eL),                    // biceps
          P(x, 1.118, 0, 0.043, 0.042, cL),                    // coude
          P(x, 1.040, 0, 0.043, 0.041, cL),
          P(x, 0.960, 0, 0.040, 0.038, cL),                    // avant-bras
          P(x, 0.905, 0, 0.036, 0.035, cL),
          P(x, 0.884, 0, 0.035, 0.033, mL),                    // manchette
          P(x, 0.872, 0, 0.034, 0.032, mL)];
}

// Manche de veste : la même chaîne, gonflée, ouverte en bas pour que
// la manchette de chemise dépasse.
// Le bouchon du haut est un dôme RENTRANT (voir tube) : trop profond,
// il creuse un cratère à l'épaule. 0,2 suffit à fermer la surface.
const BOMBE_MANCHE = 0.2;
function chaineManche(cote) {
  const x = MONDE.get(cote < 0 ? 'epauleL' : 'epauleR')[0];
  const eL = cote < 0 ? 'epauleL' : 'epauleR';
  const cL = cote < 0 ? 'coudeL' : 'coudeR';
  return [P(x * 0.48, 1.456, -0.007, 0.042, 0.042, 'buste'),
          P(x * 0.76, 1.438, -0.003, 0.057, 0.056, 'buste'),
          P(x * 0.98, 1.404, 0, 0.066, 0.064, eL),             // épaule de veste, rembourrée
          P(x, 1.340, 0, 0.062, 0.060, eL),
          P(x, 1.225, 0.000, 0.057, 0.055, eL),
          P(x, 1.118, 0.000, 0.052, 0.051, cL),
          P(x, 1.040, 0.005, 0.050, 0.045, cL),
          P(x, 0.960, 0, 0.047, 0.045, cL),
          // la manchette de chemise ne dépasse que de 1,6 cm : à 4,6 cm
          // elle lisait comme un gant blanc
          P(x, 0.900, 0.000, 0.043, 0.041, cL)];
}

// Peau du poignet et de la main : le tube part de SOUS la manchette et
// se prolonge dans la paume. Le poignet se resserre puis la main
// s'élargit, d'un seul tenant ; les doigts partent de sa base.
function chaineMain(cote) {
  const x = MONDE.get(cote < 0 ? 'epauleL' : 'epauleR')[0];
  const cL = cote < 0 ? 'coudeL' : 'coudeR';
  const mL = cote < 0 ? 'mainL' : 'mainR';
  return [P(x, 0.905, 0, 0.035, 0.033, cL),
          P(x, 0.872, 0, 0.032, 0.029, mL),                    // poignet
          P(x, 0.840, 0.003, 0.038, 0.025, mL),                // paume
          P(x, 0.805, 0.006, 0.038, 0.023, mL),
          P(x, 0.776, 0.006, 0.032, 0.020, mL)];               // base des doigts
}

// Jambes. Le premier point est porté par `racine` et NOYÉ dans le
// bassin : le haut de cuisse reste soudé quand la hanche pivote.
function chaineJambe(cote) {
  const x = MONDE.get(cote < 0 ? 'hancheL' : 'hancheR')[0];
  const h = cote < 0 ? 'hancheL' : 'hancheR';
  const g = cote < 0 ? 'genouL' : 'genouR';
  const c = cote < 0 ? 'chevilleL' : 'chevilleR';
  return [P(x * 0.84, 0.905, 0, 0.088, 0.088, 'racine'),   // naissance, dans le bassin
          P(x * 0.96, 0.845, 0, 0.097, 0.095, h),
          P(x, 0.760, 0, 0.098, 0.096, h),                 // cuisse
          P(x, 0.600, 0, 0.086, 0.084, h),
          P(x, 0.452, 0.014, 0.068, 0.069, g),                 // genou
          P(x, 0.330, -0.006, 0.069, 0.068, g),                 // mollet
          P(x, 0.190, 0.002, 0.057, 0.055, g),
          P(x, 0.137, 0.006, 0.055, 0.052, c),
          P(x, 0.113, 0.012, 0.053, 0.049, c)].map(p => ({ ...p, exp: 0.82 }));                // cheville
}

// Bassin : un volume de pantalon d'où sortent les cuisses. Sans lui, le
// tube de chemise descendait jusqu'à l'entrejambe et les jambes
// semblaient collées sous le torse.
const CHAINE_BASSIN = [
  P(0, 0.770, 0.000, 0.152, 0.106, 'racine'),   // entrejambe
  P(0, 0.850, 0.000, 0.176, 0.116, 'racine'),   // hanches, point le plus large
  P(0, 0.905, 0.002, 0.178, 0.116, 'racine'),
  P(0, 0.945, 0.002, 0.170, 0.112, 'racine'),
  P(0, 0.985, 0.002, 0.162, 0.107, 'racine'),   // ceinture
];

// Torse de chemise : section elliptique, épaules larges, taille marquée.
// Il s'arrête sous la ceinture (le bassin prend le relais) et se
// referme à plat autour du cou, sous le col.
const CHAINE_TORSE = [
  P(0, 0.930, 0.000, 0.150, 0.098, 'racine'),
  P(0, 0.975, 0.002, 0.153, 0.101, 'racine'),   // ceinture
  P(0, 1.040, 0.004, 0.146, 0.098, 'buste'),
  P(0, 1.120, 0.006, 0.140, 0.095, 'buste'),    // taille marquée
  P(0, 1.240, 0.004, 0.160, 0.106, 'buste'),    // cage thoracique
  P(0, 1.350, 0.001, 0.180, 0.112, 'buste'),    // poitrine
  P(0, 1.425, -0.003, 0.178, 0.109, 'buste'),   // largeur d'épaules maintenue
  P(0, 1.468, -0.005, 0.146, 0.098, 'buste'),   // trapèzes en pente
  P(0, 1.505, -0.007, 0.070, 0.064, 'buste'),   // encolure, juste autour du cou
].map(p => ({ ...p, exp: p.p[1] > 1.46 ? 0.94 : 0.84 }));

// Tête : une seule surface continue, du sommet du crâne au raccord du
// cou. Le visage est plat (rzAvant < rzArriere), les pommettes sont
// marquées, la mâchoire tire vers le carré (exp < 1) et le menton se
// resserre. Le crâne est plus HAUT qu'avant (23 cm au lieu de 21) : une
// tête large et courte lisait comme un casque. Les yeux restent à 1,63.
const CHAINE_TETE = [
  Q(0, 1.768, -0.006, 0.030, 0.030, 0.034, 1.00),   // sommet
  Q(0, 1.752, -0.006, 0.060, 0.060, 0.068, 1.00),
  Q(0, 1.730, -0.005, 0.077, 0.076, 0.086, 0.97),
  Q(0, 1.700, -0.004, 0.086, 0.082, 0.094, 0.95),   // tempes, largeur maximale
  Q(0, 1.672, -0.002, 0.087, 0.083, 0.094, 0.93),   // front
  Q(0, 1.650, 0.001, 0.087, 0.084, 0.093, 0.92),    // arcade sourcilière
  Q(0, 1.630, 0.004, 0.085, 0.086, 0.090, 0.90),    // pommettes, ligne des yeux
  Q(0, 1.606, 0.004, 0.080, 0.084, 0.085, 0.86),    // joues
  Q(0, 1.583, 0.004, 0.071, 0.078, 0.076, 0.82),    // mâchoire, plus carrée
  Q(0, 1.562, 0.005, 0.056, 0.066, 0.060, 0.80),    // menton
  Q(0, 1.548, 0.001, 0.038, 0.046, 0.044, 0.88),    // sous le menton
  Q(0, 1.532, -0.006, 0.044, 0.046, 0.048, 1.00),   // raccord au cou
];

// Nez : même matière que la peau, donc invisible comme pièce rapportée.
// Racine sous l'arcade, bout arrondi, ailes, puis retour sous le nez.
const CHAINE_NEZ = [
  Q(0, 1.650, 0.078, 0.009, 0.010, 0.008, 0.90),
  Q(0, 1.632, 0.086, 0.011, 0.018, 0.008, 0.85),
  Q(0, 1.616, 0.095, 0.013, 0.028, 0.010, 0.72),   // bout
  Q(0, 1.604, 0.086, 0.020, 0.020, 0.012, 0.80),   // ailes
  Q(0, 1.597, 0.080, 0.014, 0.010, 0.008, 0.85),
];

// Le cou part de SOUS le col : sa base est noyée dans le torse, donc
// aucun raccord visible, et il est porté par `buste` sur toute cette
// portion pour ne pas se détacher quand la tête tourne.
const CHAINE_COU = [
  P(0, 1.450, -0.002, 0.072, 0.066, 'buste'),
  P(0, 1.492, 0.000, 0.056, 0.050, 'buste'),
  P(0, 1.530, 0.002, 0.046, 0.044, 'buste'),
  P(0, 1.570, 0.004, 0.043, 0.044, 'tete'),
  P(0, 1.610, 0.004, 0.045, 0.046, 'tete'),
];

// Veste : même axe que le torse, un centimètre et demi plus large.
// Fermée sous le bouton (1,10 m), ouverte en V au-dessus : c'est la
// forme d'une veste, pas d'un gilet fendu.
const CHAINE_VESTE = [
  P(0, 0.790, 0.002, 0.178, 0.126, 'racine'),   // basque, évasée
  P(0, 0.880, 0.002, 0.176, 0.124, 'racine'),
  P(0, 0.990, 0.004, 0.166, 0.117, 'racine'),
  P(0, 1.060, 0.005, 0.160, 0.114, 'buste'),
  P(0, 1.125, 0.006, 0.156, 0.112, 'buste'),
  P(0, 1.245, 0.004, 0.177, 0.122, 'buste'),
  P(0, 1.355, 0.001, 0.197, 0.128, 'buste'),
  P(0, 1.428, -0.003, 0.194, 0.125, 'buste'),
  P(0, 1.470, -0.005, 0.160, 0.112, 'buste'),
  P(0, 1.488, -0.006, 0.122, 0.096, 'buste'),
  P(0, 1.507, -0.006, 0.077, 0.070, 'buste'),
].map(p => ({ ...p, exp: p.p[1] > 1.46 ? 0.94 : 0.84 }));
const BOUTON_VESTE = 1.10;
// Sous le bouton la veste est FERMÉE : 0,05 rad laissait une fente de
// 1,6 cm par laquelle la chemise apparaissait en une ligne claire, qui
// se lisait comme une couture ratée au milieu du ventre.
const ouvertureVeste = (y) =>
  0.48 * clamp01((y - BOUTON_VESTE) / (1.488 - BOUTON_VESTE))
    + 0.09 * clamp01((0.90 - y) / 0.11);
// largeur angulaire du revers, qui s'élargit vers le haut


// ------------------------------------------------------------
//  Rubans de vêtement
// ------------------------------------------------------------

// Revers de veste : une bande qui suit le bord du V, un peu au-dessus
// de la chemise côté ouverture, et repliée sur la veste côté épaule.
function revers(cote) {
  const sections = [];
  // Bas pointu, cran séparant le revers du col, retour vers l'encolure.
  const coupe = [[1.112, .003], [1.18, .016], [1.28, .038], [1.37, .058],
    [1.417, .066], [1.438, .043], [1.445, .062], [1.475, .040], [1.505, .006]];
  for (const [y, largeur] of coupe) {
    const bord = sur(CHAINE_VESTE, y, cote * (ouvertureVeste(y) - .018), .010);
    const pli = surX(CHAINE_VESTE, y, bord.p[0] + cote * largeur, 1, .0025);
    sections.push({ a: bord.p, b: pli.p, n: [0, .12, 1], os: bord.os });
  }
  return ruban(sections, { epaisseur: .0035 });
}

// Col de veste : un cône court qui monte des épaules au cou, derrière
// et sur les côtés, jusqu'à l'encoche des revers.
function colVeste() {
  return tube([
    P(0, 1.480, -.006, .128, .097, 'buste'),
    P(0, 1.499, -.006, .079, .073, 'buste'),
    P(0, 1.508, -.005, .067, .062, 'buste'),
  ], { segments: 24, sousDiv: 2, ferme: false, arcDeb: .72, arcFin: Math.PI * 2 - .72 });
}

// Col de chemise : un pied de col qui ceinture le cou, et un rabat qui
// retombe sur les épaules, dont les deux pointes descendent devant.
function colChemise() {
  const morceaux = [];
  const a0 = 0.22;                       // demi-ouverture devant (nœud de cravate)
  morceaux.push(tube([
    P(0, 1.474, -0.002, 0.066, 0.062, 'buste'),
    P(0, 1.492, 0.000, 0.066, 0.061, 'buste'),
    P(0, 1.508, 0.001, 0.057, 0.055, 'buste'),
  ], { segments: 18, sousDiv: 2, ferme: false, arcDeb: a0, arcFin: Math.PI * 2 - a0 }));

  // Le rabat part du haut du pied de col et retombe SUR la pente des
  // trapèzes (surface réelle du torse) : plus court derrière, plus
  // long et plus bas aux deux pointes.
  const sections = [];
  const K = 22;
  for (let k = 0; k <= K; k++) {
    const t = k / K;
    const ang = a0 + (Math.PI * 2 - 2 * a0) * t;
    // proximité d'une pointe (0 = milieu du dos, 1 = extrémité avant)
    const prox = Math.max(0, 1 - Math.min(ang - a0, Math.PI * 2 - a0 - ang) / 0.60);
    const haut = sur(CHAINE_COU, 1.502, ang, 0.005);
    const chute = 0.020 + 0.042 * prox ** 1.6;
    const bas = sur(CHAINE_TORSE, 1.502 - chute, ang + (ang < Math.PI ? .07 : -.07) * prox, .008);
    const n = [bas.n[0] * 0.4, 0.9, bas.n[2] * 0.4];
    const l = Math.hypot(n[0], n[1], n[2]);
    sections.push({ a: haut.p, b: bas.p, n: [n[0] / l, n[1] / l, n[2] / l], os: haut.os });
  }
  morceaux.push(ruban(sections, { epaisseur: 0.004 }));
  return morceaux;
}

// Patte de boutonnage : une bande verticale plaquée sur le devant de
// la chemise. Les boutons (rigides) se posent dessus via surfaceBuste.
function patteChemise() {
  const sections = [];
  for (let k = 0; k <= 10; k++) {
    const y = 0.995 + (1.470 - 0.995) * (k / 10);
    const g = surX(CHAINE_TORSE, y, -0.014, 1, 0.003);
    const d = surX(CHAINE_TORSE, y, 0.014, 1, 0.003);
    sections.push({ a: g.p, b: d.p, n: [0, 0, 1], os: g.os });
  }
  return ruban(sections, { epaisseur: 0.003 });
}

// Cravate : un pan qui suit la poitrine, étroit sous le nœud, large au
// milieu, en pointe en bas. Le nœud est une pièce rigide (characters.js).
function cravate() {
  const sections = [];
  const K = 14;
  for (let k = 0; k <= K; k++) {
    const t = k / K;
    const y = 1.448 - (1.448 - 1.185) * t;
    let w;
    if (t < 0.12) w = 0.020 + 0.010 * (t / 0.12);
    else if (t < 0.82) w = 0.030 + 0.016 * lisse((t - 0.12) / 0.70);
    else w = 0.046 * (1 - lisse((t - 0.82) / 0.18)) + 0.006;
    const g = surX(CHAINE_TORSE, y, -w / 2, 1, 0.007);
    const d = surX(CHAINE_TORSE, y, w / 2, 1, 0.007);
    sections.push({ a: g.p, b: d.p, n: g.n, os: g.os });
  }
  return ruban(sections, { epaisseur: 0.005 });
}

// Ceinture : un anneau qui épouse le bassin. C'était une boîte de
// 33,8 x 23,2 cm : ses quatre coins sortaient du corps elliptique de
// 4 cm et pointaient sous la veste comme deux galets noirs.
function ceintureRuban() {
  const a = profil(CHAINE_BASSIN, 0.950), b = profil(CHAINE_BASSIN, 0.998);
  const g = (p, d) => P(0, p.p[1], p.p[2], p.r[0] + d, p.r[1] + d, 'racine');
  return tube([
    g(profil(CHAINE_BASSIN, 0.948), 0.002),
    g(a, 0.005),
    g(profil(CHAINE_BASSIN, 0.974), 0.006),
    g(b, 0.005),
    g(profil(CHAINE_BASSIN, 1.000), 0.002),
  ], { segments: 24, sousDiv: 2, ferme: false });
}

// Sangles de sac : elles passent sur l'épaule, devant et derrière, en
// suivant la surface du vêtement du dessus (chemise ou veste).
function sangles(chaine, epaule) {
  const morceaux = [];
  for (const cote of [-1, 1]) {
    const x = 0.120 * cote;
    const sections = [];
    const pose = (y, face, decal) => surX(chaine, y, x, face, decal);
    const avant = [1.10, 1.18, 1.26, 1.34, 1.40, 1.44];
    for (const y of avant) {
      const c = pose(y, 1, 0.011);
      sections.push({ c: c.p, n: c.n, os: c.os });
    }
    // passage sur l'épaule : le haut de la manche est un disque
    // horizontal (son bouchon rentre vers l'intérieur), la sangle passe
    // donc à plat quelques millimètres au-dessus.
    for (const z of [.073, .052, .027, 0, -.027, -.052, -.073]) {
      let lo = 1.42, hi = 1.515;
      for (let k = 0; k < 24; k++) {
        const y = (lo + hi) / 2;
        const surf = surX(chaine, y, x, z >= 0 ? 1 : -1);
        if (profil(chaine, y).r[0] >= Math.abs(x) && Math.abs(surf.p[2]) > Math.abs(z)) lo = y; else hi = y;
      }
      const n = [0, 1, z * 4], d = Math.hypot(...n);
      sections.push({ c: [x, (lo + hi) / 2 + .006, z], n: n.map(v => v / d), os: ['buste', 'buste', 0] });
    }
    for (const y of [1.44, 1.40, 1.35]) {
      const c = pose(y, -1, 0.011);
      sections.push({ c: c.p, n: c.n, os: c.os });
    }
    const demi = 0.014;
    morceaux.push(ruban(sections.map(s => ({
      a: [s.c[0] - demi, s.c[1], s.c[2]], b: [s.c[0] + demi, s.c[1], s.c[2]], n: s.n, os: s.os,
    })), { epaisseur: 0.004 }));
  }
  return morceaux;
}

function surfaceHabillee(chaine, y, x, cote = 1, decal = 0) {
  if (chaine === CHAINE_VESTE && cote > 0) {
    const bord = sur(chaine, y, ouvertureVeste(y));
    if (Math.abs(x) < Math.abs(bord.p[0]) - .003) chaine = CHAINE_TORSE;
  }
  return surX(chaine, y, x, cote, decal);
}

// Cordon de badge : deux brins qui partent du col et convergent sur
// la poitrine.
function cordon(chaine, decal) {
  const morceaux = [];
  for (const cote of [-1, 1]) {
    const sections = [];
    const K = 8;
    for (let k = 0; k <= K; k++) {
      const t = k / K;
      const y = 1.490 - (1.490 - 1.218) * t;
      const x = cote * (0.055 * (1 - t) + 0.006 * t);
      const c = surfaceHabillee(chaine, y, x, 1, decal);
      sections.push({ a: [c.p[0] - 0.005, c.p[1], c.p[2]], b: [c.p[0] + 0.005, c.p[1], c.p[2]],
                      n: c.n, os: c.os });
    }
    morceaux.push(ruban(sections, { epaisseur: 0.004 }));
  }
  return morceaux;
}

// Emmanchure cousue : on ouvre le flanc du torse et on le relie au
// premier anneau de manche. Aucun cylindre ne traverse l'épaule.
// Les sommets du raccord partagent exactement positions et poids aux bords.
function habit(chaine, manche, veste = false) {
  const N = 32, SD = 3;
  const options = { segments: N, sousDiv: SD, bombe: 0, ferme: !veste };
  if (veste) options.arc = y => [ouvertureVeste(y), Math.PI * 2 - ouvertureVeste(y)];
  const torse = tube(chaine, options), ech = echantillonner(chaine, SD);
  const proche = y => ech.reduce((best, s, i) => Math.abs(s.p[1]-y)<Math.abs(ech[best].p[1]-y)?i:best,0);
  const bas=proche(1.30), haut=proche(1.468), morceaux=[torse];
  const trous=[];
  for (const cote of [-1,1]) {
    // Cherche le flanc dans les angles réels (l'ouverture du V décale les colonnes).
    const ligne = proche(1.40);
    let centre=0;
    for(let j=1;j<N;j++) if(cote*torse.pos[(ligne*(N+1)+j)*3] > cote*torse.pos[(ligne*(N+1)+centre)*3]) centre=j;
    const j0=centre-2,j1=centre+2;
    trous.push({j0,j1});
    const contour=[];
    for(let i=bas;i<=haut;i++) for(let j=j0;j<=j1;j++)
      if(i===bas || i===haut || j===j0 || j===j1) {
        const index=i*(N+1)+j,p=torse.pos.slice(index*3,index*3+3);
        contour.push({p,angle:Math.atan2(cote*(p[1]-(ech[bas].p[1]+ech[haut].p[1])/2)/.085,p[2]/.067)});
      }
    contour.sort((a,b)=>a.angle-b.angle);
    const K=contour.length;contour.push(contour[0]);
    const angles=contour.map((q,i)=>q.angle+(i===K?Math.PI*2:0));
    const pts=manche(cote).filter(p=>p.p[1]<=1.34);
    const bras=tube(pts,{segments:K,sousDiv:3,capBas:false,capHaut:false,angles,plis:pliManche});
    const pont={pos:[],uv:[],idx:[],si:[],sw:[]};
    for(let i=0;i<=6;i++) {
      const t=i/6;
      for(let j=0;j<=K;j++) {
        const a=contour[j].p,b=bras.pos.slice(j*3,j*3+3);
        pont.pos.push(a[0]+(b[0]-a[0])*Math.sin(t*Math.PI/2),
          a[1]+(b[1]-a[1])*(1-Math.cos(t*Math.PI/2)),a[2]+(b[2]-a[2])*lisse(t));
        pont.uv.push(j/K*.38,t*.14);
        pont.si.push(INDEX.get('buste'),INDEX.get(cote<0?'epauleL':'epauleR'),0,0);
        pont.sw.push(1-lisse(t),lisse(t),0,0);
        if(i<6 && j<K){const q=i*(K+1)+j;pont.idx.push(q,q+K+1,q+1,q+1,q+K+1,q+K+2);}
      }
    }
    morceaux.push(pont,bras);
  }
  const faces=[];
  for(let k=0;k<torse.idx.length;k+=6) {
    // Le tube range ses deux triangles par cellule, puis ses bouchons.
    const cellule=k/6,i=Math.floor(cellule/N),j=cellule%N;
    if(i>=bas && i<haut && trous.some(t=>j>=t.j0 && j<t.j1)) continue;
    faces.push(...torse.idx.slice(k,k+6));
  }
  torse.idx=faces;
  return morceaux;
}

// Plis de coupe : arête repassée sur les jambes, cassure sur le soulier,
// compression au coude. 2 à 4 mm, visibles dans la silhouette, pas du bruit.
const pliManche = (a, y) => 1 + .045 * Math.exp(-(((y - 1.125) / .085) ** 2))
  * Math.sin((y - 1.11) * 95 + Math.cos(a) * 2) + .018 * Math.cos(a * 4);
const pliPantalon = (a, y) => 1 + .065 * Math.pow(Math.abs(Math.cos(a)), 18)
  + .055 * Math.exp(-(((y - .155) / .04) ** 2)) * Math.sin(y * 130 + Math.sin(a) * 2)
  + .026 * Math.exp(-(((y - .455) / .065) ** 2)) * Math.sin(y * 95 + a);

// Coupe continue à raie latérale : le volume coiffé se fond dans les
// tempes. Les sillons sont sculptés dans la surface, sans rubans flottants.
function chevelure() {
  const pos=[],uv=[],idx=[],si=[],sw=[],N=64,K=22;
  for(let i=0;i<=K;i++) {
    const t=i/K;
    for(let j=0;j<=N;j++) {
      const a=j/N*Math.PI*2,face=Math.max(0,Math.cos(a));
      const bord=1.599+.022*Math.abs(Math.sin(a))+.103*lisse(clamp01((Math.cos(a)+.05)/.65))
        +.011*Math.sin(a)*face;
      const y=1.790-(1.790-bord)*t;
      const s=profil(CHAINE_TETE,y);
      const couronne=Math.sqrt(Math.max(0,1-((y-1.685)/.105)**2));
      const dessus=y>1.70;
      const relief=(.001+.002*Math.cos(a*20+t*4)*Math.sin(Math.PI*t));
      const rx=dessus?.094*couronne:s.r[0]+.002;
      const rz=dessus?.090*couronne:s.r[1]+.002;
      const rb=dessus?.104*couronne:s.rzB+.002;
      const [x,z]=section(a,Math.max(0,rx+relief*Math.sin(Math.PI*t)),
        Math.max(0,rz+relief*Math.sin(Math.PI*t)),Math.max(0,rb+relief*Math.sin(Math.PI*t)),s.exp);
      pos.push(x-.008*(1-t)**2,y,s.p[2]+z);uv.push(j/N*.55,t*.27);
      si.push(INDEX.get('tete'),0,0,0);sw.push(1,0,0,0);
      if(i<K && j<N){const q=i*(N+1)+j;idx.push(q,q+N+1,q+1,q+1,q+N+1,q+N+2);}
    }
  }
  return {pos,uv,idx,si,sw};
}

// ------------------------------------------------------------
//  Assemblage et cache
// ------------------------------------------------------------
let CACHE = null;

// Les surfaces partagent le même squelette mais pas le même matériau :
// haut de vêtement, bas de vêtement, peau nue, cheveux, veste.
export function geometriesCorps() {
  if (CACHE) return CACHE;
  CACHE = {
    haut: assembler([
      ...habit(CHAINE_TORSE, chaineBras),
      ...colChemise(),
      patteChemise(),
    ]),
    bas: assembler([
      tube(CHAINE_BASSIN, { segments: 20, sousDiv: 3, capHaut: false, bombe: 0.35 }),
      tube(chaineJambe(-1), { segments: 20, sousDiv: 3, plis: pliPantalon }),
      tube(chaineJambe(1), { segments: 20, sousDiv: 3, plis: pliPantalon }),
    ]),
    // La tête fait partie de la surface de peau : le cou et le visage
    // sont continus, il n'y a plus de raccord visible.
    peau: assembler([
      tube(CHAINE_COU, { segments: 16, sousDiv: 2, capHaut: false }),
      tube(CHAINE_TETE, { segments: 48, sousDiv: 4, capHaut: false }),
      tube(CHAINE_NEZ, { segments: 10, sousDiv: 2 }),
      tube(chaineMain(-1), { segments: 12, sousDiv: 3 }),
      tube(chaineMain(1), { segments: 12, sousDiv: 3 }),
    ]),

    veste: assembler([
      ...habit(CHAINE_VESTE, chaineManche, true),
      revers(-1), revers(1),
      colVeste(),
    ]),

    // Pas de cravate ici : elle est rigide sur `buste` (voir
    // geometrieAccessoire), donc elle n'a pas besoin d'être skinnée.
    cheveux: assembler([chevelure()]),

  };
  // Sous la veste, seuls le plastron, le col et les manchettes sont utiles.
  // Retirer les manches internes évite leur traversée aux fortes flexions et
  // réduit les triangles dessinés, sans ajouter de maillage ni de matériau.
  CACHE.hautHabille = CACHE.haut.clone();
  const hp = CACHE.haut.attributes.position, hi = CACHE.haut.index.array, visibles = [];
  for (let i=0;i<hi.length;i+=3) {
    const ids=[hi[i],hi[i+1],hi[i+2]];
    const x=ids.reduce((v,k)=>v+hp.getX(k),0)/3;
    const y=ids.reduce((v,k)=>v+hp.getY(k),0)/3;
    const z=ids.reduce((v,k)=>v+hp.getZ(k),0)/3;
    if ((Math.abs(x)>.17 && y<.901) || y>1.480 || (Math.abs(x)<.110 && y>1.105 && z>0)) visibles.push(...ids);
  }
  CACHE.hautHabille.setIndex(visibles);
  const peau = CACHE.peau, positions = peau.attributes.position;
  const couleurs = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const joue = z > 0.035 ? Math.exp(-(((Math.abs(x) - 0.052) / 0.026) ** 2)
      - ((y - 1.610) / 0.021) ** 2) : 0;
    const machoire = z > 0.03 ? Math.exp(-(((y - 1.570) / 0.025) ** 2)) * 0.035 : 0;
    couleurs.push(1 - machoire, 1 - joue * 0.10 - machoire, 1 - joue * 0.12 - machoire);
  }
  peau.setAttribute('color', new THREE.Float32BufferAttribute(couleurs, 3));
  for (const geo of Object.values(CACHE)) partager(geo);
  return CACHE;
}

// Accessoires dont la forme dépend du vêtement du dessus.
//
// Tous portent un SEUL os (`racine` pour la ceinture, `buste` pour les
// autres) : ce sont donc des pièces RIGIDES, pas des surfaces skinnées.
// La distinction n'est pas cosmétique — quatre SkinnedMesh de plus par
// personnage, c'est quatre appels de dessin de plus par personnage et
// autant dans la passe d'ombre, sur un jeu déjà limité par les appels
// (§5.1). En rigide, fusionnerParPivot les regroupe avec les autres
// pièces du même pivot qui partagent leur matériau.
//
// Les chaînes sont écrites en coordonnées monde de la pose de repos ;
// `racine` et `buste` sont tous deux à y = 0,85, d'où la translation.
const ACCESSOIRES = new Map();
export function geometrieAccessoire(nom, veste) {
  const cle = `${nom}|${veste ? 'v' : 'c'}`;
  let g = ACCESSOIRES.get(cle);
  if (g) return g;
  const chaine = veste ? CHAINE_VESTE : CHAINE_TORSE;
  if (nom === 'cravate') {
    g = assembler([cravate()]);
  } else if (nom === 'sangles') {
    // le dôme qui ferme le haut de la manche : c'est ce que la sangle enjambe
    const ring = veste ? chaineManche(1)[0] : chaineBras(1)[0];
    g = assembler(sangles(chaine, { cx: ring.p[0], cy: ring.p[1], r: ring.r[0] }));
  } else if (nom === 'cordon') {
    g = assembler(cordon(chaine, 0.009));
  } else if (nom === 'ceinture') {
    g = assembler([ceintureRuban()]);
  }
  g.deleteAttribute('skinIndex');
  g.deleteAttribute('skinWeight');
  g.translate(0, -MONDE.get('buste')[1], 0);
  ACCESSOIRES.set(cle, partager(g));
  return g;
}

// ------------------------------------------------------------
//  Repères pour poser les pièces rigides au bon endroit
// ------------------------------------------------------------

// Position de repos d'un os.
export function reposMonde(nom) { return MONDE.get(nom); }

const TETE_Y = MONDE.get('tete')[1];
const BUSTE_Y = MONDE.get('buste')[1];

// Point de la surface du visage, en coordonnées locales de la tête,
// à l'abscisse x et à la hauteur y (locales), poussé de `decal`.
export function surfaceTete(yLocal, xLocal, decal = 0) {
  const s = surX(CHAINE_TETE, yLocal + TETE_Y, xLocal, 1, decal);
  return { p: [s.p[0], s.p[1] - TETE_Y, s.p[2]], n: s.n };
}

// Point de la surface du bassin (pantalon), en coordonnées du buste :
// c'est là que se posent la boucle de ceinture et les passants.
export function surfaceBassin(yLocal, x, decal = 0) {
  const s = surX(CHAINE_BASSIN, yLocal + BUSTE_Y, x, 1, decal);
  return { p: [s.p[0], s.p[1] - BUSTE_Y, s.p[2]], n: s.n };
}

// Idem sur le torse (chemise) ou la veste, en coordonnées du buste.
export function surfaceBuste(yLocal, x, { veste = false, cote = 1, decal = 0 } = {}) {
  const s = surfaceHabillee(veste ? CHAINE_VESTE : CHAINE_TORSE, yLocal + BUSTE_Y, x, cote, decal);
  return { p: [s.p[0], s.p[1] - BUSTE_Y, s.p[2]], n: s.n };
}

// Où se ferme la veste (hauteur du bouton), en coordonnées du buste.
export const BOUTON_VESTE_LOCAL = BOUTON_VESTE - BUSTE_Y;

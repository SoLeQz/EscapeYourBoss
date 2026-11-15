// Matières « Méridien v02 » : cartes PBR calculées, sans Blender ni image source.
//
//   npm run textures            → assets/mat-<nom>-v02-{color,normal,rough}.png
//   npm run textures -- bois    → une seule famille
//
// Pourquoi une v02 : mesurées, les cartes v01 étaient des aplats (écart type de
// couleur 0,8 à 2,6 %, normales à 0,2 %). Elles avaient été « calmées » jusqu'à ne
// plus rien porter. Ici chaque matière a un motif construit à son échelle réelle
// (boucles de moquette, fils du tissu, éclats du terrazzo) et tout se raccorde
// bord à bord par construction : bruits périodiques, motifs en nombre entier.
// Les hauteurs sont en pixels : la pente de la normale est donc physique.
import { writeFileSync } from 'node:fs';
import { ecrirePNG8 } from '../blender/png.mjs';

const hash = (x, y, s) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const mod = (a, b) => ((a % b) + b) % b;
const lisse = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;
const borne = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const palier = (a, b, v) => lisse(borne((v - a) / (b - a)));
const teinte = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const gris = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Bruit de valeur périodique : Pu × Pv cellules par tuile, donc raccord exact.
function bruit(u, v, Pu, Pv, s) {
  const x = u * Pu, y = v * Pv, xi = Math.floor(x), yi = Math.floor(y), sx = lisse(x - xi), sy = lisse(y - yi);
  const x0 = mod(xi, Pu), x1 = mod(xi + 1, Pu), y0 = mod(yi, Pv), y1 = mod(yi + 1, Pv);
  return mix(mix(hash(x0, y0, s), hash(x1, y0, s), sx), mix(hash(x0, y1, s), hash(x1, y1, s), sx), sy);
}
function fbm(u, v, Pu, Pv, oct, s) {
  let a = 0.5, somme = 0, n = 0;
  for (let i = 0; i < oct; i++) { somme += a * bruit(u, v, Pu << i, Pv << i, s + i * 17); n += a; a *= 0.5; }
  return somme / n;
}
// Cellules de Worley périodiques : distances aux deux germes les plus proches
// (en cellules) et identité aléatoire de la cellule.
function cellules(u, v, P, s) {
  const x = u * P, y = v * P, xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = mod(xi + i, P), cy = mod(yi + j, P);
    const d = Math.hypot(xi + i + 0.15 + hash(cx, cy, s) * 0.7 - x, yi + j + 0.15 + hash(cx, cy, s + 1) * 0.7 - y);
    if (d < d1) { d2 = d1; d1 = d; id = hash(cx, cy, s + 2); } else if (d < d2) d2 = d;
  }
  return { d1, d2, id };
}

// peindre(x, y, u, v) → { c: [r,g,b] sRGB, h: hauteur en px, r: rugosité }
function matiere(nom, S, peindre, { sansCouleur = false, sansRugosite = false } = {}) {
  const C = new Float32Array(S * S * 3), H = new Float32Array(S * S), R = new Float32Array(S * S * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const p = peindre(x, y, x / S, y / S), i = y * S + x;
    if (p.c) C.set(p.c, i * 3);
    H[i] = p.h; R[i * 3] = R[i * 3 + 1] = R[i * 3 + 2] = p.r ?? 1;
  }
  const N = new Float32Array(S * S * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const at = (xx, yy) => H[mod(yy, S) * S + mod(xx, S)];
    let gx = (at(x + 1, y) - at(x - 1, y)) / 2, gy = (at(x, y + 1) - at(x, y - 1)) / 2;
    // Pente bornée : la normale reste à plus de 0,8 en Z (contrôlé par test:textures).
    const g = Math.hypot(gx, gy); if (g > 0.6) { gx *= 0.6 / g; gy *= 0.6 / g; }
    // Image lue du haut vers le bas, V vers le haut : le vert suit +gy.
    const l = Math.hypot(gx, gy, 1), i = (y * S + x) * 3;
    N[i] = 0.5 - 0.5 * gx / l; N[i + 1] = 0.5 + 0.5 * gy / l; N[i + 2] = 0.5 + 0.5 / l;
  }
  const ecrire = (suffixe, rgb) => {
    const png = ecrirePNG8({ width: S, height: S, rgb });
    writeFileSync(new URL(`../../assets/mat-${nom}-v02-${suffixe}.png`, import.meta.url), png);
    return (png.length / 1024).toFixed(0) + ' Ko';
  };
  console.log(nom.padEnd(9), S, sansCouleur ? '' : 'couleur ' + ecrire('color', C), 'normale ' + ecrire('normal', N),
    sansRugosite ? '' : 'rugosité ' + ecrire('rough', R));
}

const FAMILLES = {
  // Dalles de 50 cm posées en quart de tour, velours bouclé à rangs de 4 mm.
  // Des bandes de fils clairs et sombres courent dans le sens de chaque dalle :
  // c'est ce damier de lignes qui donne l'échelle du plateau à distance.
  // Carte neutre : la couleur du service vient de material.color.
  moquette: () => matiere('moquette', 1024, (x, y) => {
    const tx = x >> 9, ty = y >> 9, tourne = (tx + ty) & 1, id = tx + ty * 2, lx = x & 511, ly = y & 511;
    const a = tourne ? ly : lx, b = tourne ? lx : ly, rang = b >> 2;
    const bande = bruit(rang / 128, 0, 7, 1, id * 31 + 1) * 0.6 + bruit(rang / 128, 0, 29, 1, id * 31 + 2) * 0.4;
    const pas = (a + hash(rang, id, 5) * 6) / 6, boucle = Math.floor(pas), cle = rang + id * 977;
    const hb = hash(boucle, cle, 7), fibre = hash(x, y, 9);
    const dome = Math.sin(Math.PI * (pas - boucle)) ** 0.7 * Math.sin(Math.PI * ((b & 3) / 4 + 0.125)) ** 0.6 * (0.7 + 0.3 * hb);
    const f = borne(0.5 + (bande - 0.5) * 1.15 + (hash(rang, id, 3) - 0.5) * 0.5 + (hb - 0.5) * 0.4);
    let c = f < 0.5 ? teinte([0.66, 0.675, 0.69], [0.76, 0.76, 0.75], f * 2) : teinte([0.76, 0.76, 0.75], [0.87, 0.86, 0.83], f * 2 - 1);
    if (hash(boucle, cle, 11) < 0.012) c = [0.95, 0.91, 0.80];          // fil d'accent
    const bord = Math.min(lx, 511 - lx, ly, 511 - ly), joint = bord < 1 ? 0.66 : bord < 2 ? 0.86 : 1;
    const k = (0.76 + 0.24 * dome + (fibre - 0.5) * 0.07) * joint * (tourne ? 1.025 : 0.975);
    return { c: gris(c, k), h: (dome * 2.4 + fibre * 0.5) * (bord < 2 ? 0.3 : 1) };
  }, { sansRugosite: true }),

  // Toile de laine deux tons, fil de 3 mm : chaîne claire, trame plus sombre.
  // Les fils irréguliers (flammés) évitent l'effet de grille parfaite.
  textile: () => matiere('textile', 512, (x, y, u, v) => {
    const i = x >> 2, j = y >> 2, sx = Math.sin(Math.PI * ((x & 3) / 4 + 0.125)), sy = Math.sin(Math.PI * ((y & 3) / 4 + 0.125));
    const dessus = (i + j) & 1, poil = hash(x, y, 13);
    const ton = dessus
      ? 0.93 + (hash(i, 0, 3) - 0.5) * 0.10 + (bruit(u, v, 128, 5, 21) - 0.5) * 0.12
      : 0.72 + (hash(0, j, 5) - 0.5) * 0.14 + (bruit(u, v, 5, 128, 23) - 0.5) * 0.14;
    const h = dessus ? sx ** 0.8 * (0.55 + 0.45 * sy) : sy ** 0.8 * (0.55 + 0.45 * sx);
    const k = ton * (0.80 + 0.20 * h) + (poil - 0.5) * 0.05;
    return { c: [k, k * 0.995, k * 0.975], h: h * 1.7 + poil * 0.35, r: 0.97 - h * 0.09 };
  }),

  // Placage de chêne, fil dans le sens U. Cernes à bord net (bois d'été), pores
  // ouverts dans le bois de printemps, mailles claires et dérive lente du fil.
  bois: () => matiere('bois', 1024, (x, y, u, v) => {
    const K = 96, derive = fbm(u, v, 2, 5, 3, 11);
    const r = K * (v + (bruit(0.5, v, 1, 7, 9) - 0.5) * 0.045) + (derive - 0.5) * 4.5 + (bruit(u, v, 7, 3, 5) - 0.5) * 0.9;
    const k = Math.floor(r), f = r - k;
    const tardif = palier(0.55, 0.92, f) * (1 - palier(0.92, 1, f)) * (0.35 + 0.65 * hash(mod(k, K), 0, 7));
    const pore = palier(0.72, 0.78, bruit(u, v, 110, 512, 23)) * (1 - palier(0.25, 0.55, f));
    const maille = palier(0.80, 0.90, bruit(u, v, 34, 170, 31));
    const fibre = bruit(u, v, 10, 512, 37), ton = fbm(u, v, 3, 3, 3, 41), veine = bruit(u, v, 2, 30, 43);
    const d = borne(0.16 + tardif * 0.30 + pore * 0.42 - maille * 0.12 - (ton - 0.5) * 0.40 - (veine - 0.5) * 0.34 + (fibre - 0.5) * 0.26);
    return { c: teinte([0.835, 0.715, 0.545], [0.47, 0.335, 0.215], d),
      h: -tardif * 0.55 - pore * 1.3 + fibre * 0.3,
      r: 0.52 + pore * 0.14 + tardif * 0.05 - maille * 0.06 + (fibre - 0.5) * 0.05 };
  }),

  // Terrazzo à la vénitienne : trois calibres d'éclats de marbre dans un liant
  // crème. Palette reprise de la signalétique (ocre, terre cuite, pétrole).
  pierre: () => {
    const palette = [[0.34, [0.96, 0.94, 0.89]], [0.66, [0.66, 0.64, 0.61]], [0.75, [0.33, 0.33, 0.34]],
      [0.86, [0.80, 0.65, 0.42]], [0.93, [0.70, 0.47, 0.38]], [1.01, [0.46, 0.56, 0.53]]];
    const calibres = [[30, 0.22, 0.17, 101], [72, 0.34, 0.20, 211], [170, 0.50, 0.22, 307]];   // cellules, densité, marge, graine
    matiere('pierre', 1024, (x, y, u, v) => {
      const sable = hash(x, y, 3), nuage = fbm(u, v, 4, 4, 3, 5);
      let c = gris([0.875, 0.855, 0.805], 0.97 + (sable - 0.5) * 0.05 + (nuage - 0.5) * 0.05), r = 0.56 + (sable - 0.5) * 0.06, h = sable * 0.25;
      for (let n = calibres.length - 1; n >= 0; n--) {
        const [P, densite, marge, s] = calibres[n], { d1, d2, id } = cellules(u, v, P, s);
        if (id > densite) continue;
        // éclat = cœur de cellule, à bords francs ; lissé sur un pixel
        const px = 1024 / P, couv = borne(((d2 - d1) - marge - (id / densite) * 0.16) * px + 0.5) * borne((0.62 - d1) * px + 0.5);
        if (couv <= 0) continue;
        const choix = hash(Math.floor(id * 1e6), n, 9), marbre = palette.find(p => choix < p[0])[1];
        const veine = 0.93 + bruit(u, v, P * 2, P * 2, s + 5) * 0.12;
        c = teinte(c, gris(marbre, veine), couv); r = mix(r, 0.43, couv); h = mix(h, 0.4, couv);
      }
      return { c, h, r };
    });
  },

  // Béton banché : nuages de laitance, bullage, coulures, joints de banche à la
  // tuile (1,5 m) et quatre trous d'entretoise par panneau.
  beton: () => matiere('beton', 512, (x, y, u, v) => {
    const nuage = fbm(u, v, 3, 3, 4, 7), grain = hash(x, y, 3), coulure = bruit(u, v, 46, 2, 13), { d1, id } = cellules(u, v, 54, 19);
    const bulle = id < 0.24 ? borne((0.06 + id * 0.9 - d1) * 9) : 0;
    const dj = Math.min(x, 511 - x, y, 511 - y), joint = 1 - palier(0.5, 2.5, dj);
    const trou = 1 - palier(3.5, 5, Math.hypot(Math.abs(x - 256) - 128, Math.abs(y - 256) - 128));
    const creux = Math.max(bulle, joint * 0.7, trou);
    const k = 0.93 + (nuage - 0.5) * 0.26 + (coulure - 0.5) * 0.05 + (grain - 0.5) * 0.035 - creux * 0.30;
    return { c: [0.735 * k, 0.725 * k, 0.69 * k], h: grain * 0.35 + nuage * 0.8 - creux * 2.2, r: 0.84 + (nuage - 0.5) * 0.14 + creux * 0.08 };
  }),

  // Métal brossé dans le sens U : stries longues à trois finesses.
  metal: () => matiere('metal', 512, (x, y, u, v) => {
    const s = bruit(u, v, 2, 96, 3) * 0.35 + bruit(u, v, 5, 256, 5) * 0.35 + bruit(u, v, 3, 512, 7) * 0.30;
    return { h: s * 1.1, r: 0.40 + s * 0.22 };
  }, { sansCouleur: true }),

  // Cuir grainé : petits dômes séparés par des plis.
  cuir: () => matiere('cuir', 512, (x, y, u, v) => {
    const { d1, d2, id } = cellules(u, v, 104, 3), pli = palier(0.02, 0.34, d2 - d1), fin = hash(x, y, 5);
    return { h: pli * (0.8 + 0.5 * id) * 1.5 + fin * 0.2, r: 0.60 - pli * 0.16 + (fin - 0.5) * 0.04 };
  }, { sansCouleur: true }),

  // Peinture murale au rouleau : peau d'orange, passes verticales et légères
  // nuances de teinte. Carte presque blanche : la couleur vient du service.
  enduit: () => matiere('enduit', 512, (x, y, u, v) => {
    const peau = fbm(u, v, 72, 72, 3, 3), passe = bruit(u, v, 22, 2, 7), nuage = fbm(u, v, 3, 3, 3, 11);
    const k = 0.955 + (nuage - 0.5) * 0.05 + (passe - 0.5) * 0.022 + (peau - 0.5) * 0.03;
    return { c: [k, k, k * 0.995], h: peau * 2.2 + passe * 0.4 };
  }, { sansRugosite: true }),

  // Faux plafond : dalles minérales fissurées de 60 cm dans une ossature en T
  // de 24 mm. La tuile couvre 2 × 2 dalles, chacune avec sa nuance.
  plafond: () => matiere('plafond', 512, (x, y, u, v) => {
    const lx = x & 255, ly = y & 255, bord = Math.min(lx, 255 - lx, ly, 255 - ly), dalle = hash(x >> 8, y >> 8, 3);
    if (bord < 5) return { c: [0.95, 0.95, 0.94], h: 1.6 };
    const grain = hash(x, y, 5), { d1, id } = cellules(u, v, 120, 7);
    const fissure = Math.max(palier(0.83, 0.89, bruit(u, v, 170, 44, 11)), palier(0.85, 0.91, bruit(u, v, 44, 170, 13)));
    const creux = Math.max(fissure, id < 0.3 ? borne((0.05 + id * 0.5 - d1) * 8) : 0);
    const k = (0.915 + (dalle - 0.5) * 0.035 + (grain - 0.5) * 0.03 - creux * 0.20) * (bord < 7 ? 0.82 : 1);
    return { c: [k, k, k * 0.985], h: grain * 0.3 - creux * 1.8 };
  }, { sansRugosite: true }),
};

const demande = process.argv.slice(2);
for (const [nom, generer] of Object.entries(FAMILLES)) if (!demande.length || demande.includes(nom)) generer();

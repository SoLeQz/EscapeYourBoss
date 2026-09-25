import { texturesBlender, reglerFiltrageBlender } from './textures-blender.js';
import * as THREE from 'three';

// ============================================================
//  Matériaux PBR procéduraux.
//
//  Décor : cartes PBR cuites dans Blender, partagées entre les variantes.
//  Personnages et graphismes : textures canvas. Les générateurs historiques
//  du décor servent aux tests de référence sans préchargement Blender.
// ============================================================

// --- bruit tuilable (value noise + fbm) ---
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
// Chemin rapide : les coordonnées sont positives dans 99 % des appels,
// et un double modulo par échantillon de bruit coûte cher à ce volume.
const wrap = (a, b) => (a >= 0 ? a % b : ((a % b) + b) % b);

function vnoise(u, v, P, s) {
  const x = u * P, y = v * P;
  const xi = x | 0, yi = y | 0;
  const xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const x0 = wrap(xi, P), x1 = wrap(xi + 1, P);
  const y0 = wrap(yi, P), y1 = wrap(yi + 1, P);
  const a = hash(x0, y0, s), b = hash(x1, y0, s);
  const c = hash(x0, y1, s), d = hash(x1, y1, s);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

// Bruit anisotrope : périodes différentes en u et v. Sert aux mèches de
// cheveux et aux plis de tissu, qui ont une direction privilégiée.
function vnoiseAniso(u, v, Pu, Pv, s) {
  const x = u * Pu, y = v * Pv;
  const xi = x | 0, yi = y | 0;
  const xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const a = hash(wrap(xi, Pu), wrap(yi, Pv), s), b = hash(wrap(xi + 1, Pu), wrap(yi, Pv), s);
  const c = hash(wrap(xi, Pu), wrap(yi + 1, Pv), s), d = hash(wrap(xi + 1, Pu), wrap(yi + 1, Pv), s);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

function fbmAniso(u, v, Pu, Pv, oct, s) {
  let amp = 0.5, sum = 0, norm = 0, pu = Pu, pv = Pv;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoiseAniso(u, v, Math.max(2, Math.round(pu)), Math.max(2, Math.round(pv)), s + i * 17);
    norm += amp; amp *= 0.5; pu *= 2; pv *= 2;
  }
  return sum / norm;
}

// Champ basse fréquence : calculé à résolution réduite puis interpolé.
// Un fbm de période 5 sur une texture de 768 px ne porte aucun détail
// fin — l'évaluer pixel par pixel est du gaspillage pur.
function champLent(S, div, fn) {
  const s = Math.max(8, Math.round(S / div));
  const petit = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++)
    petit[y * s + x] = fn(x / s, y / s);
  return (u, v) => {
    const x = u * s, y = v * s;
    const x0 = x | 0, y0 = y | 0;
    const fx = x - x0, fy = y - y0;
    const x1 = (x0 + 1) % s, y1 = (y0 + 1) % s;
    const a = petit[y0 * s + x0], b = petit[y0 * s + x1];
    const c = petit[y1 * s + x0], d = petit[y1 * s + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}

function fbm(u, v, P, oct, s) {
  let amp = 0.5, sum = 0, norm = 0, p = P;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(u, v, p, s + i * 17);
    norm += amp; amp *= 0.5; p *= 2;
  }
  return sum / norm;
}

// --- fabrique de textures ---
let ANISO = 8;
export function setAnisotropy(a) { ANISO = a; reglerFiltrageBlender(a); }

// Multiplicateur de résolution des textures. Générer plus grand coûte du
// temps de chargement, pas des images par seconde : un choix qui n'a de
// sens que pour un exécutable, où l'on peut se permettre deux secondes
// de plus au démarrage.
let MULT = 1;
export function setTextureScale(m) { MULT = m; }
const taille = (base) => Math.min(1024, Math.round(base * MULT / 64) * 64);

function canvasTex(size, writer, srgb, repeat) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  writer(img.data, size);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = ANISO;
  t.needsUpdate = true;
  return t;
}

// height : Float32Array(size*size) → normal map tangente
function normalMapFrom(height, size, strength, repeat) {
  return canvasTex(size, (d) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const at = (xx, yy) => height[wrap(yy, size) * size + wrap(xx, size)];
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        let nx = -dx, ny = -dy, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        const i = (y * size + x) * 4;
        d[i] = (nx * 0.5 + 0.5) * 255;
        d[i + 1] = (ny * 0.5 + 0.5) * 255;
        d[i + 2] = (nz * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
  }, false, repeat);
}

// Float32Array → canal gris (roughness / métal / AO)
function grayTex(field, size, lo, hi, repeat) {
  return canvasTex(size, (d) => {
    for (let i = 0; i < size * size; i++) {
      const v = Math.round(255 * (lo + (hi - lo) * field[i]));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
  }, false, repeat);
}

function colorTex(size, fn, repeat) {
  return canvasTex(size, (d, s) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const c = fn(x / s, y / s, x, y);
      const i = (y * s + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }, true, repeat);
}

const mix = (a, b, t) => a + (b - a) * t;
const rgb = (r, g, b) => [r * 255, g * 255, b * 255];

// ============================================================
//  Matières
// ============================================================

// Dalles textiles de 50 cm : grain serré, teinte pétrole et joints discrets.
// Pas de bruit à grande échelle : il donnait au sol un aspect taché/marbré.
function carpet(repeat) {
  const S = taille(256), H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const fibre = hash(x, y, 19);
    const sens = ((u * 2 | 0) + (v * 2 | 0)) % 2;
    const fil = Math.sin((sens ? x : y) * 1.6) * 0.08;
    const joint = Math.min(wrap(u * 2, 1), wrap(v * 2, 1)) < 0.008;
    H[y * S + x] = joint ? 0.2 : 0.48 + fibre * 0.16 + fil;
  }
  return {
    map: colorTex(S, (u, v, x, y) => {
      const k = 0.94 + H[y * S + x] * 0.12;
      const dalle = ((u * 2 | 0) + (v * 2 | 0)) % 2 ? 1.015 : 0.985;
      return rgb(0.255 * k * dalle, 0.345 * k * dalle, 0.345 * k * dalle);
    }, repeat),
    normalMap: normalMapFrom(H, S, 0.65, repeat),
    roughnessMap: grayTex(H, S, 0.90, 1, repeat),
  };
}

// Terrazzo clair : petits agrégats mats, sans grosses veines ni vernis.
// La géométrie fournit des UV métriques : une tuile couvre deux mètres.
function stoneFloor(repeat) {
  const S = taille(256), H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++)
    H[y * S + x] = hash(x >> 1, y >> 1, 76);
  return {
    map: colorTex(S, (u, v, x, y) => {
      const h = H[y * S + x];
      const grain = h > 0.975 ? -0.15 : h < 0.025 ? 0.07 : (h - 0.5) * 0.025;
      const joint = Math.min(u, v) < 0.0015 ? -0.05 : 0;
      return rgb(0.76 + grain + joint, 0.74 + grain + joint, 0.68 + grain + joint);
    }, repeat),
    normalMap: normalMapFrom(H, S, 0.12, repeat),
    roughnessMap: grayTex(H, S, 0.64, 0.78, repeat),
  };
}

// Chêne à fil longitudinal. Une petite dérive du fil suffit ; les anciens
// cernes multidirectionnels donnaient un motif de labyrinthe aux plateaux.
function wood(repeat, tint = [0.80, 0.63, 0.42]) {
  const S = taille(256), H = new Float32Array(S * S);
  const ondulation = champLent(S, 8, (u, v) => fbmAniso(u, v, 2, 5, 2, 3));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const fil = v + (ondulation(u, v) - 0.5) * 0.025;
    const veine = Math.pow(0.5 + 0.5 * Math.sin(fil * Math.PI * 64), 12);
    H[y * S + x] = 0.5 - veine * 0.16 + (hash(x, y, 41) - 0.5) * 0.045;
  }
  return {
    map: colorTex(S, (u, v, x, y) => {
      const k = 0.88 + H[y * S + x] * 0.22;
      return rgb(tint[0] * k, tint[1] * k, tint[2] * k);
    }, repeat),
    normalMap: normalMapFrom(H, S, 0.35, repeat),
    roughnessMap: grayTex(H, S, 0.66, 0.75, repeat),
  };
}

// Peau : marbrures lentes, pores fins, brillance inégale.
//
// Une couleur strictement uniforme, c'est exactement ce qui donne
// l'aspect pâte à modeler. La carte reste neutre (moyenne 0,88) :
// la carnation vient de material.color.
function skin(repeat) {
  const S = taille(512), H = new Float32Array(S * S), R = new Float32Array(S * S);
  const T = new Float32Array(S * S);   // marbrures, réutilisées en passe couleur
  const tachesLentes = champLent(S, 8, (u, v) => fbm(u, v, 9, 4, 29));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const pores = fbm(u, v, 190, 3, 71);
    const grain = vnoise(u, v, 380, 83);
    const taches = tachesLentes(u, v);           // plaques de rougeur
    const i = y * S + x;
    H[i] = pores * 0.62 + grain * 0.38;
    T[i] = taches;
    // le front et le nez brillent, les joues sont mates
    R[i] = 0.24 + taches * 0.44 + pores * 0.20;
  }
  const map = colorTex(S, (u, v, x, y) => {
    const i = y * S + x;
    const t = (T[i] - 0.5), p = (H[i] - 0.5);
    const l = 0.93 + p * 0.045;
    return rgb(
      Math.min(1, l * (1 + t * 0.085)),
      Math.min(1, l * (1 - t * 0.020)),
      Math.min(1, l * (1 - t * 0.055)));
  }, repeat);
  return {
    map,
    normalMap: normalMapFrom(H, S, 0.45, repeat),
    roughnessMap: grayTex(R, S, 0.30, 0.78, repeat),
  };
}

// Cheveux : mèches étirées dans le sens de l'implantation.
function hairTex(repeat) {
  const S = taille(256), H = new Float32Array(S * S), R = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    // Échelle réelle : sur la calotte, une tuile fait 30 cm. À 160 mèches
    // par tuile, chaque mèche mesurait 2 mm et se moyennait en aplat —
    // le même piège que le tissu à repeat 20. À 44 par tuile, les mèches
    // font 7 mm : c'est ce qui se lit comme des cheveux à 3 m.
    const meches = fbmAniso(u, v, 44, 5, 3, 13);
    const fin = vnoiseAniso(u, v, 130, 12, 31);
    const i = y * S + x;
    H[i] = meches * 0.70 + fin * 0.30;
    R[i] = H[i];
  }
  const map = colorTex(S, (u, v, x, y) => {
    const k = 0.74 + H[y * S + x] * 0.30;
    return rgb(Math.min(1, k), Math.min(1, k * 0.985), Math.min(1, k * 0.96));
  }, repeat);
  return {
    map,
    normalMap: normalMapFrom(H, S, 2.2, repeat),
    // les mèches accrochent la lumière : rugosité basse et très variable
    roughnessMap: grayTex(R, S, 0.66, 0.86, repeat),
  };
}

// Tissu : armure toile visible de près, mat
function fabric(repeat, tint = [0.32, 0.34, 0.38], plis = 0) {
  const S = taille(256), H = new Float32Array(S * S), C = new Float32Array(S * S);
  const k = S / 256;                      // l'armure garde sa taille réelle
  const usureLente = champLent(S, 6, (u, v) => fbm(u, v, 7, 3, 101));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const weave = (Math.floor(x / (2 * k)) + Math.floor(y / (2 * k))) % 2 ? 0.75 : 0.25;
    const fil = Math.sin((x / k) * 0.8) * 0.5 + 0.5;
    const bruit = fbm(u, v, 64, 3, 23);
    const i = y * S + x;
    H[i] = weave * 0.5 + fil * 0.2 + bruit * 0.3;
    // plis : ondulations larges, étirées dans un sens
    if (plis) {
      const f = fbmAniso(u, v, 5, 20, 4, 55);
      H[i] = H[i] * (1 - plis * 0.5) + f * plis * 0.5;
      C[i] = (f - 0.5);
    }
    // usure lente : le tissu n'est jamais uniforme
    C[i] += (usureLente(u, v) - 0.5) * 0.5;
  }
  const map = colorTex(S, (u, v, x, y) => {
    const i = y * S + x;
    const k = mix(0.84, 1.10, H[i]) * (1 + C[i] * 0.16);
    return rgb(Math.min(1, tint[0] * k), Math.min(1, tint[1] * k), Math.min(1, tint[2] * k));
  }, repeat);
  return {
    map,
    normalMap: normalMapFrom(H, S, plis ? 2.1 : 1.6, repeat),
    roughnessMap: grayTex(H, S, 0.74, 0.97, repeat),
  };
}

// Tissus de VÊTEMENT, à l'échelle réelle. Sur les personnages, 1 unité
// UV = 0,9 m de surface (body.js) : avec repeat 3, une tuile de 256 px
// couvre 30 cm, soit 1,2 mm par texel. Trois armures distinctes, parce
// que c'est le contraste entre elles qui fait lire « chemise » et
// « veste » au premier coup d'œil, pas la couleur :
//  - popeline : toile fine et serrée, plis courts, surface lisse
//  - serge    : côtes en diagonale (4,7 mm), poil de laine, plis amples
//  - flanelle : côtes plus fines et floues, beaucoup de poil
// L'ancien tissu avait un « fil » sinusoïdal vertical de 15 mm : c'est
// lui qui faisait lire la veste comme du velours côtelé en plastique.
function tissu(kind, repeat) {
  const S = taille(256), H = new Float32Array(S * S), R = new Float32Array(S * S);
  const C = new Float32Array(S * S);
  const k = S / 256;                      // l'armure garde sa taille réelle
  const cfg = {
    popeline: { cote: 0, toile: 2, pTissage: 0.28, pPlis: 0.56, pPoil: 0.16,
                plisU: 6, plisV: 13, rLo: 0.50, rHi: 0.74, chine: 0.03,
                contraste: 0.035 },
    serge:    { cote: 4, toile: 0, pTissage: 0.24, pPlis: 0.52, pPoil: 0.24,
                plisU: 4, plisV: 9, rLo: 0.76, rHi: 0.95, chine: 0.08,
                contraste: 0.045 },
    flanelle: { cote: 8, toile: 0, pTissage: 0.08, pPlis: 0.50, pPoil: 0.42,
                plisU: 3, plisV: 12, rLo: 0.82, rHi: 0.98, chine: 0.06,
                contraste: 0.035 },
  }[kind];
  const T = new Float32Array(S * S), PL = new Float32Array(S * S);
  const plisLent = champLent(S, 4, (u, v) => fbmAniso(u, v, cfg.plisU, cfg.plisV, 3, 55));
  const usureLente = champLent(S, 6, (u, v) => fbm(u, v, 5, 3, 101));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    let tissage;
    if (cfg.cote) {
      // sergé : côte diagonale à profil adouci
      const d = ((x + y) / k) / cfg.cote;
      tissage = 0.5 - 0.5 * Math.cos((d - Math.floor(d)) * Math.PI * 2);
    } else {
      // toile : damier fil dessus / fil dessous
      tissage = (Math.floor(x / (cfg.toile * k)) + Math.floor(y / (cfg.toile * k))) % 2 ? 0.8 : 0.2;
    }
    const poil = vnoise(u, v, 128, 23) * 0.6 + vnoise(u, v, 256, 29) * 0.4;
    const plis = plisLent(u, v);
    const i = y * S + x;
    T[i] = tissage; PL[i] = plis;
    H[i] = tissage * cfg.pTissage + plis * cfg.pPlis + poil * cfg.pPoil;
    R[i] = 0.5 * poil + 0.5 * tissage;
    // chiné et usure : un vêtement n'est jamais d'une teinte uniforme
    C[i] = (usureLente(u, v) - 0.5) * 0.10 + (poil - 0.5) * cfg.chine;
  }
  // Luminance seule : la couleur est portée par material.color.
  //
  // Le tissage et les plis entrent AUSSI dans la couleur, pas seulement
  // dans le relief. Mesure de l'ancienne version : écart type de 0,015
  // sur [0,1], autrement dit un aplat — la carte de couleur ne portait
  // rien, et le vêtement n'avait de matière que sous une lumière
  // rasante. Un fil qui passe dessus ne renvoie pas la même quantité de
  // lumière que celui qui passe dessous, même à plat.
  const map = colorTex(S, (u, v, x, y) => {
    const i = y * S + x;
    const l = Math.min(1, 0.86 * (1 + C[i])
      * mix(1 - cfg.contraste, 1 + cfg.contraste, T[i])
      * mix(0.90, 1.07, PL[i]));
    return rgb(l, l, l);
  }, repeat);
  // Occlusion des plis : les creux restent sombres même éclairés de
  // face. C'est ce qui donne du volume à un vêtement immobile.
  const AO = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) AO[i] = PL[i] * 0.75 + T[i] * 0.25;
  return {
    map,
    normalMap: normalMapFrom(H, S, cfg.cote === 4 ? 2.0 : 1.8, repeat),
    roughnessMap: grayTex(R, S, cfg.rLo, cfg.rHi, repeat),
    aoMap: grayTex(AO, S, 0.68, 1.0, repeat),
  };
}

// Soie de cravate : côtes fines en diagonale, et une rayure plus sombre
// en biais, comme une cravate club.
function soieTex(repeat) {
  const S = taille(256), H = new Float32Array(S * S), R = new Float32Array(S * S);
  const B = new Float32Array(S * S);
  const k = S / 256;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = ((x - y) / k) / 3;
    const cote = 0.5 - 0.5 * Math.cos((d - Math.floor(d)) * Math.PI * 2);
    const b = (((x + y) / k) % 40 + 40) % 40;
    const bande = b < 12 ? 1 : 0;
    const i = y * S + x;
    H[i] = cote * 0.7 + vnoise(x / S, y / S, 128, 41) * 0.3;
    B[i] = bande;
    R[i] = 0.5 * cote + 0.5 * bande;
  }
  const map = colorTex(S, (u, v, x, y) => {
    const i = y * S + x;
    const l = (0.96 - B[i] * 0.22) * (0.94 + H[i] * 0.06);
    return rgb(l, l, l);
  }, repeat);
  return {
    map,
    normalMap: normalMapFrom(H, S, 0.9, repeat),
    roughnessMap: grayTex(R, S, 0.26, 0.42, repeat),
  };
}

// Métal brossé : rayures anisotropes
function brushed(repeat) {
  const S = taille(256), H = new Float32Array(S * S), R = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const streak = vnoise(x / S, y / S, 220, 7) * 0.7 + vnoise(x / S, y / S, 40, 13) * 0.3;
    H[y * S + x] = streak;
    R[y * S + x] = streak;
  }
  return {
    normalMap: normalMapFrom(H, S, 0.55, repeat),
    roughnessMap: grayTex(R, S, 0.18, 0.45, repeat),
  };
}

// Peinture murale : très légère peau d'orange
function paint(repeat) {
  const S = taille(256), H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++)
    H[y * S + x] = fbm(x / S, y / S, 48, 4, 61);
  return {
    normalMap: normalMapFrom(H, S, 0.35, repeat),
    roughnessMap: grayTex(H, S, 0.82, 0.96, repeat),
  };
}

// Faux plafond calme, dalles de 60 cm. Les trous géants ont été supprimés.
function ceilingTile(repeat) {
  const S = taille(256), H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++)
    H[y * S + x] = x < 1 || y < 1 ? 0.25 : 0.93 + hash(x, y, 8) * 0.07;
  return {
    map: colorTex(S, (u, v, x, y) => {
      const k = 0.91 + H[y * S + x] * 0.09;
      return rgb(0.89 * k, 0.90 * k, 0.88 * k);
    }, repeat),
    normalMap: normalMapFrom(H, S, 0.15, repeat),
  };
}

// Écran allumé : faux IDE / tableur, sert de map émissive
export function screenContent(kind = 'code') {
  const W = 512, H = 320;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  if (kind === 'cafe' || kind === 'copie') {
    g.fillStyle='#142f30';g.fillRect(0,0,W,H);
    g.fillStyle='#b7d9c3';g.font='bold 36px Arial';g.fillText(kind==='cafe'?'CAFÉ / PRÊT':'COPIE / PRÊT',26,61);
    g.fillStyle='#d7a24d';g.fillRect(26,88,460,3);
    g.fillStyle='#e5eadb';g.font='25px Arial';
    g.fillText(kind==='cafe'?'01  ESPRESSO':'A4  RECTO / VERSO',26,150);
    g.fillText(kind==='cafe'?'02  ALLONGÉ':'PAPIER DISPONIBLE',26,202);
    g.fillStyle='#387263';g.fillRect(26,239,460,56);
    g.fillStyle='#fff3d8';g.font='bold 22px Arial';g.fillText(kind==='cafe'?'CHOISIR UNE BOISSON':'DÉMARRER',46,275);
  } else if (kind === 'code') {
    g.fillStyle = '#10151c'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0b0f14'; g.fillRect(0, 0, 46, H);
    g.fillStyle = '#1b2430'; g.fillRect(0, 0, W, 22);
    const cols = ['#7fd6c2', '#e5b567', '#9a86fd', '#e8e6e3', '#6b7d8f', '#e77c8e'];
    for (let i = 0; i < 26; i++) {
      const y = 32 + i * 11;
      g.fillStyle = '#41505f'; g.font = '9px monospace';
      g.fillText(String(i + 1).padStart(3), 8, y);
      let x = 52 + (i % 4) * 12;
      const n = 3 + ((i * 7) % 6);
      for (let k = 0; k < n; k++) {
        const w = 14 + ((i * 13 + k * 29) % 62);
        g.fillStyle = cols[(i + k) % cols.length];
        g.globalAlpha = 0.85;
        g.fillRect(x, y - 7, w, 6);
        x += w + 7;
        if (x > W - 30) break;
      }
    }
    g.globalAlpha = 1;
  } else if (kind === 'sheet') {
    g.fillStyle = '#f4f5f7'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1f6f43'; g.fillRect(0, 0, W, 20);
    g.strokeStyle = '#d3d8de'; g.lineWidth = 1;
    for (let c = 0; c <= 9; c++) { g.beginPath(); g.moveTo(c * 56 + 4, 20); g.lineTo(c * 56 + 4, H); g.stroke(); }
    for (let r = 0; r <= 18; r++) { g.beginPath(); g.moveTo(0, 22 + r * 16); g.lineTo(W, 22 + r * 16); g.stroke(); }
    for (let r = 0; r < 17; r++) for (let c = 0; c < 9; c++) {
      if ((r * 9 + c) % 3 === 0) continue;
      g.fillStyle = (r + c) % 7 === 0 ? '#c0392b' : '#4a545f';
      g.fillRect(c * 56 + 10, 28 + r * 16, 20 + ((r * c) % 26), 7);
    }
  } else {
    g.fillStyle = '#1d2430'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2b3646'; g.fillRect(20, 20, W - 40, 40);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = ['#5b7cfa', '#38bdf8', '#34d399', '#fbbf24'][i % 4];
      const h = 30 + ((i * 41) % 150);
      g.fillRect(40 + i * 50, H - 30 - h, 30, h);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}

// Ciel de fin de journée, écrit directement en valeurs LINÉAIRES.
//
// Sky.js applique sa propre courbe puis se fait tone-mapper une
// seconde fois : le résultat sature en blanc. Ici on peint le
// dégradé qu'on veut et on laisse ACES faire son travail une fois.
// Aucune valeur ne doit dépasser SKY_SCALE : le canvas est en 8 bits,
// ce qui clippe, et un canal rouge saturé face à un vert élevé donne du
// blanc — qu'ACES désature encore. Maximum atteint ici : 2,90.
export const SKY_SCALE = 3.0;

export function skyTexture(sunDir) {
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;

  // paliers d'élévation, en linéaire
  const paliers = [
    [-0.25, [0.075, 0.042, 0.032]],
    [-0.02, [0.46, 0.21, 0.11]],
    [0.02, [0.95, 0.40, 0.15]],
    [0.09, [0.72, 0.33, 0.17]],
    [0.22, [0.30, 0.20, 0.24]],
    [0.50, [0.105, 0.110, 0.225]],
    [1.00, [0.038, 0.058, 0.150]],
  ];
  const echantillon = (y) => {
    for (let i = 0; i < paliers.length - 1; i++) {
      const [a, ca] = paliers[i], [b, cb] = paliers[i + 1];
      if (y <= b || i === paliers.length - 2) {
        const t = Math.max(0, Math.min(1, (y - a) / (b - a)));
        const e = t * t * (3 - 2 * t);
        return [mix(ca[0], cb[0], e), mix(ca[1], cb[1], e), mix(ca[2], cb[2], e)];
      }
    }
  };

  for (let py = 0; py < H; py++) {
    const tv = py / (H - 1);
    const theta = (1 - tv) * Math.PI;      // convention UV de SphereGeometry
    const sy = Math.cos(theta), st = Math.sin(theta);
    for (let px = 0; px < W; px++) {
      const phi = (px / W) * Math.PI * 2;
      const sx = -Math.cos(phi) * st, sz = Math.sin(phi) * st;
      let [r, g, b] = echantillon(sy);

      // halo solaire : un noyau serré et une diffusion large
      const cos = sx * sunDir.x + sy * sunDir.y + sz * sunDir.z;
      const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      const noyau = Math.exp(-((ang / 0.075) ** 2));
      const halo = Math.exp(-((ang / 0.60) ** 2));
      r += noyau * 1.60 + halo * 0.35;
      g += noyau * 0.95 + halo * 0.16;
      b += noyau * 0.35 + halo * 0.05;

      // bancs de nuages, comprimés près de l'horizon
      const bande = Math.exp(-(((sy - 0.16) / 0.20) ** 2));
      const n = fbm(px / W, (sy * 0.5 + 0.5), 10, 5, 3);
      const nuage = Math.max(0, n - 0.52) * 2.2 * bande;
      r = mix(r, r * 0.6 + 0.55, nuage);
      g = mix(g, g * 0.6 + 0.27, nuage);
      b = mix(b, b * 0.65 + 0.17, nuage);

      const i = (py * W + px) * 4;
      d[i] = Math.min(255, (r / SKY_SCALE) * 255);
      d[i + 1] = Math.min(255, (g / SKY_SCALE) * 255);
      d[i + 2] = Math.min(255, (b / SKY_SCALE) * 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;   // déjà linéaire : pas de décodage sRGB
  t.anisotropy = ANISO;
  return t;
}

// Skyline : trois plans de profondeur + brume, vue depuis la baie
export function cityTexture() {
  const W = 2048, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  // contre-jour : les plans lointains se noient dans la brume dorée
  const couches = [
    { teinte: 'rgba(196,146,118,0.42)', hMin: 60, hMax: 150, larg: [70, 150], y: H, fen: 0.05 },
    { teinte: 'rgba(138,98,92,0.62)', hMin: 110, hMax: 280, larg: [50, 110], y: H, fen: 0.14 },
    { teinte: 'rgba(78,54,58,0.86)', hMin: 150, hMax: 400, larg: [40, 90], y: H, fen: 0.30 },
  ];
  for (const c of couches) {
    let x = -40;
    while (x < W + 40) {
      const w = c.larg[0] + Math.random() * (c.larg[1] - c.larg[0]);
      const h = c.hMin + Math.random() * (c.hMax - c.hMin);
      g.fillStyle = c.teinte;
      g.fillRect(x, c.y - h, w, h);
      // couronnement
      if (Math.random() > 0.6) g.fillRect(x + w * 0.35, c.y - h - 16, w * 0.3, 16);
      // fenêtres allumées
      for (let wy = c.y - h + 12; wy < c.y - 8; wy += 13)
        for (let wx = x + 5; wx < x + w - 8; wx += 11)
          if (Math.random() < c.fen) {
            g.fillStyle = Math.random() > 0.25
              ? 'rgba(255,196,110,0.85)' : 'rgba(180,215,255,0.7)';
            g.fillRect(wx, wy, 5, 7);
          }
      x += w + 4 + Math.random() * 16;
    }
    // brume atmosphérique entre les couches
    const gr = g.createLinearGradient(0, H - 260, 0, H);
    gr.addColorStop(0, 'rgba(255,196,138,0)');
    gr.addColorStop(1, 'rgba(255,186,124,0.42)');
    g.fillStyle = gr;
    g.fillRect(0, H - 260, W, 260);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}

// ============================================================
//  Matières des personnages
// ============================================================
export function buildCharacterMaterials() {
  // Luminance d'armure seule, sans teinte : la couleur du vêtement est
  // portée par material.color, sinon les deux se multiplient et brunissent.
  // Échelles calculées, pas estimées (voir tissu()) : à repeat 3, la
  // maille fait 2 mm et les plis 5 à 10 cm — lisibles à distance de jeu.
  // Les UV des personnages sont en mètres (body.js), donc ces valeurs
  // valent autant pour les bras que pour le torse.
  const chemiseT = tissu('popeline', [3, 3]);
  const vesteT = tissu('serge', [3, 3]);
  const pantalonT = tissu('flanelle', [3, 3]);
  const soieT = soieTex([6, 6]);
  const sacT = fabric([4, 4], [0.86, 0.86, 0.86], 0.25);          // nylon
  const cuirT = texturesBlender('cuir');
  const peauT = skin([9, 9]);
  const cheveuxT = hairTex([3, 3]);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);

  return {
    // La peau a besoin d'un lobe diffus large et d'un reflet rasant
    // chaud. Sans ça elle réagit comme du plastique peint, quelle que
    // soit la texture.
    peau: phys({
      ...peauT, color: 0xf3c49f, roughness: 1, metalness: 0, envMapIntensity: 0.82,
      vertexColors: true,
      normalScale: new THREE.Vector2(0.32, 0.32),
      specularIntensity: 0.45,
      sheen: 0.07, sheenColor: new THREE.Color(0xffd4c0), sheenRoughness: 0.9,
      clearcoat: 0,
    }),
    // La calotte est une surface ouverte : il faut la voir des deux
    // côtés, sinon l'intérieur de la coupe disparaît. Le reflet chaud
    // (sheen) est ce qui distingue des cheveux d'un casque noir.
    cheveux: phys({
      ...cheveuxT, color: 0x1a1512, roughness: 1, metalness: 0, envMapIntensity: 1.05,
      normalScale: new THREE.Vector2(0.18, 0.18), side: THREE.DoubleSide,
      sheen: 0.18, sheenColor: new THREE.Color(0x8a6448), sheenRoughness: 0.7,
      clearcoat: 0,
    }),
    // Popeline : lisse, légèrement satinée, plis courts.
    chemise: phys({
      ...chemiseT, color: 0xf3e9d6, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(0.16, 0.16), envMapIntensity: 1.0,
      aoMapIntensity: 0.8,
      sheen: 0.30, sheenColor: new THREE.Color(0xfff4e2), sheenRoughness: 0.65,
    }),
    // Flanelle : mate, poilue, un reflet rasant très diffus.
    pantalon: phys({
      ...pantalonT, color: 0x6a6e78, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(0.20, 0.20), envMapIntensity: 0.8,
      aoMapIntensity: 1.0,
      sheen: 0.35, sheenColor: new THREE.Color(0x9096a4), sheenRoughness: 0.8,
    }),

    // Serge de laine : côtes diagonales, relief marqué, reflet rasant
    // qui dessine le volume des épaules. Avant : roughness 0,95 et
    // envMapIntensity 0,55, soit un lambert sombre sans aucun modelé —
    // c'est ce qui faisait le torse « sans matière ».
    // La basque et le col restent ouverts : leur intérieur doit être
    // visible quand le personnage se penche. Les faces extérieures ont
    // leur orientation propre, vérifiée indépendamment du DoubleSide.
    veste: phys({
      ...vesteT, color: 0x4a5261, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(0.18, 0.18), envMapIntensity: 0.9,
      aoMapIntensity: 1.0,
      sheen: 0.25, sheenColor: new THREE.Color(0x9aa3b4), sheenRoughness: 0.7,
      side: THREE.DoubleSide,
    }),
    sac: std({
      ...sacT, color: 0x23252b, roughness: 0.70, metalness: 0,
      normalScale: new THREE.Vector2(0.20, 0.20), envMapIntensity: 0.85,
    }),
    // Cuir : pores fins cuits dans Blender, sans armure de tissu sur les souliers.
    chaussure: phys({
      ...(cuirT || {normalMap:fabric([5,5],[.86,.86,.86],.3).normalMap}),
      color: 0x24222a, roughness: cuirT ? 1 : .42, metalness: 0, envMapIntensity: 1.0,
      normalScale: new THREE.Vector2(0.28, 0.28),
      clearcoat: 0.12, clearcoatRoughness: 0.45,
    }),
    semelle: std({ color: 0x2c2b30, roughness: 0.95, metalness: 0 }),
    monture: std({ color: 0x2a2d33, roughness: 0.28, metalness: 0.85, envMapIntensity: 1.6 }),
    lentille: std({
      color: 0xdff0fb, roughness: 0.04, metalness: 0.1, transparent: true,
      opacity: 0.18, envMapIntensity: 2.0, side: THREE.DoubleSide,
    }),
    // Œil : sclère légèrement satinée, iris brun profond, pupille noire,
    // reflet non éclairé (toujours blanc) — le point de vie du regard.
    blancOeil: phys({ color: 0xf1ede6, roughness: 0.30, metalness: 0, envMapIntensity: 1.0,
      clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    iris: phys({ color: 0x3b2417, roughness: 0.25, metalness: 0, envMapIntensity: 1.4,
      clearcoat: 0.8, clearcoatRoughness: 0.15 }),
    pupille: std({ color: 0x07060a, roughness: 0.3, metalness: 0 }),
    reflet: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    bouche: std({ color: 0x6e3a3c, roughness: 0.55, metalness: 0 }),
    levre: std({ color: 0xd08a7c, roughness: 0.5, metalness: 0 }),
    // Rubans skinnés (sangles, cordon, cravate) : double face, leur
    // orientation dépend du sens de génération.
    sangle: std({ color: 0x1a1c20, roughness: 0.85, metalness: 0, side: THREE.DoubleSide,
      normalMap: sacT.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) }),
    boucle: std({ color: 0x8b8f96, roughness: 0.35, metalness: 0.9, envMapIntensity: 1.4 }),
    cordon: std({ color: 0x27344f, roughness: 0.88, metalness: 0, side: THREE.DoubleSide }),
    badge: std({ color: 0xf5f3ec, roughness: 0.45, metalness: 0, envMapIntensity: 0.8 }),
    badgeBande: std({ color: 0x2f6fb5, roughness: 0.5, metalness: 0 }),
    badgePhoto: std({ color: 0xb9bcc2, roughness: 0.6, metalness: 0 }),
    ceinture: phys({ ...(cuirT || {}), color: 0x241f1c, roughness: cuirT ? 1 : .45, metalness: 0,
      clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    boutonNacre: phys({ color: 0xf2ece0, roughness: 0.25, metalness: 0, envMapIntensity: 1.3,
      clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    boutonCorne: phys({ color: 0x2c2622, roughness: 0.35, metalness: 0, envMapIntensity: 1.2,
      clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    soie: phys({ ...soieT, color: 0x6e2b33, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.3,
      sheen: 0.8, sheenColor: new THREE.Color(0xff9aa6), sheenRoughness: 0.35,
      side: THREE.DoubleSide }),
  };
}

// ============================================================
//  Bibliothèque
// ============================================================
export function buildMaterials(renderer) {

  const carpetT = texturesBlender('moquette') || carpet([1, 1]);
  const stoneT = texturesBlender('pierre') || stoneFloor([1, 1]);
  const oak = texturesBlender('bois'), felt = texturesBlender('textile');
  const woodT = oak || wood([1, 1], [0.75, 0.655, 0.53]);
  const woodDarkT = oak || wood([1, 1], [0.44, 0.31, 0.21]);
  const fabricGreyT = felt || fabric([2, 2], [0.37, 0.47, 0.45]);
  const fabricChairT = felt || fabric([2, 2], [0.13, 0.14, 0.16]);
  const fabricSofaT = felt || fabric([2, 2], [0.64, 0.32, 0.22]);
  const brushedT = texturesBlender('metal') || brushed([2, 2]);
  const paintT = paint([3, 3]);
  const concreteT = texturesBlender('beton');
  const ceilT = ceilingTile([1/.6, 1/.6]);

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);

  return {
    textures: { carpetT, stoneT, woodT, ceilT, paintT },

    moquette: std({ ...carpetT, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 0.32 }),

    pierre: std({ ...stoneT, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(0.18, 0.18), envMapIntensity: 0.65 }),

    beton: std({ color: concreteT ? 0xffffff : 0xb3b1a4, ...(concreteT || paintT), roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(.16,.16), envMapIntensity: .5 }),
    eau: std({ color:0x71a7b9, transparent:true, opacity:.42, depthWrite:false,
      roughness:.19, metalness:0, envMapIntensity:.6 }),
    diffuseur: new THREE.MeshBasicMaterial({ color: 0xffedd0 }),

    bois: std({ ...woodT, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 0.9 }),

    boisFonce: std({ ...woodDarkT, color: oak ? 0x9e7657 : 0xffffff, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 0.95 }),

    mur: std({ color: 0xe2e5db, ...paintT, roughness: 0.92, metalness: 0,
      normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 0.7 }),

    murAccent: std({ color: 0x3c6561, ...paintT, roughness: 0.9, metalness: 0,
      normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 0.7 }),

    plafond: std({ ...ceilT, roughness: 0.97, metalness: 0,
      normalScale: new THREE.Vector2(0.07, 0.07), envMapIntensity: 0.45 }),

    cloison: phys({ sheen: .18, sheenColor: new THREE.Color(0xa6b7ab), sheenRoughness: 1, ...fabricGreyT, color: felt ? 0x819c90 : 0xffffff, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(0.28, 0.28), envMapIntensity: 0.5 }),

    tissuChaise: phys({ sheen: .32, sheenColor: new THREE.Color(0x849c8c), sheenRoughness: .9, ...fabricChairT, color: felt ? 0x444e49 : 0xffffff, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(.5, .5), envMapIntensity: 0.45 }),

    tissuCanape: phys({ sheen: .25, sheenColor: new THREE.Color(0xd5b29d), sheenRoughness: .9, ...fabricSofaT, color: felt ? 0xbb7658 : 0xffffff, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(.5, .5), envMapIntensity: 0.5 }),

    alu: std({ color: 0xb9bec0, ...brushedT, metalness: 1, roughness: 1,
      normalScale: new THREE.Vector2(0.045, 0.045), envMapIntensity: 0.8 }),

    aluSombre: std({ color: 0x434d49, ...brushedT, metalness: .65, roughness: 1,
      normalScale: new THREE.Vector2(0.15, 0.15), envMapIntensity: .8 }),

    laiton: std({ color: 0xa79d7f, metalness: 0.85, roughness: 0.40,
      envMapIntensity: 0.9 }),

    plastiqueNoir: phys({ color: 0x1b1d21, roughness: 0.48, metalness: 0,
      clearcoat: 0.12, clearcoatRoughness: 0.45, envMapIntensity: 0.9 }),

    plastiqueBlanc: phys({ color: 0xe9e9e6, roughness: 0.52, metalness: 0,
      clearcoat: 0.10, clearcoatRoughness: 0.45, envMapIntensity: 0.9 }),

    // verre architectural : réflexions nettes, pas de réfraction (coût)
    verre: phys({ color: 0xcfe3ea, metalness: 0, roughness: 0.03,
      transparent: true, opacity: 0.12, envMapIntensity: 1.5,
      clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide,
      depthWrite: false }),

    verreFenetre: phys({ color: 0xffe9c9, metalness: 0, roughness: 0.02,
      transparent: true, opacity: 0.07, envMapIntensity: 1.3,
      clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide,
      depthWrite: false }),

    signalOrange: std({ color: 0xd18a43, roughness: 0.72, metalness: 0, envMapIntensity: 0.5 }),
    papierRecyclage: std({ color: 0xdccfa4, roughness: 0.94, metalness: 0, envMapIntensity: 0.4 }),
    papier: std({ color: 0xf3efe4, roughness: 0.88, metalness: 0, envMapIntensity: 0.6 }),
    feuillage: std({ color: 0x3e7a42, roughness: 0.72, metalness: 0, envMapIntensity: 0.6 }),
    terreCuite: std({ color: 0xa2643c, roughness: 0.85, metalness: 0, envMapIntensity: 0.6 }),
    carton: std({ color: 0xbf9463, roughness: 0.94, metalness: 0, envMapIntensity: 0.5 }),
    cableNoir: std({ color: 0x15171a, roughness: 0.65, metalness: 0, envMapIntensity: 0.6 }),
  };
}

import * as THREE from 'three';
import { partager } from './resources.js';

// Rais de soleil à travers la baie : des voiles additifs, parallèles à la lumière,
// qui partent de chaque vitrage et meurent au sol. Sans eux le couchant restait
// dehors : l'étage était éclairé à plat par ses néons, quelle que soit l'heure.
// Repère canonique de level.js (baie à x = -20) : l'étage est retourné d'un bloc ensuite.
const BAIE_X = -19.75, ALLEGE = 1.05, LINTEAU = 3.2, FOND = 3.6;
const POTEAUX = [-15.6, -7.6, 0.4, 8.4, 15.6];             // ossatureBureau

let voile;
function matiereVoile() {
  if (voile) return voile;
  const W = 256, H = 64, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H);
  let graine = 7; const alea = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
  const stries = Array.from({ length: H }, () => 0.5 + 0.5 * alea());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / (H - 1), bord = Math.min(1, v / 0.2, (1 - v) / 0.2);
    // fort au vitrage, éteint au sol ; bords fondus ; stries dans la largeur
    const a = (1 - u) ** 1.4 * Math.min(1, u / 0.03) * bord * bord * (3 - 2 * bord) * (0.6 + 0.4 * stries[y]);
    const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = a * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  voile = partager(new THREE.MeshBasicMaterial({ map, color: 0xff9c4c, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  return voile;
}

// soleil : { elevation, azimut, intensite } de l'étage. Rien quand il est couché.
export function rayonsDeSoleil(root, soleil) {
  if (soleil.elevation < 2) return null;
  const l = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - soleil.elevation),
    THREE.MathUtils.degToRad(soleil.azimut)).negate();     // sens de la lumière
  const tMax = (FOND - BAIE_X) / l.x, portee = y => Math.min(y / -l.y, tMax), tRef = portee(LINTEAU);
  const pos = [], uv = [], col = [], idx = [];
  const quad = (a, b, ta, tb, force) => {                  // a, b : deux points du vitrage ; le voile file le long de l
    const n = pos.length / 3;
    for (const [p, t] of [[a, 0], [b, 0], [b, tb], [a, ta]]) pos.push(p[0] + l.x * t, Math.max(0.03, p[1] + l.y * t), p[2] + l.z * t);
    uv.push(0, 0, 0, 1, tb / tRef, 1, ta / tRef, 0); for (let k = 0; k < 4; k++) col.push(force, force, force);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  const force = Math.min(1, soleil.intensite / 4.4);
  for (let i = 0; i < POTEAUX.length - 1; i++) {
    const za = POTEAUX[i] + 0.45, zb = POTEAUX[i + 1] - 0.45;
    // voiles verticaux : visibles quand on regarde le long de la baie
    for (let z = za + 0.4; z < zb; z += 1.55) quad([BAIE_X, ALLEGE, z], [BAIE_X, LINTEAU, z], portee(ALLEGE), tRef, 0.04 * force);
    // voiles couchés : visibles depuis la caméra de jeu, qui plonge vers le sol
    for (const h of [0.2, 0.5, 0.8]) {
      const y = ALLEGE + (LINTEAU - ALLEGE) * h, t = portee(y);
      quad([BAIE_X, y, za], [BAIE_X, y, zb], t, t, 0.06 * force);
    }
  }
  const geo = partager(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = matiereVoile(); mat.vertexColors = true;
  const m = new THREE.Mesh(geo, mat); m.name = 'rais-de-soleil'; m.renderOrder = 5; m.frustumCulled = false;
  m.userData.noFusion = true;                              // un seul maillage déjà ; la fusion perdrait les couleurs de sommet
  root.add(m); return m;
}

// Ombre de contact d'un personnage : un disque sombre au sol. Les néons ne portent pas
// d'ombre et le soleil n'atteint qu'une bande le long de la baie : ailleurs, tout flottait.
let disque;
export function ombreDeContact() {
  if (!disque) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), d = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    d.addColorStop(0, 'rgba(0,0,0,.55)'); d.addColorStop(0.55, 'rgba(0,0,0,.22)'); d.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = d; g.fillRect(0, 0, 64, 64);
    disque = { geo: new THREE.PlaneGeometry(1.05, 1.05).rotateX(-Math.PI / 2),
      mat: new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, fog: false }) };
  }
  const m = new THREE.Mesh(disque.geo, disque.mat); m.renderOrder = 2; return m;
}

import { uvBoiteMetrique } from './uv.js';
import { poserDecorBlender } from './decor-blender.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { partager } from './resources.js';
import { panneauGraphique } from './environment.js';

// Trémie derrière le palier d'interaction. Les sorties restent au même endroit.
export const TREMIE = { x1: 4.18, x2: 11.82, z1: 13.48, z2: 17.7 };
const cache = new Map();
function boite(w, h, d) {
  const cle = `${w},${h},${d}`;
  if (!cache.has(cle)) cache.set(cle, partager(uvBoiteMetrique(new THREE.BoxGeometry(w, h, d))));
  return cache.get(cle);
}
function atelier(root) {
  const poser = (geo, mat, x, y, z, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const box = (w, h, d, mat, x, y, z, cast = true) => poser(boite(w, h, d), mat, x, y, z, cast);
  const tube = (a, b, r, mat) => {
    const d = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    const m = poser(new THREE.CylinderGeometry(r, r, d.length(), 8), mat, ...a);
    m.position.addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  };
  return { poser, box, tube };
}

// Quatre rectangles au maximum, avec des UV métriques continues. Aucun aplat
// opaque au-dessus des marches et aucun trou dans le palier accessible.
export function solAvecTremie(w, d, cx = 0, cz = 0) {
  const a = { x1: cx - w / 2, x2: cx + w / 2, z1: cz - d / 2, z2: cz + d / 2 };
  const h = {
    x1: Math.max(a.x1, TREMIE.x1),
    x2: Math.min(a.x2, TREMIE.x2),
    z1: Math.max(a.z1, TREMIE.z1),
    z2: Math.min(a.z2, TREMIE.z2),
  };
  const rects =
    h.x2 <= h.x1 || h.z2 <= h.z1
      ? [a]
      : [
          { ...a, z2: h.z1 },
          { ...a, z1: h.z2 },
          { x1: a.x1, x2: h.x1, z1: h.z1, z2: h.z2 },
          { x1: h.x2, x2: a.x2, z1: h.z1, z2: h.z2 },
        ];
  const geos = [];
  for (const r of rects) {
    if (r.x2 - r.x1 < 1e-4 || r.z2 - r.z1 < 1e-4) continue;
    const g = new THREE.PlaneGeometry(r.x2 - r.x1, r.z2 - r.z1);
    g.translate((r.x1 + r.x2) / 2 - cx, -(r.z1 + r.z2) / 2 + cz, 0);
    const p = g.attributes.position,
      uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + w / 2, p.getY(i) + d / 2);
    geos.push(g);
  }
  const g = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return g;
}

// La porte animée reste trois matériaux fusionnés dans son propre repère.
function compacterPorte(root) {
  const lots = new Map();
  for (const m of [...root.children]) {
    m.updateMatrix();
    const key = m.material.uuid;
    if (!lots.has(key)) lots.set(key, { mat: m.material, cast: m.castShadow, geos: [] });
    lots.get(key).geos.push(m.geometry.clone().applyMatrix4(m.matrix));
    root.remove(m);
  }
  for (const { mat, cast, geos } of lots.values()) {
    const geo = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    root.add(m);
  }
}

export function construireEscalier(root, MAT, niveau, obstacles, porteSalleSud) {
  const g = new THREE.Group();
  g.name = 'cage-escalier';
  root.add(g);
  const { box, tube } = atelier(g);
  // Le béton du noyau descend jusqu'à l'étage inférieur. Retour en U sur
  // deux volées de dix marches : 18 cm de haut, 30 cm de giron.
  box(0.22, 7.4, 5.6, MAT.beton, 4.07, -0.1, 15.0);
  // Le plan C ouvre la salle de réunion sur le palier. Découper aussi
  // l'habillage de la cage : la porte de la salle définit déjà les collisions.
  // On conserve le noyau sous le plancher et le linteau au-dessus de 3 m.
  function paroiEst(w, h, d, mat, x, y, z, cast = true) {
    const debut = z - d / 2, fin = z + d / 2;
    const a = Math.max(debut, porteSalleSud[0]), b = Math.min(fin, porteSalleSud[1]);
    if (a >= b) return box(w, h, d, mat, x, y, z, cast);
    for (const [z1, z2] of [[debut, a], [b, fin]])
      if (z2 > z1) box(w, h, z2 - z1, mat, x, y, (z1 + z2) / 2, cast);
    const bas = y - h / 2, haut = y + h / 2;
    for (const [y1, y2] of [[bas, Math.min(0, haut)], [Math.max(3, bas), haut]])
      if (y2 > y1) box(w, y2 - y1, b - a, mat, x, (y1 + y2) / 2, (a + b) / 2, cast);
  }
  paroiEst(0.22, 7.4, 5.6, MAT.beton, 11.93, -0.1, 15.0);
  box(8.08, 7.4, 0.22, MAT.beton, 8, -0.1, 17.76);
  box(8.08, 0.14, 5.6, MAT.plafond, 8, 3.67, 15.0, false);
  for (const x of [4.195, 11.805]) {
    const poserParoi = x > 8 ? paroiEst : box;
    poserParoi(0.018, 1.15, 5.45, MAT.murAccent, x, 0.575, 15.0, false);
    poserParoi(0.026, 0.045, 5.45, MAT.aluSombre, x, 1.17, 15.0, false);
  }

  box(7.64, 0.16, 1.33, MAT.beton, 8, -0.08, 12.815);
  box(7.64, 0.18, 5.4, MAT.beton, 8, -3.71, 15.0);
  const flights = [
    { x: 7.7, from: 13.48, to: 16.48, top: 0 },
    { x: 10.2, from: 16.48, to: 13.48, top: -1.8 },
  ];
  const modeleEscalier = poserDecorBlender('escalier',g,MAT,{x:8,z:13.48});
  if(!modeleEscalier){
    box(7.64, 0.2, 1.2, MAT.beton, 8, -1.91, 17.05);
  for (const f of flights) {
    const sens = Math.sign(f.to - f.from);
    for (let i = 0; i < 10; i++) {
      const z = f.from + sens * (i + 0.5) * 0.3,
        y = f.top - (i + 1) * 0.18;
      box(2.05, 0.18, 0.302, MAT.beton, f.x, y - 0.09, z);
      box(2.05, 0.022, 0.27, MAT.pierre, f.x, y + 0.011, z);
      box(2.05, 0.014, 0.055, MAT.aluSombre, f.x, y + 0.028, z - sens * 0.115, false);
    }
    // Paillasse inclinée sous les marches, limons et mains courantes continues.
    const pente = box(
      2.05,
      0.15,
      Math.hypot(3, 1.8),
      MAT.beton,
      f.x,
      f.top - 1.13,
      (f.from + f.to) / 2,
    );
    pente.rotation.x = sens * Math.atan2(1.8, 3);
    for (const side of [-1, 1]) {
      const x = f.x + side * 1.02;
      tube([x, f.top + 0.95, f.from], [x, f.top - 0.85, f.to], 0.027, MAT.aluSombre);
      tube([x, f.top + 0.43, f.from], [x, f.top - 1.37, f.to], 0.014, MAT.aluSombre);
      for (let i = 0; i <= 5; i++) {
        const t = i / 5,
          z = f.from + (f.to - f.from) * t,
          y = f.top - 1.8 * t;
        tube([x, y - 0.08, z], [x, y + 0.95, z], 0.018, MAT.aluSombre);
        box(0.105, 0.018, 0.105, MAT.alu, x, y + 0.014, z, false);
      }
    }
  }
  tube([6.68, -0.85, 16.48], [6.68, -0.85, 17.36], 0.027, MAT.aluSombre);
  tube([6.68, -0.85, 17.36], [11.22, -0.85, 17.36], 0.027, MAT.aluSombre);
  tube([11.22, -0.85, 17.36], [11.22, -0.85, 16.48], 0.027, MAT.aluSombre);
  }
  // Palier vitré : les parties solides arrêtent les pieds, le vitrage
  // laisse apercevoir les marches depuis le couloir avant d'interagir.
  for (const [a, b] of [
    [4.2, 6.98],
    [9.02, 11.8],
  ]) {
    const x = (a + b) / 2,
      w = b - a;
    box(w, 0.92, 0.16, MAT.murAccent, x, 0.46, 13.35);
    box(w, 1.72, 0.03, MAT.verre, x, 1.8, 13.35, false);
    box(w, 0.11, 0.17, MAT.aluSombre, x, 0.965, 13.35);
    box(w, 0.14, 0.17, MAT.aluSombre, x, 2.7, 13.35);
    box(w, 0.75, 0.16, MAT.mur, x, 3.13, 13.35);
    for (const px of [a, b]) box(0.065, 2.76, 0.17, MAT.aluSombre, px, 1.38, 13.35);
  }
  // Deux obstacles explicites, ajoutés après les collisions historiques.
  obstacles.push({
    x1: 4.18,
    x2: 11.82,
    z1: 13.27,
    z2: 13.45,
    h: 3.6,
    seeThrough: true,
    kind: 'architecture',
  });
  obstacles.push({ x1: 4.18, x2: 11.82, z1: 13.27, z2: 13.45, h: 0.92, kind: 'architecture' });
  for (const x of [6.96, 9.04]) box(0.12, 2.74, 0.22, MAT.aluSombre, x, 1.37, 13.35);
  box(2.2, 0.16, 0.22, MAT.aluSombre, 8, 2.76, 13.35);
  box(2.2, 0.72, 0.18, MAT.mur, 8, 3.2, 13.35);
  const door = new THREE.Group();
  door.name = 'porte-escalier';
  door.position.set(7.03, 0, 13.32);
  door.userData.noFusion = true;
  g.add(door);
  const porteBlender=poserDecorBlender('porte',door,MAT,{propre:true});
  if(porteBlender){
    // Conserver les maillages directement sous la charnière animée.
    for(const m of [...porteBlender.children])door.add(m);porteBlender.removeFromParent();
    door.userData.decorBlender='porte-escalier-v01.glb';
  }else{
  const D = atelier(door);
  D.box(1.94, 0.9, 0.08, MAT.murAccent, 0.97, 0.49, 0);
  D.box(1.94, 0.27, 0.08, MAT.murAccent, 0.97, 2.48, 0);
  for (const x of [0.045, 1.895]) D.box(0.09, 1.43, 0.08, MAT.murAccent, x, 1.65, 0);
  D.box(1.76, 1.42, 0.021, MAT.verre, 0.97, 1.64, 0, false);
  D.box(1.76, 0.035, 0.09, MAT.alu, 0.97, 0.93, 0);
  D.box(1.52, 0.045, 0.055, MAT.alu, 0.97, 1.015, -0.11);
  for (const x of [0.26, 1.68]) D.box(0.055, 0.07, 0.11, MAT.alu, x, 1.015, -0.065);
  D.box(0.3, 0.065, 0.08, MAT.alu, 1.6, 2.58, -0.07);
  for (const y of [0.27, 1.3, 2.4]) D.box(0.065, 0.13, 0.105, MAT.alu, 0, y, 0);
  compacterPorte(door);
  }
  panneauGraphique(g, 'escaliers', 1.4, 0.7, 8, 3.04, 12.16, Math.PI);
  panneauGraphique(g, 'evacuation', 1.5, 0.75, 4.24, 1.85, 12.65, Math.PI / 2);
  const etage = niveau.titre.match(/Étage (\d+)/)?.[1] || '23';
  panneauGraphique(g, etage, 1.6, 0.8, 8, -0.2, 17.635, Math.PI);
  // Réseau apparent du noyau, raccords et éclairage de service sans PointLight.
  for (const x of [4.4, 4.56]) {
    tube([x, -3.6, 17.5], [x, 3.45, 17.5], 0.025, MAT.alu);
    for (const y of [-3, -1, 1, 3]) box(0.27, 0.035, 0.045, MAT.aluSombre, 4.49, y, 17.53, false);
  }
  for (const [x, y, z] of [
    [11.72, 2.35, 15.2],
    [4.28, -0.65, 16.8],
  ]) {
    box(0.14, 0.34, 0.8, MAT.aluSombre, x, y, z);
    box(0.16, 0.24, 0.64, MAT.diffuseur, x, y, z, false);
  }
  return { door, flights, trou: { ...TREMIE } };
}

export function cabineAscenseur(root, MAT) {
  const g = new THREE.Group();
  g.name = 'cabine-ascenseur';
  root.add(g);
  const { box, tube } = atelier(g);
  box(2.5, 0.13, 3.16, MAT.beton, 21.12, -0.065, 1.5);
  box(2.46, 0.025, 3.12, MAT.pierre, 21.12, 0.013, 1.5);
  box(0.12, 2.73, 3.18, MAT.alu, 22.42, 1.365, 1.5);
  for (const z of [-0.12, 3.12]) box(2.57, 2.73, 0.12, MAT.plastiqueBlanc, 21.16, 1.365, z);
  for (const z of [0.2, 1.07, 1.94, 2.8]) box(0.022, 2.15, 0.82, MAT.bois, 22.344, 1.36, z);
  box(2.65, 0.09, 3.3, MAT.aluSombre, 21.12, 2.77, 1.5);
  box(1.1, 0.02, 2.0, MAT.diffuseur, 21.1, 2.715, 1.5, false);
  for (const z of [-0.03, 3.03]) tube([20.3, 0.96, z], [22.2, 0.96, z], 0.023, MAT.aluSombre);
  tube([22.29, 0.96, 0.03], [22.29, 0.96, 2.97], 0.023, MAT.aluSombre);
  for (const z of [-0.03, 3.03]) box(2.4, 0.08, 0.035, MAT.aluSombre, 21.15, 0.08, z);
  // Seuil strié, rails des vantaux et habillage de la baie.
  box(0.52, 0.025, 3.45, MAT.alu, 19.89, 0.017, 1.5, false);
  for (const x of [19.7, 19.79, 19.88, 19.97])
    box(0.008, 0.008, 3.37, MAT.aluSombre, x, 0.033, 1.5, false);
}

export function ossatureBureau(root, MAT, plan) {
  const { box } = atelier(root);
  // Trame porteuse lisible ; tous les éléments restent sur les murs ou en hauteur.
  for (const z of [-15.6, -7.6, 0.4, 8.4, 15.6]) {
    box(0.42, 3.6, 0.3, MAT.mur, -19.94, 1.8, z);
    box(23.5, 0.2, 0.27, MAT.mur, -8, 3.5, z);
    box(0.55, 0.12, 0.49, MAT.plastiqueBlanc, -19.82, 3.43, z);
  }
  for (const z of [-15.7, -4.2, 6.2, 15.7]) {
    box(0.3, 3.6, 0.3, MAT.mur, 12, 1.8, z);
    box(7.7, 0.18, 0.28, MAT.mur, 16, 3.49, z);
  }
  // Plafond suspendu du couloir, rives et joints transversaux alignés aux pièces.
  box(7.65, 0.13, 27.7, MAT.plafond, 8, 3.44, -1.85, false);
  for (const x of [4.28, 11.72]) box(0.07, 0.045, 27.7, MAT.aluSombre, x, 3.36, -1.85, false);
  for (let z = -15.6; z < 11.5; z += 2.4) box(7.35, 0.024, 0.022, MAT.alu, 8, 3.36, z, false);
  // Îlots acoustiques suspendus : quatre attaches et un cadre discret.
  for (const [x, z, , rot] of plan.postes) {
    const p = new THREE.Group();
    p.position.set(x, 0, z);
    p.rotation.y = rot;
    root.add(p);
    const A = atelier(p);
    A.box(2.7, 0.06, 1.45, MAT.cloison, 0, 3.28, 0, false);
    for (const xx of [-1.1, 1.1])
      for (const zz of [-0.48, 0.48])
        A.box(0.012, 0.27, 0.012, MAT.aluSombre, xx, 3.445, zz, false);
    for (const xx of [-1.3, 1.3]) A.box(0.03, 0.055, 1.4, MAT.aluSombre, xx, 3.285, 0, false);
  }
}

import { uvBoiteMetrique } from './uv.js';
import { poserDecorBlender } from './decor-blender.js';
import { partager, libererArbre } from './resources.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solAvecTremie, construireEscalier, cabineAscenseur, ossatureBureau } from './architecture.js';
import { screenContent } from './materials.js';
import { habillerBureau, panneauGraphique, personnaliserPoste, feuilleFicus, construireVille } from './environment.js';

// ============================================================
//  NIVEAU — open space, couloir, bureau du boss, hall
//  d'ascenseur, salle de réunion, cage d'escalier.
//
//  Repère : +X = est, +Z = sud. rotation.y = yaw fait regarder
//  un objet vers (sin yaw, 0, cos yaw).
//
//  Les emprises historiques sont conservées. La porte de la cage
//  d’escalier protège la nouvelle trémie derrière le point de sortie.
// ============================================================

export const WALL_H = 3.6;

// ------------------------------------------------------------
//  Tests géométriques (inchangés, couverts par les tests Node)
// ------------------------------------------------------------

// Ligne de vue : slab test 2D + test de hauteur. Un obstacle ne
// bloque que si le segment œil→cible passe SOUS son sommet.
export function hasLOS(obstacles, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const o of obstacles) {
    if (o.seeThrough) continue;
    let t0 = 0, t1 = 1, miss = false;
    if (Math.abs(dx) < 1e-6) { if (a.x < o.x1 || a.x > o.x2) miss = true; }
    else {
      let ta = (o.x1 - a.x) / dx, tb = (o.x2 - a.x) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (miss || t0 > t1) continue;
    if (Math.abs(dz) < 1e-6) { if (a.z < o.z1 || a.z > o.z2) miss = true; }
    else {
      let ta = (o.z1 - a.z) / dz, tb = (o.z2 - a.z) / dz;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (miss || t0 > t1) continue;
    const h0 = a.y + (b.y - a.y) * t0;
    const h1 = a.y + (b.y - a.y) * t1;
    if (Math.min(h0, h1) < o.h) return false;
  }
  return true;
}

export function collide(obstacles, p, r) {
  for (let pass = 0; pass < 2; pass++) {
    for (const o of obstacles) {
      if (o.noClip) continue;
      const cx = Math.max(o.x1, Math.min(p.x, o.x2));
      const cz = Math.max(o.z1, Math.min(p.z, o.z2));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d);
        p.z += (dz / d) * (r - d);
      } else {
        const pen = [p.x - o.x1, o.x2 - p.x, p.z - o.z1, o.z2 - p.z];
        const m = Math.min(pen[0], pen[1], pen[2], pen[3]);
        if (m === pen[0]) p.x = o.x1 - r;
        else if (m === pen[1]) p.x = o.x2 + r;
        else if (m === pen[2]) p.z = o.z1 - r;
        else p.z = o.z2 + r;
      }
    }
  }
}

// Distance jusqu'au premier obstacle le long d'un rayon.
//
// Remplace le lancer de rayon de la caméra : après fusion de la
// géométrie, les meubles ne sont plus des maillages séparés, et
// tester un rayon contre 200 000 triangles à chaque image coûterait
// bien plus cher que ce test analytique sur des boîtes.
export function distanceObstacle(obstacles, o0, dir, maxDist) {
  let best = maxDist;
  for (const b of obstacles) {
    if (b.noClip) continue;
    let t0 = 0, t1 = maxDist, rate = false;
    for (const [p, d, lo, hi] of [
      [o0.x, dir.x, b.x1, b.x2],
      [o0.y, dir.y, 0, b.h],
      [o0.z, dir.z, b.z1, b.z2],
    ]) {
      if (Math.abs(d) < 1e-8) { if (p < lo || p > hi) { rate = true; break; } continue; }
      let a = (lo - p) / d, c = (hi - p) / d;
      if (a > c) { const s2 = a; a = c; c = s2; }
      if (a > t0) t0 = a;
      if (c < t1) t1 = c;
      if (t0 > t1) { rate = true; break; }
    }
    if (!rate && t0 < best) best = t0;
  }
  return best;
}

export function nearCover(obstacles, p, reach = 0.95) {
  for (const o of obstacles) {
    if (o.h < 0.6 || o.noClip) continue;
    const cx = Math.max(o.x1, Math.min(p.x, o.x2));
    const cz = Math.max(o.z1, Math.min(p.z, o.z2));
    const dx = p.x - cx, dz = p.z - cz;
    if (dx * dx + dz * dz < reach * reach) return true;
  }
  return false;
}

// Regroupe tous les maillages statiques par matériau en un seul maillage
// chacun. Le décor passe d'environ 1 900 appels de dessin à une vingtaine
// — et ces appels comptent triple, puisque la scène est aussi redessinée
// pour les ombres et pour les normales du GTAO.
//
// Les objets marqués `noFusion` (portes d'ascenseur, objets à ramasser)
// restent indépendants : ils bougent.
function fusionnerStatiques(root) {
  root.updateMatrixWorld(true);
  const lots = new Map();
  const candidats = [];

  root.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    for (let p = o; p; p = p.parent) if (p.userData?.noFusion) return;
    candidats.push(o);
  });

  for (const o of candidats) {
    // Normaliser les primitives évite deux lots pour un même matériau.
    const cle = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
    let lot = lots.get(cle);
    if (!lot) {
      lot = { material: o.material, cast: o.castShadow, receive: o.receiveShadow,
              geos: [], src: [] };
      lots.set(cle, lot);
    }
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    // mergeGeometries exige des jeux d'attributs identiques
    for (const nom of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv'].includes(nom)) g.deleteAttribute(nom);
    lot.geos.push(g);
    lot.src.push(o);
  }

  let fusionnes = 0, restants = 0;
  for (const lot of lots.values()) {
    if (lot.geos.length < 2) { for (const g of lot.geos) g.dispose(); restants++; continue; }
    let merged = null;
    try { merged = mergeGeometries(lot.geos, false); } catch { merged = null; }
    for (const g of lot.geos) g.dispose();
    if (!merged) { restants++; continue; }
    const m = new THREE.Mesh(merged, lot.material);
    m.castShadow = lot.cast;
    m.receiveShadow = lot.receive;
    m.matrixAutoUpdate = false;
    root.add(m);
    for (const o of lot.src) o.parent?.remove(o);
    fusionnes++;
  }
  return { fusionnes, restants };
}

// ------------------------------------------------------------
//  Construction
// ------------------------------------------------------------


// Boîte chanfreinée : aucune arête vive. C'est le détail qui
// trahit le plus le rendu de synthèse — 2 mm de congé suffisent.
// Palette mutualisée. Un `new MeshStandardMaterial` par livre ou par
// feuille rend la fusion impossible : chaque maillage reste un appel de
// dessin. Ces matériaux sont créés une fois pour toute la session.
let PAL = null;
function palette() {
  if (PAL) return PAL;
  const std = (c, r = 0.75, m = 0) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  PAL = {
    livres: [0x8c4a3a, 0x3d5a80, 0x54683f, 0x7a5c8a, 0xb08a3c, 0x8a8f95].map(c => std(c)),
    feuilles: [std(0x3e7a42, 0.68), std(0x4f8f4a, 0.68)],
    postits: [0xf7e06a, 0xf2a3c0, 0x9fe08a].map(c => std(c, 0.9)),
    feutres: [0x2f6fd0, 0xc0392b, 0x1f7a4d].map(c => std(c, 0.4)),
    neon: new THREE.MeshBasicMaterial({ color: 0xfff4e0 }),
    ruban: std(0xd9c9a8, 0.55),
    jaune: std(0xe8b02a, 0.55),
    rouge: std(0xb02a1e, 0.35, 0.2),
    cadran: std(0xf4f2ec, 0.4),
    terreau: std(0x302b24, 1),
    store: std(0xd6d0c2, 0.8),
  };
  for (const m of PAL.feuilles) m.side = THREE.DoubleSide;
  for (const value of Object.values(PAL)) for (const mat of [].concat(value)) partager(mat);
  return PAL;
}

// Les écrans ne portent que trois contenus : on partage les textures.
const ecranCache = new Map();
function materiauEcran(kind) {
  let m = ecranCache.get(kind);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: screenContent(kind) });
    ecranCache.set(kind, partager(m));
  }
  return m;
}

// Un clavier = 75 touches. Multiplié par huit postes, cela fait 600
// maillages à cloner et transformer à chaque construction d'étage. On
// fabrique la grille une seule fois, pour toute la session.
let geoClavier = null;
function geometrieClavier() {
  if (geoClavier) return geoClavier;
  const base = new RoundedBoxGeometry(0.022, 0.008, 0.022, 1, 0.003);
  const geos = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) {
    const g = base.clone();
    g.translate(-0.207 + c * 0.0295, 0.013, -0.058 + r * 0.029);
    geos.push(g);
  }
  geoClavier = partager(mergeGeometries(geos, false));
  for (const g of geos) g.dispose();
  base.dispose();
  return geoClavier;
}

const geoCache = new Map();
function rbox(w, h, d, r = 0.014) {
  const rad = Math.min(r, w / 2.05, h / 2.05, d / 2.05);
  const key = `${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)},${rad.toFixed(4)}`;
  let g = geoCache.get(key);
  if (!g) { g = uvBoiteMetrique(new RoundedBoxGeometry(w, h, d, Math.max(w,h,d) < 0.65 ? 1 : 2, rad)); geoCache.set(key, partager(g)); }
  return g;
}

// Anneau au sol et petite balise suspendue qui désigne le meuble à rejoindre.
let geoHalo = null;
function geometrieHalo() {
  if (geoHalo) return geoHalo;
  const anneau = new THREE.RingGeometry(.25, .30, 40).rotateX(-Math.PI / 2).translate(0, .018, 0);
  const balise = new THREE.RingGeometry(.065, .095, 4).rotateZ(Math.PI / 4).translate(0, .42, 0);
  geoHalo = partager(mergeGeometries([anneau, balise], false));
  anneau.dispose(); balise.dispose();
  return geoHalo;
}

// Passe de sécurité : carte à plat et son anneau porte-clés, d'un seul tenant.
let geoPasse = null;
function geometriePasse() {
  if (geoPasse) return geoPasse;
  // Environ 90 triangles : les étages 5 et 6 frôlent le budget de 260 000.
  const carte = new THREE.BoxGeometry(0.09, 0.008, 0.13).toNonIndexed();
  const anneau = new THREE.TorusGeometry(0.03, 0.005, 4, 10).rotateX(-Math.PI / 2)
    .translate(0, 0.002, -0.085).toNonIndexed();
  geoPasse = partager(mergeGeometries([carte, anneau], false));
  carte.dispose(); anneau.dispose();
  return geoPasse;
}

let dossierChaise;
function geometrieDossier() {
  if (dossierChaise) return dossierChaise;
  const g = new RoundedBoxGeometry(.46,.58,.065,3,.028), p=g.attributes.position;
  for (let i=0;i<p.count;i++) {
    const x=p.getX(i), y=p.getY(i), t=(y+.29)/.58;
    p.setXYZ(i,x*(.84+.16*Math.sin(t*Math.PI)),y,p.getZ(i)+.048*(x/.23)**2-.085*t+.026*Math.sin(t*Math.PI));
  }
  g.computeVertexNormals(); dossierChaise=partager(g); return dossierChaise;
}
let plateauReunion;
function geometrieTableReunion() {
  if(plateauReunion)return plateauReunion;
  const s=new THREE.Shape(),w=2.17,d=.87,r=.30;
  s.moveTo(-w+r,-d);s.lineTo(w-r,-d);s.quadraticCurveTo(w,-d,w,-d+r);
  s.lineTo(w,d-r);s.quadraticCurveTo(w,d,w-r,d);s.lineTo(-w+r,d);
  s.quadraticCurveTo(-w,d,-w,d-r);s.lineTo(-w,-d+r);s.quadraticCurveTo(-w,-d,-w+r,-d);
  const g=new THREE.ExtrudeGeometry(s,{depth:.04,steps:1,bevelEnabled:true,bevelThickness:.015,bevelSize:.025,bevelSegments:2,curveSegments:10});
  g.rotateX(-Math.PI/2);g.translate(0,-.02,0);
  // Les UV d'ExtrudeGeometry sont déjà exprimées dans les unités de la forme (mètres).
  plateauReunion=partager(g);return plateauReunion;
}

export function buildLevel(scene, MAT, plan, niveau) {
  const elevatorPanels = [];
  let elevatorLed = null;
  for (const mat of Object.values(MAT)) if (mat?.isMaterial) partager(mat);
  const root = new THREE.Group();
  scene.add(root);

  const obstacles = [];
  const colliderMeshes = [];
  const emissifs = [];

  function mesh(geo, material, x, y, z, opt = {}) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = opt.cast !== false;
    m.receiveShadow = opt.receive !== false;
    root.add(m);
    return m;
  }

  // Boîte alignée sur les axes + obstacle correspondant.
  function box(x1, z1, x2, z2, h, material, opt = {}) {
    const y0 = opt.y0 || 0;
    const m = mesh(rbox(x2 - x1, h - y0, z2 - z1, opt.r ?? 0.014), material,
      (x1 + x2) / 2, y0 + (h - y0) / 2, (z1 + z2) / 2, opt);
    if (!opt.ghost) {
      obstacles.push({
        x1, z1, x2, z2, h,
        seeThrough: !!opt.seeThrough, noClip: !!opt.noClip, kind: opt.kind || 'solid',
      });
      colliderMeshes.push(m);
    }
    return m;
  }

  // ---------- sols ----------
  const sol = mesh(solAvecTremie(42, 34), MAT.moquette, 0, 0, 0, { cast: false });
  sol.rotation.x = -Math.PI / 2;

  const solCouloir = mesh(solAvecTremie(8, 32, 8, 0), MAT.pierre, 8, 0.008, 0, { cast: false });
  solCouloir.rotation.x = -Math.PI / 2;
  // solAvecTremie fournit déjà les UV métriques.

  const solHall = mesh(new THREE.PlaneGeometry(8.4, 10.4), MAT.pierre, 16, 0.012, 1, { cast: false });
  solHall.rotation.x = -Math.PI / 2;
  uvMetriques(solHall.geometry, 8.4, 10.4);

  // ---------- murs extérieurs ----------
  box(-20, -16.3, 20, -16, WALL_H, MAT.mur, { r: 0.03 });
  // Les limites de déplacement restent les mêmes ; les parois visibles
  // s'ouvrent sur la cage d'escalier et la cabine d'ascenseur.
  box(-20, 16, 20, 16.3, WALL_H, MAT.mur, { r: 0.03 }).removeFromParent();
  box(20, -16, 20.3, 16, WALL_H, MAT.mur, { r: 0.03 }).removeFromParent();
  for (const [a,b] of [[-20,4],[12,20]]) box(a,16,b,16.3,WALL_H,MAT.mur,{ghost:true});
  for (const [a,b] of [[-16,-.08],[3.08,16]]) box(20,a,20.3,b,WALL_H,MAT.mur,{ghost:true});
  box(20,-.08,20.3,3.08,WALL_H,MAT.mur,{ghost:true,y0:2.8});
  baieVitree(-20, -16, 16);

  // ---------- plinthes ----------
  plinthe(-19.98, -16, -19.9, 16);
  plinthe(-20, -15.98, 20, -15.9);
  plinthe(-20,15.9,4,15.98); plinthe(12,15.9,20,15.98);
  plinthe(19.9,-16,19.98,-.08); plinthe(19.9,3.08,19.98,16);

  // ---------- mur open space / couloir (x = 4), portes selon le plan ----------
  {
    const trous = [...plan.portesOS].sort((u, v) => u[0] - v[0]);
    let z = -16;
    for (const [z1, z2] of trous) {
      if (z1 > z) box(3.85, z, 4.15, z1, WALL_H, MAT.mur, { r: 0.03 });
      encadrement(4, (z1 + z2) / 2, 3.0, false, z2-z1);
      z = z2;
    }
    if (z < 16) box(3.85, z, 4.15, 16, WALL_H, MAT.mur, { r: 0.03 });
  }

  // ---------- salles vitrées est : une pour le directeur, une pour les réunions ----------
  const bossAuNord = plan.bossSalle === 'nord';
  // Stores baissés (début de soirée, le directeur est en visio) : seule sa
  // façade côté hall devient opaque, la paroi sur le couloir reste vitrée.
  cageVitree(-16, -4, plan[bossAuNord ? 'porteBoss' : 'porteReunion'], bossAuNord && niveau.stores);
  const porteSalleSud = plan[bossAuNord ? 'porteReunion' : 'porteBoss'];
  cageVitree(6, 16, porteSalleSud, !bossAuNord && niveau.stores);

  // ---------- cage d'escalier ----------
  box(4, 11.85, 7, 12.15, WALL_H, MAT.mur, { r: 0.03 });
  box(9, 11.85, 12, 12.15, WALL_H, MAT.mur, { r: 0.03 });
  encadrement(8, 12, 3.0, true);

  // ---------- postes de travail ----------
  for (const [x, z, ecran, rot] of plan.postes) poste(x, z, ecran, rot || 0);

  // ---------- cloisons basses ----------
  for (const [x1, z1, x2, z2] of plan.cloisons) cloisonBasse(x1, z1, x2, z2);

  // ---------- mobilier ----------
  photocopieuse(-18.4, -14.5);
  box(1.2, -15.4, 3.4, -14.2, 1.8, MAT.plastiqueBlanc, { r: 0.02 });
  // Portes, socle et poignées du rangement de reprographie.
  mesh(rbox(2.24,.04,1.24,.01),MAT.bois,2.3,1.82,-14.8);
  mesh(rbox(2.12,.10,1.12,.01),MAT.aluSombre,2.3,.05,-14.8);
  for(const x of [1.75,2.85]) {
    mesh(rbox(1.07,1.61,.025,.008),MAT.murAccent,x,.91,-14.18);
    mesh(rbox(.025,.22,.04,.008),MAT.alu,x+(x<2.3?.40:-.40),.98,-14.15);
  }
  fontaine(2.6, -10.5);
  machineCafe(18.6, -1.2);
  for (const [z1, z2] of plan.casiers) casiers(2.95, z1, 3.7, z2);
  if (plan.detente) {
    tableBasse(plan.detente.table[0], plan.detente.table[1]);
    for (const [fx, fz, fy] of plan.detente.fauteuils) fauteuil(fx, fz, fy);
  }
  for (const [x, z] of plan.cartons) cartons(x, z);
  for (const [x, z] of plan.plantes) plante(x, z);
  if (plan.canape) canape(plan.canape[0], plan.canape[1]);

  // ---------- aménagement des deux salles vitrées ----------
  const zBoss = bossAuNord ? -9.6 : 10.6;
  const sensBoss = bossAuNord ? 1 : -1;
  bureauDirection(16, zBoss, sensBoss);
  bibliotheque(18.6, bossAuNord ? -15.6 : 13.4, 19.9, bossAuNord ? -12.4 : 15.6);
  tapis(15.5, zBoss + sensBoss * -3.6, 3.6, 3.0, 0x425d58);

  const zReunion = bossAuNord ? 11 : -10;
  tableReunion(16, zReunion);
  ecranMural(19.8, zReunion, -Math.PI / 2);

  // ---------- sorties disponibles ----------
  const sorties = niveau.sorties;
  if (sorties.includes('elevator')) portesAscenseur(20, 1.5);
  else ascenseurCondamne(20, 1.5);

  if (!sorties.includes('stairs')) barriereTravaux(8, 12.6);

  // ---------- objets à récupérer ----------
  const ramassables = [];
  for (const o of (niveau.objets || [])) ramassables.push(objetRamassable(o));

  // ---------- faux plafond + luminaires ----------
  const plafond = mesh(new THREE.PlaneGeometry(41, 33), MAT.plafond, 0, 3.62, 0,
    { cast: false, receive: false });
  uvMetriques(plafond.geometry, 41, 33);
  plafond.rotation.x = Math.PI / 2;

  for (const [x, z, l] of [
    [-14, -9, 3.2], [-14, 3, 3.2], [-8, -9, 3.2], [-8, 3, 3.2], [-2, -9, 3.2], [-2, 3, 3.2],
    [8, -10, 5], [8, -2, 5], [8, 6, 5], [16, -10, 4], [16, 11, 4], [16, 1.5, 3],
  ]) luminaire(x, z, l);

  for (const [x, z] of [[-11, -5], [-5, 6], [1, -12], [8, 12], [18, -14]]) bouche(x, z);

  // ---------- habillage mural ----------
  horloge(-4.5, 2.55, -15.88, 0);
  tableauBlanc(-11.5, 1.95, -15.87, 0);
  extincteur(3.7, -14.6);
  extincteur(11.7, 6.4);

  // ---------- signalétique ----------
  panneau(8, 12.1, Math.PI, sorties.includes('stairs') ? 'SORTIE' : 'FERMÉ', sorties.includes('stairs') ? 0x0d7a3c : 0x75442e);
  panneau(19.55, 1.5, -Math.PI / 2, sorties.includes('elevator') ? 'ASCENSEUR' : 'FERMÉ', sorties.includes('elevator') ? 0x234b49 : 0x75442e);

  // ---------- direction artistique commune et quartier extérieur ----------
  habillerBureau(root, MAT, plan, niveau);
  construireVille(root);
  ossatureBureau(root, MAT, plan);
  cabineAscenseur(root, MAT);
  const escalier = construireEscalier(root, MAT, niveau, obstacles, porteSalleSud);

  // ==========================================================
  //  Éléments
  // ==========================================================

  function plinthe(x1, z1, x2, z2) {
    mesh(rbox(x2 - x1, 0.12, z2 - z1, 0.008), MAT.plastiqueBlanc,
      (x1 + x2) / 2, 0.06, (z1 + z2) / 2, { cast: false });
  }

  function encadrement(x, z, h, horizontal, largeur = 2) {
    const m = mesh(rbox(horizontal ? largeur+.32 : 0.42, 0.22, horizontal ? 0.42 : largeur+.32, 0.02),
      MAT.plastiqueBlanc, x, h + 0.11, z);
    // montants
    for (const s of [-1, 1]) {
      const px = horizontal ? x + s * (largeur/2+.08) : x;
      const pz = horizontal ? z : z + s * (largeur/2+.08);
      mesh(rbox(horizontal ? 0.16 : 0.42, h, horizontal ? 0.42 : 0.16, 0.015),
        MAT.plastiqueBlanc, px, h / 2, pz);
    }
    return m;
  }

  // La baie est une enveloppe : allège, meneaux et vitrages.
  // Seuls les meneaux projettent une ombre — d'où les longues
  // bandes de lumière qui traversent l'open space.
  function baieVitree(x, z1, z2) {
    obstacles.push({ x1: x - 0.3, z1, x2: x - 0.12, z2, h: WALL_H, kind: 'solid' });

    const allege = mesh(rbox(0.34, 0.46, z2 - z1, 0.02), MAT.murAccent, x - 0.15, 0.23, (z1 + z2) / 2);
    colliderMeshes.push(allege);
    mesh(rbox(0.34, 0.30, z2 - z1, 0.02), MAT.murAccent, x - 0.15, 3.45, (z1 + z2) / 2);
    // tablette intérieure
    mesh(rbox(0.42, 0.06, z2 - z1, 0.01), MAT.plastiqueBlanc, x + 0.13, 0.49, (z1 + z2) / 2);

    const vitre = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 2.82, z2 - z1), MAT.verreFenetre);
    vitre.position.set(x - 0.14, 1.89, (z1 + z2) / 2);
    vitre.castShadow = false; vitre.receiveShadow = false;
    root.add(vitre);

    for (let z = z1; z <= z2 + 0.01; z += 2.0) {
      const m = mesh(rbox(0.2, 2.9, 0.13, 0.012), MAT.aluSombre, x - 0.13, 1.9, z);
      m.castShadow = true;
    }
    // traverse horizontale à mi-hauteur
    const tr = mesh(rbox(0.18, 0.1, z2 - z1, 0.01), MAT.aluSombre, x - 0.13, 1.85, (z1 + z2) / 2);
    tr.castShadow = true;
  }

  function cloisonVitree(x1, z1, x2, z2) {
    const w = x2 - x1, d = z2 - z1;
    obstacles.push({ x1, z1, x2, z2, h: WALL_H, seeThrough: true, kind: 'solid' });
    const v = new THREE.Mesh(new THREE.BoxGeometry(w, 2.94, d), MAT.verre);
    v.position.set((x1 + x2) / 2, 1.83, (z1 + z2) / 2);
    v.castShadow = false; v.receiveShadow = false;
    root.add(v);
    colliderMeshes.push(v);
    // profilés haut et bas
    for (const y of [0.18, 3.42]) {
      const p = mesh(rbox(Math.max(w, 0.16), 0.22, Math.max(d, 0.16), 0.012),
        MAT.aluSombre, (x1 + x2) / 2, y, (z1 + z2) / 2);
      p.castShadow = false;
    }
    // montants intermédiaires
    const long = Math.max(w, d);
    const n = Math.floor(long / 2.2);
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const mx = w > d ? x1 + w * t : (x1 + x2) / 2;
      const mz = w > d ? (z1 + z2) / 2 : z1 + d * t;
      mesh(rbox(w > d ? 0.09 : Math.max(w, 0.09), 3.1, w > d ? Math.max(d, 0.09) : 0.09, 0.008),
        MAT.aluSombre, mx, 1.75, mz, { cast: false });
    }
  }

  // Cage de verre : deux parois sur x = 12 encadrant une porte, plus la
  // façade côté hall. Bloque le passage, pas le regard.
  function cageVitree(zDeb, zFin, porte, stores = false) {
    const [pz1, pz2] = porte;
    cloisonVitree(11.85, zDeb, 12.15, pz1);
    cloisonVitree(11.85, pz2, 12.15, zFin);
    const zFacade = zDeb < 0 ? zFin : zDeb;
    cloisonVitree(12, zFacade - 0.15, 20, zFacade + 0.15);
    if (stores) storesBaisses(12.2, 19.8, zFacade + (zDeb < 0 ? -0.24 : 0.24));
    box(11.8, pz1 - 0.2, 12.2, pz1 + 0.1, WALL_H, MAT.aluSombre, { r: 0.02 });
    box(11.8, pz2 - 0.1, 12.2, pz2 + 0.2, WALL_H, MAT.aluSombre, { r: 0.02 });
  }

  // Stores à lamelles côté intérieur : ils coupent le regard sans rien changer
  // aux déplacements (le verre porte déjà la collision).
  function storesBaisses(x1, x2, z) {
    obstacles.push({ x1, z1: z - 0.04, x2, z2: z + 0.04, h: WALL_H, noClip: true, kind: 'stores' });
    // Boîtes simples : 12 triangles chacune au lieu de 300 arrondies (budget).
    const lame = new THREE.BoxGeometry(x2 - x1, 0.012, 0.08), x = (x1 + x2) / 2;
    for (let y = 0.36; y < 3.28; y += 0.1)
      mesh(lame, palette().store, x, y, z, { cast: false }).rotation.x = 0.3;
    mesh(new THREE.BoxGeometry(x2 - x1 + 0.12, 0.1, 0.12), MAT.aluSombre, x, 3.38, z, { cast: false });
  }

  function ascenseurCondamne(x, z) {
    mesh(rbox(0.22, 2.75, 3.5, 0.02), MAT.aluSombre, x - 0.17, 1.37, z);
    for (const s of [-1, 1])
      mesh(rbox(0.09, 2.4, 1.44, 0.012), MAT.aluSombre, x - 0.27, 1.2, z + s * 0.73);
    for (let i = 0; i < 2; i++) {
      const b = mesh(rbox(0.05, 0.14, 3.2, 0.01), palette().jaune,
        x - 0.33, 0.9 + i * 0.7, z);
      b.rotation.x = (i ? -1 : 1) * 0.16;
    }
  }

  function barriereTravaux(x, z) {
    const jaune = palette().jaune;
    for (const s of [-1, 1])
      mesh(rbox(0.09, 1.0, 0.09, 0.02), MAT.plastiqueBlanc, x + s * 0.9, 0.5, z);
    for (let i = 0; i < 2; i++)
      mesh(rbox(1.9, 0.12, 0.05, 0.015), jaune, x, 0.5 + i * 0.32, z);
    obstacles.push({ x1: x - 1.0, z1: z - 0.2, x2: x + 1.0, z2: z + 0.2, h: 1.1, kind: 'prop' });
  }

  // Objet à récupérer : halo pulsant, visible de loin sans être criard.
  function objetRamassable(o) {
    const g = new THREE.Group();
    g.position.set(o.x, o.y, o.z);
    g.userData.noFusion = true;
    root.add(g);
    // Badge blanc, passe de sécurité rouge sur son anneau, portable. Ces objets
    // échappent à la fusion : chaque maillage est un appel de dessin, d'où un
    // passe d'une seule pièce et un halo qui porte aussi la balise.
    const carte = o.id === 'badge' || o.id === 'passe';
    const corps = o.id === 'passe' ? new THREE.Mesh(geometriePasse(), palette().rouge)
      : carte ? new THREE.Mesh(rbox(0.09, 0.13, 0.008, 0.006), MAT.plastiqueBlanc)
      : new THREE.Mesh(rbox(0.32, 0.022, 0.23, 0.008), MAT.aluSombre);
    if(o.id === 'badge')corps.rotation.x=-Math.PI/2;
    corps.castShadow = true;
    g.add(corps);
    if (!carte) {
      const ecr = new THREE.Mesh(rbox(0.31, 0.2, 0.014, 0.006), MAT.aluSombre);
      ecr.position.set(0, 0.1, -0.11); ecr.rotation.x = -0.35; g.add(ecr);
    }
    const halo = new THREE.Mesh(geometrieHalo(),
      new THREE.MeshBasicMaterial({ color: 0xffd487, transparent:true, opacity:.85,
        depthWrite:false, side:THREE.DoubleSide, toneMapped:false }));
    g.add(halo);
    // Les lumières des objectifs sont permanentes dans Game : masquer cet
    // objet ne doit pas changer le nombre de lumières et recompiler les shaders.
    return { ...o, group: g, halo, pris: false };
  }

  function cloisonBasse(x1, z1, x2, z2) {
    box(x1, z1, x2, z2, 1.15, MAT.cloison, { r: 0.012 });
    // rail alu en couronnement : accroche la lumière rasante
    mesh(rbox(x2 - x1 + 0.04, 0.05, z2 - z1 + 0.04, 0.012), MAT.alu,
      (x1 + x2) / 2, 1.175, (z1 + z2) / 2);
  }

  // Un poste complet : plateau, piètement, caisson, écran, clavier,
  // souris, tasse, papiers, post-it, câbles, chaise.
  //
  // Tout est construit en coordonnées locales dans un groupe, ce qui
  // permet d'orienter le poste selon le plan d'étage.
  function poste(x, z, typeEcran, rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    root.add(g);
    const m = (geo, mat, px, py, pz, opt = {}) => {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(px, py, pz);
      o.castShadow = opt.cast !== false;
      o.receiveShadow = opt.receive !== false;
      g.add(o);
      return o;
    };

    const modele = poserDecorBlender('bureau',g,MAT);
    const plateau = modele?.children.find(m=>m.material===MAT.bois) || m(rbox(2.3, 0.045, 1.2, 0.01), MAT.bois, 0, 0.748, 0);
    colliderMeshes.push(plateau);
    // emprise alignée sur les axes : on échange largeur et profondeur
    // quand le poste est tourné d'un quart de tour
    const droit = Math.abs(Math.sin(rot)) < 0.5;
    const dx = droit ? 1.15 : 0.6, dz = droit ? 0.6 : 1.15;
    obstacles.push({ x1: x - dx, z1: z - dz, x2: x + dx, z2: z + dz, h: 0.78, kind: 'desk' });

    if (!modele) {
    for (const s of [-1, 1]) {
      m(rbox(0.06, 0.7, 0.62, 0.012), MAT.aluSombre, s * 1.02, 0.36, 0);
      m(rbox(0.06, 0.05, 1.0, 0.01), MAT.aluSombre, s * 1.02, 0.03, 0);
    }
    m(rbox(1.9, 0.05, 0.06, 0.01), MAT.aluSombre, 0, 0.62, -0.25, { receive: false });
    m(rbox(.42,.56,.52,.012), MAT.plastiqueBlanc, .75,.34,.02);
    for (let i=0;i<3;i++) {
      m(rbox(.385,.172,.022,.006),MAT.plastiqueBlanc,.75,.175+i*.18,.291);
      m(rbox(.39,.007,.025,.002),MAT.aluSombre,.75,.267+i*.18,.293);
      m(rbox(.18,.014,.035,.005),MAT.alu,.75,.22+i*.18,.32);
    }
    for(const xx of [.60,.90])for(const zz of [-.16,.20])m(new THREE.CylinderGeometry(.025,.025,.03,8),MAT.plastiqueNoir,xx,.036,zz).rotation.z=Math.PI/2;
    m(rbox(1.4,.07,.18,.01),MAT.aluSombre,-.15,.635,-.39);
    for(const xx of [-1.02,1.02])for(const zz of [-.43,.43])m(rbox(.07,.02,.09,.005),MAT.plastiqueNoir,xx,.012,zz);

    }

    // écran
    const ecran = new THREE.Group();
    ecran.position.set(-0.35, 0, -0.2);
    ecran.rotation.y = 0.17;
    g.add(ecran);
    const coque = new THREE.Mesh(rbox(0.63, 0.39, 0.035, 0.008), MAT.plastiqueNoir);
    coque.position.y = 1.05; coque.castShadow = true; ecran.add(coque);
    const dalle = new THREE.Mesh(new THREE.PlaneGeometry(0.585, 0.345),
      materiauEcran(typeEcran));
    dalle.position.set(0, 1.05, 0.019); ecran.add(dalle);
    emissifs.push(dalle);
    const pied = new THREE.Mesh(rbox(0.05, 0.16, 0.05, 0.01), MAT.aluSombre);
    pied.position.y = 0.87; pied.castShadow = true; ecran.add(pied);
    const socle = new THREE.Mesh(rbox(0.26, 0.018, 0.17, 0.008), MAT.aluSombre);
    socle.position.y = 0.782; socle.castShadow = true; ecran.add(socle);

    for (let i = 0; i < 2 + (Math.abs(Math.round(x + z)) % 2); i++) {
      const pt = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.058),
        palette().postits[i % 3]);
      pt.position.set(0.335, 1.16 - i * 0.07, 0.02);
      pt.rotation.z = (i % 2 ? 1 : -1) * 0.08;
      ecran.add(pt);
    }

    // clavier à touches modelées
    const clavier = new THREE.Group();
    clavier.position.set(-0.35, 0.775, 0.14);
    clavier.rotation.y = 0.06;
    g.add(clavier);
    const base = new THREE.Mesh(rbox(0.44, 0.016, 0.155, 0.006), MAT.plastiqueNoir);
    base.castShadow = true; clavier.add(base);
    const touches = new THREE.Mesh(geometrieClavier(), MAT.plastiqueNoir);
    touches.castShadow = true;
    clavier.add(touches);
    m(new THREE.PlaneGeometry(0.28, 0.22), MAT.cableNoir, 0.12, 0.772, 0.16,
      { cast: false }).rotation.x = -Math.PI / 2;
    m(rbox(0.055, 0.03, 0.095, 0.014), MAT.plastiqueNoir, 0.12, 0.787, 0.16);

    m(new THREE.CylinderGeometry(.043,.038,.098,16),MAT.plastiqueBlanc,.42,.821,.1);
    m(new THREE.CircleGeometry(.034,16),MAT.boisFonce,.42,.87,.1,{cast:false}).rotation.x=-Math.PI/2;
    const anse = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 8, 16), MAT.plastiqueBlanc);
    anse.position.set(0.473, 0.823, 0.1); anse.rotation.y = Math.PI / 2;
    anse.castShadow = true; g.add(anse);
    m(rbox(0.3, 0.02, 0.22, 0.004), MAT.papier, 0.8, 0.781, -0.14).rotation.y = 0.28;
    m(rbox(0.26, 0.016, 0.19, 0.004), MAT.papier, 0.83, 0.797, -0.1).rotation.y = -0.15;
    m(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 14), MAT.verre, -0.92, 0.85, -0.2);

    const courbe = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.35, 0.74, -0.36),
      new THREE.Vector3(-0.3, 0.42, -0.5),
      new THREE.Vector3(-0.2, 0.06, -0.42),
    ]);
    m(new THREE.TubeGeometry(courbe, 12, 0.008, 6, false), MAT.cableNoir, 0, 0, 0,
      { receive: false });

    personnaliserPoste(g, MAT, typeEcran);

    // la chaise vit dans le repère monde : on transforme sa position
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const lx = -0.25, lz = 1.05;
    chaise(x + lx * cs + lz * sn, z - lx * sn + lz * cs, rot + Math.PI);
  }

  // Chaise de bureau : assise, dossier résille, accoudoirs,
  // vérin, étoile à 5 branches et roulettes.
  function chaise(x, z, yaw) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    root.add(g);
    if(poserDecorBlender('chaise',g,MAT))return g;
    const add = (geo, mat, px, py, pz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true;
      g.add(m); return m;
    };
    add(rbox(0.48, 0.085, 0.46, 0.035), MAT.tissuChaise, 0, 0.45, 0);
    add(geometrieDossier(),MAT.tissuChaise,0,.79,-.20);
    add(rbox(.37,.038,.34,.018),MAT.plastiqueNoir,0,.392,-.015);
    add(rbox(.10,.40,.05,.015),MAT.plastiqueNoir,0,.66,-.263).rotation.x=-.15;
    add(rbox(.31,.08,.06,.023),MAT.plastiqueNoir,0,.70,-.255);
    add(rbox(.12,.015,.026,.006),MAT.aluSombre,.245,.38,.06).rotation.z=-.18;
    for (const s of [-1, 1]) {
      add(rbox(0.05, 0.2, 0.05, 0.02), MAT.plastiqueNoir, s * 0.27, 0.56, -0.02);
      add(rbox(0.07, 0.035, 0.24, 0.015), MAT.plastiqueNoir, s * 0.27, 0.675, 0.02);
    }
    add(new THREE.CylinderGeometry(0.027, 0.027, 0.19, 12), MAT.alu, 0, 0.30, 0);
    add(new THREE.CylinderGeometry(0.048, 0.055, 0.17, 12), MAT.plastiqueNoir, 0, 0.185, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const br = add(rbox(0.3, 0.035, 0.05, 0.015), MAT.plastiqueNoir,
        Math.sin(a) * 0.15, 0.09, Math.cos(a) * 0.15);
      br.rotation.y = a-Math.PI/2;
      add(new THREE.CylinderGeometry(.016,.016,.044,8),MAT.alu,Math.sin(a)*.29,.071,Math.cos(a)*.29);
      for(const side of [-1,1]) {
        const roue=add(new THREE.CylinderGeometry(.034,.034,.018,10),MAT.plastiqueNoir,
          Math.sin(a)*.29+Math.cos(a)*side*.018,.034,Math.cos(a)*.29-Math.sin(a)*side*.018);
        roue.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.cos(a),0,-Math.sin(a)));
      }
    }
    return g;
  }

  function bureauDirection(x, z, sens = 1) {
    const plateau = mesh(rbox(3.0, 0.06, 1.5, 0.014), MAT.boisFonce, x, 0.75, z);
    obstacles.push({ x1: x - 1.5, z1: z - 0.8, x2: x + 1.5, z2: z + 0.8, h: 0.82, kind: 'desk' });
    colliderMeshes.push(plateau);
    for(const dx of [-1.18,1.18]) {
      mesh(rbox(.48,.63,1.22,.012),MAT.boisFonce,x+dx,.40,z);
      mesh(rbox(.39,.09,1.08,.01),MAT.aluSombre,x+dx,.045,z);
      for(let i=0;i<3;i++) {
        mesh(rbox(.42,.19,.026,.006),MAT.bois,x+dx,.21+i*.20,z-.624*sens);
        mesh(rbox(.20,.013,.03,.004),MAT.laiton,x+dx,.25+i*.20,z-.646*sens);
      }
    }
    mesh(rbox(1.87,.44,.065,.01),MAT.boisFonce,x,.49,z+.50*sens);
    mesh(rbox(.06,.17,.06,.008),MAT.aluSombre,x,.87,z-.32*sens);
    mesh(rbox(.34,.025,.21,.009),MAT.aluSombre,x,.796,z-.32*sens);
    mesh(rbox(.44,.02,.15,.006),MAT.plastiqueNoir,x,.80,z-.60*sens);
    mesh(rbox(0.92, 0.53, 0.035, 0.01), MAT.plastiqueNoir, x, 1.1, z - 0.32 * sens);
    const dalle = new THREE.Mesh(new THREE.PlaneGeometry(0.87, 0.48),
      materiauEcran('graph'));
    dalle.position.set(x, 1.1, z - 0.341 * sens);
    dalle.rotation.y = sens > 0 ? Math.PI : 0;
    root.add(dalle);
    emissifs.push(dalle);
    mesh(rbox(0.34, 0.03, 0.24, 0.006), MAT.papier, x + 0.9, 0.795, z + 0.2).rotation.y = 0.2;
    mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 18), MAT.plastiqueBlanc, x - 0.95, 0.8, z + 0.25);
    // lampe de bureau
    mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.02, 16), MAT.aluSombre, x + 1.2, 0.79, z - 0.4);
    const bras = mesh(rbox(0.03, 0.45, 0.03, 0.01), MAT.aluSombre, x + 1.2, 1.02, z - 0.4);
    bras.rotation.z = 0.25;
    const abatjour = mesh(new THREE.ConeGeometry(0.11, 0.14, 16, 1, true), MAT.aluSombre,
      x + 1.08, 1.26, z - 0.4);
    abatjour.rotation.z = Math.PI + 0.3;
    chaise(x, z - 1.3 * sens, sens > 0 ? 0 : Math.PI);
  }

  function tableReunion(x, z) {
    const plateau = mesh(geometrieTableReunion(), MAT.bois, x, 0.75, z);
    obstacles.push({ x1: x - 2.2, z1: z - 0.9, x2: x + 2.2, z2: z + 0.9, h: 0.8, kind: 'desk' });
    colliderMeshes.push(plateau);
    for (const dx of [-1.7, 1.7])
      mesh(rbox(0.12, 0.71, 0.9, 0.02), MAT.aluSombre, x + dx, 0.36, z);
    mesh(rbox(3.2, 0.09, 0.1, 0.02), MAT.aluSombre, x, 0.3, z);
    mesh(rbox(.50,.012,.13,.008),MAT.aluSombre,x+.62,.791,z);
    mesh(rbox(.43,.013,.10,.006),MAT.alu,x+.62,.794,z);
    // boîtier de visio + gobelets
    mesh(rbox(0.36, 0.06, 0.18, 0.015), MAT.plastiqueNoir, x, 0.815, z);
    for (const [dx, dz] of [[-1.2, -0.4], [0.7, 0.35], [1.5, -0.3]])
      mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.09, 14), MAT.plastiqueBlanc, x + dx, 0.79, z + dz);
    for (const dz of [-1.4, 1.4]) for (const dx of [-1.3, 0, 1.3])
      chaise(x + dx, z + dz, dz < 0 ? 0 : Math.PI);
  }

  function ecranMural(x, z, yaw) {
    const g = new THREE.Group(); g.position.set(x, 1.65, z); g.rotation.y = yaw; root.add(g);
    const c = new THREE.Mesh(rbox(2.0, 1.16, 0.06, 0.012), MAT.plastiqueNoir);
    c.castShadow = true; g.add(c);
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.94, 1.1),
      materiauEcran('graph'));
    d.position.z = 0.032; g.add(d);
    emissifs.push(d);
  }

  function casiers(x1, z1, x2, z2) {
    box(x1, z1, x2, z2, 1.85, MAT.aluSombre, { r: 0.016 });
    const n = Math.max(1, Math.round((z2 - z1) / 0.62));
    const pas = (z2 - z1 - 0.08) / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
      const z = z1 + 0.04 + pas * (i + 0.5);
      const y = 0.5 + j * 0.88;
      mesh(rbox(0.035, 0.8, pas - 0.05, 0.01), i % 2 ? MAT.alu : MAT.plastiqueBlanc,
        x1 - 0.015, y, z, { receive: false });
      mesh(rbox(0.02, 0.018, 0.1, 0.006), MAT.aluSombre, x1 - 0.04, y + 0.3, z + pas * 0.28);
    }
  }

  function photocopieuse(x,z) {
    box(x-1,z-.9,x+1,z+.9,1.05,MAT.plastiqueBlanc,{r:.025}).removeFromParent();
    mesh(rbox(1.80,.12,1.6,.015),MAT.aluSombre,x,.10,z);
    mesh(rbox(1.85,.70,1.65,.025),MAT.plastiqueBlanc,x,.49,z);
    for(let i=0;i<3;i++) {
      mesh(rbox(1.68,.205,.035,.008),MAT.plastiqueBlanc,x,.27+i*.215,z+.841);
      mesh(rbox(.38,.026,.04,.008),MAT.aluSombre,x,.31+i*.215,z+.865);
    }
    // Sortie papier en creux entre le scanner et le meuble.
    mesh(rbox(1.76,.18,.15,.008),MAT.aluSombre,x,.89,z-.65);
    for(const dx of [-.82,.82])mesh(rbox(.14,.23,1.5,.012),MAT.plastiqueBlanc,x+dx,.92,z);
    mesh(rbox(1.88,.10,1.74,.018),MAT.plastiqueNoir,x,1.05,z);
    mesh(rbox(1.70,.12,1.51,.024),MAT.plastiqueBlanc,x,1.16,z-.045);
    mesh(rbox(1.0,.05,.65,.018),MAT.plastiqueBlanc,x-.12,1.245,z-.25);
    mesh(rbox(.70,.025,.44,.005),MAT.papier,x-.10,.81,z+.38);
    const c=mesh(rbox(.52,.08,.25,.014),MAT.plastiqueNoir,x+.57,1.12,z+.73);c.rotation.x=.34;
    const e=mesh(new THREE.PlaneGeometry(.34,.15),materiauEcran('copie'),x+.57,1.17,z+.746,{cast:false});e.rotation.x=-Math.PI/2+.34;
    emissifs.push(e);
  }

  function fontaine(x,z) {
    box(x-.25,z-.25,x+.25,z+.25,1.5,MAT.plastiqueBlanc,{r:.03}).removeFromParent();
    mesh(rbox(.48,.70,.46,.025),MAT.plastiqueBlanc,x,.37,z);
    mesh(rbox(.44,.07,.43,.01),MAT.aluSombre,x,.035,z);
    mesh(rbox(.48,.12,.48,.022),MAT.plastiqueBlanc,x,.97,z);
    mesh(rbox(.48,.25,.15,.012),MAT.plastiqueBlanc,x,.815,z-.15);
    for(const dx of [-.205,.205])mesh(rbox(.065,.25,.44,.012),MAT.plastiqueBlanc,x+dx,.815,z);
    mesh(rbox(.34,.024,.25,.006),MAT.aluSombre,x,.736,z+.08);
    for(const dx of [-.085,.085])mesh(rbox(.055,.065,.10,.01),dx<0?MAT.alu:palette().rouge,x+dx,.9,z+.08);
    const j=mesh(new THREE.CylinderGeometry(.17,.14,.40,20),MAT.verre,x,1.28,z,{cast:false});
    mesh(new THREE.CylinderGeometry(.136,.136,.32,16),MAT.eau,x,1.245,z,{cast:false});
    for(const y of [1.12,1.40])mesh(new THREE.TorusGeometry(.17,.012,6,20),MAT.alu,x,y,z).rotation.x=Math.PI/2;
    mesh(new THREE.CylinderGeometry(.07,.07,.10,16),MAT.plastiqueBlanc,x,1.045,z);
  }

  function machineCafe(x,z) {
    box(x-.32,z-.3,x+.32,z+.3,1.4,MAT.plastiqueNoir,{r:.02}).removeFromParent();
    mesh(rbox(.60,.78,.58,.018),MAT.boisFonce,x,.40,z);
    mesh(rbox(.63,.035,.6,.009),MAT.alu,x,.802,z);
    mesh(rbox(.62,.08,.59,.015),MAT.plastiqueNoir,x,.075,z);
    mesh(rbox(.20,.56,.59,.014),MAT.plastiqueNoir,x+.21,1.11,z);
    mesh(rbox(.63,.27,.59,.020),MAT.plastiqueNoir,x,1.265,z);
    for(const dz of [-.265,.265])mesh(rbox(.62,.35,.055,.01),MAT.alu,x,1.02,z+dz);
    mesh(rbox(.52,.022,.43,.007),MAT.aluSombre,x-.04,.845,z);
    for(let i=0;i<6;i++)mesh(rbox(.37,.006,.014,.002),MAT.alu,x-.07,.86,z-.15+i*.06);
    const p=mesh(new THREE.PlaneGeometry(.24,.12),materiauEcran('cafe'),x-.322,1.29,z,{cast:false});p.rotation.y=-Math.PI/2;emissifs.push(p);
    mesh(new THREE.CylinderGeometry(.018,.024,.07,10),MAT.alu,x-.10,1.11,z);
    mesh(new THREE.CylinderGeometry(.036,.028,.08,14),MAT.plastiqueBlanc,x-.10,.902,z);
    mesh(new THREE.CircleGeometry(.028,14),MAT.boisFonce,x-.10,.943,z,{cast:false}).rotation.x=-Math.PI/2;
    mesh(rbox(.008,.16,.028,.004),MAT.alu,x-.307,.49,z+.19);
  }

  function tableBasse(x, z) {
    const t = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 28), MAT.bois, x, 0.66, z);
    obstacles.push({ x1: x - 0.6, z1: z - 0.6, x2: x + 0.6, z2: z + 0.6, h: 0.7, kind: 'desk' });
    colliderMeshes.push(t);
    mesh(new THREE.CylinderGeometry(0.06, 0.2, 0.62, 16), MAT.aluSombre, x, 0.33, z);
    mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 14), MAT.plastiqueBlanc, x + 0.2, 0.735, z - 0.12);
    mesh(rbox(0.22, 0.03, 0.3, 0.006), MAT.papier, x - 0.18, 0.7, z + 0.1).rotation.y = 0.4;
  }

  function fauteuil(x, z, yaw) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; root.add(g);
    const add = (geo, m, py, pz, px = 0) => {
      const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz);
      o.castShadow = true; o.receiveShadow = true; g.add(o); return o;
    };
    add(rbox(0.6, 0.34, 0.6, 0.06), MAT.tissuCanape, 0.28, 0);
    add(rbox(0.6, 0.46, 0.16, 0.05), MAT.tissuCanape, 0.62, -0.24);
    for (const s of [-1, 1]) add(rbox(0.1, 0.16, 0.5, 0.04), MAT.tissuCanape, 0.5, 0.02, s * 0.25);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      add(new THREE.CylinderGeometry(0.02, 0.016, 0.16, 8), MAT.bois, 0.08, sz * 0.22, sx * 0.22);
    obstacles.push({ x1: x - 0.3, z1: z - 0.3, x2: x + 0.3, z2: z + 0.3, h: 0.85, kind: 'desk' });
  }

  function canape(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g);
    const add = (geo, px, py, pz) => {
      const o = new THREE.Mesh(geo, MAT.tissuCanape); o.position.set(px, py, pz);
      o.castShadow = true; o.receiveShadow = true; g.add(o);
    };
    add(rbox(1.0, 0.3, 2.2, 0.07), 0, 0.3, 0);
    add(rbox(0.3, 0.52, 2.2, 0.06), -0.42, 0.62, 0);
    for (const s of [-1, 1]) add(rbox(0.9, 0.2, 0.22, 0.05), 0.04, 0.58, s * 1.0);
    for (const s of [-1, 1]) add(rbox(0.42, 0.14, 0.42, 0.05), 0.06, 0.52, s * 0.5);
    obstacles.push({ x1: x - 0.55, z1: z - 1.1, x2: x + 0.55, z2: z + 1.1, h: 0.85, kind: 'desk' });
  }

  function bibliotheque(x1, z1, x2, z2) {
    // Même obstacle, mais un vrai meuble ouvert : la boîte pleine cachait
    // tous les livres. Les fonds sont à l'est, les dos orientés vers la pièce.
    obstacles.push({ x1, z1, x2, z2, h: 1.9, seeThrough: false, noClip: false, kind: 'solid' });
    mesh(rbox(0.07, 1.9, z2 - z1, 0.01), MAT.boisFonce, x2 - 0.035, 0.95, (z1 + z2) / 2);
    for (const z of [z1 + 0.035, z2 - 0.035])
      mesh(rbox(x2 - x1, 1.9, 0.07, 0.01), MAT.boisFonce, (x1 + x2) / 2, 0.95, z);
    for (let et = 0; et <= 4; et++) {
      const y = 0.06 + et * 0.45;
      mesh(rbox(x2 - x1, 0.045, z2 - z1, 0.008), MAT.boisFonce, (x1 + x2) / 2, y, (z1 + z2) / 2);
      if (et === 4) continue;
      for (let i = 0, z = z1 + 0.16; z < z2 - 0.15; i++, z += 0.10) {
        if ((i + et * 3) % 13 > 9) continue;
        const h = 0.24 + (i % 3) * 0.024;
        mesh(rbox(0.29, h, 0.066, 0.004), palette().livres[(i + et) % 6], x1 + 0.22, y + 0.025 + h / 2, z);
        mesh(rbox(0.003, 0.035, 0.045, 0.001), MAT.papier, x1 + 0.073, y + 0.12, z, { cast: false });
      }
    }
  }

  function tapis(x, z, w, d, couleur) {
    const t = mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.98 }),
      x, 0.006, z, { cast: false });
    t.rotation.x = -Math.PI / 2;
  }

  function cartons(x, z) {
    const tailles = [[0.7, 0.5, 0.6, 0], [0.55, 0.42, 0.5, 0.5], [0.45, 0.35, 0.42, 0.92]];
    for (const [w, h, d, y] of tailles) {
      const b = mesh(rbox(w, h, d, 0.012), MAT.carton, x + (y ? 0.06 : 0), y + h / 2, z + (y ? -0.05 : 0));
      b.rotation.y = y * 0.6;
      // bande adhésive
      const ruban = new THREE.Mesh(new THREE.PlaneGeometry(0.07, d * 0.98), palette().ruban);
      ruban.position.set(0, h / 2 + 0.001, 0); ruban.rotation.x = -Math.PI / 2;
      b.add(ruban);
    }
    obstacles.push({ x1: x - 0.42, z1: z - 0.38, x2: x + 0.42, z2: z + 0.38, h: 1.28, kind: 'prop' });
  }

  function plante(x, z) {
    mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.38, 20), MAT.terreCuite, x, 0.19, z);
    mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.025, 16), palette().terreau, x, 0.376, z, { cast: false });
    for (let j = 0; j < 3; j++) {
      const px = x + (j - 1) * 0.06, pz = z + (j % 2) * 0.06;
      mesh(new THREE.CylinderGeometry(0.009, 0.016, 0.73, 7), MAT.boisFonce, px, 0.74, pz);
      for (let i = 0; i < 5; i++) {
        const a = i * 2.4 + j * 1.3;
        const f = mesh(feuilleFicus(), palette().feuilles[(i + j) % 2], px, 0.53 + i * 0.13, pz);
        f.rotation.set(0.6 + (i % 2) * 0.25, a, 0.18);
        f.scale.setScalar(0.7 + (i % 3) * 0.12);
      }
    }
    obstacles.push({ x1: x - 0.3, z1: z - 0.3, x2: x + 0.3, z2: z + 0.3, h: 1.45, kind: 'prop' });
  }

  function portesAscenseur(x, z) {
    for (const dz of [-1.64,1.64])mesh(rbox(.26,2.8,.22,.018),MAT.laiton,x-.17,1.4,z+dz);
    mesh(rbox(.26,.37,3.50,.018),MAT.laiton,x-.17,2.61,z);
    for (const s of [-1, 1]) {
      const d = mesh(rbox(0.09, 2.4, 1.44, 0.012), MAT.laiton, x - 0.27, 1.2, z + s * 0.73);
      d.userData.side = s;
      d.userData.noFusion = true;
      elevatorPanels.push(d);
    }
    const pan = mesh(rbox(0.05, 0.3, 0.2, 0.01), MAT.aluSombre, x - 0.3, 1.25, z - 2.05);
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16),
      new THREE.MeshBasicMaterial({ color: 0x2a2f36 }));
    led.position.set(x - 0.335, 1.3, z - 2.05); led.rotation.y = -Math.PI / 2;
    root.add(led);
    led.userData.noFusion = true;
    elevatorLed = led;
    // afficheur d'étage
    const aff = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.14),
      new THREE.MeshBasicMaterial({ color: 0xff7b32 }));
    aff.position.set(x - 0.29, 2.72, z); aff.rotation.y = -Math.PI / 2;
    root.add(aff); emissifs.push(aff);
  }

  function luminaire(x, z, longueur) {
    if(x !== 8)for(const dz of [-longueur*.32,longueur*.32])
      mesh(rbox(.012,.43,.012,.002),MAT.alu,x,3.365,z+dz,{cast:false});
    const corps = mesh(rbox(0.16, 0.07, longueur, 0.02), MAT.alu, x, x === 8 ? 3.32 : 3.12, z, { cast: false });
    const tube = new THREE.Mesh(new THREE.PlaneGeometry(0.13, longueur - 0.06),
      palette().neon);
    tube.position.set(x, x === 8 ? 3.282 : 3.082, z); tube.rotation.x = Math.PI / 2;
    root.add(tube);
    emissifs.push(tube);
  }

  function bouche(x, z) {
    mesh(rbox(0.6, 0.03, 0.6, 0.01), MAT.alu, x, x === 8 ? 3.34 : 3.6, z, { cast: false });
    for (let i = 0; i < 7; i++)
      mesh(rbox(0.52, 0.012, 0.025, 0.004), MAT.aluSombre, x, x === 8 ? 3.318 : 3.578, z - 0.24 + i * 0.08,
        { cast: false });
  }

  function horloge(x, y, z, ry) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; root.add(g);
    const corps = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 32), MAT.aluSombre);
    corps.rotation.x = Math.PI / 2; corps.castShadow = true; g.add(corps);
    const cadran = new THREE.Mesh(new THREE.CircleGeometry(0.19, 32), palette().cadran);
    cadran.position.z = 0.027; g.add(cadran);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const t = new THREE.Mesh(rbox(0.012, i % 3 ? 0.022 : 0.036, 0.004, 0.002), MAT.plastiqueNoir);
      t.position.set(Math.sin(a) * 0.155, Math.cos(a) * 0.155, 0.03);
      t.rotation.z = -a; g.add(t);
    }
    // il est 18:00 — l'heure de partir
    const aiguilleH = new THREE.Mesh(rbox(0.016, 0.1, 0.005, 0.002), MAT.plastiqueNoir);
    aiguilleH.position.set(0, -0.05, 0.033); g.add(aiguilleH);
    const aiguilleM = new THREE.Mesh(rbox(0.012, 0.15, 0.005, 0.002), MAT.plastiqueNoir);
    aiguilleM.position.set(0, 0.075, 0.033); g.add(aiguilleM);
  }

  function tableauBlanc(x, y, z, ry) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; root.add(g);
    const cadre = new THREE.Mesh(rbox(3.1, 1.6, 0.06, 0.012), MAT.alu);
    cadre.castShadow = true; g.add(cadre);
    panneauGraphique(g, 'planning', 2.98, 1.48, 0, 0, 0.033);
    const tablette = new THREE.Mesh(rbox(3.1, 0.05, 0.1, 0.012), MAT.alu);
    tablette.position.set(0, -0.82, 0.06); tablette.castShadow = true; g.add(tablette);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.13, 8),
        palette().feutres[i]);
      f.position.set(-0.6 + i * 0.18, -0.78, 0.08); f.rotation.z = Math.PI / 2; g.add(f);
    }
  }

  function extincteur(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -Math.PI / 2; root.add(g);
    const corps = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 16),
      palette().rouge);
    corps.position.y = 0.72; corps.castShadow = true; g.add(corps);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 10), MAT.aluSombre);
    col.position.y = 0.97; g.add(col);
    const support = new THREE.Mesh(rbox(0.13, 0.22, 0.04, 0.008), MAT.aluSombre);
    support.position.set(0, 0.72, -0.09); g.add(support);
  }

  function panneau(x, z, ry, texte, fond) {
    const cv = document.createElement('canvas');
    cv.width = 320; cv.height = 96;
    const g = cv.getContext('2d');
    g.fillStyle = '#' + fond.toString(16).padStart(6, '0');
    g.fillRect(0, 0, 320, 96);
    g.fillStyle = '#ffffff';
    g.font = 'bold 40px system-ui,sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(texte, 160, 50);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.345),
      new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, 2.8, z); m.rotation.y = ry;
    root.add(m);
    emissifs.push(m);
    mesh(rbox(1.2, 0.4, 0.05, 0.012), MAT.aluSombre,
      x - Math.sin(ry) * 0.03, 2.8, z - Math.cos(ry) * 0.03, { cast: false })
      .rotation.y = ry;
  }

  // Une unité UV représente un mètre quel que soit le rectangle.
  function uvMetriques(geo, u, v) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
  }

  const statsFusion = fusionnerStatiques(root);

  const TOUTES_SORTIES = [
    { id: 'elevator', x: 18.4, z: 1.5, r: 2.0, label: "Appeler l'ascenseur" },
    { id: 'stairs', x: 8.0, z: 13.0, r: 2.0, label: 'Prendre les escaliers' },
  ];
  const interactables = TOUTES_SORTIES.filter(e => sorties.includes(e.id));

  return {
    root, obstacles, colliderMeshes, interactables, emissifs, ramassables, statsFusion,
    escalier, elevatorPanels, get elevatorLed() { return elevatorLed; },
    playerStart: { ...plan.depart },
    // libère la scène entre deux niveaux
    dispose() {
      libererArbre(root);
    },
  };
}

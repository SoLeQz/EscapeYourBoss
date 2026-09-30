// Accessoires des étages modélisés dans Blender (assets/accessoires-v01.glb,
// tools/blender/creer_accessoires.py) : canards, distributeur, disjoncteur,
// carton-cachette, aspirateur robot, nacelle, toboggan, pièce secrète.
//
// Trois matériaux à couleurs de sommet (peint, verni, lumière) servent à tous les
// accessoires : posés en statique, ils fusionnent avec le décor en trois lots au
// plus. Les autres pièces prennent un matériau du niveau (carton, bois, verre…).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { verifierConteneurGLB } from './personnage-glb.js';
import { partager, libererArbre } from './resources.js';

export const FICHIER_ACCESSOIRES = 'accessoires-v01.glb';
// Mobilier v02 (tools/blender/creer_mobilier.py) : même contrat, cache séparé.
export const FICHIER_MOBILIER = 'mobilier-v02.glb';
export const FICHIER_DEPARTEMENTS = 'departements-v01.glb';
const departements = new Map(); let chargementDepartements;
export function etatDepartements() { return Object.fromEntries([...departements].map(([id,lots])=>[id,{triangles:lots.reduce((s,l)=>s+l.geometry.attributes.position.count/3,0)}])); }
export async function prechargerDepartements(lire = nom => window.jeuAssets.lire(nom)) {
  if(chargementDepartements)return chargementDepartements;
  chargementDepartements=chargerKit(FICHIER_DEPARTEMENTS,lire,departements,'Départements absents : ').then(etatDepartements);
  try{return await chargementDepartements;}catch(e){chargementDepartements=null;throw e;}
}
const COULEURS = new Set(['peint', 'verni', 'lumiere']);
const DU_NIVEAU = new Set(['verre', 'carton', 'boisFonce', 'bois', 'alu', 'aluSombre', 'plastiqueNoir', 'plastiqueBlanc', 'papier', 'tissuCanape', 'laiton',
  'terreCuite', 'cableNoir', 'eau', 'beton', 'murAccent', 'tissuChaise', 'cloison']);
const ROLES = new Set(['levier', 'yeux', 'trappe', 'bouton', 'ecran', 'porte']);

const cache = new Map(), mobilier = new Map(); let chargement = null, chargementMobilier = null, materiaux = null;
export function accessoiresDisponibles() { return cache.size > 0; }
export function etatAccessoires() {
  return Object.fromEntries([...cache].map(([id, lots]) => [id, {
    lots: lots.length, triangles: lots.reduce((s, l) => s + l.geometry.attributes.position.count / 3, 0),
    materiaux: [...new Set(lots.map(l => l.materiau))], roles: [...new Set(lots.map(l => l.role).filter(Boolean))],
  }]));
}
export function materiauxAccessoires() {
  if (materiaux) return materiaux;
  materiaux = {
    peint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }),
    verni: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.35 }),
    lumiere: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  for (const [nom, m] of Object.entries(materiaux)) { m.name = 'Accessoire:' + nom; partager(m); }
  return materiaux;
}

// UV en mètres, projetées sur le plan dominant de chaque face : les matières du
// niveau (carton, chêne) gardent l'échelle de leurs textures.
function uvMetriques(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    for (let k = i; k < i + 3; k++) {
      const [u, v] = ay >= ax && ay >= az ? [p.getX(k), p.getZ(k)] : ax >= az ? [p.getZ(k), p.getY(k)] : [p.getX(k), p.getY(k)];
      uv[k * 2] = u; uv[k * 2 + 1] = v;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export async function prechargerAccessoires(lire = nom => window.jeuAssets.lire(nom)) {
  if (chargement) return chargement;
  chargement = chargerKit(FICHIER_ACCESSOIRES, lire, cache, 'Accessoires absents : ').then(etatAccessoires);
  try { return await chargement; } catch (e) { chargement = null; throw e; }
}

export function mobilierDisponible() { return mobilier.size > 0; }
export function etatMobilier() {
  return Object.fromEntries([...mobilier].map(([id, lots]) => [id, {
    lots: lots.length, triangles: lots.reduce((s, l) => s + l.geometry.attributes.position.count / 3, 0),
    materiaux: [...new Set(lots.map(l => l.materiau))],
  }]));
}
export async function prechargerMobilier(lire = nom => window.jeuAssets.lire(nom)) {
  if (chargementMobilier) return chargementMobilier;
  chargementMobilier = chargerKit(FICHIER_MOBILIER, lire, mobilier, 'Mobilier absent : ').then(etatMobilier);
  try { return await chargementMobilier; } catch (e) { chargementMobilier = null; throw e; }
}

// Lecture stricte d'un GLB au contrat des accessoires : acc_id, rôle et pivot,
// matériaux ACC_*. Rien n'est exposé tant que tout le fichier n'est pas validé.
async function chargerKit(FICHIER, lire, cible, absent) {
  {
    const bytes = await lire(FICHIER);
    if (!bytes) throw Error(absent + FICHIER);
    verifierConteneurGLB(bytes);
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => { if (url.startsWith('blob:')) return url; throw Error('Ressource externe dans ' + FICHIER); });
    const gltf = await new GLTFLoader(manager).parseAsync(bytes, '');
    const groupes = new Map();
    try {
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        const source = 'acc_id' in o.userData || !o.parent || o.parent === gltf.scene ? o : o.parent;
        const { acc_id: id, acc_role: role = '', acc_pivot: pivot = null } = source.userData;
        const materiau = o.material?.name?.replace(/^ACC_/, '');
        if (o.isSkinnedMesh || Array.isArray(o.material)) throw Error('Accessoire incompatible : ' + o.name);
        if (typeof id !== 'string') throw Error('Accessoire sans identifiant : ' + o.name);
        if (!COULEURS.has(materiau) && !DU_NIVEAU.has(materiau)) throw Error('Matériau inconnu : ' + o.material?.name);
        if (role && !ROLES.has(role)) throw Error('Rôle inconnu : ' + role);
        if (role && !(Array.isArray(pivot) && pivot.length === 3 && pivot.every(Number.isFinite))) throw Error('Pivot absent : ' + o.name);
        const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
        const couleur = geo.attributes.color;
        for (const k of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(k)) geo.deleteAttribute(k);
        if (COULEURS.has(materiau)) {
          if (!couleur) { geo.dispose(); throw Error('Couleurs de sommet absentes : ' + o.name); }
          const c = new Float32Array(couleur.count * 3);
          for (let i = 0; i < couleur.count; i++) { c[i * 3] = couleur.getX(i); c[i * 3 + 1] = couleur.getY(i); c[i * 3 + 2] = couleur.getZ(i); }
          geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        }
        if (!geo.attributes.position.array.every(Number.isFinite)) { geo.dispose(); throw Error('Sommet invalide : ' + o.name); }
        if (role) geo.translate(-pivot[0], -pivot[1], -pivot[2]);
        uvMetriques(geo);
        const cle = JSON.stringify([id, role, role ? pivot.map(v => +v.toFixed(4)) : null, materiau]);
        if (!groupes.has(cle)) groupes.set(cle, { id, role, pivot: role ? pivot : null, materiau, geos: [] });
        groupes.get(cle).geos.push(geo);
      });
      for (const { geos, ...lot } of groupes.values()) {
        const geometry = mergeGeometries(geos, false);
        if (!geometry) throw Error('Fusion impossible : ' + lot.id);
        geometry.computeBoundingSphere();
        if (!cible.has(lot.id)) cible.set(lot.id, []);
        cible.get(lot.id).push({ ...lot, geometry: partager(geometry) });
      }
      if (!cible.size) throw Error('Fichier vide : ' + FICHIER);
    } catch (e) {
      for (const lots of cible.values()) for (const l of lots) l.geometry.dispose();
      cible.clear(); throw e;
    } finally {
      for (const g of groupes.values()) for (const geo of g.geos) geo.dispose();
      libererArbre(gltf.scene);
    }
  }
}

// Lots bruts d'un accessoire (canards instanciés) ou d'un meuble du kit v02.
export function lotsAccessoire(id) { return cache.get(id) || mobilier.get(id) || departements.get(id) || []; }

// Pose un accessoire. `mobile` : il bouge (aspirateur, nacelle, carton) et
// échappe à la fusion du décor. Les parties à rôle (manette, trappe, porte…)
// sont des pivots animables, toujours hors fusion. Sans préchargement (tests de
// géométrie), renvoie un groupe vide : le jeu garde ses obstacles et ses règles.
export function poserAccessoire(id, parent, MAT, { x = 0, y = 0, z = 0, yaw = 0, mobile = false, ombre = true } = {}) {
  const groupe = new THREE.Group();
  groupe.name = 'Accessoire:' + id; groupe.userData.accessoire = id;
  groupe.position.set(x, y, z); groupe.rotation.y = yaw;
  if (mobile) groupe.userData.noFusion = true;
  parent.add(groupe);
  const roles = {};
  const M = materiauxAccessoires();
  for (const lot of lotsAccessoire(id)) {
    const materiau = COULEURS.has(lot.materiau) ? M[lot.materiau] : MAT[lot.materiau];
    if (!materiau) throw Error('Matériau du niveau manquant : ' + lot.materiau);
    const m = new THREE.Mesh(lot.geometry, materiau);
    m.name = 'Accessoire:' + id + ':' + (lot.role || 'corps') + ':' + lot.materiau;
    m.castShadow = ombre && lot.materiau !== 'verre' && lot.materiau !== 'lumiere';
    m.receiveShadow = lot.materiau !== 'lumiere';
    if (lot.role) {
      if (!roles[lot.role]) {
        const p = new THREE.Group(); p.name = 'Accessoire:' + id + ':' + lot.role;
        p.position.fromArray(lot.pivot); p.userData.noFusion = true; groupe.add(p); roles[lot.role] = p;
      }
      roles[lot.role].add(m);
    } else groupe.add(m);
  }
  return { groupe, roles };
}

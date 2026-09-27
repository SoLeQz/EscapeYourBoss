// Garde-robe modélisée dans Blender (assets/garde-robe-v01.glb), montée sur le rig.
// Chaque pièce est écrite dans le repère de son os (`tete` ou `buste`) : aucune mise
// à l'échelle au jeu. Les géométries sont regroupées par pièce et par matériau.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { verifierConteneurGLB } from './personnage-glb.js';
import { partager, libererArbre } from './resources.js';

export const FICHIER_GARDE_ROBE = 'garde-robe-v01.glb';
const OS = new Set(['tete', 'buste']);
const ROLES = new Set(['helice', 'flamme']);
// Matériaux fixes, partagés par tous les personnages. `teinte` prend la couleur de
// l'emplacement, `cheveux` celle des cheveux ; les autres gardent la leur.
const FIXES = {
  teinte2: { color: 0xeeebe2, roughness: .6 }, noir: { color: 0x0a0a0c, roughness: .45 },
  blanc: { color: 0xf1efea, roughness: .6 }, or: { color: 0xf5ba4a, roughness: .28, metalness: 1 },
  metal: { color: 0xc4c8cf, roughness: .3, metalness: 1 }, verreFonce: { color: 0x07090b, roughness: .05, metalness: .2 },
  verreClair: { color: 0xc8dde6, roughness: .05, transparent: true, opacity: .35 },
  fluo: { color: 0xd8ff1a, roughness: .5, emissive: 0x3a4a00 }, reflechissant: { color: 0xd4d7da, roughness: .25, metalness: .6 },
  rouge: { color: 0xe0140e, roughness: .35 }, cyan: { color: 0x10c8e8, roughness: .35 }, jaune: { color: 0xffc70d, roughness: .45 },
  bleu: { color: 0x1046e0, roughness: .45 }, rose: { color: 0xff7aa6, roughness: .6 }, vert: { color: 0x238c2e, roughness: .6 },
  flamme: { color: 0xff7a14, emissive: 0xff5a00, emissiveIntensity: 2.2, roughness: .9, toneMapped: false },
};
const PERSONNALISABLES = new Set(['teinte', 'cheveux']);

const cache = new Map(); let chargement = null; let materiaux = null;
export function gardeRobeDisponible() { return cache.size > 0; }
export function etatGardeRobe() {
  return Object.fromEntries([...cache].map(([id, lots]) => [id, {
    os: lots[0].os, lots: lots.length, triangles: lots.reduce((s, l) => s + l.geometry.attributes.position.count / 3, 0),
    materiaux: [...new Set(lots.map(l => l.materiau))], roles: [...new Set(lots.map(l => l.role).filter(Boolean))],
  }]));
}

function materiauxFixes() {
  if (materiaux) return materiaux;
  materiaux = Object.fromEntries(Object.entries(FIXES).map(([nom, p]) => [nom, partager(new THREE.MeshStandardMaterial(p))]));
  return materiaux;
}

export async function prechargerGardeRobe(lire = nom => window.jeuAssets.lire(nom)) {
  if (chargement) return chargement;
  chargement = (async () => {
    const bytes = await lire(FICHIER_GARDE_ROBE);
    if (!bytes) throw Error('Garde-robe absente : ' + FICHIER_GARDE_ROBE);
    verifierConteneurGLB(bytes);
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => { if (url.startsWith('blob:')) return url; throw Error('Ressource externe dans ' + FICHIER_GARDE_ROBE); });
    const gltf = await new GLTFLoader(manager).parseAsync(bytes, '');
    const groupes = new Map();
    try {
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        // Une pièce à plusieurs matériaux arrive en groupe de maillages : ses
        // propriétés sont portées par le groupe (nœud glTF), pas par les primitives.
        const source = 'garde_id' in o.userData || !o.parent || o.parent === gltf.scene ? o : o.parent;
        const { garde_id: id, garde_os: os, garde_role: role = '', garde_pivot: pivot = null } = source.userData;
        const materiau = o.material?.name?.replace(/^GARDE_/, '');
        if (o.isSkinnedMesh || Array.isArray(o.material)) throw Error('Pièce de garde-robe incompatible : ' + o.name);
        if (typeof id !== 'string' || !OS.has(os)) throw Error('Pièce sans identifiant ou os : ' + o.name);
        if (!(materiau in FIXES) && !PERSONNALISABLES.has(materiau)) throw Error('Matériau inconnu : ' + o.material?.name);
        if (role && !ROLES.has(role)) throw Error('Rôle inconnu : ' + role);
        if (role && !(Array.isArray(pivot) && pivot.length === 3 && pivot.every(Number.isFinite))) throw Error('Pivot absent : ' + o.name);
        const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
        for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        if (!geo.attributes.position.array.every(Number.isFinite)) { geo.dispose(); throw Error('Sommet invalide : ' + o.name); }
        // Une partie animée tourne autour de son pivot : on l'y ramène.
        if (role) geo.translate(-pivot[0], -pivot[1], -pivot[2]);
        const cle = JSON.stringify([id, os, role, role ? pivot.map(v => +v.toFixed(4)) : null, materiau]);
        if (!groupes.has(cle)) groupes.set(cle, { id, os, role, pivot: role ? pivot : null, materiau, geos: [] });
        groupes.get(cle).geos.push(geo);
      });
      for (const { geos, ...lot } of groupes.values()) {
        const geometry = mergeGeometries(geos, false);
        if (!geometry) throw Error('Fusion impossible : ' + lot.id);
        geometry.computeBoundingSphere();
        if (!cache.has(lot.id)) cache.set(lot.id, []);
        cache.get(lot.id).push({ ...lot, geometry: partager(geometry) });
      }
      if (!cache.size) throw Error('Garde-robe vide');
    } catch (e) {
      for (const lots of cache.values()) for (const l of lots) l.geometry.dispose();
      cache.clear(); throw e;
    } finally {
      for (const g of groupes.values()) for (const geo of g.geos) geo.dispose();
      libererArbre(gltf.scene);
    }
    return etatGardeRobe();
  })();
  try { return await chargement; } catch (e) { chargement = null; throw e; }
}

// Pose les pièces choisies sur le personnage. `garde` : { tete, yeux, moustache, cou,
// torse, dos, couleurs: { tete, torse, dos, cou, moustache } }. Renvoie les parties animées.
export function poserGardeRobe(parts, garde) {
  const animees = [];
  if (!garde || !gardeRobeDisponible()) return animees;
  const fixes = materiauxFixes(), teintes = new Map(), pivots = new Map();
  const teinte = (emplacement, hex) => {
    const cle = emplacement + hex;
    if (!teintes.has(cle)) teintes.set(cle, new THREE.MeshStandardMaterial({ color: hex, roughness: emplacement === 'moustache' ? .5 : .62 }));
    return teintes.get(cle);
  };
  for (const [emplacement, id] of Object.entries(garde)) {
    if (emplacement === 'couleurs' || !cache.has(id)) continue;
    for (const lot of cache.get(id)) {
      const hex = garde.couleurs?.[emplacement === 'yeux' ? 'tete' : emplacement] ?? 0xc62828;
      const materiau = lot.materiau === 'teinte' ? teinte(emplacement, hex)
        : lot.materiau === 'cheveux' ? teinte('moustache', garde.couleurs?.moustache ?? 0x14100d) : fixes[lot.materiau];
      const m = new THREE.Mesh(lot.geometry, materiau);
      m.name = 'Garde-robe:' + id + ':' + lot.materiau;
      m.castShadow = lot.geometry.boundingSphere.radius > .055; m.receiveShadow = m.castShadow;
      const os = lot.os === 'tete' ? parts.teteMicro : parts.upper;
      if (lot.role) {
        // Un pivot par partie animée : les lots de chaque matériau tournent ensemble.
        const cle = id + lot.role + lot.pivot.join();
        if (!pivots.has(cle)) {
          const pivot = new THREE.Group(); pivot.name = 'Garde-robe:' + id + ':' + lot.role;
          pivot.position.fromArray(lot.pivot); os.add(pivot); pivots.set(cle, pivot);
          animees.push({ objet: pivot, role: lot.role, phase: animees.length * 1.7 });
        }
        pivots.get(cle).add(m);
      } else os.add(m);
    }
  }
  return animees;
}

// Hélice qui tourne, flammes qui vacillent (quelques opérations par image).
export function animerGardeRobe(animees, t, vitesse = 0) {
  for (const a of animees) {
    if (a.role === 'helice') a.objet.rotation.y = t * (14 + vitesse * 6) + a.phase;
    else if (a.role === 'flamme') {
      const f = .78 + .18 * Math.sin(t * 43 + a.phase) + .1 * Math.sin(t * 71 + a.phase * 2);
      a.objet.scale.set(.9 + .1 * Math.sin(t * 37 + a.phase), f * (1 + vitesse * .25), .9 + .1 * Math.sin(t * 29 + a.phase));
    }
  }
}

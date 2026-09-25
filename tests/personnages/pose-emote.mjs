// Où finit la main pendant une emote ?
//
// Les angles d'épaule et de coude se composent dans l'ordre XYZ, et
// prédire à la main où atterrit le poignet est un bon moyen de se
// tromper de dix centimètres. On applique la pose et on mesure.
//
//   node --import ./tests/personnages/resolveur.mjs \
//        tests/personnages/pose-emote.mjs takeL 0.5
import './dom-bouchon.mjs';
import * as THREE from 'three';
import { makeCharacter } from '../../src/characters.js';
import { EMOTES } from '../../src/emotes.js';

const id = process.argv[2] || 'takeL';
const us = (process.argv[3] || '0.5').split(',').map(Number);
const def = EMOTES.find(e => e.id === id);
if (!def) { console.error('emote inconnue :', id, '—', EMOTES.map(e => e.id).join(' ')); process.exit(1); }

const { group, parts } = makeCharacter({ veste: 0x4c5464, cravate: 0x82333d, lunettes: true });
const scene = new THREE.Scene();
scene.add(group);

const v = new THREE.Vector3();
const monde = (o) => { o.updateWorldMatrix(true, false); return v.setFromMatrixPosition(o.matrixWorld).clone(); };
const f = (p) => `x ${p.x >= 0 ? ' ' : ''}${p.x.toFixed(3)}  y ${p.y.toFixed(3)}  z ${p.z >= 0 ? ' ' : ''}${p.z.toFixed(3)}`;

// repères fixes : sommet du crâne et milieu du front
const tete = monde(parts.teteMicro);
console.log(`${def.nom} — durée ${def.duree}s`);
console.log(`os tête        ${f(tete)}   (front ≈ y 1.66, z 0.08)`);

for (const u of us) {
  // remise au repos, comme le fait player.js à chaque image
  for (const k of ['armL','armR','elbowL','elbowR','legL','legR','kneeL','kneeR',
                   'footL','footR','upper','head','mainL','mainR','doigtsL','doigtsR'])
    parts[k]?.rotation.set(0, 0, 0);
  def.pose(parts, u, 1);
  group.updateMatrixWorld(true);
  const main = monde(parts.mainL);
  const enfants = parts.doigtsL.children;
  // après fusion il ne reste qu'un maillage : on relit les extrémités
  // par la boîte englobante, en coordonnées monde
  parts.doigtsL.updateWorldMatrix(true, true);
  const boite = new THREE.Box3().setFromObject(parts.doigtsL);
  console.log(`u=${u.toFixed(2)}  poignet G ${f(main)}`);
  console.log(`          main G : x ${boite.min.x.toFixed(3)}..${boite.max.x.toFixed(3)}` +
              `  y ${boite.min.y.toFixed(3)}..${boite.max.y.toFixed(3)}` +
              `  z ${boite.min.z.toFixed(3)}..${boite.max.z.toFixed(3)}`);
  console.log(`          poignet D ${f(monde(parts.mainR))}`);
}

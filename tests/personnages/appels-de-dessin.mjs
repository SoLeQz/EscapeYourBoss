// Un appel de dessin par ligne, avec son matériau et son pivot.
//
// Le jeu est limité par les appels de rendu (PROJECT_STATE §5.1), et il
// y a huit personnages à l'étage 6 : un maillage ajouté ici se paie
// huit fois. Deux pièces ne fusionnent que si elles partagent le même
// pivot, le même matériau et les mêmes drapeaux d'ombre.
import './dom-bouchon.mjs';
import { makeCharacter, initCharacterMaterials } from '../../src/characters.js';

const M = initCharacterMaterials();
const nomDe = new Map();
for (const [cle, mat] of Object.entries(M)) if (mat?.uuid) nomDe.set(mat.uuid, cle);

const { group } = makeCharacter({
  veste: 0x4c5464, cravate: 0x82333d, lunettes: true, sac: true, badge: true,
});

// Les matériaux teintés sont des clones : on les rattache à leur source
// par la texture, qui elle n'est pas dupliquée.
const parTexture = new Map();
for (const [cle, mat] of Object.entries(M)) if (mat?.map) parTexture.set(mat.map.uuid, cle);
const nom = (m) => nomDe.get(m.uuid) || (m.map && parTexture.get(m.map.uuid)) || m.type;

const pivotDe = (o) => (o.parent?.isBone ? 'os' : o.parent?.type || '?');
const lignes = [];
group.traverse(o => {
  if (!o.isMesh) return;
  const g = o.geometry;
  const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  lignes.push(`${o.isSkinnedMesh ? 'SKIN' : 'rig '} ${nom(o.material).padEnd(14)}` +
    ` ${String(Math.round(n)).padStart(5)} tris  ombre ${o.castShadow ? 'oui' : 'non '}` +
    `  pivot ${pivotDe(o)}`);
});
lignes.sort();
console.log(lignes.join('\n'));
console.log(`\ntotal ${lignes.length} appels de dessin par personnage`);

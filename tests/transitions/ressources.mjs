import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NPC } from '../../src/npc.js';
import { makeCharacter } from '../../src/characters.js';
import { buildMaterials } from '../../src/materials.js';
import { buildLevel } from '../../src/level.js';
import { NIVEAUX, PLANS } from '../../src/levels.js';

const ctx = document.createElement().getContext();
for (const k of ['save', 'restore', 'translate', 'arc']) ctx[k] = () => {};
const scene = new THREE.Scene();
const niveau = { obstacles: [] };
const config = { name: 'Test', role: 'collègue', kind: 'seated', x: 0, z: 0,
  look: { chemise: 0x445566, peau: 0xddbb99, cheveux: 0x222222, veste: 0x334455, badge: true } };
const a = new NPC(scene, config, niveau), b = new NPC(scene, config, niveau);
const joueur = makeCharacter({ veste: 0x445566, sac: true, lunettes: true }).group;
scene.add(joueur);
const ressources = root => {
  const r = new Set();
  root.traverse(o => {
    if (o.isMesh) r.add(o.geometry);
    if (o.skeleton) r.add(o.skeleton);
    for (const m of [].concat(o.material || [])) {
      r.add(m); Object.values(m).filter(v => v?.isTexture).forEach(t => r.add(t));
    }
  });
  return r;
};
const toujoursUtilisees = new Set([...ressources(b.mesh), ...ressources(joueur)]);
const jetables = [...ressources(a.mesh)].filter(r => !toujoursUtilisees.has(r));
const liberees = new Set();
for (const r of [...ressources(a.mesh), ...toujoursUtilisees]) r.addEventListener?.('dispose', () => liberees.add(r));
// Toutes les variantes n'ont pas forcément la même clef dans parts.skin.
let skeleton;
a.mesh.traverse(o => { if (o.isSkinnedMesh) skeleton = o.skeleton; });
skeleton.computeBoneTexture();
const osTexture = skeleton.boneTexture;
osTexture.addEventListener('dispose', () => liberees.add(osTexture));
a.say('Bulle à remplacer');
const bulle = a.bubble;
let bulleDetruite = 0;
bulle.material.map.addEventListener('dispose', () => bulleDetruite++);
a.say('Bulle suivante');
assert.equal(bulleDetruite, 1, 'Texture de bulle abandonnée');
a.dispose();
assert(liberees.has(osTexture), 'Texture du squelette non libérée');
assert.equal(a.mesh.parent, null);
for (const r of toujoursUtilisees) assert(!liberees.has(r), `Ressource encore utilisée détruite : ${r.type}`);
for (const r of jetables) if (r !== skeleton) assert(liberees.has(r), `Ressource propre au PNJ non libérée : ${r.type}`);
console.log(`PNJ : ${liberees.size} ressources libérées, joueur et second PNJ intacts, bulles nettoyées.`);

const M = buildMaterials();
const l1 = buildLevel(scene, M, PLANS.A, NIVEAUX[0]);
const portes = l1.elevatorPanels.slice();
const l2 = buildLevel(scene, M, PLANS.B, NIVEAUX[2]);
assert.notEqual(l1.elevatorPanels, l2.elevatorPanels);
assert.deepEqual(l1.elevatorPanels, portes, 'Construction suivante a remplacé les portes précédentes');
assert.notEqual(l1.elevatorLed, l2.elevatorLed);
assert.notEqual(l1.escalier.door, l2.escalier.door);
l1.escalier.door.rotation.y=-1;assert.equal(l2.escalier.door.rotation.y,0);
const r2 = ressources(l2.root);
const matieresPartagees = [...ressources(l1.root)].filter(r => r2.has(r));
const detruites = new Set();
for (const r of matieresPartagees) r.addEventListener?.('dispose', () => detruites.add(r));
l1.dispose();
assert.equal(detruites.size, 0, 'Ressource du prochain niveau détruite');
assert(l2.root.parent === scene);
l2.dispose();
console.log('Niveaux : portes indépendantes, ressources partagées préservées.');

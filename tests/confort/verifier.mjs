import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../../src/player.js';
import { Entrees } from '../../src/input.js';
import { geometriesCorps } from '../../src/body.js';

const niveau = { playerStart: { x: 0, z: 0, yaw: 0 }, obstacles: [] };
const joueur = new Player(new THREE.Scene(), niveau);
const input = new Entrees();
input.add('KeyW'); input.add('ShiftLeft');
let transitions = 0, avant = false, dureeBlocage = 0, blocageMax = 0;
// Couloir sans fin : le test de récupération ne doit pas buter sur la limite du monde.
for (let i = 0; i < 720; i++) {
  if (joueur.pos.z > 10) joueur.pos.z = -10;
  joueur.update(1 / 60, input, 0);
  if (joueur.running !== avant) { transitions++; avant = joueur.running; }
  dureeBlocage = joueur.epuise ? dureeBlocage + 1 / 60 : 0;
  blocageMax = Math.max(blocageMax, dureeBlocage);
  assert(joueur.stamina >= 0 && joueur.stamina <= 1);
}
assert(transitions <= 9, `Sprint instable : ${transitions} transitions en 12 s`);
assert(blocageMax > 1.5, 'Pas de récupération continue après épuisement');
console.log(`Sprint maintenu 12 s : ${transitions} transitions, récupération continue ${blocageMax.toFixed(2)} s`);

const distance = hz => {
  joueur.reset(); input.clear(); input.add('KeyW');
  for (let i = 0; i < hz * 2; i++) joueur.update(1 / hz, input, 0);
  return joueur.pos.z;
};
const lent = distance(30), rapide = distance(144);
assert(Math.abs(lent - rapide) < 0.05, `Déplacement dépendant du débit : ${lent} / ${rapide}`);
console.log(`Marche sur 2 s : ${lent.toFixed(3)} m à 30 Hz / ${rapide.toFixed(3)} m à 144 Hz`);

joueur.declencherEmote(0); joueur.epuise = true; joueur.running = true;
joueur.reset();
assert.equal(joueur.emote, null); assert.equal(joueur.epuise, false);
assert.equal(joueur.speed, 0); assert.equal(joueur.running, false);
assert.equal(joueur.stamina, 1); assert.equal(joueur.vel.length(), 0);

const peau = geometriesCorps().peau;
assert.equal(peau.attributes.color.count, peau.attributes.position.count);
for (const v of peau.attributes.color.array) assert(Number.isFinite(v) && v >= 0 && v <= 1);
let appels = 0, skins = 0;
joueur.mesh.traverse(o => { if (o.isMesh) appels++; if (o.isSkinnedMesh) skins++; });
assert(appels <= 44, `${appels} appels de rendu, budget de 44 dépassé`);
assert.equal(skins, 5);
console.log(`Personnage : ${appels} appels, ${skins} surfaces skinnées. Réinitialisation et couleurs : OK`);

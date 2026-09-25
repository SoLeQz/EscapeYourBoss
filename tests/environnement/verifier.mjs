import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildMaterials } from '../../src/materials.js';
import { actionAccessible } from '../../src/office.js';
import { buildLevel, collide } from '../../src/level.js';
import { NIVEAUX, PLANS } from '../../src/levels.js';

// Le test de géométrie ne juge pas les pixels : revue réelle via --selftest --decor.
const ctx = document.createElement().getContext();
for (const k of ['save', 'restore', 'translate', 'arc']) ctx[k] = () => {};
const references = JSON.parse(readFileSync(new URL('./collisions-avant.json', import.meta.url)));
const MAT = buildMaterials(), scene = new THREE.Scene();
for (const [i, n] of NIVEAUX.entries()) {
  const l = buildLevel(scene, MAT, PLANS[n.plan], n);
  const etat = { obstacles: l.obstacles.filter(o => o.kind !== 'architecture'), start: l.playerStart, exits: l.interactables };
  const hash = createHash('sha256').update(JSON.stringify(etat)).digest('hex');
  assert.equal(hash, references[i], `Étage ${i + 1} : emprises, départ ou sorties modifiés`);
  let lots = 0, triangles = 0;
  l.root.traverse(o => {
    if (!o.isMesh) return;
    lots++;
    const g = o.geometry;
    triangles += (g.index?.count ?? g.attributes.position.count) / 3;
    for (const v of g.attributes.position.array) assert(Number.isFinite(v), 'Sommet invalide');
    for (const v of g.attributes.uv?.array ?? []) assert(Number.isFinite(v), 'UV invalide');
  });
  assert(triangles <= 260000, `${triangles} triangles : budget de 260 000 dépassé`);
  assert(lots <= 100, `${lots} lots de décor : budget de 100 dépassé`);
  if (n.sorties.includes('elevator')) assert(l.elevatorLed.parent, 'Voyant perdu pendant la fusion');
  // Le rayon traverse le vide de la trémie avant d'atteindre une marche.
  l.root.updateMatrixWorld(true);
  const rayon=new THREE.Raycaster(new THREE.Vector3(7.7,2.9,15.1),new THREE.Vector3(0,-1,0));
  const touches=rayon.intersectObject(l.root,true).filter(r=>r.object.material.side!==THREE.BackSide && !r.object.material.transparent);
  assert(touches.length && touches[0].point.y<-.7,'Un plancher ou un panneau masque les marches');
  // Plan C : la porte de réunion débouche sur le palier. Une paroi décorative
  // de la cage recouvrait le passage sans avoir de collision correspondante.
  if(n.plan==='C') {
    for(const z of [12.55,12.85])for(const y of [.25,1.17,1.7,2.4])for(const sens of [-1,1]) {
      const r=new THREE.Raycaster(new THREE.Vector3(sens>0?10.8:13.2,y,z),new THREE.Vector3(sens,0,0),0,2.4);
      assert.equal(r.intersectObject(l.root,true).length,0,`Étage ${i+1} : paroi visible dans le passage réunion/escalier à y=${y}, z=${z}`);
    }
    for(let x=10.8;x<=13.2;x+=.05) {
      const p=new THREE.Vector3(x,0,12.7);collide(l.obstacles,p,.34);
      assert(p.distanceTo(new THREE.Vector3(x,0,12.7))<1e-6,'Le passage latéral ne permet plus la traversée');
    }
    // La découpe doit laisser les murs autour et sous la porte.
    for(const [y,z] of [[1.7,15.4],[-1.7,12.7],[3.3,12.7]]) {
      const r=new THREE.Raycaster(new THREE.Vector3(12.5,y,z),new THREE.Vector3(-1,0,0),0,1);
      assert(r.intersectObject(l.root,true).some(t=>t.object.material===MAT.beton),'Mur de cage supprimé hors de l’ouverture');
    }
  }
  const joueur={pos:new THREE.Vector3(8,0,12.9)};
  collide(l.obstacles,joueur.pos,.34);
  if(n.sorties.includes('stairs'))assert(actionAccessible(l.interactables.find(e=>e.id==='stairs'),joueur,l.obstacles),'Sortie d’escalier inaccessible');
  const bord=new THREE.Vector3(8,0,13.3);collide(l.obstacles,bord,.34);
  assert(bord.z<=12.94||bord.z>=13.78,'La porte laisse traverser son obstacle');
  const mesh=l.escalier.door.children.find(o=>o.isMesh);
  let liberee=false;mesh.geometry.addEventListener('dispose',()=>liberee=true);
  l.dispose();assert(liberee,'Géométrie de porte non libérée');
  assert.equal(scene.children.length, 0, 'Décor ou ville resté dans la scène après changement');
  console.log(`Étage ${i + 1} : emprises conservées, trémie et sortie vérifiées, ${lots} lots, ${Math.round(triangles)} triangles, nettoyage OK`);
}

// Préparation du jalon A. Ces tests JavaScript ne remplacent pas un export Blender.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { construireSquelette, lierSquelette } from '../../src/body.js';
import { adapterRigGLB, verifierConteneurGLB } from '../../src/personnage-glb.js';

function conteneur(json) {
  const donnees=new TextEncoder().encode(JSON.stringify(json));
  const taille=Math.ceil(donnees.length/4)*4;
  const b=new ArrayBuffer(20+taille),v=new DataView(b);
  v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,b.byteLength,true);
  v.setUint32(12,taille,true);v.setUint32(16,0x4e4f534a,true);
  new Uint8Array(b,20).fill(32);new Uint8Array(b,20).set(donnees);
  return b;
}
const vide={asset:{version:'2.0'},scenes:[{nodes:[]}],scene:0};
assert.equal(verifierConteneurGLB(conteneur(vide)).asset.version,'2.0');
for(const json of [
  {...vide,buffers:[{uri:'https://exemple.invalid/model.bin'}]},
  {...vide,images:[{uri:'file:///C:/secret.png'}]},
  {...vide,nodes:[{extensions:{KHR_lights_punctual:{light:0}}}]},
  {...vide,animations:[{}]},
  {...vide,extensionsUsed:['KHR_draco_mesh_compression']},
])assert.throws(()=>verifierConteneurGLB(conteneur(json)));
assert.throws(()=>verifierConteneurGLB(new ArrayBuffer(10)));

function fauxImport() {
  const scene=new THREE.Group(),armature=new THREE.Group();scene.add(armature);
  // L'armature ET les os possèdent des rotations locales étrangères au moteur.
  armature.rotation.x=-Math.PI/2;
  const {os,racine}=construireSquelette();armature.add(racine);
  const positions=new Map();
  for(const bone of os) {
    const position=bone.position.clone();
    if(bone.parent.isBone)position.add(positions.get(bone.parent.name));
    positions.set(bone.name,position);
  }
  const cible=new THREE.Matrix4();
  scene.updateMatrixWorld(true);
  for(const [i,bone] of os.entries()) {
    cible.compose(positions.get(bone.name),new THREE.Quaternion().setFromEuler(new THREE.Euler(.13*i,.21,.37)),new THREE.Vector3(1,1,1));
    cible.premultiply(bone.parent.matrixWorld.clone().invert()).decompose(bone.position,bone.quaternion,bone.scale);
    bone.updateMatrixWorld(true);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute([-.215,.86,0,-.2,.86,0,-.215,.88,.01],3));
  geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([5,0,0,0,5,0,0,0,5,0,0,0],4));
  geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
  geo.computeVertexNormals();
  const skin=new THREE.SkinnedMesh(geo,new THREE.MeshStandardMaterial());scene.add(skin);
  scene.updateMatrixWorld(true);skin.bind(lierSquelette(os));
  return {scene,skin};
}
const {scene,skin}=fauxImport();
const modele=adapterRigGLB(scene);modele.actualiserPose();
let p=skin.applyBoneTransform(0,new THREE.Vector3(-.215,.86,0));
assert(p.distanceTo(new THREE.Vector3(-.215,.86,0))<1e-6,'La pose de liaison déplace la peau');
modele.parts.elbowL.rotation.x=-Math.PI/2;modele.actualiserPose();
p=skin.applyBoneTransform(0,new THREE.Vector3(-.215,.86,0));
assert(p.distanceTo(new THREE.Vector3(-.215,1.11,.25))<1e-6,'Le coude ne fléchit pas selon les axes du jeu');
modele.group.position.set(10,.2,-4);modele.group.rotation.y=.7;modele.actualiserPose();
p=skin.applyBoneTransform(0,new THREE.Vector3(-.215,.86,0)).applyMatrix4(skin.matrixWorld);
const attendu=new THREE.Vector3(-.215,1.11,.25).applyMatrix4(modele.group.matrixWorld);
assert(p.distanceTo(attendu)<1e-6,'Transformation du personnage appliquée deux fois');
modele.parts.elbowL.rotation.set(0,0,0);modele.actualiserPose();
p=skin.applyBoneTransform(0,new THREE.Vector3(-.215,.86,0));
assert(p.distanceTo(new THREE.Vector3(-.215,.86,0))<1e-6,'Retour à la liaison incorrect');
skin.skeleton.computeBoneTexture();
let disposes=0;for(const r of [skin.geometry,skin.material,skin.skeleton.boneTexture])r.addEventListener('dispose',()=>disposes++);
modele.dispose();modele.dispose();assert.equal(disposes,3,'Libération incomplète ou double');
assert.throws(()=>modele.actualiserPose());
assert.throws(()=>adapterRigGLB(new THREE.Group()),/skinné/);
console.log('Préparation JavaScript : conteneur autonome, axes de liaison différents, flexion, placement et libération OK.');
console.log('Non exécuté par ce test : Blender, export GLB, rendu Electron, identité visuelle.');

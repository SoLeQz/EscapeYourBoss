import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prechargerAnatomieBlender,etatAnatomieBlender,anatomieBlenderDisponible,animerMainsBlender} from '../../src/anatomie-blender.js';
import {makeCharacter,animerVisage} from '../../src/characters.js';
import {libererArbre} from '../../src/resources.js';
const lire=async nom=>{const b=readFileSync(new URL('../../assets/'+nom,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
await assert.rejects(prechargerAnatomieBlender(nom=>nom.startsWith('mains')?null:lire(nom)),/absente/);
assert.equal(anatomieBlenderDisponible(),false,'Un chargement incomplet ne doit pas publier de modèles');
assert.deepEqual(etatAnatomieBlender(),{});
await prechargerAnatomieBlender(lire);assert.equal(Object.keys(etatAnatomieBlender()).length,5);
// L'ajout de Cercle ne doit modifier aucun sommet des cinq poses v02, même après export GLB.
{
  const sources=await Promise.all(['mains-v02.glb','mains-v03.glb'].map(async n=>new GLTFLoader().parseAsync(await lire(n),'')));
  const groupes=sources.map(s=>{const m=new Map();s.scene.traverse(o=>{if(o.isMesh)m.set(o.userData.controle,o)});return m});
  for(const [controle,ancien] of groupes[0]){
    const actuel=groupes[1].get(controle);assert(actuel,controle+' absent');
    assert.deepEqual(actuel.geometry.attributes.position.array,ancien.geometry.attributes.position.array,controle+' Basis modifiée');
    for(const [nom,i] of Object.entries(ancien.morphTargetDictionary||{})){
      const j=actuel.morphTargetDictionary[nom];assert.notEqual(j,undefined);
      assert.deepEqual(actuel.geometry.morphAttributes.position[j].array,ancien.geometry.morphAttributes.position[i].array,controle+' '+nom+' modifié');
    }
  }
}

for(const profilVisage of ['employe','direction','chignon','securite']){
  const {group,parts}=makeCharacter({profilVisage,lunettes:true});group.updateMatrixWorld(true);
  assert.equal(group.userData.anatomieBlender.tete,`tete-${profilVisage}-v02.glb`);
  let poignet=false;group.traverse(m=>{if(m.isMesh&&m.name==='Blender:mainL:peau'){m.geometry.computeBoundingBox();poignet=m.geometry.boundingBox.max.y>=.065}});assert(poignet,'Le poignet doit se prolonger sous la manchette');
  assert.equal(parts.clignement.geometry.morphTargetsRelative,true,'Déplacements glTF conservés après fusion');
  for(const s of [-1,1]){
    const ray=new THREE.Raycaster(new THREE.Vector3(s*.036,1.636,.4),new THREE.Vector3(0,0,-1));
    parts.clignement.morphTargetInfluences[0]=0;assert.equal(ray.intersectObject(parts.clignement).length,0);
    parts.clignement.morphTargetInfluences[0]=1;
    const lid=ray.intersectObject(parts.clignement)[0],iris=ray.intersectObject(parts.regard,true)[0];
    assert(lid&&iris&&lid.distance<iris.distance-.0005,`${profilVisage} : œil non masqué`);
  }
  for(const m of parts._mainsBlender){assert.deepEqual(Object.keys(m.morphTargetDictionary),['Poing','Index','Ouvert','Pouce','Cercle']);assert(m.morphTargetInfluences.every(v=>v===0));}
  animerMainsBlender(parts,{def:{id:'takeL',duree:4.2},t:2,poids:1});
  const left=parts._mainsBlender.find(m=>m.name.includes('doigtsL')),right=parts._mainsBlender.find(m=>m.name.includes('doigtsR'));
  assert.deepEqual(left.morphTargetInfluences,[0,1,0,0,0]);assert.deepEqual(right.morphTargetInfluences,[0,0,0,0,0]);
  // Nouveau canal Blender indépendant, miroir et compatibilité des anciens clips.
  animerMainsBlender(parts,{def:{id:'griddy',sourceBlender:'griddy-v07.blend',duree:8,echantillon:()=>({mainL_Cercle:1,mainR_Cercle:.5})},t:2,poids:1});
  for(const m of parts._mainsBlender)assert.equal(m.morphTargetInfluences[m.morphTargetDictionary.Cercle],m.name.includes('L:')?1:.5);
  animerMainsBlender(parts,{def:{id:'67',sourceBlender:'67-v05.blend',duree:4,echantillon:()=>({})},t:1,poids:1});
  assert(parts._mainsBlender.every(m=>m.morphTargetInfluences.every(v=>v===0)),'Un ancien clip conserve la pose Cercle');
  const p=new THREE.Vector3(),repos=new THREE.Box3(),pose=new THREE.Box3();left.morphTargetInfluences.fill(0);
  for(let i=0;i<left.geometry.attributes.position.count;i++){left.getVertexPosition(i,p);repos.expandByPoint(p)}
  // Mains v02 : le poing (morph 0) ramène le bout des doigts vers la paume (main plus courte de 4 cm au moins).
  left.morphTargetInfluences[0]=1;for(let i=0;i<left.geometry.attributes.position.count;i++){left.getVertexPosition(i,p);pose.expandByPoint(p)}
  assert(pose.min.y>repos.min.y+.04,'Les doigts doivent réellement se replier');
  const autre=makeCharacter({profilVisage});assert(autre.parts._mainsBlender.every(m=>m.morphTargetInfluences.every(v=>v===0)));
  let pigment=false;group.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.color;if(a&&Array.from(a.array).some(v=>v<.85))pigment=true;for(const a of [...Object.values(m.geometry.attributes),...Object.values(m.geometry.morphAttributes).flat()])assert(a.array.every(Number.isFinite));});
  assert(pigment,'Les nuances de peau doivent être exportées dans COLOR_0');
  let partageDetruit=false;const geo=autre.parts.clignement.geometry;geo.addEventListener('dispose',()=>partageDetruit=true);libererArbre(group);assert.equal(partageDetruit,false);libererArbre(autre.group);
}
// Cou : la tête tourne autour de la base du crâne, 9 cm sous `teteBase`. Ce point reste fixe
// dans le repère du buste, quelle que soit la rotation (sinon le cou sort du col accroupi).
{
  const {parts}=makeCharacter({profilVisage:'employe'});
  const jonction=()=>{parts.head.updateMatrixWorld(true);return parts.upper.worldToLocal(parts.head.localToWorld(new THREE.Vector3(0,-.09,0)))};
  animerVisage(parts,0);const repos=jonction();
  for(const r of [[-.55,0,0],[.4,.3,0],[.1,-.8,.2]]){parts.head.rotation.set(...r);animerVisage(parts,0);assert(jonction().distanceTo(repos)<1e-6,`Cou décroché pour la rotation ${r}`);}
}
await import('../personnages/refonte.mjs');
await import('../animations/verifier.mjs');
await import('../gameplay/verifier.mjs');
await import('../transitions/ressources.mjs');
console.log('Anatomie Blender : 4 visages, couleurs, clignements, doigts, cache atomique, poses et ressources OK.');

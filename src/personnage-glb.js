// Chaîne expérimentale Blender, chargée uniquement par le harnais dédié.
// Le joueur et les PNJ de la version normale gardent makeCharacter().
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { construireSquelette, nomsOs } from './body.js';
import { libererArbre } from './resources.js';

const ASSETS = new Set(['lao-d-test.glb', 'lao-d-v01.glb', 'lao-d-v02.glb', 'lao-d-v03.glb', 'directeur-v01.glb', 'zhang-v01.glb', 'liu-v01.glb']);
const PIVOTS = {
  root:'racine',upper:'buste',torso:'buste',head:'teteBase',teteMicro:'tete',
  armL:'epauleL',elbowL:'coudeL',mainL:'mainL',armR:'epauleR',elbowR:'coudeR',mainR:'mainR',
  legL:'hancheL',kneeL:'genouL',footL:'chevilleL',legR:'hancheR',kneeR:'genouR',footR:'chevilleR',
};

// Vérification AVANT le parseur : un GLB de personnage est autonome, sans
// URL, buffers externes, décodeur téléchargé ni lumière ajoutée à la scène.
export function verifierConteneurGLB(octets) {
  if (!(octets instanceof ArrayBuffer) || octets.byteLength < 20 || octets.byteLength > 32*1024*1024)
    throw new Error('GLB invalide : taille ou type incorrect');
  const v=new DataView(octets);
  if(v.getUint32(0,true)!==0x46546c67 || v.getUint32(4,true)!==2 || v.getUint32(8,true)!==octets.byteLength)
    throw new Error('GLB invalide : en-tête glTF 2 attendu');
  const taille=v.getUint32(12,true);
  if(v.getUint32(16,true)!==0x4e4f534a || taille%4 || 20+taille>octets.byteLength)
    throw new Error('GLB invalide : bloc JSON');
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(octets,20,taille)).trim());
  for(const item of [...(json.buffers||[]),...(json.images||[])])
    if(item.uri!=null)throw new Error('GLB refusé : toutes les ressources doivent être intégrées');
  if(json.nodes?.some(n=>n.camera!=null||n.extensions?.KHR_lights_punctual)||json.extensions?.KHR_lights_punctual)
    throw new Error('GLB refusé : caméra ou lumière embarquée');
  if(json.extensionsUsed?.some(e=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(e)))
    throw new Error('GLB refusé : export non compressé requis');
  if(json.animations?.length)throw new Error('GLB refusé pour ce jalon : les os sont pilotés par les poses procédurales');
  return json;
}

export async function lirePersonnageGLB(nom) {
  if(!ASSETS.has(nom))throw new Error('Nom de modèle non autorisé');
  if(!window.jeuAssets?.lire)throw new Error('Import GLB réservé au pont d’assets Electron');
  const octets=await window.jeuAssets.lire(nom);
  if(!octets)throw new Error(`Modèle Blender absent ou illisible : assets/${nom}`);
  verifierConteneurGLB(octets);
  const manager=new THREE.LoadingManager();
  manager.setURLModifier(url=>{
    if(url.startsWith('blob:'))return url;
    throw new Error('Chargement externe interdit pour le personnage : '+url);
  });
  const gltf=await new GLTFLoader(manager).parseAsync(octets,'');
  try {return adapterRigGLB(gltf.scene,{source:nom});}
  catch(e){libererArbre(gltf.scene);throw e;}
}

// Les animations écrivent dans une hiérarchie aux axes canoniques du jeu.
// La matrice de liaison propre à chaque os Blender est conservée : on
// transporte sa pose relative au lieu d'écraser des rotations locales.
export function adapterRigGLB(sceneImportee,{source='test'}={}) {
  const group=new THREE.Group();group.name='LaoD_importe';
  group.add(sceneImportee);
  const {os,racine}=construireSquelette();group.add(racine);
  const noms=nomsOs(),drivers=new Map(os.map(o=>[o.name,o]));
  const imports=new Map();let skins=0;
  sceneImportee.traverse(o=>{
    if(o.isLight||o.isCamera)throw new Error('Caméra ou lumière inattendue dans le personnage');
    if(o.isBone){if(imports.has(o.name))throw new Error('Os homonyme : '+o.name);imports.set(o.name,o);}
    if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}
    if(o.isSkinnedMesh){skins++;o.frustumCulled=false;}
  });
  if(!skins)throw new Error('Le GLB ne contient aucun maillage skinné');
  for(const n of noms)if(!imports.has(n))throw new Error('Os Blender manquant : '+n);
  group.updateMatrixWorld(true);
  const liens=noms.map(n=>{
    const driver=drivers.get(n),bone=imports.get(n);
    const origineDriver=driver.getWorldPosition(new THREE.Vector3());
    const origineImport=bone.getWorldPosition(new THREE.Vector3());
    if(origineDriver.distanceTo(origineImport)>.002)
      throw new Error(`Pose de liaison incompatible pour ${n} : ${origineImport.toArray().join(', ')}`);
    return {driver,bone,offset:driver.matrixWorld.clone().invert().multiply(bone.matrixWorld)};
  });
  // L'ordre doit être celui de l'armature importée, même si le fichier GLB
  // a numéroté ses joints différemment des 16 os du moteur.
  const rang=new Map();let index=0;sceneImportee.traverse(o=>rang.set(o,index++));
  liens.sort((a,b)=>rang.get(a.bone)-rang.get(b.bone));
  const parts=Object.fromEntries(Object.entries(PIVOTS).map(([key,nom])=>[key,drivers.get(nom)]));
  const cible=new THREE.Matrix4(),inverseParent=new THREE.Matrix4();
  let detruit=false;
  function actualiserPose() {
    if(detruit)throw new Error('Personnage GLB déjà libéré');
    group.updateMatrixWorld(true);
    for(const {driver,bone,offset} of liens) {
      cible.multiplyMatrices(driver.matrixWorld,offset);
      inverseParent.copy(bone.parent.matrixWorld).invert();cible.premultiply(inverseParent);
      cible.decompose(bone.position,bone.quaternion,bone.scale);
      bone.updateMatrixWorld(true);
    }
  }
  return {group,parts,source,secours:false,actualiserPose,
    dispose(){if(!detruit){libererArbre(group);detruit=true;}}};
}

// Bibliothèque statique réellement exportée depuis Blender. Chargée avant Game.
// Les matériaux restent ceux du niveau : mêmes textures PBR et mêmes lots de rendu.
import * as THREE from 'three';
import { HUMOUR } from './humour.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { verifierConteneurGLB } from './personnage-glb.js';
import { partager, libererArbre } from './resources.js';

const fichiers={bureau:'bureau-v01.glb',chaise:'chaise-v01.glb',escalier:'escalier-v01.glb',porte:'porte-escalier-v01.glb',
  ...Object.fromEntries(HUMOUR.map(h=>[h.modele,h.fichier]))};
const permis=new Set(['bois','boisFonce','aluSombre','alu','plastiqueNoir','plastiqueBlanc','tissuChaise','beton','pierre','murAccent','verre','papier','signalOrange','papierRecyclage']);
const cache=new Map();let chargement;
export function etatDecorBlender(){return Object.fromEntries([...cache].map(([nom,pieces])=>[nom,{fichier:fichiers[nom],pieces:pieces.length,triangles:pieces.reduce((s,p)=>s+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0)}]));}
export async function prechargerDecorBlender(lire=nom=>window.jeuAssets.lire(nom)) {
  if(chargement)return chargement;
  chargement=(async()=>{
    const temporaires=new Map();
    try{
      for(const [nom,fichier] of Object.entries(fichiers)){
        const bytes=await lire(fichier);if(!bytes)throw new Error('Décor Blender absent : '+fichier);
        verifierConteneurGLB(bytes);
        const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(url.startsWith('blob:'))return url;throw new Error('Ressource externe dans '+fichier);});
        const gltf=await new GLTFLoader(manager).parseAsync(bytes,'');const pieces=[];temporaires.set(nom,pieces);
        try{
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse(o=>{
            if(!o.isMesh)return;
            if(o.isSkinnedMesh||Array.isArray(o.material))throw new Error('Objet statique mono-matériau attendu : '+fichier);
            const material=o.material.name.replace(/^DECOR_/,'');
            if(!permis.has(material))throw new Error('Matériau inconnu : '+o.material.name);
            if(!o.geometry.attributes.normal||!o.geometry.attributes.uv)throw new Error('Normales/UV absentes : '+fichier);
            const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);
            if(!geometry.attributes.position.array.every(Number.isFinite)){geometry.dispose();throw new Error('Géométrie invalide : '+fichier);}
            pieces.push({geometry,material});
          });
          if(!pieces.length)throw new Error('Décor vide : '+fichier);
        }finally{libererArbre(gltf.scene);}
      }
      // Un lot par matériau, y compris pour la porte animée qui ne participe
      // pas à la fusion statique du niveau. Les sources Blender restent séparées.
      for(const [nom,pieces] of temporaires){
        const groupes=new Map(),fusionnees=[];
        try{
          for(const p of pieces){
            const g=p.geometry.index?p.geometry.toNonIndexed():p.geometry.clone();
            for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);
            if(!groupes.has(p.material))groupes.set(p.material,[]);
            groupes.get(p.material).push(g);
          }
          for(const [material,geometries] of groupes){
            const geometry=mergeGeometries(geometries,false);
            if(!geometry)throw new Error('Fusion impossible : '+nom);
            fusionnees.push({geometry,material});
          }
        }catch(e){for(const p of fusionnees)p.geometry.dispose();throw e;}
        finally{for(const geometries of groupes.values())for(const g of geometries)g.dispose();}
        for(const p of pieces)p.geometry.dispose();
        temporaires.set(nom,fusionnees);
      }
      for(const [nom,pieces] of temporaires){for(const p of pieces)partager(p.geometry);cache.set(nom,pieces);}
    }catch(e){for(const pieces of temporaires.values())for(const p of pieces)p.geometry.dispose();throw e;}
    return etatDecorBlender();
  })();
  try{return await chargement;}catch(e){chargement=null;throw e;}
}
export function poserDecorBlender(nom,parent,MAT,{x=0,y=0,z=0,yaw=0,propre=false}={}){
  const pieces=cache.get(nom);
  // Les tests historiques de géométrie sans préchargement gardent leur référence
  // procédurale. En jeu, le préchargement strict doit réussir avant la construction.
  if(!pieces)return null;
  const g=new THREE.Group();g.name='Blender:'+nom;g.userData.decorBlender=fichiers[nom];g.position.set(x,y,z);g.rotation.y=yaw;
  for(const p of pieces){
    const mat=MAT[p.material];if(!mat)throw new Error('Matériau du niveau manquant : '+p.material);
    const m=new THREE.Mesh(propre?p.geometry.clone():p.geometry,partager(mat));
    m.castShadow=p.material!=='verre';m.receiveShadow=true;g.add(m);
  }
  parent.add(g);return g;
}

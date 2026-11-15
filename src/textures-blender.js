import * as THREE from 'three';
import { partager } from './resources.js';

// Matières v02, calculées par tools/textures/generer.mjs (npm run textures) ; la v01
// cuite dans Blender reste dans art/matieres. Une même carte sert aux variantes
// teintées. `metres` : côté de la tuile, à tenir en accord avec le motif du générateur.
export const MATIERES_BLENDER = {
  bois:{taille:1024,metres:1}, textile:{taille:512,metres:.4},
  moquette:{taille:1024,metres:1,sansRugosite:true}, pierre:{taille:1024,metres:2},
  beton:{taille:512,metres:1.5}, metal:{taille:512,metres:.5,sansCouleur:true},
  cuir:{taille:512,metres:.25,sansCouleur:true},
  enduit:{taille:512,metres:1,sansRugosite:true}, plafond:{taille:512,metres:1.2,sansRugosite:true},
};
const cache=new Map();let chargement;
export function texturesBlender(nom){return cache.get(nom);}
export function reglerFiltrageBlender(anisotropie){
  for(const cartes of cache.values())for(const t of Object.values(cartes))t.anisotropy=anisotropie;
}
export function etatTexturesBlender(){
  return Object.fromEntries([...cache].map(([nom,cartes])=>[nom,Object.fromEntries(
    Object.entries(cartes).map(([canal,t])=>[canal,{fichier:t.name,taille:[t.image.width,t.image.height],repeat:t.repeat.toArray(),colorSpace:t.colorSpace}]))]));
}
export async function prechargerTexturesBlender(lire=nom=>window.jeuAssets.lire(nom),decoder=bytes=>createImageBitmap(
  new Blob([bytes],{type:'image/png'}),{imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'})) {
  if(chargement)return chargement;
  chargement=(async()=>{
    const temporaires=new Map();
    try{
      for(const [nom,def] of Object.entries(MATIERES_BLENDER)){
        const cartes={};temporaires.set(nom,cartes);
        for(const [suffixe,canal] of [['color','map'],['normal','normalMap'],['rough','roughnessMap']]){
          if(suffixe==='color'&&def.sansCouleur||suffixe==='rough'&&def.sansRugosite)continue;
          const fichier=`mat-${nom}-v02-${suffixe}.png`,bytes=await lire(fichier);
          if(!bytes)throw new Error('Texture Blender absente : '+fichier);
          const img=await decoder(bytes);
          if(img.width!==def.taille||img.height!==def.taille){img.close?.();throw new Error('Dimensions de texture incorrectes : '+fichier);}
          const t=new THREE.Texture(img);cartes[canal]=t;t.name=fichier;
          t.colorSpace=suffixe==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;
          t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.setScalar(1/def.metres);
          t.flipY=false; // ImageBitmap est déjà retourné à son décodage.
          t.anisotropy=8;t.needsUpdate=true;
        }
      }
      for(const [nom,cartes] of temporaires){for(const t of Object.values(cartes))partager(t);cache.set(nom,cartes);}
    }catch(e){for(const cartes of temporaires.values())for(const t of Object.values(cartes)){t.dispose();t.image.close?.();}throw e;}
    return etatTexturesBlender();
  })();
  try{return await chargement;}catch(e){chargement=null;throw e;}
}

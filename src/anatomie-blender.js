// Têtes et mains modélisées dans Blender, montées sur le rig existant.
// Les vêtements, le sac, les appuis et les hauteurs de perception sont conservés.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {verifierConteneurGLB} from './personnage-glb.js';
import {partager,libererArbre} from './resources.js';
export const FICHIERS_ANATOMIE=Object.freeze(Object.fromEntries(
  ['tete-employe','tete-direction','tete-chignon','tete-securite','mains'].map(n=>[n,n+'-v02.glb'])));
const controles=new Set(['head','regard','paupiere','bouche','mainL','mainR','doigtsL','doigtsR','pouceL','pouceR']);
const matieres=new Set(['peau','cheveux','blancOeil','iris','pupille','reflet','monture']);
const cache=new Map();let chargement;
export function anatomieBlenderDisponible(){return cache.size===5;}
export function etatAnatomieBlender(){return Object.fromEntries([...cache].map(([nom,pieces])=>[nom,
  {fichier:FICHIERS_ANATOMIE[nom],lots:pieces.length,triangles:pieces.reduce((s,p)=>s+p.geometry.attributes.position.count/3,0),
    controles:[...new Set(pieces.map(p=>p.controle))]}]));}
function transformerMorphs(geo,matrix){
  const linear=new THREE.Matrix3().setFromMatrix4(matrix),normal=new THREE.Matrix3().getNormalMatrix(matrix),v=new THREE.Vector3();
  for(const [nom,attrs] of Object.entries(geo.morphAttributes))for(const a of attrs){
    for(let i=0;i<a.count;i++){
      v.fromBufferAttribute(a,i);
      if(nom==='position')geo.morphTargetsRelative?v.applyMatrix3(linear):v.applyMatrix4(matrix);
      else if(nom==='normal')v.applyMatrix3(normal);
      a.setXYZ(i,v.x,v.y,v.z);
    }
  }
}
export async function prechargerAnatomieBlender(lire=nom=>window.jeuAssets.lire(nom)){
  if(chargement)return chargement;
  chargement=(async()=>{
    const temporaires=new Map();
    try{
      for(const [nom,fichier] of Object.entries(FICHIERS_ANATOMIE)){
        const bytes=await lire(fichier);if(!bytes)throw Error('Anatomie Blender absente : '+fichier);
        verifierConteneurGLB(bytes);
        const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(url.startsWith('blob:'))return url;throw Error('Ressource externe dans '+fichier)});
        const gltf=await new GLTFLoader(manager).parseAsync(bytes,'');
        const groupes=new Map(),pieces=[];temporaires.set(nom,pieces);
        try{
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse(o=>{
            if(!o.isMesh)return;
            const {controle,origine,option=''}=o.userData,material=o.material?.name?.replace(/^ANATOMIE_/,'');
            if(o.isSkinnedMesh||Array.isArray(o.material)||!controles.has(controle)||!matieres.has(material))throw Error('Pièce anatomique incompatible : '+o.name);
            if(!Array.isArray(origine)||origine.length!==3||!origine.every(Number.isFinite))throw Error('Pivot anatomique invalide');
            if(!['','lunettes'].includes(option))throw Error('Option anatomique invalide');
            if(!o.geometry.attributes.normal||!o.geometry.attributes.uv)throw Error('Normales/UV absentes');
            const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
            geo.morphTargetsRelative=o.geometry.morphTargetsRelative;
            transformerMorphs(geo,o.matrixWorld);geo.applyMatrix4(o.matrixWorld);
            const translation=new THREE.Matrix4().makeTranslation(...origine.map(v=>-v));geo.applyMatrix4(translation);
            // En glTF les morphs sont des déplacements : ne pas leur soustraire le pivot.
            if(!geo.morphTargetsRelative)transformerMorphs(geo,translation);
            for(const k of Object.keys(geo.attributes))if(!['position','normal','uv','color'].includes(k))geo.deleteAttribute(k);
            if(!geo.attributes.color)geo.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*3).fill(1),3));
            // Les couleurs glTF peuvent être RGBA ; tous les lots utilisent RGB.
            if(geo.attributes.color.itemSize!==3){const a=geo.attributes.color,c=[];for(let i=0;i<a.count;i++)c.push(a.getX(i),a.getY(i),a.getZ(i));geo.setAttribute('color',new THREE.Float32BufferAttribute(c,3));}
            for(const a of [...Object.values(geo.attributes),...Object.values(geo.morphAttributes).flat()])if(!a.array.every(Number.isFinite)){geo.dispose();throw Error('Sommet anatomique non fini');}
            const morphs=o.morphTargetDictionary?{...o.morphTargetDictionary}:{},key=JSON.stringify([controle,origine,option,material,morphs]);
            if(!groupes.has(key))groupes.set(key,{controle,origine,option,material,morphs,geos:[]});
            groupes.get(key).geos.push(geo);
          });
          for(const {geos,...p} of groupes.values()){
            const geometry=mergeGeometries(geos,false);if(!geometry)throw Error('Fusion anatomique impossible : '+nom);
            geometry.morphTargetsRelative=geos[0].morphTargetsRelative;
            pieces.push({...p,geometry});
          }
          const attends=nom==='mains'?['mainL','mainR','doigtsL','doigtsR','pouceL','pouceR']:['head','regard','paupiere','bouche'];
          for(const c of attends)if(!pieces.some(p=>p.controle===c))throw Error('Contrôle manquant : '+nom+'/'+c);
          if(nom!=='mains'&&!pieces.some(p=>p.morphs.Clignement===0))throw Error('Clignement absent : '+nom);
        }finally{for(const g of groupes.values())for(const geo of g.geos)geo.dispose();libererArbre(gltf.scene);}
      }
      for(const [nom,pieces] of temporaires){pieces.forEach(p=>partager(p.geometry));cache.set(nom,pieces);}
      return etatAnatomieBlender();
    }catch(e){for(const pieces of temporaires.values())pieces.forEach(p=>p.geometry.dispose());throw e;}
  })();
  try{return await chargement;}catch(e){chargement=null;throw e;}
}
export function poserAnatomieBlender(parts,options,materiaux){
  if(!anatomieBlenderDisponible())throw Error('Anatomie non préchargée');
  const profil=options.profilVisage||(options.chignon?'chignon':'employe'),nom='tete-'+profil;
  if(!cache.has(nom))throw Error('Visage inconnu : '+profil);
  const visage=new THREE.Group();visage.name='Visage Blender '+profil;parts.teteMicro.add(visage);parts.visage=visage;
  const pivots={head:visage};parts._mainsBlender=[];
  for(const p of [...cache.get(nom),...cache.get('mains')]){
    if(p.option==='lunettes'&&!options.lunettes)continue;
    if(!pivots[p.controle]){
      const pivot=new THREE.Group();pivot.name='Blender:'+p.controle;pivot.position.fromArray(p.origine);
      const parent=p.controle.endsWith('L')?parts.mainL:p.controle.endsWith('R')?parts.mainR:visage;
      parent.add(pivot);pivots[p.controle]=pivot;
      if(!p.controle.startsWith('main'))parts[p.controle]=pivot;
    }
    const m=new THREE.Mesh(p.geometry,materiaux[p.material]);m.name='Blender:'+p.controle+':'+p.material;
    m.castShadow=p.material==='peau'||p.material==='cheveux';m.receiveShadow=m.castShadow;
    if(Object.keys(p.morphs).length){m.morphTargetDictionary={...p.morphs};m.morphTargetInfluences.fill(0);}
    pivots[p.controle].add(m);
    if(p.controle==='paupiere')parts.clignement=m;
    // Mains v02 : le pouce porte aussi les poses Poing/Index/Ouvert (vrai poing fermé).
    if(/^(doigts|pouce)/.test(p.controle))parts._mainsBlender.push(m);
  }
  parts.regard=pivots.regard;parts.paupiere=pivots.paupiere;parts.bouche=pivots.bouche;
  parts.paupiereY=0;parts.paupiereDy=0;
  parts.anatomieBlender={tete:FICHIERS_ANATOMIE[nom],mains:FICHIERS_ANATOMIE.mains};
}
export function animerMainsBlender(parts,emote=null,travail=0,temps=0){
  for(const m of parts._mainsBlender||[]){
    const left=/(doigts|pouce)L:/.test(m.name),id=emote?.def.id,w=emote?.poids||0;
    const t=emote?emote.t/emote.def.duree:0;
    const transition=Math.min(1,t/.16)*Math.min(1,(1-t)/.14);
    const values={Poing:travail*(.08+.035*Math.sin(temps*22+(left?0:1.8))),Index:0,Ouvert:0,Pouce:0};
    if(emote?.def.sourceBlender){
      const pose=emote.def.echantillon(t),side=left?'L':'R';
      // Les clips antérieurs aux mains v02 n'ont pas de canal Pouce.
      for(const nom of ['Poing','Index','Ouvert','Pouce'])values[nom]+=((pose['main'+side+'_'+nom]??0)-values[nom])*w;
    }
    if(id==='takeL'&&left)values.Index=w*transition;
    if(id==='tchao'&&!left)values.Ouvert=w*transition;
    if(id==='arrogance'&&left)values.Ouvert=w*transition*.7;
    if(id==='moulin')values.Ouvert=w*Math.max(0,1-Math.abs(t-.6)*7);
    for(const [nom,i] of Object.entries(m.morphTargetDictionary))m.morphTargetInfluences[i]=THREE.MathUtils.clamp(values[nom]||0,0,1);
  }
}

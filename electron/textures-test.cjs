// Comparaison à éclairage et cadrage constants, inventaire de toutes les matières.
module.exports=async({js,shot,step,wait})=>{
  const fs=require('node:fs'),path=require('node:path');
  const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
  await step('diagnostic-matieres',`(async()=>{
    const g=__game,{initCharacterMaterials}=await import('./src/characters.js');
    const lignes=[],textures=new Set();
    for(const [famille,bibliotheque] of [['decor',g.MAT],['personnages',initCharacterMaterials()]])
      for(const [nom,m] of Object.entries(bibliotheque)){
        if(!m.isMaterial)continue;
        const cartes={};
        for(const canal of ['map','normalMap','roughnessMap','aoMap','emissiveMap']){
          const t=m[canal];if(!t)continue;textures.add(t.uuid);
          const img=t.image;const c=document.createElement('canvas');c.width=c.height=64;
          const ctx=c.getContext('2d');ctx.drawImage(img,0,0,64,64);const pixels=ctx.getImageData(0,0,64,64).data;
          let sum=0,lo=255,hi=0;for(let i=1;i<pixels.length;i+=4){sum+=pixels[i];lo=Math.min(lo,pixels[i]);hi=Math.max(hi,pixels[i]);}
          cartes[canal]={nom:t.name,resolution:[img.width,img.height],repeat:t.repeat.toArray(),couleur:t.colorSpace,moyenneVert:sum/(64*64*255),min:lo,max:hi};
        }
        lignes.push({famille,nom,couleur:m.color?.getHexString(),roughness:m.roughness,metalness:m.metalness,
          rugositeEffective:m.roughness*(cartes.roughnessMap?.moyenneVert??1),relief:m.normalScale?.toArray(),cartes});
      }
    const other=new Map();g.scene.traverse(o=>{for(const m of [].concat(o.material||[]))if(m.map)other.set(m.map.uuid,{type:m.type,resolution:[m.map.image?.width,m.map.image?.height],transparent:m.transparent});});
    window.__auditMatieres={version:await jeuAssets.version(),bibliotheque:lignes,texturesBibliotheque:textures.size,autresCartesDansLaScene:[...other.values()]};
    return {matieres:lignes.length,textures:textures.size};
  })()`);
  const audit=await js('__auditMatieres');fs.writeFileSync(path.join(out,'diagnostic.json'),JSON.stringify(audit,null,2));
  if(process.argv.includes('--textures-final'))await step('cartes-blender-chargees',`(async()=>{
    const {etatTexturesBlender}=await import('./src/textures-blender.js');const etat=etatTexturesBlender();
    if(Object.keys(etat).length!==7)throw Error('Bibliothèque Blender incomplète');
    const cartes=Object.values(etat).flatMap(c=>Object.values(c));if(cartes.length!==19)throw Error('Cartes manquantes');
    for(const row of __auditMatieres.bibliotheque.filter(r=>['bois','boisFonce','alu','aluSombre'].includes(r.nom)))
      if(row.rugositeEffective<.45)throw Error('Matière excessivement brillante : '+row.nom);
    return {matieres:Object.keys(etat),cartes:cartes.length};
  })()`);
  const vues=[
    ['poste',[-10.7,1.7,5.5],[-9,.85,3.1]],
    ['fauteuil',[-8.2,1.25,5.6],[-9,.64,4.05]],
    ['sol',[9,2.0,3],[8,.08,7]],
    ['cloisons',[-1.3,1.5,5.3],[-3,1.05,2.3]],
    ['open-space',[-2,2.5,11],[-11,1.2,-8]],
    ['escalier-volume',[5.35,2.5,13.8],[9.1,-.9,16.05]],
    ['direction',[13.2,2.1,-5.8],[17,1.2,-12.4]],
    ['cafe',[15.4,1.75,1.4],[18.8,1.2,-1.4]],
  ];
  for(const [nom,p,c] of vues){await js('(async()=>{vueDecor('+JSON.stringify(p)+','+JSON.stringify(c)+');for(let f=0;f<6;f++)await new Promise(requestAnimationFrame)})()');await wait(650);await shot(nom+'.jpg');}
  await step('textures-transitions',`(async()=>{
    const g=__game,etapes=[];
    for(const index of [3,5,0]){
      await g.demarrerNiveau(index);masquerPNJ();vueDecor([-2,2.5,11],[-11,1.2,-8]);
      for(let f=0;f<8;f++)await new Promise(requestAnimationFrame);
      etapes.push({niveau:index+1,textures:g.renderer.info.memory.textures,geometries:g.renderer.info.memory.geometries});
    }
    return {etapes,erreurs:window.__erreurs};
  })()`);
};

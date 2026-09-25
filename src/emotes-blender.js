// Lecture seulement : chaque échantillon provient des courbes du fichier Blender.
import sixSeven from '../assets/emote-67-v05.js';
import leitada from '../assets/emote-ela-ke-leitada-v05.js';
const clips={67:sixSeven,'ela-ke-leitada':leitada};
const os=new Set(['root','upper','head','armL','armR','elbowL','elbowR','mainL','mainR','legL','legR','kneeL','kneeR','footL','footR','doigtsL','doigtsR','pouceL','pouceR']);
for(const [id,c] of Object.entries(clips)){
  if(c.schema!==1||c.fps!==60||c.duree<=0||c.duree>12||!new RegExp('^'+id+'-v\\d\\d\\.blend$').test(c.source)||c.frames.length!==Math.round(c.duree*c.fps)+1)throw Error('Clip Blender incompatible : '+id);
  if(c.son&&!(/^[\w.-]+\.mp3$/.test(c.son.fichier)&&Number.isFinite(c.son.debut)))throw Error('Son Blender invalide : '+id);
  if(new Set(c.channels).size!==c.channels.length||!c.frames.every(f=>f.length===c.channels.length&&f.every(Number.isFinite)))throw Error('Canaux Blender invalides : '+id);
  for(const name of c.channels)if(!(/^(deplacement_[xyz]|clignement|regard_[xy]|bouche|main[LR]_(Ouvert|Poing|Index|Pouce))$/.test(name)||os.has(name.slice(0,-2))&&/_[xyz]$/.test(name)))throw Error('Contrôle inconnu : '+name);
}
export function emoteBlender(def){
  const c=clips[def.id];if(!c)throw Error('Emote Blender absente : '+def.id);
  const rotations=c.channels.map((key,i)=>[key.slice(0,-2),key.at(-1),i]).filter(([bone])=>os.has(bone));
  function echantillon(u){
    const f=Math.max(0,Math.min(1,u))*(c.frames.length-1),i=Math.floor(f),a=c.frames[i],b=c.frames[Math.min(i+1,c.frames.length-1)],k=f-i;
    return Object.fromEntries(c.channels.map((name,j)=>[name,a[j]+(b[j]-a[j])*k]));
  }
  return {...def,duree:c.duree,sourceBlender:c.source,son:c.son||null,echantillon,
    pose(p,u,w){
      if(w<=0)return;const v=echantillon(u);
      for(const [bone,axis,index] of rotations)if(p[bone])p[bone].rotation[axis]+=(v[c.channels[index]]-p[bone].rotation[axis])*w;
      for(const axis of ['x','y','z'])p.root.position[axis]+=v['deplacement_'+axis]*w;
    },
    visage(p,u,w){
      if(w<=0)return;const v=echantillon(u);
      if(p.clignement)p.clignement.morphTargetInfluences[0]+=(v.clignement-p.clignement.morphTargetInfluences[0])*w;
      if(p.regard){p.regard.position.x+=(v.regard_x-p.regard.position.x)*w;p.regard.position.y+=(v.regard_y-p.regard.position.y)*w;}
      if(p.bouche)p.bouche.scale.y+=(v.bouche-p.bouche.scale.y)*w;
      if(p.teteMicro)p.teteMicro.rotation.set(p.teteMicro.rotation.x*(1-w),p.teteMicro.rotation.y*(1-w),p.teteMicro.rotation.z*(1-w));
    },
  };
}

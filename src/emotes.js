import {emoteBlender} from './emotes-blender.js';

// Quatre scènes historiques : préparation, accent, temps de lecture, récupération.
// Les clés sont écrites en secondes. Une courbe quintique évite les cassures
// de vitesse/accélération aux poses, y compris au début et à la fin.
const borner = v => Math.max(0, Math.min(1, v));
export const adoucir = v => { const t=borner(v); return t*t*t*(t*(t*6-15)+10); };
const axes=['x','y','z'];
// Mains v02 : au repos, poignets tournés vers les cuisses (dos de la main à l'extérieur,
// pouce vers l'avant). À 0, la paume regarde devant : c'est la référence des gestes.
export const POIGNET_REPOS=1.0;
// Frappe au clavier : demi-tour de l'avant-bras depuis la paume vers l'avant → paumes vers le bas.
export const POIGNET_CLAVIER=2.9;
const os=['root','upper','head','armL','armR','elbowL','elbowR','mainL','mainR',
  'legL','legR','kneeL','kneeR','footL','footR','doigtsL','doigtsR','pouceL','pouceR'];
const repos=Object.fromEntries(os.flatMap(b=>axes.map(a=>[b+'_'+a,0])));
Object.assign(repos,{armL_z:.06,armR_z:-.06,elbowL_x:-.22,elbowR_x:-.22,mainL_y:POIGNET_REPOS,mainR_y:-POIGNET_REPOS,
  deplacement_x:0,clignement:0,regard_x:0,regard_y:0,bouche:1});
const canaux=Object.keys(repos);
const rotations=canaux.filter(k=>os.includes(k.split('_')[0])).map(k=>[k,...k.split('_')]);
function scene(def,cles) {
  const frames=cles.map(([t,pose])=>({t,pose:{...repos,...pose}}));
  function echantillon(u) {
    const t=borner(u)*def.duree;
    let i=0;while(i<frames.length-2 && t>frames[i+1].t)i++;
    const a=frames[i],b=frames[i+1],k=adoucir((t-a.t)/(b.t-a.t));
    return Object.fromEntries(canaux.map(c=>[c,a.pose[c]+(b.pose[c]-a.pose[c])*k]));
  }
  return {...def,echantillon,
    pose(p,u,w){
      if(w<=0)return;
      const v=echantillon(u);
      for(const [key,bone,axis] of rotations)if(p[bone])p[bone].rotation[axis]+=(v[key]-p[bone].rotation[axis])*w;
      p.root.position.x+=v.deplacement_x*w;
    },
    visage(p,u,w){
      if(w<=0)return;
      const v=echantillon(u);
      if(p.clignement)p.clignement.morphTargetInfluences[0]+=(v.clignement-p.clignement.morphTargetInfluences[0])*w;
      if(p.regard){p.regard.position.x+=(v.regard_x-p.regard.position.x)*w;p.regard.position.y+=(v.regard_y-p.regard.position.y)*w;}
      if(p.bouche)p.bouche.scale.y+=(v.bouche-p.bouche.scale.y)*w;
      // Les petits mouvements aléatoires ne doivent pas déplacer une main posée au front.
      if(p.teteMicro)p.teteMicro.rotation.set(p.teteMicro.rotation.x*(1-w),p.teteMicro.rotation.y*(1-w),p.teteMicro.rotation.z*(1-w));
    },
  };
}
const salut={armR_x:-2.5,armR_z:-.26,elbowR_x:-.3,mainR_y:-.18,
  armL_x:.10,elbowL_x:-.5,upper_y:-.16,head_y:.2,head_z:-.08};
const reverence={upper_x:.70,head_x:-.24,armR_x:.22,armR_z:.55,elbowR_x:-.25,
  armL_x:-.35,armL_z:.24,elbowL_x:-1.45,mainL_z:-.3,legL_x:-.10,kneeL_x:.18,footL_x:-.08,
  legR_x:-.10,kneeR_x:.18,footR_x:-.08,clignement:.35};
const lecture={armR_x:-.62,elbowR_x:-1.3,mainR_y:-.6,mainR_z:-.22,
  head_y:.3,head_x:.18,upper_y:.08,regard_x:.004,regard_y:-.002};
// Poignet calibré près de la tempe, devant les lunettes, sans masquer tout le visage.
const desespoir={armL_x:-1.34,armL_z:1.15,elbowL_x:-1.88,mainL_x:.15,
  armR_x:.08,elbowR_x:-.25,upper_x:.18,head_x:.08,head_y:-.06,clignement:.9,
  legL_x:-.10,kneeL_x:.2,footL_x:-.1,legR_x:-.10,kneeR_x:.2,footR_x:-.1};
const fatigue={upper_x:.62,head_x:.32,armL_x:.12,armR_x:.12,elbowL_x:-.06,elbowR_x:-.06,
  mainL_x:.24,mainR_x:.24,legL_x:-.56,legR_x:-.56,kneeL_x:1.1,kneeR_x:1.1,
  footL_x:-.54,footR_x:-.54,clignement:1};
const sursaut={upper_x:-.12,head_x:-.23,armL_z:-.8,armR_z:.8,armL_x:-.65,armR_x:-.65,
  elbowL_x:-.85,elbowR_x:-.85,mainL_z:.3,mainR_z:-.3,legL_x:-.18,legR_x:-.18,
  kneeL_x:.36,kneeR_x:.36,footL_x:-.18,footR_x:-.18,bouche:1.8};
const lettre={armL_x:-1.9,armL_z:.5,elbowL_x:-1.75,doigtsL_x:.10,pouceL_x:1.5,pouceL_z:.6,
  armR_x:-.2,armR_z:-.2,elbowR_x:-1.25,doigtsR_x:.24,head_x:-.12,head_y:.12};
function lancerJambe(cote) {
  const left=cote==='L',s=left?1:-1,other=left?'R':'L';
  return {...lettre,deplacement_x:s*.045,upper_y:-s*.045,upper_z:s*.04,head_z:-s*.04,
    ['leg'+cote+'_x']:-.85,['leg'+cote+'_z']:s*.28,['knee'+cote+'_x']:.30,['foot'+cote+'_x']:.55,
    ['leg'+other+'_x']:-.08,['knee'+other+'_x']:.16,['foot'+other+'_x']:-.08,
    armR_x:-.2+s*.28,elbowR_x:-1.25-Math.max(0,s)*.24};
}
export const EMOTES=[
  scene({id:'tchao',nom:'Démission',icone:'👋',duree:3.6,
    astuce:'Un dernier salut. Une révérence. Rideau.',apercu:2.45},[
    [0,{}],[.28,{armR_x:.23,elbowR_x:-.5,upper_y:.12,head_y:-.2}],
    [.72,salut],[.92,{...salut,mainR_z:.42}],[1.12,{...salut,mainR_z:-.34}],
    [1.32,{...salut,mainR_z:.38}],[1.52,{...salut,mainR_z:-.25}],
    [1.78,{...salut,mainR_z:0,head_x:.1}],
    [2.22,reverence],[2.64,reverence],[3.08,{upper_x:.08,head_x:-.09,armR_z:-.18}],[3.6,{}],
  ]),
  scene({id:'arrogance',nom:'Encore un mail',icone:'🤦',duree:3.8,
    astuce:'Un regard au boss. Puis un très long soupir.',apercu:2.15},[
    [0,{}],[.58,lecture],[.96,{...lecture,head_x:.27,clignement:.3}],
    [1.2,{...lecture,armL_x:-.85,elbowL_x:-1.15,head_y:0}],
    [1.62,desespoir],[2.04,{...desespoir,upper_x:.28,head_x:.12}],
    [2.45,{...desespoir,upper_x:.28,head_x:.12}],
    [2.98,{armL_x:-.8,elbowL_x:-1.2,head_x:.2,upper_x:.15,clignement:.45}],
    [3.35,{head_y:-.24,upper_x:.04}],[3.8,{}],
  ]),
  scene({id:'moulin',nom:'Réunion KO',icone:'🫠',duree:4.4,
    astuce:'Micro-sieste. Sursaut. Personne n’a rien vu.',apercu:2.65},[
    [0,{}],[.5,{head_x:.13,clignement:.5,upper_x:.08}],
    [.85,{head_x:.04,clignement:.15}],
    [1.65,fatigue],[2.28,{...fatigue,head_z:.12}],
    [2.62,sursaut],[2.82,sursaut],
    [3.2,{head_y:-.65,armL_x:-.15,elbowL_x:-.6}],
    [3.62,{head_y:.6,armR_x:-.15,elbowR_x:-.6}],
    [3.94,{head_y:.25,upper_x:.04}],[4.4,{}],
  ]),
  scene({id:'takeL',nom:'Take the L',icone:'Ⓛ',duree:4.2,
    astuce:'Le L au front, quatre pas pour la sortie.',apercu:1.22},[
    [0,{}],[.25,{armL_x:.3,elbowL_x:-.4,upper_y:.08}],
    [.70,lettre],[.9,lettre],
    [1.15,lancerJambe('L')],[1.34,lancerJambe('L')],[1.57,lettre],
    [1.82,lancerJambe('R')],[2.01,lancerJambe('R')],[2.24,lettre],
    [2.49,lancerJambe('L')],[2.68,lancerJambe('L')],[2.91,lettre],
    [3.16,lancerJambe('R')],[3.35,lancerJambe('R')],[3.6,lettre],[4.2,{}],
  ]),
  emoteBlender({id:'67',nom:'67',icone:'67',apercu:1.61,astuce:'Six… seven. Les paumes en balance.'}),
  emoteBlender({id:'ela-ke-leitada',nom:'Ela Ké Leitada',icone:'🕺',apercu:1.04,astuce:'Main sur la bouche, pouce qui pointe… et un œil sur la montre.'}),
];

export function reactionEmote(npc,def) {
  const choix=npc.isBoss?['On facture ça à quel client ?','Le spectacle est fini. Au travail.']
    :npc.role==='sécurité'?['Je note ça dans mon rapport.','Circulez… avec moins de style.']
    :npc.role==='chef d’équipe'?['Ça compte comme du team building ?','On en parle au prochain point.']
    :def.id==='67'?['Six ou sept réunions ?','Je préfère zéro réunion.']
    :def.id==='ela-ke-leitada'?['Pourquoi tu me pointes du pouce ?','Oui, il est bientôt l’heure. Et alors ?']
    :def.id==='moulin'?['Je te comprends.','Encore une réunion et je fais pareil.']
    :def.id==='takeL'?['C’est pour moi, le L ?','Très mature.']
    :['Je n’ai rien vu.','Tu me l’apprends demain ?','Les RH vont adorer.'];
  return choix[(Math.random()*choix.length)|0];
}

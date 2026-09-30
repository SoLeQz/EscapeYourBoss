const {atelier}=require('./anatomie-test.cjs');
module.exports=async({js,shot,step,wait})=>{
 await step('roue-neuf',`(async()=>{
  const g=__game;await g.demarrerNiveau(0);g.step=()=>{};g.preparation=false;
  const ok=(v,m)=>{if(!v)throw Error(m)};ok(g.roueCases.length===9,'Neuf emotes attendues');
  g.ouvrirRoue();g.fermerRoue(true);ok(!g.player.emote,'Le centre déclenche une emote');
  const indices=[],clavier=[];
  for(let i=0;i<9;i++){const a=-Math.PI/2+i*Math.PI*2/9;g.ouvrirRoue();g.bougerRoue(Math.cos(a)*180,Math.sin(a)*180);indices.push(g.roueSel);g.fermerRoue(false);g.player.emote=null;g.ouvrirRoue();dispatchEvent(new KeyboardEvent('keydown',{code:'Digit'+(i+1)}));g.fermerRoue(true);ok(g.player.emote,'Touche inactive');clavier.push(g.player.emote.def.id);g.player.emote=null}
  ok(indices.join()==='0,1,2,3,4,5,6,7,8','Secteurs décalés');ok(clavier.slice(4).join()==='67,ela-ke-leitada,aura-farming,griddy,floss','Nouveaux gestes non accessibles');
  g.player.emote=null;g.ouvrirRoue();dispatchEvent(new KeyboardEvent('keydown',{code:'Numpad6'}));ok(g.roueSel===5,'Pavé numérique inactif');g.fermerRoue(false);
  for(const code of ['Digit0','Numpad0']){g.ouvrirRoue();dispatchEvent(new KeyboardEvent('keydown',{code}));ok(g.roueSel===-1,'Une touche supprimée sélectionne encore une emote');g.fermerRoue(true);ok(!g.player.emote,'Apple reste accessible par la touche 0');}
  g.ouvrirRoue();g.bougerRoue(-156,-90);await new Promise(r=>setTimeout(r,350));
  return {indices,clavier,note:document.getElementById('roue-note').textContent};
 })()`);
 await step('musique-leitada',`(async()=>{
  const g=__game,ok=(v,m)=>{if(!v)throw Error(m)};g.player.emote=null;g.state='play';
  const buffer=await g.audio.chargerSon('emote-ela-ke-leitada-son-v01.mp3');ok(buffer&&buffer.duration>11,'MP3 non décodé');
  g.player.declencherEmote(5);await new Promise(r=>setTimeout(r,400));const m=g.audio.musique;ok(m&&m.def.id==='ela-ke-leitada','Musique absente pendant la danse');
  const ecart=Math.abs(g.audio.ctx.currentTime-m.depart-g.player.emote.t);
  g.player.emote.coupee=true;await new Promise(r=>setTimeout(r,300));ok(!g.audio.musique,'Musique non coupée avec la danse');
  g.player.declencherEmote(4);await new Promise(r=>setTimeout(r,200));ok(!g.audio.musique,'Le 67 doit rester muet');g.player.emote=null;
  return {dureeSon:buffer.duration,canaux:buffer.numberOfChannels,frequence:buffer.sampleRate,ecart,etatAudio:g.audio.ctx.state};
 })()`);
 await step('sons-tendances',`(async()=>{
  const g=__game,ok=(v,m)=>{if(!v)throw Error(m)};const {EMOTES}=await import('./src/emotes.js');const r={};g.state='play';
  for(const id of ['aura-farming','griddy','floss']){
   const e=EMOTES.find(x=>x.id===id);
   if(!e.son){g.player.emote=null;g.player.declencherEmote(EMOTES.indexOf(e));await new Promise(r=>setTimeout(r,300));ok(!g.audio.musique,'Une piste absente du clip joue encore : '+id);r[id]={son:null};continue;}
   const b=await g.audio.chargerSon(e.son.fichier);ok(b&&b.duration>0&&b.duration<=e.duree,'MP3 non décodé : '+id);
   g.player.emote=null;g.player.declencherEmote(EMOTES.indexOf(e));await new Promise(r=>setTimeout(r,400));ok(g.audio.musique?.def.id===id,'Musique absente : '+id);
   g.player.emote.coupee=true;await new Promise(r=>setTimeout(r,300));ok(!g.audio.musique,'Musique non coupée : '+id);r[id]=+b.duration.toFixed(2);
  }
  g.player.emote=null;return r;
 })()`);
 await wait(650);await shot('roue-neuf.jpg');
 await step('lisibilite-roue',`(async()=>{
  const g=__game;g.ouvrirRoue();await new Promise(r=>setTimeout(r,300));
  for(let selection=0;selection<g.roueCases.length;selection++){
   g.roueSel=selection;g.majRoue();await new Promise(r=>setTimeout(r,180));
   const boxes=g.roueCases.map(e=>e.getBoundingClientRect()),labels=g.roueCases.map(e=>e.querySelector('.nm').getBoundingClientRect());
   for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];
    if(Math.hypot((a.left+a.right-b.left-b.right)/2,(a.top+a.bottom-b.top-b.bottom)/2)<(a.width+b.width)/2-1)throw Error('Disques superposés : '+i+'/'+j);
    const x=labels[i],y=labels[j];if(Math.min(x.right,y.right)>Math.max(x.left,y.left)&&Math.min(x.bottom,y.bottom)>Math.max(x.top,y.top))throw Error('Libellés superposés : '+i+'/'+j);
   }
  }
  g.fermerRoue(false);return {cases:g.roueCases.length,selectionsVerifiees:9};
 })()`);

 await step('atelier',`(${atelier.toString()})()`);if(!await js('!!window.__anatomie'))return;
 const fs=require('node:fs'),path=require('node:path');const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6)||path.join(require('electron').app.getPath('temp'),'selftest');
 for(const [index,id,temps] of [[4,'67',[.65,.97,1.61,3.53]],[5,'ela-ke-leitada',[.34,1.04,2.81,3.97,4.36,5.63,9.86,10.9]]]){
  await step('clip-'+id,`(()=>{const a=__anatomie,r=a.pose(${index},${temps[0]});if(!a.p.emote.def.sourceBlender)throw Error('Clip absent');return {...r,source:a.p.emote.def.sourceBlender,duree:a.p.emote.def.duree}})()`);
  for(const t of temps){await js(`__anatomie.pose(${index},${t});__anatomie.vue('apres',[1.4,1.35,3.6,.94],'${id} · ${t} s')`);await wait(650);await shot(id+'-'+t+'.jpg');}
  await js(`__anatomie.pose(${index},${temps[2]});__anatomie.vue('apres',[0,1.30,2.2,1.22],'${id} · mains')`);await wait(650);await shot(id+'-mains.jpg');
  if(!process.argv.includes('--rapide'))fs.writeFileSync(path.join(out,id+'.webm'),Buffer.from(await js(`__anatomie.video(${index})`),'base64'));
 }
 await step('sources-v07',`import('./src/emotes.js').then(({EMOTES})=>['aura-farming','griddy','floss'].map(id=>{const index=EMOTES.findIndex(e=>e.id===id),e=EMOTES[index];if(!e||e.sourceBlender!==id+'-v07.blend')throw Error('Mauvaise source Blender : '+id);return {index,id,source:e.sourceBlender,duree:e.duree,apercu:e.apercu,son:e.son?.fichier||null}}))`);
 // Les temps dépendent de la durée du clip exporté, jamais d'une ancienne v06.
 // Chaque capture montre une pose active, de face puis de profil au même instant.
 const clips=await js(`import('./src/emotes.js').then(({EMOTES})=>EMOTES.map((e,index)=>({index,id:e.id,duree:e.duree,apercu:e.apercu})).filter(e=>['aura-farming','griddy','floss'].includes(e.id)))`);
 for(const {index,id,duree,apercu} of clips){
  const temps=[...new Set([apercu,...[.2,.4,.6,.8].map(u=>+(u*duree).toFixed(2))])];
  for(const t of temps){
   await step('pose-'+id+'-'+t,`(()=>{const a=__anatomie,r=a.pose(${index},${t}),e=a.p.emote;if(!e||e.def.id!=='${id}')throw Error('Pose inactive');return {...r,source:e.def.sourceBlender,duree:e.def.duree,temps:e.t,poids:e.poids}})()`);
   await js(`__anatomie.vue('apres',[0,1.35,4,.94],'${id} · ${t} s · face')`);await wait(250);await shot(id+'-v07-'+t+'-face.jpg');
   await js(`__anatomie.vue('apres',[4,1.35,0,.94],'${id} · ${t} s · profil')`);await wait(250);await shot(id+'-v07-'+t+'-profil.jpg');
  }
  if(!process.argv.includes('--rapide'))fs.writeFileSync(path.join(out,id+'-v07.webm'),Buffer.from(await js(`__anatomie.video(${index})`),'base64'));
 }
 await step('interruption',`(()=>{const a=__anatomie;a.pose(5,2);const p=a.p,old=p.emote.t;p.emote.coupee=true;for(let i=0;i<30;i++)p.animate(1/120);if(p.emote)throw Error('Emote non interrompue');if(p.parts._mainsBlender.some(m=>m.morphTargetInfluences.some(v=>Math.abs(v)>.001)))throw Error('Doigts restés en pose');return {tempsFige:old,interruption:true}})()`);
 await js('__anatomie.g.renderer.setAnimationLoop(null)');
};

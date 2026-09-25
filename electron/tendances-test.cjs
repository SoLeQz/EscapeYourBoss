const {atelier}=require('./anatomie-test.cjs');
module.exports=async({js,shot,step,wait})=>{
 await step('roue-six',`(async()=>{
  const g=__game;await g.demarrerNiveau(0);g.step=()=>{};g.preparation=false;
  const ok=(v,m)=>{if(!v)throw Error(m)};ok(g.roueCases.length===6,'Six emotes attendues');
  g.ouvrirRoue();g.fermerRoue(true);ok(!g.player.emote,'Le centre déclenche une emote');
  const indices=[],clavier=[];
  for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI/3;g.ouvrirRoue();g.bougerRoue(Math.cos(a)*180,Math.sin(a)*180);indices.push(g.roueSel);g.fermerRoue(false);g.player.emote=null;g.ouvrirRoue();dispatchEvent(new KeyboardEvent('keydown',{code:'Digit'+(i+1)}));g.fermerRoue(true);ok(g.player.emote,'Touche inactive');clavier.push(g.player.emote.def.id)}
  ok(indices.join()==='0,1,2,3,4,5','Secteurs décalés');ok(clavier[4]==='67'&&clavier[5]==='ela-ke-leitada','Nouveaux gestes non accessibles');
  g.player.emote=null;g.ouvrirRoue();dispatchEvent(new KeyboardEvent('keydown',{code:'Numpad6'}));ok(g.roueSel===5,'Pavé numérique inactif');g.fermerRoue(false);
  g.ouvrirRoue();dispatchEvent(new KeyboardEvent('keydown',{code:'Digit7'}));ok(g.roueSel===-1,'Septième choix fantôme');g.bougerRoue(-156,-90);
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
 await wait(650);await shot('roue-six.jpg');
 await step('lisibilite-roue',`(()=>{const boxes=__game.roueCases.map(e=>e.getBoundingClientRect());for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){const a=boxes[i],b=boxes[j];if(Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top))throw Error('Cases superposées');}__game.fermerRoue(true);return {cases:boxes.map(b=>({x:b.x,y:b.y,w:b.width,h:b.height}))}})()`);
 await step('atelier',`(${atelier.toString()})()`);if(!await js('!!window.__anatomie'))return;
 const fs=require('node:fs'),path=require('node:path');const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6)||path.join(require('electron').app.getPath('temp'),'selftest');
 for(const [index,id,temps] of [[4,'67',[.65,.97,1.61,3.53]],[5,'ela-ke-leitada',[.34,1.04,2.81,3.97,4.36,5.63,9.86,10.9]]]){
  await step('clip-'+id,`(()=>{const a=__anatomie,r=a.pose(${index},${temps[0]});if(!a.p.emote.def.sourceBlender)throw Error('Clip absent');return {...r,source:a.p.emote.def.sourceBlender,duree:a.p.emote.def.duree}})()`);
  for(const t of temps){await js(`__anatomie.pose(${index},${t});__anatomie.vue('apres',[1.4,1.35,3.6,.94],'${id} · ${t} s')`);await wait(650);await shot(id+'-'+t+'.jpg');}
  await js(`__anatomie.pose(${index},${temps[2]});__anatomie.vue('apres',[0,1.30,2.2,1.22],'${id} · mains')`);await wait(650);await shot(id+'-mains.jpg');
  if(!process.argv.includes('--rapide'))fs.writeFileSync(path.join(out,id+'.webm'),Buffer.from(await js(`__anatomie.video(${index})`),'base64'));
 }
 await step('interruption',`(()=>{const a=__anatomie;a.pose(5,2);const p=a.p,old=p.emote.t;p.emote.coupee=true;for(let i=0;i<30;i++)p.animate(1/120);if(p.emote)throw Error('Emote non interrompue');if(p.parts._mainsBlender.some(m=>m.morphTargetInfluences.some(v=>Math.abs(v)>.001)))throw Error('Doigts restés en pose');return {tempsFige:old,interruption:true}})()`);
 await js('__anatomie.g.renderer.setAnimationLoop(null)');
};

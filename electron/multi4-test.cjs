// Quatre vraies fenêtres Electron, TCP/UDP réel, profils de test temporaires.
const {BrowserWindow,screen}=require('electron');
const path=require('node:path'),fs=require('node:fs');
module.exports=async({js,step,shot,wait})=>{
 const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6),fenetres=[],clients=[js];
 const zone=screen.getPrimaryDisplay().workArea,w=Math.floor(zone.width/2),h=Math.floor(zone.height/2);
 BrowserWindow.getAllWindows()[0].setBounds({x:zone.x,y:zone.y,width:w,height:h});
 const attendre=async(c,expr,ms=45000)=>{const t=Date.now();while(!(await c(expr))){if(Date.now()-t>ms)throw Error('Délai '+expr+' · '+await c('JSON.stringify({etat:__game.state,niveau:__game.niveauIndex,manche:__game.multi.manche,effectif:__game.multi.effectif,pairs:[...__game.multi.pairs.values()].map(p=>({id:p.id,pret:p.pret,sorti:p.sorti})),erreurs:__erreurs})'));await wait(100)}};
 const tester=async(nom,fn)=>{try{const r=await fn();await step(nom,`(${JSON.stringify(r??true)})`)}catch(e){await step(nom,`(()=>{throw Error(${JSON.stringify(e.message)})})()`);throw e}};
 const lancer=async(index,n)=>{
   await js(`__game.lancerMulti(${index})`);
   await Promise.all(clients.slice(0,n).map(c=>attendre(c,`__game.state==='play'&&!__game.preparation&&__game.niveauIndex===${index}`)));
   await js('__game.npcs.forEach(n=>{n.gainRate=0;n.suspicion=0});__game.timeLeft=500');
 };
 const sortir=async(c,id='stairs')=>{
   const r=await c(`(()=>{const g=__game,it=g.level.interactables.find(x=>x.id==='${id}')||g.level.interactables[0];g.player.pos.set(it.x,0,it.z);g.player.vel.set(0,0,0);g.tryInteract();return g.exitSeq?.id})()`);
   if(!r)throw Error('Sortie refusée');await attendre(c,'__game.multi.sortiLocal',10000);
 };
 try{
  await tester('quatre-fenetres',async()=>{
   await js("__game.setQualite('bas',true);__game.renderer.setPixelRatio(.5)");
   for(let i=1;i<4;i++){
    const f=new BrowserWindow({x:zone.x+(i%2)*w,y:zone.y+Math.floor(i/2)*h,width:w,height:h,show:true,
     webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false,additionalArguments:['--jeu-selftest']}});
    fenetres.push(f);await f.loadFile(path.join(__dirname,'..','index.html'));const c=e=>f.webContents.executeJavaScript(e,true);clients.push(c);
    await attendre(c,"!!window.__game&&document.getElementById('chargement').classList.contains('parti')");await c("__game.setQualite('bas',true);__game.renderer.setPixelRatio(.5)");
   }
   return clients.length;
  });
  await tester('salon-a-trois',async()=>{
   await js("__game.menu.ouvrir('menu-multi');__game.multi.heberger('Hôte')");
   for(let i=1;i<3;i++)await clients[i](`__game.menu.ouvrir('menu-multi');__game.multi.rejoindre('127.0.0.1','Ami ${i}')`);
   await Promise.all(clients.slice(0,3).map(c=>attendre(c,'__game.multi.effectif.length===3')));return await js('document.getElementById("multi-joueurs").textContent');
  });
  await tester('partie-a-trois',async()=>{
   await lancer(0,3);
   for(const c of clients.slice(0,3))await attendre(c,'__game.coequipiers.size===2&&[...__game.coequipiers.values()].every(p=>p.mesh.visible)');
   const ps=await Promise.all(clients.slice(0,3).map(c=>c('__game.player.pos.toArray()')));
   if(ps.some((a,i)=>ps.slice(i+1).some(b=>Math.hypot(a[0]-b[0],a[2]-b[2])<.75)))throw Error('Départs superposés');return ps;
  });
  await tester('victoire-attend-trois',async()=>{
   await js('__game.level.ramassables.forEach((o,i)=>__game.ramasserObjet(i))');await wait(500);
   await sortir(clients[1]);await sortir(clients[2]);
   if(await js('__game.state')!=='play')throw Error('Victoire avant la sortie de tous');
   await sortir(js);await Promise.all(clients.slice(0,3).map(c=>attendre(c,"__game.state==='over'")));return true;
  });
  await tester('salon-a-quatre',async()=>{
   await js('__game.retourMenuMulti()');await attendre(clients[1],"__game.state==='menu'");
   await clients[3]("__game.menu.ouvrir('menu-multi');__game.multi.rejoindre('127.0.0.1','Ami 3')");
   await Promise.all(clients.map(c=>attendre(c,'__game.multi.effectif.length===4')));return await js('document.getElementById("multi-joueurs").textContent');
  });
  await tester('joueurs-et-tenues-a-quatre',async()=>{
   await clients[3]("__game.multi.envoyer({t:'apparence',a:{tete:'bonnet',couleurs:{tete:0x43a047}}})");await wait(300);
   await lancer(6,4);
   for(const c of clients)await attendre(c,'__game.coequipiers.size===3&&[...__game.coequipiers.values()].every(p=>p.mesh.visible)');
   const id=await clients[3]('__game.multi.id');
   for(const c of clients.slice(0,3))if(await c(`__game.coequipiers.get(${id}).apparence.tete`)!=='bonnet')throw Error('Tenue du quatrième perdue');
   await clients[3]('__game.player.pos.x+=.7');await wait(600);
   const pos=await clients[3]('__game.player.pos.toArray()');
   for(const c of clients.slice(0,3))await attendre(c,`Math.hypot(__game.coequipiers.get(${id}).pos.x-${pos[0]},__game.coequipiers.get(${id}).pos.z-${pos[2]})<.3`,10000);
   if(out)fs.writeFileSync(path.join(out,'partie-a-quatre.jpg'),(await fenetres[1].webContents.capturePage()).toJPEG(85));
   return {id,position:pos};
  });
  await tester('secrets-partages-a-quatre',async()=>{
   for(const type of ['disjoncteur','passage']){
    await clients[3](`(()=>{const g=__game,it=g.interactifs.liste.find(a=>a.type==='${type}');g.player.pos.set(it.x,0,it.z);g.player.vel.set(0,0,0)})()`);await wait(500);await clients[3]('__game.tryInteract()');
    const expr=type==='disjoncteur'?'__game.interactifs.obscurite>0':"__game.interactifs.liste.find(a=>a.type==='passage').ouvert";
    for(const c of clients)await attendre(c,expr,5000);
   }
   await clients[2]('__game.ramasserCanard(__game.level.canards[0])');
   for(const c of clients)await attendre(c,'__game.level.canards[0].pris',5000);return true;
  });
  await tester('carton-et-cafe-cibles',async()=>{
   await lancer(7,4);
   await clients[3](`(()=>{const g=__game,it=g.interactifs.liste.find(a=>a.type==='carton');g.player.pos.set(it.x+.85,0,it.z);g.player.vel.set(0,0,0)})()`);await wait(500);await clients[3]('__game.tryInteract()');
   const id=await clients[3]('__game.multi.id');await attendre(clients[3],"__game.player.deguisement==='carton'",5000);
   for(const c of clients.slice(0,3))await attendre(c,`__game.coequipiers.get(${id}).deguisement==='carton'&&!__game.coequipiers.get(${id}).mesh.visible`,5000);
   if(await clients[2]('!!__game.player.deguisement'))throw Error('Mauvais porteur du carton');
   await clients[3]('__game.tryInteract()');await attendre(clients[3],'!__game.player.deguisement',5000);
   for(const c of clients)await c('__game.player.stress=.6');
   await js(`__game.multi.envoyer({t:'cafe'},${id})`);await wait(400);
   if(await clients[3]('__game.player.stress')>.4||await clients[2]('__game.player.stress')<.4)throw Error('Café reçu par le mauvais joueur');return true;
  });
  await tester('postes-et-quatrieme-percu',async()=>{
   await clients[3](`(()=>{const g=__game,it=g.actionsBureau.find(a=>a.type==='travail');g.player.pos.set(it.x,0,it.z);g.player.vel.set(0,0,0);g.tryInteract()})()`);
   const id=await clients[3]('__game.multi.id');await attendre(js,`!!__game.coequipiers.get(${id}).working`,5000);await wait(13000);
   if(await clients[3]('!!__game.player.working'))throw Error('Crédit infini au poste');
   const p=await js(`(async()=>{const g=__game,{mesurerVue}=await import('./src/perception.js');for(const n of g.npcs)for(const d of [2,3,4])for(const a of [0,-.4,.4]){const x=n.pos.x+Math.sin(n.headYaw+a)*d,z=n.pos.z+Math.cos(n.headYaw+a)*d;if(g.level.obstacles.some(o=>x>o.x1-.4&&x<o.x2+.4&&z>o.z1-.4&&z<o.z2+.4))continue;if(mesurerVue(n,{pos:{x,z},chestY:1.3,eyeY:1.6,crouch:0},g.level.obstacles).visible){n.gainRate=.85;n.suspicion=0;return {i:g.npcs.indexOf(n),x,z}}}throw Error('Point de vue absent')})()`);
   await clients[3](`__game.player.pos.set(${p.x},0,${p.z});__game.player.working=null`);
   await attendre(js,`__game.npcs[${p.i}].suspicion>.05`,3000);await js('__game.npcs.forEach(n=>{n.gainRate=0;n.suspicion=0})');return p;
  });
  await tester('defaite-et-relance-a-quatre',async()=>{
   await js('__game.lose(__game.npcs[0])');for(const c of clients)await attendre(c,"__game.state==='over'",5000);
   await lancer(7,4);return true;
  });
  await tester('sorties-attendent-quatre',async()=>{
   await js('__game.level.ramassables.forEach((o,i)=>__game.ramasserObjet(i))');await wait(500);
   for(let i=1;i<4;i++)await sortir(clients[i],'nacelle');
   if(await js('__game.state')!=='play')throw Error('Victoire avant le dernier joueur');
   await sortir(js,'nacelle');for(const c of clients)await attendre(c,"__game.state==='over'",5000);return true;
  });
  await tester('dix-departs-a-quatre',async()=>{
   for(let i=0;i<10;i++){await lancer(i,4);for(const c of clients)await attendre(c,'[...__game.coequipiers.values()].every(p=>p.mesh.visible)',5000)}return true;
  });
  await tester('depart-et-retour-a-trois',async()=>{
   await clients[3]('__game.multi.quitter()');for(const c of clients.slice(0,3))await attendre(c,"__game.state==='menu'&&__game.multi.effectif.length===3",5000);
   await lancer(0,3);if(await js('__game.coequipiers.size')!==2)throw Error('Ancien joueur toujours présent');return true;
  });
  await tester('retour-speedrun',async()=>{
   await js('__game.retourMenuMulti()');await attendre(clients[1],"__game.state==='menu'");
   for(const c of clients)await c('__game.multi.quitter()');
   await clients[2]('__game.lancerSpeedrun(0)');await attendre(clients[2],"__game.state==='play'");
   if(!await clients[2]('__game.player.mesh.visible&&[...__game.coequipiers.values()].every(p=>!p.mesh.visible)'))throw Error('Visibilité solo incorrecte');return true;
  });
  await tester('erreurs',async()=>{const erreurs=(await Promise.all(clients.map(c=>c('__erreurs')))).flat();if(erreurs.length)throw Error(erreurs.join(';'));return erreurs});
  if(out)fs.writeFileSync(path.join(out,'quatre-joueurs.jpg'),(await fenetres[1].webContents.capturePage()).toJPEG(85));
 }catch(e){await step('diagnostic',JSON.stringify(e.message));for(let i=0;i<clients.length;i++){try{const d=await clients[i]('JSON.stringify({etat:__game.state,phase:__game.chargementPhase,prep:__game.preparation,niveau:__game.niveauIndex,id:__game.multi.id,monde:!!__game.multi.monde,position:__game.player.pos.toArray(),avatars:[...__game.coequipiers].map(([id,p])=>({id,pos:p.pos.toArray()})),pairs:[...__game.multi.pairs.values()].map(p=>({id:p.id,pret:p.pret,etat:p.etat})),erreurs:__erreurs})');await step('fenetre-'+i,JSON.stringify(d))}catch{}}}
 finally{for(const c of clients)try{await c('__game.multi.quitter()')}catch{}for(const f of fenetres)if(!f.isDestroyed())f.destroy()}
};

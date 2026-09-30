import { DEPARTEMENTS } from './departements.js';
export const CELLULES_DEPARTEMENTS=DEPARTEMENTS.flatMap(d=>['identite','tableau','ecran'].map(t=>t+'-'+d.id));
const hex=n=>'#'+n.toString(16).padStart(6,'0');
// Graphisme vectoriel net, atlas commun : aucune image ou texture téléchargée.
export function dessinerDepartement(c,id){
 const d=DEPARTEMENTS.find(d=>id.endsWith('-'+d.id));if(!d)return false;
 const accent=hex(d.accent),second=hex(d.secondaire),fond=hex(d.fond);
 const rect=(x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x,y,w,h)};
 const texte=(s,x,y,size,col=accent)=>{c.font=`700 ${size}px Arial`;c.fillStyle=col;c.fillText(s,x,y)};
 const rond=(x,y,r,col)=>{c.fillStyle=col;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()};
 const ligne=(pts,col,w=3)=>{c.strokeStyle=col;c.lineWidth=w;c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke()};
 const titre=id.startsWith('identite'),ecran=id.startsWith('ecran');
 rect(0,0,512,256,ecran?accent:fond);rect(0,0,512,9,second);
 texte(ecran?d.ecran:titre?d.etage+' / '+d.court.toUpperCase():d.detail,24,42,titre?29:20,ecran?fond:accent);
 if(d.id==='rh'){
   for(let i=0;i<3;i++){rect(74+i*148,158,56,40,second);ligne([[102+i*148,161],[102+i*148,94]],accent,5);for(const s of [-1,1]){rond(102+i*148+s*18,120,20,accent);rond(102+i*148+s*12,91,15,accent)}}
   if(!titre)texte('FICUS : 100 % DE PRÉSENCE',52,223,22,ecran?fond:accent);
 }else if(d.id==='finance'){
   for(let i=0;i<7;i++){rect(38+i*58,202-(titre?45+i*13:135-i*19),34,titre?45+i*13:135-i*19,second)}
   ligne([[32,64],[32,207],[467,207]],ecran?fond:accent);if(!titre)texte('PRÉVISION : RETOURNER LE GRAPHIQUE',30,235,16,ecran?fond:accent);
 }else if(d.id==='support'){
   for(let i=0;i<17;i++){const h=20+Math.abs(Math.sin(i*.85))*100;rect(34+i*27,140-h/2,12,h,second)}
   texte(ecran?'VOUS ÊTES LE PREMIER.':titre?'PARLONS-EN.':'DEPUIS 1998.',40,229,25,ecran?fond:accent);
 }else if(d.id==='studio'){
   for(let x=20;x<510;x+=24)rect(x,61,1,141,'#bac5c6');for(let y=61;y<211;y+=24)rect(20,y,472,1,'#bac5c6');
   ligne([[128,199],[128,86],[210,86],[210,199]],accent,8);ligne([[126,140],[253,140],[278,174],[278,207]],second,4);
   texte('V8',335,125,50,accent);texte('ASSISE ?',310,175,22,accent);
 }else if(d.id==='archives'){
   for(let i=0;i<8;i++){rect(26+i*60,78,48,105,i===4?accent:second);rect(32+i*60,94,36,22,fond);texte(i===4?'404':String(398+i),33+i*60,110,12,accent)}
   texte('RANGÉ NE VEUT PAS DIRE RETROUVÉ.',25,226,20,ecran?fond:accent);
 }else if(d.id==='juridique'){
   for(let i=0;i<5;i++)rect(32,75+i*24,360-i*25,6,ecran?fond:accent);
   rond(418,157,49,second);texte('NON',384,165,26,accent);texte('VOIR ALINÉA SUIVANT →',25,230,22,ecran?fond:accent);
 }else if(d.id==='marketing'){
   rond(401,141,84,second);rect(341,83,110,116,fond);rect(350,94,92,94,accent);
   texte('RIEN™',27,141,62,ecran?fond:accent);texte('0 % DE CONTENU',30,189,24,ecran?fond:accent);texte('100 % DE MARGE',30,230,22,ecran?fond:accent);
 }else if(d.id==='logistique'){
   for(let i=0;i<10;i++)rect(24+i*49,62,24,14,second);
   rect(321,90,139,112,second);ligne([[321,112],[460,112],[460,202],[321,202],[321,112]],accent,3);rect(382,90,16,112,accent);
   texte('FRAGILE',27,140,40,ecran?fond:accent);texte('MORAL / ↑ HAUT',27,184,24,ecran?fond:accent);
 }else if(d.id==='it'){
   for(let i=0;i<4;i++){const x=34+i*119;rect(x,82,90,44,'#172b35');rond(x+71,101,6,second);ligne([[x+44,126],[x+44,165],[261,165]],second,3)}
   texte(ecran?'ERROR: SUCCESS FAILED':'TOUS LES VOYANTS AU VERT',27,220,23,ecran?fond:accent);
 }else{
   for(const x of [40,449])rect(x,74,23,130,second);rect(180,184,150,16,accent);rect(210,151,90,33,second);
   texte('0',236,133,73,ecran?fond:accent);texte('LAURÉAT DEPUIS 1998',95,232,25,ecran?fond:accent);
 }
 if(titre){rect(0,210,512,46,accent);texte(d.slogan,23,239,16,fond)}
 return true;
}

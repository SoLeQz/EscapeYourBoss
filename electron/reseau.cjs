// Réseau local pour le mode multijoueur (2 à 4 joueurs, même Wi-Fi / même réseau).
//
// - Partie : TCP, un message JSON par ligne. L'hôte écoute sur PORT_JEU et
//   accepte trois invités ; tous s'annoncent (« bonjour ») et doivent
//   avoir la même version du jeu.
// - Découverte : l'hôte émet une balise UDP par seconde sur PORT_DECOUVERTE
//   (diffusion sur chaque réseau local + 127.0.0.1) ; l'invité écoute 1,5 s
//   et liste les parties trouvées. Rejoindre par IP reste possible.
//
// Aucune dépendance : node:net, node:dgram, node:os. Utilisable hors Electron
// (tests Node) ; main.cjs ne fait que relier ces sessions à l'IPC.
const net = require('node:net');
const dgram = require('node:dgram');
const os = require('node:os');
const { StringDecoder } = require('node:string_decoder');

const PORT_JEU = 47800;
const PORT_DECOUVERTE = 47801;
const MAX_LIGNE = 1 << 20;   // 1 Mo : un message plus long est une erreur

// Adresses IPv4 locales (hors boucle) et leurs adresses de diffusion.
function adressesLocales() {
  const res = [];
  for (const [nom, liste] of Object.entries(os.networkInterfaces())) {
    for (const a of liste || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const ip = a.address.split('.').map(Number), masque = a.netmask.split('.').map(Number);
      const diffusion = ip.map((o, i) => (o & masque[i]) | (~masque[i] & 255)).join('.');
      res.push({ interface: nom, ip: a.address, diffusion });
    }
  }
  return res;
}

// Adresse tapée par l'invité : « hôte », « hôte:port » (tunnel playit.gg, dont
// le port public n'est pas 47800) ou « [IPv6]:port ». Une IPv6 nue garde le
// port par défaut. Un éventuel « tcp:// » collé avec l'adresse est ignoré.
function lireAdresse(saisie, portDefaut = PORT_JEU) {
  const s = String(saisie ?? '').trim().replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '');
  let hote = s, port = portDefaut;
  const v6 = s.match(/^\[([^\]]+)\](?::(\d*))?$/);
  if (v6) { hote = v6[1]; if (v6[2] !== undefined) port = v6[2] === '' ? NaN : Number(v6[2]); }
  else if ((s.match(/:/g) || []).length === 1) {
    const i = s.indexOf(':');
    hote = s.slice(0, i); port = /^\d+$/.test(s.slice(i + 1)) ? Number(s.slice(i + 1)) : NaN;
  }
  if (!hote || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`Adresse invalide : « ${s} ». Exemples : 192.168.1.20 ou nom.ply.gg:12345.`);
  return { hote, port };
}

// Découpe un flux TCP en messages JSON (un par ligne).
function lecteurLignes(surMessage, surErreur) {
  let tampon = '';
  const decodeur = new StringDecoder('utf8');
  return chunk => {
    tampon += decodeur.write(chunk);
    if (tampon.length > MAX_LIGNE) { tampon = ''; surErreur(new Error('Message trop long')); return; }
    let i;
    while ((i = tampon.indexOf('\n')) >= 0) {
      const ligne = tampon.slice(0, i); tampon = tampon.slice(i + 1);
      if (!ligne.trim()) continue;
      let msg; try { msg = JSON.parse(ligne); } catch { surErreur(new Error('Message illisible')); continue; }
      surMessage(msg);
    }
  };
}

// Une session par fenêtre de jeu. `evenement(e)` reçoit :
//   {type:'ecoute', port} · {type:'connecte', role, nom} · {type:'message', msg}
//   {type:'deconnecte', raison} · {type:'erreur', message}
function creerSession({ version, evenement, adresseEcoute = '0.0.0.0', portJeu = PORT_JEU, portDecouverte = PORT_DECOUVERTE }) {
  let serveur = null, liaison = null, balise = null, role = null, nomLocal = 'Joueur', prochainId = 2, enPartie = false;
  const invites = new Map();
  const envoyerBrut = (s, msg) => { if (s && !s.destroyed) s.write(JSON.stringify(msg) + '\n'); };
  const diffuser = (msg, sauf = null) => { for (const p of invites.values()) if (p.pret && p.id !== sauf) envoyerBrut(p.s, msg); };
  const joueurs = () => [{id:1,nom:nomLocal}, ...[...invites.values()].filter(p=>p.pret).map(p=>({id:p.id,nom:p.nom}))];
  function effectif() {
    const liste = joueurs();
    diffuser({t:'effectif',joueurs:liste});
    evenement({type:'effectif',id:1,joueurs:liste});
  }
  function brancher(s, r, id = 1) {
    const p = {s,id,pret:false,nom:''};
    if (r === 'hote') invites.set(id,p); else liaison = p;
    s.setNoDelay(true);
    const delai = setTimeout(()=>s.destroy(),5000);
    s.on('data',lecteurLignes(msg=>{
      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') { s.destroy(); return; }
      if (!p.pret) {
        if (msg.t === 'refus') { evenement({type:'deconnecte',raison:String(msg.raison)}); s.destroy(); return; }
        if (msg.t !== 'bonjour') return;
        if (msg.version !== version) {
          envoyerBrut(s,{t:'refus',raison:`Versions différentes : ${version} ici, ${msg.version} en face. Installez la même version.`});s.end();return;
        }
        clearTimeout(delai);p.pret=true;p.nom=String(msg.nom || 'Coéquipier').slice(0,24);
        evenement({type:'connecte',role:r,id:r==='hote'?1:msg.vous,pair:id,nom:p.nom});
        if(r==='hote')effectif();
        return;
      }
      if(r==='invite') {
        if(msg.t==='effectif')evenement({type:'effectif',id:msg.vous,joueurs:msg.joueurs});
        else evenement({type:'message',msg});
      } else {
        // L'identité est attribuée par la connexion, jamais choisie par le client.
        const {de,_pour,...contenu}=msg;const message={...contenu,de:id};
        const permis=['joueur','apparence','pret','action','objet','emote','canard','secret','menu'];
        if(!permis.includes(message.t))return;
        if(message.t==='joueur'||message.t==='apparence')diffuser(message,id);
        evenement({type:'message',msg:message});
      }
    },()=>s.destroy()));
    s.on('close',()=>{
      clearTimeout(delai);
      if(r==='hote'&&invites.get(id)===p){invites.delete(id);if(p.pret){effectif();evenement({type:'parti',id,nom:p.nom,raison:'Connexion fermée'});}}
      if(r==='invite'&&liaison===p){liaison=null;evenement({type:'deconnecte',raison:'Connexion avec l’hôte fermée'});}
    });
    s.on('error',e=>evenement({type:'erreur',message:e.message}));
    envoyerBrut(s,{t:'bonjour',version,nom:nomLocal,...(r==='hote'?{vous:id}:{})});
    return p;
  }
  function arreterBalise(){if(balise){clearInterval(balise.timer);try{balise.sock.close()}catch{}balise=null;}}
  return {
    get role(){return role},
    get connecte(){return role==='hote'?[...invites.values()].some(p=>p.pret):!!liaison?.pret},
    heberger(nom){
      this.fermer();role='hote';nomLocal=String(nom||'Hôte').slice(0,24);prochainId=2;
      return new Promise((resolve,reject)=>{
        const srv=serveur=net.createServer(s=>{
          if(enPartie||invites.size>=3){envoyerBrut(s,{t:'refus',raison:enPartie?'Partie en cours : rejoins le salon entre deux parties.':'Partie déjà complète (4 joueurs).'});s.end();return;}
          brancher(s,'hote',prochainId++);
        });
        srv.once('error',e=>reject(new Error(e.code==='EADDRINUSE'?`Le port ${portJeu} est déjà utilisé : une autre partie est-elle ouverte ?`:e.message)));
        srv.listen(portJeu,adresseEcoute,()=>{
          if(serveur!==srv)return;
          const sock=dgram.createSocket({type:'udp4',reuseAddr:true});
          sock.on('error',()=>{});
          sock.bind(()=>{
            if(serveur!==srv){sock.close();return;}
            sock.setBroadcast(true);
            const envoyer=()=>{
              const data=Buffer.from(JSON.stringify({jeu:'EscapeYourBoss',version,nom:nomLocal,port:portJeu,place:!enPartie&&invites.size<3,joueurs:joueurs().length,max:4,enPartie}));
              for(const cible of new Set(['127.0.0.1','255.255.255.255',...adressesLocales().map(a=>a.diffusion)]))sock.send(data,portDecouverte,cible,()=>{});
            };
            balise={sock,timer:setInterval(envoyer,1000)};envoyer();
          });
          evenement({type:'ecoute',port:portJeu,adresses:adressesLocales().map(a=>a.ip)});effectif();
          resolve({port:portJeu,adresses:adressesLocales().map(a=>a.ip)});
        });
      });
    },
    rejoindre(adresse,nom,portDefaut=portJeu){
      let cible;try{cible=lireAdresse(adresse,portDefaut)}catch(e){return Promise.reject(e)}
      this.fermer();role='invite';nomLocal=String(nom||'Invité').slice(0,24);
      return new Promise((resolve,reject)=>{
        const s=net.connect({host:cible.hote,port:cible.port,timeout:5000,autoSelectFamily:true,autoSelectFamilyAttemptTimeout:2500});
        s.once('connect',()=>{s.setTimeout(0);brancher(s,'invite');resolve(true)});
        s.once('timeout',()=>{s.destroy();reject(new Error(`Aucune réponse de ${adresse} (délai dépassé).`))});
        s.once('error',e=>reject(new Error(e.code==='ECONNREFUSED'?`Aucune partie hébergée sur ${adresse}.`:e.message)));
      });
    },
    envoyer(msg){
      if(!msg||typeof msg!=='object')return;
      if(role==='hote'){
        if(msg.t==='lancer')enPartie=true;if(msg.t==='menu')enPartie=false;
        const {_pour,de,...contenu}=msg;const message={...contenu,de:1};
        if(_pour!=null){const p=invites.get(_pour);if(p?.pret)envoyerBrut(p.s,message)}else diffuser(message);
      }else if(liaison?.pret)envoyerBrut(liaison.s,msg);
    },
    fermer(){
      arreterBalise();const anciens=[...invites.values()];invites.clear();for(const p of anciens)p.s.destroy();
      if(liaison){const p=liaison;liaison=null;p.s.destroy()}
      if(serveur){serveur.close();serveur=null}role=null;enPartie=false;
    },
  };
}

// Écoute les balises pendant `duree` ms ; renvoie les parties trouvées.
function rechercherParties({ duree = 1500, version = null, portDecouverte = PORT_DECOUVERTE } = {}) {
  return new Promise(resolve => {
    const trouvees = new Map();
    // une balise venue de cette machine (autre fenêtre, adaptateur virtuel) → 127.0.0.1
    const locales = new Set(adressesLocales().map(a => a.ip));
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const fin = () => { try { sock.close(); } catch {} resolve([...trouvees.values()]); };
    sock.on('message', (buf, rinfo) => {
      try {
        const b = JSON.parse(buf.toString('utf8'));
        if (b.jeu !== 'EscapeYourBoss') return;
        // la même partie arrive par plusieurs chemins : on préfère l'IP du réseau local
        const cle = b.nom + ':' + b.port;
        const ip = locales.has(rinfo.address) ? '127.0.0.1' : rinfo.address;
        const ancienne = trouvees.get(cle);
        if (ancienne && ancienne.ip !== '127.0.0.1' && ip === '127.0.0.1') return;
        trouvees.set(cle, { nom: b.nom, ip, port: b.port, version: b.version,
          compatible: version == null || b.version === version, place: b.place !== false, joueurs: b.joueurs || 1, max: b.max || 4, enPartie: !!b.enPartie });
      } catch {}
    });
    sock.on('error', fin);
    sock.bind(portDecouverte, () => setTimeout(fin, duree));
  });
}

module.exports = { creerSession, rechercherParties, adressesLocales, lireAdresse, PORT_JEU, PORT_DECOUVERTE };

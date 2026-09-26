// Réseau local pour le mode multijoueur (2 joueurs, même Wi-Fi / même réseau).
//
// - Partie : TCP, un message JSON par ligne. L'hôte écoute sur PORT_JEU et
//   accepte un seul invité ; les deux s'annoncent (« bonjour ») et doivent
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
  return chunk => {
    tampon += chunk.toString('utf8');
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
  let serveur = null, socket = null, balise = null, role = null, nomLocal = 'Joueur', pret = false;

  function brancher(s, r) {
    socket = s; role = r; pret = false;
    s.setNoDelay(true);
    s.on('data', lecteurLignes(msg => {
      if (!pret) {
        if (msg.t === 'refus') { evenement({ type: 'deconnecte', raison: msg.raison }); s.destroy(); return; }
        if (msg.t !== 'bonjour') return;
        if (msg.version !== version) {
          envoyerBrut(s, { t: 'refus', raison: `Versions différentes : ${version} ici, ${msg.version} en face. Installez la même version.` });
          evenement({ type: 'deconnecte', raison: `Version différente chez ${msg.nom || 'l’autre joueur'} (${msg.version}).` });
          s.end(); return;
        }
        pret = true;
        evenement({ type: 'connecte', role, nom: String(msg.nom || 'Coéquipier').slice(0, 24) });
        return;
      }
      evenement({ type: 'message', msg });
    }, e => evenement({ type: 'erreur', message: e.message })));
    s.on('close', () => {
      if (socket === s) { socket = null; evenement({ type: 'deconnecte', raison: 'Connexion fermée' }); }
    });
    s.on('error', e => evenement({ type: 'erreur', message: e.message }));
    envoyerBrut(s, { t: 'bonjour', version, nom: nomLocal });
  }
  const envoyerBrut = (s, msg) => { if (s && !s.destroyed) s.write(JSON.stringify(msg) + '\n'); };

  function arreterBalise() { if (balise) { clearInterval(balise.timer); balise.sock.close(); balise = null; } }

  return {
    get role() { return role; },
    get connecte() { return !!socket && pret; },

    heberger(nom) {
      this.fermer();
      nomLocal = String(nom || 'Hôte').slice(0, 24);
      return new Promise((resolve, reject) => {
        serveur = net.createServer(s => {
          if (socket) { envoyerBrut(s, { t: 'refus', raison: 'Partie déjà complète (2 joueurs).' }); s.end(); return; }
          brancher(s, 'hote');
        });
        serveur.once('error', e => reject(new Error(e.code === 'EADDRINUSE'
          ? `Le port ${portJeu} est déjà utilisé : une autre partie est-elle ouverte ?` : e.message)));
        serveur.listen(portJeu, adresseEcoute, () => {
          // balise de découverte
          const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
          sock.bind(() => {
            sock.setBroadcast(true);
            const envoyer = () => {
              const data = Buffer.from(JSON.stringify({ jeu: 'EscapeYourBoss', version, nom: nomLocal, port: portJeu, place: !socket }));
              const cibles = new Set(['127.0.0.1', '255.255.255.255', ...adressesLocales().map(a => a.diffusion)]);
              for (const c of cibles) sock.send(data, portDecouverte, c, () => {});
            };
            balise = { sock, timer: setInterval(envoyer, 1000) }; envoyer();
          });
          evenement({ type: 'ecoute', port: portJeu, adresses: adressesLocales().map(a => a.ip) });
          resolve({ port: portJeu, adresses: adressesLocales().map(a => a.ip) });
        });
      });
    },

    rejoindre(adresse, nom, portDefaut = portJeu) {
      // Une faute de frappe ne doit pas couper la session en cours.
      let cible;
      try { cible = lireAdresse(adresse, portDefaut); } catch (e) { return Promise.reject(e); }
      const ip = String(adresse).trim();
      this.fermer();
      nomLocal = String(nom || 'Invité').slice(0, 24);
      return new Promise((resolve, reject) => {
        const s = net.connect({ host: cible.hote, port: cible.port, timeout: 5000 });
        s.once('connect', () => { s.setTimeout(0); brancher(s, 'invite'); resolve(true); });
        s.once('timeout', () => { s.destroy(); reject(new Error(`Aucune réponse de ${ip} (délai dépassé).`)); });
        s.once('error', e => reject(new Error(e.code === 'ECONNREFUSED'
          ? `Aucune partie hébergée sur ${ip}.` : e.message)));
      });
    },

    envoyer(msg) { if (pret) envoyerBrut(socket, msg); },

    fermer() {
      arreterBalise();
      if (socket) { const s = socket; socket = null; s.destroy(); }
      if (serveur) { serveur.close(); serveur = null; }
      role = null; pret = false;
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
          compatible: version == null || b.version === version, place: b.place !== false });
      } catch {}
    });
    sock.on('error', fin);
    sock.bind(portDecouverte, () => setTimeout(fin, duree));
  });
}

module.exports = { creerSession, rechercherParties, adressesLocales, lireAdresse, PORT_JEU, PORT_DECOUVERTE };

import { ACTIONS, nomTouche, touchesParDefaut } from './input.js';
import { SECRETS, canardsTrouves } from './secrets.js';
import { NIVEAUX, PLANS } from './levels.js';
import { departementDuNiveau } from './departements.js';
import { VISAGES, PIECES, PALETTES, TENUES, APPARENCE_DEFAUT, estDebloquee, conditionDeblocage, compterPieces,
  tenue, tenueDisponible, apparenceSurprise, titreBadge, nomCouleur, piecesManquantes } from './garde-robe.js';
import { notificationsDuMoment, indicateurs, appreciation, heureBloquee, NOTIFICATIONS } from './intranet.js';

const $ = id => document.getElementById(id);
const fmt = (s) => {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1);
  return m > 0 ? `${m}:${r.padStart(4, '0')}` : `${r} s`;
};

// ============================================================
//  Navigation des menus, sélection d'étage, remappage des touches.
// ============================================================
const hex = n => '#' + n.toString(16).padStart(6, '0');
const picto = (id, cls = '') => `<svg class="picto ${cls}" aria-hidden="true"><use href="#p-${id}"/></svg>`;
const heureDuTitre = t => /\d{1,2}:\d{2}/.exec(t || '')?.[0] || '—';
const echapper = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Fil d'Ariane du portail pour chaque application.
const CHEMINS = { 'menu-principal': '', 'menu-niveaux': 'Tableau des étages', 'menu-touches': 'Service informatique › Clavier & souris',
  'menu-options': 'Service informatique › Préférences du poste', 'menu-multi': 'Départ groupé', 'menu-secrets': 'Bruits de couloir' };
// Onglets du vestiaire : chaque section est une grille de pièces ou un nuancier.
const ONGLETS = [
  { id: 'visage', nom: 'Visage', icone: '🙂', sections: [['visages'], ['couleur', 'peau', 'Teint']] },
  { id: 'cheveux', nom: 'Cheveux', icone: '💇', sections: [['couleur', 'cheveux', 'Couleur des cheveux'], ['pieces', 'moustache', 'Moustache']] },
  { id: 'chapeau', nom: 'Chapeau', icone: '🧢', sections: [['pieces', 'tete', 'Sur la tête'], ['accent', 'tete', 'Couleur du chapeau']] },
  { id: 'lunettes', nom: 'Lunettes', icone: '👓', sections: [['pieces', 'yeux', 'Lunettes']] },
  { id: 'tenue', nom: 'Tenue', icone: '👔', sections: [['couleur', 'chemise', 'Chemise'], ['couleur', 'veste', 'Veste'], ['couleur', 'pantalon', 'Pantalon'], ['badge']] },
  { id: 'cou', nom: 'Cou & torse', icone: '🎀', sections: [['pieces', 'cou', 'Autour du cou'], ['couleur', 'cravate', 'Couleur de la cravate ou du nœud'], ['pieces', 'torse', 'Par-dessus'], ['accent', 'torse', 'Couleur de la cape']] },
  { id: 'dos', nom: 'Dos', icone: '🎒', sections: [['pieces', 'dos', 'Sur le dos'], ['accent', 'dos', 'Couleur du sac']] },
  { id: 'tenues', nom: 'Tenues', icone: '✨', sections: [['tenues']] },
];

export class Menu {
  constructor(jeu) {
    this.jeu = jeu;
    this.panneaux = ['menu-principal', 'menu-niveaux', 'menu-touches', 'menu-options', 'menu-multi', 'menu-secrets'];
    this.ecoute = null;          // action en cours de remappage
    this.mode = 'campagne';

    $('btn-campagne').onclick = () => { this.mode = 'campagne'; this.ouvrir('menu-niveaux'); };
    $('btn-speedrun').onclick = () => { this.mode = 'speedrun'; this.ouvrir('menu-niveaux'); };
    $('btn-commandes').onclick = () => this.ouvrir('menu-touches');
    $('btn-it-preferences').onclick = () => this.ouvrir('menu-options');
    $('badge-accueil').onclick = () => $('btn-vestiaire').click();
    this.installerPortail();
    this.installerMulti();
    this.installerVestiaire();
    $('btn-secrets').onclick = () => this.ouvrir('menu-secrets');
    $('btn-options').onclick = () => this.ouvrir('menu-options');
    $('btn-quitter').onclick = () => window.close();
    for (const b of document.querySelectorAll('[data-retour]'))
      b.onclick = () => {
        if (this.depuisPause) {
          this.depuisPause = false;
          this.jeu.ui.show('pause');
        } else this.ouvrir('menu-principal');
      };
    $('btn-touches-reset').onclick = () => {
      this.jeu.etat.touches = touchesParDefaut();
      this.jeu.appliquerTouches();
      this.majTouches();
    };

    // capture d'une nouvelle touche
    this._capture = (e) => {
      if (!this.ecoute) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') { this.ecoute = null; this.majTouches(); return; }
      const { action, slot } = this.ecoute;
      const t = this.jeu.etat.touches;
      // une touche ne peut pas servir deux fois
      for (const a of Object.keys(t)) t[a] = t[a].map(c => (c === e.code ? null : c));
      t[action] = t[action] || [null, null];
      t[action][slot] = e.code;
      this.ecoute = null;
      this.jeu.appliquerTouches();
      this.majTouches();
    };
    window.addEventListener('keydown', this._capture, true);
    window.addEventListener('keydown', e => {
      if (this.ecoute || !document.body.classList.contains('modal')) return;
      if (e.key === 'Escape' && !$('menu-options').hidden && !$('options-effacer-confirmation')?.hidden) {
        $('options-effacer-annuler')?.click(); e.preventDefault(); e.stopImmediatePropagation(); return;
      }
      if (e.key !== 'Tab' && !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      const screen = document.querySelector('.screen.on');
      if (!screen) return;
      const boutons = [...screen.querySelectorAll('button:not(:disabled), input, select')]
        .filter(el => el.getClientRects().length);
      if (!boutons.length || (e.key !== 'Tab' && ['INPUT', 'SELECT'].includes(e.target.tagName))) return;
      e.preventDefault();
      const index = boutons.indexOf(document.activeElement);
      const sens = e.shiftKey || e.key === 'ArrowUp' ? -1 : 1;
      boutons[(index + sens + boutons.length) % boutons.length].focus();
    }, true);
  }

  ouvrir(id) {
    this.ecoute = null;
    for (const p of this.panneaux) $(p).hidden = (p !== id);
    const chemin = CHEMINS[id] ?? '';
    $('portail-chemin').innerHTML = chemin ? `Portail collaborateur › <b>${chemin}</b>` : 'Portail collaborateur';
    if (id === 'menu-principal') this.majAccueil();
    if (id === 'menu-niveaux') this.majNiveaux();
    if (id === 'menu-touches') this.majTouches();
    if (id === 'menu-options') this.majOptions();
    if (id === 'menu-secrets') this.majSecrets();
    // Dans une application, le focus va au contenu (pas aux onglets ni au retour).
    ($(id).querySelector('.app-corps button:not(:disabled), .app-corps input') || $(id).querySelector('button:not(:disabled), input'))?.focus({ preventScroll: true });
  }

  // ---------------- portail : horloge, fil, indicateurs ----------------
  installerPortail() {
    this.debutPortail = performance.now();
    this.fil = [];
    // Une seconde suffit : l'horloge reste bloquée à 17:59, le fil se renouvelle
    // toutes les neuf secondes, seulement quand l'accueil est affiché.
    setInterval(() => {
      if (!$('screen-start').classList.contains('on')) return;
      const t = (performance.now() - this.debutPortail) / 1000;
      $('portail-heure').textContent = heureBloquee(t);
      if ($('menu-principal').hidden) return;
      this.majIndicateurs();
      if (Math.floor(t) % 9 === 0) this.nouvelleNotification();
    }, 1000);
  }

  majAccueil() {
    const etat = this.jeu.etat;
    if (!etat) return;
    const a = this.jeu.player?.apparence;
    if (a) {
      $('badge-titre').textContent = titreBadge(a);
      $('badge-photo').textContent = VISAGES.find(x => x.id === a.visage)?.icone || '🙂';
    }
    const finis = etat.niveauxFinis || [];
    const ouverts = NIVEAUX.filter((n, i) => i === 0 || finis.includes(NIVEAUX[i - 1].id));
    const etages = ouverts.map(n => departementDuNiveau(n).etage);
    $('badge-acces').textContent = etages.length > 1 ? `Accès : étages ${Math.max(...etages)} à ${Math.min(...etages)}` : `Accès : étage ${etages[0] ?? 23}`;
    $('accueil-secrets').textContent = `${canardsTrouves(etat)}/${NIVEAUX.length * 3} canards · ${(etat.secrets || []).length}/${SECRETS.length} rumeurs vérifiées`;
    this.fil = notificationsDuMoment(etat);
    this.dessinerFil();
    this.majIndicateurs(true);
  }

  dessinerFil(nouvelle = false) {
    const ligne = (n, i) => `<li class="notif${n.boss ? ' boss' : ''}${nouvelle && i === 0 ? ' nouvelle' : ''}" style="--c:${n.couleur}">
      <span class="notif-couleur"></span><span class="notif-de">${echapper(n.de)}</span><span class="notif-heure">${n.heure}</span>
      <span class="notif-objet">${echapper(n.objet)}</span><span class="notif-texte">${echapper(n.texte)}</span></li>`;
    $('fil-notifications').innerHTML = this.fil.map(ligne).join('');
    $('fil-compte').textContent = String(this.fil.length + (this.filNouvelles || 0));
  }

  nouvelleNotification() {
    const deja = new Set(this.fil.map(n => n.texte));
    const libres = NOTIFICATIONS.filter(n => !deja.has(n.texte));
    if (!libres.length) return;
    const n = libres[Math.floor(Math.random() * libres.length)];
    const vieillir = { 'à l’instant': '17:59', '17:59': '17:58', '17:58': '17:55', '17:55': '17:42' };
    this.fil = [{ ...n, heure: 'à l’instant' }, ...this.fil.map(x => ({ ...x, heure: vieillir[x.heure] || x.heure }))].slice(0, 4);
    this.filNouvelles = (this.filNouvelles || 0) + 1;
    this.dessinerFil(true);
  }

  majIndicateurs(complet = false) {
    const etat = this.jeu.etat;
    const session = { convocations: this.jeu.failCount || 0, surPlace: (performance.now() - this.debutPortail) / 1000 };
    const lignes = indicateurs(etat, session);
    const liste = $('kpi-liste');
    if (complet || liste.children.length !== lignes.length * 2) {
      liste.innerHTML = lignes.map(([nom, valeur, bas]) => `<dt>${nom}</dt><dd${bas ? ' class="bas"' : ''}>${valeur}</dd>`).join('');
      let tampon = liste.parentElement.querySelector('.tampon');
      if (!tampon) { tampon = document.createElement('span'); tampon.className = 'tampon tampon-rouge'; liste.parentElement.appendChild(tampon); }
      tampon.textContent = appreciation(etat);
    } else {
      // seules les heures sup' bougent : on ne reconstruit pas la liste
      const dd = liste.querySelectorAll('dd')[5];
      if (dd) dd.textContent = lignes[5][1];
    }
  }

  // ---------------- multijoueur (réseau local) ----------------
  installerMulti() {
    const m = this.jeu.multi, statut = t => { $('multi-statut').textContent = t; };
    if (!window.jeuReseau) { $('btn-multi').disabled = true; return; }
    try { const n = localStorage.getItem('nomMulti'); if (n) $('multi-nom').value = n; } catch {}
    const nom = () => { const n = $('multi-nom').value.trim() || 'Lao D'; try { localStorage.setItem('nomMulti', n); } catch {} return n; };
    $('multi-etage').innerHTML = NIVEAUX.map((n, i) => `<option value="${i}">${i + 1}. ${n.titre}</option>`).join('');
    $('btn-multi').onclick = () => { this.ouvrir('menu-multi'); this.majMulti(); };
    $('btn-heberger').onclick = async () => {
      statut('Ouverture de la partie…');
      try {
        const r = await m.heberger(nom());
        statut(`Partie ouverte. Sur le même réseau, tes amis la trouvent avec « Rechercher », ou tape ton adresse : ${r.adresses.join(' ou ') || 'voir les paramètres réseau'}. En ligne, donne-leur l’adresse de ton tunnel playit.gg (nom:port). Si Windows demande l’accès réseau, accepte pour les réseaux privés.`);
      } catch (e) { statut('Impossible d’héberger : ' + e.message); }
      this.majMulti();
    };
    const rejoindre = async ip => {
      statut('Connexion à ' + ip + '…');
      try { await m.rejoindre(ip, nom()); } catch (e) { statut('Connexion impossible : ' + e.message); }
      this.majMulti();
    };
    $('btn-chercher').onclick = async () => {
      statut('Recherche sur le réseau…'); $('multi-parties').innerHTML = '';
      const parties = await m.rechercher().catch(() => []);
      statut(parties.length ? `${parties.length} partie${parties.length > 1 ? 's' : ''} trouvée${parties.length > 1 ? 's' : ''}.`
        : 'Aucune partie trouvée. Vérifie que ton ami a cliqué « Héberger », que vous êtes sur le même réseau, ou entre son IP.');
      $('multi-parties').innerHTML = '';
      for (const p of parties) {
        const b = document.createElement('button');
        b.className = 'menu-btn';
        b.textContent = `Rejoindre ${p.nom} `;
        const detail = document.createElement('em');
        detail.textContent = `${p.ip} · ${p.joueurs}/${p.max}${p.compatible ? '' : ' · autre version du jeu'}${p.place ? '' : p.enPartie ? ' · en cours' : ' · complète'}`;
        b.appendChild(detail);
        b.disabled = !p.compatible || !p.place;
        b.onclick = () => rejoindre(p.ip);
        $('multi-parties').appendChild(b);
      }
    };
    $('btn-rejoindre-ip').onclick = () => { const ip = $('multi-ip').value.trim(); if (ip) rejoindre(ip); };
    $('btn-multi-lancer').onclick = () => { if (m.hote && m.connecte) this.jeu.lancerMulti(+$('multi-etage').value); };
    $('btn-multi-retour').onclick = async () => { await m.quitter(); statut(''); this.ouvrir('menu-principal'); };
    m.ecouter(e => {
      if (e.type === 'connecte') statut(`Connecté à ${e.nom}.`);
      if (e.type === 'parti') statut(`${e.nom} a quitté le salon. ${m.connecte ? 'Tu peux relancer avec les joueurs présents.' : 'En attente de joueurs…'}`);
      if (e.type === 'deconnecte') statut('Déconnecté : ' + (e.raison || ''));
      if (e.type === 'erreur') statut('Erreur réseau : ' + e.message);
      this.majMulti();
    });
  }
  majMulti() {
    const m = this.jeu.multi, salon = m.connecte || m.hote;
    $('multi-connexion').hidden = !!salon;
    $('multi-salon').hidden = !salon;
    $('multi-nom').disabled = !!salon;
    const moi = $('multi-nom').value.trim() || 'Lao D';
    const presence = $('multi-joueurs'); presence.innerHTML = '';
    const total = document.createElement('strong'); total.className = 'multi-effectif';
    total.textContent = `${m.effectif.length || 1}/4 collaborateurs présents`; presence.appendChild(total);
    const liste = document.createElement('ol'); liste.className = 'multi-presence';
    const joueurs = m.effectif.length ? m.effectif : [{ id: 1, nom: moi }];
    for (const [i, p] of joueurs.entries()) {
      const ligne = document.createElement('li');
      const badge = document.createElement('span'); badge.className = 'multi-numero'; badge.textContent = String(i + 1).padStart(2, '0');
      const nom = document.createElement('b'); nom.textContent = p.nom;
      const role = document.createElement('span'); role.className = 'multi-role'; role.textContent = `${p.id === 1 ? 'Hôte' : 'Invité'}${p.id === m.id ? ' · toi' : ''}`;
      ligne.appendChild(badge); ligne.appendChild(nom); ligne.appendChild(role); liste.appendChild(ligne);
    }
    presence.appendChild(liste);
    $('multi-choix-etage').hidden = !m.hote;
    $('btn-multi-lancer').hidden = !m.hote;
    $('btn-multi-lancer').disabled = !m.connecte;
    if (m.connecte && m.invite) $('multi-statut').textContent = `En attente que ${m.effectif.find(p=>p.id===1)?.nom || 'l’hôte'} lance la partie.`;
  }

  afficher() {
    this.depuisPause = false;
    this.jeu.ui.show('start');
    this.ouvrir('menu-principal');
  }

  majSecrets() {
    const etat = this.jeu.etat, trouve = etat.secrets || [];
    $('secrets-compteur').textContent = `${canardsTrouves(etat)}/${NIVEAUX.length * 3} canards · ${trouve.length}/${SECRETS.length} rumeurs vérifiées`;
    $('secrets-canards').innerHTML = NIVEAUX.map(n => {
      const d = departementDuNiveau(n), nombre = canardsTrouves(etat, n.id);
      const canards = [0, 1, 2].map(i => picto('canard', i < nombre ? 'trouve' : '')).join('');
      return `<div class="secret-carte secret-canards ${nombre === 3 ? 'trouve' : ''}" style="border-top:5px solid ${hex(d.accent)}">
        <span class="dossier-reference">ÉTAGE ${d.etage} · MISSION ${String(n.id).padStart(2, '0')}</span>
        <b>${d.court}</b><div class="secret-inventaire"><span class="canards-rangee" aria-hidden="true">${canards}</span><span>${nombre}/3 canards</span></div></div>`;
    }).join('');
    $('secrets-liste').innerHTML = SECRETS.map((s, i) => {
      const acquis = trouve.includes(s.id);
      return `<article class="secret-carte ${acquis ? 'trouve' : ''}"><div class="secret-entete"><span class="dossier-reference">PIÈCE ${String(i + 1).padStart(2, '0')}</span><span class="dossier-tampon">${acquis ? 'CONSTATÉ' : 'À VÉRIFIER'}</span></div>
        <b>${acquis ? s.nom : 'Bruit de couloir'}</b><p>${acquis ? (s.texte || s.indice) : s.indice}</p></article>`;
    }).join('');
  }

  // ---------------- tableau des étages : boutons d'ascenseur ----------------
  majNiveaux() {
    const etat = this.jeu.etat;
    const finis = etat.niveauxFinis;
    const speedrun = this.mode === 'speedrun';
    $('niveaux-titre').textContent = speedrun ? 'Fuite chronométrée' : 'Tableau des étages';
    $('niveaux-code').textContent = speedrun ? 'POINTEUSE · 10 ÉTAGES D’AFFILÉE' : 'PLAN · 10 ÉTAGES · DU 23e AU 2e';
    $('niveaux-sous').textContent = speedrun
      ? 'Speedrun · 10 missions au chrono. Commence à la première pour valider un record complet.'
      : 'Campagne · Termine chaque mission pour obtenir l’accès à la suivante.';

    $('record-speedrun')?.remove();
    const g = $('grille-niveaux');
    g.innerHTML = '';
    let premier = null;
    NIVEAUX.forEach((niv, i) => {
      // Les numéros de mission suivent le parcours ; les étages sont ceux de l’immeuble.
      const ouvert = speedrun || i === 0 || finis.includes(NIVEAUX[i - 1].id);
      const fini = finis.includes(niv.id), d = departementDuNiveau(niv);
      const b = document.createElement('button');
      b.disabled = !ouvert;
      b.className = 'carte-niveau' + (ouvert ? '' : ' verrou') + (fini ? ' fini' : '');
      b.style.borderLeftColor = hex(d.accent);
      b.setAttribute('aria-label', `Mission ${i + 1}, ${d.court}, étage ${d.etage}. ${ouvert ? niv.sousTitre : 'Termine la mission précédente pour débloquer.'}`);
      b.innerHTML = `
        <span class="niveau-etage"><small>ÉTAGE</small><strong>${d.etage}</strong></span>
        <span class="niveau-dossier"><span class="num">MISSION ${String(i + 1).padStart(2, '0')} / ${NIVEAUX.length} · ${heureDuTitre(niv.titre)}</span>
          <span class="nom">${d.nom}</span><span class="desc">${ouvert ? niv.sousTitre : 'Termine la mission précédente pour débloquer.'}</span>
          <span class="pied">${niv.pnj(PLANS[niv.plan]).length} collègues · ${Math.round(niv.limite)} s · ${canardsTrouves(etat, niv.id)}/3 canards</span></span>
        <span class="niveau-validation"><span class="dossier-tampon">${fini ? 'VALIDÉ' : ouvert ? 'ACCÈS OUVERT' : 'ACCÈS FERMÉ'}</span>
          <span>${fini ? 'Record <b>' + fmt(etat.records['n' + niv.id]) + '</b>' : (ouvert ? 'Appeler l’ascenseur →' : 'Mission ' + i + ' requise')}</span></span>`;
      if (ouvert) {
        b.onclick = () => speedrun ? this.jeu.lancerSpeedrun(i) : this.jeu.lancerCampagne(i);
        if (!fini && premier == null) premier = i;
      }
      // La fiche suit le survol et le clavier, sans lancer l'étage.
      b.onmouseenter = b.onfocus = () => this.majFicheEtage(i);
      g.appendChild(b);
    });
    this.majFicheEtage(premier ?? 0);

    if (speedrun) {
      const rec = etat.records.speedrun;
      const info = document.createElement('div');
      info.id = 'record-speedrun';
      info.className = 'aide-touche record-formulaire';
      info.innerHTML = rec
        ? `RECORD HOMOLOGUÉ · <b>${fmt(rec)}</b> pour les dix missions`
        : 'RECORD NON HOMOLOGUÉ · Pars de la première mission pour enregistrer un enchaînement complet.';
      g.appendChild(info);
    }
  }

  // Fiche de l'étage : l'identité du service (departements.js), les chiffres et la réplique locale.
  majFicheEtage(i) {
    const niv = NIVEAUX[i], d = departementDuNiveau(niv), etat = this.jeu.etat;
    const finis = etat.niveauxFinis, ouvert = this.mode === 'speedrun' || i === 0 || finis.includes(NIVEAUX[i - 1].id);
    const sorties = { elevator: 'ascenseur', stairs: 'escalier', nacelle: 'nacelle', toboggan: '???' };
    const fiche = $('fiche-etage');
    fiche.style.setProperty('--c', hex(d.accent));
    fiche.innerHTML = `<div class="fiche-bande"></div>
      <span class="fiche-num">ÉTAGE ${d.etage} · MISSION ${String(i + 1).padStart(2, '0')}</span>
      <h3>${d.nom}</h3>
      <p class="fiche-slogan">${ouvert ? d.slogan : 'Accès réservé.'}</p>
      <p>${ouvert ? d.signature : 'Termine la mission précédente pour obtenir un badge valide pour cet étage.'}</p>
      ${ouvert ? `<p class="fiche-replique">« ${d.replique} »</p>` : ''}
      <dl><dt>Heure d’arrivée</dt><dd>${heureDuTitre(niv.titre)}</dd>
        <dt>Collègues présents</dt><dd>${niv.pnj(PLANS[niv.plan]).length}</dd>
        <dt>Fin de la réunion</dt><dd>${Math.floor(niv.limite / 60)}:${String(Math.round(niv.limite % 60)).padStart(2, '0')}</dd>
        <dt>Sorties connues</dt><dd>${niv.sorties.filter(x => x !== 'toboggan').map(x => sorties[x]).join(', ')}</dd>
        <dt>Canards retrouvés</dt><dd>${canardsTrouves(etat, niv.id)}/3</dd>
        <dt>Record</dt><dd>${fmt(etat.records['n' + niv.id])}</dd></dl>`;
  }

  // ---------------- remappage ----------------
  majTouches() {
    const focus = document.activeElement?.id;
    const t = this.jeu.etat.touches;
    const c = $('table-touches');
    c.innerHTML = '';
    for (const a of ACTIONS) {
      const ligne = document.createElement('div');
      ligne.className = 'ligne-touche';
      const nom = document.createElement('span');
      nom.textContent = a.nom;
      ligne.appendChild(nom);
      for (let slot = 0; slot < 2; slot++) {
        const b = document.createElement('button');
        b.className = 'btn-touche';
        b.id = `btn-touche-${a.id}-${slot}`;
        b.setAttribute('aria-label', `${a.nom} : touche ${slot === 0 ? 'principale' : 'secondaire'}`);
        const enEcoute = this.ecoute && this.ecoute.action === a.id && this.ecoute.slot === slot;
        b.textContent = enEcoute ? 'Appuie…' : nomTouche((t[a.id] || [])[slot]);
        b.setAttribute('aria-pressed', String(!!enEcoute));
        if (enEcoute) b.classList.add('ecoute');
        b.onclick = () => { this.ecoute = { action: a.id, slot }; this.majTouches(); };
        ligne.appendChild(b);
      }
      c.appendChild(ligne);
    }
    if (focus?.startsWith('btn-touche-')) $(focus)?.focus({ preventScroll: true });
  }

  // ---------------- options ----------------
  majOptions() {
    const o = this.jeu.etat.options;
    const c = $('liste-options');
    c.innerHTML = '';
    let groupe;
    const rubrique = (code, nom, note) => {
      groupe = document.createElement('fieldset'); groupe.className = 'options-rubrique';
      const titre = document.createElement('legend'); titre.innerHTML = `<span>${code}</span> ${nom}`;
      groupe.appendChild(titre);
      const texte = document.createElement('p'); texte.className = 'options-note'; texte.textContent = note;
      groupe.appendChild(texte); c.appendChild(groupe);
    };
    const ligne = (titre, aide, controle) => {
      const d = document.createElement('div'); d.className = 'ligne-option';
      const g = document.createElement('div');
      g.innerHTML = `<b>${titre}</b><em>${aide}</em>`;
      controle.setAttribute('aria-label', titre); d.appendChild(g); d.appendChild(controle);
      groupe.appendChild(d);
    };
    const toggle = (cle, titre, aide, effet = () => this.jeu.appliquerConfort(), mots = ['Activé', 'Désactivé']) => {
      const b = document.createElement('button'); b.id = `option-${cle}`;
      const maj = () => { b.textContent = o[cle] ? mots[0] : mots[1]; b.setAttribute('aria-pressed', String(!!o[cle])); };
      maj(); b.onclick = () => { o[cle] = !o[cle]; maj(); effet(); this.jeu.sauver(); };
      ligne(titre, aide, b);
    };

    rubrique('01', 'Environnement sonore', 'Le silence ne compte pas comme une absence.');
    toggle('son', 'Son', 'Ambiance du bureau, pas et musique des emotes disponibles.', () => this.jeu.audio.setMuted(!o.son), ['Activé', 'Coupé']);

    rubrique('02', 'Repérage & confort', 'Le service IT vous autorise à préférer votre propre confort.');
    toggle('cones', 'Cônes de vision', 'Les masquer rend le jeu nettement plus difficile.', () => { this.jeu.showCones = o.cones; }, ['Affichés', 'Masqués']);
    toggle('noms', 'Noms des collègues', 'Étiquettes au-dessus des personnages.', () => { this.jeu.showLabels = o.noms; }, ['Affichés', 'Masqués']);
    const sensibilite = document.createElement('select'); sensibilite.id = 'option-sensibilite';
    for (const [valeur, nom] of [[0.6, 'Douce'], [1, 'Normale'], [1.4, 'Rapide'], [1.8, 'Très rapide']]) {
      const option = document.createElement('option'); option.value = valeur; option.textContent = nom; sensibilite.appendChild(option);
    }
    sensibilite.value = o.sensibilite;
    sensibilite.onchange = () => { o.sensibilite = Number(sensibilite.value); this.jeu.sauver(); };
    ligne('Sensibilité de la souris', 'La vitesse de rotation de la caméra.', sensibilite);
    toggle('mouvementReduit', 'Caméra stable', 'Réduit aussi les animations de l’interface. Coupe les secousses et le changement de champ en course.');
    toggle('aide', 'Rappel des commandes', 'Affiche les touches en bas de l’écran pendant la partie.');

    rubrique('03', 'Archives personnelles', 'La broyeuse n’a pas de bouton « Annuler ».');
    const bRaz = document.createElement('button'); bRaz.id = 'options-effacer-demander';
    bRaz.className = 'option-danger'; bRaz.textContent = 'Effacer la progression';
    bRaz.setAttribute('aria-expanded', 'false'); bRaz.setAttribute('aria-controls', 'options-effacer-confirmation');
    ligne('Progression', 'Étages, records, découvertes, tenue et touches personnalisées.', bRaz);
    const confirmation = document.createElement('div'); confirmation.id = 'options-effacer-confirmation';
    confirmation.className = 'options-confirmation'; confirmation.hidden = true;
    confirmation.setAttribute('role', 'group'); confirmation.setAttribute('aria-labelledby', 'options-effacer-titre');
    confirmation.innerHTML = `<strong id="options-effacer-titre">Détruire ton dossier de jeu ?</strong><p>La progression, les records, les découvertes, la tenue et les réglages seront remis à zéro. Cette action est définitive.</p>`;
    const annuler = document.createElement('button'); annuler.id = 'options-effacer-annuler'; annuler.textContent = 'Conserver mon dossier';
    const confirmer = document.createElement('button'); confirmer.id = 'options-effacer-confirmer'; confirmer.className = 'option-danger'; confirmer.textContent = 'Oui, tout effacer';
    const fermer = () => { confirmation.hidden = true; bRaz.setAttribute('aria-expanded', 'false'); bRaz.focus(); };
    annuler.onclick = fermer;
    bRaz.onclick = () => { confirmation.hidden = false; bRaz.setAttribute('aria-expanded', 'true'); annuler.focus(); };
    confirmer.onclick = async () => {
      confirmer.disabled = true; annuler.disabled = true;
      await this.jeu.reinitialiserSauvegarde();
      $('options-effacer-demander')?.focus();
    };
    confirmation.appendChild(annuler); confirmation.appendChild(confirmer); groupe.appendChild(confirmation);
  }

  // ---------------------------------------------------------- vestiaire
  installerVestiaire() {
    this.onglet = 'chapeau';
    $('btn-vestiaire').onclick = () => { this.jeu.ouvrirVestiaire(); this.majVestiaire(); };
    $('vest-annuler').onclick = () => this.jeu.fermerVestiaire(false);
    $('vest-garder').onclick = () => this.jeu.fermerVestiaire(true);
    $('vest-surprise').onclick = () => { this.jeu.essayerTenue(apparenceSurprise(this.jeu.etat)); this.jeu.player.declencherEmote(); this.jeu.audio.start(); this.majVestiaire(); };
    $('vest-danse').onclick = () => { this.jeu.audio.start(); this.jeu.player.emote = null; this.jeu.player.declencherEmote(); };
    $('vest-zoom').onclick = () => { const v = this.jeu.vestiaire; v.zoom = v.zoom === 'tete' ? 'corps' : 'tete'; this.majVestiaire(); };
    $('vest-defaut').onclick = () => { this.jeu.essayerTenue(APPARENCE_DEFAUT); this.majVestiaire(); };
    // Glisser sur la scène fait tourner le mannequin ; double-clic : rotation automatique.
    const zone = $('vestiaire-scene'); let glisse = null;
    zone.onpointerdown = e => { glisse = e.clientX; if (this.jeu.vestiaire) this.jeu.vestiaire.auto = false; try { zone.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ } };
    zone.onpointermove = e => { if (glisse == null || !this.jeu.vestiaire) return; this.jeu.vestiaire.tour += (e.clientX - glisse) * .012; glisse = e.clientX; };
    zone.onpointerup = () => { glisse = null; };
    zone.ondblclick = () => { if (this.jeu.vestiaire) this.jeu.vestiaire.auto = true; };
  }

  majVestiaire() {
    const focus = document.activeElement?.id;
    const jeu = this.jeu, v = jeu.vestiaire;
    if (!v) return;
    const a = v.brouillon, etat = jeu.etat;
    const essayer = modif => { jeu.essayerTenue({ ...a, ...modif, couleurs: { ...a.couleurs, ...modif.couleurs } }); this.majVestiaire(); };
    const { debloquees, total } = compterPieces(etat);
    $('vest-titre-badge').textContent = titreBadge(a);
    $('vest-photo').textContent = VISAGES.find(x => x.id === a.visage)?.icone || '🙂';
    $('vest-compteur').textContent = `${debloquees}/${total} pièces`;
    $('vest-compteur').title = 'Termine des étages pour débloquer le reste';
    $('vest-zoom').textContent = v.zoom === 'tete' ? 'Corps entier' : 'Gros plan';
    $('vest-zoom').setAttribute('aria-pressed', String(v.zoom === 'tete'));
    $('vest-onglets').innerHTML = '';
    for (const o of ONGLETS) {
      const b = document.createElement('button');
      b.className = 'vest-onglet' + (o.id === this.onglet ? ' actif' : '');
      b.id = `vest-onglet-${o.id}`; b.setAttribute('aria-pressed', String(o.id === this.onglet));
      b.innerHTML = `<span>${o.nom}</span>`;
      b.onclick = () => { this.onglet = o.id; if (o.id === 'visage' || o.id === 'lunettes' || o.id === 'cheveux') v.zoom = 'tete'; else v.zoom = 'corps'; this.majVestiaire(); };
      $('vest-onglets').appendChild(b);
    }
    // Chaque essai reconstruit le panneau : on garde la position de défilement de l'onglet.
    const contenu = $('vest-contenu'), defilement = this.ongletAffiche === this.onglet ? contenu.scrollTop : 0;
    contenu.innerHTML = '';
    const titre = t => { const h = document.createElement('div'); h.className = 'vest-section'; h.textContent = t; contenu.appendChild(h); };
    let section = 0;
    const grille = (elements, choisi, clic) => {
      const numero = section++;
      const g = document.createElement('div'); g.className = 'vest-grille' + (this.onglet === 'tenues' ? ' vest-tenues' : '');
      for (const p of elements) {
        const libre = estDebloquee(p, etat), b = document.createElement('button');
        b.className = 'vest-carte' + (p.id === choisi ? ' choisi' : '') + (libre ? '' : ' verrou');
        b.id = `vest-piece-${this.onglet}-${numero}-${p.id}`;
        b.setAttribute('aria-pressed', String(p.id === choisi));
        b.innerHTML = `<i>${libre ? p.icone : '🔒'}</i><span>${p.nom}</span>${libre ? '' : `<small>${p.condition || conditionDeblocage(p)}</small>`}`;
        b.disabled = !libre; b.onclick = () => clic(p);
        g.appendChild(b);
      }
      contenu.appendChild(g);
    };
    const nuancier = (palette, choisie, clic) => {
      const g = document.createElement('div'); g.className = 'vest-nuancier';
      for (const c of PALETTES[palette]) {
        const b = document.createElement('button');
        b.className = 'vest-teinte' + (c === choisie ? ' choisi' : '') + (c === null ? ' sans' : '');
        b.id = `vest-couleur-${this.onglet}-${palette}-${c === null ? 'sans' : hex(c).slice(1)}`;
        const nom = nomCouleur(c, palette);
        b.innerHTML = `<i${c !== null ? ` style="background:${hex(c)}"` : ''} aria-hidden="true"></i><span>${nom}</span>`;
        b.title = nom; b.setAttribute('aria-label', nom); b.setAttribute('aria-pressed', String(c === choisie));
        b.onclick = () => clic(c);
        g.appendChild(b);
      }
      contenu.appendChild(g);
    };
    for (const [type, cle, libelle] of ONGLETS.find(o => o.id === this.onglet).sections) {
      if (type === 'visages') { titre('Visage'); grille(VISAGES, a.visage, p => essayer({ visage: p.id })); }
      else if (type === 'couleur') {
        if (cle === 'cravate' && !['cravate', 'noeud-papillon'].includes(a.cou)) continue;
        titre(libelle + ' · ' + nomCouleur(a[cle], cle)); nuancier(cle, a[cle], c => essayer({ [cle]: c }));
      }
      else if (type === 'pieces') { titre(libelle); grille(PIECES[cle], a[cle], p => essayer({ [cle]: p.id })); }
      else if (type === 'accent') {
        const portee = PIECES[cle].find(p => p.id === a[cle]);
        if (!portee?.teinte) continue;
        titre(libelle + ' · ' + nomCouleur(a.couleurs[cle], 'accent')); nuancier('accent', a.couleurs[cle], c => essayer({ couleurs: { [cle]: c } }));
      } else if (type === 'badge') {
        titre('Badge');
        grille([{ id: 'oui', nom: 'Badge au cou', icone: '🪪' }, { id: 'non', nom: 'Incognito', icone: '🥷' }], a.badge ? 'oui' : 'non', p => essayer({ badge: p.id === 'oui' }));
      } else if (type === 'tenues') {
        titre('Tenues toutes faites');
        grille(TENUES.map(t => ({ ...t, debloque: tenueDisponible(t.id, etat) ? undefined : { autre: true },
          condition: piecesManquantes(t.id, etat).map(p => `${p.nom} : ${conditionDeblocage(p)}`).join('\n') })), null,
          t => { jeu.essayerTenue(tenue(t.id)); jeu.player.declencherEmote(); jeu.audio.start(); this.majVestiaire(); });
      }
    }
    contenu.scrollTop = defilement; this.ongletAffiche = this.onglet;
    if (focus?.startsWith('vest-')) $(focus)?.focus?.({ preventScroll: true });
  }
}

export { fmt as formaterTemps };

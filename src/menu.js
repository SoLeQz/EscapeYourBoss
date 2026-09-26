import { ACTIONS, nomTouche, touchesParDefaut } from './input.js';
import { NIVEAUX, PLANS } from './levels.js';

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
export class Menu {
  constructor(jeu) {
    this.jeu = jeu;
    this.panneaux = ['menu-principal', 'menu-niveaux', 'menu-touches', 'menu-options', 'menu-multi'];
    this.ecoute = null;          // action en cours de remappage
    this.mode = 'campagne';

    $('btn-campagne').onclick = () => { this.mode = 'campagne'; this.ouvrir('menu-niveaux'); };
    $('btn-speedrun').onclick = () => { this.mode = 'speedrun'; this.ouvrir('menu-niveaux'); };
    $('btn-commandes').onclick = () => this.ouvrir('menu-touches');
    this.installerMulti();
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
      if (e.key !== 'Tab' && !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      const screen = document.querySelector('.screen.on');
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
    if (id === 'menu-niveaux') this.majNiveaux();
    if (id === 'menu-touches') this.majTouches();
    if (id === 'menu-options') this.majOptions();
    $(id).querySelector('button:not(:disabled), input')?.focus({ preventScroll: true });
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
        statut(`Partie ouverte. Sur le même réseau, ton ami la trouve avec « Rechercher », ou tape ton adresse : ${r.adresses.join(' ou ') || 'voir les paramètres réseau'}. En ligne, donne-lui l’adresse de ton tunnel playit.gg (nom:port). Si Windows demande l’accès réseau, accepte pour les réseaux privés.`);
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
        b.innerHTML = `Rejoindre ${p.nom} <em>${p.ip}${p.compatible ? '' : ' · autre version du jeu'}${p.place ? '' : ' · complète'}</em>`;
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
    $('multi-joueurs').innerHTML = m.connecte
      ? `<b>${m.hote ? moi + ' (hôte)' : m.nomDistant + ' (hôte)'}</b><br><b>${m.hote ? m.nomDistant : moi}</b> (invité)`
      : `<b>${moi}</b> (hôte) · en attente d’un coéquipier…`;
    $('multi-choix-etage').hidden = !m.hote;
    $('btn-multi-lancer').hidden = !m.hote;
    $('btn-multi-lancer').disabled = !m.connecte;
    if (m.connecte && m.invite) $('multi-statut').textContent = `En attente que ${m.nomDistant} lance la partie.`;
  }

  afficher() {
    this.depuisPause = false;
    this.jeu.ui.show('start');
    this.ouvrir('menu-principal');
  }

  // ---------------- choix de l'étage ----------------
  majNiveaux() {
    const etat = this.jeu.etat;
    const finis = etat.niveauxFinis;
    const speedrun = this.mode === 'speedrun';
    $('niveaux-sous').textContent = speedrun
      ? 'Speedrun : tous les étages ouverts, chrono cumulé, aucun filet'
      : 'Termine un étage pour débloquer le suivant';

    $('record-speedrun')?.remove();
    const g = $('grille-niveaux');
    g.innerHTML = '';
    NIVEAUX.forEach((niv, i) => {
      // en speedrun tout est ouvert ; en campagne il faut avoir fini le précédent
      const ouvert = speedrun || i === 0 || finis.includes(NIVEAUX[i - 1].id);
      const fini = finis.includes(niv.id);
      const b = document.createElement('button');
      b.disabled = !ouvert;
      b.className = 'carte-niveau' + (ouvert ? '' : ' verrou') + (fini ? ' fini' : '');
      b.innerHTML = `
        <div class="num">Étage ${i + 1} / ${NIVEAUX.length}${fini ? ' · validé' : ''}</div>
        <div class="nom">${niv.titre}</div>
        <div class="desc">${ouvert ? niv.sousTitre : 'Termine l’étage précédent pour débloquer.'}</div>
        <div class="pied">
          <span>${niv.pnj(PLANS[niv.plan]).length} personnes · ${Math.round(niv.limite)} s</span>
          <span>${fini ? 'record <b>' + fmt(etat.records['n' + niv.id]) + '</b>' : (ouvert ? 'jamais réussi' : '🔒')}</span>
        </div>`;
      if (ouvert) {
        b.onclick = () => speedrun ? this.jeu.lancerSpeedrun(i) : this.jeu.lancerCampagne(i);
      }
      g.appendChild(b);
    });

    if (speedrun) {
      const rec = etat.records.speedrun;
      const info = document.createElement('div');
      info.id = 'record-speedrun';
      info.className = 'aide-touche';
      info.innerHTML = rec
        ? `Meilleur enchaînement complet : <b style="color:var(--gold)">${fmt(rec)}</b>`
        : 'Aucun enchaînement complet pour l’instant. Pars du premier étage.';
      g.parentElement.insertBefore(info, g.nextSibling);
    }
  }

  // ---------------- remappage ----------------
  majTouches() {
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
        const enEcoute = this.ecoute && this.ecoute.action === a.id && this.ecoute.slot === slot;
        b.textContent = enEcoute ? '…' : nomTouche((t[a.id] || [])[slot]);
        if (enEcoute) b.classList.add('ecoute');
        b.onclick = () => { this.ecoute = { action: a.id, slot }; this.majTouches(); };
        ligne.appendChild(b);
      }
      c.appendChild(ligne);
    }
  }

  // ---------------- options ----------------
  majOptions() {
    const o = this.jeu.etat.options;
    const c = $('liste-options');
    c.innerHTML = '';

    const ligne = (titre, aide, controle) => {
      const d = document.createElement('div');
      d.className = 'ligne-option';
      const g = document.createElement('div');
      g.innerHTML = `${titre}<em>${aide}</em>`;
      controle.setAttribute('aria-label', titre);
      d.appendChild(g);
      d.appendChild(controle);
      c.appendChild(d);
    };
    const bSon = document.createElement('button');
    bSon.textContent = o.son ? 'Activé' : 'Coupé';
    bSon.onclick = () => {
      o.son = !o.son; bSon.textContent = o.son ? 'Activé' : 'Coupé';
      this.jeu.audio.setMuted(!o.son); this.jeu.sauver();
    };
    ligne('Son', 'Ambiance du bureau, pas et alertes.', bSon);

    const bCones = document.createElement('button');
    bCones.textContent = o.cones ? 'Affichés' : 'Masqués';
    bCones.onclick = () => {
      o.cones = !o.cones; bCones.textContent = o.cones ? 'Affichés' : 'Masqués';
      this.jeu.showCones = o.cones; this.jeu.sauver();
    };
    ligne('Cônes de vision', 'Les masquer rend le jeu nettement plus difficile.', bCones);

    const bNoms = document.createElement('button');
    bNoms.textContent = o.noms ? 'Affichés' : 'Masqués';
    bNoms.onclick = () => {
      o.noms = !o.noms; bNoms.textContent = o.noms ? 'Affichés' : 'Masqués';
      this.jeu.showLabels = o.noms; this.jeu.sauver();
    };
    ligne('Noms des collègues', 'Étiquettes au-dessus des personnages.', bNoms);

    const sensibilite = document.createElement('select');
    for (const [valeur, nom] of [[0.6, 'Douce'], [1, 'Normale'], [1.4, 'Rapide'], [1.8, 'Très rapide']]) {
      const option = document.createElement('option');
      option.value = valeur; option.textContent = nom; sensibilite.appendChild(option);
    }
    sensibilite.value = o.sensibilite;
    sensibilite.onchange = () => { o.sensibilite = Number(sensibilite.value); this.jeu.sauver(); };
    ligne('Sensibilité de la souris', 'La vitesse de rotation de la caméra.', sensibilite);
    const toggle = (cle, titre, aide) => {
      const b = document.createElement('button');
      const maj = () => { b.textContent = o[cle] ? 'Activé' : 'Désactivé'; b.setAttribute('aria-pressed', String(o[cle])); };
      maj();
      b.onclick = () => { o[cle] = !o[cle]; maj(); this.jeu.appliquerConfort(); this.jeu.sauver(); };
      ligne(titre, aide, b);
    };
    toggle('mouvementReduit', 'Caméra stable', 'Désactive les secousses et le changement de champ en course.');
    toggle('aide', 'Rappel des commandes', 'Affiche les touches en bas de l’écran pendant la partie.');

    const bRaz = document.createElement('button');
    bRaz.textContent = 'Tout effacer';
    bRaz.onclick = () => {
      if (!confirm('Effacer la progression, les records et les touches ?')) return;
      this.jeu.reinitialiserSauvegarde();
    };
    ligne('Progression', 'Étages débloqués, records et touches personnalisées.', bRaz);
  }
}

export { fmt as formaterTemps };

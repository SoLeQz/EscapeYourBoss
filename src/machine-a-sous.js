// ============================================================
//  « Juste 5 minutes » — interface de la machine à sous de la borne
//  d'arcade (salle de sieste clandestine).
//
//  Ergonomie calquée sur les machines à sous du studio Hacksaw Gaming :
//  écran d'accueil à fiches de fonctionnalités, barre basse (menu, son,
//  solde, mise, gain), gros bouton de lancement rond, tours rapides,
//  lancement automatique, achat de bonus à gauche des rouleaux, arrêt
//  forcé en rappuyant, anticipation, célébrations par palier, tours
//  gratuits à compteur, barre d'espace pour jouer. L'art, les noms et la
//  monnaie (tickets restaurant fictifs) appartiennent au jeu.
//  Règles pures : machine-a-sous-regles.js.
// ============================================================
import { SYMBOLES, LIGNES, MISES, MISE_DEFAUT, GAIN_MAX, SOLDE_INITIAL, AVANCE_SUR_SALAIRE, BONUS, COLONNES, RANGEES,
  MULTIPLICATEURS, jouerTour, jouerBonus, palier, PALIERS, tirerGrille, arrondir, TOURS_RELANCE } from './machine-a-sous-regles.js';
import { DESSINS } from './machine-a-sous-symboles.js';

// Mesuré sur 10 millions de tours simulés (achats : 95,1 % et 96,1 %) ; contrôlé par tests/interface/machine-a-sous.mjs.
export const TAUX_REDISTRIBUTION = '96,4 %';
const fr = v => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $$ = (racine, sel) => racine.querySelector(sel);
const picto = id => `<svg class="picto" aria-hidden="true"><use href="#p-${id}"/></svg>`;
const DUREES = { normal: { base: 620, pas: 170, anticipation: 1100, entre: 520 }, rapide: { base: 260, pas: 60, anticipation: 600, entre: 180 } };
const REMPLISSAGE = ['trombone', 'agrafeuse', 'postit', 'tasse', 'tampon', 'cravate', 'portable', 'badge', 'directeur', 'sauvage', 'canard', 'sortie'];

export class MachineASous {
  constructor(jeu, racine) {
    this.jeu = jeu; this.racine = racine; this.alea = Math.random;
    this.construite = false; this.ouverte = false; this.occupee = false; this.auto = 0;
    // `partie` change quand un tour est réglé d'office : les animations restées
    // en vol s'arrêtent net au lieu d'agir sur la borne fermée.
    // `ardoise` : gains du tour en cours pas encore versés au solde.
    this.partie = 0; this.ardoise = 0; this.gainPartie = 0;
    this.clavier = e => this.touche(e);
  }

  // État persistant dans la sauvegarde (store.js : `cantine`).
  get etat() {
    const e = this.jeu.etat.cantine ??= {};
    e.solde ??= SOLDE_INITIAL; e.mise ??= MISE_DEFAUT; e.tours ??= 0; e.meilleur ??= 0;
    e.turbo ??= false; e.son ??= true; e.introVue ??= false; e.historique ??= []; e.arretBonus ??= true;
    return e;
  }
  sauver() { clearTimeout(this.sauvegardeT); this.sauvegardeT = setTimeout(() => this.jeu.sauver?.(), 400); }
  son(nom, ...args) { if (this.etat.son && this.jeu.audio?.[nom]) this.jeu.audio[nom](...args); }

  // ---------------------------------------------------------- ouverture
  ouvrir() {
    if (!this.construite) this.construire();
    this.ouverte = true;
    addEventListener('keydown', this.clavier, true);
    this.majBarre(); this.majMise();
    if (!this.grilleActuelle) this.afficherGrille(tirerGrille(this.alea, 'base'));
    this.racine.classList.toggle('turbo', this.etat.turbo);
    if (!this.etat.introVue) this.montrerIntro(); else $$(this.racine, '.mas-intro').hidden = true;
    requestAnimationFrame(() => $$(this.racine, this.etat.introVue ? '.mas-tourner' : '.mas-intro').focus({ preventScroll: true }));
  }
  fermer() {
    if (this.occupee || this.enBonus) this.regler();
    this.ouverte = false; this.auto = 0; this.sortieDemandee = false; clearTimeout(this.filet);
    this.fermerPanneaux();
    removeEventListener('keydown', this.clavier, true);
    this.sauver();
  }
  // Échap : ferme d'abord un menu ouvert, sinon quitte la borne (toujours).
  echap() {
    if (this.panneauOuvert && this.panneauOuvert !== 'fenetre') { this.fermerPanneaux(); return; }
    this.demanderSortie();
  }
  // On peut toujours partir : un tour ou un bonus en cours est joué en accéléré,
  // ses gains versés, puis la borne se ferme.
  demanderSortie() {
    if (!this.occupee && !this.enBonus) { this.jeu.fermerMachine?.(); return; }
    this.sortieDemandee = true; this.auto = 0; this.passer();
    $$(this.racine, '.mas-panneau:not([hidden]) .mas-continuer')?.click();
    clearTimeout(this.filet);
    this.filet = setTimeout(() => { if (this.sortieDemandee && this.ouverte) { this.regler(); this.jeu.fermerMachine?.(); } }, 3000);
  }
  // Règlement immédiat : verse ce qui reste dû et remet la borne au repos.
  regler() {
    this.encaisser(this.ardoise); this.partie++;
    const gain = this.gainPartie;
    this.occupee = false; this.enBonus = false; this.sauter = false; this.attenteClic = null; this.bloquerFermeture = false;
    for (const r of this.rouleaux || []) { r.enCours = false; r.gen = (r.gen || 0) + 1; r.el.classList.remove('tourne', 'anticipe'); r.bande.style.transition = 'none'; r.bande.style.transform = 'translateY(0)'; }
    this.racine.classList.remove('en-bonus');
    const compteur = $$(this.racine, '.mas-compteur'); if (compteur) compteur.hidden = true;
    const celebration = $$(this.racine, '.mas-celebration'); if (celebration) celebration.hidden = true;
    this.majCollants?.(null); this.fermerPanneaux(); this.majBarre?.(); this.sauver();
    this.annoncerReglement(gain);
  }
  encaisser(montant) {
    const v = arrondir(Math.max(0, Math.min(montant, this.ardoise)));
    if (!v) return;
    this.ardoise = arrondir(this.ardoise - v); this.gainPartie = arrondir(this.gainPartie + v);
    this.etat.solde = arrondir(this.etat.solde + v);
  }
  annoncerReglement(gain) {
    this.jeu.ui?.toast?.('Borne « Juste 5 minutes »', gain > 0 ? `Tour réglé · ${fr(gain)} TR versés au solde` : 'Tour réglé · rien à verser', 3);
  }
  // Toute attente d'un tour passe par ici : si la partie a été réglée entre-temps,
  // la suite n'arrive jamais (la promesse reste en suspens et part au ramasse-miettes).
  garde(promesse) {
    const partie = this.partie;
    return Promise.resolve(promesse).then(v => new Promise(fin => { if (this.partie === partie) fin(v); }));
  }
  finTour() {
    this.occupee = false; this.sauter = false; this.ardoise = 0;
    this.majBarre(); this.majMise(); this.sauver();
    if (this.sortieDemandee) {
      this.sortieDemandee = false; clearTimeout(this.filet);
      this.annoncerReglement(this.gainPartie); this.jeu.fermerMachine?.();
    } else if (this.ouverte && (!document.activeElement || document.activeElement === document.body)) {
      $$(this.racine, '.mas-tourner').focus({ preventScroll: true });
    }
  }

  // ---------------------------------------------------------- construction
  construire() {
    this.construite = true;
    this.racine.innerHTML = `
    <div class="mas">
      <div class="mas-fond" aria-hidden="true"></div>
      <header class="mas-haut">
        <div class="mas-logo"><span class="mas-logo-l1">Juste</span><span class="mas-logo-l2">5 minutes</span>
          <span class="mas-logo-studio">Massicot Gaming · borne de la salle de sieste</span></div>
        <button class="mas-quitter" type="button" title="Quitter la borne (Échap)">Quitter la borne <kbd>Échap</kbd>${picto('croix')}</button>
      </header>
      <main class="mas-centre">
        <div class="mas-gauche">
          <button class="mas-achat" type="button"><span>Achat</span><b>bonus</b><small>dès 100×</small></button>
          <div class="mas-info-gains"><span>Gain max</span><b>${GAIN_MAX.toLocaleString('fr-FR')}×</b></div>
        </div>
        <div class="mas-cadre">
          <div class="mas-compteur" hidden><span class="mas-compteur-nom"></span><span>Tours gratuits restants <b class="mas-restants">0</b></span><span>Gain du bonus <b class="mas-cumul">0,00</b> TR</span></div>
          <div class="mas-grille" role="img" aria-label="Rouleaux">
            ${Array.from({ length: COLONNES }, (_, c) => `<div class="mas-rouleau" data-c="${c}"><div class="mas-bande"></div></div>`).join('')}
            <svg class="mas-lignes" viewBox="0 0 ${COLONNES * 100} ${RANGEES * 100}" preserveAspectRatio="none" aria-hidden="true"></svg>
            <div class="mas-collants" aria-hidden="true"></div>
          </div>
          <div class="mas-message" aria-live="polite"></div>
        </div>
        <div class="mas-droite" aria-hidden="true">
          <div class="mas-affiche"><span>Canards</span><b>WILD</b><small>×2 à ×100<br>s’additionnent</small></div>
          <div class="mas-affiche vert"><span>3 sorties</span><b>Pause café</b><small>10 tours gratuits</small></div>
        </div>
      </main>
      <footer class="mas-barre">
        <div class="mas-barre-gauche">
          <button class="mas-rond petit mas-menu" type="button" title="Menu">${picto('menu')}</button>
          <button class="mas-rond petit mas-son" type="button" title="Son">${picto('son')}</button>
          <div class="mas-valeur"><span>Solde</span><b class="mas-solde">0,00</b><small>TR</small></div>
          <div class="mas-valeur mas-mise-bloc">
            <button class="mas-rond mini mas-moins" type="button" title="Diminuer la mise">${picto('moins')}</button>
            <button class="mas-mise-bouton" type="button" title="Choisir la mise"><span>Mise</span><b class="mas-mise">0,00</b><small>TR</small></button>
            <button class="mas-rond mini mas-plus" type="button" title="Augmenter la mise">${picto('plus')}</button>
          </div>
        </div>
        <div class="mas-valeur mas-gain-bloc"><span>Gain</span><b class="mas-gain">0,00</b><small>TR</small></div>
        <div class="mas-barre-droite">
          <button class="mas-rond petit mas-turbo" type="button" title="Tours rapides" aria-pressed="false">${picto('eclair')}</button>
          <button class="mas-rond moyen mas-auto" type="button" title="Lancement automatique">AUTO</button>
          <button class="mas-tourner" type="button" title="Lancer (Espace)" aria-label="Lancer">${picto('tourner')}<span class="mas-tourner-compte"></span></button>
        </div>
      </footer>
      <div class="mas-celebration" hidden aria-live="polite"><div class="mas-confettis" aria-hidden="true"></div>
        <b class="mas-palier"></b><span class="mas-somme"></span><small>Cliquer pour continuer</small></div>
      <div class="mas-panneau" hidden role="dialog" aria-modal="true"><div class="mas-panneau-boite"></div></div>
      <div class="mas-intro" tabindex="-1">
        <div class="mas-studio"><b>Massicot</b> Gaming<small>on coupe court.</small></div>
        <div class="mas-intro-logo"><span class="mas-logo-l1">Juste</span><span class="mas-logo-l2">5 minutes</span></div>
        <div class="mas-fiches">
          <article>${DESSINS.canard}<b>Canards multiplicateurs</b><p>Sauvages, ×2 à ×100. Sur une même ligne, leurs multiplicateurs s’additionnent.</p></article>
          <article>${DESSINS.sortie}<b>Pause café</b><p>3 sorties : 10 tours gratuits. Les canards restent scotchés jusqu’à la fin.</p></article>
          <article>${DESSINS.directeur}<b>Super pause café</b><p>4 sorties ou plus : 13 tours, canards scotchés et +1 à leur multiplicateur à chaque tour.</p></article>
        </div>
        <p class="mas-intro-pied">Gain max ${GAIN_MAX.toLocaleString('fr-FR')}× · 14 lignes · monnaie fictive (tickets restaurant)</p>
        <button class="mas-continuer" type="button">Cliquer pour continuer</button>
        <label class="mas-case-a-cocher"><input type="checkbox" class="mas-plus-afficher"> Ne plus afficher</label>
      </div>
    </div>`;
    const r = this.racine;
    this.rouleaux = [...r.querySelectorAll('.mas-rouleau')].map(el => ({ el, bande: $$(el, '.mas-bande') }));
    $$(r, '.mas-quitter').onclick = () => this.demanderSortie();
    $$(r, '.mas-tourner').onclick = () => this.boutonTourner();
    $$(r, '.mas-moins').onclick = () => this.changerMise(-1);
    $$(r, '.mas-plus').onclick = () => this.changerMise(1);
    $$(r, '.mas-mise-bouton').onclick = () => this.panneauMise();
    $$(r, '.mas-turbo').onclick = () => { this.etat.turbo = !this.etat.turbo; this.racine.classList.toggle('turbo', this.etat.turbo); this.majBarre(); this.sauver(); };
    $$(r, '.mas-auto').onclick = () => this.auto ? this.arreterAuto() : this.panneauAuto();
    $$(r, '.mas-son').onclick = () => { this.etat.son = !this.etat.son; this.majBarre(); this.sauver(); };
    $$(r, '.mas-menu').onclick = () => this.panneauMenu('gains');
    $$(r, '.mas-achat').onclick = () => this.panneauAchat();
    $$(r, '.mas-continuer').onclick = () => {
      if ($$(r, '.mas-plus-afficher').checked) { this.etat.introVue = true; this.sauver(); }
      $$(r, '.mas-intro').hidden = true; $$(r, '.mas-tourner').focus({ preventScroll: true });
      this.son('masClic');
    };
    $$(r, '.mas-celebration').onclick = () => this.passer();
    $$(r, '.mas-panneau').onclick = e => { if (e.target === e.currentTarget) this.fermerPanneaux(); };
    $$(r, '.mas-grille').onclick = () => { if (this.occupee) this.passer(); };
  }

  montrerIntro() { $$(this.racine, '.mas-intro').hidden = false; }

  // ---------------------------------------------------------- barre basse
  majBarre() {
    const r = this.racine, e = this.etat;
    $$(r, '.mas-solde').textContent = fr(e.solde);
    $$(r, '.mas-turbo').setAttribute('aria-pressed', String(e.turbo));
    $$(r, '.mas-turbo').classList.toggle('actif', e.turbo);
    $$(r, '.mas-son').innerHTML = picto(e.son ? 'son' : 'muet');
    $$(r, '.mas-auto').classList.toggle('actif', this.auto > 0);
    $$(r, '.mas-tourner-compte').textContent = this.auto > 0 ? (this.auto === Infinity ? '∞' : String(this.auto)) : '';
    $$(r, '.mas-tourner').classList.toggle('auto', this.auto > 0);
    const bloque = this.occupee || this.enBonus;
    for (const s of ['.mas-moins', '.mas-plus', '.mas-mise-bouton', '.mas-achat', '.mas-menu']) $$(r, s).disabled = bloque;
  }
  majMise() {
    const i = MISES.indexOf(this.etat.mise);
    if (i < 0) this.etat.mise = MISE_DEFAUT;
    $$(this.racine, '.mas-mise').textContent = fr(this.etat.mise);
    $$(this.racine, '.mas-moins').disabled = this.occupee || MISES.indexOf(this.etat.mise) === 0;
    $$(this.racine, '.mas-plus').disabled = this.occupee || MISES.indexOf(this.etat.mise) === MISES.length - 1;
  }
  changerMise(sens) {
    const i = Math.max(0, Math.min(MISES.length - 1, MISES.indexOf(this.etat.mise) + sens));
    this.etat.mise = MISES[i]; this.majMise(); this.son('masClic'); this.sauver();
  }
  afficherGain(v, compter = false) {
    const el = $$(this.racine, '.mas-gain');
    if (!compter) { el.textContent = fr(v); return Promise.resolve(); }
    return this.compter(el, 0, v, Math.min(1400, 300 + v / this.etat.mise * 30));
  }
  compter(el, de, a, duree) {
    return new Promise(fin => {
      const t0 = performance.now();
      let tic = 0;
      const pas = () => {
        const k = this.sauter ? 1 : Math.min(1, (performance.now() - t0) / duree);
        el.textContent = fr(arrondir(de + (a - de) * (1 - (1 - k) ** 3)));
        if (k < 1 && performance.now() - tic > 90) { tic = performance.now(); this.son('masPiece'); }
        if (k < 1) requestAnimationFrame(pas); else fin();
      };
      pas();
    });
  }

  // ---------------------------------------------------------- cases
  caseHTML(x, taille = '') {
    const m = x.s === 'canard' ? `<span class="mas-multi">×${x.m}</span>` : '';
    return `<div class="mas-case ${taille} s-${x.s}">${DESSINS[x.s]}${m}</div>`;
  }
  afficherGrille(grille) {
    this.grilleActuelle = grille;
    this.rouleaux.forEach((r, c) => {
      r.bande.style.transition = 'none'; r.bande.style.transform = 'translateY(0)';
      r.bande.innerHTML = grille[c].map(x => this.caseHTML(x)).join('');
    });
  }
  caseDOM(c, r) { return this.rouleaux[c].bande.children[r]; }

  // ---------------------------------------------------------- lancer
  boutonTourner() {
    if (!$$(this.racine, '.mas-intro').hidden) return;
    if (this.occupee) { this.passer(); return; }
    if (this.auto) { this.arreterAuto(); return; }
    this.tourner();
  }
  touche(e) {
    if (!this.ouverte) return;
    // la touche d'interaction qui a ouvert la borne la referme
    if (!e.repeat && e.code !== 'Space' && e.code !== 'Enter' && this.jeu.input?.correspond?.('interagir', e.code)
        && !['INPUT', 'SELECT'].includes(e.target?.tagName)) {
      e.preventDefault(); e.stopImmediatePropagation(); this.demanderSortie(); return;
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      if (['INPUT', 'SELECT'].includes(e.target?.tagName)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      if (!$$(this.racine, '.mas-intro').hidden) { $$(this.racine, '.mas-continuer').click(); return; }
      if (this.panneauOuvert === 'fenetre') { $$(this.racine, '.mas-panneau .mas-continuer')?.click(); return; }
      if (this.panneauOuvert) { if (e.code === 'Enter') return; this.fermerPanneaux(); return; }
      if (!$$(this.racine, '.mas-celebration').hidden || this.attenteClic) { this.passer(); return; }
      this.boutonTourner();
    }
  }
  // Rappuyer pendant un tour : arrêt immédiat des rouleaux et fin des animations.
  passer() {
    this.sauter = true; this.reveil?.();
    if (this.attenteClic) { const f = this.attenteClic; this.attenteClic = null; f(); }
    for (const r of this.rouleaux) if (r.enCours) { r.bande.style.transition = 'transform 90ms ease-out'; r.bande.style.transform = 'translateY(0)'; }
  }
  pause(ms) {
    return new Promise(fin => {
      if (this.sauter || this.sortieDemandee) return fin();
      const t = setTimeout(() => { this.reveil = null; fin(); }, ms);
      this.reveil = () => { clearTimeout(t); this.reveil = null; fin(); };
    });
  }
  clic() { return new Promise(fin => { this.attenteClic = fin; }); }

  async tourner() {
    const e = this.etat, mise = e.mise;
    if (e.solde < mise) { this.panneauSolde(); this.arreterAuto(); return; }
    this.occupee = true; this.sauter = false; this.gainPartie = 0; this.majBarre(); this.majMise();
    e.solde = arrondir(e.solde - mise); this.majBarre();
    this.nettoyerGains(); this.afficherGain(0);
    const res = jouerTour(mise, this.alea);
    this.ardoise = res.total; e.tours++;
    this.noter({ mise, gain: res.total, bonus: res.bonus });
    this.son('masDepart');
    await this.garde(this.animerRouleaux(res.grille));
    await this.garde(this.presenterGains(res.gains, res.total, mise));
    this.encaisser(res.total); e.meilleur = Math.max(e.meilleur, res.total);
    this.majBarre();
    if (res.bonus) {
      if (this.auto && e.arretBonus) this.arreterAuto();
      await this.garde(this.celebrerSorties(res.sorties));
      await this.garde(this.jouerBonusComplet(res.bonus, mise));
    }
    this.finTour();
    this.jeu.decouvrir?.('arcade');
    if (this.auto && this.ouverte) {
      if (this.auto !== Infinity) this.auto--;
      this.majBarre();
      if (this.auto > 0 && e.solde >= e.mise) { await this.garde(this.pause(e.turbo ? 120 : 380)); this.sauter = false; if (this.auto && this.ouverte && !this.occupee) this.tourner(); }
      else this.arreterAuto();
    }
  }

  // Les rouleaux descendent, s'arrêtent de gauche à droite ; ralentissement
  // (anticipation) sur les rouleaux suivants dès que deux sorties sont posées.
  animerRouleaux(grille, collants = null) {
    const d = this.etat.turbo ? DUREES.rapide : DUREES.normal;
    const h = this.rouleaux[0].el.clientHeight / RANGEES || 100;
    let sorties = 0, retard = 0;
    const fins = this.rouleaux.map((r, c) => {
      const anticipation = sorties >= 2 && !this.sauter;
      if (anticipation) retard += d.anticipation;
      sorties += grille[c].filter(x => x.s === 'sortie').length;
      const remplissage = 10 + c * 3 + (anticipation ? 12 : 0);
      const actuelles = [...r.bande.children].slice(0, RANGEES).map(n => n.outerHTML).join('');
      const alea = Array.from({ length: remplissage }, () => this.caseHTML({ s: REMPLISSAGE[Math.floor(this.alea() * 9)] })).join('');
      r.bande.style.transition = 'none';
      r.bande.innerHTML = grille[c].map(x => this.caseHTML(x, 'arrive')).join('') + alea + actuelles;
      r.bande.style.transform = `translateY(${-(RANGEES + remplissage) * h}px)`;
      r.el.classList.add('tourne'); r.el.classList.toggle('anticipe', anticipation);
      // Numéro d'animation : un minuteur ou un transitionend du tour précédent
      // ne doit jamais arrêter ce rouleau-ci (sinon ce tour n'aboutit jamais).
      r.enCours = true; const gen = r.gen = (r.gen || 0) + 1;
      const duree = this.sauter ? 90 : d.base + c * d.pas + retard;
      return new Promise(fin => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (r.gen !== gen || !r.enCours) return;
          r.bande.style.transition = `transform ${this.sauter ? 90 : duree}ms cubic-bezier(.32,.02,.22,1)`;
          r.bande.style.transform = 'translateY(0)';
        }));
        let minuterie;
        const surFin = ev => { if (ev.target === r.bande && ev.propertyName === 'transform') arret(); };
        const arret = () => {
          r.bande.removeEventListener('transitionend', surFin); clearTimeout(minuterie);
          if (r.gen !== gen || !r.enCours) { fin(); return; }
          r.enCours = false; r.el.classList.remove('tourne', 'anticipe');
          // on ne garde que les quatre cases visibles
          r.bande.style.transition = 'none'; r.bande.style.transform = 'translateY(0)';
          while (r.bande.children.length > RANGEES) r.bande.lastElementChild.remove();
          this.son('masArret', c);
          if (grille[c].some(x => x.s === 'sortie')) { this.son('masSortie', c); for (const [i, x] of grille[c].entries()) if (x.s === 'sortie') this.caseDOM(c, i).classList.add('sortie-pose'); }
          fin();
        };
        // tour sauté (ou sortie demandée) : les rouleaux se posent tout de suite
        if (this.sauter || this.sortieDemandee) { arret(); return; }
        r.bande.addEventListener('transitionend', surFin);
        minuterie = setTimeout(arret, duree + 250);
      });
    });
    this.grilleActuelle = grille;
    return Promise.all(fins).then(() => { if (collants) this.majCollants(collants); });
  }

  nettoyerGains() {
    const g = $$(this.racine, '.mas-grille');
    g.classList.remove('resultat');
    for (const n of g.querySelectorAll('.gagne')) n.classList.remove('gagne');
    $$(this.racine, '.mas-lignes').innerHTML = '';
    $$(this.racine, '.mas-message').textContent = '';
    $$(this.racine, '.mas-message').className = 'mas-message';
  }

  // Lignes gagnantes : toutes ensemble, puis une par une avec leur montant.
  async presenterGains(gains, total, mise) {
    if (!gains.length) { $$(this.racine, '.mas-message').textContent = this.enBonus ? '' : 'Bonne chance pour la prochaine réunion.'; return; }
    const grille = $$(this.racine, '.mas-grille'), svg = $$(this.racine, '.mas-lignes');
    grille.classList.add('resultat');
    const trace = g => `<polyline points="${LIGNES[g.ligne].map((r, c) => `${c * 100 + 50},${r * 100 + 50}`).join(' ')}" class="l${g.ligne % 5}"/>`;
    svg.innerHTML = gains.map(trace).join('');
    for (const g of gains) for (const [c, r] of g.cases) this.caseDOM(c, r)?.classList.add('gagne');
    const niveau = palier(total, mise);
    this.son('masGain', niveau || (total >= mise ? 'petit' : 'mini'));
    const message = $$(this.racine, '.mas-message');
    message.innerHTML = `Gain <b>${fr(total)}</b> TR`;
    message.className = 'mas-message visible';
    if (niveau) { await this.celebrer(niveau, total); }
    else await this.afficherGain(total, true);
    if (this.etat.turbo || this.sauter || this.auto) { await this.pause(this.etat.turbo ? 250 : 650); return; }
    // défilé ligne par ligne, comme sur les machines du genre
    for (const g of gains.slice(0, 6)) {
      if (this.sauter) break;
      for (const n of grille.querySelectorAll('.gagne')) n.classList.remove('gagne');
      for (const [c, r] of g.cases) this.caseDOM(c, r)?.classList.add('gagne');
      svg.innerHTML = trace(g);
      message.innerHTML = `Ligne ${g.ligne + 1} · ${g.nombre} × ${SYMBOLES[g.symbole].nom}${g.mult > 1 ? ` · <i>×${g.mult}</i>` : ''} · <b>${fr(g.gain)}</b> TR`;
      await this.pause(900);
    }
  }

  // Grosse célébration : GROS GAIN → MÉGA GAIN → GAIN ÉPIQUE, avec un compteur.
  async celebrer(niveau, total) {
    const c = $$(this.racine, '.mas-celebration'), somme = $$(c, '.mas-somme'), titre = $$(c, '.mas-palier');
    const ordre = ['gros', 'mega', 'epique', 'max'], cible = ordre.indexOf(niveau);
    c.hidden = false; c.className = 'mas-celebration n-' + niveau;
    this.pluieDeFeuilles(); this.son('masCelebration', niveau);
    const mise = this.etat.mise;
    const seuils = { gros: 15, mega: 50, epique: 100, max: GAIN_MAX };
    let de = 0;
    for (let i = 0; i <= cible; i++) {
      const n = ordre[i], jusque = i === cible ? total : seuils[ordre[i + 1]] * mise;
      titre.textContent = PALIERS[n]; c.className = 'mas-celebration n-' + n;
      await this.compter(somme, de, jusque, this.etat.turbo ? 700 : 1600);
      de = jusque;
    }
    this.afficherGain(total);
    if (!this.sauter) await Promise.race([this.pause(this.auto ? 1200 : 2600), this.clic()]);
    this.attenteClic = null;
    c.hidden = true;
  }
  pluieDeFeuilles() {
    const conf = $$(this.racine, '.mas-confettis');
    conf.innerHTML = Array.from({ length: 36 }, (_, i) => {
      const types = ['feuille', 'postit', 'postit rose', 'trombone'];
      return `<i class="${types[i % 4]}" style="left:${(i * 37) % 100}%;animation-delay:${(i % 12) * .12}s;animation-duration:${2.2 + (i % 5) * .35}s"></i>`;
    }).join('');
  }

  async celebrerSorties(sorties) {
    for (const [c, r] of sorties) this.caseDOM(c, r)?.classList.add('sortie-gagne');
    $$(this.racine, '.mas-message').innerHTML = `<b>${sorties.length} sorties</b> · la pause café commence`;
    $$(this.racine, '.mas-message').className = 'mas-message visible';
    this.son('masBonus');
    await this.pause(1300);
  }

  // ---------------------------------------------------------- tours gratuits
  async jouerBonusComplet(type, mise) {
    const def = BONUS[type], bonus = jouerBonus(type, mise, this.alea);
    this.ardoise = arrondir(this.ardoise + bonus.total);
    this.enBonus = true; this.sauter = !!this.sortieDemandee; this.majBarre();
    this.racine.classList.add('en-bonus');
    await this.garde(this.fenetre(`<span class="mas-fenetre-sur">Tu as déclenché</span><b>${def.nom}</b><strong>${def.tours} tours gratuits</strong><p>${def.description}</p>`, 'Cliquer pour commencer'));
    const compteur = $$(this.racine, '.mas-compteur');
    compteur.hidden = false; $$(compteur, '.mas-compteur-nom').textContent = def.nom;
    $$(compteur, '.mas-restants').textContent = String(def.tours); $$(compteur, '.mas-cumul').textContent = '0,00';
    this.majCollants(null);
    let collants = Array.from({ length: COLONNES }, () => Array(RANGEES).fill(null));
    for (const t of bonus.tours) {
      this.sauter = !!this.sortieDemandee; this.nettoyerGains();
      $$(compteur, '.mas-restants').textContent = String(t.restants + 1 - t.relance);
      await this.garde(this.pause(this.etat.turbo ? 150 : 420));
      // les canards déjà scotchés ne tournent pas
      this.son('masDepart');
      await this.garde(this.animerRouleaux(t.grille));
      t.grille.forEach((col, c) => col.forEach((x, r) => { if (x.s === 'canard') collants[c][r] = x; }));
      this.majCollants(collants);
      $$(compteur, '.mas-restants').textContent = String(t.restants);
      await this.garde(this.presenterGains(t.gains, t.gain, mise));
      $$(compteur, '.mas-cumul').textContent = fr(t.cumul);
      if (t.relance) { $$(this.racine, '.mas-message').innerHTML = `<b>+${TOURS_RELANCE} tours</b> · encore un café`; this.son('masBonus'); await this.garde(this.pause(1200)); }
      if (t.plafond) { $$(this.racine, '.mas-message').innerHTML = `<b>Gain max atteint</b>`; await this.garde(this.pause(1200)); }
    }
    this.sauter = !!this.sortieDemandee;
    await this.garde(this.fenetre(`<span class="mas-fenetre-sur">${def.nom} terminée</span><b class="mas-total-bonus">0,00 TR</b><p>${bonus.tours.length} tours joués.</p>`, 'Cliquer pour continuer', async boite => {
      await this.compter($$(boite, '.mas-total-bonus'), 0, bonus.total, 1400); $$(boite, '.mas-total-bonus').textContent += ' TR';
    }));
    const palierBonus = palier(bonus.total, mise);
    if (palierBonus && !this.sortieDemandee) await this.garde(this.celebrer(palierBonus, bonus.total));
    this.encaisser(bonus.total); this.etat.meilleur = Math.max(this.etat.meilleur, bonus.total);
    this.noter({ mise: 0, gain: bonus.total, bonus: 'fin ' + type });
    this.afficherGain(bonus.total);
    compteur.hidden = true; this.majCollants(null);
    this.racine.classList.remove('en-bonus');
    this.enBonus = false; this.majBarre(); this.sauver();
  }
  // Les canards collés sont scotchés sur la vitre (couche au-dessus des rouleaux).
  majCollants(collants) {
    const couche = $$(this.racine, '.mas-collants');
    if (!collants) { couche.innerHTML = ''; return; }
    couche.innerHTML = collants.flatMap((col, c) => col.map((x, r) => x ? `<div class="mas-colle" style="--c:${c};--r:${r}">${this.caseHTML(x)}<i class="scotch"></i></div>` : '')).join('');
  }
  fenetre(html, bouton, pendant) {
    return new Promise(async fin => {
      const p = $$(this.racine, '.mas-panneau'), boite = $$(p, '.mas-panneau-boite');
      boite.className = 'mas-panneau-boite mas-fenetre';
      boite.innerHTML = `${html}<button class="mas-continuer" type="button">${bouton}</button>`;
      p.hidden = false; this.panneauOuvert = 'fenetre'; this.bloquerFermeture = true;
      const b = $$(boite, '.mas-continuer');
      b.focus({ preventScroll: true });
      let decompte = !!pendant, fini = false;
      const finir = () => { if (fini) return; fini = true; p.hidden = true; this.panneauOuvert = null; this.bloquerFermeture = false; fin(); };
      // pendant le décompte, un clic l'achève ; le suivant ferme la fenêtre
      b.onclick = () => { if (decompte) this.sauter = true; else finir(); };
      if (pendant) await pendant(boite);
      decompte = false;
      if (this.sortieDemandee) { finir(); return; }
      if (this.auto && !this.etat.arretBonus) setTimeout(() => { if (!p.hidden && boite.contains(b)) finir(); }, 2500);
    });
  }

  // ---------------------------------------------------------- achat de bonus
  panneauAchat() {
    const mise = this.etat.mise;
    this.panneau(`<h2>Achat bonus</h2><p class="mas-panneau-sous">Prix en multiples de ta mise actuelle (${fr(mise)} TR).</p>
      <div class="mas-achats">${Object.entries(BONUS).map(([id, b]) => `
        <article class="mas-carte-achat${id === 'super' ? ' super' : ''}">
          ${DESSINS[id === 'super' ? 'directeur' : 'sortie']}
          <b>${b.nom}</b><p>${b.tours} tours gratuits. ${b.description}</p>
          <button type="button" data-achat="${id}" ${this.etat.solde < b.prix * mise ? 'disabled' : ''}><span>${b.prix}×</span>${fr(b.prix * mise)} TR</button>
        </article>`).join('')}</div>`);
    for (const b of this.racine.querySelectorAll('[data-achat]')) b.onclick = () => this.confirmerAchat(b.dataset.achat);
  }
  confirmerAchat(type) {
    const b = BONUS[type], prix = arrondir(b.prix * this.etat.mise);
    this.panneau(`<h2>${b.nom}</h2><p class="mas-confirmation">Acheter ${b.nom} pour <b>${fr(prix)} TR</b> ?</p>
      <div class="mas-oui-non"><button type="button" class="non">${picto('croix')} Non</button><button type="button" class="oui">${picto('coche')} Oui</button></div>`);
    $$(this.racine, '.mas-oui-non .non').onclick = () => this.panneauAchat();
    $$(this.racine, '.mas-oui-non .oui').onclick = async () => {
      this.fermerPanneaux();
      if (this.etat.solde < prix || this.occupee) return;
      this.occupee = true; this.sauter = false; this.gainPartie = 0; this.majBarre();
      this.etat.solde = arrondir(this.etat.solde - prix); this.majBarre(); this.nettoyerGains(); this.afficherGain(0);
      this.noter({ mise: prix, gain: 0, bonus: 'achat ' + type });
      // Le tour d'achat fait tomber les sorties, pour le plaisir des yeux.
      const g = tirerGrille(this.alea, 'base'), n = type === 'super' ? 4 : 3;
      const cols = [0, 1, 2, 3, 4].sort(() => this.alea() - .5).slice(0, n);
      g.forEach((col, c) => col.forEach((x, r) => { if (x.s === 'sortie') col[r] = { s: 'trombone' }; }));
      for (const c of cols) g[c][Math.floor(this.alea() * RANGEES)] = { s: 'sortie' };
      this.son('masDepart');
      await this.garde(this.animerRouleaux(g));
      const sorties = []; g.forEach((col, c) => col.forEach((x, r) => { if (x.s === 'sortie') sorties.push([c, r]); }));
      await this.garde(this.celebrerSorties(sorties));
      await this.garde(this.jouerBonusComplet(type, this.etat.mise));
      this.finTour();
    };
  }

  // ---------------------------------------------------------- lancement automatique
  panneauAuto() {
    this.panneau(`<h2>Lancement automatique</h2><p class="mas-panneau-sous">Nombre de tours</p>
      <div class="mas-choix-auto">${[10, 25, 50, 100, 500].map(n => `<button type="button" data-auto="${n}">${n}</button>`).join('')}<button type="button" data-auto="Infinity">∞</button></div>
      <label class="mas-case-a-cocher sombre"><input type="checkbox" class="mas-arret-bonus" ${this.etat.arretBonus ? 'checked' : ''}> Arrêter au déclenchement d’un bonus</label>`);
    $$(this.racine, '.mas-arret-bonus').onchange = e => { this.etat.arretBonus = e.target.checked; this.sauver(); };
    for (const b of this.racine.querySelectorAll('[data-auto]')) b.onclick = () => {
      this.auto = b.dataset.auto === 'Infinity' ? Infinity : +b.dataset.auto;
      this.fermerPanneaux(); this.majBarre(); this.tourner();
    };
  }
  arreterAuto() { this.auto = 0; this.majBarre(); }

  // ---------------------------------------------------------- mise
  panneauMise() {
    this.panneau(`<h2>Mise</h2><p class="mas-panneau-sous">Mise totale par tour, sur les 14 lignes</p>
      <div class="mas-choix-mise">${MISES.map(m => `<button type="button" data-mise="${m}" class="${m === this.etat.mise ? 'actif' : ''}">${fr(m)}</button>`).join('')}</div>`);
    for (const b of this.racine.querySelectorAll('[data-mise]')) b.onclick = () => { this.etat.mise = +b.dataset.mise; this.majMise(); this.fermerPanneaux(); this.sauver(); };
  }

  // ---------------------------------------------------------- solde épuisé
  panneauSolde() {
    this.panneau(`<h2>Solde insuffisant</h2><p class="mas-confirmation">Il te reste <b>${fr(this.etat.solde)} TR</b>. Baisse ta mise, ou demande une avance.</p>
      <div class="mas-oui-non"><button type="button" class="non">Baisser la mise</button><button type="button" class="oui">Avance sur salaire +${AVANCE_SUR_SALAIRE} TR</button></div>
      <p class="mas-mention">Remboursable sur ta prochaine augmentation. C’est-à-dire jamais.</p>`);
    $$(this.racine, '.mas-oui-non .non').onclick = () => this.panneauMise();
    $$(this.racine, '.mas-oui-non .oui').onclick = () => { this.etat.solde = arrondir(this.etat.solde + AVANCE_SUR_SALAIRE); this.majBarre(); this.fermerPanneaux(); this.sauver(); this.son('masGain', 'petit'); };
  }

  // ---------------------------------------------------------- menu : gains, règles, réglages, historique
  panneauMenu(onglet) {
    const mise = this.etat.mise;
    const onglets = [['gains', 'Table des gains'], ['regles', 'Règles'], ['reglages', 'Réglages'], ['historique', 'Historique']];
    let corps = '';
    if (onglet === 'gains') {
      const ordinaires = ['directeur', 'badge', 'portable', 'cravate', 'tampon', 'tasse', 'postit', 'agrafeuse', 'trombone', 'sauvage'];
      corps = `<div class="mas-table-gains">${ordinaires.map(id => `<div class="mas-ligne-gain">${DESSINS[id]}<dl>
        ${[5, 4, 3].map(n => `<dt>${n}×</dt><dd>${fr(SYMBOLES[id].gains[n - 3] * mise)}</dd>`).join('')}</dl></div>`).join('')}</div>
        <div class="mas-speciaux">
          <div>${DESSINS.canard}<p><b>Canard multiplicateur</b> — sauvage sur les rouleaux 2 à 5, porte un multiplicateur de ×2 à ×100. Les multiplicateurs d’une même ligne s’additionnent.</p></div>
          <div>${DESSINS.sauvage}<p><b>Réveil « 5 min »</b> — sauvage sur les rouleaux 2 à 4 : remplace tous les symboles sauf la sortie.</p></div>
          <div>${DESSINS.sortie}<p><b>Sortie de secours</b> — 3 sorties : Pause café (10 tours). 4 ou 5 : Super pause café (13 tours). Pendant un bonus, 3 sorties ajoutent ${TOURS_RELANCE} tours.</p></div>
        </div><p class="mas-mention">Montants en TR pour la mise actuelle de ${fr(mise)} TR.</p>`;
    } else if (onglet === 'regles') {
      corps = `<div class="mas-regles">
        <p>5 rouleaux, 4 rangées, <b>14 lignes fixes</b>. Les gains se lisent de gauche à droite, à partir du premier rouleau ; seul le meilleur gain de chaque ligne est payé, et les gains de toutes les lignes s’additionnent.</p>
        <div class="mas-schemas">${LIGNES.map((l, i) => `<div class="mas-schema"><span>${i + 1}</span>${Array.from({ length: RANGEES }, (_, r) => l.map(x => `<i class="${x === r ? 'on' : ''}"></i>`).join('')).join('')}</div>`).join('')}</div>
        <p><b>Gain max</b> : ${GAIN_MAX.toLocaleString('fr-FR')} fois la mise, par tour ou par bonus complet. Le bonus s’arrête dès qu’il est atteint.</p>
        <p><b>Achat bonus</b> : Pause café à 100× la mise, Super pause café à 400×.</p>
        <p><b>Taux de redistribution théorique</b> : ${TAUX_REDISTRIBUTION}, mesuré sur 10 millions de tours simulés. Achats de bonus : 95,1 % (Pause café) et 96,1 % (Super pause café).</p>
        <p class="mas-mention">Jeu gratuit. Monnaie fictive (tickets restaurant de la salle de sieste) : rien ne s’achète, rien ne se retire, rien ne se gagne en dehors de cette borne.</p></div>`;
    } else if (onglet === 'reglages') {
      corps = `<div class="mas-reglages">
        <label class="mas-case-a-cocher sombre"><input type="checkbox" data-reglage="turbo" ${this.etat.turbo ? 'checked' : ''}> Tours rapides</label>
        <label class="mas-case-a-cocher sombre"><input type="checkbox" data-reglage="son" ${this.etat.son ? 'checked' : ''}> Sons de la borne</label>
        <label class="mas-case-a-cocher sombre"><input type="checkbox" data-reglage="intro" ${!this.etat.introVue ? 'checked' : ''}> Afficher l’écran d’accueil</label>
        <p class="mas-mention">Barre d’espace : lancer, arrêter les rouleaux, passer une animation. Échap : fermer un panneau ou quitter la borne.</p></div>`;
    } else {
      const h = this.etat.historique;
      corps = h.length ? `<table class="mas-historique"><thead><tr><th>Heure</th><th>Mise</th><th>Gain</th><th></th></tr></thead><tbody>
        ${h.map(x => `<tr><td>${x.heure}</td><td>${fr(x.mise)}</td><td>${fr(x.gain)}</td><td>${x.bonus || ''}</td></tr>`).join('')}</tbody></table>
        <p class="mas-mention">Tours joués : ${this.etat.tours} · meilleur gain : ${fr(this.etat.meilleur)} TR</p>` : '<p class="mas-mention">Aucun tour joué.</p>';
    }
    this.panneau(`<nav class="mas-onglets">${onglets.map(([id, nom]) => `<button type="button" data-onglet="${id}" class="${id === onglet ? 'actif' : ''}">${nom}</button>`).join('')}</nav>${corps}`, 'large');
    for (const b of this.racine.querySelectorAll('[data-onglet]')) b.onclick = () => this.panneauMenu(b.dataset.onglet);
    for (const c of this.racine.querySelectorAll('[data-reglage]')) c.onchange = () => {
      const k = c.dataset.reglage;
      if (k === 'intro') this.etat.introVue = !c.checked; else this.etat[k] = c.checked;
      this.racine.classList.toggle('turbo', this.etat.turbo); this.majBarre(); this.sauver();
    };
  }

  panneau(html, taille = '') {
    const p = $$(this.racine, '.mas-panneau'), boite = $$(p, '.mas-panneau-boite');
    boite.className = 'mas-panneau-boite ' + taille;
    boite.innerHTML = `<button class="mas-fermer" type="button" title="Fermer (Échap)">${picto('croix')}</button>${html}`;
    $$(boite, '.mas-fermer').onclick = () => this.fermerPanneaux();
    p.hidden = false; this.panneauOuvert = true; this.son('masClic');
    requestAnimationFrame(() => boite.querySelector('button:not(.mas-fermer):not(:disabled), .mas-fermer')?.focus({ preventScroll: true }));
  }
  fermerPanneaux() {
    if (this.bloquerFermeture) return;
    const p = $$(this.racine, '.mas-panneau');
    if (p) p.hidden = true;
    this.panneauOuvert = null;
    if (this.ouverte) $$(this.racine, '.mas-tourner')?.focus({ preventScroll: true });
  }

  noter({ mise, gain, bonus }) {
    const d = new Date(), heure = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    const noms = { pause: 'Pause café', super: 'Super pause café' };
    const texte = !bonus ? '' : bonus.startsWith('achat') ? 'Achat ' + noms[bonus.slice(6)] : bonus.startsWith('fin') ? 'Total ' + noms[bonus.slice(4)] : 'Bonus !';
    this.etat.historique = [{ heure, mise, gain, bonus: texte }, ...this.etat.historique].slice(0, 20);
  }
}

// Pour l'écran de la borne dans le décor : quelques symboles au hasard.
export function symbolesAttraction(alea = Math.random) {
  return Array.from({ length: 3 }, () => REMPLISSAGE[Math.floor(alea() * 10)]);
}
export { MULTIPLICATEURS };

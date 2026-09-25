import { prechargerAnatomieBlender } from './anatomie-blender.js';
import { prechargerTexturesBlender } from './textures-blender.js';
import { prechargerDecorBlender } from './decor-blender.js';
import * as THREE from 'three';
import { buildLevel, hasLOS, distanceObstacle } from './level.js';
import { buildMaterials, setAnisotropy, setTextureScale } from './materials.js';
import { initCharacterMaterials } from './characters.js';
import * as R from './render.js';
import { Player } from './player.js';
import { NPC } from './npc.js';
import { UI } from './ui.js';
import { GameAudio } from './audio.js';
import { Minimap } from './minimap.js';
import { NIVEAUX, PLANS, LIGNES_BOSS } from './levels.js';
import { Menu, formaterTemps } from './menu.js';
import { Entrees, touchesParDefaut, nomTouche } from './input.js';
import { EMOTES, reactionEmote } from './emotes.js';
import { mesurerVue, bilanVisibilite } from './perception.js';
import { creerInteractions, actionAccessible, lancerDiversion } from './office.js';
import { DUREE_TRAVAIL, ALERTE_TRAVAIL, travailProtege, avancerTravail } from './travail.js';
import * as Store from './store.js';
import { Multijoueur, LOOK_COEQUIPIER } from './multijoueur.js';
import { makeLabelSprite } from './characters.js';

// ============================================================
//   Escape your boss — prototype d'infiltration de bureau (Three.js)
// ============================================================

class Game {
  constructor() {
    this.ui = new UI();
    this.audio = new GameAudio();
    this.etat = { ...Store.DEFAUT, touches: touchesParDefaut() };
    this.input = new Entrees(this.etat.touches);
    this.showCones = true;
    this.showLabels = true;
    this.state = 'menu';
    this.mode = 'campagne';
    this.niveauIndex = 0;
    this.failCount = 0;
    this.elapsed = 0;
    this.nearMisses = 0;
    this._wasHot = false;

    this.qualite = 'haut';
    this.initThree();
    this.chrono = {};
    const top = () => performance.now();
    let t0 = top();
    this.profil = R.profilMateriel(this.renderer);
    this.qualite = R.qualiteConseillee(this.renderer);
    // Le jeu n'existe qu'en exécutable : on dimensionne textures et
    // filtrage d'après la carte présente, sans budget de téléchargement.
    setAnisotropy(this.profil.aniso);
    setTextureScale(this.profil.echelleTex);
    this.MAT = buildMaterials(this.renderer);
    initCharacterMaterials();
    this.chrono.matieres = Math.round(top() - t0); t0 = top();

    this.npcs = [];
    this.player = null;
    this.coequipier = null;
    this.multi = new Multijoueur(this);
    this.chargerNiveau(0);              // sert aussi de décor au menu
    this.chrono.premierNiveau = Math.round(top() - t0); t0 = top();

    this.minimap = new Minimap(document.getElementById('minimap'), this.level);
    this.bindInput();

    this.camYaw = Math.PI;
    this.camPitch = 0.30;
    this.camPos = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.setQualite(this.qualite, true);

    this.construireRoue();
    this.menu = new Menu(this);
    this.chrono.rendu = Math.round(top() - t0);
    this.chrono.total = Math.round(performance.now());
    this.clock = new THREE.Clock();
    this.ui.show('start');
    this.menu.ouvrir('menu-principal');
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // Charge la sauvegarde puis applique les préférences.
  async demarrer() {
    const version=await window.jeuAssets.version();
    document.getElementById('version-jeu').textContent='Version '+version;
    this.etat = await Store.charger();
    if (!this.etat.touches) this.etat.touches = touchesParDefaut();
    this.appliquerTouches();
    const o = this.etat.options;
    // La qualité n'est plus réglable : on refait confiance à la détection
    // GPU à chaque lancement, et au repli automatique si ça rame.
    delete o.qualite;
    this.showCones = o.cones;
    this.showLabels = o.noms;
    R.setEchelle(o.echelle || 1);
    this.appliquerEchelle();
    this.audio.setMuted(!o.son);
    this.appliquerConfort();
    this.menu.majNiveaux();
  }

  sauver() { Store.sauver(this.etat); }
  appliquerTouches() {
    this.input.majTouches(this.etat.touches);
    this.ui.setControls(this.etat.touches);
    this.sauver();
  }
  appliquerConfort() {
    const o = this.etat.options;
    document.body.classList.toggle('mouvement-reduit', !!o.mouvementReduit);
    document.getElementById('keys').hidden = o.aide === false;
  }
  touche(action) { return nomTouche(this.etat.touches[action]?.find(Boolean)); }
  appliquerEchelle() {
    R.setEchelle(this.etat.options.echelle || 1);
    this.renderer.setPixelRatio(R.pixelRatioDe(this.qualite));
    this.onResize();
  }
  async reinitialiserSauvegarde() {
    this.etat = { ...structuredClone(Store.DEFAUT), touches: touchesParDefaut() };
    await Store.sauver(this.etat);
    this.appliquerTouches();
    this.showCones = this.etat.options.cones;
    this.showLabels = this.etat.options.noms;
    this.audio.setMuted(!this.etat.options.son);
    this.appliquerConfort();
    this.menu.majOptions();
    this.menu.majNiveaux();
    this.ui.toast('Sauvegarde effacée', 'Tout est revenu à zéro.');
  }

  // ---------------------------------------------------------- rendu
  initThree() {
    const canvas = document.getElementById('game');
    this.renderer = R.createRenderer(canvas);
    this.renderer.setPixelRatio(R.pixelRatioDe(this.qualite));

    this.scene = new THREE.Scene();
    R.addFog(this.scene);

    // IBL : sans env map, les métaux sont noirs et tout est mat.
    this.scene.environment = R.buildEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.80;
    this.sky = R.addSky(this.scene);

    // Frustum serré : le GTAO reconstruit la position depuis la
    // profondeur, un rapport far/near trop grand le rend bruité.
    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.2, 280);

    this.lumieres = R.addLights(this.scene, R.PRESETS[this.qualite]);
    // Réserve fixe : varier seulement l'intensité. Ajouter/masquer une
    // PointLight modifie tous les shaders PBR et gelait Windows ~19 secondes.
    this.lumieresObjets = Array.from({ length: Math.max(...NIVEAUX.map(n => n.objets?.length || 0)) }, () => {
      const l = new THREE.PointLight(0xffce73, 0, 3.2, 2);
      this.scene.add(l);
      return l;
    });

    addEventListener('resize', () => this.onResize());
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    // En qualité « bas » il n'y a pas de composer du tout.
    if (this.post?.composer) {
      const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.post.composer.setSize(s.x, s.y);
      this.post.gtao?.setSize(s.x, s.y);
      this.post.bokeh?.setSize(s.x, s.y);
      this.post.bloom?.setSize(s.x, s.y);
    }
  }

  buildComposer() {
    // EffectComposer.dispose ne libère pas ses passes.
    for (const pass of this.post?.composer?.passes || []) pass.dispose?.();
    this.post?.composer?.dispose();
    this.post = R.createComposer(
      this.renderer, this.scene, this.camera, this.qualite,
      () => this.masquerOverlays());
  }

  // GTAO et le bokeh redessinent la scène pour la profondeur et les
  // normales. Les cônes, sprites et le contour du joueur n'ont rien
  // à y faire : on les masque le temps de ces passes.
  // La liste des sprites ne change qu'au chargement d'un étage : la
  // reparcourir deux fois par image pour chaque passe était gratuit.
  recenserOverlays() {
    this.overlays = [];
    if (this.player?.outline) this.overlays.push(this.player.outline);
    // Les repères des postes et les surfaces vitrées appartiennent au décor,
    // pas aux PNJ. Les oublier rendait leur rectangle opaque dans le GTAO.
    this.level?.root.traverse(o => {
      if (o.isSprite || o.material?.transparent && o.material.depthWrite === false) this.overlays.push(o);
    });
    for (const n of this.npcs || []) {
      this.overlays.push(n.cone);
      n.mesh.traverse(o => { if (o.isSprite) this.overlays.push(o); });
    }
  }

  masquerOverlays() {
    if (!this.overlays) this.recenserOverlays();
    const caches = [];
    for (const o of this.overlays) if (o.visible) { o.visible = false; caches.push(o); }
    // les bulles apparaissent en cours de partie : on les attrape aussi
    for (const n of this.npcs || []) if (n.bubble?.visible) { n.bubble.visible = false; caches.push(n.bubble); }
    return () => { for (const o of caches) o.visible = true; };
  }

  // Ombres deux fois plus fines sur carte dédiée : ce n'est pas le
  // nombre d'appels de dessin qui change, seulement la résolution de la
  // carte d'ombre, et on n'est pas limité par le remplissage.
  tailleOmbre() {
    const base = R.PRESETS[this.qualite].ombre;
    return Math.min(base * (this.profil.dedie ? 2 : 1), this.profil.ombreMax);
  }

  setQualite(q, silencieux = false) {
    this.qualite = q;
    const preset = R.PRESETS[q];
    this.renderer.setPixelRatio(R.pixelRatioDe(q));
    const ombre = this.tailleOmbre();
    this.lumieres.soleil.shadow.mapSize.set(ombre, ombre);
    this.lumieres.soleil.shadow.map?.dispose();
    this.lumieres.soleil.shadow.map = null;
    this.buildComposer();
    this.onResize();
    if (!silencieux) {
      const detail = preset.composer
        ? (preset.gtao ? 'occlusion ambiante + bloom' : 'bloom seul')
        : 'rendu direct, sans post-traitement';
      this.ui.toast('Qualité : ' + q, detail);
    }
  }

  // ---------------------------------------------------------- niveaux
  chargerNiveau(index) {
    this.niveauIndex = index;
    const niv = NIVEAUX[index];
    const plan = PLANS[niv.plan];
    this.niveau = niv;

    // heure de la journée : soleil, ciel, éclairage intérieur
    R.setSun(niv.soleil);
    if (!this.sky) this.sky = R.addSky(this.scene);
    else R.majCiel(this.sky);
    if (!this.lumieres) this.lumieres = R.addLights(this.scene, { ombre: this.tailleOmbre() });
    else R.majSoleil(this.lumieres);
    this.scene.environmentIntensity = 0.80 * (0.5 + 0.5 * niv.eclairage);

    // géométrie
    if (this.level) this.level.dispose();
    this.level = buildLevel(this.scene, this.MAT, plan, niv);
    this.appliquerEclairage(niv.eclairage);
    this.majLumieresObjets();
    if (this.minimap) this.minimap.level = this.level;

    // joueur
    if (!this.player) {
      this.player = new Player(this.scene, this.level);
      this.player.footstepCb = i => this.audio.step(i);
    } else {
      this.player.level = this.level;
      this.player.reset();
    }

    // multijoueur : le coéquipier apparaît à côté, un pas sur la droite du départ
    this.preparerCoequipier();

    // collègues
    for (const n of this.npcs) n.dispose();
    this.npcs = niv.pnj(plan).map(d => new NPC(this.scene, d, this.level));
    if (this.multi.hote) this.npcs.forEach((n, i) => {
      const dire = n.say.bind(n);
      n.say = (texte, dur) => { dire(texte, dur); this.multi.envoyer({ t: 'dire', i, texte, dur }); };
    });
    this.boss = this.npcs.find(n => n.isBoss);
    this.actionsBureau = creerInteractions(this.level, plan, this.npcs);

    this.repliFait = false;
    this.overlays = null;        // à recenser au prochain rendu
  }

  preparerCoequipier() {
    const actif = this.multi.actif;
    if (!actif) {
      if (this.coequipier) this.coequipier.mesh.visible = false;
      this.player.decalage = { x: 0, z: 0 };
      return;
    }
    if (!this.coequipier) {
      this.coequipier = new Player(this.scene, this.level, LOOK_COEQUIPIER);
      this.etiquetteCoequipier = makeLabelSprite(this.multi.nomDistant || 'Coéquipier', 'coéquipier');
      this.etiquetteCoequipier.position.y = 2.25;
      this.coequipier.mesh.add(this.etiquetteCoequipier);
    }
    this.coequipier.level = this.level;
    const y = this.level.playerStart.yaw, droite = { x: Math.cos(y) * 1.1, z: -Math.sin(y) * 1.1 };
    const gauche = { x: -droite.x, z: -droite.z };
    // l'hôte part du point habituel, l'invité à côté ; chacun voit l'autre au même endroit
    this.player.decalage = this.multi.hote ? { x: 0, z: 0 } : droite;
    this.coequipier.decalage = this.multi.hote ? droite : { x: 0, z: 0 };
    void gauche;
    this.coequipier.reset();
    this.coequipier.mesh.visible = false;
  }

  // Néons du faux plafond. Les plans émissifs ne portent pas de lumière :
  // il faut de vraies sources en face, dont l'intensité suit l'heure.
  appliquerEclairage(facteur) {
    if (!this.lampes) {
      this.lampes = [];
      const pos = [
        [-14, -9], [-14, 3], [-8, -9], [-8, 3], [-2, -9], [-2, 3],
        [8, -10], [8, -2], [8, 6], [16, -10], [16, 11], [16, 1.5], [8, 12.5],
      ];
      for (const [x, z] of pos) {
        const l = new THREE.PointLight(0xf0f2eb, 7, 13, 2);
        l.position.set(x, x === 8 ? 3.20 : 3.02, z);
        l.userData.base = 7;
        this.scene.add(l);
        this.lampes.push(l);
      }
      // rebond chaud au ras du sol côté baie
      for (const z of [-11, -3, 5, 12]) {
        const l = new THREE.PointLight(0xffbf84, 2.4, 16, 2);
        l.position.set(-17.5, 0.55, z);
        l.userData.base = 2.4;
        this.scene.add(l);
        this.lampes.push(l);
      }
    }
    // un néon sur deux s'éteint quand l'étage passe en veille
    this.lampes.forEach((l, i) => {
      const eteint = facteur < 0.75 && i % 2 === 1;
      l.intensity = eteint ? 0 : l.userData.base * Math.max(facteur, 0.35);
    });
  }

  majLumieresObjets() {
    this.lumieresObjets.forEach((l, i) => {
      const o = this.level.ramassables[i];
      l.intensity = o && !o.pris ? 0.65 : 0;
      if (o) l.position.set(o.x, o.y+.22, o.z);
    });
  }

  // ---------------------------------------------------------- modes
  lancerCampagne(index) {
    this.mode = 'campagne';
    this.srTemps = 0;
    this.srSplits = [];
    this.demarrerNiveau(index);
  }

  lancerSpeedrun(index) {
    this.mode = 'speedrun';
    this.srTemps = 0;
    this.srSplits = [];
    this.srDepart = index;
    this.demarrerNiveau(index);
  }

  async demarrerNiveau(index) {
    if (this.state === 'loading') return;
    clearTimeout(this.transitionAuto);
    this.audio.start();
    for (const e of EMOTES) if (e.son) this.audio.chargerSon(e.son.fichier);
    if (index === this.niveauIndex && this.level && this.state !== 'load-error') { this.rejouerNiveau(); return; }
    this.state = 'loading';
    this.fermerRoue(false);
    this.input.clear();
    document.exitPointerLock?.();
    this.ui.show(null);
    this.ui.loading(NIVEAUX[index].titre);
    const debut = performance.now();
    // Un retour au menu pendant le chargement (coéquipier déconnecté) l'annule.
    const jeton = this.jetonChargement = (this.jetonChargement || 0) + 1;
    const annule = () => this.jetonChargement !== jeton;
    try {
      // Le voile doit être peint avant la construction CPU. Tant qu'il est
      // affiché, frame() laisse le GPU préparer les shaders sans les utiliser.
      await respirer();
      if (annule()) return;
      this.chargerNiveau(index);
      this.ui.loading(NIVEAUX[index].titre, 'Préparation de l’étage…');
      await respirer();
      await this.renderer.compileAsync(this.scene, this.camera);
      if (annule()) return;
      this.derniereTransition = { index, ms: performance.now() - debut };
      this.rejouerNiveau();
    } catch (err) {
      console.error('Chargement du niveau ' + (index + 1), err);
      this.state = 'load-error';
      this.input.clear();
      this.ui.erreurChargement(() => this.demarrerNiveau(index));
    }
  }

  // Remet le niveau courant à zéro sans reconstruire la géométrie.
  rejouerNiveau() {
    clearTimeout(this.transitionAuto);
    const niv = this.niveau;
    this.fermerRoue(false);
    this.player.reset();
    this.player.animate(0);
    this.player.setOutline(0);
    this._wasHot = false; this._panic = false; this.secousse = 0;
    this.level.escalier.door.rotation.y = 0;
    for (const d of this.level.elevatorPanels) d.position.z = 1.5 + d.userData.side * 0.73;
    for (const n of this.npcs) { n.reset(); n.updateVisuals(0, this); }
    for (const o of this.level.ramassables) { o.pris = false; o.group.visible = true; }
    this.majLumieresObjets();
    this.preparation = true;
    this.apprentissage = this.niveauIndex === 0 && this.mode === 'campagne' ? 0 : null;
    if (this.mode === 'multi') {
      this.apprentissage = null;
      this.multi.sortiLocal = false; this.multi.sortiDistant = false;
      this.multi.monde = null; this.multi.etatDistant = null;
      this.player.mesh.visible = true;
      if (this.coequipier) { this.coequipier.reset(); this.coequipier.mesh.visible = false; }
      if (this.multi.invite) this.multi.envoyer({ t: 'pret', index: this.niveauIndex });
    }
    this.apprentissageT = 0;
    for (const it of this.actionsBureau) {
      it.utilise = false; it.restant = it.type === 'travail' ? DUREE_TRAVAIL : 0; it.bruitT = 1.4;
      it.marker.visible = false;
    }
    this.ui.setThreats([], this.player, this.camera, this.camYaw);
    this.elapsed = 0;
    this.timeLeft = niv.limite;
    this.hunting = !!niv.chasseDebut;
    this.nearMisses = 0;
    this.exitSeq = null;
    this.input.clear();
    this.input.bascules = {};
    this.camYaw = Math.PI;
    this.camPitch = 0.30;
    this.camVise = null; this.camDistLisse = undefined;
    this.state = 'play';
    this.updateCamera(1, true);
    this.clock?.getDelta();
    this.fpsFenetre = [];
    this.ui.loading(null);
    document.querySelector('#mission .cn').textContent = niv.titre;
    document.querySelector('#mission .fr').textContent = 'Quitter l’étage sans se faire repérer';
    this.repliFait = false;
    this.ui.show(null);
    this.ui.setDetection(0);
    this.ui.setBars(0, 1, false);
    this.ui.setTimer(this.timeLeft, this.hunting);
    this.ui.setClock(formatClock(0, niv.heure));
    this.ui.setState('Repérage des lieux', 'ok');
    this.ui.setPrompt(''); this.ui.setExit(null);
    this.ui.toastT = 0; this.ui.el.toast.style.opacity = 0;
    this.ui.el.flash.style.opacity = 0;
    this.majObjectifs();
    document.getElementById('chrono-sr').classList.toggle('on', this.mode === 'speedrun');
    this.ui.say(niv.titre, niv.sousTitre, 4.2);
    this.conseilT = 4.6;
    lockPointer(this.renderer.domElement);
  }

  majObjectifs() {
    const liste = document.getElementById('objectifs-liste');
    const boite = document.getElementById('objectifs');
    const objets = this.level.ramassables;
    boite.classList.toggle('on', this.state === 'play');
    liste.innerHTML = objets.map(o =>
      `<li class="${o.pris ? 'ok' : 'objet'}"><i>${o.pris ? '✓' : '◆'}</i>Récupérer ${o.nom}</li>`
    ).join('') + `<li><i>○</i>Atteindre une sortie</li>`;
  }

  objetsRestants() { return this.level.ramassables.filter(o => !o.pris); }

  // Objectif ramassé ici ou par le coéquipier (multijoueur : objets partagés).
  ramasserObjet(i, distant = false) {
    const o = this.level.ramassables[i];
    if (!o || o.pris) return;
    o.pris = true;
    o.group.visible = false;
    this.majLumieresObjets();
    this.audio.ding();
    this.ui.toast((distant ? (this.multi.nomDistant || 'Ton coéquipier') + ' a récupéré ' : 'Récupéré : ') + o.nom,
      this.objetsRestants().length ? 'Il en reste ' + this.objetsRestants().length : 'Vous pouvez sortir.');
    this.majObjectifs();
    if (!distant) this.multi.envoyer({ t: 'objet', id: i });
  }

  // ---------------------------------------------------------- roue d'emotes
  //
  // Maintenir la touche ouvre la roue ; la souris pilote la sélection
  // (pas la caméra, sinon on viserait et choisirait en même temps) ;
  // relâcher lance l'emote. Le jeu continue de tourner derrière : c'est
  // un jeu d'infiltration, mettre en pause tuerait la tension.
  construireRoue() {
    const disque = document.getElementById('roue-disque');
    const R = 150;
    document.getElementById('roue-note').textContent = `Souris ou 1–${EMOTES.length} · Relâche pour jouer · Centre ou Échap pour annuler`;
    this.roueCases = EMOTES.map((e, i) => {
      const a = -Math.PI / 2 + (i / EMOTES.length) * Math.PI * 2;
      const el = document.createElement('div');
      el.className = 'roue-case';
      el.setAttribute('aria-label', `${i + 1}. ${e.nom}`);
      el.style.left = `${215 + Math.cos(a) * R}px`;
      el.style.top = `${215 + Math.sin(a) * R}px`;
      el.innerHTML = `<small class="raccourci">${i + 1}</small><div class="ic">${e.icone}</div><div class="nm">${e.nom}</div>`;
      disque.appendChild(el);
      return el;
    });
    this.roueSel = -1;
    this.majRoue(true);
  }

  ouvrirRoue() {
    if (this.roueOuverte || this.state !== 'play') return;
    if (this.preparation || this.exitSeq) return;
    this.roueOuverte = true;
    this.roueSel = -1;
    this.roueVec = { x: 0, y: 0 };
    document.getElementById('roue-pointeur').style.transform = 'translate(0, 0)';
    document.getElementById('roue').classList.add('on');
    document.body.classList.add('roue-active');
    this.majRoue(true);
  }

  // Direction accumulée de la souris -> secteur. Une zone morte évite
  // que le curseur saute d'une case à l'autre au moindre frémissement.
  bougerRoue(dx, dy) {
    if (!this.roueOuverte) return;
    this.roueVec.x = THREE.MathUtils.clamp(this.roueVec.x + dx, -260, 260);
    this.roueVec.y = THREE.MathUtils.clamp(this.roueVec.y + dy, -260, 260);
    const d = Math.hypot(this.roueVec.x, this.roueVec.y);
    document.getElementById('roue-pointeur').style.transform =
      `translate(${this.roueVec.x * 0.63}px, ${this.roueVec.y * 0.63}px)`;
    if (d < 42) { this.roueSel = -1; this.majRoue(); return; }
    const a = Math.atan2(this.roueVec.y, this.roueVec.x) + Math.PI / 2;
    const n = EMOTES.length;
    const i = ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
    if (i !== this.roueSel) { this.roueSel = i; this.majRoue(); }
  }

  majRoue(silencieux = false) {
    if (!this.roueCases) return;
    this.roueCases.forEach((el, i) => el.classList.toggle('sel', i === this.roueSel));
    const e = EMOTES[this.roueSel];
    document.querySelector('#roue-centre .t').textContent = e?.nom || 'La pause de Lao D';
    document.querySelector('#roue-centre .a').textContent = e ? e.astuce + ` · ${e.duree} s` : 'Choisis un geste avec la souris.';
    document.querySelector('#roue-centre .h').textContent = e ? 'Relâche pour jouer · Bouge pour arrêter' : 'Au centre : annuler';
  }

  fermerRoue(lancer) {
    if (!this.roueOuverte) return;
    this.roueOuverte = false;
    document.getElementById('roue').classList.remove('on');
    document.body.classList.remove('roue-active');
    if (!lancer || this.roueSel < 0) return;
    const def = this.player.declencherEmote(this.roueSel);
    if (def) this.reagirEmote(def);
  }

  // ---------------------------------------------------------- entrées
  bindInput() {
    const canvas = this.renderer.domElement;
    const I = this.input;

    addEventListener('keydown', e => {
      if (e.defaultPrevented || this.menu?.ecoute) return;
      if (e.code === 'Escape' && !e.repeat) {
        e.preventDefault();
        if (this.roueOuverte) { this.fermerRoue(false); return; }
        if (this.menu?.depuisPause) {
          this.menu.depuisPause = false;
          this.ui.show('pause');
        } else if (this.state === 'play') this.pause();
        else if (this.state === 'pause') this.resume();
        else if (this.state === 'menu') this.menu.ouvrir('menu-principal');
        return;
      }
      if (this.state !== 'play') {
        if (this.state === 'over' && I.correspond('recommencer', e.code)) this.rejouerNiveau();
        return;
      }
      if (e.repeat) return;
      if (this.roueOuverte && /^(Digit|Numpad)[1-9]$/.test(e.code)) {
        const index = Number(e.code.at(-1)) - 1;
        if (index < EMOTES.length) { this.roueSel = index; this.majRoue(); }
        e.preventDefault(); return;
      }
      I.add(e.code);
      if (I.correspond('accroupirBascule', e.code)) I.bascules.accroupir = !I.bascules.accroupir;
      if (I.correspond('interagir', e.code)) this.tryInteract();
      if (I.correspond('emote', e.code)) this.ouvrirRoue();
      if (I.correspond('cones', e.code)) {
        this.showCones = !this.showCones;
        this.etat.options.cones = this.showCones; this.sauver();
      }
      if (I.correspond('noms', e.code)) {
        this.showLabels = !this.showLabels;
        this.etat.options.noms = this.showLabels; this.sauver();
      }
      if (I.correspond('son', e.code)) {
        this.etat.options.son = !this.etat.options.son;
        this.audio.setMuted(!this.etat.options.son); this.sauver();
      }
      if (I.correspond('recommencer', e.code) && this.state !== 'menu') this.rejouerNiveau();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
    });
    addEventListener('keyup', e => {
      I.delete(e.code);
      if (I.correspond('emote', e.code)) this.fermerRoue(true);
    });
    addEventListener('blur', () => {
      I.clear();
      if (this.state === 'play') this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') this.pause();
    });
    document.addEventListener('pointerlockchange', () => {
      const verrouille = document.pointerLockElement === canvas;
      if (this.pointerEtaitVerrouille && !verrouille && this.state === 'play') this.pause();
      this.pointerEtaitVerrouille = verrouille;
    });

    canvas.addEventListener('click', () => {
      if (this.state === 'play' && document.pointerLockElement !== canvas) lockPointer(canvas);
    });
    addEventListener('mousemove', e => {
      if (this.state !== 'play' || document.pointerLockElement !== canvas) return;
      if (this.roueOuverte) { this.bougerRoue(e.movementX, e.movementY); return; }
      const sensibilite = this.etat.options.sensibilite;
      this.camYaw -= e.movementX * 0.0026 * sensibilite;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + e.movementY * 0.0021 * sensibilite, -0.22, 0.85);
    });
    addEventListener('wheel', e => {
      if (this.state !== 'play' || this.roueOuverte) return;
      this.camDist = THREE.MathUtils.clamp((this.camDist ?? 4.4) + e.deltaY * 0.004, 2.6, 8.0);
    }, { passive: true });

    document.getElementById('btn-guide').onclick = () => {
      this.apprentissage = null; this.ui.setGuide('', '', ''); this.resume();
    };
    const multi = () => this.mode === 'multi';
    document.getElementById('btn-retry').onclick = () => {
      if (!multi()) return this.rejouerNiveau();
      if (this.multi.hote) this.lancerMulti(this.niveauIndex);
      else this.ui.toast('C’est l’hôte qui relance', 'Attends sa décision.');
    };
    document.getElementById('btn-again').onclick = () => { if (multi()) return this.retourMenuMulti(); this.state = 'menu'; this.menu.afficher(); };
    document.getElementById('btn-fail-menu').onclick = () => { if (multi()) return this.retourMenuMulti(); this.state = 'menu'; this.menu.afficher(); };
    document.getElementById('btn-pause-options').onclick = () => { this.menu.depuisPause = true; this.ui.show('start'); this.menu.ouvrir('menu-options'); };
    document.getElementById('btn-resume').onclick = () => this.resume();
    document.getElementById('btn-quit').onclick = () => { if (multi()) return this.retourMenuMulti(); this.state = 'menu'; this.menu.afficher(); };
    document.getElementById('btn-suite-menu').onclick = () => { if (multi()) return this.retourMenuMulti(); this.state = 'menu'; this.menu.afficher(); };
    document.getElementById('btn-suivant').onclick = () => {
      const suivant = this.niveauIndex + 1;
      if (multi()) {
        if (!this.multi.hote) return;
        return suivant < NIVEAUX.length ? this.lancerMulti(suivant) : this.retourMenuMulti();
      }
      if (suivant < NIVEAUX.length) this.demarrerNiveau(suivant);
      else { this.state = 'menu'; this.menu.afficher(); }
    };
  }

  pause(distant = false) {
    if (this.state !== 'play') return;
    if (this.mode === 'multi' && !distant) this.multi.envoyer({ t: 'pause' });
    this.input.clear();
    this.fermerRoue(false);
    this.state = 'pause';
    document.getElementById('btn-guide').hidden = this.apprentissage == null;
    this.ui.show('pause');
    document.exitPointerLock?.();
  }
  resume(distant = false) {
    if (this.mode === 'multi' && !distant) this.multi.envoyer({ t: 'reprise' });
    this.state = 'play';
    this.ui.show(null);
    this.input.clear();
    this.clock.getDelta();
    this.majObjectifs();
    lockPointer(this.renderer.domElement);
  }

  // Lao D fait le con. Les collègues qui le voient s'en aperçoivent —
  // modérément : l'emote doit rester un plaisir, pas une punition. Il
  // en faut trois dans le champ de vision pour déclencher l'observation.
  reagirEmote(def, acteur = this.player) {
    if (acteur === this.player) this.ui.toast(def.nom, 'En plein open space.');
    if (this.mode === 'multi' && this.multi.invite && acteur === this.player) {
      this.multi.envoyer({ t: 'emote', index: EMOTES.indexOf(def) }); return;
    }
    if (!acteur) return;
    const p = acteur.pos;
    let temoins = 0;
    for (const n of this.npcs) {
      const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
      if (d > 12) continue;
      const vu = mesurerVue(n, acteur, this.level.obstacles).visible;
      if (vu) {
        // assez pour passer en « doute » (0,22) d'un seul coup : le
        // collègue tourne la tête. Il en faut deux pour l'observation.
        n.suspicion = Math.min(0.95, n.suspicion + 0.26 * (1 - d / 16));
        n.sursaut = 1.4;
        n.lastSeen.set(p.x, 0, p.z);
        temoins++;
        if (Math.random() < 0.65)
          n.say(reactionEmote(n, def), 2.4);
      }
    }
    this.temoinsEmote = temoins;
  }

  // ---------------------------------------------------------- interaction
  // Hôte : action déclenchée par l'invité.
  actionDistante(id) {
    if (id === 'ascenseur') { this.boss.suspicion = Math.min(0.9, this.boss.suspicion + 0.14); return; }
    const it = this.actionsBureau[id];
    if (it && it.type === 'diversion' && !it.utilise) lancerDiversion(it, this.npcs, this.audio, this.hunting);
  }

  // Multijoueur : l'hôte choisit l'étage, l'invité suit.
  lancerMulti(index) {
    this.mode = 'multi';
    if (this.multi.hote) { this.multi.pretIndex = null; this.multi.envoyer({ t: 'lancer', index }); }
    this.niveauIndex = -1;  // chargement complet : coéquipier, départs, répliques relayées
    this.demarrerNiveau(index);
  }
  coequipierParti(raison) {
    if (this.mode !== 'multi') { this.menu?.majMulti?.(); return; }
    this.ui.toast('Coéquipier déconnecté', raison || 'La partie à deux est terminée.', 5);
    this.retourMenuMulti(true);
  }
  retourMenuMulti(distant = false) {
    if (!distant) this.multi.envoyer({ t: 'menu' });
    this.jetonChargement = (this.jetonChargement || 0) + 1;  // annule un chargement en cours
    this.ui.loading(null);
    this.fermerRoue(false);
    document.exitPointerLock?.();
    this.state = 'menu'; this.mode = 'campagne';
    if (this.coequipier) this.coequipier.mesh.visible = false;
    this.menu.afficher(); this.menu.ouvrir('menu-multi'); this.menu.majMulti?.();
  }

  nearestInteractable() {
    if (this.player.working) return this.player.working;
    return [...this.actionsBureau, ...this.level.interactables]
      .filter(it => actionAccessible(it, this.player, this.level.obstacles))
      .sort((a, b) => Math.hypot(a.x-this.player.pos.x, a.z-this.player.pos.z)
        - Math.hypot(b.x-this.player.pos.x, b.z-this.player.pos.z))[0] || null;
  }

  tryInteract() {
    if (this.state !== 'play' || this.exitSeq || this.preparation || this.roueOuverte) return;
    const it = this.nearestInteractable();
    if (!it) return;
    if (it.type === 'diversion') {
      if (it.utilise) { this.ui.toast('Bac à papier vide', 'Une diversion par étage.'); return; }
      if (this.mode === 'multi' && this.multi.invite) {
        it.utilise = true; this.multi.envoyer({ t: 'action', id: this.actionsBureau.indexOf(it) });
        this.audio.impression(it.source);
        this.ui.toast('200 photocopies lancées', 'Les collègues proches regardent la machine · 6 s'); return;
      }
      const n = lancerDiversion(it, this.npcs, this.audio, this.hunting);
      this.ui.toast('200 photocopies lancées', n ? `${n} collègue${n > 1 ? 's' : ''} regarde la machine · 6 s`
        : 'Personne à portée. Le bac est maintenant vide.');
      return;
    }
    if (it.type === 'travail') {
      if (this.player.working) { this.player.working = null; return; }
      if (it.restant <= 0) { this.ui.toast('La comédie a assez duré', 'Essaie un autre poste.'); return; }
      this.player.working = it; this.player.workT = 0;
      this.player.pos.set(it.x, 0, it.z); this.player.yaw = it.yaw;
      this.player.vel.set(0, 0, 0); this.player.emote = null;
      this.input.bascules.accroupir = false;
      this.ui.toast('Très occupé. Absolument.', `${Math.ceil(it.restant)} s de protection, même face au boss. Ce temps ne se recharge pas.`);
      return;
    }
    const manque = this.objetsRestants();
    if (manque.length) {
      this.ui.toast('Il te manque ' + manque[0].nom, 'Pas question de partir sans.');
      this.audio.blip();
      return;
    }
    if (it.id === 'elevator') {
      this.exitSeq = { id: 'elevator', t: 3.4, total: 3.4 };
      this.ui.say("L'ascenseur monte…", 'Ne bouge pas.', 3.4);
      this.audio.blip();
      // le « ding » attire l'attention : le boss lève la tête
      if (this.mode === 'multi' && this.multi.invite) this.multi.envoyer({ t: 'action', id: 'ascenseur' });
      else this.boss.suspicion = Math.min(0.9, this.boss.suspicion + 0.14);
    } else {
      this.exitSeq = { id: 'stairs', t: 1.3, total: 1.3 };
      this.ui.say('Les escaliers', 'Plus long, mais plus sûr.', 1.5);
      this.audio.door();
    }
  }

  // ---------------------------------------------------------- boucle
  frame() {
    const brut = this.clock.getDelta();
    // Musique d’emote : seulement en jeu, jamais pendant une pause ou une sortie en fondu.
    const e = this.player?.emote;
    this.audio.suivreMusique(this.state === 'play' && e && !e.coupee ? e : null);
    if (this.state === 'loading' || this.state === 'load-error') return;
    // On conserve le temps écoulé lors d'un ralentissement court et on
    // le découpe en pas sûrs. Les gels de plus de 250 ms restent bornés.
    const dt = Math.min(0.25, brut);
    this.fpsFenetre = (this.fpsFenetre || []);
    this.fpsFenetre.push(brut);
    if (this.fpsFenetre.length > 90) this.fpsFenetre.shift();
    this.fps = this.fpsFenetre.length /
      this.fpsFenetre.reduce((a, b) => a + b, 0.0001);
    this.imagesRendues = (this.imagesRendues || 0) + 1;

    // Garde-fou : sous 24 images/s, on réduit les passes GPU d'un cran.
    // On laisse 5 s au moteur pour compiler ses shaders : les premières
    // images sont toujours lentes et déclencheraient un repli à tort.
    if (this.state === 'play' && !this.repliFait && this.elapsed > 5 &&
        this.fpsFenetre.length >= 90 && this.fps < 24 && this.qualite !== 'bas') {
      this.repliFait = true;
      const i = R.QUALITES.indexOf(this.qualite);
      this.setQualite(R.QUALITES[Math.min(i + 1, R.QUALITES.length - 1)]);
    }

    // léger travelling derrière les menus : la scène reste vivante
    if (this.state === 'menu') this.camYaw += dt * 0.055;
    if (this.state === 'play') {
      const pas = Math.max(1, Math.ceil(dt / (1 / 60)));
      for (let i = 0; i < pas && this.state === 'play'; i++) this.step(dt / pas);
    }
    this.ui.update(dt);
    this.updateCamera(dt, this.state === 'play');
    this.ui.setObjectives(this.state === 'play' && !this.roueOuverte ? this.level.ramassables : [], this.player, this.camera);
    this.ui.setThreats(this.state === 'play' && !this.preparation ? this.npcs : [], this.player, this.camera, this.camYaw);
    // 20 Hz suffisent pour une carte de 214 px : la redessiner à chaque
    // image, c'est du travail canvas pur perdu.
    this.carteT = (this.carteT || 0) - dt;
    if (this.carteT <= 0) { this.carteT = 0.05; this.minimap.draw(this); }

    // profondeur de champ : mise au point sur le joueur
    if (this.post?.bokeh) {
      const d = this.camera.position.distanceTo(this.player.mesh.position);
      const u = this.post.bokeh.materialBokeh.uniforms;
      u.focus.value += (d - u.focus.value) * (1 - Math.exp(-4 * dt));
    }
    if (this.post.composer) this.post.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  step(dt) {
    const multi = this.mode === 'multi' && this.multi.actif ? this.multi : null;
    if (multi) { multi.animerCoequipier(dt); if (!multi.sortiLocal) multi.envoyerJoueur(dt); }
    // Multijoueur : on démarre ensemble. L'hôte attend que l'invité ait chargé
    // l'étage ; l'invité attend le premier état du monde de l'hôte.
    if (this.preparation && multi) {
      if (multi.hote ? multi.pretIndex === this.niveauIndex : multi.monde) { this.preparation = false; this.ui.setGuide('', '', ''); }
      else {
        this.ui.setGuide('Multijoueur', `En attente de ${multi.nomDistant || 'ton coéquipier'}…`, 'La partie démarre dès que vous êtes prêts tous les deux');
        return;
      }
    }
    // On peut lire et orienter la caméra sans subir une ronde pendant le briefing.
    if (this.preparation) {
      this.ui.setGuide('Avant de filer', `${this.niveau.conseil} Les ombres ne cachent pas.`,
        'Bouge pour commencer · chrono et collègues en attente');
      this.ui.setState('Repérage des lieux', 'ok');
      this.ui.setTimer(this.timeLeft, this.hunting);
      this.ui.setClock(formatClock(0, this.niveau.heure));
      if (!['avancer', 'reculer', 'gauche', 'droite'].some(a => this.input.actif(a))) return;
      this.preparation = false;
      this.ui.setGuide('', '', '');
    }
    this.audio.listen(this.player.pos, this.camYaw);
    this.elapsed += dt;
    if (this.conseilT > 0) {
      this.conseilT -= dt;
      if (this.conseilT <= 0) this.ui.toast('Conseil', this.niveau.conseil, 4);
    }

    // compte à rebours de la réunion (chez l'invité, c'est l'hôte qui décide)
    if (!this.hunting && !multi?.invite) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.hunting = true;
        this.ui.flash();
        this.ui.say('La réunion est finie', 'Le directeur Wang te cherche.', 4);
        this.boss.say('Où est passé Lao D ?', 3);
      }
    }
    this.ui.setTimer(Math.max(0, this.timeLeft), this.hunting);
    this.ui.setClock(formatClock(this.elapsed, this.niveau.heure));
    if (this.mode === 'speedrun')
      document.getElementById('chrono-sr').textContent =
        formaterTemps(this.srTemps + this.elapsed);

    // ramassage des objectifs
    for (const o of this.level.ramassables) {
      if (o.pris) continue;
      // Le véritable objet reste posé sur son meuble ; seul le repère respire.
      o.halo.scale.setScalar(1 + Math.sin(performance.now() * 0.004) * 0.12);
      if (!multi?.sortiLocal && Math.hypot(o.x - this.player.pos.x, o.z - this.player.pos.z) < 1.25)
        this.ramasserObjet(this.level.ramassables.indexOf(o));
    }

    if (!multi?.sortiLocal) this.player.update(dt, this.input, this.camYaw);
    const travail = avancerTravail(this.player, dt);
    const protege = travailProtege(this.player);
    if (travail === 'avertir') this.ui.toast('Encore 3 secondes de protection', 'Prépare ton prochain abri.');
    else if (travail === 'expire') this.ui.toast('Ce poste ne fait plus illusion', 'Protection terminée. Rejoins un autre abri.');

    // stress au max : on souffle bruyamment, tout le monde entend
    if (!protege && this.player.stress >= 0.999 && !this._panic) {
      this._panic = true;
      this.audio.noiseHit({ dur: 0.4, vol: 0.1, freq: 500, q: 0.7 });
      for (const n of this.npcs) {
        const d = Math.hypot(n.pos.x - this.player.pos.x, n.pos.z - this.player.pos.z);
        if (d < 7) n.suspicion = Math.min(0.95, n.suspicion + 0.3);
      }
      this.ui.toast('Tu souffles trop fort', 'On t’a entendu.');
    }
    if (this.player.stress < 0.6) this._panic = false;

    // PNJ
    let maxSus = 0, who = null, caught = null;
    if (multi) {
      // chez l'hôte, les collègues perçoivent les deux joueurs encore dans l'étage
      this.joueurs = [];
      if (!multi.sortiLocal) this.joueurs.push(this.player);
      if (this.coequipier && multi.etatDistant && !multi.sortiDistant) this.joueurs.push(this.coequipier);
      if (!this.joueurs.length) this.joueurs.push(this.player);
    } else this.joueurs = null;
    if (multi?.invite) {
      multi.appliquerMonde(dt);
      for (const n of this.npcs) if (n.suspicion > maxSus) { maxSus = n.suspicion; who = n; }
    } else for (const n of this.npcs) {
      n.update(dt, this);
      if (n.suspicion > maxSus) { maxSus = n.suspicion; who = n; }
      if (n.state === 'repere') caught = n;
    }
    if (multi?.hote) multi.envoyerMonde(dt);

    // frôlements
    const hot = !protege && maxSus > 0.55;
    if (hot && !this._wasHot) this.nearMisses++;
    this._wasHot = hot;

    const rang = { travail: 0, doute: 1, observation: 2, repere: 3 };
    let pire = 'travail';
    for (const n of this.npcs) if (rang[n.state] > rang[pire]) pire = n.state;
    this.ui.setDetection(maxSus, who ? who.name : '', pire, who?.sawThisFrame, who?.heardThisFrame,
      protege ? this.player.working.restant : null);
    this.visibilite = bilanVisibilite(this.npcs);
    this.player.inCover = !this.visibilite.visible && this.visibilite.masque;

    // --- vie de bureau : bruits ponctuels, décorrélés du joueur ---
    this.ambianceT = (this.ambianceT ?? 4) - dt;
    if (this.ambianceT <= 0) {
      this.ambianceT = 7 + Math.random() * 13;
      const evts = ['impression', 'telephone', 'cafe', 'porteLointaine'];
      const sources = [{ x: -18.4, z: -14.5 }, this.npcs.find(n => n.isSeatedNow)?.pos,
        { x: 16.6, z: -1.6 }, { x: 8, z: 13 }];
      const choix = (Math.random() * evts.length) | 0;
      this.audio[evts[choix]](sources[choix]);
    }
    // les écrans respirent légèrement : un bureau n'est jamais figé
    this.scintilleT = (this.scintilleT ?? 0) - dt;
    if (this.scintilleT <= 0 && this.level.emissifs.length) {
      this.scintilleT = 0.12;
      const e = this.level.emissifs[(Math.random() * this.level.emissifs.length) | 0];
      if (e.material) e.material.opacity = 1;
    }
    this.ui.setBars(this.player.stress, this.player.stamina, this.player.epuise);

    const v = this.visibilite;
    const posture = this.player.crouch > 0.5 ? 'Accroupi' : this.player.running ? 'Course' : this.player.moving ? 'Marche' : 'Immobile';
    if (protege) this.ui.setState(`Au travail · Protégé · ${Math.ceil(this.player.working.restant)} s`,
      this.player.working.restant <= ALERTE_TRAVAIL ? 'warning' : 'good');
    else this.ui.setState(`${posture} · ${v.visible ? 'Visible' : v.entendu ? 'Entendu' : 'Hors des regards'}`,
      v.visible || v.entendu ? 'bad' : 'good');

    let nearest = null, distance = Infinity;
    for (const n of this.npcs) if (n.isSeatedNow) {
      const d = n.pos.distanceTo(this.player.pos);
      if (d < distance) { distance = d; nearest = n.pos; }
    }
    this.audio.update(dt, this.player.working ? this.player.pos : nearest);
    for (const it of this.actionsBureau) {
      it.marker.visible = !it.utilise && (it.type !== 'travail' || it.restant > 0) && this.player.working !== it && Math.hypot(it.x-this.player.pos.x, it.z-this.player.pos.z) < 6
        && actionAccessible({ ...it, r: 6 }, this.player, this.level.obstacles);
      if (it.type === 'diversion' && it.restant > 0) {
        it.restant = Math.max(0, it.restant - dt); it.bruitT = (it.bruitT ?? 1.4) - dt;
        if (it.bruitT <= 0 && it.restant > 0.8) { it.bruitT = 1.4; this.audio.impression(it.source); }
      }
    }
    this.majApprentissage(dt);

    this.player.setOutline(protege ? 0 : maxSus);

    if (caught) { this.lose(caught); return; }
    this.verifierSortieMulti();
    if (this.state !== 'play') return;
    // séquence de sortie
    if (this.exitSeq) {
      this.exitSeq.t -= dt;
      if (this.exitSeq.id === 'elevator') {
        const open = 1 - Math.min(1, this.exitSeq.t / 0.9);
        for (const d of this.level.elevatorPanels)
          d.position.z = 1.5 + d.userData.side * (0.73 + open * 0.68);
        if (this.exitSeq.t < 0.9 && !this.exitSeq.dinged) {
          this.exitSeq.dinged = true;
          this.audio.ding();
        }
      }
      if (this.exitSeq.id === 'stairs') this.level.escalier.door.rotation.y = -Math.min(1,(this.exitSeq.total-this.exitSeq.t)/.65)*1.35;
      this.player.exitPose = { id: this.exitSeq.id, progress: Math.max(0, 1-this.exitSeq.t/0.65) };
      if (this.exitSeq.t <= 0) {
        if (!multi) return this.terminerNiveau(this.exitSeq.id);
        multi.sortiLocal = true; multi.routeSortie = this.exitSeq.id;
        this.exitSeq = null; this.player.exitPose = null; this.player.mesh.visible = false;
        multi.envoiT = 0; multi.envoyerJoueur(0);
        this.ui.say('Tu es sorti', `Attends ${multi.nomDistant || 'ton coéquipier'}… ou regarde-le faire.`, 4);
      }
      // on doit rester près du point de sortie
      const it = this.level.interactables.find(i => i.id === this.exitSeq.id);
      if (Math.hypot(it.x - this.player.pos.x, it.z - this.player.pos.z) > it.r + 1.2) {
        this.exitSeq = null; this.player.exitPose = null;
        this.level.escalier.door.rotation.y = 0;
        this.ui.toast('Tu t’es éloigné', 'Recommence.');
      }
    }

    // prompt d'interaction
    const it = this.exitSeq ? null : this.nearestInteractable();
    const manque = this.objetsRestants();
    const label = it?.type === 'diversion' && it.utilise ? 'Bac à papier vide'
      : it?.type === 'travail' ? (this.player.working ? 'Quitter le poste'
        : it.restant > 0 ? `${it.label} · ${Math.ceil(it.restant)} s` : 'Protection épuisée pour cet étage') : it?.label;
    this.ui.setPrompt(it ? (!it.type && manque.length ? `Récupère ${manque[0].nom} avant de partir`
      : `<kbd>${this.touche('interagir')}</kbd> ${label}`) : '');
    this.ui.setExit(this.exitSeq);

    if (caught) this.lose(caught);
  }

  // Multijoueur (hôte) : victoire quand les deux sont sortis.
  verifierSortieMulti() {
    const m = this.multi;
    if (this.mode === 'multi' && m.hote && m.sortiLocal && m.sortiDistant && this.state === 'play') {
      m.envoyer({ t: 'gagne', route: m.routeSortie || 'stairs' });
      this.terminerNiveau(m.routeSortie || 'stairs');
    }
  }

  majApprentissage(dt) {
    if (this.apprentissage == null) return;
    const p = this.player;
    if (this.apprentissage === 0 && p.pos.distanceTo(new THREE.Vector3(this.level.playerStart.x,0,this.level.playerStart.z)) > 1.2)
      this.apprentissage = 1;
    if (this.apprentissage === 1 && p.crouch > 0.8) this.apprentissage = 2;
    if (this.apprentissage === 2 && p.inCover) this.apprentissage = 3;
    const guides = [
      ['1 / 4 · Observer', 'Avance de quelques pas et repère les regards des collègues.', 'La caméra se dirige avec la souris.'],
      ['2 / 4 · Se baisser', `Accroupis-toi avec ${this.touche('accroupirBascule')}.`, 'Le haut du corps passe sous les cloisons.'],
      ['3 / 4 · Se cacher', 'Place un bureau ou une cloison entre toi et un collègue.', 'Le HUD indique la visibilité réelle. De près, ils remarquent aussi ce qui est derrière eux.'],
      ['4 / 4 · Jouer la comédie', `Approche un POSTE LIBRE et utilise ${this.touche('interagir')}.`, 'Puis rejoins la sortie. La photocopieuse offre aussi une diversion.'],
    ];
    if (p.working && this.apprentissage === 3) this.apprentissage = 4;
    // Guide facultatif : il accompagne la partie et ne bloque jamais la sortie.
    if (this.apprentissage === 4) {
      this.ui.setGuide('À toi de filer', 'Les ombres sont une ambiance. Les meubles coupent vraiment le regard.', 'Bonne évasion !');
      this.apprentissageT += dt;
      if (this.apprentissageT > 5) { this.apprentissage = null; this.ui.setGuide('', '', ''); }
    } else this.ui.setGuide(...guides[this.apprentissage]);
  }

  // ---------------------------------------------------------- caméra
  //
  // Trois ressorts distincts : le point visé, la distance et la position.
  // Le lacet reste piloté directement par la souris — y mettre de
  // l'inertie rendrait la visée molle, et on perdrait le contrôle.
  updateCamera(dt, follow) {
    const p = this.player;
    const distVoulue = this.camDist ?? 4.4;

    // over-the-shoulder : pivot décalé à droite, le personnage occupe
    // le tiers gauche du cadre
    const decal = 0.52;
    const rx = -Math.cos(this.camYaw), rz = Math.sin(this.camYaw);
    const vise = new THREE.Vector3(
      p.pos.x + rx * decal,
      THREE.MathUtils.lerp(1.5, 1.0, p.crouch),
      p.pos.z + rz * decal);

    // Le point visé est lissé à part : la caméra ne doit pas copier le
    // ballant vertical du personnage, sinon l'image tangue en marchant.
    if (!this.camVise) this.camVise = vise.clone();
    const kv = 1 - Math.exp(-(follow ? 16 : 3) * dt);
    this.camVise.lerp(vise, kv);

    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dir = new THREE.Vector3(
      -Math.sin(this.camYaw) * cp,
      Math.min(0.62, sp * 0.6 + 0.08),
      -Math.cos(this.camYaw) * cp).normalize();

    // Collision : on rentre d'un coup quand un mur s'interpose, on
    // ressort doucement. L'inverse produit des à-coups permanents dès
    // qu'on longe un meuble.
    const libre = distanceObstacle(this.level.obstacles, this.camVise, dir, distVoulue + 0.4);
    const limite = Math.max(1.15, Math.min(distVoulue, libre - 0.32));
    if (this.camDistLisse === undefined) this.camDistLisse = limite;
    this.camDistLisse = limite < this.camDistLisse
      ? limite
      : this.camDistLisse + (limite - this.camDistLisse) * (1 - Math.exp(-4.5 * dt));

    const voulue = this.camVise.clone().add(dir.clone().multiplyScalar(this.camDistLisse));
    voulue.y = THREE.MathUtils.clamp(voulue.y, 0.6, 3.02);

    const kp = 1 - Math.exp(-(follow ? 18 : 4) * dt);
    this.camera.position.lerp(voulue, kp);

    // Secousse : bruit entretenu plutôt qu'aléatoire par image, sinon
    // l'image scintille au lieu de trembler.
    if (this.etat.options.mouvementReduit) this.secousse = 0;
    if (this.secousse > 0.002) {
      const t = performance.now() * 0.001, a = this.secousse * 0.055;
      this.camera.position.x += Math.sin(t * 37) * a;
      this.camera.position.y += Math.sin(t * 29 + 1.7) * a * 0.7;
      this.secousse *= Math.exp(-6 * dt);
    } else this.secousse = 0;

    this.camera.lookAt(this.camVise);

    // Le champ s'ouvre légèrement en course : la vitesse se ressent
    // autant par le cadrage que par le déplacement.
    const fovVoulu = 52 + (this.etat.options.mouvementReduit ? 0 : (p.running ? 4.5 : 0) + (this.secousse || 0) * 2);
    if (Math.abs(this.camera.fov - fovVoulu) > 0.02) {
      this.camera.fov += (fovVoulu - this.camera.fov) * (1 - Math.exp(-5 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  // ---------------------------------------------------------- fins
  lose(npc) {
    if (this.state !== 'play') return;
    if (this.mode === 'multi' && this.multi.hote) this.multi.envoyer({ t: 'perdu', i: this.npcs.indexOf(npc) });
    this.fermerRoue(false);
    this.state = 'over';
    this.failCount++;
    document.exitPointerLock?.();
    this.ui.flash();
    this.player.setOutline(1);

    const line = npc.isBoss
      ? LIGNES_BOSS[(Math.random() * LIGNES_BOSS.length) | 0]
      : 'Lao D, le directeur te demande — « juste 5 minutes ».';
    document.getElementById('fail-who').textContent = `${npc.name} — ${npc.role}`;
    this.ui.el.failLine.innerHTML = `<b>« ${line} »</b>`;
    this.ui.el.failCount.textContent = this.failCount;
    this.ui.show('fail');
  }

  terminerNiveau(route) {
    if (this.state !== 'play') return;
    this.state = 'over';
    document.exitPointerLock?.();
    this.audio.success();
    if (this.mode === 'multi') {
      // Coopération : pas de records solo. L'hôte choisit la suite.
      const suivant = this.niveauIndex + 1, dernier = suivant >= NIVEAUX.length;
      document.getElementById('suite-titre').textContent = 'Sortis tous les deux !';
      document.getElementById('suite-sous').textContent = dernier ? 'Les 6 étages, à deux' : 'Prochain : ' + NIVEAUX[suivant].titre;
      document.getElementById('suite-stats').innerHTML = `<div class="splits">
        <div><span>Temps</span><b>${formaterTemps(this.elapsed)}</b></div>
        <div><span>Coéquipier</span><b>${this.multi.nomDistant || '—'}</b></div>
        <div><span>Frôlements</span><b>${this.nearMisses}</b></div></div>`;
      const b = document.getElementById('btn-suivant');
      b.textContent = this.multi.hote ? (dernier ? 'Retour au salon' : 'Étage suivant') : 'L’hôte choisit la suite…';
      b.disabled = !this.multi.hote;
      this.ui.show('suite');
      return;
    }
    document.getElementById('btn-suivant').disabled = false;
    const t = this.elapsed;
    const niv = this.niveau;
    const cle = 'n' + niv.id;

    // record personnel de l'étage
    const rec = this.etat.records[cle];
    const nouveauRecord = rec == null || t < rec;
    if (nouveauRecord) this.etat.records[cle] = +t.toFixed(1);
    if (!this.etat.niveauxFinis.includes(niv.id)) this.etat.niveauxFinis.push(niv.id);
    this.sauver();

    this.srSplits = this.srSplits || [];
    this.srTemps = this.srTemps || 0;
    this.srSplits.push({ id: niv.id, titre: niv.titre, t });
    this.srTemps += t;

    // En speedrun, on enchaîne directement sur l'étage suivant.
    if (this.mode === 'speedrun') {
      const suivant = this.niveauIndex + 1;
      if (suivant < NIVEAUX.length) {
        this.ui.flash();
        this.ui.toast('Étage franchi en ' + formaterTemps(t), 'On enchaîne.');
        this.transitionAuto = setTimeout(() => {
          if (this.state === 'over' && this.mode === 'speedrun' && this.niveauIndex === suivant - 1)
            this.demarrerNiveau(suivant);
        }, 700);
        return;
      }
      const total = this.srTemps;
      const recSr = this.etat.records.speedrun;
      const meilleur = recSr == null || total < recSr;
      if (meilleur) { this.etat.records.speedrun = +total.toFixed(1); this.sauver(); }
      document.getElementById('suite-titre').textContent = 'Speedrun terminé';
      document.getElementById('suite-sous').textContent =
        meilleur ? 'Nouveau meilleur temps !' : 'Les 6 étages, d’une traite';
      document.getElementById('suite-stats').innerHTML =
        `<div class="splits">` +
        this.srSplits.map(sp => `<div><span>${sp.titre}</span><b>${formaterTemps(sp.t)}</b></div>`).join('') +
        `<div><span><b>Total</b></span><b>${formaterTemps(total)}</b></div>` +
        (recSr != null ? `<div><span>Ancien record</span><b>${formaterTemps(recSr)}</b></div>` : '') +
        `</div>`;
      document.getElementById('btn-suivant').textContent = 'Retour au menu';
      this.ui.show('suite');
      return;
    }

    // Campagne : bilan de l'étage puis déblocage du suivant.
    const suivant = this.niveauIndex + 1;
    const dernier = suivant >= NIVEAUX.length;
    const routeTxt = route === 'elevator' ? 'Ascenseur' : 'Escaliers';
    const note = t < 45 ? 'S — Éclair' : t < 75 ? 'A — Propre' : t < 110 ? 'B — Ça passe' : 'C — De justesse';
    document.getElementById('suite-titre').textContent =
      dernier ? 'Tu as fait tous les étages' : 'Étage franchi';
    document.getElementById('suite-sous').textContent = dernier
      ? 'Plus personne pour te retenir'
      : NIVEAUX[suivant].titre + ' est débloqué';
    document.getElementById('suite-stats').innerHTML = `
      <div class="splits">
        <div><span>Temps</span><b>${formaterTemps(t)}</b></div>
        <div><span>Sortie</span><b>${routeTxt}</b></div>
        <div><span>Frôlements</span><b>${this.nearMisses}</b></div>
        <div><span>Note</span><b>${note}</b></div>
        <div><span>Record de l’étage</span><b>${formaterTemps(this.etat.records[cle])}${nouveauRecord ? ' ★' : ''}</b></div>
      </div>`;
    document.getElementById('btn-suivant').textContent =
      dernier ? 'Retour au menu' : 'Étage suivant';
    this.ui.show('suite');
  }
}

// Le verrouillage échoue si la page n'a pas le focus : on l'ignore sans bruit.
function lockPointer(el) {
  if (window.jeuTest) return;
  try { const r = el.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch {}
}

function formatClock(elapsed, depart = 18 * 3600) {
  const total = depart + Math.floor(elapsed);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// sonde de debug : window.__hasLOS(obstacles, oeil, cible)
// Journal d'erreurs : une exception dans la boucle de rendu arrete tout
// en silence. On la retient pour pouvoir la lire apres coup.
window.__erreurs = [];
addEventListener('error', e => {
  window.__erreurs.push((e.error?.stack || e.message || String(e)).slice(0, 700));
});
addEventListener('unhandledrejection', e => {
  window.__erreurs.push('promesse : ' + String(e.reason?.stack || e.reason).slice(0, 700));
});

window.__hasLOS = hasLOS;
window.__R = R;          // sonde de banc d'essai

// Laisse le navigateur peindre l'écran d'attente avant de lancer la
// génération des textures, qui bloque le fil principal quelques secondes.
const respirer = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

window.addEventListener('DOMContentLoaded', async () => {
  const voile = document.getElementById('chargement');
  const etape = document.getElementById('chargement-etape');
  try {
    await respirer();
    etape.textContent = 'Chargement du mobilier…';
    await prechargerDecorBlender();
    etape.textContent = 'Chargement des matières…';
    await prechargerTexturesBlender();
    etape.textContent = 'Chargement des personnages…';
    await prechargerAnatomieBlender();
    window.__game = new Game();
    etape.textContent = 'Prêt';
    await window.__game.demarrer();
    voile.classList.add('parti');
    voile.setAttribute('aria-hidden', 'true');
  } catch (err) {
    voile?.classList.add('parti');
    document.getElementById('boot-error').style.display = 'block';
    document.getElementById('boot-error').textContent = 'Erreur : ' + err.message;
    console.error(err);
  }
});

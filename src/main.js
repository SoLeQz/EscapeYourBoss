import { prechargerAnatomieBlender } from './anatomie-blender.js';
import { prechargerGardeRobe } from './garde-robe-blender.js';
import { nettoyerApparence, restreindre, nouveautes } from './garde-robe.js';
import { prechargerTexturesBlender } from './textures-blender.js';
import { prechargerDecorBlender } from './decor-blender.js';
import * as THREE from 'three';
import { buildLevel, hasLOS, distanceObstacle, collide } from './level.js';
import { buildMaterials, setAnisotropy, setTextureScale } from './materials.js';
import { initCharacterMaterials } from './characters.js';
import * as R from './render.js';
import { Player } from './player.js';
import { libererArbre } from './resources.js';
import { NPC } from './npc.js';
import { UI } from './ui.js';
import { GameAudio } from './audio.js';
import { Minimap } from './minimap.js';
import { NIVEAUX, PLANS, LIGNES_BOSS, pnjDuNiveau } from './levels.js';
import { repereDuNiveau } from './repere.js';
import { Interactifs } from './interactifs.js';
import { prechargerAccessoires, prechargerMobilier } from './accessoires-blender.js';
import { SECRETS, KONAMI, ECHELLE_GROSSE_TETE, noterCanard, noterSecret, aTrouveCanard, canardsTrouves, nettoyerSecrets } from './secrets.js';

// Sorties : durée de la séquence (rester à portée), annonce et nom au bilan.
const SORTIES = {
  elevator: { t: 3.4, titre: 'L’ascenseur monte…', sous: 'Ne bouge pas.', nom: 'Ascenseur' },
  stairs: { t: 1.3, titre: 'Les escaliers', sous: 'Plus long, mais plus sûr.', nom: 'Escaliers' },
  nacelle: { t: 3.2, titre: 'La nacelle descend…', sous: 'Ne regarde pas en bas.', nom: 'Nacelle du laveur de vitres' },
  toboggan: { t: 1.5, titre: 'Wiiiii !', sous: 'Le toboggan secret du fondateur.', nom: 'Toboggan secret' },
};
import { Menu, formaterTemps } from './menu.js';
import { Entrees, touchesParDefaut, nomTouche } from './input.js';
import { EMOTES, reactionEmote } from './emotes.js';
import { mesurerVue, bilanVisibilite } from './perception.js';
import { creerInteractions, actionAccessible, lancerDiversion, diversionMusique } from './office.js';
import { DUREE_TRAVAIL, ALERTE_TRAVAIL, travailProtege, avancerTravail } from './travail.js';
import * as Store from './store.js';
import { Multijoueur, LOOK_COEQUIPIER } from './multijoueur.js';
import { makeLabelSprite } from './characters.js';

// ============================================================
//   Escape your boss — prototype d'infiltration de bureau (Three.js)
// ============================================================

class Game {
  get coequipier() { return this.coequipiers.values().next().value || null; }
  constructor() {
    this.ui = new UI();
    this.audio = new GameAudio();
    this.etat = { ...structuredClone(Store.DEFAUT), touches: touchesParDefaut() };
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
    this.coequipiers = new Map();
    this.multi = new Multijoueur(this);
    this.interactifs = new Interactifs(this);
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
    // Une exception dans une image arrêtait pour de bon la boucle de three.js :
    // jeu figé, et à deux, coéquipier figé avec lui. On la signale et on continue.
    this.renderer.setAnimationLoop(() => {
      try { this.frame(); }
      catch (err) {
        const msg = String(err?.stack || err).slice(0, 700);
        if (msg !== this.derniereErreur) { this.derniereErreur = msg; console.error(err); window.__erreurs?.push(msg); }
      }
    });
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
    // Tenue du vestiaire, limitée aux pièces débloquées par cette sauvegarde.
    this.player.changerApparence(restreindre(this.etat.apparence, this.etat));
    this.overlays = null; this.appliquerGrosseTete();
  }

  async sauver() {
    const ok = await Store.sauver(this.etat);
    if (!ok && !this.sauvegardeEnErreur) this.ui.toast('Sauvegarde impossible', 'Tes découvertes restent dans cette session. Vérifie l’espace disque.');
    this.sauvegardeEnErreur = !ok; return ok;
  }

  // Découvertes permanentes : indépendantes d'une défaite ou d'un record solo.
  decouvrir(id, distant = false) {
    if (!noterSecret(this.etat, id)) return;
    this.sauver();
    if (!distant && this.mode === 'multi') this.multi.envoyer({ t: 'secret', id, idx: this.niveauIndex });
  }
  ramasserCanard(c, distant = false) {
    c.pris = true; this.interactifs.montrerCanard(c, false);
    if (!noterCanard(this.etat, this.niveau.id, c.index)) return;
    this.sauver();
    const total = canardsTrouves(this.etat);
    this.ui.toast('Canard de débogage trouvé !', `${canardsTrouves(this.etat, this.niveau.id)}/3 dans cet étage · ${total}/${NIVEAUX.length * 3} dans la collection`);
    if (!distant && this.mode === 'multi') this.multi.envoyer({ t: 'canard', index: c.index, idx: this.niveauIndex });
  }
  appliquerGrosseTete() {
    for (const p of [this.player, ...this.coequipiers.values(), ...(this.npcs || [])]) {
      if (p?.parts?.head) p.parts.head.scale.setScalar(this.grosseTete ? ECHELLE_GROSSE_TETE : 1);
    }
  }
  eclairageCoupe(coupe) {
    this.appliquerEclairage(this.niveau.eclairage);
    if (coupe) for (const l of this.lampes || []) l.intensity *= .16;
    this.scene.environmentIntensity = .8 * (.5 + .5 * this.niveau.eclairage) * (coupe ? .45 : 1);
  }
  discoLumieres(t) {
    for (const [i, l] of (this.lampes || []).entries()) {
      if (t > 0 && !this.etat.options.mouvementReduit) l.color.setHSL((this.elapsed * .12 + i * .08) % 1, .65, .6);
      else l.color.setHex(i < 13 ? 0xf0f2eb : 0xffbf84);
    }
  }
  bruitDistributeur() { this.decouvrir('distributeur'); }

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
    this.player.changerApparence(null); this.overlays = null;
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
    // Même piège pour le coéquipier : son étiquette de nom, oubliée ici,
    // devenait un rectangle noir au-dessus de sa tête en multijoueur.
    for (const c of this.coequipiers.values()) {
      this.overlays.push(c.outline);
      c.mesh.traverse(o => { if (o.isSprite) this.overlays.push(o); });
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

    // heure de la journée : soleil, ciel, éclairage intérieur. Le soleil tourne
    // avec l'étage : il se couche toujours derrière la baie vitrée.
    const repere = repereDuNiveau(niv);
    R.setSun({ ...niv.soleil, azimut: repere.azimutDeg(niv.soleil.azimut) });
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
    this.npcs = pnjDuNiveau(niv).map(d => new NPC(this.scene, d, this.level));
    if (this.multi.hote) this.npcs.forEach((n, i) => {
      const dire = n.say.bind(n);
      n.say = (texte, dur) => { dire(texte, dur); this.multi.envoyer({ t: 'dire', i, texte, dur }); };
    });
    this.boss = this.npcs.find(n => n.isBoss);
    this.actionsBureau = creerInteractions(this.level, plan, this.npcs);
    this.interactifs.preparer(this.level);
    this.appliquerGrosseTete();

    this.repliFait = false;
    this.overlays = null;        // à recenser au prochain rendu
  }

  // Le coéquipier a envoyé sa tenue (à la connexion ou en quittant son vestiaire).
  majCoequipierApparence(id) {
    if (this.state === 'loading') { (this.apparencesEnAttente ??= new Set()).add(id); return; }
    const c=this.coequipiers.get(id);if(!c)return;
    c.etiquette.removeFromParent();
    c.changerApparence(this.multi.pairs.get(id)?.apparence || LOOK_COEQUIPIER);
    c.mesh.add(c.etiquette);this.appliquerGrosseTete();this.overlays=null;
  }

  preparerCoequipier() {
    if (this.compilationNiveau) { for (const c of this.coequipiers.values()) c.mesh.visible=false; return; }
    for(const [id,c] of this.coequipiers)if(!this.multi.pairs.has(id)){
      c.outline.removeFromParent();c.outlineMat.dispose();libererArbre(c.mesh);this.coequipiers.delete(id);
    }
    if(this.mode!=='multi'||!this.multi.actif){
      for(const c of this.coequipiers.values())c.mesh.visible=false;
      this.player.decalage={x:0,z:0};return;
    }
    const depart=this.level.playerStart,places=[new THREE.Vector3(depart.x,0,depart.z)];
    // Des points séparés, dans le même espace libre que le départ, pour quatre corps.
    for(let r=.95;places.length<this.multi.effectif.length&&r<=4;r+=.55)for(let k=0;k<16&&places.length<this.multi.effectif.length;k++){
      const a=depart.yaw+k*Math.PI/8,p=new THREE.Vector3(depart.x+Math.cos(a)*r,0,depart.z-Math.sin(a)*r);
      if(Math.abs(p.x)>19.4||Math.abs(p.z)>15.4)continue;
      const q=p.clone();collide(this.level.obstacles,q,.36);
      if(q.distanceTo(p)>.02||places.some(v=>v.distanceTo(p)<.85))continue;
      if(!hasLOS(this.level.obstacles,{x:depart.x,y:.65,z:depart.z},{x:p.x,y:.65,z:p.z}))continue;
      places.push(p);
    }
    if(places.length<this.multi.effectif.length)throw Error('Pas assez de places libres au départ');
    this.multi.effectif.forEach((pair,i)=>{
      let c=pair.id===this.multi.id?this.player:this.coequipiers.get(pair.id);
      if(!c){
        c=new Player(this.scene,this.level,this.multi.pairs.get(pair.id)?.apparence||LOOK_COEQUIPIER);
        c.etiquette=makeLabelSprite(pair.nom,`Joueur ${i+1}`);c.etiquette.position.y=2.25;c.mesh.add(c.etiquette);
        this.coequipiers.set(pair.id,c);
      }
      c.reseauId=pair.id;c.level=this.level;c.decalage={x:places[i].x-depart.x,z:places[i].z-depart.z};
      c.reset();if(c!==this.player)c.mesh.visible=false;
    });
    this.overlays=null;
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
        l.userData.base = 7; l.userData.origine = [x, z];
        this.scene.add(l);
        this.lampes.push(l);
      }
      // rebond chaud au ras du sol côté baie
      for (const z of [-11, -3, 5, 12]) {
        const l = new THREE.PointLight(0xffbf84, 2.4, 16, 2);
        l.position.set(-17.5, 0.55, z);
        l.userData.base = 2.4; l.userData.origine = [-17.5, z];
        this.scene.add(l);
        this.lampes.push(l);
      }
    }
    // mêmes néons, placés selon l'orientation de l'étage
    const repere = this.level.repere;
    for (const l of this.lampes) { const [x, z] = l.userData.origine; l.position.x = repere.x(x); l.position.z = repere.z(z); }
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
      if (this.compilationNiveau) await this.compilationNiveau;
      if (annule()) return;
      this.chargementPhase = 'construction';
      this.chargerNiveau(index);
      this.ui.loading(NIVEAUX[index].titre, 'Préparation de l’étage…');
      await respirer();
      this.chargementPhase = 'shaders';
      this.compilationNiveau = this.renderer.compileAsync(this.scene, this.camera);
      this.renderer.getContext().flush();
      // Certains pilotes ne terminent pas le préchauffage parallèle tant que le
      // programme n'est pas utilisé. Après 2 s, demander son état lié force la
      // fin de compilation ; le voile reste affiché pendant cette attente.
      const repliCompilation = setTimeout(() => {
        const gl = this.renderer.getContext();
        for (const p of this.renderer.info.programs || []) if (p.program && !p.isReady())
          gl.getProgramParameter(p.program, gl.LINK_STATUS);
      }, 2000);
      try { await this.compilationNiveau; }
      finally { clearTimeout(repliCompilation); this.compilationNiveau = null; }
      this.chargementPhase = 'pret';
      if (annule()) return;
      this.derniereTransition = { index, ms: performance.now() - debut };
      this.rejouerNiveau();
      for (const id of this.apparencesEnAttente || []) this.majCoequipierApparence(id);
      this.apparencesEnAttente?.clear();
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
    if (this.mode !== 'multi') {
      this.player.decalage = { x: 0, z: 0 };
    }
    this.player.reset();
    this.player.animate(0);
    this.player.setOutline(0);
    this._wasHot = false; this._panic = false; this.secousse = 0;
    this.level.escalier.door.rotation.y = 0;
    for (const d of this.level.elevatorPanels) d.position.z = 1.5 + d.userData.side * 0.73;
    for (const n of this.npcs) { n.reset(); n.updateVisuals(0, this); }
    this.interactifs.reinitialiser();
    // Les canards déjà trouvés (sauvegarde) ne reviennent pas.
    for (const c of this.level.canards) if (aTrouveCanard(this.etat, this.niveau.id, c.index)) { c.pris = true; this.interactifs.montrerCanard(c, false); }
    for (const o of this.level.ramassables) { o.pris = false; o.group.visible = true; }
    this.majLumieresObjets();
    this.preparation = true;
    this.menuMulti = false; this.bruitEmote = {};
    this.apprentissage = this.niveauIndex === 0 && this.mode === 'campagne' ? 0 : null;
    if (this.mode === 'multi') {
      this.apprentissage = null;
      this.multi.reinitialiser();
      for (const c of this.coequipiers.values()) { c.reset(); c.mesh.visible = false; }
      if (this.multi.invite) this.multi.envoyer({ t: 'pret', index: this.niveauIndex });
    } else {
      for (const c of this.coequipiers.values()) c.mesh.visible = false;
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
    this.camYaw = this.level.playerStart.yaw;
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
    // Le passe est facultatif : il ouvre l'escalier, l'ascenseur s'en passe.
    liste.innerHTML = objets.map(o =>
      `<li class="${o.pris ? 'ok' : 'objet'}"><i>${o.pris ? '✓' : o.ouvre ? '◇' : '◆'}</i>` +
      (o.ouvre ? `${this.level.interactables.length > 1 ? 'Facultatif : ' : 'Récupérer '}${o.nom} (${o.effet || 'ouvre l’escalier'})` : `Récupérer ${o.nom}`) + `</li>`
    ).join('') + `<li><i>○</i>Atteindre une sortie</li>`;
  }

  // Objets encore exigés : ceux de tout l'étage, plus la clé propre à la
  // sortie visée (le passe pour la porte coupe-feu de l'escalier).
  objetsRestants(sortie = null) {
    return this.level.ramassables.filter(o => !o.pris && (!o.ouvre || o.ouvre === sortie));
  }

  // Objectif ramassé ici ou par le coéquipier (multijoueur : objets partagés).
  ramasserObjet(i, distant = false) {
    const o = this.level.ramassables[i];
    if (!o || o.pris) return;
    o.pris = true;
    o.group.visible = false;
    this.majLumieresObjets();
    this.audio.ding();
    const reste = this.objetsRestants().length;
    this.ui.toast((distant ? (this.multi.nomDistant || 'Ton coéquipier') + ' a récupéré ' : 'Récupéré : ') + o.nom,
      o.ouvre ? (o.message || 'La porte coupe-feu de l’escalier est déverrouillée.')
        : reste ? 'Il en reste ' + reste : 'Vous pouvez sortir.');
    this.majObjectifs();
    if (!distant) this.multi.envoyer({ t: 'objet', id: i });
  }

  // ---------------------------------------------------------- vestiaire
  //
  // Lao D pose dans le hall d'ascenseur, dos à la sortie, face à une caméra de
  // studio. Chaque essai reconstruit le vrai personnage du jeu : ce qu'on voit
  // ici est exactement ce que verront les collègues (et le coéquipier).
  ouvrirVestiaire() {
    const p = this.player;
    const rep = this.level.repere, studio = rep.p(15.3, 1.2);
    this.vestiaire = { brouillon: nettoyerApparence(p.apparence), origine: { pos: p.pos.clone(), yaw: p.yaw, visible: p.mesh.visible },
      yawBase: rep.yaw(-Math.PI / 2), tour: 0, auto: true, zoom: 'corps', cam: null, vise: null };
    p.pos.set(studio.x, 0, studio.z); p.mesh.visible = true; p.exitPose = null; p.working = null; p.emote = null; p.crouch = 0; p.speed = 0; p.moving = false;
    for (const e of EMOTES) if (e.son) this.audio.chargerSon(e.son.fichier);
    this.ui.show('vestiaire');
  }
  essayerTenue(apparence) {
    if (!this.vestiaire) return;
    this.vestiaire.brouillon = nettoyerApparence(apparence);
    this.player.changerApparence(this.vestiaire.brouillon); this.appliquerGrosseTete();
    this.overlays = null;
  }
  fermerVestiaire(garder) {
    const v = this.vestiaire;
    if (!v) return;
    if (garder) {
      this.etat.apparence = v.brouillon; this.sauver();
      this.multi.envoyer({ t: 'apparence', a: v.brouillon });
    } else this.player.changerApparence(restreindre(this.etat.apparence, this.etat));
    this.player.pos.copy(v.origine.pos); this.player.yaw = v.origine.yaw; this.player.emote = null;
    this.player.mesh.visible = v.origine.visible;
    this.player.animate(0);
    this.vestiaire = null; this.overlays = null;
    this.ui.show('start'); this.menu.ouvrir('menu-principal');
  }
  animerVestiaire(dt) {
    const v = this.vestiaire, p = this.player;
    if (v.auto) v.tour += dt * .32;
    p.yaw = v.yawBase + v.tour;
    p.animate(dt);
    // Caméra fixe face au mannequin, décalée pour le laisser dans la moitié gauche
    // de l'écran : le panneau du vestiaire occupe la droite.
    const tete = v.zoom === 'tete', dist = tete ? 1.25 : 3.2;
    const devant = new THREE.Vector3(Math.sin(v.yawBase), 0, Math.cos(v.yawBase));
    const droiteEcran = new THREE.Vector3(devant.z, 0, -devant.x);
    const vise = p.pos.clone().add(droiteEcran.clone().multiplyScalar(dist * .24)).setY(tete ? 1.62 : 1.0);
    const cam = vise.clone().add(devant.multiplyScalar(dist)).setY(tete ? 1.66 : 1.22);
    const k = v.cam ? 1 - Math.exp(-6 * dt) : 1;
    v.cam = (v.cam || cam.clone()).lerp(cam, k); v.vise = (v.vise || vise.clone()).lerp(vise, k);
    this.camera.position.copy(v.cam); this.camera.lookAt(v.vise);
  }

  // ---------------------------------------------------------- roue d'emotes
  //
  // Maintenir la touche ouvre la roue ; la souris pilote la sélection
  // (pas la caméra, sinon on viserait et choisirait en même temps) ;
  // relâcher lance l'emote. Le jeu continue de tourner derrière : c'est
  // un jeu d'infiltration, mettre en pause tuerait la tension.
  construireRoue() {
    const disque = document.getElementById('roue-disque');
    // Dix cases de 96 px tiennent sans se toucher sur un cercle de 205 px (disque de 540 px).
    const R = 205, centre = 270;
    const touche = i => i < 9 ? String(i + 1) : i === 9 ? '0' : '';
    document.getElementById('roue-note').textContent =
      `Souris ou ${EMOTES.length > 9 ? '1–9 et 0' : '1–' + EMOTES.length} · Relâche pour jouer · Centre ou Échap pour annuler`;
    this.roueCases = EMOTES.map((e, i) => {
      const a = -Math.PI / 2 + (i / EMOTES.length) * Math.PI * 2;
      const el = document.createElement('div');
      el.className = 'roue-case';
      el.setAttribute('aria-label', `${touche(i)}. ${e.nom}`);
      el.style.left = `${centre + Math.cos(a) * R}px`;
      el.style.top = `${centre + Math.sin(a) * R}px`;
      el.innerHTML = `<small class="raccourci">${touche(i)}</small><div class="ic">${e.icone}</div><div class="nm">${e.nom}</div>`;
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
      if (this.state === 'menu' && !this.vestiaire && !e.repeat && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) {
        this.konami = e.code === KONAMI[this.konami || 0] ? (this.konami || 0) + 1 : (e.code === KONAMI[0] ? 1 : 0);
        if (this.konami === KONAMI.length) {
          this.konami = 0; this.grosseTete = !this.grosseTete; this.appliquerGrosseTete(); this.decouvrir('konami');
          this.ui.toast(this.grosseTete ? 'Le melon du patron' : 'Retour sur terre', 'Mode grosse tête ' + (this.grosseTete ? 'activé.' : 'désactivé.'));
        }
      }
      if (e.defaultPrevented || this.menu?.ecoute) return;
      if (e.code === 'Escape' && !e.repeat) {
        e.preventDefault();
        if (this.roueOuverte) { this.fermerRoue(false); return; }
        if (this.menu?.depuisPause) {
          this.menu.depuisPause = false;
          this.ui.show('pause');
        } else if (this.vestiaire) this.fermerVestiaire(false);
        else if (this.state === 'play') this.menuMulti ? this.resume() : this.pause();
        else if (this.state === 'pause') this.resume();
        else if (this.state === 'menu') this.menu.ouvrir('menu-principal');
        return;
      }
      if (this.state !== 'play') {
        if (this.state === 'over' && I.correspond('recommencer', e.code)) this.recommencer();
        return;
      }
      if (this.menuMulti) return;  // menu ouvert à deux : la partie continue, sans nous
      if (e.repeat) return;
      if (this.roueOuverte && /^(Digit|Numpad)[0-9]$/.test(e.code)) {
        const index = e.code.at(-1) === '0' ? 9 : Number(e.code.at(-1)) - 1;  // 0 : dixième case
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
      if (I.correspond('recommencer', e.code) && this.state !== 'menu') this.recommencer();
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
    document.getElementById('btn-retry').onclick = () => this.recommencer();
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

  // Bouton « Réessayer » et touche R. À deux, seul l'hôte relance, et toujours
  // par le réseau : la touche R redémarrait l'étage chez un seul joueur. L'hôte
  // repartait aussitôt (l'ancien « pret » de l'invité correspondait encore)
  // pendant que l'invité restait sur l'écran d'échec : plus personne ne se voyait.
  // En pleine partie à deux, R ne fait rien : ni retour au départ en gardant les
  // objets, ni relance commune déclenchée par une touche voisine de E.
  recommencer() {
    if (this.mode !== 'multi') return this.rejouerNiveau();
    if (this.state === 'play') return this.ui.toast('Pas de retour au départ en coopération', 'On recommence seulement après la fin de l’étage.');
    if (this.multi.hote) this.lancerMulti(this.niveauIndex);
    else this.ui.toast('C’est l’hôte qui relance', 'Attends sa décision.');
  }

  // À deux, Échap (ou la perte du focus) ouvre le menu chez soi seulement : la
  // partie continue pour le coéquipier, et on reste là où on est, visible.
  pause() {
    if (this.state !== 'play' || this.menuMulti) return;
    this.input.clear();
    this.fermerRoue(false);
    const aDeux = this.mode === 'multi' && this.multi.actif;
    document.getElementById('pause-titre').textContent = aDeux ? 'Menu' : 'Pause';
    document.getElementById('pause-sous').textContent = aDeux
      ? 'La partie continue pour les autres joueurs. Ton personnage reste où il est.'
      : 'Souffle un peu. Le bureau peut attendre.';
    if (aDeux) this.menuMulti = true;
    else this.state = 'pause';
    document.getElementById('btn-guide').hidden = this.apprentissage == null;
    this.ui.show('pause');
    document.exitPointerLock?.();
  }
  resume() {
    // Rien à reprendre hors pause : écrans d'échec, de victoire, chargement.
    if (!this.menuMulti && this.state !== 'pause') return;
    this.menuMulti = false;
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
    if (acteur === this.player) this.ui.toast(def.nom, def.son ? 'La musique attire les regards.' : 'En plein open space.');
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
    // Une musique s'entend aussi sans être vu : ceux qui l'entendent regardent vers
    // la source. Une fois par danseur toutes les 25 s, sinon les collègues s'y font.
    const cle = acteur.reseauId || 'joueur';
    this.bruitEmote ??= {};
    if (def.son && !(this.elapsed - (this.bruitEmote[cle] ?? -Infinity) < 25)) {
      this.bruitEmote[cle] = this.elapsed;
      diversionMusique(p, this.npcs, n => mesurerVue(n, acteur, this.level.obstacles).visible, this.hunting);
    }
  }

  // ---------------------------------------------------------- interaction
  // Hôte : action déclenchée par l'invité.
  actionDistante(id, joueurId) {
    const acteur=this.coequipiers.get(joueurId);
    if (this.state !== 'play' || !acteur || this.multi.pairs.get(joueurId)?.sorti) return;
    if (typeof id === 'string' && id.startsWith('acc:')) {
      const it = this.interactifs.liste[Number(id.slice(4))];
      if (it && this.interactifs.accessibles(acteur).includes(it)) {
        this.interactifs.interagir(it, acteur);
        if (it.type === 'cafe') this.multi.envoyer({ t: 'cafe', idx: this.niveauIndex }, joueurId);
      }
      return;
    }
    if (id === 'ascenseur') { this.boss.suspicion = Math.min(0.9, this.boss.suspicion + 0.14); return; }
    const it = this.actionsBureau[id];
    if (it && it.type === 'diversion' && !it.utilise) lancerDiversion(it, this.npcs, this.audio, this.hunting);
  }

  // Multijoueur : l'hôte choisit l'étage, l'invité suit.
  lancerMulti(index) {
    if (this.state === 'loading') return;
    const memeEtage = this.mode === 'multi' && this.coequipier && index === this.niveauIndex;
    this.mode = 'multi';
    this.niveauAttendu = index;
    if (this.multi.hote) {
      this.multi.manche++;for(const p of this.multi.pairs.values())p.pret=null;
      this.multi.envoyer({ t: 'lancer', index });
    }
    if (!memeEtage) this.niveauIndex = -1;  // la relance réutilise le décor déjà chargé
    this.demarrerNiveau(index);
  }
  coequipierParti(raison) {
    if (this.mode !== 'multi') { this.menu?.majMulti?.(); return; }
    this.ui.toast('Coéquipier déconnecté', raison || 'Retour au salon pour reformer le groupe.', 5);
    this.retourMenuMulti(!this.multi.hote);
  }
  retourMenuMulti(distant = false) {
    if (!distant) this.multi.envoyer({ t: 'menu' });
    this.menuMulti = false;
    this.jetonChargement = (this.jetonChargement || 0) + 1;  // annule un chargement en cours
    this.ui.loading(null);
    this.fermerRoue(false);
    document.exitPointerLock?.();
    this.state = 'menu'; this.mode = 'campagne';
    for (const c of this.coequipiers.values()) c.mesh.visible = false;
    this.menu.afficher(); this.menu.ouvrir('menu-multi'); this.menu.majMulti?.();
  }

  nearestInteractable() {
    if (this.player.working) return this.player.working;
    return [...this.actionsBureau, ...this.level.interactables].filter(it => actionAccessible(it, this.player, this.level.obstacles))
      .concat(this.interactifs.accessibles(this.player))
      .sort((a, b) => Math.hypot(a.x-this.player.pos.x, a.z-this.player.pos.z)
        - Math.hypot(b.x-this.player.pos.x, b.z-this.player.pos.z))[0] || null;
  }

  tryInteract() {
    if (this.state !== 'play' || this.exitSeq || this.preparation || this.roueOuverte || this.multi?.sortiLocal && this.mode === 'multi') return;
    const it = this.nearestInteractable();
    if (!it) return;
    // Décor interactif et secrets (interactifs.js). À deux, l'hôte décide.
    if (this.interactifs.liste.includes(it)) {
      if (this.mode === 'multi' && this.multi.invite) {
        this.multi.envoyer({ t: 'action', id: 'acc:' + this.interactifs.liste.indexOf(it), idx: this.niveauIndex });
      } else this.interactifs.interagir(it);
      return;
    }
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
      if (this.player.deguisement) { this.ui.toast('Quitte le carton', 'Il faut des mains libres pour taper au clavier.'); return; }
      this.player.working = it; this.player.workT = 0;
      this.player.pos.set(it.x, 0, it.z); this.player.yaw = it.yaw;
      this.player.vel.set(0, 0, 0); this.player.emote = null;
      this.input.bascules.accroupir = false;
      this.ui.toast('Très occupé. Absolument.', `${Math.ceil(it.restant)} s de protection, même face au boss. Ce temps ne se recharge pas.`);
      return;
    }
    const manque = this.objetsRestants(it.id);
    if (manque.length) {
      if (manque[0].ouvre === 'nacelle') this.ui.toast('Nacelle verrouillée', 'Le treuil ne démarre qu’avec ' + manque[0].nom + '.');
      else if (manque[0].ouvre) this.ui.toast('Porte coupe-feu verrouillée',
        'Après 18 h, elle ne s’ouvre qu’avec ' + manque[0].nom + '. Ou prends l’ascenseur.');
      else this.ui.toast('Il te manque ' + manque[0].nom, 'Pas question de partir sans.');
      this.audio.blip();
      return;
    }
    if (this.interactifs.carton(this.player)) {
      this.ui.toast('Sors d’abord du carton', 'Un carton ne prend pas l’' + (it.id === 'elevator' ? 'ascenseur.' : 'escalier.'));
      return;
    }
    const sortie = SORTIES[it.id];
    this.exitSeq = { id: it.id, t: sortie.t, total: sortie.t };
    this.ui.say(sortie.titre, sortie.sous, Math.min(3.4, sortie.t + 0.2));
    if (it.id === 'elevator') {
      this.audio.blip();
      // le « ding » attire l'attention : le boss lève la tête
      if (this.mode === 'multi' && this.multi.invite) this.multi.envoyer({ t: 'action', id: 'ascenseur' });
      else this.boss.suspicion = Math.min(0.9, this.boss.suspicion + 0.14);
    } else if (it.id === 'stairs') this.audio.door();
    else if (it.id === 'nacelle') this.audio.moteurNacelle(it);
    else this.audio.glissade(it);
  }

  // ---------------------------------------------------------- boucle
  frame() {
    const brut = this.clock.getDelta();
    // Musique d’emote : seulement en jeu, jamais pendant une pause ou une sortie en fondu.
    const e = this.player?.emote;
    this.audio.suivreMusique((this.state === 'play' || this.vestiaire) && e && !e.coupee ? e : null);
    const musicien = this.mode === 'multi' ? [...this.coequipiers.values()].filter(c=>c.mesh.visible&&c.emote&&!c.emote.coupee).sort((a,b)=>a.pos.distanceTo(this.player.pos)-b.pos.distanceTo(this.player.pos))[0] : null;
    this.audio.suivreMusiqueDistante(this.state === 'play' ? musicien?.emote : null, musicien?.pos);
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
    if (this.vestiaire) this.animerVestiaire(dt);
    else this.updateCamera(dt, this.state === 'play');
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
        this.ui.setGuide('Multijoueur', `En attente de ${multi.nomDistant || 'ton coéquipier'}…`, 'La partie démarre quand tout le groupe a chargé');
        return;
      }
    }
    // On peut lire et orienter la caméra sans subir une ronde pendant le briefing.
    if (this.preparation) {
      this.ui.setGuide('Avant de filer', `${this.niveau.conseil} Seule une coupure au disjoncteur réduit leur portée.`,
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
    this.interactifs.mettreAJour(dt, !!multi?.invite);
    if (multi?.hote) for (const c of this.coequipiers.values()) avancerTravail(c, dt);
    const travail = multi?.invite ? null : avancerTravail(this.player, dt);
    if (multi?.invite && this.player.working?.restant <= 0) this.player.working = null;
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
      // chez l'hôte, les collègues perçoivent tous les joueurs encore dans l'étage
      this.joueurs = [];
      if (!multi.sortiLocal) this.joueurs.push(this.player);
      for(const [id,c] of this.coequipiers)if(multi.pairs.get(id)?.etat&&!multi.pairs.get(id).sorti)this.joueurs.push(c);
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
      const rep = this.level.repere;
      const sources = [rep.p(-18.4, -14.5), this.npcs.find(n => n.isSeatedNow)?.pos, rep.p(16.6, -1.6), rep.p(8, 13)];
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
    else this.ui.setState(`${this.player.deguisement ? 'Carton · discrétion accrue' : posture} · ${v.visible ? 'Visible' : v.entendu ? 'Entendu' : 'Hors des regards'}${this.interactifs.obscurite > 0 ? ' · Coupure ' + Math.ceil(this.interactifs.obscurite) + ' s' : ''}`,
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
      const ecoule = this.exitSeq.total - this.exitSeq.t;
      const pose = { id: this.exitSeq.id, progress: Math.max(0, 1-this.exitSeq.t/0.65),
        dir: this.level.interactables.find(i => i.id === this.exitSeq.id)?.dir };
      if (this.exitSeq.id === 'nacelle') {
        // on enjambe l'allège, puis la nacelle descend avec Lao D dessus
        const descente = Math.max(0, ecoule - 1.0) ** 1.4 * 0.9;
        Object.assign(pose, { progress: Math.min(1, ecoule / 0.9), dist: 1.45, descente });
        if (this.interactifs.nacelle) this.interactifs.nacelle.groupe.position.y = -0.02 - descente;
      } else if (this.exitSeq.id === 'toboggan') {
        const trappe = this.interactifs.toboggan?.roles.trappe;
        if (trappe) trappe.rotation.x = -Math.min(1, ecoule / 0.4) * 1.5;
        Object.assign(pose, { progress: Math.min(1, Math.max(0, ecoule - 0.3) / 0.9), dist: 1.1, descente: Math.max(0, ecoule - 0.7) * 0.8 });
      }
      this.player.exitPose = pose;
      if (this.exitSeq.t <= 0) {
        if (!multi) return this.terminerNiveau(this.exitSeq.id);
        multi.sortiLocal = true; multi.routeSortie = this.exitSeq.id;
        this.exitSeq = null; this.player.exitPose = null; this.player.mesh.visible = false;
        multi.envoiT = 0; multi.envoyerJoueur(0);
        this.ui.say('Tu es sorti', 'Attends les autres joueurs… ou regarde leur fuite.', 4);
      }
      // on doit rester près du point de sortie (à deux, la séquence vient
      // peut-être de se terminer : exitSeq est alors déjà remis à zéro)
      const it = this.exitSeq && this.level.interactables.find(i => i.id === this.exitSeq.id);
      if (it && Math.hypot(it.x - this.player.pos.x, it.z - this.player.pos.z) > it.r + 1.2) {
        this.exitSeq = null; this.player.exitPose = null;
        this.level.escalier.door.rotation.y = 0;
        if (this.interactifs.nacelle) this.interactifs.nacelle.groupe.position.y = -0.02;
        if (this.interactifs.toboggan?.roles.trappe) this.interactifs.toboggan.roles.trappe.rotation.x = 0;
        this.ui.toast('Tu t’es éloigné', 'Recommence.');
      }
    }

    // prompt d'interaction
    const it = this.exitSeq ? null : this.nearestInteractable();
    const manque = it && !it.type && !this.interactifs.liste.includes(it) ? this.objetsRestants(it.id) : [];
    const label = this.interactifs.liste.includes(it) ? this.interactifs.libelle(it, this.player)
      : it?.type === 'diversion' && it.utilise ? 'Bac à papier vide'
      : it?.type === 'travail' ? (this.player.working ? 'Quitter le poste'
        : it.restant > 0 ? `${it.label} · ${Math.ceil(it.restant)} s` : 'Protection épuisée pour cet étage') : it?.label;
    this.ui.setPrompt(it ? (manque.length ? (manque[0].ouvre ? `Verrouillée · il te faut ${manque[0].nom}`
      : `Récupère ${manque[0].nom} avant de partir`)
      : `<kbd>${this.touche('interagir')}</kbd> ${label}`) : '');
    this.ui.setExit(this.exitSeq);

    if (caught) this.lose(caught);
  }

  // Multijoueur (hôte) : victoire quand tout le groupe est sorti.
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
      this.ui.setGuide('À toi de filer', 'Les meubles coupent le regard. Un disjoncteur réduit temporairement sa portée.', 'Bonne évasion !');
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
    this.state = 'over'; this.menuMulti = false;
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
    if (route === 'nacelle' || route === 'toboggan') this.decouvrir(route);
    this.state = 'over'; this.menuMulti = false;
    document.exitPointerLock?.();
    this.audio.success();
    if (this.mode === 'multi') {
      // Coopération : pas de records solo. L'hôte choisit la suite.
      const suivant = this.niveauIndex + 1, dernier = suivant >= NIVEAUX.length;
      document.getElementById('suite-titre').textContent = 'Tout le monde est sorti !';
      document.getElementById('suite-sous').textContent = dernier ? `Les ${NIVEAUX.length} étages, à ${this.multi.effectif.length}` : 'Prochain : ' + NIVEAUX[suivant].titre;
      document.getElementById('suite-stats').innerHTML = `<div class="splits">
        <div><span>Temps</span><b>${formaterTemps(this.elapsed)}</b></div>
        <div><span>Groupe</span><b>${this.multi.effectif.length} joueurs</b></div>
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
    // Pièces du vestiaire débloquées par cet étage (ou ce speedrun) : annoncées au bilan.
    const avant = { niveauxFinis: [...this.etat.niveauxFinis], records: { ...this.etat.records } };
    const cadeaux = () => {
      const liste = nouveautes(avant, this.etat);
      if (!liste.length) return '';
      this.ui.toast('Nouveau au vestiaire', liste.map(p => p.icone + ' ' + p.nom).join(' · '), 5);
      return `<div class="cadeau"><span>🎁 Nouveau au vestiaire</span><b>${liste.map(p => p.icone + ' ' + p.nom).join(', ')}</b></div>`;
    };
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
      if (meilleur && this.srDepart === 0 && this.srSplits.length === NIVEAUX.length) { this.etat.records.speedrun = +total.toFixed(1); this.sauver(); }
      document.getElementById('suite-titre').textContent = 'Speedrun terminé';
      document.getElementById('suite-sous').textContent =
        this.srDepart !== 0 ? 'Entraînement terminé · aucun record de parcours complet' : meilleur ? 'Nouveau meilleur temps !' : `Les ${NIVEAUX.length} étages, d’une traite`;
      document.getElementById('suite-stats').innerHTML =
        `<div class="splits">` +
        this.srSplits.map(sp => `<div><span>${sp.titre}</span><b>${formaterTemps(sp.t)}</b></div>`).join('') +
        `<div><span><b>Total</b></span><b>${formaterTemps(total)}</b></div>` +
        (recSr != null ? `<div><span>Ancien record</span><b>${formaterTemps(recSr)}</b></div>` : '') +
        cadeaux() + `</div>`;
      document.getElementById('btn-suivant').textContent = 'Retour au menu';
      this.ui.show('suite');
      return;
    }

    // Campagne : bilan de l'étage puis déblocage du suivant.
    const suivant = this.niveauIndex + 1;
    const dernier = suivant >= NIVEAUX.length;
    const routeTxt = SORTIES[route]?.nom || 'Escaliers';
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
        ${cadeaux()}
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
const respirer = () => new Promise(resolve => {
  // Une fenêtre masquée peut suspendre requestAnimationFrame même en coopération.
  // Le chargement doit pouvoir rendre la main sans dépendre de sa visibilité.
  const timer = setTimeout(resolve, 200);
  requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); }));
});

window.addEventListener('DOMContentLoaded', async () => {
  const voile = document.getElementById('chargement');
  const etape = document.getElementById('chargement-etape');
  try {
    await respirer();
    etape.textContent = 'Chargement du mobilier…';
    await prechargerDecorBlender();
    etape.textContent = 'Chargement des accessoires…';
    await prechargerAccessoires();
    etape.textContent = 'Chargement du mobilier…';
    await prechargerMobilier();
    etape.textContent = 'Chargement des matières…';
    await prechargerTexturesBlender();
    etape.textContent = 'Chargement des personnages…';
    await prechargerAnatomieBlender();
    etape.textContent = 'Chargement du vestiaire…';
    await prechargerGardeRobe();
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

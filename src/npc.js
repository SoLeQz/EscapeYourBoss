import { creerNavigation, chemin } from './navigation.js';
import { POIGNET_REPOS, POIGNET_CLAVIER } from './emotes.js';
import { libererArbre } from './resources.js';
import * as THREE from 'three';
import { makeCharacter, setSeated, animerVisage, makeIconSprite, makeLabelSprite,
         makeBubbleSprite, HEIGHT } from './characters.js';
import { collide } from './level.js';

import { travailProtege } from './travail.js';
import { mesurerVue } from './perception.js';

const DEG = Math.PI / 180;

// Fausse alerte : il se persuade qu'il n'a rien vu.
const HAUSSEMENTS = ['Bah…', 'J’ai cru voir un truc.', 'Mouais.',
  'Faut que je dorme.', 'Bref.'];

// Le cône est dégradé par couleurs de sommets : franc au pied du
// collègue, éteint au bord. Un aplat uniforme, soit on ne le voit pas,
// soit il inonde la moquette — les deux nuisent à la lisibilité.
function coneGeometry(fovRad, dist, seg = 28) {
  const pos = [0, 0, 0], col = [1, 1, 1];
  const anneaux = [0.42, 0.75, 1.0];
  const intens = [0.9, 0.45, 0.06];
  for (let r = 0; r < anneaux.length; r++) {
    for (let i = 0; i <= seg; i++) {
      const a = -fovRad / 2 + (fovRad * i) / seg;
      const d = dist * anneaux[r];
      pos.push(Math.sin(a) * d, 0, Math.cos(a) * d);
      // les bords latéraux s'estompent aussi : on lit un faisceau
      const bord = 1 - Math.pow(Math.abs(i / seg - 0.5) * 2, 3);
      const k = intens[r] * (0.35 + 0.65 * bord);
      col.push(k, k, k);
    }
  }
  const idx = [];
  for (let i = 1; i <= seg; i++) idx.push(0, i, i + 1);
  for (let r = 0; r < anneaux.length - 1; r++) {
    const a0 = 1 + r * (seg + 1), b0 = a0 + seg + 1;
    for (let i = 0; i < seg; i++)
      idx.push(a0 + i, b0 + i, a0 + i + 1, a0 + i + 1, b0 + i, b0 + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export class NPC {
  constructor(scene, cfg, level) {
    this.cfg = cfg;
    this.level = level;
    this.name = cfg.name;
    this.role = cfg.role;
    this.isBoss = !!cfg.boss;

    const built = makeCharacter({...cfg.look,profilVisage:cfg.boss?'direction':cfg.role==='sécurité'?'securite':cfg.look?.chignon?'chignon':'employe'});
    this.mesh = built.group;
    this.parts = built.parts;
    scene.add(this.mesh);

    this.pos = new THREE.Vector3(cfg.x, 0, cfg.z);
    this.baseYaw = cfg.yaw ?? 0;
    this.yaw = this.baseYaw;
    this.headYaw = this.baseYaw;
    this.speed = 0;
    this.phase = Math.random() * 10;

    this.seated = cfg.kind === 'seated' || cfg.kind === 'boss';
    if (this.seated) setSeated(this.parts);

    this.fov = (cfg.fov ?? 80) * DEG;
    this.viewDist = cfg.dist ?? 11;
    this.hearDist = cfg.hear ?? 2.6;
    this.gainRate = cfg.gain ?? 0.85;
    this.decayRate = cfg.decay ?? 0.42;

    this.suspicion = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.lastSeen = new THREE.Vector3(cfg.x, 0, cfg.z);
    this.route = null;
    this.routeIdx = 0;
    this.pauseT = 0;

    // routine du boss
    this.sitTimer = (cfg.sitMin ?? 14) + Math.random() * (cfg.sitVar ?? 10);
    this.bossPhase = 'sitting';

    // --- cône de vision ---
    // Opacité volontairement faible : avec sept PNJ, des cônes plus
    // marqués se cumulent et teintent toute la moquette.
    this.coneMat = new THREE.MeshBasicMaterial({
      color: 0xffe3a8, transparent: true, opacity: 0.30,
      depthWrite: false, side: THREE.DoubleSide, vertexColors: true,
    });
    this.cone = new THREE.Mesh(coneGeometry(this.fov, this.viewDist), this.coneMat);
    this.cone.position.y = 0.04;
    this.cone.renderOrder = 2;
    scene.add(this.cone);

    // --- icônes ---
    this.icon = makeIconSprite('?', '#ffd24a', 1.1);
    this.icon.position.y = 2.15;
    this.icon.visible = false;
    this.mesh.add(this.icon);

    this.bang = makeIconSprite('!', '#ff4b3a', 1.3);
    this.bang.position.y = 2.15;
    this.bang.visible = false;
    this.mesh.add(this.bang);

    this.label = makeLabelSprite(cfg.name, cfg.role);
    this.label.position.y = 2.6;
    this.mesh.add(this.label);

    this.bubble = null;
    this.bubbleT = 0;

    this.apply();
  }

  get isSeatedNow() { return this.seated && !this.walking; }

  // Assis, on voit moins bien par-dessus les cloisons basses.
  get eyeY() { return this.isSeatedNow ? HEIGHT.eye + HEIGHT.seatOffset : HEIGHT.eye; }

  apply() {
    const sit = this.isSeatedNow;
    this.mesh.position.set(this.pos.x,
      sit ? HEIGHT.seatOffset : (this._bob || 0), this.pos.z);
    this.mesh.rotation.y = this.yaw;
  }

  say(text, dur = 2.6) {
    if (this.bubble) { libererArbre(this.bubble); this.bubble = null; }
    this.bubble = makeBubbleSprite(text);
    this.bubble.position.y = 2.75;
    this.mesh.add(this.bubble);
    this.bubbleT = dur;
  }

  startRoute(points, loop = false) {
    this.route = points;
    this.routeIdx = 0;
    this.loopRoute = loop;
    this.walking = true;
    if (this.seated) { setStanding(this.parts); }
  }

  update(dt, game) {
    this.stateT += dt;

    // ---------- PERCEPTION ----------
    // En multijoueur (chez l'hôte), chaque collègue perçoit les deux joueurs et
    // réagit au plus exposé. `vue`, `sawThisFrame` et `heardThisFrame` décrivent
    // le joueur local : ce sont eux qu'affiche l'interface.
    const joueurs = game.joueurs || [game.player];
    let cible = null;
    for (const player of joueurs) {
      const vue = mesurerVue(this, player, this.level.obstacles);
      const dist = vue.distance;
      const protegeJ = travailProtege(player);
      let perceivedJ = 0, entendu = false;
      if (vue.visible && !protegeJ) {
        const prox = 1 - Math.min(1, dist / this.viewDist) * 0.62;
        const center = vue.dansCone ? 1 - (vue.angle / (this.fov / 2)) * 0.35 : 0.75;
        perceivedJ = this.gainRate * prox * center;
        if (player.crouch > 0.6) perceivedJ *= 0.5;
        if (player.running) perceivedJ *= 1.75;
        else if (!player.moving) perceivedJ *= 0.7;
        if (game.hunting && this.isBoss) perceivedJ *= 1.4;
      }
      // bruit : entendu même hors du champ de vision
      if (!protegeJ && !vue.visible && dist < player.noiseRadius && dist < 9) {
        entendu = true;
        perceivedJ = Math.max(perceivedJ, 0.30 * (1 - dist / Math.max(0.001, player.noiseRadius)));
      }
      if (player === game.player) { this.vue = vue; this.sawThisFrame = vue.visible; this.heardThisFrame = entendu; }
      if (!cible || perceivedJ > cible.perceived || (perceivedJ === cible.perceived && dist < cible.dist))
        cible = { player, perceived: perceivedJ, protege: protegeJ, dist };
    }
    if (!joueurs.includes(game.player)) { this.sawThisFrame = false; this.heardThisFrame = false; }
    const protege = cible.protege;
    let perceived = cible.perceived;
    if (perceived > 0) this.lastSeen.set(cible.player.pos.x, 0, cible.player.pos.z);

    // En observation, on laisse au joueur une fenêtre pour réagir :
    // se faire repérer doit être une conséquence, pas une surprise.
    if (this.state === 'observation') perceived *= 0.7;

    // Le crédit limité paie une vraie trêve, y compris de près, face au
    // boss et quand le joueur s'assied alors qu'on le soupçonne déjà.
    // Les soupçons diminuent normalement : tapoter E ne les efface pas.
    // Garder sawThisFrame décrit la visibilité physique, pas le danger.
    if (perceived > 0) this.suspicion = Math.min(1, this.suspicion + perceived * dt);
    else this.suspicion = Math.max(0, this.suspicion - this.decayRate * dt);

    // ---------- ÉTATS ----------
    //
    // travail -> doute -> observation -> repéré, avec hystérésis pour
    // qu'un collègue ne clignote pas entre deux états à la frontière.
    const avant = this.state;
    if (protege) this.state = 'travail';
    else if (this.suspicion >= 1) this.state = 'repere';
    else if (this.suspicion > 0.52) this.state = 'observation';
    else if (this.suspicion > 0.22) this.state = 'doute';
    else if (this.suspicion < 0.14) this.state = 'travail';
    if (this.state !== avant) { this.stateT = 0; this.onChangementEtat(avant, game); }

    // ---------- COMPORTEMENT ----------
    const beforeX = this.pos.x, beforeZ = this.pos.z;
    if (this.diversion && this.suspicion < 0.52 && !(game.hunting && this.isBoss)) {
      this.diversion.t -= dt;
      this.turnTo(Math.atan2(this.diversion.x - this.pos.x, this.diversion.z - this.pos.z), dt, 4);
      this.speed = 0;
      if (this.diversion.t <= 0) this.diversion = null;
    } else if (this.state === 'observation') {
      this.diversion = null;
      // on lâche tout et on fixe le dernier endroit vu
      const want = Math.atan2(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z);
      this.turnTo(want, dt, 4.5);
      this.speed *= Math.max(0, 1 - dt * 8);
    } else if (this.state === 'doute') {
      // on continue son travail, mais la tête part vers le bruit
      this.behave(dt, game);
      const want = Math.atan2(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z);
      this.turnTo(want, dt, 1.6);
      this.speed *= Math.max(0, 1 - dt * 2.5);
    } else {
      this.behave(dt, game);
    }

    // Le regard précède le corps : la tête se tourne vers la dernière
    // position connue avant que le personnage ne pivote.
    const versJoueur = Math.atan2(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z);
    const interesse = !this.diversion && (this.state === 'doute' || this.state === 'observation');
    let ecart = versJoueur - this.yaw;
    while (ecart > Math.PI) ecart -= Math.PI * 2;
    while (ecart < -Math.PI) ecart += Math.PI * 2;
    const cibleRegard = interesse ? THREE.MathUtils.clamp(ecart, -1.1, 1.1) : 0;
    this.regard = (this.regard || 0) + (cibleRegard - (this.regard || 0)) *
      (1 - Math.exp(-(interesse ? 7 : 3) * dt));
    this.headYaw = this.yaw + this.regard;

    const distancePas = Math.hypot(this.pos.x - beforeX, this.pos.z - beforeZ);
    this.speed = dt > 0 ? distancePas / dt : 0;
    this.pasDistance = (this.pasDistance || 0) + distancePas;
    if (this.pasDistance > 0.75) {
      this.pasDistance %= 0.75;
      game.audio.step(0.8, this.pos);
    }
    this.animate(dt);
    this.updateVisuals(dt, game);
  }

  // Chaque passage d'état a son signal visuel : une posture, parfois
  // une réplique. C'est ce qui rend lisible « il est en train de me
  // repérer » sans avoir à lire la barre en haut de l'écran.
  onChangementEtat(avant, game) {
    if (this.state === 'doute') {
      this.sursaut = 1;                    // petit relèvement de tête
    } else if (this.state === 'observation') {
      this.sursaut = 1.4;
      game.secousse = Math.max(game.secousse || 0, 0.35);
      if (this.cfg.lines?.length && Math.random() < 0.8)
        this.say(this.cfg.lines[(Math.random() * this.cfg.lines.length) | 0]);
    } else if (this.state === 'travail' && ['doute', 'observation'].includes(avant)) {
      // fausse alerte : il hausse les épaules et se remet au travail
      this.hausseEpaules = 1;
      if (Math.random() < 0.35) this.say(HAUSSEMENTS[(Math.random() * HAUSSEMENTS.length) | 0], 1.8);
    }
  }

  behave(dt, game) {
    const k = this.cfg.kind;
    if (k === 'boss') this.bossBehaviour(dt, game);
    else if (k === 'patrol') this.patrolBehaviour(dt);
    else this.idleScan(dt);
  }

  idleScan(dt) {
    this.phase += dt * (this.cfg.scanSpeed ?? 0.5);
    const amp = (this.cfg.scanAmp ?? 45) * DEG;
    // balayage avec des pauses : sin adouci
    const s = Math.sin(this.phase);
    this.yaw = this.baseYaw + Math.sign(s) * Math.pow(Math.abs(s), 1.8) * amp;
    this.speed = 0;
  }

  patrolBehaviour(dt) {
    const wps = this.cfg.waypoints;
    if (!wps || !wps.length) return this.idleScan(dt);
    if (this.pauseT > 0) {
      this.pauseT -= dt;
      this.speed *= Math.max(0, 1 - dt * 6);
      // regarde autour pendant la pause
      this.phase += dt * 0.9;
      this.yaw = this.parkYaw + Math.sin(this.phase) * 55 * DEG;
      return;
    }
    const t = wps[this.routeIdx % wps.length];
    if (this.moveTo(t[0], t[1], this.cfg.speed ?? 1.5, dt)) {
      this.routeIdx++;
      this.parkYaw = this.yaw;
      this.phase = 0;
      this.pauseT = this.cfg.pause ?? 1.6;
    }
  }

  bossBehaviour(dt, game) {
    if (game.hunting) {
      // fin de réunion : le directeur part à la recherche de Lao D
      this.walking = true;
      if (this.seated) setStanding(this.parts);
      // Il repère Lao D toutes les 1,2 s et suit un chemin qui contourne les murs
      // et les bureaux (navigation.js). Sans chemin possible, il tente la ligne droite.
      this.huntT = (this.huntT ?? 0) - dt;
      this.bloqueT = (this.bloqueT ?? 0) + dt;
      if (this.bloqueT > 0.8) {  // n'avance plus : on recalcule tout de suite
        const avance = Math.hypot(this.pos.x - (this.bloqueX ?? 1e9), this.pos.z - (this.bloqueZ ?? 1e9));
        if (avance < 0.25) this.huntT = 0;
        this.bloqueT = 0; this.bloqueX = this.pos.x; this.bloqueZ = this.pos.z;
      }
      if (this.huntT <= 0 || !this.huntPath) {
        this.huntT = 1.2;
        const proie = (game.joueurs || [game.player]).reduce((m, j) => !m || Math.hypot(j.pos.x - this.pos.x, j.pos.z - this.pos.z) < Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z) ? j : m, null);
        const cible = { x: proie.pos.x, z: proie.pos.z };
        if (this.level.nav === undefined) this.level.nav = creerNavigation(this.level.obstacles);
        this.huntPath = chemin(this.level.nav, this.pos, cible) || [cible];
        this.huntIdx = 0;
      }
      const t = this.huntPath[this.huntIdx];
      if (this.moveTo(t.x, t.z, 2.1, dt) && this.huntIdx < this.huntPath.length - 1) this.huntIdx++;
      return;
    }

    if (this.bossPhase === 'sitting') {
      this.walking = false;
      this.idleScan(dt);
      this.sitTimer -= dt;
      if (this.sitTimer <= 0) {
        this.bossPhase = 'walking';
        this.startRoute(this.cfg.coffeeRoute, false);
        this.say('Je vais me chercher un café', 2.2);
      }
    } else if (this.bossPhase === 'walking') {
      const wps = this.route;
      const t = wps[this.routeIdx];
      if (this.moveTo(t[0], t[1], 1.7, dt)) {
        this.routeIdx++;
        if (this.routeIdx >= wps.length) {
          this.bossPhase = 'coffee';
          this.stateT = 0;
          this.say('Mmh… les KPI du trimestre', 2.6);
        }
      }
    } else if (this.bossPhase === 'coffee') {
      this.speed *= Math.max(0, 1 - dt * 5);
      this.phase += dt * 0.7;
      this.yaw = this.cfg.coffeeYaw + Math.sin(this.phase) * 70 * DEG;
      if (this.stateT > 6) {
        this.bossPhase = 'returning';
        this.route = [...this.cfg.coffeeRoute].reverse();
        this.routeIdx = 0;
      }
    } else if (this.bossPhase === 'returning') {
      const wps = this.route;
      const t = wps[this.routeIdx];
      if (this.moveTo(t[0], t[1], 1.6, dt)) {
        this.routeIdx++;
        if (this.routeIdx >= wps.length) {
          this.bossPhase = 'sitting';
          this.walking = false;
          setSeated(this.parts);
          this.yaw = this.baseYaw;
          this.sitTimer = (this.cfg.sitMin ?? 18) + Math.random() * (this.cfg.sitVar ?? 12);
        }
      }
    }
  }

  moveTo(tx, tz, speed, dt) {
    this.walking = true;
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.35) { this.speed = 0; return true; }
    this.speed = speed;
    this.pos.x += (dx / d) * speed * dt;
    this.pos.z += (dz / d) * speed * dt;
    collide(this.level.obstacles, this.pos, 0.36);
    this.turnTo(Math.atan2(dx, dz), dt, 5);
    return false;
  }

  turnTo(want, dt, rate) {
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * rate);
  }

  animate(dt) {
    const p = this.parts;
    // Poignets : paumes vers le bas au clavier, vers les cuisses le reste du temps.
    const clavier = this.isSeatedNow && !['lecture', 'etirement', 'cafe'].includes(this.occupation);
    const poignet = clavier ? POIGNET_CLAVIER : POIGNET_REPOS;
    const kp = 1 - Math.exp(-8 * dt);
    p.mainL.rotation.y += (poignet - p.mainL.rotation.y) * kp;
    p.mainR.rotation.y += (-poignet - p.mainR.rotation.y) * kp;
    if (this.isSeatedNow) {
      setSeated(p);
      const t = performance.now() * 0.001;

      // Boucle de bureau : on tape, puis on souffle, puis on s'étire,
      // puis on boit un café. Quelques secondes chacune, décalées par
      // personnage pour qu'ils ne soient jamais synchrones.
      this.occupationT = (this.occupationT ?? Math.random() * 12) + dt;
      if (this.occupationT > this.occupationDuree) {
        this.occupationT = 0;
        this.occupationDuree = 4 + Math.random() * 7;
        const choix = ['clavier', 'clavier', 'clavier', 'lecture', 'etirement', 'cafe'];
        this.occupation = choix[(Math.random() * choix.length) | 0];
      }
      const frappe = performance.now() * 0.012 + this.phase;

      if (this.occupation === 'etirement') {
        const u = Math.min(1, this.occupationT / 1.6);
        const arc = Math.sin(u * Math.PI);
        p.armL.rotation.x = -2.2 * arc; p.armR.rotation.x = -2.2 * arc;
        p.elbowL.rotation.x = -0.4 - arc * 0.6; p.elbowR.rotation.x = -0.4 - arc * 0.6;
        p.upper.rotation.x = 0.12 - arc * 0.35;
        p.head.rotation.x = -arc * 0.3;
      } else if (this.occupation === 'cafe') {
        const u = Math.min(1, this.occupationT / 2.2);
        const arc = Math.sin(u * Math.PI);
        p.armR.rotation.x = -0.5 - arc * 0.35;
        p.elbowR.rotation.x = -0.95 - arc * 1.15;
        p.elbowL.rotation.x = -0.85 + Math.sin(frappe * 2.1) * 0.05;
        p.upper.rotation.x = 0.12 - arc * 0.06;
        p.head.rotation.x = arc * 0.12;
      } else if (this.occupation === 'lecture') {
        p.elbowL.rotation.x = -0.75; p.elbowR.rotation.x = -0.70;
        p.upper.rotation.x = 0.18 + Math.sin(t * 0.7) * 0.02;
        // le regard balaie l'écran de gauche à droite
        p.head.rotation.y = Math.sin(t * 0.8 + this.phase) * 0.28;
        p.head.rotation.x = 0.08;
      } else {
        p.elbowL.rotation.x = -0.85 + Math.sin(frappe * 2.1) * 0.12;
        p.elbowR.rotation.x = -0.85 + Math.sin(frappe * 2.6 + 1) * 0.12;
        p.upper.rotation.x = 0.12 + Math.sin(t * 2.4 + this.phase) * 0.012;
        p.head.rotation.x = 0.06 + Math.sin(t * 3.1) * 0.02;
      }

      // le sursaut se superpose à tout le reste
      if (this.sursaut > 0) {
        this.sursaut = Math.max(0, this.sursaut - dt * 2.2);
        const e = this.sursaut * this.sursaut;
        p.upper.rotation.x -= e * 0.28;
        p.head.rotation.x -= e * 0.35;
      }
      if (this.hausseEpaules > 0) {
        this.hausseEpaules = Math.max(0, this.hausseEpaules - dt * 1.6);
        const e = Math.sin(this.hausseEpaules * Math.PI);
        p.armL.rotation.z = e * 0.3; p.armR.rotation.z = -e * 0.3;
      } else { p.armL.rotation.z = 0; p.armR.rotation.z = 0; }
    } else if (this.speed > 0.05) {
      this.phase += this.speed * 2.3 * dt;
      const s = Math.sin(this.phase), co = Math.cos(this.phase);
      const k = Math.min(1, this.speed / 2);
      p.legL.rotation.x = s * 0.52 * k;
      p.legR.rotation.x = -s * 0.52 * k;
      p.kneeL.rotation.x = Math.max(0, -s) * 0.9 * k;
      p.kneeR.rotation.x = Math.max(0, s) * 0.9 * k;
      p.footL.rotation.x = (-s * 0.26 - Math.max(0, -co) * 0.15) * k;
      p.footR.rotation.x = (s * 0.26 - Math.max(0, co) * 0.15) * k;
      p.armL.rotation.x = -s * 0.42 * k;
      p.armR.rotation.x = s * 0.42 * k;
      p.elbowL.rotation.x = -0.26; p.elbowR.rotation.x = -0.26;
      p.upper.rotation.x = 0.05;
      p.upper.rotation.y = -s * 0.09 * k;
      this._bob = -0.018 * (0.5 - 0.5 * Math.cos(2 * this.phase)) * k;
      if (this.sursaut > 0) {
        this.sursaut = Math.max(0, this.sursaut - dt * 2.2);
        p.upper.rotation.x -= this.sursaut * this.sursaut * 0.2;
      }
    } else {
      const r = Math.min(1, dt * 7);
      for (const key of ['legL', 'legR', 'armL', 'armR', 'kneeL', 'kneeR', 'footL', 'footR'])
        p[key].rotation.x += (0 - p[key].rotation.x) * r;
      p.upper.rotation.x += (0 - p.upper.rotation.x) * r;
      p.upper.rotation.y += (0 - p.upper.rotation.y) * r;
      this._bob = (this._bob || 0) * (1 - r);
    }
    p.head.rotation.y = (p.head.rotation.y || 0) * 0.5 + (this.regard || 0) * 0.55;
    animerVisage(p, dt, { tension: this.suspicion, parle: !!this.bubble });
    this.apply();
  }

  updateVisuals(dt, game) {
    // cône
    this.cone.visible = game.showCones;
    this.cone.position.set(this.pos.x, 0.04, this.pos.z);
    this.cone.rotation.y = this.headYaw;
    // Le cône change de couleur par PALIER, pas continûment : on doit
    // pouvoir lire l'état d'un collègue d'un coup d'œil.
    const s = this.suspicion;
    const teintes = { travail: [0.11, 0.30], doute: [0.09, 0.46], observation: [0.03, 0.62], repere: [0.0, 0.70] };
    const [teinte, opac] = teintes[this.state] || teintes.travail;
    this.coneMat.color.setHSL(teinte, this.state === 'travail' ? 0.75 : 1, 0.58);
    this.coneMat.opacity = opac + (this.state === 'observation' ? Math.sin(performance.now() * 0.008) * 0.09 : 0);

    // icônes : « ? » quand il doute, « ! » quand il observe
    this.icon.visible = this.state === 'doute';
    this.bang.visible = this.state === 'observation' || this.state === 'repere';
    if (this.bang.visible) {
      const pulse = 1 + Math.sin(performance.now() * 0.011) * 0.12;
      this.bang.scale.set(0.65 * pulse, 0.65 * pulse, 1);
    }
    const bob = Math.sin(performance.now() * 0.006) * 0.06;
    this.icon.position.y = 2.15 + bob;
    this.bang.position.y = 2.15 + bob;
    this.label.material.opacity = game.showLabels ? 0.85 : 0;

    if (this.bubble) {
      this.bubbleT -= dt;
      this.bubble.material.opacity = THREE.MathUtils.clamp(this.bubbleT, 0, 1);
      if (this.bubbleT <= 0) { libererArbre(this.bubble); this.bubble = null; }
    }
  }

  // Retire complètement le PNJ de la scène (changement de niveau).
  dispose() {
    libererArbre(this.mesh);
    libererArbre(this.cone);
    this.bubble = null;
  }

  reset() {
    this.suspicion = 0;
    this.state = 'idle';
    this.diversion = null; this.vue = null; this.sawThisFrame = false; this.heardThisFrame = false;
    this.pasDistance = 0; this.speed = 0; this.regard = 0;
    this.pos.set(this.cfg.x, 0, this.cfg.z);
    this.yaw = this.headYaw = this.baseYaw;
    this.routeIdx = 0;
    this.pauseT = 0;
    this.walking = false;
    this.bossPhase = 'sitting';
    this.sitTimer = (this.cfg.sitMin ?? 16) + Math.random() * (this.cfg.sitVar ?? 10);
    this.huntT = 0; this.huntPath = null; this.bloqueT = 0;
    if (this.seated) setSeated(this.parts);
    if (this.bubble) { libererArbre(this.bubble); this.bubble = null; }
    this.apply();
  }
}

function setStanding(parts) {
  for (const k of ['legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR',
                   'armL', 'armR', 'elbowL', 'elbowR'])
    parts[k].rotation.x = 0;
}

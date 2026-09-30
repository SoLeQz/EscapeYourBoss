// ============================================================
//  Décor interactif et secrets des étages (1.9).
//
//  Le niveau (level.js) pose les accessoires Blender et décrit leurs règles ;
//  ce module les fait vivre : distributeur (diversion à retardement), disjoncteur
//  (lumière coupée, regards raccourcis), carton-cachette, aspirateur robot qui
//  bipe quand on le frôle, machine à café, et la salle de sieste clandestine
//  (étagère pivotante, hamac, bouton rouge, borne d'arcade). Les canards de
//  débogage se ramassent en passant. `jeu` fournit player, npcs, audio, ui,
//  hunting et quelques rappels (decouvrir, ramasserCanard, eclairage).
// ============================================================
import * as THREE from 'three';
import { collide, hasLOS } from './level.js';
import { actionAccessible } from './office.js';
import { makeLabelSprite } from './characters.js';
import { lotsAccessoire } from './accessoires-blender.js';

export const DELAI_DISTRIBUTEUR = 4, PORTEE_DISTRIBUTEUR = 12, DUREE_DISTRIBUTEUR = 6;
export const DUREE_OBSCURITE = 14, VUE_OBSCURITE = 0.55;
// Dans le carton : immobile, un carton est un carton ; en marche, il intrigue.
export const DISCRETION_CARTON = { immobile: 0.06, marche: 0.45 };
export const VITESSE_CARTON = 0.8;
export const PORTEE_CANARD = 1.0;
const PORTEE_ROBOT = 0.75, VITESSE_ROBOT = 0.45;
const SIESTE = 20, RECHARGE_CAFE = 25;

const MARQUEURS = {
  distributeur: ['DISTRIBUTEUR', 'Diversion à retardement'], disjoncteur: ['DISJONCTEUR', `Lumière coupée ${DUREE_OBSCURITE} s`],
  carton: ['CARTON', 'Cachette mobile'], cafe: ['MACHINE À CAFÉ', 'Endurance au maximum'],
};
const TYPES = new Set(['distributeur', 'disjoncteur', 'carton', 'cafe', 'passage', 'sieste', 'arcade', 'bouton']);
const REPLIQUES_DISTRIBUTEUR = ['Qui tape sur le distributeur ?', 'Encore coincé, ce truc…', 'Il a encore mangé une pièce ?'];
const REPLIQUES_NOIR = ['Qui a éteint ?!', 'Hé ! On n’y voit rien !', 'C’est une coupure ?'];

export class Interactifs {
  constructor(jeu) { this.jeu = jeu; this.liste = []; this.canards = []; this.robots = []; }

  preparer(level) {
    this.level = level;
    this.liste = level.accessoires.filter(a => TYPES.has(a.type));
    this.robots = level.accessoires.filter(a => a.type === 'aspirateur');
    this.canards = level.canards;
    this.nacelle = level.accessoires.find(a => a.id === 'nacelle') || null;
    this.toboggan = level.accessoires.find(a => a.id === 'toboggan') || null;
    const R = level.repere;
    for (const it of this.liste) {
      it.origine = { x: it.x, z: it.z };
      const m = MARQUEURS[it.type];
      if (!m) continue;
      it.marker = makeLabelSprite(m[0], m[1]);
      it.marker.position.set(R.x(it.x), 1.9, R.z(it.z)); it.marker.scale.multiplyScalar(0.85);
      it.marker.visible = false; level.root.add(it.marker);
    }
    for (const it of this.liste.filter(a => a.type === 'arcade')) this.ecranArcade(it);
    this.reinitialiser();
  }

  reinitialiser() {
    this.obscurite = 0; this.disco = 0; this.bruitRobot = 0;
    this.jeu.discoLumieres?.(0); this.level.nav = undefined;
    for (const it of this.liste) {
      it.utilise = false; it.etat = 'pret'; it.t = 0; it.porteDistant = false;
      if (it.groupe) it.groupe.visible = true;
      if (it.type === 'carton') this.poserCarton(it, it.origine.x, it.origine.z, it.yaw);
      if (it.type === 'passage') { it.ouvert = false; it.obstacle.noClip = false; it.obstacle.seeThrough = false; if (it.roles.porte) it.roles.porte.rotation.y = 0; }
      if (it.type === 'bouton' && it.roles.bouton) it.roles.bouton.position.y = it.roles.bouton.userData.y0 ?? (it.roles.bouton.userData.y0 = it.roles.bouton.position.y);
      if (it.type === 'disjoncteur' && it.roles.levier) it.roles.levier.rotation.x = 0;
    }
    for (const r of this.robots) { r.i = 1; r.bipT = 0; r.pos = { x: r.route[0][0], z: r.route[0][1] }; r.yawR = 0; this.placer(r.groupe, r.pos.x, r.pos.z, r.yawR); }
    for (const c of this.canards) { c.pris = false; this.montrerCanard(c, true); }
    if (this.toboggan?.roles.trappe) this.toboggan.roles.trappe.rotation.x = 0;
    if (this.nacelle) this.nacelle.groupe.position.y = -0.02;
    this.eclairage(false);
    const p = this.jeu.player;
    for (const acteur of [p, ...(this.jeu.coequipiers?.values() || [])]) if (acteur?.deguisement === 'carton') { acteur.deguisement = null; acteur.mesh.visible = true; }
  }

  // Place un objet mobile (repère d'origine sous la racine retournée de l'étage).
  placer(groupe, x, z, yaw) {
    const R = this.level.repere;
    groupe.position.x = R.x(x); groupe.position.z = R.z(z);
    if (yaw != null) groupe.rotation.y = R.yaw(yaw);
  }

  // ---------------------------------------------------------- interactions
  accessibles(player) {
    return this.liste.filter(it => {
      if (it.type === 'passage' && it.ouvert) return false;
      if (it.type === 'carton' && it.porte) return it.porte === player;
      // le carton entoure son propre point d'interaction : la distance suffit
      if (it.type === 'carton') return !it.porteDistant && Math.hypot(it.x - player.pos.x, it.z - player.pos.z) < it.r &&
        hasLOS(this.level.obstacles.filter(o => o !== it.obstacle), {x:player.pos.x,y:.65,z:player.pos.z}, {x:it.x,y:.65,z:it.z});
      return actionAccessible(it, player, this.level.obstacles);
    });
  }
  libelle(it, player) {
    if (it.type === 'carton') return it.porte === player ? 'Sortir du carton' : it.label;
    if (it.type === 'distributeur') return it.utilise ? 'Distributeur en panne (merci)' : it.label;
    if (it.type === 'disjoncteur') return it.utilise ? 'Disjoncteur déjà basculé' : it.label;
    if (it.type === 'cafe') return it.t > 0 ? `Café en cours · ${Math.ceil(it.t)} s` : it.label;
    if (it.type === 'sieste') return it.utilise ? 'Déjà reposé' : it.label;
    return it.label;
  }

  interagir(it, player = this.jeu.player) {
    const { audio, ui } = this.jeu;
    switch (it.type) {
      case 'distributeur':
        if (it.utilise) { ui.toast('Le distributeur boude', 'Une diversion par étage.'); return; }
        it.utilise = true; it.etat = 'moteur'; it.t = DELAI_DISTRIBUTEUR;
        audio.distributeur(it.source);
        ui.toast('Snack commandé', `Le paquet va se coincer dans ${DELAI_DISTRIBUTEUR} s. Éloigne-toi.`);
        return;
      case 'disjoncteur':
        if (it.utilise) { ui.toast('Déjà fait', 'Le disjoncteur ne se laisse pas avoir deux fois.'); return; }
        it.utilise = true; this.obscurite = DUREE_OBSCURITE;
        if (it.roles.levier) it.roles.levier.rotation.x = 1.2;
        audio.disjoncteur(false, it);
        this.eclairage(true);
        ui.toast('Lumière coupée', `Les regards portent moins loin pendant ${DUREE_OBSCURITE} s.`);
        for (const n of this.jeu.npcs) if (Math.random() < 0.5) n.say(REPLIQUES_NOIR[(Math.random() * REPLIQUES_NOIR.length) | 0], 2);
        this.jeu.decouvrir?.('disjoncteur');
        return;
      case 'carton':
        if (it.porte === player) return this.sortirCarton(it, player);
        if (player.deguisement || it.porte) return;
        it.porte = player; player.deguisement = 'carton'; player.working = null; player.emote = null; player.vel.set(0,0,0);
        it.obstacle.noClip = true; it.obstacle.seeThrough = true;
        this.level.nav = undefined;
        player.mesh.visible = false; player.outline.visible = false; if (it.roles.yeux) it.roles.yeux.visible = true;
        audio.froissement(it);
        ui.toast('Tu es un carton', 'Très discret immobile. Bouger attire les regards.');
        this.jeu.decouvrir?.('carton');
        return;
      case 'cafe':
        if (it.t > 0) return;
        it.t = RECHARGE_CAFE; player.stamina = 1; player.epuise = false; player.stress = Math.max(0, player.stress - 0.25);
        audio.cafe(it);
        ui.toast('Café serré', 'Endurance au maximum. Le directeur passe souvent ici.');
        this.jeu.decouvrir?.('cafe');
        return;
      case 'passage':
        if (it.ouvert) return;
        it.ouvert = true; it.t = 0;
        it.obstacle.noClip = true; it.obstacle.seeThrough = true; this.level.nav = undefined;
        this.jeu.minimap && (this.jeu.minimap.fondNiveau = null);
        audio.door(it);
        ui.toast('Une pièce secrète !', 'La salle de sieste clandestine… et son toboggan d’évacuation.', 4);
        this.jeu.decouvrir?.('salle-secrete');
        return;
      case 'sieste':
        if (it.utilise) return;
        it.utilise = true;
        audio.ronflement(it);
        if (!this.jeu.hunting) this.jeu.timeLeft = Math.max(1, this.jeu.timeLeft - SIESTE);
        ui.flash?.();
        ui.toast('Zzz…', this.jeu.hunting ? 'Pas le moment de dormir.' : `Tu t’es assoupi ${SIESTE} secondes. La réunion, elle, a continué.`, 4);
        this.jeu.decouvrir?.('sieste');
        return;
      case 'arcade':
        it.t = 4; audio.arcade(it);
        ui.toast('ESCAPE YOUR BOSS — 1985', 'MEILLEUR SCORE : LAO D · 999 999. Imbattable.');
        this.jeu.decouvrir?.('arcade');
        return;
      case 'bouton':
        if (it.t > 0) return;
        it.t = 0.5; this.disco = 6;
        audio.disco();
        ui.toast('Tu as appuyé.', 'Évidemment. Il était écrit « NE PAS APPUYER ».', 4);
        // Tout l'étage entend la musique et regarde vers la salle secrète.
        for (const n of this.jeu.npcs) {
          if (n.suspicion >= 0.52 || (this.jeu.hunting && n.isBoss)) continue;
          n.diversion = { x: it.x, z: it.z, t: 3 };
          if (Math.random() < 0.4) n.say('C’est quoi cette musique ?', 2);
        }
        this.jeu.decouvrir?.('bouton');
        return;
    }
  }

  poserCarton(it, x, z, yaw) {
    it.porte = null; it.x = x; it.z = z; this.level.nav = undefined;
    Object.assign(it.obstacle, { x1: x - 0.41, x2: x + 0.41, z1: z - 0.41, z2: z + 0.41, noClip: false, seeThrough: false });
    this.placer(it.groupe, x, z, yaw);
    if (it.roles.yeux) it.roles.yeux.visible = false;
  }
  sortirCarton(it, player) {
    // Déposer le carton sur une place libre, sans téléporter le joueur dans un mur.
    const obstacles = this.level.obstacles.filter(o => o !== it.obstacle);
    let place = null;
    for (let i = 0; i < 8; i++) {
      const a = player.yaw + i * Math.PI / 4;
      const p = new THREE.Vector3(player.pos.x + Math.sin(a) * 1.05, 0, player.pos.z + Math.cos(a) * 1.05);
      if (Math.abs(p.x) > 19.35 || Math.abs(p.z) > 15.35) continue;
      const avant = p.clone(); collide(obstacles, p, .59);
      if (p.distanceTo(avant) < .01) { place = p; break; }
    }
    if (!place) { this.jeu.ui.toast('Pas assez de place', 'Avance un peu pour déposer le carton.'); return; }
    this.poserCarton(it, place.x, place.z, player.yaw);
    player.deguisement = null; player.mesh.visible = true;
    this.jeu.audio.froissement(it);
  }
  // Un joueur doit sortir du carton pour prendre une sortie.
  carton(player) { return this.liste.find(it => it.type === 'carton' && it.porte === player) || null; }

  // ---------------------------------------------------------- perception
  // Coefficient appliqué à ce que perçoit un collègue (npc.js).
  discretion(player) {
    if (player.deguisement !== 'carton') return 1;
    return player.moving ? DISCRETION_CARTON.marche : DISCRETION_CARTON.immobile;
  }

  eclairage(coupe) {
    for (const n of this.jeu.npcs || []) {
      n.vueBase ??= n.viewDist;
      n.viewDist = n.vueBase * (coupe ? VUE_OBSCURITE : 1);
      n.cone.scale.set(coupe ? VUE_OBSCURITE : 1, 1, coupe ? VUE_OBSCURITE : 1);
    }
    this.jeu.eclairageCoupe?.(coupe);
  }

  // ---------------------------------------------------------- vie de l'étage
  mettreAJour(dt, distant = false) {
    const { player, audio } = this.jeu;
    for (const it of this.liste) {
      if (it.marker) it.marker.visible = !it.utilise && !it.porte && Math.hypot(it.x - player.pos.x, it.z - player.pos.z) < 6
        && actionAccessible({ ...it, r: 6 }, player, this.level.obstacles);
      if (!distant && it.type === 'distributeur' && it.etat === 'moteur' && (it.t -= dt) <= 0) {
        it.etat = 'coince'; audio.clang(it.source);
        this.jeu.bruitDistributeur?.(it);
        diversionDistributeur(it.source, this.jeu.npcs, this.jeu.hunting);
      }
      if (it.type === 'cafe' && it.t > 0) it.t = Math.max(0, it.t - dt);
      if (it.type === 'passage' && it.ouvert && it.roles.porte && it.t < 1) {
        it.t = Math.min(1, it.t + dt / 1.2);
        it.roles.porte.rotation.y = Math.PI / 2 * (1 - (1 - it.t) ** 3);
      }
      if (it.type === 'bouton' && it.roles.bouton) {
        if (it.t > 0) it.t = Math.max(0, it.t - dt);
        it.roles.bouton.position.y = it.roles.bouton.userData.y0 - (it.t > 0 ? 0.02 : 0);
      }
      if (it.type === 'arcade' && it.ecran) this.animerArcade(it, dt);
      if (it.type === 'carton' && it.porte) {
        this.placer(it.groupe, it.porte.pos.x, it.porte.pos.z, it.porte.yaw);
        it.porte.mesh.visible = false; it.porte.outline.visible = false;
      }
    }
    if (this.obscurite > 0 && (this.obscurite -= dt) <= 0) {
      this.eclairage(false); audio.disjoncteur(true);
      this.jeu.ui.toast('La lumière revient', 'Les regards portent de nouveau loin.');
    }
    if (this.disco > 0) { this.disco = Math.max(0, this.disco - dt); this.jeu.discoLumieres?.(this.disco); }
    if (!distant) for (const r of this.robots) this.avancerRobot(r, dt);
    for (const c of this.canards) {
      if (c.pris || player.deguisement || this.jeu.mode === 'multi' && this.jeu.multi.sortiLocal) continue;
      if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < PORTEE_CANARD &&
          hasLOS(this.level.obstacles, {x:player.pos.x,y:player.eyeY,z:player.pos.z}, {x:c.x,y:c.y+.26,z:c.z})) {
        c.pris = true; this.montrerCanard(c, false); audio.couac(c);
        this.jeu.ramasserCanard?.(c);
      }
    }
  }

  montrerCanard(c, visible) {
    const m = visible ? c.matrice : new THREE.Matrix4().makeScale(0, 0, 0);
    for (const im of c.instances || []) { im.setMatrixAt(c.index, m); im.instanceMatrix.needsUpdate = true; }
  }

  // Aspirateur robot : il suit sa ronde, et bipe fort si on le frôle.
  avancerRobot(r, dt) {
    const [tx, tz] = r.route[r.i % r.route.length];
    const dx = tx - r.pos.x, dz = tz - r.pos.z, d = Math.hypot(dx, dz);
    const cible = Math.atan2(dx, dz);
    let ecart = cible - r.yawR; ecart = Math.atan2(Math.sin(ecart), Math.cos(ecart));
    if (Math.abs(ecart) > 0.05) r.yawR += Math.sign(ecart) * Math.min(Math.abs(ecart), 2.4 * dt);
    else if (d < 0.05) r.i++;
    else { const pas = Math.min(d, VITESSE_ROBOT * dt); r.pos.x += dx / d * pas; r.pos.z += dz / d * pas; }
    this.placer(r.groupe, r.pos.x, r.pos.z, r.yawR);
    r.bipT = Math.max(0, (r.bipT || 0) - dt);
    for (const p of this.jeu.joueurs || [this.jeu.player]) {
      if (r.bipT > 0 || !p.mesh.visible && !p.deguisement) continue;
      if (Math.hypot(p.pos.x - r.pos.x, p.pos.z - r.pos.z) < PORTEE_ROBOT) {
        r.bipT = 3; this.jeu.audio.bipRobot(r.pos);
        this.jeu.ui.toast('« Obstacle détecté. »', 'L’aspirateur t’a signalé à tout l’étage.');
        for (const n of this.jeu.npcs) {
          const dn = Math.hypot(n.pos.x - r.pos.x, n.pos.z - r.pos.z);
          if (dn < 8) { n.suspicion = Math.min(0.95, n.suspicion + 0.3 * (1 - dn / 8) + 0.1); n.lastSeen.set(r.pos.x, 0, r.pos.z); }
        }
        this.jeu.decouvrir?.('aspirateur');
      }
    }
  }

  // Écran de la borne : une vraie petite animation sur canvas, rafraîchie à 10 Hz.
  ecranArcade(it) {
    // après la fusion du décor, le groupe de la borne est vide : on vérifie le modèle chargé
    if (!lotsAccessoire('borne-arcade').length || typeof document === 'undefined') return;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 96;
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    // L'écran Blender n'a pas d'UV utiles : on le remplace par un plan texturé.
    // posé sur l'écran de la borne (creer_accessoires.py : centre (0 ; 1,35 ; 0,142), incliné de 0,2 rad)
    const plan = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.34), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    plan.position.set(0, 1.35, 0.147); plan.rotation.x = -0.2; plan.userData.noFusion = true;
    if (this.level.repere.miroir) plan.scale.x = -1;
    it.groupe.add(plan);
    it.ecran = { cv, tex, plan, t: 0, image: -1 };
    this.animerArcade(it, 0);
  }
  animerArcade(it, dt) {
    const e = it.ecran; e.t += dt; if (it.t > 0) it.t = Math.max(0, it.t - dt);
    const image = Math.floor(e.t * 10); if (image === e.image) return; e.image = image;
    const g = e.cv.getContext('2d');
    g.fillStyle = '#0a0f2c'; g.fillRect(0, 0, 128, 96);
    for (let i = 0; i < 18; i++) { g.fillStyle = i % 3 ? '#3450a0' : '#8fb0ff'; g.fillRect((i * 37 + image * (1 + i % 3)) % 128, (i * 23) % 96, 1, 1); }
    g.fillStyle = '#ffd23a'; g.font = 'bold 11px monospace'; g.textAlign = 'center';
    g.fillText('ESCAPE', 64, 22); g.fillText('YOUR BOSS', 64, 35);
    // Lao D (pixel) court vers la droite, poursuivi par le directeur
    const x = (image * 3) % 150 - 20;
    g.fillStyle = '#f1c096'; g.fillRect(x, 58, 6, 6); g.fillStyle = '#4c5464'; g.fillRect(x, 64, 6, 10);
    g.fillStyle = '#e6b288'; g.fillRect(x - 26, 56, 7, 7); g.fillStyle = '#2b3140'; g.fillRect(x - 26, 63, 7, 11);
    g.fillStyle = it.t > 0 ? '#49f28a' : (image % 10 < 6 ? '#ff3d8b' : '#0a0f2c');
    g.font = 'bold 9px monospace';
    g.fillText(it.t > 0 ? 'HI-SCORE LAO D 999999' : 'INSERT COIN', 64, 90);
    e.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------- multijoueur
  // L'hôte fait autorité : un état compact dans chaque instantané du monde.
  etat() {
    return {
      o: this.obscurite, d: this.disco,
      a: this.liste.map(it => ({ u: !!it.utilise, e: it.etat, t: it.t, ouvert: !!it.ouvert,
        x: it.x, z: it.z, porteur: it.porte ? (it.porte.reseauId || this.jeu.multi?.id || 1) : 0 })),
      r: this.robots.map(r => [r.pos.x, r.pos.z, r.yawR]),
    };
  }
  appliquerEtat(s) {
    if (!s || !Array.isArray(s.a)) return;
    if ((s.o > 0) !== (this.obscurite > 0)) this.eclairage(s.o > 0);
    if (this.disco > 0 && !(s.d > 0)) this.jeu.discoLumieres?.(0);
    this.obscurite = Math.max(0, s.o || 0); this.disco = Math.max(0, s.d || 0);
    s.a.forEach((v, i) => {
      const it = this.liste[i]; if (!it || !v) return;
      if (it.type === 'distributeur' && v.e === 'coince' && it.etat !== 'coince') this.jeu.audio.clang(it.source);
      it.utilise = !!v.u; it.etat = v.e;
      if (it.type !== 'passage') it.t = v.t || 0;
      if (it.type === 'carton') {
        const acteur = v.porteur === this.jeu.multi?.id ? this.jeu.player : this.jeu.coequipiers?.get(v.porteur) || null;
        if (it.porte && it.porte !== acteur) { it.porte.deguisement = null; it.porte.mesh.visible = true; }
        if (acteur) {
          it.porte = acteur; acteur.deguisement = 'carton'; acteur.working = null; acteur.emote = null;
          acteur.mesh.visible = false; acteur.outline.visible = false;
          it.obstacle.noClip = it.obstacle.seeThrough = true;
          this.placer(it.groupe, acteur.pos.x, acteur.pos.z, acteur.yaw);
          if (it.roles.yeux) it.roles.yeux.visible = true;
        } else if (it.porte || it.x !== v.x || it.z !== v.z) this.poserCarton(it, v.x, v.z, it.yaw);
      } else if (it.type === 'passage' && v.ouvert && !it.ouvert) {
        it.ouvert = true; it.t = 0; it.obstacle.noClip = it.obstacle.seeThrough = true;
        this.level.nav = undefined; this.jeu.minimap && (this.jeu.minimap.fondNiveau = null);
      } else if (it.type === 'disjoncteur' && v.u && it.roles.levier) it.roles.levier.rotation.x = 1.2;
    });
    s.r?.forEach((v, i) => { const r = this.robots[i]; if (r) { r.pos = { x: v[0], z: v[1] }; r.yawR = v[2]; this.placer(r.groupe, v[0], v[1], v[2]); } });
  }
}

// Le paquet coincé fait un vacarme : ceux qui l'entendent (12 m) regardent la
// machine 6 s. Même règle que la photocopieuse : un collègue déjà méfiant, ou le
// directeur en traque, ne se laisse pas distraire.
export function diversionDistributeur(source, npcs, hunting = false) {
  let n = 0;
  for (const c of npcs) {
    if ((hunting && c.isBoss) || c.suspicion >= 0.52 || Math.hypot(c.pos.x - source.x, c.pos.z - source.z) > PORTEE_DISTRIBUTEUR) continue;
    c.diversion = { x: source.x, z: source.z, t: DUREE_DISTRIBUTEUR };
    if (Math.random() < 0.6) c.say(REPLIQUES_DISTRIBUTEUR[(Math.random() * REPLIQUES_DISTRIBUTEUR.length) | 0], 2.4);
    n++;
  }
  return n;
}

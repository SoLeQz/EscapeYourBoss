import { animerMainsBlender } from './anatomie-blender.js';
import * as THREE from 'three';
import { makeCharacter, animerVisage, HEIGHT, COU } from './characters.js';
import { collide } from './level.js';
import { EMOTES, adoucir, POIGNET_REPOS, POIGNET_CLAVIER } from './emotes.js';

// Rapproche `v` de `cible` à un rythme indépendant du débit d'images.
// Un simple lerp(dt * k) accélère quand le jeu rame : la sensation de
// contrôle change avec les images par seconde, ce qui est inacceptable.
export function amortir(v, cible, taux, dt) {
  return v + (cible - v) * (1 - Math.exp(-taux * dt));
}

// Lao D — l'employé qui veut juste rentrer chez lui.
export class Player {
  // `look` : apparence du coéquipier en multijoueur (même silhouette, autres couleurs).
  constructor(scene, level, look = null) {
    this.level = level;
    this.decalage = { x: 0, z: 0 };   // multijoueur : point de départ à côté de l'autre joueur
    const { group, parts } = makeCharacter({
      chemise: 0xf2ead8, pantalon: 0x555a66, cheveux: 0x14100d, peau: 0xf1c096,
      veste: 0x4c5464, cravate: 0x82333d,
      lunettes: true, sac: true, badge: true, ...look,
    });
    this.mesh = group;
    this.parts = parts;
    this.mesh.position.set(level.playerStart.x, 0, level.playerStart.z);
    this.mesh.rotation.y = level.playerStart.yaw;
    scene.add(this.mesh);

    // contour (BackSide agrandi) affiché quand on chauffe
    this.outline = this.mesh.clone(true);
    this.outlineMat = new THREE.MeshBasicMaterial({
      color: 0xffd24a, side: THREE.BackSide, transparent: true, opacity: 0.9, depthWrite: false,
    });
    this.outline.traverse(o => { if (o.isMesh) { o.material = this.outlineMat; o.castShadow = false; } });
    this.outline.scale.setScalar(1.07);
    this.outline.visible = false;
    scene.add(this.outline);
    this._srcNodes = []; this.mesh.traverse(o => this._srcNodes.push(o));
    this._dstNodes = []; this.outline.traverse(o => this._dstNodes.push(o));

    this.pos = new THREE.Vector3(level.playerStart.x, 0, level.playerStart.z);
    this.vel = new THREE.Vector3();
    this.yaw = level.playerStart.yaw;
    this.radius = 0.34;

    this.crouch = 0;          // 0 = debout, 1 = accroupi
    this.wantCrouch = false;
    this.running = false;
    this.moving = false;
    this.speed = 0;
    this.phase = 0;
    this.stamina = 1;
    this.epuise = false;
    this.stress = 0;
    this.inCover = false;
    this.footstepCb = null;
    this._lastStepSign = 1;
    // Pose de marche, gardée hors du squelette : voir animate().
    this._pose = {
      legL: 0, legR: 0, kneeL: 0, kneeR: 0, footL: 0, footR: 0,
      armL: 0, armR: 0, elbowL: -0.22, elbowR: -0.22,
      armLz: this.parts.anatomieBlender ? -.03 : .06, armRz: this.parts.anatomieBlender ? .03 : -.06, upperY: 0, upperZ: 0,
    };
    this.emote = null;
    this.derniereEmote = null;
    this.emoteCb = null;
    this._pointAppui = new THREE.Vector3();
    this.tempsAnimation = 0;
    // Points de la semelle en repère cheville, calculés une fois, jamais de
    // parcours de géométrie pendant l'animation. Appui exact du modèle courant.
    this._appuis = [parts.footL,parts.footR].map(foot=>{
      foot.updateWorldMatrix(true,true);
      const inverse=foot.matrixWorld.clone().invert(),points=new Map();
      foot.traverse(o=>{
        if(!o.isMesh)return;
        const matrice=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld),a=o.geometry.attributes.position;
        for(let i=0;i<a.count;i++){
          const v=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(matrice);
          if(v.y<-.014)points.set(v.toArray().map(x=>x.toFixed(5)).join(','),v);
        }
      });
      return {foot,points:[...points.values()]};
    });
  }

  hauteurPose(hauteur) {
    const c = this.crouch;
    const hanche = .04 + .43 * Math.cos(c * 1.15) + .38 * Math.cos(c * 1.05);
    return hanche - c * .015 + (hauteur - HEIGHT.hip) * Math.cos(c * .62)
      + (this.workBlend || 0) * HEIGHT.seatOffset + Math.max(0, this.parts.root.position.y - .85);
  }
  get chestY() { return this.hauteurPose(HEIGHT.chest); }
  // Les yeux suivent aussi la tête relevée autour de la base du crâne (pivoterCou) :
  // accroupi, la tête bascule de c·0,55 en arrière sur un buste penché de c·0,62.
  get eyeY() {
    const c = this.crouch, a = -c * 0.55, b = c * 0.62;
    const dy = COU * (Math.cos(a) - 1), dz = COU * Math.sin(a);
    return this.hauteurPose(HEIGHT.eye) + dy * Math.cos(b) - dz * Math.sin(b);
  }

  // Bruit émis : entendu par les collègues même sans ligne de vue.
  get noiseRadius() {
    if (!this.moving) return 0;
    if (this.crouch > 0.6) return 1.4;
    return this.running ? 5.2 : 3.0;
  }

  reset() {
    this.pos.set(this.level.playerStart.x + this.decalage.x, 0, this.level.playerStart.z + this.decalage.z);
    this.yaw = this.level.playerStart.yaw;
    this.vel.set(0, 0, 0);
    this.crouch = 0; this.wantCrouch = false;
    this.stress = 0; this.stamina = 1;
    this.epuise = false;
    this.running = false; this.moving = false; this.speed = 0;
    this.inclinaison = 0; this.inCover = false; this.crispation = 0; this.menace = 0;
    this.exitPose = null; this.workBlend = 0;
    this.emote = null; this.working = null; this.workT = 0; this._bob = 0;
    this._lastStepSign = 1;
    // sinon on réapparaît figé dans la foulée où on s'est fait prendre
    Object.assign(this._pose, {
      legL: 0, legR: 0, kneeL: 0, kneeR: 0, footL: 0, footR: 0,
      armL: 0, armR: 0, elbowL: -0.22, elbowR: -0.22,
      armLz: this.parts.anatomieBlender ? -.03 : .06, armRz: this.parts.anatomieBlender ? .03 : -.06, upperY: 0, upperZ: 0,
    });
    this.phase = 0; this.oisif = 0; this.regard = 0; this.tempsAnimation = 0;
  }

  update(dt, input, camYaw) {
    // --- intention de déplacement, relative à la caméra ---
    let ix = 0, iz = 0;
    if (input.actif('avancer')) iz += 1;
    if (input.actif('reculer')) iz -= 1;
    if (input.actif('gauche')) ix -= 1;
    if (input.actif('droite')) ix += 1;

    const len = Math.hypot(ix, iz);
    this.moving = len > 0.01;
    if (this.moving || input.actif('accroupir') || input.bascules.accroupir) this.working = null;
    // On ne danse pas en marchant : dès que le joueur redonne une
    // direction, l'emote se coupe proprement (le poids redescend).
    const accroupir = input.actif('accroupir') || !!input.bascules.accroupir;
    if ((this.moving || accroupir) && this.emote) this.emote.coupee = true;
    let dirX = 0, dirZ = 0;
    if (this.moving) {
      ix /= len; iz /= len;
      // repère caméra : avant = (sin yaw, cos yaw), droite écran = (-cos yaw, sin yaw)
      const s = Math.sin(camYaw), c = Math.cos(camYaw);
      dirX = -ix * c + iz * s;
      dirZ = ix * s + iz * c;
    }

    // --- accroupi ---
    this.wantCrouch = (!this.emote || this.emote.coupee) && !this.working && accroupir;
    this.crouch = amortir(this.crouch, this.wantCrouch ? 1 : 0, 9, dt);

    // --- course : consomme l'endurance ---
    const wantRun = input.actif('courir') && this.crouch < 0.4;
    // Hystérésis : maintenir Maj à vide ne doit pas faire osciller
    // vitesse, animation et champ de caméra à chaque image.
    if (this.stamina <= 0.03) this.epuise = true;
    if (this.stamina >= 0.28) this.epuise = false;
    this.running = wantRun && this.moving && !this.epuise;


    // --- vitesse : on pilote un VECTEUR vitesse, pas un scalaire ---
    //
    // Avec un scalaire, changer de direction fait pivoter le déplacement
    // instantanément : c'est ce qui donnait la sensation de grille. Ici la
    // vitesse doit être infléchie, donc un demi-tour décrit une courbe.
    const vMax = this.running ? 5.0 : THREE.MathUtils.lerp(2.9, 1.3, this.crouch);
    const cibleX = dirX * vMax, cibleZ = dirZ * vMax;

    // Relancer coûte plus cher que freiner, et on n'attaque jamais un
    // virage serré à pleine vitesse.
    const vitesseActuelle = Math.hypot(this.vel.x, this.vel.z);
    let accel = this.moving ? (this.running ? 13 : 11) : 17;
    if (this.moving && vitesseActuelle > 0.4) {
      const cap = (this.vel.x * dirX + this.vel.z * dirZ) / vitesseActuelle;
      accel *= 0.55 + 0.45 * Math.max(0, cap);      // virage serré = reprise plus lente
    }
    const k = 1 - Math.exp(-accel * dt);            // indépendant du débit d'images
    this.vel.x += (cibleX - this.vel.x) * k;
    this.vel.z += (cibleZ - this.vel.z) * k;
    if (!this.moving && Math.hypot(this.vel.x, this.vel.z) < 0.02) { this.vel.x = 0; this.vel.z = 0; }

    const oldX = this.pos.x, oldZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    collide(this.level.obstacles, this.pos, this.radius);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -19.4, 19.4);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -15.4, 15.4);
    if (dt > 0) {
      this.vel.x = (this.pos.x - oldX) / dt;
      this.vel.z = (this.pos.z - oldZ) / dt;
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.moving = this.speed > 0.05;
    this.running = this.running && this.moving;
    if (this.running) this.stamina = Math.max(0, this.stamina - dt * 0.30);
    else this.stamina = Math.min(1, this.stamina + dt * (this.moving ? 0.14 : 0.30));

    // --- orientation : on regarde où l'on va, plus vite à l'arrêt ---
    if (this.speed > 0.15) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const taux = 7 + 7 / (1 + this.speed);
      const pas = d * (1 - Math.exp(-taux * dt));
      this.yaw += pas;
      // léger contre-appui dans les virages : c'est ce qui vend le poids
      this.inclinaison = amortir(this.inclinaison || 0,
        THREE.MathUtils.clamp(-pas / Math.max(dt, 1e-4) * 0.045, -0.22, 0.22), 8, dt);
    } else {
      this.inclinaison = amortir(this.inclinaison || 0, 0, 8, dt);
    }

    // --- stress : monte quand on court, redescend quand on souffle ---
    let ds = 0;
    if (this.running) ds += 0.13;
    if (this.moving && !this.running && this.crouch < 0.4) ds += 0.012;
    if (!this.moving) ds -= 0.16;

    this.stress = THREE.MathUtils.clamp(this.stress + ds * dt, 0, 1);

    this.animate(dt);

  }

  animate(dt) {
    const p = this.parts;
    this.tempsAnimation += dt;
    const c = this.crouch;
    const v = this.speed;
    // La pose de marche vit ici, pas dans les os. Les décalages qui
    // suivent (accroupi, regard, crispation, emote) s'ajoutent ensuite
    // en +=. Tant que la relaxation à l'arrêt partait de l'os, elle
    // repartait d'une valeur DÉJÀ décalée : l'accroupi se rajoutait à
    // lui-même image après image et les jambes s'enroulaient.
    const q = this._pose;
    for (const key of ['legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR',
      'armL', 'armR', 'elbowL', 'elbowR', 'upper', 'head']) p[key].rotation.set(0, 0, 0);
    p.root.position.set(0, 0.85, 0);
    p.root.rotation.set(0, 0, 0);

    if (v > 0.05) {
      // Cadence : plus courte et plus rapide en course, longue et
      // posée accroupi. La foulée s'ouvre avec la vitesse.
      const cadence = this.running ? 2.15 : (c > 0.5 ? 2.6 : 2.35);
      this.phase += v * cadence * dt;
      const s = Math.sin(this.phase), co = Math.cos(this.phase);
      const sign = Math.sign(s);
      if (sign !== this._lastStepSign) {
        this._lastStepSign = sign;
        if (this.footstepCb) this.footstepCb(this.running ? 1 : (c > 0.5 ? 0.25 : 0.6));
      }

      const k = Math.min(1, v / 2.8);
      const amp = THREE.MathUtils.lerp(0.58, 0.34, c) * k;

      // hanches : une jambe avance pendant que l'autre recule
      q.legL = amortir(q.legL, s * amp, 20, dt);
      q.legR = amortir(q.legR, -s * amp, 20, dt);
      // genoux : la jambe qui revient se plie, celle qui porte reste tendue
      q.kneeL = amortir(q.kneeL, Math.max(0, -s) * (0.95 + c * 0.6) * k, 20, dt);
      q.kneeR = amortir(q.kneeR, Math.max(0, s) * (0.95 + c * 0.6) * k, 20, dt);
      // chevilles : attaque talon puis poussée sur la pointe
      q.footL = amortir(q.footL, (-s * 0.30 - Math.max(0, -co) * 0.18) * k, 20, dt);
      q.footR = amortir(q.footR, (s * 0.30 - Math.max(0, co) * 0.18) * k, 20, dt);

      // bras en opposition, coudes fléchis
      q.armL = amortir(q.armL, -s * 0.44 * k, 20, dt);
      q.armR = amortir(q.armR, s * 0.44 * k, 20, dt);
      q.armLz = amortir(q.armLz, (p.anatomieBlender ? -.03 : .06) + s * 0.05 * k, 20, dt);
      q.armRz = amortir(q.armRz, (p.anatomieBlender ? .03 : -.06) + s * 0.05 * k, 20, dt);
      q.elbowL = amortir(q.elbowL, -0.28 - Math.max(0, -s) * 0.45 * k, 20, dt);
      q.elbowR = amortir(q.elbowR, -0.28 - Math.max(0, s) * 0.45 * k, 20, dt);

      // le buste contre-tourne par rapport au bassin, et roule un peu
      q.upperY = amortir(q.upperY, -s * 0.11 * k, 20, dt);
      q.upperZ = amortir(q.upperZ, s * 0.035 * k, 20, dt);
      // oscillation verticale : deux fois la fréquence du pas
      this._bob = -0.020 * (0.5 - 0.5 * Math.cos(2 * this.phase)) * k;
    } else {
      // Retour au repos debout. Les cibles sont la pose debout elle-même,
      // pas zéro partout : les bras gardent leur écart naturel.
      const r = 1 - Math.exp(-8 * dt);
      for (const key of ['legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR', 'armL', 'armR'])
        q[key] += (0 - q[key]) * r;
      q.elbowL += (-0.22 - q.elbowL) * r;
      q.elbowR += (-0.22 - q.elbowR) * r;
      q.armLz += ((p.anatomieBlender ? -.03 : .06) - q.armLz) * r;
      q.armRz += ((p.anatomieBlender ? .03 : -.06) - q.armRz) * r;
      q.upperY += (0 - q.upperY) * r;
      q.upperZ += (0 - q.upperZ) * r;
      this._bob = (this._bob || 0) * (1 - r);
    }

    // Report sur le squelette : une affectation nette, jamais un cumul.
    // C'est ce qui rend les += suivants sûrs.
    p.legL.rotation.x = q.legL;
    p.legR.rotation.x = q.legR;
    p.kneeL.rotation.x = q.kneeL;
    p.kneeR.rotation.x = q.kneeR;
    p.footL.rotation.x = q.footL;
    p.footR.rotation.x = q.footR;
    p.armL.rotation.x = q.armL;
    p.armR.rotation.x = q.armR;
    p.armL.rotation.z = q.armLz;
    p.armR.rotation.z = q.armRz;
    p.elbowL.rotation.x = q.elbowL;
    p.elbowR.rotation.x = q.elbowR;
    p.upper.rotation.y = q.upperY;
    p.upper.rotation.z = q.upperZ;
    // Mains et doigts : remis au repos à chaque image, comme les autres
    // articulations. Seule une emote les pilote, et elle le fait juste
    // après — sans cette remise, une main ouverte le resterait.
    p.mainL.rotation.set(0, POIGNET_REPOS, 0);
    p.mainR.rotation.set(0, -POIGNET_REPOS, 0);
    p.doigtsL.rotation.set(0, 0, 0);
    p.doigtsR.rotation.set(0, 0, 0);
    p.pouceL.rotation.set(0, 0, 0);
    p.pouceR.rotation.set(0, 0, 0);

    // Accroupi : on plie fortement les genoux, on bascule le bassin en
    // avant et on relève la tête pour garder le regard sur la scène.
    p.legL.rotation.x -= c * 1.15;
    p.legR.rotation.x -= c * 1.15;
    p.kneeL.rotation.x += c * 2.20;
    p.kneeR.rotation.x += c * 2.20;
    p.footL.rotation.x -= c * 1.05;
    p.footR.rotation.x -= c * 1.05;
    // On descend les hanches selon la longueur projetée des jambes.
    // Descendre seulement le buste laissait les pieds suspendus au-dessus du sol.
    p.root.position.y = .04 + .43 * Math.cos(c * 1.15) + .38 * Math.cos(c * 1.05);
    p.upper.position.y = -c * .015;
    p.upper.rotation.x = c * .62;
    p.upper.rotation.z += this.inclinaison || 0;
    p.head.rotation.x = -c * 0.55 - p.upper.rotation.z * 0.3;

    // --- oisiveté : au bout de quelques secondes, il jette un œil
    // autour de lui. C'est le geste du type qui vérifie si la voie est
    // libre — et c'est ce qui vend le personnage sans un mot.
    this.oisif = this.speed < 0.06 && !this.emote && !this.working ? (this.oisif || 0) + dt : 0;
    let regard = 0;
    if (this.oisif > 3.2) {
      const cy = (this.oisif - 3.2) % 7;
      if (cy < 1.3) regard = -Math.sin((cy / 1.3) * Math.PI) * 0.78;
      else if (cy > 2.1 && cy < 3.5) regard = Math.sin(((cy - 2.1) / 1.4) * Math.PI) * 0.85;
    }
    this.regard = amortir(this.regard || 0, regard, 6, dt);
    p.head.rotation.y = this.regard;
    p.upper.rotation.y += this.regard * 0.16;

    // --- quelqu'un le fixe : il rentre la tête dans les épaules ---
    this.crispation = amortir(this.crispation || 0,
      THREE.MathUtils.clamp(((this.menace || 0) - 0.45) / 0.5, 0, 1), 5, dt);
    if (this.crispation > 0.01) {
      p.upper.rotation.x += this.crispation * 0.13;
      p.head.rotation.x -= this.crispation * 0.18;
      p.armL.rotation.z += this.crispation * 0.16;
      p.armR.rotation.z -= this.crispation * 0.16;
    }

    this.workBlend = amortir(this.workBlend || 0, this.working ? 1 : 0, 12, dt);
    if (this.workBlend > 0.01) {
      const k = this.workBlend;
      p.legL.rotation.x += (-1.5 - p.legL.rotation.x) * k;
      p.legR.rotation.x += (-1.5 - p.legR.rotation.x) * k;
      p.kneeL.rotation.x += (1.5 - p.kneeL.rotation.x) * k;
      p.kneeR.rotation.x += (1.5 - p.kneeR.rotation.x) * k;
      this.workT = (this.workT || 0) + dt;
      const frappe = Math.sin(this.workT * 22);
      const travail = {upper:[.5,0,0],head:[-.1,0,0],armL:[-1.35+frappe*.025,0,.06],
        armR:[-1.35-frappe*.025,0,-.06],elbowL:[-.85-frappe*.04,0,0],elbowR:[-.85+frappe*.04,0,0],
        mainL:[-.3,POIGNET_CLAVIER,0],mainR:[-.3,-POIGNET_CLAVIER,0]};
      for(const [key,angles] of Object.entries(travail))for(const [i,axis] of ['x','y','z'].entries())
        p[key].rotation[axis]+=(angles[i]-p[key].rotation[axis])*k;
    }

    // Une interruption fige le temps de la scène et rend la main en 180 ms.
    // L'animation coupée ne continue pas à lancer une nouvelle pose pendant le fondu.
    let jeuActeur = null;
    if (this.emote) {
      const e=this.emote;
      if(e.coupee){
        if(e.sortie==null){e.sortie=0;e.poidsSortie=e.poids;}
        e.sortie+=dt;e.poids=e.poidsSortie*(1-adoucir(e.sortie/.18));
      } else {
        e.t+=dt;e.poids=adoucir(e.t/.22);
      }
      if(e.t>=e.def.duree || (e.coupee && e.sortie>=.18))this.emote=null;
      else {e.def.pose(p,e.t/e.def.duree,e.poids);jeuActeur=e;}
    }

    animerVisage(p, dt, { tension: Math.max(this.menace || 0, this.stress * 0.6), respire:false });
    if(jeuActeur)jeuActeur.def.visage(p,jeuActeur.t/jeuActeur.def.duree,jeuActeur.poids);
    animerMainsBlender(p,jeuActeur,this.workBlend,this.workT||0);

    // respiration : plus ample quand le stress monte
    const souffle = 1 + Math.sin(this.tempsAnimation * (3 + this.stress * 4)) *
      (0.003 + this.stress * 0.006);
    p.torso.scale.set(1, 1+(souffle-1)*(1-(jeuActeur?.poids||0)*.85), 1);

    this.mesh.position.set(this.pos.x, (this._bob || 0) + this.workBlend * HEIGHT.seatOffset, this.pos.z);
    if (this.exitPose) {
      const u = this.exitPose.progress;
      p.armR.rotation.x = -2.6 * u; p.elbowR.rotation.x = -.4 * u;
      if (this.exitPose.id === 'elevator') this.mesh.position.x += .5*u;
      else { this.mesh.position.z += .5*u; this.mesh.position.y -= .2*u; }
    }
    this.mesh.rotation.y = this.yaw;
    if(!this.exitPose && this.workBlend<.005)this.ajusterAppui();
  }

  ajusterAppui() {
    // L'appui suit les semelles, aussi pendant la marche et les fondus.
    // La collision reste sur pos ; seule la pose verticale du bassin est corrigée.
    this.parts.root.updateWorldMatrix(true,true);
    let minY=Infinity;
    for(const {foot,points} of this._appuis)for(const point of points){
      this._pointAppui.copy(point).applyMatrix4(foot.matrixWorld);minY=Math.min(minY,this._pointAppui.y);
    }
    if(Number.isFinite(minY))this.parts.root.position.y+=this.pos.y-minY;
  }

  syncOutline() {
    const a = this._srcNodes, b = this._dstNodes;
    for (let i = 0; i < a.length; i++) {
      b[i].position.copy(a[i].position);
      b[i].quaternion.copy(a[i].quaternion);
      if (i > 0) b[i].scale.copy(a[i].scale);
      if (a[i].morphTargetInfluences) b[i].morphTargetInfluences = [...a[i].morphTargetInfluences];
    }
    this.outline.position.copy(this.mesh.position);
    this.outline.quaternion.copy(this.mesh.quaternion);
    this.outline.scale.setScalar(1.07);
  }

  // Déclenche une emote au hasard. Renvoie la définition pour que le
  // jeu puisse prévenir les collègues qui le voient.
  // `index` vient de la roue. Sans index, on tire au sort sans répéter.
  declencherEmote(index) {
    if (this.emote && !this.emote.coupee) return null;
    let def;
    if (index != null) {
      if (!Number.isInteger(index) || index<0 || index>=EMOTES.length) return null;
      def = EMOTES[index];
    }
    else {
      const choix = EMOTES.filter(e => e.id !== this.derniereEmote);
      def = choix[(Math.random() * choix.length) | 0];
    }
    this.working = null;
    this.derniereEmote = def.id;
    this.emote = { def, t: 0, coupee: false, poids: 0 };
    return def;
  }

  setOutline(level) {
    // level : 0 = rien, 0..1 = jaune → rouge
    this.menace = level;
    if (level <= 0.02) { this.outline.visible = false; return; }
    this.outline.visible = true;
    this.syncOutline();
    const t = THREE.MathUtils.clamp((level - 0.25) / 0.7, 0, 1);
    this.outlineMat.color.setHSL(THREE.MathUtils.lerp(0.13, 0.0, t), 1, 0.55);
    this.outlineMat.opacity = 0.35 + 0.6 * level;
    this.outline.scale.setScalar(1.05 + 0.03 * level);
  }
}

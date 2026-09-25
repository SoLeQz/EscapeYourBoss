// Multijoueur en réseau local, deux joueurs en coopération.
//
// L'hôte fait tourner la simulation (collègues, directeur, chrono, défaite).
// L'invité affiche les collègues comme des marionnettes, à partir des états
// envoyés par l'hôte (15 Hz). Chacun pilote son propre personnage et envoie
// sa posture (20 Hz). Le réseau vit dans le processus principal (electron/reseau.cjs).
import * as THREE from 'three';
import { EMOTES } from './emotes.js';
import { lancerDiversion } from './office.js';
import { mesurerVue } from './perception.js';

export const LOOK_COEQUIPIER = { veste: 0x6b3b3f, cravate: 0x2d4a7a, cheveux: 0x3b2a1d, chemise: 0xe6eef2 };
const ETATS = ['travail', 'doute', 'observation', 'repere'];
const OCCUPATIONS = [undefined, 'clavier', 'lecture', 'etirement', 'cafe'];
const r3 = v => Math.round(v * 1000) / 1000;
const amortir = (v, c, k, dt) => v + (c - v) * (1 - Math.exp(-k * dt));
function angleVers(a, b, k, dt) {
  let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * (1 - Math.exp(-k * dt));
}

export class Multijoueur {
  constructor(jeu, pont = globalThis.window?.jeuReseau) {
    this.jeu = jeu; this.pont = pont;
    this.role = null;            // 'hote' | 'invite' | null
    this.connecte = false;
    this.nomDistant = '';
    this.etatDistant = null;     // dernière posture reçue du coéquipier
    this.monde = null;           // dernier état du monde reçu (invité)
    this.sortiLocal = false; this.sortiDistant = false;
    this.envoiT = 0; this.mondeT = 0;
    this.ecouteurs = new Set();
    pont?.surEvenement(e => this.surEvenement(e));
  }
  get actif() { return !!this.role && this.connecte; }
  get hote() { return this.role === 'hote'; }
  get invite() { return this.role === 'invite'; }
  ecouter(cb) { this.ecouteurs.add(cb); return () => this.ecouteurs.delete(cb); }
  signaler(e) { for (const cb of this.ecouteurs) cb(e); }

  async heberger(nom) { const r = await this.pont.heberger(nom); this.role = 'hote'; return r; }
  async rejoindre(ip, nom) { this.role = 'invite'; try { return await this.pont.rejoindre(ip, nom); } catch (e) { this.role = null; throw e; } }
  rechercher() { return this.pont.rechercher(); }
  adresses() { return this.pont.adresses(); }
  async quitter() { await this.pont?.fermer(); this.role = null; this.connecte = false; this.etatDistant = null; this.monde = null; }
  envoyer(msg) { if (this.connecte) this.pont.envoyer(msg); }

  surEvenement(e) {
    if (e.type === 'connecte') { this.connecte = true; this.nomDistant = e.nom; this.role = e.role; }
    if (e.type === 'deconnecte') {
      const etaitActif = this.connecte; this.connecte = false; this.etatDistant = null;
      if (etaitActif) this.jeu.coequipierParti?.(e.raison);
    }
    if (e.type === 'message') this.surMessage(e.msg);
    this.signaler(e);
  }

  // ------------------------------------------------------------ messages
  surMessage(m) {
    const jeu = this.jeu;
    switch (m.t) {
      case 'joueur': this.etatDistant = m; if (m.s) this.sortiDistant = true; break;
      case 'lancer': if (this.invite) jeu.lancerMulti(m.index); break;
      case 'pret': if (this.hote) this.pretIndex = m.index; break;
      case 'monde': if (this.invite && m.idx === jeu.niveauIndex) this.monde = m; break;
      case 'objet': jeu.ramasserObjet?.(m.id, true); break;
      case 'action': if (this.hote) jeu.actionDistante?.(m.id); break;
      case 'dire': if (this.invite) jeu.npcs[m.i]?.say(m.texte, m.dur); break;
      case 'emote': if (this.hote) jeu.reagirEmote?.(EMOTES[m.index], jeu.coequipier); break;
      case 'perdu': if (this.invite) jeu.lose(jeu.npcs[m.i] || jeu.npcs[0]); break;
      case 'gagne': jeu.terminerNiveau(m.route); break;
      case 'pause': jeu.pause(true); break;
      case 'reprise': jeu.resume(true); break;
      case 'menu': jeu.retourMenuMulti?.(true); break;
    }
  }

  // ------------------------------------------------------------ par image
  // Posture du joueur local vers le coéquipier (20 Hz).
  envoyerJoueur(dt) {
    this.envoiT -= dt; if (this.envoiT > 0) return; this.envoiT = 0.05;
    const p = this.jeu.player, e = p.emote;
    this.envoyer({ t: 'joueur', x: r3(p.pos.x), z: r3(p.pos.z), yaw: r3(p.yaw), c: r3(p.crouch),
      r: p.running ? 1 : 0, m: p.moving ? 1 : 0, v: r3(p.speed),
      e: e && !e.coupee ? EMOTES.indexOf(e.def) : -1, et: e ? r3(e.t) : 0,
      w: p.working ? { x: r3(p.working.x), z: r3(p.working.z), restant: r3(p.working.restant) } : null,
      s: this.sortiLocal ? 1 : 0, xp: p.exitPose ? { id: p.exitPose.id, p: r3(p.exitPose.progress) } : null });
  }

  // Le coéquipier suit la dernière posture reçue, lissée (pas de téléportation à 20 Hz).
  animerCoequipier(dt) {
    const c = this.jeu.coequipier, s = this.etatDistant;
    if (!c) return;
    c.mesh.visible = !!s && !s.s;
    if (!s) return;
    if (c.pos.distanceTo(new THREE.Vector3(s.x, 0, s.z)) > 3) c.pos.set(s.x, 0, s.z);
    c.pos.x = amortir(c.pos.x, s.x, 14, dt); c.pos.z = amortir(c.pos.z, s.z, 14, dt);
    c.yaw = angleVers(c.yaw, s.yaw, 14, dt);
    c.crouch = s.c; c.wantCrouch = s.c > .5; c.running = !!s.r; c.moving = !!s.m; c.speed = s.v;
    // Poste de travail : même règle de protection que pour le joueur local.
    c.working = s.w ? { type: 'travail', x: s.w.x, z: s.w.z, restant: s.w.restant } : null;
    c.exitPose = s.xp ? { id: s.xp.id, progress: s.xp.p } : null;
    if (s.e >= 0 && (!c.emote || c.emote.coupee || c.emote.def !== EMOTES[s.e])) {
      c.emote = null; c.declencherEmote(s.e); if (c.emote) c.emote.t = s.et;
    } else if (s.e < 0 && c.emote && !c.emote.coupee) c.emote.coupee = true;
    c.animate(dt);
  }

  // Hôte → invité : chrono, traque, objets, postes et collègues (15 Hz).
  envoyerMonde(dt) {
    this.mondeT -= dt; if (this.mondeT > 0) return; this.mondeT = 1 / 15;
    const j = this.jeu;
    this.envoyer({ t: 'monde', idx: j.niveauIndex, el: r3(j.elapsed), tl: r3(j.timeLeft), h: j.hunting ? 1 : 0,
      o: j.level.ramassables.map(o => o.pris ? 1 : 0),
      a: j.actionsBureau.map(it => [it.utilise ? 1 : 0, r3(it.restant)]),
      n: j.npcs.map(n => [r3(n.pos.x), r3(n.pos.z), r3(n.yaw), r3(n.headYaw ?? n.yaw), r3(n.speed || 0),
        n.walking ? 1 : 0, ETATS.indexOf(n.state), r3(n.suspicion), OCCUPATIONS.indexOf(n.occupation), r3(n.regard || 0)]) });
  }

  // Invité : applique le dernier état du monde reçu.
  appliquerMonde(dt) {
    const m = this.monde, j = this.jeu;
    if (!m) return;
    j.elapsed = m.el; j.timeLeft = m.tl;
    if (m.h && !j.hunting) { j.hunting = true; j.ui.flash(); j.ui.say('La réunion est finie', 'Le directeur Wang vous cherche.', 4); }
    m.o.forEach((pris, i) => { if (pris && !j.level.ramassables[i].pris) j.ramasserObjet(i, true); });
    m.a.forEach(([u, r], i) => { const it = j.actionsBureau[i]; if (it) { it.utilise = !!u; it.restant = r; } });
    m.n.forEach((d, i) => {
      const n = j.npcs[i]; if (!n) return;
      const [x, z, yaw, hy, v, w, st, su, oc, rg] = d;
      if (Math.hypot(n.pos.x - x, n.pos.z - z) > 3) n.pos.set(x, 0, z);
      n.pos.x = amortir(n.pos.x, x, 12, dt); n.pos.z = amortir(n.pos.z, z, 12, dt);
      n.yaw = angleVers(n.yaw, yaw, 12, dt); n.headYaw = angleVers(n.headYaw ?? n.yaw, hy, 12, dt);
      n.regard = rg; n.speed = v;
      n.walking = !!w;
      const avant = n.state; n.state = ETATS[st] || 'travail'; n.suspicion = su;
      if (OCCUPATIONS[oc]) n.occupation = OCCUPATIONS[oc];
      // mêmes signaux visuels que chez l'hôte (les répliques arrivent par « dire »)
      if (n.state !== avant) {
        if (n.state === 'doute') n.sursaut = 1;
        else if (n.state === 'observation') { n.sursaut = 1.4; j.secousse = Math.max(j.secousse || 0, .35); }
        else if (n.state === 'travail' && ['doute', 'observation'].includes(avant)) n.hausseEpaules = 1;
      }
      n.animate(dt); n.updateVisuals(dt, j);
      // indicateurs locaux (« visible », « hors des regards ») pour l'invité
      n.vue = mesurerVue(n, j.player, j.level.obstacles); n.sawThisFrame = n.vue.visible;
    });
  }

  // Invité : utilise une photocopieuse / un poste → l'effet sur les collègues est simulé chez l'hôte.
  static executerAction(jeu, it) {
    if (it.type === 'diversion') return lancerDiversion(it, jeu.npcs, jeu.audio, jeu.hunting);
    return 0;
  }
}

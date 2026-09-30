import * as THREE from 'three';
import { collide, hasLOS } from './level.js';
import { DUREE_TRAVAIL } from './travail.js';
import { makeLabelSprite } from './characters.js';

// Réutilise les meubles du décor et ignore les postes déjà occupés.
export function creerInteractions(level, plan, npcs) {
  const R = level.repere, depart = level.playerStart;
  const libres = plan.postes.map(([x, z, type, rot = 0], i) => {
    const lx = -0.25, lz = 1.05;
    return { id: `travail-${i}`, type: 'travail', ...R.p(x + lx * Math.cos(rot) + lz * Math.sin(rot),
      z - lx * Math.sin(rot) + lz * Math.cos(rot)), yaw: R.yaw(rot + Math.PI),
      r: 1.25, label: 'Faire semblant de travailler', restant: DUREE_TRAVAIL };
  }).filter(it => {
    if (npcs.some(n => Math.hypot(n.cfg.x - it.x, n.cfg.z - it.z) < 1.5)) return false;
    const p = new THREE.Vector3(it.x, 0, it.z); collide(level.obstacles, p, 0.34);
    return Math.hypot(p.x - it.x, p.z - it.z) < 0.01;
  });
  libres.sort((a, b) => Math.hypot(a.x - depart.x, a.z - depart.z)
    - Math.hypot(b.x - depart.x, b.z - depart.z));
  const actions = [{ id: 'imprimante', type: 'diversion', ...R.p(-18.4, -13.2),
    source: R.p(-18.4, -14.5), r: 1.6, label: 'Lancer 200 photocopies · 1 utilisation',
    utilise: false, restant: 0 }, ...libres.slice(0, 2)];
  for (const it of actions) {
    const m = makeLabelSprite(it.type === 'travail' ? 'POSTE LIBRE' : 'PHOTOCOPIEUSE',
      it.type === 'travail' ? `Abri · ${DUREE_TRAVAIL} s max` : 'Diversion unique');
    // Le repère est retourné avec l'étage : on le pose en coordonnées d'origine.
    m.position.set(R.x(it.x), 1.8, R.z(it.z)); m.scale.multiplyScalar(0.85);
    m.visible = false; level.root.add(m); it.marker = m;
  }
  return actions;
}

export function actionAccessible(it, player, obstacles) {
  return Math.hypot(it.x - player.pos.x, it.z - player.pos.z) < it.r &&
    hasLOS(obstacles, { x: player.pos.x, y: 0.65, z: player.pos.z }, { x: it.x, y: 0.65, z: it.z });
}

export function lancerDiversion(it, npcs, audio, hunting = false) {
  if (it.utilise) return 0;
  it.utilise = true; it.restant = 6;
  audio.impression(it.source);
  let count = 0;
  for (const n of npcs) {
    // Un collègue qui nous regarde déjà n'oublie pas ce qu'il a vu.
    if (hunting && n.isBoss || n.suspicion >= 0.52 || Math.hypot(n.pos.x - it.source.x, n.pos.z - it.source.z) > 12) continue;
    n.diversion = { ...it.source, t: 6 };
    n.say(n.isBoss ? 'Qui imprime encore à cette heure ?' : n.role === 'sécurité'
      ? 'Encore cette machine…' : 'Deux cents pages ? Sérieusement ?', 2.5);
    count++;
  }
  return count;
}

// Emote musicale : les collègues à portée d'oreille qui NE voient PAS le danseur
// se retournent vers le son quelques secondes (ceux qui le voient réagissent déjà
// à l'emote elle-même). Danser caché derrière un mur fige leurs regards sur ce mur :
// le coéquipier passe dans leur dos. Même règle que la photocopieuse : un collègue
// déjà méfiant ne se laisse pas distraire, le directeur en traque non plus.
export const PORTEE_MUSIQUE = 10, DUREE_DIVERSION_MUSIQUE = 4.5;
const REPLIQUES_MUSIQUE = ['C’est quoi cette musique ?', 'Qui met du son à cette heure ?', 'On se croirait en soirée…'];
export function diversionMusique(source, npcs, voit, hunting = false) {
  let count = 0;
  for (const n of npcs) {
    if (hunting && n.isBoss || n.suspicion >= 0.52) continue;
    if (Math.hypot(n.pos.x - source.x, n.pos.z - source.z) > PORTEE_MUSIQUE || voit(n)) continue;
    n.diversion = { x: source.x, z: source.z, t: DUREE_DIVERSION_MUSIQUE };
    if (Math.random() < 0.5) n.say(REPLIQUES_MUSIQUE[(Math.random() * REPLIQUES_MUSIQUE.length) | 0], 2.2);
    count++;
  }
  return count;
}


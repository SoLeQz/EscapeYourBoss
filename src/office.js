import * as THREE from 'three';
import { collide, hasLOS } from './level.js';
import { DUREE_TRAVAIL } from './travail.js';
import { makeLabelSprite } from './characters.js';

// Réutilise les meubles du décor et ignore les postes déjà occupés.
export function creerInteractions(level, plan, npcs) {
  const libres = plan.postes.map(([x, z, type, rot], i) => {
    const lx = -0.25, lz = 1.05;
    return { id: `travail-${i}`, type: 'travail', x: x + lx * Math.cos(rot) + lz * Math.sin(rot),
      z: z - lx * Math.sin(rot) + lz * Math.cos(rot), yaw: rot + Math.PI,
      r: 1.25, label: 'Faire semblant de travailler', restant: DUREE_TRAVAIL };
  }).filter(it => {
    if (npcs.some(n => Math.hypot(n.cfg.x - it.x, n.cfg.z - it.z) < 1.5)) return false;
    const p = new THREE.Vector3(it.x, 0, it.z); collide(level.obstacles, p, 0.34);
    return Math.hypot(p.x - it.x, p.z - it.z) < 0.01;
  });
  libres.sort((a, b) => Math.hypot(a.x - plan.depart.x, a.z - plan.depart.z)
    - Math.hypot(b.x - plan.depart.x, b.z - plan.depart.z));
  const actions = [{ id: 'imprimante', type: 'diversion', x: -18.4, z: -13.2,
    source: { x: -18.4, z: -14.5 }, r: 1.6, label: 'Lancer 200 photocopies · 1 utilisation',
    utilise: false, restant: 0 }, ...libres.slice(0, 2)];
  for (const it of actions) {
    const m = makeLabelSprite(it.type === 'travail' ? 'POSTE LIBRE' : 'PHOTOCOPIEUSE',
      it.type === 'travail' ? `Abri · ${DUREE_TRAVAIL} s max` : 'Diversion unique');
    m.position.set(it.x, 1.8, it.z); m.scale.multiplyScalar(0.85);
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

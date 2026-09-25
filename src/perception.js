import { hasLOS } from './level.js';

// Source commune pour la détection, les emotes et les indications du HUD.
// L'éclairage reste une ambiance : seule la géométrie interrompt le regard.
export function mesurerVue(npc, player, obstacles) {
  const dx = player.pos.x - npc.pos.x, dz = player.pos.z - npc.pos.z;
  const distance = Math.hypot(dx, dz);
  const cos = distance > 0.0001
    ? (dx * Math.sin(npc.headYaw) + dz * Math.cos(npc.headYaw)) / distance : 1;
  const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
  const dansCone = angle < npc.fov / 2 && distance < npc.viewDist;
  const proche = distance < npc.hearDist * 1.4;
  const aPortee = distance < npc.viewDist + 0.5 && (dansCone || proche);
  const libre = aPortee && hasLOS(obstacles,
    { x: npc.pos.x, y: npc.eyeY, z: npc.pos.z },
    { x: player.pos.x, y: player.chestY, z: player.pos.z });
  return { visible: !!libre, masque: aPortee && !libre, distance, angle, dansCone };
}

export function bilanVisibilite(npcs) {
  const vus = npcs.filter(n => n.sawThisFrame);
  const entendus = npcs.filter(n => n.heardThisFrame);
  return { visible: vus.length > 0, entendu: entendus.length > 0,
    masque: npcs.some(n => n.vue?.masque), temoins: vus.length };
}

// Direction à l'écran, indépendante du nom / cône visible du collègue.
export function directionMenace(source, player, yaw) {
  const dx = source.x - player.x, dz = source.z - player.z;
  return Math.atan2(-Math.cos(yaw) * dx + Math.sin(yaw) * dz,
    Math.sin(yaw) * dx + Math.cos(yaw) * dz);
}

// Crédit propre à chaque poste, remis à zéro uniquement avec l'étage.
export const DUREE_TRAVAIL = 12;
export const ALERTE_TRAVAIL = 3;

export function travailProtege(player) {
  const poste = player.working;
  return !!poste && poste.type === 'travail' && poste.restant > 0 &&
    !player.moving && !player.emote &&
    Math.hypot(player.pos.x - poste.x, player.pos.z - poste.z) < 0.2;
}

// Appelé après le déplacement, AVANT la perception : quitter le siège ou
// épuiser le crédit rétablit la détection dans le même pas de simulation.
export function avancerTravail(player, dt) {
  const poste = player.working;
  if (!poste) return null;
  if (!travailProtege(player)) { player.working = null; return null; }
  const avant = poste.restant;
  poste.restant = Math.max(0, avant - dt);
  if (poste.restant < 1e-6) {
    poste.restant = 0;
    player.working = null;
    return 'expire';
  }
  return avant > ALERTE_TRAVAIL && poste.restant <= ALERTE_TRAVAIL ? 'avertir' : null;
}

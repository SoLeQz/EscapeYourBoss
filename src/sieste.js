// ============================================================
//  Micro-sieste dans le hamac de la salle clandestine.
//
//  On s'allonge (E), on dort tant qu'on veut, on se lève avec E ou en
//  bougeant. Le sommeil vide le stress et remplit l'endurance ; en solo, la
//  réunion du directeur file trois fois plus vite pendant qu'on dort. Quand
//  la réunion se termine, on se réveille en sursaut. La pose est dans
//  player.js (siesteBlend), l'écran « Ne pas déranger » dans main.js.
// ============================================================

export const SIESTE = {
  acceleration: 3,     // la réunion avance de 3 s par seconde de sommeil (solo)
  secret: 5,           // secondes de vrai sommeil pour la découverte « Micro-sieste »
  ronflement: 3.4,     // un ronflement toutes les 3,4 s
  stress: 0.35,        // stress retiré par seconde
  endurance: 0.5,      // endurance rendue par seconde
};

// Raison de refuser la sieste, ou null si l'on peut s'allonger.
export function refusSieste(player, { hunting = false } = {}) {
  if (hunting) return ['Pas le moment de dormir', 'Le directeur te cherche.'];
  if (player.deguisement) return ['Quitte le carton', 'Un carton ne dort pas dans un hamac.'];
  return null;
}

export function commencerSieste(player, it) {
  player.working = null; player.emote = null;
  player.vel.set(0, 0, 0); player.speed = 0; player.moving = false; player.running = false;
  player.sieste = { it, t: 0, ronfle: 1.2 };
  player._lit = it.lit;
  return player.sieste;
}

// Une image de sommeil. Renvoie 'ronfle' quand il faut jouer un ronflement,
// 'secret' la première fois que la sieste compte vraiment.
export function avancerSieste(player, dt) {
  const s = player.sieste;
  if (!s) return null;
  const avant = s.t;
  s.t += dt;
  player.stress = Math.max(0, player.stress - SIESTE.stress * dt);
  player.stamina = Math.min(1, player.stamina + SIESTE.endurance * dt);
  player.epuise = false;
  if (avant < SIESTE.secret && s.t >= SIESTE.secret) return 'secret';
  if ((s.ronfle -= dt) <= 0) { s.ronfle = SIESTE.ronflement; return 'ronfle'; }
  return null;
}

// Se lever : renvoie la durée dormie (le corps se redresse via siesteBlend).
export function reveiller(player) {
  const t = player.sieste?.t || 0;
  player.sieste = null;
  return t;
}

export const dureeSieste = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

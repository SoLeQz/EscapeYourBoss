// ============================================================
//  Secrets et canards de débogage (1.9).
//
//  Trois canards en caoutchouc se cachent à chaque étage, et une douzaine de
//  petites découvertes récompensent la curiosité. Tout est sauvegardé
//  (store.js : `canards`, `secrets`) et affiché au menu « Secrets ». Les canards
//  forment une collection indépendante de la progression principale.
// ============================================================

export const SECRETS = [
  { id: 'salle-secrete', nom: 'Salle de sieste clandestine', icone: '🛋️', indice: 'Certaines bibliothèques cachent plus que des livres.' },
  { id: 'toboggan', nom: 'Toboggan du fondateur', icone: '🛝', indice: 'Sortir sans ascenseur ni escalier.' },
  { id: 'nacelle', nom: 'Vue plongeante', icone: '🪟', indice: 'Descendre avec le laveur de vitres.' },
  { id: 'bouton', nom: 'Il ne fallait pas', icone: '🔴', indice: 'C’était pourtant écrit en gros.' },
  { id: 'arcade', nom: 'Meilleur score', icone: '🕹️', indice: 'Une borne qui date de 1985.' },
  { id: 'sieste', nom: 'Micro-sieste', icone: '💤', indice: 'Cinq minutes. Promis.' },
  { id: 'carton', nom: 'Solid Lao D', icone: '📦', indice: 'Un carton, c’est discret. Tant qu’il ne bouge pas.' },
  { id: 'disjoncteur', nom: 'Qui a éteint ?', icone: '💡', indice: 'Certaines armoires électriques méritent un détour.' },
  { id: 'distributeur', nom: 'Snack coincé', icone: '🍫', indice: 'Le distributeur mange les pièces… bruyamment.' },
  { id: 'aspirateur', nom: 'Obstacle détecté', icone: '🤖', indice: 'Se faire dénoncer par un robot ménager.' },
  { id: 'cafe', nom: 'Café serré', icone: '☕', indice: 'La machine du hall redonne du souffle.' },
  { id: 'konami', nom: 'Grosse tête', icone: '🎮', indice: '↑ ↑ ↓ ↓ ← → ← → B A, au menu.' },
];

// Code Konami : au menu principal, active le mode « grosse tête ».
export const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
export const ECHELLE_GROSSE_TETE = 1.7;

export const CANARDS_PAR_ETAGE = 3;
export function canardsTrouves(etat, id = null) {
  const c = etat?.canards || {};
  if (id != null) return (c[id] || []).length;
  return Object.values(c).reduce((s, l) => s + l.length, 0);
}
export function aTrouveCanard(etat, id, index) { return !!etat?.canards?.[id]?.includes(index); }
// Enregistre un canard ; renvoie vrai s'il est nouveau.
export function noterCanard(etat, id, index) {
  etat.canards ??= {};
  const l = etat.canards[id] ??= [];
  if (l.includes(index)) return false;
  l.push(index); l.sort((a, b) => a - b);
  return true;
}
export function noterSecret(etat, id) {
  if (!SECRETS.some(s => s.id === id)) return false;
  etat.secrets ??= [];
  if (etat.secrets.includes(id)) return false;
  etat.secrets.push(id);
  return true;
}
// Sauvegarde abîmée ou d'une autre version : on ne garde que ce qui a un sens.
export function nettoyerSecrets(brut, idsNiveaux) {
  const canards = {};
  for (const [id, l] of Object.entries(brut?.canards || {})) {
    if (!idsNiveaux.includes(+id) || !Array.isArray(l)) continue;
    const ok = [...new Set(l.filter(i => Number.isInteger(i) && i >= 0 && i < CANARDS_PAR_ETAGE))].sort((a, b) => a - b);
    if (ok.length) canards[id] = ok;
  }
  const secrets = [...new Set((Array.isArray(brut?.secrets) ? brut.secrets : []).filter(id => SECRETS.some(s => s.id === id)))];
  return { canards, secrets };
}

// ============================================================
//  Entrées et touches personnalisables.
//
//  On garde un Set de codes physiques pressés (e.code, donc
//  indépendant de la disposition : ZQSD sur AZERTY tombe sur les
//  mêmes touches que WASD). Les actions sont une indirection
//  par-dessus, que le joueur peut remapper.
// ============================================================

export const ACTIONS = [
  { id: 'avancer', nom: 'Avancer', defaut: ['KeyW', 'ArrowUp'] },
  { id: 'reculer', nom: 'Reculer', defaut: ['KeyS', 'ArrowDown'] },
  { id: 'gauche', nom: 'Aller à gauche', defaut: ['KeyA', 'ArrowLeft'] },
  { id: 'droite', nom: 'Aller à droite', defaut: ['KeyD', 'ArrowRight'] },
  { id: 'courir', nom: 'Courir', defaut: ['ShiftLeft', 'ShiftRight'] },
  { id: 'accroupir', nom: 'S’accroupir (maintien)', defaut: ['ControlLeft', 'ControlRight'] },
  { id: 'accroupirBascule', nom: 'S’accroupir (bascule)', defaut: ['KeyC'] },
  { id: 'interagir', nom: 'Interagir', defaut: ['KeyE'] },
  { id: 'emote', nom: 'Roue d’emotes (maintenir)', defaut: ['KeyT'] },
  { id: 'recommencer', nom: 'Recommencer', defaut: ['KeyR'] },
  { id: 'cones', nom: 'Afficher les cônes', defaut: ['KeyV'] },
  { id: 'noms', nom: 'Afficher les noms', defaut: ['KeyB'] },
  { id: 'son', nom: 'Couper le son', defaut: ['KeyM'] },
];

export function touchesParDefaut() {
  const t = {};
  for (const a of ACTIONS) t[a.id] = a.defaut.slice();
  return t;
}

// Nom lisible d'un code physique.
export function nomTouche(code) {
  if (!code) return '—';
  const table = {
    ControlLeft: 'Ctrl G', ControlRight: 'Ctrl D', ShiftLeft: 'Maj G', ShiftRight: 'Maj D',
    AltLeft: 'Alt', AltRight: 'Alt Gr', Space: 'Espace', Escape: 'Échap', Enter: 'Entrée',
    Tab: 'Tab', Backspace: 'Retour', CapsLock: 'Verr Maj',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  if (table[code]) return table[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Pavé ' + code.slice(6);
  return code;
}

// Set de codes pressés + résolution des actions.
export class Entrees extends Set {
  constructor(touches) {
    super();
    this.touches = touches || touchesParDefaut();
    this.bascules = {};
  }

  actif(action) {
    const codes = this.touches[action];
    if (!codes) return false;
    for (const c of codes) if (this.has(c)) return true;
    return false;
  }

  // Un code appartient-il à cette action ? (pour les appuis ponctuels)
  correspond(action, code) {
    const codes = this.touches[action];
    return !!codes && codes.includes(code);
  }

  majTouches(t) { this.touches = t; }
}

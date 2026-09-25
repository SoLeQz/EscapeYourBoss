// ============================================================
//  Sauvegarde : progression, records, touches, options.
//
//  Le jeu n'est distribué qu'en exécutable : la sauvegarde passe par le
//  préchargement Electron, qui écrit un JSON dans le dossier utilisateur.
//  Pas de repli localStorage — il imposait de rester compatible avec les
//  contraintes d'une page web pour aucun bénéfice ici.
// ============================================================

export const DEFAUT = {
  niveauxFinis: [],          // ids des niveaux validés
  records: {},               // { "n1": secondes, "speedrun": secondes }
  touches: null,             // null = valeurs d'usine
  options: { echelle: 1.0, son: true, cones: true, noms: true, sensibilite: 1, mouvementReduit: false, aide: true },
};

let memoire = null;          // filet si l'écriture disque échoue

function fusionner(brut) {
  const d = structuredClone(DEFAUT);
  if (!brut || typeof brut !== 'object') return d;
  if (Array.isArray(brut.niveauxFinis)) d.niveauxFinis = brut.niveauxFinis.slice();
  if (brut.records && typeof brut.records === 'object') Object.assign(d.records, brut.records);
  if (brut.touches && typeof brut.touches === 'object') d.touches = brut.touches;
  if (brut.options && typeof brut.options === 'object') Object.assign(d.options, brut.options);
  if (!Number.isFinite(d.options.sensibilite)) d.options.sensibilite = 1;
  d.options.sensibilite = Math.max(0.3, Math.min(2, d.options.sensibilite));
  return d;
}

export async function charger() {
  try {
    if (window.jeuStore) return fusionner(await window.jeuStore.charger());
    console.warn('préchargement Electron absent : progression non persistée');
  } catch (e) {
    console.warn('lecture de la sauvegarde impossible :', e.message);
  }
  return fusionner(memoire);
}

export async function sauver(data) {
  memoire = data;
  try {
    if (window.jeuStore) await window.jeuStore.sauver(data);
  } catch (e) {
    console.warn('écriture de la sauvegarde impossible :', e.message);
  }
}

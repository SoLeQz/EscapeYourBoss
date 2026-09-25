// Les caches vivent pendant la session. Le reste appartient au niveau ou au
// personnage et doit être rendu au GPU lors de son retrait de la scène.
// WeakSet : une copie de géométrie/matériau n'hérite pas du statut partagé.
const partagees = new WeakSet();

export function partager(ressource) {
  if (!ressource || typeof ressource !== 'object') return ressource;
  partagees.add(ressource);
  if (ressource.isMaterial) {
    for (const valeur of Object.values(ressource)) if (valeur?.isTexture) partagees.add(valeur);
  }
  return ressource;
}

export function libererArbre(racine) {
  if (!racine) return;
  const ressources = new Set();
  racine.traverse(o => {
    // La géométrie des Sprite est interne et commune à Three.js.
    if (o.isMesh && o.geometry) ressources.add(o.geometry);
    if (o.skeleton) ressources.add(o.skeleton);
    for (const mat of [].concat(o.material || [])) {
      ressources.add(mat);
      for (const valeur of Object.values(mat)) if (valeur?.isTexture) ressources.add(valeur);
    }
  });
  racine.removeFromParent();
  for (const r of ressources) if (!partagees.has(r)) r.dispose?.();
}

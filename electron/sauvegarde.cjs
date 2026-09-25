const fs = require('node:fs/promises');

// Migration non destructive : le nouveau profil est toujours prioritaire.
async function lireSauvegarde(courant, ancien = null) {
  for (const chemin of [courant, ancien].filter(Boolean)) {
    try { return JSON.parse(await fs.readFile(chemin, 'utf8')); }
    catch { /* Essayer l'ancien profil, ou repartir des valeurs par défaut. */ }
  }
  return null;
}
module.exports = { lireSauvegarde };

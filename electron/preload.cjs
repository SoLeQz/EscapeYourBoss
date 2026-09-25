// Pont minimal : le rendu n'a accès qu'à lire et écrire sa sauvegarde.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jeuTest', process.argv.includes('--jeu-selftest'));

contextBridge.exposeInMainWorld('jeuStore', {
  charger: () => ipcRenderer.invoke('store:charger'),
  sauver: (donnees) => ipcRenderer.invoke('store:sauver', donnees),
});

// Un fetch() sur file:// est bloqué par Chromium : c'est le processus
// principal qui lit les fichiers audio et renvoie les octets.
contextBridge.exposeInMainWorld('jeuAssets', {
  lire: (nom) => ipcRenderer.invoke('asset:lire', nom),
  version: () => ipcRenderer.invoke('app:version'),
});

// Multijoueur en réseau local : seul ce pont touche au réseau (processus principal).
contextBridge.exposeInMainWorld('jeuReseau', {
  heberger: (nom) => ipcRenderer.invoke('reseau:heberger', nom),
  rejoindre: (ip, nom) => ipcRenderer.invoke('reseau:rejoindre', ip, nom),
  rechercher: () => ipcRenderer.invoke('reseau:rechercher'),
  adresses: () => ipcRenderer.invoke('reseau:adresses'),
  fermer: () => ipcRenderer.invoke('reseau:fermer'),
  envoyer: (msg) => ipcRenderer.send('reseau:envoyer', msg),
  surEvenement: (cb) => ipcRenderer.on('reseau:evenement', (_e, ev) => cb(ev)),
});

# Jouer à deux (réseau local ou en ligne)

Escape your boss 1.7.0 se joue à deux, **en coopération**, sur le même réseau (même
Wi-Fi ou même box) ou **en ligne** grâce à un tunnel playit.gg. Pas de serveur à
installer : l'un des deux joueurs **héberge** la partie depuis le jeu, l'autre la
**rejoint**.

## Ce qu'il faut envoyer à ton ami

**Un seul fichier : `dist/EscapeYourBoss-win64.zip`** (≈ 125 Mo).

- Pour le fabriquer : `npm run paquet:win` (build Windows + zip).
- Pour l'envoyer : WeTransfer, Google Drive, clé USB… ou une *Release* GitHub
  (voir plus bas). Le zip contient tout : le jeu, Electron, les modèles et les sons.
- Ton ami **dézippe** le dossier où il veut et lance `EscapeYourBoss.exe`.
  Rien à installer.

> Vous devez avoir **exactement la même version** (affichée en bas du menu
> principal). Sinon le jeu refuse la connexion et l'indique. Après chaque mise à
> jour, renvoie le zip.

## Lancer une partie

1. **L'hôte** : *Multijoueur* → entre ton nom → **Héberger une partie**.
   Au premier lancement, Windows demande l'accès au réseau : coche **Réseaux
   privés** et accepte. L'écran affiche aussi ton adresse IP (ex. `192.168.1.49`).
2. **L'invité** : *Multijoueur* → entre ton nom → **Rechercher une partie**, puis
   clique sur la partie trouvée. Si rien n'apparaît, tape l'IP de l'hôte et
   clique **Rejoindre**.
3. L'hôte choisit l'étage (tous sont ouverts à deux) et clique **Lancer la partie**.
   Le jeu démarre quand les deux ont chargé l'étage.

## Jouer en ligne (playit.gg)

Quand vous n'êtes pas sur le même réseau, l'hôte ouvre un **tunnel playit.gg** :
ton ami se connecte à une adresse publique qui renvoie vers ton PC. Rien à régler
sur la box, rien à installer chez l'ami, et ça marche même derrière une box 4G.

**Une seule fois, chez l'hôte (sous Windows, là où tourne le jeu) :**

1. Crée un compte sur [playit.gg](https://playit.gg) et installe l'agent Windows
   proposé sur le site. Au premier lancement, il ouvre une page pour le relier à
   ton compte.
2. Dans le tableau de bord playit.gg, ajoute un tunnel de type **TCP** avec
   l'adresse locale **`127.0.0.1`** et le port local **`47800`**. Le TCP générique
   fait partie de *playit Premium* (3 $/mois) ; avec Premium, choisis une région
   proche de vous (Europe) pour réduire la latence.
3. Note l'**adresse publique** du tunnel, de la forme `nom-du-tunnel.ply.gg:12345`
   (le domaine exact peut varier). Elle reste la même d'une partie à l'autre.

**À chaque partie :**

1. L'hôte lance l'agent playit.gg, puis le jeu : *Multijoueur* → **Héberger une
   partie**.
2. L'ami tape l'adresse publique **avec son port** dans le champ du bas
   (`nom-du-tunnel.ply.gg:12345`) et clique **Rejoindre**. *Rechercher* ne voit que
   le réseau local : en ligne, il faut l'adresse.
3. L'hôte choisit l'étage et lance, comme en local.

Le pare-feu Windows n'intervient pas : l'agent parle au jeu sur la machine
elle-même. Toute personne qui connaît l'adresse peut tenter de rejoindre (le jeu
n'accepte qu'un invité et vérifie la version) : désactive le tunnel dans le tableau
de bord, ou ferme l'agent, quand vous ne jouez pas.

## Règles à deux

- Vous êtes deux employés. Ton coéquipier porte une **veste bordeaux** ; son nom
  est affiché au-dessus de sa tête et il apparaît en **orange** sur la minicarte.
- Les collègues et le directeur **vous voient tous les deux**. Chacun réagit à celui
  qui est le plus exposé ; le directeur en traque poursuit le plus proche.
- **Si l'un de vous se fait repérer, vous perdez tous les deux.**
- Les objets à récupérer (badge, portable…) sont **communs** : un seul suffit.
- Photocopieuse, postes de travail et emotes fonctionnent pour les deux.
- L'étage est gagné quand **vous êtes sortis tous les deux**. Le premier sorti
  attend l'autre et peut le regarder faire.
- **Échap** met la partie en pause **pour les deux**. Seul l'hôte relance ou choisit
  l'étage suivant.

## Si ça ne se connecte pas

| Symptôme | Cause probable | Solution |
|---|---|---|
| « Aucune partie trouvée » | Wi-Fi « invité » ou isolation des appareils, réseaux différents | Même réseau pour les deux ; sinon taper l'IP de l'hôte |
| « Aucune partie hébergée sur … » | Mauvaise IP, ou l'hôte n'a pas cliqué *Héberger* | Vérifier l'IP affichée chez l'hôte |
| « Aucune réponse (délai dépassé) » | Pare-feu Windows de l'hôte | Paramètres → Pare-feu → *Autoriser une application* → cocher EscapeYourBoss (Privé). Si le réseau est classé « Public » dans Windows, le passer en « Privé » |
| « Versions différentes » | Pas le même build | Renvoyer le dernier zip |
| « Port 47800 déjà utilisé » | Une autre partie hébergée est ouverte | Fermer l'autre instance du jeu |
| « Adresse invalide » | Adresse mal copiée | Forme `nom:port`, sans espace ni texte autour |
| En ligne : « Aucune partie hébergée » | L'hôte n'a pas cliqué *Héberger*, ou le tunnel vise un autre port que 47800 | Vérifier le tunnel : `127.0.0.1`, port local `47800` |
| En ligne : « délai dépassé » | Agent playit.gg fermé ou tunnel désactivé | Relancer l'agent, réactiver le tunnel |
| En ligne : décalages, saccades | Tunnel routé loin (offre gratuite) | Tunnel régional (Premium) |

Ports utilisés : **TCP 47800** (partie) et **UDP 47801** (découverte). En réseau
local, rien ne passe par Internet ; en ligne, seul le tunnel playit.gg relaie la
partie.

## Publier sur GitHub

Le dépôt est prêt (`.gitignore` exclut `node_modules/` et `dist/`) :

```bash
git init && git add . && git commit -m "Escape your boss 1.7.0"
git remote add origin https://github.com/<toi>/escape-your-boss.git
git push -u origin main
```

Le jeu compilé n'est pas dans le dépôt. Pour ton ami, le plus simple est une
**Release** : sur GitHub → *Releases* → *Draft a new release* → tag `v1.7.0` →
glisse `dist/EscapeYourBoss-win64.zip` dans les fichiers → *Publish*. Ton ami
télécharge le zip depuis la page Releases.

Ton ami peut aussi compiler lui-même (Node.js 20+ requis) :
`npm install` puis `npm run build:win` → `dist/EscapeYourBoss-win32-x64/EscapeYourBoss.exe`.

## Pour les développeurs

- `electron/reseau.cjs` : sessions TCP (JSON par ligne), balises UDP, contrôle de
  version, refus d'un 3ᵉ joueur, adresses `hôte:port` (`lireAdresse`) pour les
  tunnels. Testé en Node : `npm run test:multijoueur`.
- `electron/preload.cjs` : pont `jeuReseau` (aucun accès réseau direct au rendu).
- `src/multijoueur.js` : posture des joueurs (20 Hz). L'hôte envoie l'état du monde
  (chrono, objets, postes, collègues) à 15 Hz. Événements : `lancer`, `pret`,
  `objet`, `action`, `emote`, `dire`, `perdu`, `gagne`, `pause`, `reprise`, `menu`.
- `src/npc.js` : perception de tous les joueurs de `game.joueurs` (solo inchangé).
- Autotest de bout en bout à deux fenêtres : `EscapeYourBoss.exe --selftest --multi --out=DOSSIER`.

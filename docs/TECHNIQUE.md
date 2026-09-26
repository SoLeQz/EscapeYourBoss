# Escape your boss — notes techniques

Tout ce qui concerne la fabrication du jeu : compilation, choix de game feel,
détection, rendu, performances, tests et historique des versions.
Pour jouer, voir le [README](../README.md).

## Construire et lancer depuis les sources

### En `.exe` (Windows)

Le build se trouve dans `dist/EscapeYourBoss-win32-x64/`. **Il faut le copier sur
un disque Windows avant de le lancer** — Windows refuse d'exécuter un `.exe`
depuis un chemin réseau `\\wsl.localhost\…`.

```bash
mkdir -p /mnt/c/Users/<toi>/EscapeYourBoss
cp -r dist/EscapeYourBoss-win32-x64/. /mnt/c/Users/<toi>/EscapeYourBoss/
# puis double-clic sur EscapeYourBoss.exe
```

**Vérifier la copie lancée :** le menu doit afficher la version de `package.json`
(`Version 1.7.0`) et la roue proposer six emotes. Reconstruire `dist/` ne met pas
à jour une copie située ailleurs : il faut copier le contenu du paquet, comme
ci-dessus.

Pour publier : `npm run paquet:win` produit `dist/EscapeYourBoss-win64.zip`, à
joindre à une *Release* GitHub. La sauvegarde est écrite dans
`%APPDATA%/EscapeYourBoss/progression.json` ; celle de l'ancien nom
`PartirALHeure` est reprise automatiquement si le nouveau profil n'existe pas.

### Reconstruire l'exe

```bash
npm install
npm run build:win      # -> dist/EscapeYourBoss-win32-x64/EscapeYourBoss.exe
npm run build:linux    # variante Linux
```

### En développement

```bash
npm start              # Electron, rechargement par F5
```

## Game feel

Quelques décisions qui ne se voient pas dans une capture mais se sentent
manette en main.

**Le déplacement pilote un vecteur vitesse, pas un scalaire.** Avec un scalaire,
changer de direction fait pivoter le déplacement instantanément — c'est ce qui
donnait la sensation de se déplacer sur une grille. Ici la vitesse est infléchie,
donc un demi-tour décrit une courbe, et un virage serré coûte de la reprise
(`accel *= 0.55 + 0.45 * cap` dans [`player.js`](../src/player.js)).

**Tous les lissages utilisent `1 - exp(-k·dt)`,** jamais `lerp(dt·k)`. Le second
accélère quand le jeu rame : la sensation de contrôle changerait avec le débit
d'images, ce qui est inacceptable.

**La caméra a trois ressorts distincts** — le point visé, la distance, la
position — et le point visé est lissé à part pour qu'elle ne copie pas le ballant
vertical du personnage. La collision rentre d'un coup mais ressort doucement :
l'inverse produit des à-coups permanents dès qu'on longe un meuble. Le lacet
reste piloté directement par la souris ; y mettre de l'inertie rendrait la visée
molle.

**Le corps est une surface continue déformée par un squelette.** Un assemblage de
primitives rigides — une sphère d'épaule posée sur une capsule de bras — laisse
une jonction visible dès que le membre tourne : c'est la signature du Playmobil.
Chaque membre est ici un tube unique, droit en pose de repos, dont les sommets
sont pondérés sur deux os ([`body.js`](../src/body.js)). La flexion vient du
squelette, donc la surface se plie au lieu de se casser.

> Piège rencontré : le constructeur de `THREE.Skeleton` calcule les matrices
> inverses de liaison à partir des matrices **monde** des os. Tant que la
> hiérarchie n'a pas été attachée et mise à jour, elles valent l'identité — et le
> personnage part en spaghetti. D'où `updateMatrixWorld()` avant `lierSquelette()`.

## Se faire repérer

La détection progresse en quatre paliers avec hystérésis, pour qu'un collègue ne
clignote pas à la frontière :

| État | Ce qu'il fait | Ce que tu vois |
|---|---|---|
| **travail** | tape, lit, s'étire, boit un café | cône jaune pâle |
| **doute** | la tête part vers le bruit, il ralentit | cône orangé, « ? », indication de menace hors champ |
| **observation** | il lâche tout et te fixe | cône rouge pulsant, « ! », secousse caméra, bandeau qui s'allume |
| **repéré** | « juste cinq minutes » | écran rouge |

En observation, le gain de suspicion est **réduit de 30 %** : se faire repérer
doit être une conséquence qu'on voit venir, pas une surprise. Si la fausse alerte
retombe, le collègue hausse les épaules et se remet au travail.

Le cône est dégradé par couleurs de sommets — franc au pied du collègue, éteint
au bord. Un aplat uniforme, soit on ne le voit pas, soit il inonde la moquette.

## Architecture

Three.js r169 en modules ES, sans bundler, sans moteur physique.

```
index.html              HUD, écrans, import map
vendor/three.module.js  Three.js vendorisé (hors-ligne)
vendor/jsm/             addons de post-traitement vendorisés (280 ko)
electron/main.cjs       fenêtre Electron + mode --selftest
src/
  main.js         boucle de jeu, caméra, chargement des étages, modes
  levels.js       plans d'étage, effectifs, objectifs, progression
  menu.js         menus, sélection d'étage, remappage des touches
  input.js        actions et touches personnalisables
  store.js        sauvegarde (IPC Electron vers le dossier utilisateur)
  render.js       pipeline : ciel, IBL, lumières, composer, paliers de qualité
  materials.js    textures PBR procédurales (aucun fichier externe)
  level.js        géométrie du niveau, collisions, ligne de vue
  player.js       déplacement, accroupi, stress, cycle de marche
  npc.js          perception, machine à états, patrouilles
  characters.js   anatomie des personnages, sprites d'interface
  ui.js / minimap.js / audio.js
```

## Le rendu

### Ce qui est activé

| Étage | Réglage | Où |
|---|---|---|
| **HDR** | cible `HalfFloatType`, espace linéaire | [render.js](../src/render.js) `createComposer` |
| **Tone mapping** | `ACESFilmicToneMapping`, exposition 0,95 | `createRenderer`, appliqué par `OutputPass` |
| **Espace colorimétrique** | `SRGBColorSpace` en sortie | `createRenderer` |
| **IBL** | `PMREMGenerator.fromScene` sur une pièce factice | `buildEnvironment` |
| **Occlusion ambiante** | `GTAOPass`, 8 à 16 échantillons + débruitage Poisson | paliers `haut` / `ultra` |
| **Bloom** | `UnrealBloomPass`, force 0,28, seuil 1,25 | paliers `moyen` et au-dessus |
| **Profondeur de champ** | `BokehPass`, ouverture 0,00009, mise au point suivie | palier `ultra` |
| **Anti-aliasing** | MSAA 4× sur la cible HDR | palier `ultra` |
| **Ombres** | `PCFSoftShadowMap`, 1536 à 3072 px | tous |

**Pas de global illumination** : Three.js n'en a pas. L'IBL en tient lieu — voir ci-dessous.

### Les deux décisions qui font l'essentiel du rendu

**1. L'IBL est une fausse pièce, pas le ciel.** Éclairer l'intérieur avec l'env map
du ciel l'aurait baigné uniformément et aurait écrasé le contraste. `buildEnvironment`
photographie une boîte de panneaux émissifs qui reproduit la vraie distribution :
baie chaude et intense à l'ouest, plafond tiède, rebond sourd au sol. Sans env map,
`MeshStandardMaterial` n'a rien à réfléchir — les métaux sont noirs et tout paraît
en plastique.

**2. Le ciel est peint à la main, en valeurs linéaires.** `Sky.js` (modèle de
Preetham) applique sa propre courbe *puis* se fait tone-mapper une seconde fois :
le résultat sature en blanc. `skyTexture()` écrit un dégradé équirectangulaire dans
une plage qui ne dépasse jamais `SKY_SCALE`, et laisse ACES faire son travail une
seule fois. Le piège à connaître : un canal rouge clippé à 255 face à un vert élevé
donne du blanc, qu'ACES désature encore.

### Matériaux

Tout est généré au chargement sur des `<canvas>` — aucune texture à télécharger.
Chaque matière produit un champ de hauteur dont on dérive la normal map (Sobel) et
la roughness : moquette en dalles, chêne verni, flanelle, métal brossé, dalles
acoustiques perforées, pierre du hall.

Trois règles apprises à la dure :

- **Ne jamais teinter deux fois.** Si la texture porte déjà sa couleur, laisser
  `material.color` à blanc — sinon tout brunit.
- **Chanfreiner.** Aucune arête n'est vive (`RoundedBoxGeometry`, congé de 1 à 2 cm).
- **Proscrire la régularité parfaite.** Des cernes de bois strictement périodiques,
  une moquette identique d'une dalle à l'autre, une carnation d'une seule couleur :
  ce sont les trois choses qui font « image calculée ». Le bois a donc des nœuds et
  un écartement de cernes variable, la moquette des zones de passage lustrées, la
  peau des marbrures et des plages de brillance inégales.

### Les personnages

C'est ce qui trahit le plus vite. Ce qui les sortait de l'aspect pâte à modeler :

| Problème | Correctif |
|---|---|
| Peau d'une seule couleur, uniformément mate | Carte de marbrures et de pores, et surtout une **rugosité variable** — la peau brille par plaques |
| Cheveux en bloc lisse | Normal map anisotrope étirée dans le sens de l'implantation, rugosité 0,24–0,58 : les mèches accrochent la lumière |
| Vêtements sans matière | Trame serrée (20 répétitions sur la chemise, 24 sur le pantalon) plus des plis larges en relief |
| Sept clones | Une carnation différente par personnage |
| Épaules et torse boursouflés | Congés ramenés de 9 cm à 4–5 cm |

### Ce que l'exclusivité exécutable apporte

Le jeu détecte la carte graphique au lancement et se dimensionne en conséquence
(`profilMateriel` dans [`render.js`](../src/render.js)). Une page web ne peut pas se
le permettre : elle doit prévoir le pire et rester téléchargeable.

| Réglage | GPU intégré | Carte dédiée |
|---|---|---|
| Filtrage anisotrope | 8× | **16×** |
| Résolution des textures | ×1 | **×1,5** |
| Carte d'ombre | 2048 | **4096** |

Coût mesuré de ces trois montées de qualité : **nul**. On n'est pas limité par le
remplissage, donc une texture plus fine ou une ombre plus nette ne change rien au
nombre d'images par seconde.

### Temps de chargement

Les textures étant calculées et non téléchargées, le démarrage n'est pas gratuit.
Deux optimisations l'ont ramené de 14 s à environ 7 s :

- **Chemin rapide sur le bruit** : `wrap()` faisait deux modulos par échantillon,
  `Math.floor` remplacé par `| 0`, et les bruits lents n'étaient plus recalculés
  dans la passe couleur.
- **Champs basse fréquence à résolution réduite** : un fbm de période 5 sur une
  texture de 768 px ne porte aucun détail fin. Le calculer au huitième de la
  résolution puis l'interpoler est invisible à l'œil et divise le coût par trois.

Reste ~3,3 s de textures et ~4 s de construction du premier étage, masqués par un
écran d'attente. L'étape suivante, si besoin, serait de **précalculer les textures
au moment du build** et de les livrer dans l'exécutable : le démarrage tomberait
sous la seconde, au prix d'une étape de compilation supplémentaire.

### Netteté

Le jeu rend à **1:1** : un pixel calculé = un pixel écran. Un rendu sous-résolu
puis étiré gagne des images par seconde mais ramollit toute l'image — c'est le
premier réflexe à ne pas avoir.

La qualité n'est pas réglable : elle est déduite de la carte graphique au
lancement, et un garde-fou redescend d'un cran si la partie tombe sous 24 images
par seconde. Un réglage de moins à se tromper.

### Performance : mesurée, pas devinée

Le mode `--selftest` embarque un banc d'essai et une sonde qui isole chaque
poste de coût. Deux découvertes ont tout changé.

**1. Le jeu tournait sur le mauvais GPU.** Sur un portable à double carte,
Chromium choisit le circuit intégré par défaut. La sonde renvoyait
`ANGLE (Intel, Intel(R) UHD Graphics)` alors que la machine avait une RTX 3070.
Un commutateur suffit, dans [`electron/main.cjs`](../electron/main.cjs) :

```js
app.commandLine.appendSwitch('force_high_performance_gpu');
```

**2. Le goulot n'était pas le GPU, mais le nombre d'appels de dessin.** Diviser
la résolution par deux ne gagnait que 19 %, alors que masquer les personnages en
gagnait 61 % : signe qu'on soumettait trop d'objets, pas qu'on calculait trop de
pixels. La scène comptait **2 377 maillages** — 75 touches de clavier par bureau,
194 livres dans la bibliothèque, 16 feuilles par plante — et chacun est redessiné
trois fois par image (couleur, ombres, normales du GTAO).

La correction tient en deux gestes :

- **Fusionner la géométrie statique** par matériau (`mergeGeometries`). Les pivots
  animés des personnages restent séparés, tout le reste devient une poignée de
  maillages.
- **Mutualiser les matériaux.** Un `new MeshStandardMaterial` par livre rend la
  fusion impossible : 356 des 380 maillages restants avaient un matériau utilisé
  une seule fois. Une palette partagée les ramène à une vingtaine.

Deux pièges rencontrés en chemin : `RoundedBoxGeometry` est **non indexée** alors
que les autres primitives le sont, et `mergeGeometries` refuse de mélanger les
deux (il faut donc séparer les lots) ; et il faut retirer les attributs exotiques
avant de fusionner.

Résultat, étage 6 (le plus chargé), RTX 3070 Laptop à 1426×739 :

| | Avant | Après |
|---|---|---|
| Maillages dans la scène | 2 377 | **369** |
| Étage 6, qualité « haut » | 23 fps | **82 fps** |
| Banc « haut » (occlusion ambiante) | 39 fps | **109 fps** |

Deux coûts par image découverts en fin de parcours, tous deux invisibles à la
lecture du code : la **mini-carte se redessinait à chaque image** (214 px de
canvas, avec un secteur rempli par PNJ) alors que 20 Hz suffisent, et la liste
des sprites d'interface était reparcourue deux fois par image pour être masquée
pendant les passes de profondeur, alors qu'elle ne change qu'au chargement d'un
étage. À elles deux, elles coûtaient près de la moitié du débit.

Et surtout : masquer les personnages, couper les ombres ou diviser la résolution
ne change plus rien (60, 60, 59 fps). Il n'y a plus de goulot — on attend la vsync.

Paliers retenus : `moyen` (bloom seul) sur GPU intégré, `haut` (occlusion
ambiante + bloom) sur carte dédiée. `ultra` existe mais retombe à 30 fps même sur
une 3070 : la profondeur de champ redessine toute la scène et le MSAA 4× à 1,25×
de résolution coûte trop cher pour ce qu'il apporte.

## Tests

Le build embarque un mode d'autotest qui joue une partie scriptée, capture la
fenêtre et écrit un rapport JSON :

```bash
EscapeYourBoss.exe --selftest --out=C:\chemin\rapport
```

Il vérifie le démarrage, les menus, le déplacement, le strafe, l'accroupissement,
la sortie par les escaliers, le repérage par le directeur, l'enchaînement des
étages, le speedrun et le chargement du dernier étage — et remonte toute erreur
console ou exception non capturée.

En complément, un validateur Node vérifie **chaque étage hors du navigateur** :
que le poste de départ n'est pas dans un mur, que les deux sorties et tous les
objets sont atteignables par un parcours en largeur, et qu'aucune ronde de PNJ
(y compris le trajet café du directeur) ne bute sur un meuble. C'est lui qui a
attrapé les plantes posées devant une porte et le fauteuil encastré dans le
bureau du directeur.

## Limites connues du prototype

- Les cônes de vision affichés au sol traversent les murs (le calcul de
  détection, lui, en tient compte — c'est purement visuel).
- Les PNJ vont en ligne droite d'un point de passage au suivant : pas de
  navmesh, pas de contournement dynamique.
- Pas d'animation de sortie de cabine : la victoire se déclenche à la fermeture
  des portes.

## Journal des versions

### Multijoueur (1.6.0)

Coopération à deux en réseau local : TCP 47800 pour la partie, UDP 47801 pour la
découverte, l'hôte fait autorité sur l'état du monde. Architecture, messages et
autotest à deux fenêtres : [MULTIJOUEUR.md](MULTIJOUEUR.md#pour-les-développeurs).

### Personnages

La version **1.5.0** ajoute **67** et **Ela Ké Leitada** (Passinho do Jamal) à la roue :
maintenir `T`, sélectionner avec la souris ou `1–6`, puis relâcher. Leurs animations sont
créées dans Blender et exportées depuis les courbes du fichier source. Ela Ké Leitada
reprend les gestes de la trend d’après une vraie vidéo (capture Rokoko), calés sur
son drop musical, joué pendant la danse.
[Voir les deux animations](../tests/tendances/apercu.html) ·
[Sources Blender et retouches](../art/emotes/tendances-v01/README.md) ·
[Ela Ké Leitada v03](../art/emotes/tendances-v03/README.md).


La version **1.4.0** intègre des têtes et mains modélisées dans Blender au joueur
et aux collègues : quatre variantes de visage, paupières mobiles, oreilles et
lèvres dessinées, mèches sculptées et doigts articulés pour les quatre emotes.
Le corps habillé, le sac et le rig existants restent utilisés.
[Comparaisons et animations](../tests/anatomie/apercu.html) ·
[Fichiers Blender et guide de retouche](../art/personnages/anatomie-v01/README.md).

### Décor

La version **1.3.0** ajoute une scène humoristique propre à chaque niveau, avec
six accessoires Blender : café employé du mois, cascade de papier, chef de
chantier en cône, sablier de réunion, tour de dossiers et tampon de sortie.
[Captures des six niveaux](../tests/humour/apercu.html) ·
[Sources Blender éditables](../art/humour/meridien-v01/README.md).


Le bureau porte désormais l’identité de l’entreprise fictive **Méridien** :
moquette pétrole, chêne clair, signalétique commune, espaces de pause et de
réunion, postes personnalisés et ville en volume derrière les fenêtres.
Les graphismes et leur placement se modifient dans `src/environment.js` ;
les matières sont dans `src/materials.js`. Les parcours existants sont conservés.

Depuis la version **1.1.0**, les bureaux de travail, fauteuils, volées d’escalier
et porte de la cage utilisent de vrais exports Blender dans les niveaux.
[Sources Blender éditables](../art/decor/meridien-v01/README.md) ·
[Comparaison en jeu](../tests/environnement/blender-v01/apercu.html).
La majorité des autres éléments architecturaux et accessoires restent procéduraux.
La version **1.1.1** dégage le passage entre la réunion et l’escalier aux niveaux
5 et 6 : le mur décoratif ne recouvre plus la porte franchissable.

La version **1.2.0** ajoute sept matières préparées dans Blender : bois, textile,
moquette, pierre, béton, métal et cuir. Elle corrige aussi l’échelle des textures
sur les meubles, les murs et les plafonds.
[Diagnostic des 51 matières](../tests/textures/DIAGNOSTIC.md) ·
[Comparaison avant/après](../tests/textures/apercu.html) ·
[Sources Blender](../art/matieres/meridien-v01/README.md).

Validation et captures : [tests/environnement](../tests/environnement/README.md).

### Passe UX et personnages — 24 septembre 2026

Le sprint dispose d’une récupération stable, les menus se pilotent au clavier,
les objectifs apparaissent sur la mini-carte et la pause se déclenche quand le jeu
perd le focus. Les options proposent sensibilité souris, caméra stable et rappel
des commandes. La peau, les cheveux, la forme du visage et le sac ont été retouchés.

Validation locale : `npm run test:personnages`, `npm run test:confort`,
`npm run test:sauvegarde`. Le `--selftest` Windows utilise son propre profil temporaire.

Pour créer tes propres personnages : [guide Unreal Engine 5 et Blender](CREER_DES_PERSONNAGES.md).

### Lao D dans Blender — proposition à valider

Blender 5.2.2 LTS a réellement créé et exporté les assets. Le jalon technique
Blender → GLB → Electron/Three → animation est validé. Le premier personnage
complet est disponible dans [art/lao-d/proposition-v03/lao-d-v03.blend](../art/lao-d/proposition-v03/lao-d-v03.blend).

[Captures avant/après](../tests/blender/jalon-b/README.md) ·
[Guide de retouche et d'export](blender/GUIDE_LAO_D.md) ·
[Contrat et limites](blender/CONTRAT_ET_JALONS.md).

La proposition attend la validation artistique. Le jeu normal et les PNJ gardent
leurs personnages procéduraux ; l'atelier Windows se lance avec
`--selftest --blender --visuel`. Le modèle avec les bretelles corrigées compte 29 248 triangles et
11 appels de dessin. Aucun gain FPS n'est encore annoncé.

Trois collègues sont également disponibles en sources Blender : **Directeur Wang,
Zhang Jie et Lao Liu**. [Fichiers et guide](blender/GUIDE_COLLEGUES.md) ·
[Aperçus dans Electron](../tests/blender/collegues-v01/README.md).
Atelier isolé : `--selftest --blender --collegues`. Leur intégration aux PNJ en
partie reste à réaliser après validation des propositions.

Les animations du joueur proposent maintenant **six emotes**,
avec interruption par déplacement ou accroupissement et transitions adoucies.
[Animations historiques](../tests/animations/apercu.html) · [67 et Ela Ké Leitada](../tests/tendances/apercu.html).

## Si vous voulez aller vers un vrai photoréalisme

Ce prototype vise la qualité « archviz temps réel », pas Lumen/Nanite. Pour franchir
le palier, il faut changer de moteur **et** d'assets. Ressources gratuites précises :

**Moteur** — Unreal Engine 5 (Lumen + Nanite), ou Unity HDRP.

**Intérieur de bureau**
- *Archviz Interiors Vol. 1-6* — Epic Games, gratuit sur Fab (ex-Marketplace)
- *Office Props Pack* — Kenney.nl (CC0, low-poly, bon pour le blocking)
- *Modern Office* — Sketchfab, filtrer sur licence CC-BY
- Poly Haven — mobilier et props scannés, CC0

**Matériaux**
- **ambientCG.com** — moquette, bois, métal brossé, verre ; CC0, 2K à 8K, PBR complet
- **Poly Haven** (textures) — CC0
- **Quixel Megascans** — gratuit avec un compte Epic, pour usage Unreal

**Éclairage HDRI**
- Poly Haven HDRIs — chercher *golden hour*, *sunset*, *rooftop* ; 16K, CC0
- *Kloppenheim 06*, *Venice Sunset*, *Spruit Sunrise* sont les classiques du genre

**Personnage**
- **Mixamo** (Adobe, gratuit) — personnages rigués + animations *stealth walk*,
  *crouch walk*, *sneak* prêtes à l'emploi
- **Character Creator 4** en essai, ou **MetaHuman** (Unreal, gratuit)
- *Ready Player Me* pour un avatar rapide

**Sons**
- freesound.org — *office ambience*, *keyboard typing*, *footsteps carpet*

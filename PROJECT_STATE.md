# Escape your boss — état du projet

> Document de reprise. Il décrit ce qui existe, **pourquoi** c'est fait comme ça,
> ce qui a déjà été essayé et raté, et ce qui reste ouvert.
> Dernière mise à jour : 25 septembre 2026 (emote Ela Ké Leitada avec musique, version 1.5.0 §25).
> Les mesures du 20 septembre restent des références historiques ; voir §9 pour la nouvelle passe.

---

## 1. Le jeu en une page

Jeu d'infiltration humoristique en 3D. Tu es **Lao D**, employé de bureau. Il est
18 h. Tu veux partir. Tes collègues, eux, ont « juste cinq minutes » à te
prendre. Se faire repérer, c'est perdre.

- **6 étages** enchaînés, de 18 h 00 à 21 h 00, sur **3 plans** de bureau.
- Objectifs : parfois filer directement, parfois récupérer un objet (badge,
  portable) avant de rejoindre l'**ascenseur** ou les **escaliers**.
- Deux modes : **campagne** (déblocage étage par étage) et **speedrun** (tout
  ouvert, chrono cumulé).
- Livré comme **exécutable Windows**. Pas de version navigateur — décision
  assumée, voir §4.1.

L'humour n'est pas du décor : c'est la raison d'être du projet. La roue
d'emotes, les répliques des collègues, le haussement d'épaules après une
fausse alerte — tout ça compte autant que la détection.

---

## 2. Comment le lancer

```bash
npm start                 # Electron en direct (nécessite un environnement graphique)
npm run build:win         # -> dist/EscapeYourBoss-win32-x64
```

Le circuit de test utilisé pendant tout le développement, depuis WSL :

```bash
npm run build:win
cp -r dist/EscapeYourBoss-win32-x64/. /mnt/c/Users/nicol/EscapeYourBoss/
cd /mnt/c/Users/nicol/EscapeYourBoss
./EscapeYourBoss.exe --selftest --out=C:\Users\nicol\selftest
```

> **Electron ne démarre pas sous Linux ici** : `libnss3.so` manque. C'est pour
> ça que tout passe par l'interop Windows. Ce n'est pas un bug du jeu.

Sauvegarde : `%APPDATA%/EscapeYourBoss/progression.json` (étages finis, records,
touches, options). À défaut, reprise automatique de `%APPDATA%/PartirALHeure/progression.json`,
sans modifier cet ancien fichier. Les selftests utilisent un profil temporaire isolé.

---

## 3. Architecture

Pas de bundler, pas de framework. Des modules ES chargés directement par
Chromium, et Three.js **vendorisé** dans `vendor/` pour que rien ne dépende du
réseau.

```
index.html          462  DOM de l'UI, feuille de style, écran de boot
src/
  main.js           917  orchestrateur : boucle, états de partie, roue d'emotes
  level.js         1056  construction géométrique d'un étage, fusion des meshes
  body.js           921  squelette, surfaces de corps, rubans de vêtement
  materials.js      899  génération procédurale de toutes les textures PBR
  characters.js     627  assemblage d'un personnage, visage, accessoires
  npc.js            524  perception, machine à états, comportements
  player.js         375  déplacement, accroupi, endurance, animation
  audio.js               ambiance WebAudio spatialisée, sans alerte sonore
  render.js         299  renderer, post-traitement, IBL, profil matériel
  levels.js         290  3 plans de bureau + 6 étages + rondes
  emotes.js              4 emotes en poses clés, corps et expressions
  menu.js           182  navigation, sélection d'étage, remappage
  ui.js             108  HUD, écrans de fin, transitions
  minimap.js         90  rendu 2D de la mini-carte
  input.js           70  13 actions remappables
  store.js           46  pont de sauvegarde
electron/
  main.cjs          563  fenêtre, IPC, lecture d'assets, harnais --selftest
  preload.cjs        13  contextBridge (sandbox actif)
assets/alerte.mp3       ancien asset conservé, plus chargé ni utilisé
extraits-son/           les 11 bruitages découpés, hors build
```

**Flux d'une partie** : `main.js` construit la scène via `level.js`, qui demande
ses matériaux à `materials.js`. Les PNJ et le joueur sont des personnages
assemblés par `characters.js` sur des squelettes de `body.js`. Chaque frame :
entrées → `player.update` → `npc.update` (perception puis comportement) → caméra
→ HUD → rendu post-traité.

---

## 4. Les décisions structurantes

### 4.1 Electron seulement, pas de navigateur

Demandé explicitement : *« fais en sorte que le jeu soit uniquement un
exécutable et optimise-le exclusivement pour ça »*. Ce que ça débloque :

- `force_high_performance_gpu` — sans ça, Chromium choisissait le GPU Intel
  intégré au lieu de la RTX 3070. C'était **la** cause du plafond à 7 fps.
- `autoplayPolicy: 'no-user-gesture-required'` — plus de contexte audio
  suspendu tant que rien n'a été cliqué.
- Lecture de fichiers par IPC, ce que `file://` interdit (voir §5.6).
- Textures en 1.5× et ombres 4096 sans se soucier d'une machine faible inconnue.

### 4.2 Pas de moteur physique

Il n'y en a pas besoin, et un moteur aurait rendu la ligne de vue opaque.

- Collisions : **cercle ↔ AABB**, quelques dizaines de boîtes par étage.
- Ligne de vue : **segment ↔ AABB** (test des tranches) avec comparaison de
  hauteur.

La conséquence est ce qui fait le sel du jeu : **s'accroupir est une occlusion
géométrique réelle**, pas un malus de probabilité. La hauteur des yeux passe de
1,62 m à 1,02 m, et un bureau à 1,10 m devient un vrai mur. Le joueur peut le
comprendre en regardant, sans lire de règle.

### 4.3 Textures générées, pas téléchargées

Tout est peint sur `<canvas>` au chargement, les normales dérivées des hauteurs
par Sobel. Zéro asset externe, zéro problème de licence, et chaque matière est
réglable par ses paramètres.

Coût : ~3,5 s de génération au lancement (11,2 s avant l'optimisation `champLent`,
qui calcule le bruit basse fréquence en résolution réduite puis interpole).

### 4.4 Amortissement indépendant de la fréquence d'images

Partout : `1 - Math.exp(-k * dt)`, **jamais** `lerp(a, b, k * dt)`. La seconde
forme change de comportement selon le framerate et devient instable si `dt`
monte. C'est une règle tenue dans tout le code.

### 4.5 Personnages : tubes balayés + skinning

Les personnages ne sont pas des assemblages de primitives. `body.js` génère des
**surfaces continues** en balayant des sections le long de chaînes de points de
contrôle, avec des poids répartis sur **deux os** par point. Sections en
superellipse, rayons avant/arrière distincts, arcs partiels.

C'est ce qui a fait passer les personnages de « Playmobil » à quelque chose de
continu. Les pièges que ça a coûtés sont en §5.

Trois mécanismes ont été ajoutés depuis, et ce sont eux qui ont réglé le
« torse sans matière » et les derniers raccords visibles :

- **Ouverture variable en hauteur** (`arc(y)`) et **bord libre déformable**
  (`bord(a, t)`). Un arc constant ne fait ni le V d'une veste ni une coupe de
  cheveux : il fait un gilet fendu et un casque. Le bord déformable sert à
  casser les arêtes horizontales parfaites, qui sont ce qui trahit une pièce
  générée.
- **Rubans posés sur la surface.** `sur()` et `surX()` rendent le point exact
  du maillage à une hauteur et une abscisse données, avec sa normale. Les
  revers, le col, la cravate, la ceinture, les sangles et le cordon de badge
  en sont dérivés, au lieu d'être des boîtes placées à des cotes devinées.
- **UV en mètres.** Chaque tube étirait sa texture sur [0,1], donc la maille du
  tissu était deux fois plus grosse sur le torse que sur un bras. Maintenant
  1 unité UV = 0,9 m de surface, partout.

Les vêtements et accessoires qui ne portent qu'**un seul os** (cravate,
ceinture, sangles, cordon) sont des pièces **rigides** attachées à cet os, pas
des `SkinnedMesh`. Ce n'est pas un détail : voir §5.10.

---

## 5. Bugs résolus dont la cause n'était pas celle qu'on croyait

Cette section est la plus utile du document. Dans presque tous les cas,
l'intuition était fausse et seule la mesure a tranché.

### 5.1 « 7 images par seconde »

Trois causes empilées, trouvées dans cet ordre :

1. Le jeu tournait sur l'**Intel UHD**, pas sur la RTX 3070. → `force_high_performance_gpu`.
2. **2377 meshes** par étage : limité par les appels de rendu, pas par le GPU.
   → fusion des géométries par matériau (`mergeGeometries`).
3. Sur les 380 meshes restants, **356 avaient un matériau à usage unique**.
   → palette de matériaux partagés.

Ce qui a été essayé **et n'a rien donné** : éteindre les 18 lampes ponctuelles
(8 → 8 fps) ; diviser la résolution par deux (+19 % seulement).

Effet secondaire piégeux : `dt` était plafonné à 0,05 s, donc à 7 fps le temps
de jeu s'écoulait à **36 % de la vitesse réelle**. Les mesures de durée étaient
fausses avant de corriger ça.

### 5.2 Membres détachés (« effet Rayman »)

Chaque tube de membre était pondéré à 100 % sur son propre os. À la moindre
rotation, l'épaule s'ouvrait. **Correctif** : les premiers points de contrôle de
chaque chaîne sont ancrés sur l'os *parent* (`buste`, `racine`), ce qui coud la
naissance du membre au torse.

### 5.3 Membres en spaghetti

`THREE.Skeleton` calcule les matrices inverses de liaison **dans son
constructeur**, à partir des matrices monde des os. Il était créé avant
`updateMatrixWorld()`, donc ces matrices valaient l'identité.

**Correctif** : `construireSquelette()` ne retourne que les os ; `lierSquelette()`
crée le `Skeleton` après la mise à jour des matrices. À ne jamais refusionner.

### 5.4 Torse transparent

La veste est une **surface ouverte** (57° d'ouverture devant, sans bouchons).
En `FrontSide`, ses faces arrière sont supprimées et on voit à travers le
personnage. **Correctif** : `side: THREE.DoubleSide` sur le matériau de veste.

Même famille : le col était un cylindre **ouvert**, dont les faces arrière
lisaient comme un trou noir dans la poitrine. Il est fermé désormais.

### 5.5 Textures qui « ne ressemblaient à rien »

Le tissu avait été réglé à `repeat: 20`. Mesure faite après coup : à cette
échelle, **la maille faisait 0,29 mm sur le torse** et se moyennait en aplat
gris. J'avais *augmenté* le repeat en croyant affiner la matière.

**Correctif** : `repeat: 3` (maille à 2 mm, plis à 5 cm — lisibles à distance de
jeu).

**Le même piège, deux fois de plus**, trouvé à la passe d'habillage :

- Les **cheveux** étaient à 160 mèches par tuile. Une tuile de calotte fait
  30 cm : chaque mèche mesurait **2 mm** et se moyennait en un aplat noir, d'où
  la lecture « casque ». À 44 par tuile, les mèches font 7 mm et se lisent.
- Le **fil** du tissu était une sinusoïde verticale de 15 mm d'amplitude, la
  même pour tous les vêtements. C'est ce qui faisait lire la veste comme du
  velours côtelé en plastique, et c'est la vraie cause du torse « sans
  matière » — pas la couleur.

Les vêtements ont maintenant **trois armures distinctes**, parce que c'est le
contraste entre elles qui fait lire « chemise » et « veste » au premier coup
d'œil : popeline (toile fine, plis courts), serge (côte diagonale de 4,7 mm,
plis amples) et flanelle (côte floue, beaucoup de poil). La veste est passée de
`roughness 0.95 / envMapIntensity 0.55` — un lambert sombre, sans aucun modelé —
à une matière avec lobe de reflet rasant, qui dessine le volume des épaules.

### 5.6 Le mp3 ne se chargeait pas

Chromium bloque `fetch()` sur une origine `file://`. **Correctif** : le processus
principal lit le fichier (`ipcMain.handle('asset:lire')`) et renvoie les octets ;
le rendu les décode avec `decodeAudioData`.

Deux détails qui mordent : `decodeAudioData` **consomme** l'ArrayBuffer, donc on
lui passe une copie (`.slice(0)`), sinon un second appel reçoit 0 octet. Et
`ffmpeg` refusait le fichier — c'est le build minimal de Playwright, sans
décodeur MP3 ; le fichier était parfaitement valide.

### 5.7 Étage 6 « impossible à finir »

**Trois** positions de départ successives, chacune révélée mauvaise seulement
après avoir corrigé la précédente :

| Départ | Problème | Survie |
|---|---|---|
| (-17,5 ; -11,5) | à 1,40 m de Zhang Jie, dans son cône | 1,7 s |
| (-8 ; -12) | hors cône, mais à 0,8 m de son **itinéraire** | 4,7 s |
| (-5 ; 7,5) | hors cône et loin des rondes, mais dans le **balayage** de Zhou Min (±62°) | 3,6 s |
| **(-3 ; 2,5)** | validé contre les trois | **35 s, toujours en vie** |

**La règle à retenir** : un départ sûr se valide contre **trois** choses, pas
une — le cône à l'instant zéro, la distance aux itinéraires de ronde, et
l'amplitude de balayage de tête des assis.

Corrections associées : `chasseDebut` retiré, le portable déplacé du bureau du
directeur (deux objectifs incompatibles pendant qu'il chassait) vers la salle de
réunion, patrouilles ralenties, `dist` du directeur à 15.

### 5.8 Emote qui ne se terminait jamais

Le poids de sortie était recalculé depuis `e.t` à chaque frame, donc la
soustraction ne s'accumulait jamais. **Correctif** : un poids amorti persistant.

### 5.9 Divers, même famille

- **Ciel blanc** : `Sky.js` applique sa propre courbe *puis* subit le tone
  mapping ; en plus le halo dépassait `SKY_SCALE` et le canal rouge saturait à
  255. Remplacé par une equirectangulaire écrite en espace linéaire.
- **Sol vert** : 7 cônes de vision jaunes superposés sur une moquette bleu-gris.
  Reconstruits en dégradé à 3 anneaux par couleurs de sommets.
- **Frange lue comme un bandeau** : bord libre d'une surface ouverte qui
  dépassait du front. Le dernier anneau est maintenant plus étroit que le crâne.
- **`mergeGeometries` qui renvoie `null`** : `RoundedBoxGeometry` est **non
  indexée**, les autres primitives le sont ; mélanger échoue. L'indexation
  faisait partie de la clé de regroupement, ce qui laissait la cravate séparée
  de son nœud et le cordon de son attache. `fusionnerParPivot` déroule
  maintenant l'index (`toNonIndexed()`) avant de fusionner : quelques centaines
  de sommets dupliqués contre un appel de dessin économisé.
- **A/D inversés** : pas une préférence clavier, un vrai bug de signe. À
  `camYaw = 0`, la droite de l'écran est en `-X` ; le code calculait `+X`.

---

### 5.10 « Effet Rayman », deuxième round : la ligne d'épaule

§5.2 avait cousu la naissance des membres au torse par les poids de skinning.
Le personnage restait pourtant deux rouleaux pendus de part et d'autre du
tronc, sans carrure. Deux mesures ont tranché, aucune des deux n'était une
histoire de skinning :

| | avant | après |
|---|---|---|
| naissance du bras | y = 1,482 | y = 1,452 |
| ligne d'épaule du torse | 1,425 à 1,468 | inchangée |
| rayon du deltoïde | 8,1 cm | 5,5 cm |
| largeur totale aux épaules | 62 cm | 48 cm |

Le tube de bras **naissait au-dessus de la ligne d'épaule** : il sortait du
tronc et montait jusqu'au cou. Et il faisait 16 cm de diamètre pour un torse de
36 cm de large — il chevauchait le tronc de 6 cm et débordait de 11 cm. Un
deltoïde d'adulte fait 5,5 cm de rayon.

**La règle à retenir** : quand un membre a l'air rapporté, comparer ses cotes à
celles du tronc *en chiffres* avant de toucher aux poids. Ici le skinning était
juste depuis le début.

### 5.11 Les pièces d'habillage étaient sous le vêtement

La cravate, les boutons, la poche et le badge étaient posés à des cotes fixes
(`z = 0,100`, `z = 0,108`…) devinées une fois pour toutes. Or le torse est une
superellipse dont le rayon varie avec la hauteur, et la veste est 1,5 cm plus
large que la chemise. Résultat : la moitié des détails était **enfoncée dans le
vêtement**, et le torse paraissait nu.

**Correctif** : `surfaceTete()`, `surfaceBuste()` et `surfaceBassin()` rendent
le point réel du maillage, et tout se pose dessus. Symptômes disparus du même
coup :

- les **coins de la ceinture** — une boîte de 33,8 × 23,2 cm dont les quatre
  angles sortaient du corps elliptique de 4 cm et pointaient sous la veste
  comme deux galets noirs. C'est un anneau qui épouse le bassin maintenant ;
- **deux points blancs au milieu de la cravate** : les boutons de chemise,
  posés au même décalage qu'elle, la traversaient. Ceux que la cravate
  recouvre ne sont plus générés ;
- une **ligne claire au milieu du ventre** : sous son bouton, la veste gardait
  une fente de 1,6 cm par laquelle la chemise apparaissait.

### 5.12 Le harnais de test photographiait le dos

Les étapes `portrait-visage` et `gros-plan` du `--selftest` réglaient
`player.yaw = 0` en espérant une vue de face, et cadraient le sac à dos. Le
personnage regarde +Z, la caméra à `camYaw` est dans la direction
`(-sin, -cos)` : pour le voir de face il faut `yaw = camYaw + PI`. L'orientation
est maintenant **dérivée** de la caméra au lieu d'être devinée, et l'étape
renvoie les deux angles pour qu'une inversion se voie dans le rapport.

Deux autres pièges du même harnais, corrigés :

- la caméra vise un point **décalé de 52 cm** (over-the-shoulder) ; à 1,2 m de
  distance ça cadre le personnage de trois-quarts et hors champ. Les portraits
  compensent ce décalage ;
- l'étape qui photographie un collègue approche le joueur à 1,6 m d'un PNJ,
  donc **le fait repérer**. Placée au milieu du script, elle faisait échouer la
  partie et toutes les captures suivantes montraient l'écran de fin. Elle est
  en dernier.

### 5.13 Le vêtement n'avait aucune couleur

Après la passe d'habillage, le torse paraissait encore « pas rempli ». Mesure
de la carte de couleur des trois tissus, sur [0,1] :

| | min | max | écart type |
|---|---|---|---|
| popeline | 0,819 | 0,903 | **0,013** |
| serge | 0,800 | 0,923 | **0,017** |
| flanelle | 0,808 | 0,915 | **0,015** |

Autrement dit un aplat : 1,5 % de variation, là où la moquette ou le bois en
portent vingt fois plus. Le tissage et les plis n'existaient que dans la carte
de relief, donc le vêtement n'avait de matière que sous une lumière rasante ;
de face, il redevenait une couleur unie.

**Correctif** : le tissage et les plis entrent aussi dans la couleur — un fil
qui passe dessus ne renvoie pas la même lumière que celui qui passe dessous,
même à plat — et une **carte d'occlusion** assombrit les creux de pli
indépendamment de l'éclairage. En r169 il suffit de laisser `channel` à 0 pour
qu'`aoMap` lise le jeu d'UV existant : pas besoin d'un second jeu.

Deux défauts de surface sont tombés avec :

- **Une arête de lumière du haut en bas du torse.** `computeVertexNormals`
  moyenne les normales des faces qui partagent un *index*, pas une *position* :
  à la couture d'un tube fermé, les deux bords occupent le même point mais
  portent deux indices, et leurs normales ne sont jamais fondues. Elles sont
  recousues par position désormais. Les bords libres voulus (ouverture de
  veste, coupe de cheveux) ne bougent pas : leurs deux lèvres sont à des
  positions différentes.
- **La texture ne se raccordait pas à la couture.** Le tour du torse portait
  2,72 tuiles, donc un décalage d'un quart de motif en refermant. Les `repeat`
  des personnages valent 3 ou 9 : arrondir au tiers de tuile referme le motif,
  au prix d'un étirement d'un sixième au pire, invisible.

### 5.14 Un L lisible par le spectateur, pas par le personnage

« Take the L » a demandé trois corrections, chacune trouvée en mesurant plutôt
qu'en regardant :

1. **Mauvaise main.** Le personnage nous fait face, donc son bras gauche occupe
   la gauche de l'image et son pouce, qui pointe vers l'axe du corps, part vers
   la droite : la lettre se lit à l'endroit. Avec la main droite on obtient un
   L en miroir.
2. **Mauvais endroit.** Les angles d'épaule et de coude se composent en XYZ, et
   l'estimation à la main s'est trompée de 25 cm : le premier jet mettait la
   main à 31 cm devant la tête, le deuxième la plaquait au milieu du front où
   l'avant-bras masquait les lunettes. Un balayage des trois angles contre une
   cible posée au-dessus de la **tempe** a donné la pose à 7 mm près.
3. **Pas de lettre.** Au repos le pouce n'est écarté que de 0,85 rad des autres
   doigts, soit 49° : une main, pas une équerre. Il a fallu le sortir du groupe
   des doigts pour pouvoir l'ouvrir seul. Optimisés ensemble, doigts et pouce
   tombent à **83°**, les doigts verticaux et le pouce horizontal dans le plan
   de l'image.

Deux réglages de lisibilité par-dessus : la jambe du cancan, lancée droit
devant et à pleine amplitude, pointait vers la caméra et n'était plus qu'un
tube en raccourci barrant la silhouette ; et le balancement du buste promenait
la main de 15 cm en travers du visage d'un temps à l'autre.

**La règle à retenir** : une pose se juge depuis la caméra, pas depuis le
personnage, et les angles d'une chaîne à trois articulations ne s'estiment pas
de tête. `tests/personnages/pose-emote.mjs` donne la position du poignet en une
seconde.

## 6. Les systèmes, un par un

### 6.1 Perception des collègues (`npc.js`)

Quatre états, avec hystérésis pour ne pas clignoter à la frontière :

```
travail  <0.14 | doute  >0.22 | observation  >0.52 | repéré  >=1.0
```

La bande 0,14–0,22 n'appartient à personne : c'est elle qui stabilise.

La suspicion monte selon la distance, l'angle au centre du cône, l'éclairage et
la vitesse du joueur, **si et seulement si** la ligne de vue passe le test
segment ↔ AABB avec la bonne hauteur. En observation, `perceived *= 0.7` :
c'est une **fenêtre de pardon** délibérée, le temps de se rejeter derrière un
bureau.

Chaque bascule d'état a un retour lisible : sursaut de tête, bip, réplique,
secousse de caméra, bruitage cartoon. On doit pouvoir comprendre « il est en
train de me repérer » sans lire la barre en haut de l'écran.

Une fausse alerte se termine par un **haussement d'épaules** — le collègue se
persuade qu'il n'a rien vu. C'est du confort de lecture autant que de l'humour.

Assis : 4 occupations (`clavier`, `lecture`, `etirement`, `cafe`) et un balayage
de tête. Patrouilles : itinéraires par plan, avec pauses.

### 6.2 Déplacement (`player.js`)

On pilote un **vecteur vitesse**, pas un scalaire. Avec un scalaire, changer de
direction fait pivoter le déplacement instantanément — c'est ce qui donnait la
sensation de grille. Ici un demi-tour décrit une courbe.

```
marche 2,9 m/s · course 5,0 m/s · accroupi 1,3 m/s
endurance : -0,30/s en courant, +0,14/s en marchant  ->  ~3,3 s de sprint
```

La course est donc **volontairement courte** : un sprint de 16 m, puis il faut
remarcher. Elle sert à sauver une situation, pas à traverser l'étage.

Relancer coûte plus cher que freiner, et une inflexion à pleine vitesse est
pénalisée (`accel *= 0.55 + 0.45 * cap`), donc on n'attaque pas un virage serré
au sprint.

### 6.3 Rendu (`render.js`)

`EffectComposer` → `GTAOPass` → `BokehPass` → `UnrealBloomPass` → `OutputPass`,
cible HDR en demi-flottant, tone mapping ACES.

L'**IBL vient d'une fausse pièce émissive**, pas du ciel : éclairer l'intérieur
avec la voûte céleste écrasait le contraste et donnait une image plate.

`profilMateriel()` détecte le GPU et ajuste anisotropie (8 ou 16), échelle de
texture (1 ou 1.5) et ombres (2048 ou 4096). **Il n'y a pas de réglage de
qualité dans les menus** — retiré à la demande.

### 6.4 Audio (`audio.js`)

Tout est synthétisé en WebAudio : pas, clavier, bips, alarme, ding, porte,
téléphone, café, impression, plus une nappe de murmures (bruit filtré à 420 Hz)
et une ventilation (dent de scie à 58 Hz).

**Une seule exception** : `assets/alerte.mp3`, une banque de bruitages cartoon
de 31,8 s. Elle est découpée **à la volée** par enveloppe RMS (fenêtres de
20 ms, seuil à 6 % du pic, tolérance de 80 ms de creux) en 11 bruitages, chacun
décrit par sa crête, la position de son attaque et sa hauteur moyenne.

`_choisirSting()` note les candidats — court, fort, attaque franche — et retient
actuellement **17,48 s → 18,26 s** (0,78 s, crête 0,97, attaque à 5 % de la
durée, 1492 Hz). Joué quand un collègue passe en **observation**, avec un verrou
de 4 s pour que trois collègues qui lèvent la tête ensemble ne déclenchent pas
trois fois le même gag.

Pour en imposer un autre : `SEGMENT_ALERTE` en tête de `audio.js`. Les 11 blocs
sont découpés dans `extraits-son/` (des mp3 valides, coupés aux frontières de
trames MPEG, donc écoutables tels quels).

> **Absent** : aucune spatialisation. Tous les sons arrivent au même niveau quelle
> que soit la distance. C'est le plus gros manque audio identifié.

### 6.5 Roue d'emotes (`main.js` + `emotes.js`)

Radiale, esprit Fortnite : maintenir la touche (`T` par défaut) ouvre la roue,
la souris choisit un secteur (7 cases à R=152, zone morte de 26 px), relâcher
lance l'emote. Tant que la roue est ouverte, la souris **ne pilote plus la
caméra**.

Les 8 emotes — `tchao`, `danse`, `celebration`, `arrogance`, `moulin`, `troll`,
`robot`, `takeL` — sont des poses de squelette structurées en
**anticipation → accent → tenue → retour**, pas des interpolations plates.
La roue se construit depuis `EMOTES`, donc en ajouter une suffit : secteurs,
zone morte et sélection s'ajustent seuls.

**« Take the L »** demande plus que des angles : le personnage doit dessiner une
lettre lisible **par le spectateur**, ce qui a coûté trois erreurs, toutes
corrigées en mesurant (§5.13).

Elles ont un **coût** : les témoins gagnent `0.26 * (1 - d/16)` de suspicion si
la ligne de vue passe, les autres à moins de 7 m gagnent 0,09. Provoquer est
drôle et dangereux, ce qui est exactement le but.

### 6.6 Niveaux (`levels.js`)

3 plans (A, B, C) et 6 étages. Le temps imparti n'est **une vraie contrainte
qu'au dernier étage** — mesures du parcours obligatoire :

| Étage | Plan | Parcours | Marche continue | Imparti |
|---|---|---|---|---|
| 1 | A | 35,0 m → ascenseur (escalier : 54,8 m via le passe) | 12 s | 185 s |
| 2 | A | 59,9 m via badge → ascenseur (escalier : 69,1 m) | 21 s | 175 s |
| 3 | B | 40,4 m → ascenseur | 14 s | 170 s |
| 4 | B | 68,9 m via portable → ascenseur (escalier : 85,2 m) | 24 s | 165 s |
| 5 | C | 22,6 m → ascenseur (escalier : 44,3 m via le passe) | 8 s | 160 s |
| 6 | C | 92,5 m via badge + portable + passe → escalier (ascenseur : 101,9 m) | **32 s** | **66 s** |

Autrement dit : aux étages 1 à 5, la pression vient des collègues, pas du
chrono. À l'étage 6, il reste 34 s de marge pour se cacher et laisser passer
les rondes — serré **par dessein**, pas cassé (66 s depuis la section 30, pour
absorber le détour du passe).

### 6.7 Entrées et menus

13 actions remappables sur 2 touches chacune, avec déduplication automatique
(assigner une touche déjà prise la libère ailleurs). Menu principal → campagne /
speedrun / commandes / options. Options : son, cônes de vision, noms, remise à
zéro.

---

## 7. Comment ce projet se teste

Deux harnais, et ils ont porté à peu près toutes les décisions.

### 7.1 Validation hors ligne (Node + three.js bouchonné)

`logic/` contient une copie des modules de logique et un faux module `three`.
Ça permet de faire tourner `level.js` **sans navigateur**, en ~1 seconde :

- `niveaux.mjs` — accessibilité par BFS, dégagement des itinéraires de ronde,
  **sûreté du départ** (cône + itinéraire ≥ 3 m + amplitude de balayage).
- `parcours.mjs` — longueur du chemin obligatoire par Dijkstra 8-voisins,
  comparée au temps imparti. *(8 voisins et pas 4 : en 4-voisins une diagonale
  est surestimée de 41 %, ce qui fausserait tout le verdict.)*
- `depart.mjs` — cherche des positions de départ sûres.
- `diag-torse.mjs`, `chrono-textures.mjs`, `materiaux.mjs` — diagnostics.

Le même principe s'applique aux **personnages** : `body.js` et `characters.js`
tournent sous Node en important le Three.js de `vendor/` (un paquet `three`
bidon dont `addons` est un lien symbolique vers `vendor/jsm/`, et
`node --preserve-symlinks`). En une seconde on vérifie qu'aucune surface ne
contient de NaN, que les indices sont dans les bornes, que les poids de
skinning somment à 1 sur deux os valides, que les parties attendues existent,
et qu'après 300 images d'animation les paupières et le regard sont toujours
dans la scène. C'est ce test qui a attrapé le clignement agissant sur un
maillage que la fusion avait retiré de la scène.

### 7.2 `--selftest` dans l'exécutable

33 étapes scriptées : boot, partie, accroupi, victoire, échec, chargement de
chaque plan, menus, roue d'emotes, poses de personnage, dernier étage. Capture
19 images, écrit `rapport.json`, collecte `window.__erreurs` et la console.

Dernier passage (build du 20/09/2026) :

```
41 étapes / 41 · aucun échec · aucune erreur page · aucune erreur console
boot 11,4 s (matières 3,1 s, premier niveau 6,3 s)
étage 6 : 7 PNJ, 58 obstacles, 77 fps
roue d'emotes : 8 cases · emote lancée par index : takeL
mp3 : chargé, 31,81 s, 11 bruitages, retenu 17,48 s +0,78 s
alerte-en-jeu : déclenchée (le compteur était déjà à 4 avant le test forcé,
                donc le son part bien par le vrai chemin de jeu)
```

Les captures 14, 16, 17, 20, 21, 22 et 23 sont les portraits du personnage :
face, profil, dos, trois-quarts, gros plan, collègue, torse sans le sac. Les
captures 24 et 25 sont « Take the L » de face et de profil, prises en pleine
tenue, et l'étape qui les prend **renvoie l'identifiant de l'emote lancée** :
si l'ordre de la roue change, on le lit dans le rapport au lieu de
photographier une autre danse.

**Budget du personnage**, mesuré avant/après la passe d'habillage. Le jeu est
limité par les appels de dessin (§5.1), donc c'est cette ligne-là qui compte :

| | avant | après |
|---|---|---|
| surfaces skinnées | 5 | 5 |
| appels de dessin (Lao D complet) | 39 | 44 |
| triangles par personnage | 29 118 | 29 212 |

Les triangles sont revenus au niveau d'origine : les phalanges tombaient à 300
triangles pièce pour un centimètre de long, et il y en a vingt par personnage.
Elles sont passées à une subdivision d'arrondi. Les cinq appels de dessin
supplémentaires paient les groupes de doigts et de pouce, sans lesquels la main
ne peut ni s'ouvrir ni dessiner une lettre.

Les images par seconde **varient beaucoup d'un passage à l'autre** — jusqu'à
8 fps d'écart sur un même build — donc un seul run ne prouve rien. Sur trois
passages de chaque build :

| | avant | après |
|---|---|---|
| étage 6, 7 PNJ | 78 · 77 · 70 | 70 · 77 · 77 |
| marche, ~480 images | 116 · 105 · 113 | 105 · 107 · 106 |

Soit le même ordre de grandeur, à la dispersion près. Le préréglage du banc,
lui, est trop bruité pour conclure (70 à 89 fps en « ultra » sur le même
build) : ne pas s'en servir pour arbitrer une régression.

**Le premier passage après `npm run build:win` est à jeter** : la machine finit
d'écrire et de compresser 200 Mo pendant que le jeu démarre. Un run pris là a
donné 27 fps à l'étage 6, contre 77 aux deux suivants — de quoi croire à une
régression de 65 % qui n'existe pas.

Le premier jet coûtait bien plus cher — l'étage 6 était tombé à 67 fps, soit
-14 %. Deux causes, toutes deux des appels de dessin : les rubans avaient été
faits en `SkinnedMesh` alors qu'ils ne portent qu'un os, et les six pièces
d'œil étaient animées une par une, donc exclues de la fusion. Les rubans sont
devenus rigides, et les yeux comme les paupières vivent maintenant dans deux
groupes qu'on anime d'un bloc.

### 7.3 La leçon de méthode

**Mesurer, pas supposer.** À chaque fois que l'intuition a servi de guide, elle
s'est trompée : les lampes n'étaient pas le problème, la résolution non plus, le
tissu était trop fin et non trop grossier, et le niveau 6 n'était pas une
question de vitesse de patrouille mais de position de départ — trois fois de
suite.

Corollaire pratique : **toute substitution de texte dans un patch doit être
assertée**. Un correctif a été silencieusement perdu parce que la chaîne
cherchée n'existait plus, et le symptôme est réapparu bien plus tard.

---

## 8. Où on en est

### Fait et vérifié

- 6 étages jouables, campagne et speedrun, déblocage et records persistants.
- Détection lisible : cônes, 4 états, sursauts, répliques, bruitages.
- Accroupi comme occlusion géométrique réelle.
- Personnages skinnés continus, habillés : chemise à col et patte de
  boutonnage, veste à revers et col monté, cravate, ceinture, manchettes.
  Trois armures de tissu distinctes, cheveux à l'échelle réelle, mains à deux
  phalanges. Visage avec yeux (iris, pupille, reflet), sourcils et bouche.
- Micro-animations : clignement, dérive du regard, parole, respiration de la
  cage thoracique, et une dérive lente de la tête portée par un os dédié, qui
  ne se bat pas avec les rotations du jeu ni avec les emotes.
- Roue d'emotes à 8 entrées, dont « Take the L », avec réactions des collègues.
- Post-traitement complet, IBL intérieure, golden hour dégradée d'étage en étage.
- 13 actions remappables, menus complets.
- Bruitage cartoon d'alerte intégré et déclenché par le vrai chemin de jeu.
- Étage 6 rééquilibré : survivable **et** finissable (28 s de trajet / 62 s).

### Ouvert

1. **Aucune spatialisation audio.** Tous les sons sont au même niveau quelle que
   soit la distance. C'est le manque le plus visible — un `PannerNode` sur les
   sons de PNJ changerait beaucoup la lecture de l'espace.
2. **Départ de l'étage 2 à 2,1 m de l'itinéraire de Zhang Jie**, sous le seuil de
   3 m que je me suis fixé. Jamais signalé comme problématique en jeu, mais
   c'est la même famille de bug que §5.7. À traiter avant d'y retoucher.
3. **Le bruitage d'alerte est choisi sur des chiffres, pas à l'oreille.** Le
   profil est le bon (court, percussif, médium-aigu) mais personne n'a encore
   écouté les 11 blocs pour confirmer que c'est le plus drôle. `extraits-son/`
   est là pour ça, et changer d'avis coûte une ligne.
4. **Boot à 11,4 s**, dont 6,3 s pour le premier niveau. Acceptable, pas
   agréable. Le poste suivant serait la construction de la géométrie, pas les
   textures (déjà descendues à 3,1 s).
5. **Le sac à dos mange la silhouette.** Il est resté une boîte arrondie de
   32 × 44 cm, la seule grosse pièce du personnage encore faite de primitives.
   De dos il couvre tout le travail fait sur la veste, et de face ses sangles
   barrent la chemise et la cravate. C'est le prochain poste visuel.
6. **Le visage reste plat de profil.** Le nez et la bouche sont lisibles de
   face, beaucoup moins de côté. Creuser les orbites et marquer le sillon
   nasogénien demanderait des points de contrôle asymétriques dans la chaîne de
   tête, ce que `section()` ne sait pas faire aujourd'hui : elle est
   symétrique gauche/droite par construction.

### À ne pas refaire

- Ne pas recréer le `Skeleton` avant `updateMatrixWorld` (§5.3).
- Ne pas repasser les matériaux de vêtement en `FrontSide` (§5.4).
- Ne pas augmenter le `repeat` des tissus ni la densité des mèches en croyant
  affiner la matière : mesurer la taille du motif **en millimètres sur le
  personnage** avant de toucher au chiffre (§5.5).
- Ne pas poser une pièce d'habillage à une cote devinée : passer par
  `surfaceTete` / `surfaceBuste` / `surfaceBassin` (§5.11).
- Ne pas ajouter de `SkinnedMesh` pour une pièce qui ne porte qu'un seul os, ni
  animer individuellement des pièces que la fusion pourrait regrouper : les
  deux se paient en appels de dessin (§7.2).
- Ne pas croire qu'une capture du harnais montre ce que son nom annonce sans
  l'avoir regardée (§5.12).
- Ne pas juger une carte de texture à l'œil sur un rendu : en mesurer l'écart
  type. Un aplat à 1,5 % ressemble à une matière tant qu'on ne l'a pas comparé
  à autre chose (§5.13).
- Ne pas estimer de tête les angles d'un bras : les rotations se composent en
  XYZ et l'erreur se compte en dizaines de centimètres (§5.14).
- Ne pas déplacer un point de départ sans le valider contre les **trois**
  critères (§5.7).
- Ne pas remettre de compatibilité navigateur : la décision de §4.1 est ce qui
  paye les performances et l'accès disque.


## 9. Passe du 24 septembre 2026

### Identité et direction de la série

Le nom public est **Escape your boss**, le paquet `escape-your-boss` et
l’exécutable `EscapeYourBoss.exe`. C’est le premier volet envisagé d’une série
« Escape… » : *Escape your teacher*, *Escape the family dinner*, *Escape your wife*.
Ces thèmes sont des pistes pour de futurs jeux ou cartes, pas du contenu implémenté.
Le jeu actuel reste l’infiltration de bureau avec Lao D et ses six étages.

### Fluidité et contrôle

- Le sprint épuisé attend 28 % d’endurance avant de repartir : fini l’alternance
  course/marche à chaque image autour du seuil de 3 %. Le HUD explique la récupération.
- La simulation découpe les ralentissements courts en sous-pas d’au plus 1/60 s,
  avec une limite totale de 250 ms par image pour les gels prolongés. Les collisions
  restent calculées à petits pas ; le chrono ne plafonne plus à 50 ms par image.
- Un seul ciel et une seule IBL sont créés. Auparavant, le premier étage ajoutait
  un deuxième ciel et chaque changement reconstruisait l’environnement identique.
- Libération des passes lors de la reconstruction du composer et suppression de
  l’application double du pixel ratio sur ses cibles physiques.
- HUD mis à jour uniquement quand les valeurs affichées changent ; jauges animées
  par transformation. Fond statique de mini-carte mis en cache par niveau.
- Contour du joueur synchronisé seulement lorsqu’il est visible.

### Personnages

- Orbites, pommettes et menton sculptés dans la surface de tête. Le relief est
  partagé par le maillage et `surfaceTete`, pour que les accessoires suivent.
- Nuances de joues et de mâchoire par couleurs de sommets, sans texture supplémentaire.
- Peau et cheveux sans couche de vernis ; relief de tissu moins exagéré et sections
  du torse légèrement plus structurées.
- Sac aminci, resserré en haut, poche moins gonflée ; sangles réduites à 22 mm.
- Toujours **5 surfaces skinnées et 44 appels de dessin** pour Lao D complet.
  Ce sont encore des personnages stylisés procéduraux, pas des modèles réalistes.

### UX

- Menus lisibles, focus visible, navigation Tab/flèches/Entrée, boutons verrouillés
  réellement désactivés. Retour au menu depuis l’échec et options accessibles en pause.
- Pause sur perte de focus ou de capture souris, touches relâchées et roue fermée.
  Échap reprend depuis la pause. Le chrono reste arrêté dans les options de pause.
- Rappels de commandes et invitation d’interaction liés aux touches remappées.
  Les raccourcis de jeu ne changent plus les options pendant la navigation des menus.
- Sensibilité souris, caméra stable (sans secousses ni variation de champ), aide masquable.
- Objectifs visibles même sans objet préalable ; objets à récupérer marqués sur la carte.
  Les cônes de la carte suivent aussi leur option de visibilité.
- Progression visible pendant l’attente à l’ascenseur / aux escaliers. Le chrono
  speedrun ne chevauche plus la détection. Plus de record speedrun dupliqué dans le menu.
- Écran de transition entre étages ; restart nettoie emote, sprint, vitesse, caméra,
  portes d’ascenseur, alerte et conseil différé.

### Créer des personnages soi-même

Voir [le guide Unreal Engine / Blender](docs/CREER_DES_PERSONNAGES.md).
Pour un futur modèle custom, Blender + `.blend` et `.glb` est le chemin conseillé.
L’import GLB et l’adaptation d’armature restent à développer ; aucune migration
vers Unreal ni installation du moteur n’a été effectuée.

### Validation de cette passe

- `npm run test:personnages` : géométrie, skinning, assemblage et animations.
- `npm run test:confort` : sprint prolongé, comparaison déplacement à 30/144 Hz,
  remise à zéro, couleurs de sommets et budget de 44 appels.
- `npm run test:sauvegarde` : reprise de l’ancien nom, ancien fichier conservé,
  priorité au nouveau profil.
- `--selftest` enrichi : menus/remappage, pause et reprise, options en pause,
  restart et séparation du chrono/détection. Profil Windows temporaire, souris
  non capturée, rapport intermédiaire `progression-test.json` en plus du rapport final.

Les points audio spatial et départ de l’étage 2 du §8 restent ouverts. La sculpture
faciale et le sac ont été améliorés ; un personnage créé à la main reste le meilleur
levier pour changer nettement de niveau artistique.


Résultat final Windows du 24/09 : **44 étapes exécutées, zéro échec du harnais,
zéro erreur JavaScript**. Un avertissement du compilateur de shaders ANGLE/D3D11
(`potentially uninitialized variable`) est conservé dans le rapport ; il n’a pas
interrompu le rendu. Lao D : **29 364 triangles, 44 appels, 5 surfaces skinnées**.
Rapport et captures : [tests/validation](tests/validation/).
Build final également disponible sous `C:\Users\nicol\EscapeYourBoss\EscapeYourBoss.exe`.

Attention à l’interprétation du scénario historique « equite » : il journalise la
survie, mais ne l’impose pas par assertion. Sur ce passage, les départs des étages
5 et 6 laissent environ **16 secondes debout immobile** avant qu’une ronde repère
Lao D. Les 35 secondes du rapport du 20 septembre ne doivent plus être considérées
comme une garantie. Ni les départs ni les rondes n’ont été modifiés dans cette passe.
Les comparaisons de FPS entre captures de dimensions / profils différents ne
permettent pas de chiffrer un gain global ; les corrections d’endurance et les
réductions de travail de rendu sont vérifiées séparément.

## 10. Décor Méridien — 24 septembre 2026

Demande : donner au bureau une direction artistique cohérente, pendant que
l’utilisateur crée les personnages avec sa propre patte. Les modèles et les
animations de personnages n’ont pas été modifiés dans cette passe.

### Direction et réalisation

- Identité d’entreprise fictive **Méridien** : pétrole, ivoire, chêne clair,
  ocre et terre cuite. Signalétique, annonces, planning et affiches composés
  explicitement dans `src/environment.js`. Un atlas partagé, sans téléchargement.
- Moquette textile calme, joints à petite échelle ; terrazzo mat avec UV
  métriques ; bois à fil longitudinal ; métal de l’ascenseur moins brillant.
- Soubassements et rails muraux, panneaux acoustiques, hall habillé de lames
  de bois, numéros d’étage corrects (23/19/12), plaques de direction et réunion.
- Postes personnalisés selon leur usage, annonces de collègues, notes et
  dossiers. Humour du lieu : « Encore 5 minutes. Depuis 18 heures. »
- Plantes à feuilles courbes, bibliothèque réellement ouverte sur ses livres,
  tapis de détente et repères graphiques de pause. Extincteurs fixés aux parois.
- Ville remplacée par douze volumes en trois plans avec retraits de toiture.
  Elle appartient désormais au niveau et disparaît à son déchargement ; les
  anciens plans de ville restaient dans la scène après chaque changement.
- Appoint intérieur plus neutre, rebond solaire moins orange. Le coucher de
  soleil reste le principal contraste. Aucun nouvel éclairage dynamique ajouté.
- Les panneaux de sortie indiquent aussi les accès fermés. Le voyant animé
  de l’ascenseur est conservé hors fusion pour rester modifiable.

### Parcours et coût

Les collisions, départs et sorties sont exactement identiques sur les six
niveaux. Les ajouts sont placés sur les surfaces existantes ou au-dessus des
passages. Aucun changement de détection ni de comportement des PNJ.

Décor après fusion : 92 à 98 lots selon l’étage, contre 84 à 90 auparavant.
Étage 1 : 365 650 triangles, contre 359 510 (+1,7 %).
Étage 6 : 430 356 triangles, contre 424 108 (+1,5 %).
Le budget de test est de 100 lots. Les futures décorations doivent partager les
matériaux et garder les axes de déplacement dégagés.

### Validation

- `npm run test:environnement` : six étages, empreintes des parcours avant
  modification, budget de rendu, géométrie finie et retrait intégral du décor.
- `npm run test:confort` : contrôles, endurance et personnage toujours valides.
- `--selftest --decor` : revue Windows des six étages, vues fixes et caméra
  jouable, erreurs JavaScript et intervalles d’image enregistrés.
- Captures et protocole : `tests/environnement/`.

Correction de lancement indispensable : le préfixe accidentel `take unread
mails` précédant le premier import de `src/main.js` a été supprimé.

Revue Windows finale : **16 étapes, zéro échec et zéro erreur JavaScript**.
Profil haut, 1424 × 821, RTX 3070 Laptop : intervalles médians de 9 à 12 ms
sur les six vues, avec des pointes au-delà de 16,7 ms. Ces courtes mesures ne
prouvent pas un gain de FPS ni une cadence toujours supérieure à 60 FPS.
L’avertissement ANGLE/D3D11 déjà présent est conservé dans le rapport.
Chargement mesuré sur ce passage : environ 12 secondes ; il reste à optimiser.
Une dernière revue de dix étapes après ajustement de l’encadrement du panneau
Méridien passe également sans erreur. Voir `rapport-finitions.json` et les vues
actualisées dans `tests/environnement/captures/`.

## 11. Gel lors du changement d’étage — 24 septembre 2026

Le parcours réel par « Étage suivant » a reproduit un gel de **18,9 s vers
l’étage 2** et **20,0 s vers l’étage 6**, sur RTX 3070 Laptop. Le processus ne
s’est pas fermé pendant cette reproduction. Construire la géométrie prenait
0,9 à 1,2 s ; le reste provenait de la préparation du rendu.

### Cause et correctif

Les objectifs à ramasser contenaient une `PointLight`. Le passage de zéro à un
ou deux objectifs changeait le nombre de lumières visibles, donc les variantes
des shaders PBR de toute la scène. Le ramassage pouvait refaire varier ce nombre.
Deux lumières permanentes sont désormais réservées dans `Game` : seule leur
intensité change. Elles ne sont pas enfants des objets que l’on masque.

Le chargement conserve son voile pendant la préparation asynchrone des shaders
(`compileAsync`). La boucle ne tente pas de dessiner une scène en préparation.
Une exception affiche un bouton « Réessayer » et conserve la progression. Un
restart annule aussi le départ automatique différé du speedrun.

Une seconde anomalie était présente : les anciens PNJ étaient retirés de la
scène sans libérer leurs géométries, matériaux, squelettes et textures de texte.
Le décor ne libérait pas non plus ses matériaux locaux. `src/resources.js`
sépare maintenant les ressources de session et celles à détruire au changement
de niveau. Les ressources communes au joueur et aux autres PNJ sont préservées.
Les portes et le voyant de l’ascenseur appartiennent désormais à leur niveau.

### Validation

- `npm run test:transitions` : nettoyage et préservation des ressources partagées.
- `npm run test:environnement` : parcours et budgets inchangés sur les six étages.
- `npm run test:personnages` : géométrie, skinning et assemblage inchangés.
- Trois campagnes complètes via les vraies sorties et le bouton suivant :
  **18 étages, 21 étapes de test, aucun échec ni erreur JavaScript**.
- Premier passage vers le niveau 2 : **4,2 s**, dont moins d’une seconde de
  construction bloquante ; les passages suivants mesurés prennent environ
  **0,7 à 1,6 s**. La compilation restante laisse l’interface respirer.
- Avant : jusqu’à **173 textures / 759 géométries** après une campagne.
  Après trois campagnes : **100 / 247** en fin de parcours. Ces compteurs
  ne sont pas des mégaoctets ; ils vérifient l’absence d’accumulation continue.

Protocole et rapports : `tests/transitions/`. L’avertissement connu du compilateur
ANGLE reste conservé dans les rapports. Le gel reproduit est corrigé ; ces tests
ne constituent pas une preuve de l’absence de tout crash sur d’autres pilotes.
Le speedrun complet, l’erreur injectée suivie d’un nouvel essai et l’annulation
d’un départ différé sont également validés : six étapes, zéro échec. La seule
erreur de console de ce scénario est `TEST_CHARGEMENT_INJECTE`, provoquée
volontairement ; aucune erreur JavaScript non gérée n’a été relevée.

## 12. Portable du niveau 4 — 24 septembre 2026

Le portable est déplacé du bureau sud du directeur vers la table de la salle
de réunion nord du plan B : `(16, 1.0, -10.4)`. Le placement près du bord permet
de le ramasser sans buter contre la table. Vérification sur la géométrie réelle :
trajet libre depuis la porte et distance de ramassage de 0,90 m pour une portée
de 1,25 m. Le portable du niveau 6 garde sa position dans la salle de réunion
sud du plan C. Les sources et la distribution Windows sont synchronisées.


## 13. Visibilité, interactions et emotes — 24 septembre 2026

Cette section remplace les anciennes descriptions de sons d’alerte/emotes et
de bonus « à couvert » : ils ont été retirés à la demande du joueur.

### Règles lisibles

- Décision : **l’obscurité est une ambiance**, pas une protection. Le briefing
  le précise. Aucun coefficient d’éclairage implicite dans la détection.
- `perception.js` centralise portée, angle, proximité et ligne de vue, pour
  les PNJ et les témoins d’emotes. Le HUD affiche « Visible », « Entendu » ou
  « Hors des regards ». Un obstacle proche ne donne plus de bonus artificiel.
- La proximité immédiate permet toujours de remarquer un joueur même derrière
  soi, si la ligne de vue est libre. Le guide le précise. Les cônes restent
  des indications de direction/portée, sans découpage selon les obstacles.
- Le bandeau distingue un collègue qui voit encore le joueur d’un collègue
  qui surveille sa dernière position. Flèches nommées pour les menaces hors champ.
- Chaque départ propose un briefing : simulation et chronos attendent le premier
  déplacement. La caméra reste libre. Cela s’applique aussi aux reprises et au
  speedrun ; les records précédents sont conservés.
- Guide jouable facultatif au premier étage : déplacer, accroupir, masquer le
  regard, utiliser un poste. `Pause → Passer la prise en main` le masque.
- Vitesse, marche animée, bruit et dépense d’endurance reposent maintenant sur
  le déplacement **après collision**. Pousser contre un meuble ne fait plus courir
  sur place. Le test d’endurance utilise un parcours libre, sans buter en bord de carte.

### Bureau vivant

`office.js` rattache les interactions au mobilier existant, sans déplacer ses
collisions ni ajouter de lumières :

- Photocopieuse près du badge : une utilisation par étage, 6 secondes de diversion
  dans un rayon de 12 m. Les collègues tournent vers elle sans abandonner leur
  itinéraire. Un collègue déjà en observation ou le boss en chasse l’ignore.
- Première version des postes (remplacée par le §14) : 8 secondes chacun, consommées
  seulement pendant l’utilisation. Assise et frappe animées, interruption par `E`,
  déplacement, accroupissement ou emote. La méfiance visuelle est multipliée par
  0,18 uniquement chez les collègues à plus de 2,8 m et sous le seuil d’observation.
  Le boss reste sensible ; le HUD ne promet pas d’invisibilité.
- Réactions aux emotes selon le rôle : directeur, sécurité, chef d’équipe,
  collègues. Une emote silencieuse derrière un mur ne crée plus de soupçon sonore.
- Dernières 0,65 seconde de sortie : salut et déplacement visuel vers l’issue.
  Un repérage dans la même image reste prioritaire sur la réussite.

### Son et emotes

Plus de banque mp3 chargée, de sting, bip, alarme de chasse ou mélodie d’échec
lors du repérage. Aucune sonorisation de roue ou d’emote. Les retours sonores de
ramassage, sorties et réussite restent présents. Pas des collègues, claviers et
sources du bureau utilisent un panorama stéréo relatif à la caméra et une
atténuation avec la distance. Les nœuds ponctuels sont déconnectés après lecture.

Huit emotes silencieuses : Démission, Disco, La prime !, Encore un mail,
Réunion KO, Agent secret, Erreur 404 et Take the L. Bras, buste, tête, jambes et
bassin participent, avec un saut réel de 42 cm pour la prime. Les axes sont
réinitialisés chaque image pour éviter les poses résiduelles. Le mouvement
interrompt l’emote avec fondu. Les personnages restent les modèles procéduraux
existants, en attendant la création artistique de leurs remplaçants.

Roue : maintenir `T`, souris ou touches physiques `1–8`, relâcher pour jouer.
Centre neutre et `Échap` annulent ; ouvrir puis relâcher sans sélectionner ne
lance rien. Les textes secondaires sont masqués pendant son ouverture.

### Vérification

- `npm run test:gameplay` : vraies collisions, vue masquée/de côté/hors angle,
  témoin supplémentaire, effets du travail, limites de la diversion, postes
  accessibles sur les six étages, panorama sonore, huit animations distinctes,
  saut, retour au repos et interruption.
- `test:confort`, `test:personnages`, `test:environnement`, `test:transitions` :
  passent. Collisions et budgets de géométrie du décor inchangés.
- Windows réel, profil de sauvegarde isolé : 21 étapes gameplay, zéro échec,
  zéro erreur JavaScript. Captures de la roue, du travail et des huit emotes.
- Niveaux 5 et 6 : 30 secondes de briefing sans détection ni chrono consommé,
  puis 8 secondes après un premier mouvement sans repérage dans ces essais.
  Ce contrôle ne prétend pas rendre le joueur immobile indéfiniment à l’abri.
- Une campagne complète : 9 étapes, zéro échec ; toutes les sorties et transitions
  fonctionnent. Fin du parcours : 104 textures / 247 géométries ; contexte GPU intact.
- Speedrun des six étages, commandes numériques, guide facultatif, erreur injectée
  puis reprise et annulation de transition : 7 étapes, zéro échec. Seule l’erreur
  `TEST_CHARGEMENT_INJECTE` est volontaire ; aucune erreur JavaScript non gérée.

Rapports et protocole : `tests/gameplay/`. Avertissement ANGLE déjà connu,
conservé dans les rapports ; aucune promesse de fréquence d’images basée sur
ces courts essais. Les poses sont également échantillonnées en mouvement : une
capture isolée ne sert pas de test d’animation.


## 14. Travailler protège réellement — 24 septembre 2026

Le simple ralentissement de détection rendait les postes peu utiles : pas de
bonus à moins de 2,8 m, face au boss ou après le seuil d’observation. Il est remplacé
par une **protection de 12 secondes cumulées par poste et par tentative**.

- Tant que Lao D travaille au poste avec du crédit, aucun PNJ ne peut le repérer,
  y compris le boss en chasse, à courte distance ou déjà méfiant. Les cônes,
  points d’exclamation, contour du joueur et menaces hors champ ne signalent
  plus de danger pendant cette protection. La mini-carte suit le même état.
- Les soupçons diminuent à leur vitesse habituelle pendant le travail : ils ne
  sont pas remis à zéro en appuyant sur `E`. Une assise éclair ne permet donc
  pas d’effacer instantanément une observation avant de repartir.
- Se lever puis se rasseoir conserve seulement le temps restant. Chaque poste
  a son propre crédit ; un nouvel essai réinitialise les deux postes. La pause
  arrête le crédit comme le reste de la simulation.
- Jauge verte et badge « Au travail · Protégé », puis ambre dans les 3 dernières
  secondes, avec avertissement textuel. Aucun son d’alerte ajouté.
- À expiration : Lao D se relève, la détection reprend dans le même pas de
  simulation et le poste est épuisé pour cette tentative. Déplacement, `E`,
  accroupissement ou emote interrompent aussi la protection.

`src/travail.js` centralise durée, validation du poste et consommation. La
consommation passe avant la perception des PNJ ; les indicateurs utilisent la
même validité que la protection. Voir aussi `npc.js`, `main.js`, `ui.js`,
`office.js` et `minimap.js`.

Validation : `test:gameplay` (collègues/boss, près/loin, mémoire des soupçons,
crédit cumulé, expiration et interruptions) et `test:confort`. Scénario Windows
ciblé `--selftest --gameplay --travail` : observateurs réellement en ligne de vue
à moins de 2 m, dont le boss, puis pause, sortie/reprise du siège, avertissement,
expiration, poste épuisé et nouvel essai : **8 étapes, zéro échec, aucune erreur
JavaScript non gérée**. Rapports et captures :
`tests/gameplay/validation/travail.json` et `tests/gameplay/captures/travail-*.jpg`.


## 15. Personnage de référence repris de la tête aux pieds — 24 septembre 2026

Lao D reste un personnage procédural, avec le même squelette de 16 os et les mêmes
points de contrôle d’animation. Cette passe reconstruit les surfaces, pas seulement
leurs matériaux. Les collègues héritent de cette base ; quelques carrures varient,
avec un directeur plus large, sans modifier la hauteur des yeux.

### Construction et aspect

- **Faces extérieures corrigées** : les tubes montants avaient leurs triangles
  tournés vers l’intérieur, tandis que les tubes descendants avaient leurs bouchons
  inversés. C’était la cause des surfaces manquantes au torse et au cou. Les rubans
  orientent maintenant leurs faces selon leur normale attendue.
- **Emmanchures cousues** : des ouvertures dans le torse sont reliées aux anneaux
  des manches par une surface courbe pondérée entre buste et épaule. Les manches
  ne sont plus simplement des tubes qui se chevauchent avec la poitrine.
- Veste : revers à cran, col rabaissé, poches, manches ajustées, basque fermée et
  petits plis géométriques aux coudes. Pantalon : sections moins rondes, pli de
  repassage et cassure sur le soulier. Les textures de tissu sont moins contrastées.
- Une chemise spécifique sous veste conserve plastron, col et manchettes, en
  retirant les manches masquées qui traversaient le vêtement pendant les flexions.
  Les détails cachés, dont la boucle de ceinture, ne ressortent plus à travers la veste.
- Yeux en amande, paupières par cible de morphing, sourcils et bouche courbes,
  lunettes rectangulaires ajustées au nez et aux tempes. La couleur des accessoires
  de peau ne dépend plus d’un attribut de sommets absent sur les doigts.
- Coupe de cheveux continue, profil asymétrique et sillons sculptés ; cou affiné.
  Pas de mèches constituées de rubans détachés. Les variantes à chignon sont conservées.
- Doigts plus longs et moins recroquevillés ; souliers profilés avec cou-de-pied,
  semelle fermée, lacets, cuir moins brillant et dessous placé au niveau du sol.
- Sac arrondi, poignée et coutures, sangles ajustées à la pente des épaules.
  Cordon du badge posé sur la chemise à l’intérieur du V, sur la veste ailleurs.

### Pose et ressources

L’accroupissement descend maintenant les hanches selon la projection des jambes,
avec compensation des chevilles. Auparavant seul le buste descendait et les pieds
restaient suspendus. Les hauteurs de perception suivent cette nouvelle pose. Les
respirations ont moins d’amplitude, et le contour copie aussi le morphing des yeux.

Le rig est retourné par `makeCharacter()` sans être rangé dans `group.userData`.
La copie du contour sérialisait auparavant ces références de meshes en JSON,
avec leurs géométries et matériaux, produisant un volume inutile de données et
les avertissements de sérialisation des textures. Les clones n’en ont pas besoin.

Coût mesuré de Lao D complet : **41 appels de dessin, 5 surfaces skinnées,
31 018 triangles**, contre 44 appels et environ 29 000 triangles avant cette passe.
Les géométries communes restent dans le cache partagé ; les ressources propres aux
personnages sont libérées lors des transitions. Ce budget ne constitue pas une
promesse de fréquence d’images sur toutes les machines.

### Validation et limites

`test:personnages` inclut désormais `refonte.mjs` : faces extérieures vues par un
rayon, paupières ouvertes/fermées, couches de vêtements, semelles au sol à cinq
positions d’accroupissement, hauteur du regard et budgets. `test:confort`,
`test:gameplay` et `test:transitions` passent également.

Atelier Windows reproductible : `--selftest --gameplay --personnage`, profil isolé,
éclairage identique pour les vues avant/après. Images et rapports sous
`tests/personnages/refonte/`. Il contrôle face, profil, dos, accroupissement, assise,
bras levé, marche, clignement et variantes. La validation en situation utilise
aussi le parcours Windows gameplay, dont les huit emotes et les transitions.

La sculpture du visage, la variété des coiffures et des morphologies restent
limitées par cette construction paramétrique. Les mains n’ont pas de rig individuel
pour chaque doigt, et il n’y a pas de simulation de tissu. Un modèle sculpté dans
Blender permettra une identité artistique plus personnelle ; l’import GLB reste
un chantier distinct, décrit dans `docs/CREER_DES_PERSONNAGES.md`.

## 16. Architecture, mobilier et repères d’objectifs — 24 septembre 2026

Cette passe porte sur le bâtiment et les éléments du bureau. La base des
personnages de la section 15 est conservée.

### Volumes et construction

`src/architecture.js` construit une cage d’escalier complète : trémie découpée
réellement dans les deux sols, deux volées de dix marches, palier intermédiaire,
paillasses, garde-corps, nez antidérapants, noyau béton et signalétique de service.
Le panneau noir et le plancher qui masquaient les anciennes marches ont disparu.
Une porte coupe-feu vitrée s’ouvre pendant le départ, se referme si le joueur
s’éloigne et revient à sa position initiale au nouvel essai.

Les deux obstacles `kind: architecture` de cette porte protègent le vide derrière
le point d’interaction existant. Les autres emprises, départs et sorties conservent
leur empreinte historique. L’escalier reste une sortie avec une courte animation
puis une transition d’étage ; il n’introduit pas une descente libre sur plusieurs
étages. L’ascenseur révèle désormais une cabine avec sol, parois, plafond,
main courante et seuil, à travers une vraie ouverture de la façade.

Le bureau reçoit des poteaux, des poutres, un plafond suspendu dans le couloir,
des îlots acoustiques avec attaches et des luminaires suspendus. Les encadrements
respectent la largeur réelle des ouvertures. Les habillages muraux s’arrêtent
au droit de la nouvelle cage d’escalier.

### Mobilier

- Sièges : dossiers courbes, soutien lombaire, mécanisme sous l’assise, vérin,
  branches radiales corrigées et roulettes doubles reliées au piètement.
- Postes : façades de tiroirs, joints et poignées du bon côté, roulettes de
  caisson, passe-câbles et patins. Tasses mieux posées avec une surface de café.
- Direction : espace pour les jambes, caissons latéraux, voile de fond et écran
  orienté vers son utilisateur. Réunion : plateau à coins arrondis et trappe de câbles.
- Photocopieuse : scanner, sortie papier en creux, bacs et panneau de commande.
  Fontaine : bonbonne visible, eau translucide, robinets et bac. Café : niche de
  distribution, bec, grille et affichage dédié. Le rangement reçoit portes et poignées.

### Lisibilité du gameplay

Le rectangle noir des postes libres venait des passes de profondeur/normales :
`recenserOverlays()` excluait les sprites des PNJ, mais oubliait ceux du décor.
Les étiquettes des postes et les surfaces transparentes sans écriture de
profondeur en sont maintenant exclues, puis restaurées pour le rendu principal.
Tous les sprites d’interface ont également `depthWrite: false`. Une étiquette
plus courte précise « Abri · 12 s max ». Elle disparaît lorsque le crédit est épuisé.

Les objets à récupérer partagent une couleur dorée : anneau autour de l’objet,
petite balise, nom et distance à l’écran, direction en bord de champ et losange
numéroté sur la mini-carte. La mini-carte dessine ces objectifs après les cônes et
les personnages. Les numéros restent stables après le premier ramassage.
`src/reperes.js` gère les projections, y compris derrière la caméra. Les repères
s’effacent au ramassage, pendant la roue et hors partie, et sont recréés au
nouvel essai. Le portable est posé à hauteur de sa table de réunion ; le badge
repose sur la photocopieuse, au lieu de flotter devant elle. Les lieux restent
ceux des objectifs des niveaux 2, 4 et 6.

Les lumières des objectifs restent dans leur pool permanent, avec une intensité
réduite et une position légèrement surélevée pour éviter un reflet brûlé sur la
table. Aucun changement du nombre de lumières lors du ramassage ou des transitions.

### Coût et contrôles

Les petites pièces et touches de clavier ont des chanfreins moins subdivisés.
La fusion normalise aussi les géométries indexées/non indexées pour partager les
lots d’un même matériau. Décor seul : **91 à 99 lots**, **220 376 triangles au
premier étage** et **252 034 au dernier**, contre 365 650 et 430 356 avant cette
passe, soit environ 40 % de triangles en moins malgré les nouveaux volumes.
Le budget reste de 100 lots, avec un plafond de 260 000 triangles ajouté au test.
Ces chiffres ne constituent pas une garantie de fréquence d’images.

`test:environnement` contrôle les six plans, un rayon dans la trémie, l’accès à
la sortie et la libération des portes. Il couvre aussi les projections à trois
résolutions, la profondeur des sprites et l’ordre de dessin sur la mini-carte.
`test:transitions`, `test:gameplay` et `test:confort` passent également.
Le protocole Windows et les captures comparatives sont décrits dans
`tests/environnement/README.md`, avec les artefacts dans `refonte/`.

Validation Windows du paquet final : **18 étapes de revue du décor**, **21 étapes
de gameplay**, **10 étapes couvrant les six transitions de campagne**. Le test
des repères comprend **15 étapes** avec captures des postes et objets.
Aucune erreur JavaScript ni perte du contexte graphique sur ces parcours.
Les avertissements ANGLE/D3D11 restent consignés dans les rapports.
La version installée dans `C:\Users\nicol\EscapeYourBoss` a été mise à jour ;
les sources, le paquet et les fichiers installés ont été comparés par SHA-256.
Les sauvegardes réelles ne sont pas utilisées par les scénarios de test.


## 17. Lao D dans Blender — A validé, proposition B à valider

Blender **5.2.2 LTS** est installé par l'utilisateur et a été exécuté réellement
sur Windows : `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.
Aucune installation supplémentaire à faire. Le raccourci transmis pointe vers
`blender-launcher.exe` dans ce même dossier.

Le contrat réel a été audité : 16 os, pivots, axes, unités, accessoires, morphing,
contour et ressources. Voir `docs/blender/CONTRAT_ET_JALONS.md` et
`tests/blender/audit/contrat.json`. Le joueur procédural courant coûte toujours
**41 appels, 5 surfaces skinnées, 31 018 triangles**.

### Jalon A réellement exécuté

`tools/blender/creer_test.py` a créé une éprouvette originale, enregistré
`art/lao-d/jalon-a-01/test.blend`, exporté le GLB et rendu une image Cycles CPU.
`src/personnage-glb.js` utilise le GLTFLoader officiel r169 vendorisé et le pont
Electron existant, sans accès disque arbitraire ni ressource réseau. L'adaptateur
transporte les matrices de liaison du squelette canonique vers les os Blender.

Le harnais Windows `--selftest --blender` vérifie le GLB réel : UV, poids, échelle,
orientation, repos, coude 45°/90°, placement monde, 121 images animées et trois
imports/libérations GPU stables. Le test négatif d'absence du GLB retourne une
erreur explicite et le code 1, sans personnage de secours. Rapports et captures
sous `tests/blender/`, avertissements de shaders ANGLE conservés.

### Première proposition artistique B

Première proposition historique : **`art/lao-d/proposition-v01/lao-d-v01.blend`**.
Pour la correction courante du sac, utiliser la version v03 décrite ci-dessous.
Le même dossier contient l'export, le rendu Blender, le contrat et une copie des
scripts ayant créé cette version. `art/lao-d/brouillon-b02/` est un premier
brouillon conservé, pas la proposition actuelle. Ne pas écraser une version que
l'utilisateur pourrait retoucher.

La proposition comporte veste avec emmanchures raccordées, pantalon continu,
visage à relief intégré, coiffure, lunettes, mains, chaussures et sac plus étroit.
Budget mesuré : **11 appels, 11 surfaces skinnées, 27 096 triangles**, 11 matériaux
PBR sans texture. Les matériaux sont regroupés par surface. Aucun gain de FPS
n'est encore revendiqué. Export runtime : `assets/lao-d-v01.glb`.

Les captures comparatives face/profil/dos/trois-quarts et distance de jeu sont
produites dans un atelier Electron, à éclairage/cadrage identiques. Les premières
poses accroupie, assise et marche sont des contrôles visuels exploratoires,
pas une validation complète des animations.

**Attendre l'avis artistique avant C.** Restent à finaliser : expressions et
clignements, doigts indépendants, huit emotes complètes, contour, réglage fin des
poids/cols/sangles en poses extrêmes, secours en production, essais et changements
d'étage avec le GLB, comparaison de performances sur plusieurs passages.

Le joueur normal et les PNJ conservent le modèle procédural ; règles, décor,
éclairage normal, sauvegardes et sons inchangés. Les suites personnages, confort,
gameplay et transitions repassent (`tests/blender/audit/apres/`). Le paquet Windows
est produit dans `dist/EscapeYourBoss-win32-x64` avec les ateliers isolés ; la
version installée habituelle n'est pas remplacée pour une proposition non validée.

Guide court : `docs/blender/GUIDE_LAO_D.md`. La régénération exige un dossier neuf.
`exporter_lao_d.py` exporte des retouches sans régénérer ni sauvegarder le `.blend`
et refuse d'écraser un GLB existant. Cet export a été exécuté depuis la source.

Validation du paquet Windows construit : **8 étapes du jalon A** et **7 étapes
atelier B**, avec 16 captures JPEG avant/après et poses exploratoires. Aucun échec
d'étape ni erreur JavaScript ; avertissements de shaders du pilote conservés.
Artefacts : `tests/blender/jalon-a-paquet/`, `tests/blender/jalon-b/` et empreintes
`tests/blender/audit/paquet-sha256.json`. L'export depuis le `.blend` livré reproduit
le GLB octet par octet. Les sources et scripts de la proposition sont figés avec
leurs empreintes dans `art/lao-d/proposition-v01/manifest.json`.


### Correction du sac après retour utilisateur

L'utilisateur juge la direction satisfaisante et demande de corriger le sac qui
traverse les épaules. Version courante à ouvrir :
**`art/lao-d/proposition-v03/lao-d-v03.blend`**, export `assets/lao-d-v03.glb`.
Les versions précédentes restent conservées ; v02 est un essai intermédiaire.

Les bretelles suivent désormais la surface réelle de la veste et évitent les
revers. Le trajet est continu au-dessus de l'épaule, avec des poids interpolés
depuis le vêtement. Les attaches basses passent le long du buste sous les bras,
puis rejoignent le sac. Aucun changement du reste de la silhouette ni du gameplay.
Le contrôle avant export échantillonne les sommets et milieux de faces :
952 échantillons par épaule, marge radiale minimale d'environ **6,2 mm**.

Coût courant : **29 248 triangles, 11 appels**, contre 27 096 triangles pour v01.
La hausse de 2 152 triangles vient des rubans continus et reste sous les 31 018
du personnage procédural. Le GLB v03 est chargé par l'atelier `--blender --visuel`.
Les dix autres lots géométriques sont inchangés (arrondi UV inférieur à 2e-7 sur
la chemise). Les résultats ciblés sont sous `tests/blender/sac-corrige/`.

Validation du correctif : deux parcours Windows de 7 étapes et 26 captures chacun,
sans erreur d'étape ni erreur JavaScript. Gros plans contrôlés au repos, dans deux
instants de marche, accroupi et au poste. `npm run test:blender` passe ; paquet
Windows reconstruit, fichiers runtime comparés par SHA-256 à la copie testée.
Voir `tests/blender/sac-corrige/README.md`. Cette passe répond au défaut du sac ;
elle n'effectue pas encore l'intégration complète C.

## 18. Trois collègues Blender — propositions v01

Après la correction du sac, l'utilisateur autorise la création d'autres
personnages. Trois rôles existants sont modélisés dans Blender 5.2.2 LTS :
**Directeur Wang**, **Zhang Jie**, **Lao Liu**. Les palettes reprennent leurs
identités actuelles, avec modifications de carrure, visage, coiffure et tenue.
Wang porte un costume ample avec pochette ; Zhang un ensemble prune cintré avec
chignon ; Liu un uniforme zippé avec insigne, poches et radio.

Sources courantes : `art/collegues/proposition-v01/{directeur,zhang,liu}/`.
Chaque dossier contient `.blend`, `.glb`, rendu et rapport Blender. Scripts et
contrat figés à la racine de la proposition, avec manifeste SHA-256. Le premier
essai est conservé dans `art/collegues/brouillon-01/`. Toujours créer une nouvelle
version pour ne pas écraser les retouches de l'utilisateur.

Le générateur commun accepte `--profil directeur|zhang|liu` et le nom correspondant
`--nom directeur-v01|zhang-v01|liu-v01`. `variantes_bureau.py` définit les différences
de géométrie et de vêtements. Les 16 os et les pivots métier restent inchangés.
Les manches des nouvelles variantes sont pondérées d'après leur topologie : un
premier contrôle visuel assis révélait une membrane sous les bras, corrigée avant
livraison. Ce réglage est limité aux nouveaux profils ; les anciennes sources de
Lao D et son GLB v03 sont conservés.

Exports runtime : `assets/directeur-v01.glb`, `assets/zhang-v01.glb`,
`assets/liu-v01.glb`. Coûts : respectivement **27 196 / 26 780 / 26 376 triangles**,
**13 / 11 / 11 appels par passe**, sans texture. Pas de gain FPS revendiqué.

Nouvel atelier isolé `electron/blender-collegues-test.cjs`, activé uniquement par
`--selftest --blender --collegues`. Il charge les trois GLB et Lao D v03 comme
référence ; vues corps, visage, profil, dos, poses assise et marche. Vérification
réelle du paquet Windows : **4 étapes et 20 captures JPEG**, aucun échec ni erreur
JavaScript. Pour chaque nouveau personnage, 121 poses de marche échantillonnées,
retour au repos, dimensions plausibles, sommets finis et contrôle ciblé des poids
du bas des manches. Avertissements de shaders conservés dans le rapport.
`npm run test:blender` et `npm run build:win` réussissent. Empreintes runtime du
projet, du paquet et de la copie exécutée identiques.

Artefacts : `tests/blender/collegues-v01/`. Guide :
`docs/blender/GUIDE_COLLEGUES.md`. Le paquet courant inclut les nouveaux ateliers ;
la version Windows installée habituelle n'est pas remplacée.

**Ce sont des propositions artistiques, pas une migration des PNJ.** Le joueur
et les collègues en partie normale restent procéduraux. Expressions, clignements,
doigts, contour, poses extrêmes et intégration complète restent à finaliser après
avis sur ces propositions. Aucune règle, collision, sauvegarde ou son modifié.

## 19. Animations du joueur et roue réduite à quatre emotes

Demande utilisateur : réduire le nombre d'emotes et privilégier la qualité des
animations du personnage principal. Changements actifs dans la partie normale,
sur le joueur procédural actuellement utilisé. Les sources Blender livrées
précédemment ne sont ni régénérées ni remplacées.

La roue propose désormais **Démission, Encore un mail, Réunion KO, Take the L**
(indices 0–3 ; identifiants `tchao`, `arrogance`, `moulin`, `takeL`). Disco, La
prime, Agent secret et Erreur 404 sont retirées. Souris et touches 1–4, centre et
Échap pour annuler. Les anciens chiffres ne déclenchent plus une autre emote.
Les harnais utilisent le nombre courant de définitions ; Take the L est à
l'index 3. Roue et emotes restent silencieuses, réactions visuelles conservées.

`src/emotes.js` remplace les oscillations répétitives par des poses clés en
secondes : anticipation, accent, temps de lecture et récupération. Interpolation
quintique, mouvements du corps et des poignets, doigts du L, regard, paupières et
bouche coordonnés. Les micro-mouvements de tête sont atténués pendant le geste.
Durées : 3,6 / 3,8 / 4,4 / 4,2 s. Le L alterne quatre pas ; le facepalm pose la
main devant le front ; Réunion KO enchaîne affaissement, sursaut et regard autour.

`src/player.js` amortit les changements d'allure et mélange les bras/mains/tête
à l'entrée comme à la sortie d'un poste. Le regard oisif ne concurrence plus les
emotes. La respiration suit le temps d'animation, y compris après une pause.
Marcher ou s'accroupir fige l'emote et réduit son poids en **180 ms**, tandis que
les déplacements répondent immédiatement. Les clés finales reviennent au repos.

L'appui vertical utilise les vrais points des semelles, mis en cache à la
construction. Le bassin est ajusté pendant la marche, la course, l'accroupissement
et les emotes pour supprimer l'enfoncement des chaussures. La position de
collision ne bouge pas. Ce n'est pas une IK complète ni un verrouillage
horizontal des pieds. Le cache concerne les chaussures du joueur procédural ;
il faudra le reconstruire à partir du futur modèle si le maillage est remplacé.

Validation : `test:animations`, `test:gameplay`, `test:confort`, `test:personnages`
et `test:transitions` réussissent. Nouveau test : fins des quatre scènes,
72 interruptions marche/accroupissement à 30/60/144 Hz, appui des vraies semelles,
retour du poste, reset et index invalides. Aucun maillage ajouté au personnage.

Atelier Windows `--selftest --personnage --animations` : **12 étapes réussies,
17 captures JPEG, cinq vidéos WebM**, sans erreur d'étape ni erreur JavaScript.
Le parcours `--selftest --gameplay` du paquet final réussit **17 étapes** : silence,
travail, diversion, menaces, départs avancés, quatre emotes, sortie et transition.
Avertissements de shaders ANGLE conservés. Pas de mesure FPS en partie complète.

Artefacts : `tests/animations/` ; galerie à ouvrir :
**`tests/animations/apercu.html`**. Rapports sous `captures/` et `gameplay/`, logs
sous `validation/`. Paquet reconstruit dans `dist/EscapeYourBoss-win32-x64` ;
empreintes runtime identiques entre projet, paquet et copie Windows exécutée.
La copie installée habituelle n'est pas remplacée par ces tests.

**Limite Blender explicite** : l'atelier transmet les 16 os aux poses de Lao D
v03 pour comparaison. Ses doigts et expressions ne sont pas encore pilotés ;
les poids en poses extrêmes et l'intégration complète du GLB restent à terminer.
Les nouvelles animations sont jouables dès maintenant sur le personnage actuel.

## 20. Décor Blender en partie normale et copie Windows 1.1.0

L’utilisateur voyait encore huit emotes : le paquet précédent avait été testé
sur une copie temporaire, mais `C:\Users\nicol\EscapeYourBoss` contenait toujours
les anciens fichiers. La passe précédente n’avait pas créé de décor Blender.
Cette livraison traite les deux points et ajoute **Version 1.1.0** au menu.

Quatre modèles sont maintenant réellement générés dans Blender 5.2.2 LTS,
exportés en GLB et chargés avant la construction du jeu :

| Ressource dans `assets/` | Géométrie | Triangles / lots |
| --- | --- | --- |
| `bureau-v01.glb` | Plateau biseauté, structure acier, caisson à trois tiroirs, poignées et passe-câbles | 2 704 / 6 |
| `chaise-v01.glb` | Assise creusée, dossier courbe, support lombaire, accoudoirs, vérin, roulettes | 3 068 / 4 |
| `escalier-v01.glb` | Deux volées continues, palier, pierre, nez antidérapants, garde-corps et mains courantes | 12 012 / 5 |
| `porte-escalier-v01.glb` | Porte vitrée sur charnière, barre anti-panique, paumelles, pare-chocs et ferme-porte | 1 212 / 3 |

Sources `.blend`, rendus de studio, exports, rapports et générateur figé :
**`art/decor/meridien-v01/`**. Le générateur courant est
`tools/blender/creer_decor.py` ; il exige un dossier de sortie neuf. Les sources
artistiques précédentes sont conservées. Les quatre fichiers de cette passe
contiennent leurs pièces séparées et un studio exclu de l’export.

`src/decor-blender.js` importe les GLB sans ressource externe, valide leurs
attributs, fusionne par matériau et partage les géométries statiques. Les noms
`DECOR_…` sont associés aux matériaux PBR existants. La porte reçoit ses propres
copies de géométrie, libérées avec le niveau. Son pivot et son animation restent
compatibles. Les objets fixes participent à la fusion habituelle du décor.

Le préchargement est strict : une ressource absente bloque le démarrage avec
une erreur explicite. Les constructeurs procéduraux conservés servent aux tests
historiques sans préchargement ; le démarrage normal attend les quatre GLB.
Les tests Blender chargent expressément les exports avant de construire les niveaux.

**Périmètre visuel :** les bureaux de travail et les fauteuils sont remplacés,
ainsi que les volées, le palier, les garde-corps et la porte d’escalier. Le bureau
de direction, la table de réunion, les murs, plafonds, luminaires et accessoires
restent procéduraux. Ce n’est pas une reconstruction Blender de tout le bâtiment.
L’escalier conserve son rôle de sortie animée, sans étage supplémentaire jouable.
Les personnages restent dans l’état décrit aux §17–19.

Les quatre animations du §19 sont maintenant livrées dans la copie Windows
habituelle : Démission, Encore un mail, Réunion KO et Take the L. Leurs poses clés,
interruptions et sons ne changent pas pendant cette passe. `jeuAssets.version()`
affiche la version du paquet dans le menu pour repérer un ancien exécutable.

Validation : `test:decor-blender`, `test:environnement`, `test:animations` et
`test:gameplay` réussissent. Les six décors conservent leurs emprises et sorties,
avec **91–99 lots** et **229 120–259 330 triangles** (budgets 100 / 260 000).
La libération d’un niveau ne détruit pas les ressources du suivant. Le parcours
Windows du décor réussit 19 étapes sur les six étages ; les captures ont été
inspectées, notamment le poste et les deux volées d’escalier. Les mesures de cette
revue avec simulation figée ne prouvent pas une amélioration du FPS en partie.

Le paquet a été reconstruit dans `dist/EscapeYourBoss-win32-x64`, puis **la copie
`C:\Users\nicol\EscapeYourBoss` a été remplacée** après vérification qu’elle était
fermée. Les 156 fichiers copiés ont été vérifiés. L’ancienne installation complète
est conservée dans
`C:\Users\nicol\AppData\Local\Temp\EscapeBlenderWork\installation-avant-1.1.0`.
Les sauvegardes de progression n’ont pas été modifiées.

Le parcours `--selftest --gameplay` exécuté depuis **la copie installée** réussit
17 étapes, dont quatre emotes, silence des alertes, travail, diversion et sortie
avec transition. Aucune erreur JavaScript ni échec d’étape ; avertissements ANGLE
conservés. Le parcours décor de la copie installée réussit également 13 étapes : version
1.1.0, quatre emotes et quatre ressources Blender présentes dans la scène. Le
journal natif de ce dernier processus contient un message GPU à sa fermeture
(`GPU state invalid after WaitForGetOffsetInRange`), conservé avec les logs ;
code de sortie 0, captures produites et aucune erreur de page.
Les tests utilisent toujours un profil temporaire isolé.

Comparaison visuelle : `tests/environnement/blender-v01/apercu.html`.
Rapports et captures : `captures/` (revue des six niveaux), `installation-gameplay/`
et `installation-decor/` (copie installée), sous `tests/environnement/blender-v01/`.
La roue installée à quatre choix est visible dans `installation-gameplay/02-roue.jpg`.
Pour lancer cette version : **`C:\Users\nicol\EscapeYourBoss\EscapeYourBoss.exe`**.
L’ancien dossier `PartirALHeure` n’est pas mis à jour ; son exécutable reste ancien.

## 21. Passage réunion / escalier dégagé — 1.1.1

Au niveau 6, la porte de la salle de réunion était libre pour les collisions,
mais recouverte par le mur décoratif est de la cage d’escalier. Le niveau 5
partage le même plan C et présentait aussi ce défaut.

`buildLevel` transmet maintenant l’intervalle de la porte de la salle sud à
`construireEscalier`. La paroi en béton, son soubassement vert et sa baguette
sont découpés sur cet intervalle entre le sol et 3 m de hauteur. Le noyau sous
le plancher, le linteau et les autres pans de mur restent présents. Les plans A
et B ne sont pas modifiés ; les collisions, objets et sorties sont conservés.

Régression vérifiée dans `tests/environnement/verifier.mjs` : rayons dans les
deux sens à plusieurs hauteurs, traversée physique du passage et maintien des
murs hors ouverture. Le contrôle échoue sur l’ancien mur et réussit après le
correctif. `test:decor-blender` passe sur les six niveaux, avec les vraies
ressources : 99 lots et 259 354 triangles au dernier étage, ressources libérées
correctement pendant les transitions.

Revue ciblée : `--selftest --decor --passage`, déplacement du joueur dans les
deux sens au niveau 6 et captures depuis la salle et le palier. Artefacts :
`tests/environnement/passage-1.1.1/`. La version attendue par le test décor suit
celle du paquet au lieu d’être figée à 1.1.0.

La revue Windows réussit ses cinq étapes, sans erreur JavaScript : le joueur
traverse réellement le passage dans les deux sens, et les deux captures montrent
l’ouverture dégagée. Le paquet 1.1.1 est reconstruit dans `dist/`.
Les fichiers applicatifs de `C:\Users\nicol\EscapeYourBoss` sont mis à jour pour
le prochain lancement, sans fermer la partie en cours. Les fichiers précédents
sont sauvegardés sous `EscapeBlenderWork/installation-avant-1.1.1/` dans le dossier
temporaire Windows. Les sauvegardes de progression ne sont pas touchées.

## 22. Diagnostic des textures et matières Blender — 1.2.0

Diagnostic des 51 matières (décor et personnages), des atlas graphiques, des
écrans, étiquettes, ciel et façades. Le rapport complet est dans
`tests/textures/DIAGNOSTIC.md` ; inventaires mesurés et captures avant/après dans
`tests/textures/`. Les priorités étaient le tissu trop strié, le bois répétitif,
les agrégats carrés de la pierre et les métaux excessivement brillants.

Sept graphes de matériaux ont été créés et cuits dans Blender 5.2.2 LTS : bois,
textile, moquette, pierre, béton, métal et cuir. Sources éditables, cartes maîtres,
générateur et rapport : `art/matieres/meridien-v01/`. Le premier essai est archivé
séparément dans `art/matieres/essai-v01/`. Les sources de personnages et meubles
livrées auparavant ne sont pas écrasées.

`src/textures-blender.js` charge strictement les PNG avant `Game`, sans repli
silencieux. Les couleurs sont en sRGB, les normales et rugosités linéaires ;
ImageBitmap est retourné au décodage. Les variantes de bois et les trois tissus
partagent les cartes. Les souliers et la ceinture utilisent le nouveau cuir.
Les plastiques ont moins de vernis ; les tissus du mobilier ont un reflet diffus.
La rugosité du bois et des métaux n’est plus abaissée par une seconde multiplication.

`src/uv.js` projette les UV des boîtes en mètres ; les sols et plafonds reçoivent
aussi des UV métriques. Les boîtes de `level.js`, `architecture.js` et
`environment.js` sont concernées. Les atlas, sprites et textes gardent leurs UV.
Les modèles Blender utilisaient déjà des UV métriques. La géométrie, les emprises,
le passage du niveau 6 et les budgets de triangles ne changent pas.

19 cartes effectivement chargées : bois 1024², autres matières 512². Environ
37,3 Mio de mémoire RGBA8 avec mipmaps pour ces cartes, sans prétendre mesurer la
VRAM totale. Copies runtime optimisées en 8 bits : 2,65 Mo contre 20,38 Mo de PNG
maîtres. `tools/blender/preparer_textures.mjs` fait cette conversion sans modifier
les dimensions ; les originaux restent disponibles. Les 51 matières utilisent
47 textures uniques après partage, contre 52 avant. Pas de gain FPS revendiqué.

`test:textures` vérifie les PNG, les normales, les espaces couleur, la rugosité,
les raccords et les ressources partagées, puis construit les six niveaux avec les
cartes et GLB réels et teste les transitions. `test:personnages` passe également.
La revue Windows `--selftest --decor --textures --textures-final` capture les
matières à cadrages constants et enchaîne les étages 4, 6 et 1.

La revue finale des matières réussit 6 étapes sous Windows, dont le chargement
explicite des sept familles / 19 cartes et les transitions. La copie habituelle
`C:\Users\nicol\EscapeYourBoss` est mise à jour en **1.2.0** (exécutable compris),
après sauvegarde des fichiers remplacés dans
`C:\Users\nicol\AppData\Local\Temp\EscapeBlenderWork\installation-avant-1.2.0`.
Le gameplay exécuté depuis cette copie réussit ses 17 étapes, dont le travail,
les quatre emotes silencieuses, la sortie et la transition. Aucune erreur de page
ni d’étape ; avertissements de shaders conservés dans les rapports. Le profil de
test est isolé de la sauvegarde utilisateur. Les sources runtime du projet, du
paquet et de l’installation sont comparées par SHA-256.

Galerie : `tests/textures/apercu.html`. Rapport : `tests/textures/DIAGNOSTIC.md`.
Source Blender : `art/matieres/meridien-v01/matieres-meridien-v01.blend`.


## 23. Humour de bureau dans les six niveaux — 25 septembre 2026, 1.3.0

Demande : ajouter des touches d’humour à tous les niveaux, toujours avec Blender.
Six scènes spécifiques ont été ajoutées au jeu normal, avec six nouveaux modèles
réellement créés et exportés dans Blender 5.2.2 LTS :

| Niveau | Accessoire et emplacement | Texte principal |
|---|---|---|
| 1 | Tasse trophée en cravate, sur la machine à café | « Employé du mois » : le café, seul collègue qui motive encore l’équipe. |
| 2 | Papier en accordéon sortant de la photocopieuse | « Objectif zéro papier » : merci d’imprimer ce rappel. |
| 3 | Cône chef de chantier, lunettes et cravate, derrière la barrière fermée | Fin des travaux après la prochaine réunion. |
| 4 | Sablier en verre et écriteau sur la table de réunion | « Réunion express » : on termine l’introduction. |
| 5 | Tour de dossiers et échelle sur les casiers près de la sortie de l’open space | « Petite tâche rapide » : à traiter dès hier. |
| 6 | Tampon géant et formulaires sur la table de réunion | « Départ à l’heure » : demande à déposer hier. |

### Sources et intégration

- Sources éditables : `art/humour/meridien-v01/*.blend`, exports `.glb`, rendus
  de studio et `manifest.json`. Générateur : `tools/blender/creer_humour.py`,
  qui refuse d’écraser un dossier de sortie existant.
- `src/humour.js` contient les textes, positions et cadrages de revue.
- `src/decor-blender.js` charge désormais **10 modèles** avant le démarrage :
  les quatre meubles précédents et les six accessoires. Les ressources restent
  partagées entre les niveaux et fusionnées avec le décor statique.
- `src/environment.js` place les accessoires et panneaux. Les écriteaux de table
  ont un dos et des pieds ; les affiches remplacent les panneaux concernés plutôt
  que de s’y superposer. L’atlas passe de 2048 × 1280 à 2048 × 1536, soit environ
  **2,7 Mio supplémentaires estimés** en RGBA8 avec mipmaps.
- Deux matériaux unis supplémentaires : plastique orange du cône et papier
  recyclé. Les textures Blender de la version 1.2.0 restent utilisées.

Les objets restent du décor : ils ne sont ni ramassables, ni une nouvelle
condition de sortie. Le badge et le portable restent visibles et accessibles.
Les interactions, objectifs, rondes, collisions et timers sont conservés, ainsi
que le passage entre réunion et escalier du plan C. Aucun son ajouté.
Le sablier est statique : ce n’est pas une représentation du chrono de mission.

### Revue et validation

La revue visuelle dans Electron a servi à corriger des feuilles initialement
confondues avec la photocopieuse, des classeurs espacés comme s’ils flottaient,
une affiche surexposée au café et un écriteau trop grand devant le sablier.

- `npm run test:humour` : six accessoires distincts effectivement chargés,
  emprises, séparation des objets de mission, collisions historiques, budgets,
  passage latéral et libération des ressources pendant les transitions.
- `npm run test:decor-blender` : dix GLB, matériaux autorisés, géométries et cache.
- `npm run test:textures` : cartes PBR, partage, budgets et transitions.
- `npm run test:gameplay` : progression, emotes et protection aux postes libres.
- Revue Windows dédiée : `--selftest --decor --humour`.

[Galerie des six niveaux](tests/humour/apercu.html) ·
[Sources et retouches Blender](art/humour/meridien-v01/README.md).

Livraison vérifiée : l’installation habituelle
`C:\Users\nicol\EscapeYourBoss\EscapeYourBoss.exe` est en **1.3.0**.
Les 17 étapes du parcours Windows `--selftest --gameplay` passent depuis cette
installation, sans erreur JavaScript ni échec. Rapports dans
`tests/humour/captures/` et `tests/humour/installation-gameplay/`.
Les **116 fichiers** de l’application sont identiques entre source, paquet et
installation (SHA-256). Sauvegarde des fichiers remplacés dans
`%TEMP%\EscapeBlenderWork\installation-avant-1.3.0`.

Budgets mesurés par étage : 91 / 95 / 94 / 96 / 92 / 99 lots ;
229 547 / 229 516 / 252 599 / 252 240 / 259 420 / 259 708 triangles.
Les six GLB ajoutés pèsent 214 732 octets au total. Ces mesures ne sont pas
une promesse de gain de FPS.

## 24. Têtes et mains Blender intégrées — 25 septembre 2026, 1.4.0

Demande : améliorer encore le design des personnages, surtout les têtes et les
mains, en travaillant dans Blender. Cette passe est **visible en partie normale** :
le joueur et tous les PNJ des six niveaux utilisent désormais les nouvelles pièces.

### Modèles livrés

Cinq sources réalisées et exportées dans **Blender 5.2.2 LTS**, dans
`art/personnages/anatomie-v01/` : `tete-employe-v01.blend`,
`tete-direction-v01.blend`, `tete-chignon-v01.blend`,
`tete-securite-v01.blend` et `mains-v01.blend`. Les GLB correspondants sont dans
`assets/`. Aucun asset tiers ajouté. Les anciens personnages complets de Lao D
et des collègues restent conservés dans leurs dossiers de proposition.

- Visages : maillage continu avec mâchoire, menton, pommettes et nez ; lèvres,
  oreilles avec conque/hélix, yeux en amande, paupières mobiles, sourcils,
  montures ajustées et coiffures avec mèches en relief.
- Quatre variantes : employé, direction, chignon et sécurité. Le rôle du PNJ
  choisit sa tête ; ses teintes de peau, cheveux et vêtements restent personnalisées.
- Mains : paumes et poignets, pouces séparés, doigts continus avec phalanges,
  pulpe et ongles. Clés `Poing`, `Index` et `Ouvert`, raccordées aux quatre emotes
  existantes et à la frappe au clavier du joueur. Les pouces gardent leurs pivots.
- Pose de repos du joueur légèrement écartée pour dégager les mains de la veste.

**Périmètre exact :** intégration modulaire. Le corps habillé, les chaussures,
le sac et le rig restent ceux du jeu. Il ne s’agit pas d’une bascule vers les
anciens GLB complets ni d’une refonte musculaire/faciale complète. Les PNJ ont
les nouvelles mains au repos ; leurs routines gardent leur animation existante.

### Intégration et pièges corrigés

`src/anatomie-blender.js` précharge cinq GLB avant la création de `Game`, valide
les contrôles/matériaux, fusionne les pièces par pivot et partage les géométries.
Les influences des morphs restent propres à chaque personnage ; le contour suit
les mêmes gestes et clignements. Un chargement incomplet échoue explicitement,
sans publier un cache partiel. `makeCharacter({anatomie:false})` sert uniquement
à la comparaison et aux tests historiques sans préchargement.

Le passage en non-indexé et la fusion de la version embarquée de Three perdaient
`morphTargetsRelative` : le chargeur le conserve explicitement. Sans cela les
paupières et doigts se contractaient vers le pivot. Les clés Blender sont remises
à zéro à l’export. L’export force aussi `Pigment` dans `COLOR_0` ; le réglage par
défaut ajoutait un canal blanc et reléguait les teintes dans `COLOR_1`, ignoré en jeu.
Les montures suivent la surface du nez et ne passent plus sous sa peau.

Coût de Lao D complet avec sac/lunettes/badge : **39 lots, 36 358 triangles**,
contre 41 lots / 31 018 triangles pour l’ancien modèle. Le plafond de contrôle
reste 44 lots / 38 000 triangles. Aucun gain de FPS annoncé. Les géométries sont
partagées entre instances ; aucun chargement réseau n’est nécessaire.

### Retouche et validation

- [Guide des sources](art/personnages/anatomie-v01/README.md).
- `tools/blender/creer_anatomie.py` reconstruit la proposition dans un dossier neuf.
- `tools/blender/exporter_anatomie.py` exporte une source retouchée sans la recréer,
  en retirant l’écartement de présentation des mains et en conservant les morphs.
  Réexport réel vérifié : sommets et transformations des mains identiques.
- `npm run test:anatomie` : chargement atomique, quatre variantes, pigments,
  occlusion des pupilles, morphs indépendants, ressources partagées, budgets,
  72 interruptions d’emotes, appuis, gameplay et transitions avec les vrais GLB.
- `--selftest --personnage --anatomie` : vérification de tous les personnages dans
  les six niveaux, portraits avant/après, quatre vidéos d’emotes, travail et accroupi.
- [Galerie dans le moteur](tests/anatomie/apercu.html).

Livraison finale : l’installation habituelle
`C:\Users\nicol\EscapeYourBoss\EscapeYourBoss.exe` est en **1.4.0**.
La revue anatomique passe **9 étapes**, dont les six niveaux ; le parcours de
gameplay passe **17 étapes** depuis cette installation. Aucune erreur d’étape,
de page ou de console ; avertissements de compilation de shaders conservés.
Les captures et quatre vidéos se trouvent dans `tests/anatomie/captures/`, le
parcours de gameplay dans `tests/anatomie/installation-gameplay/`.
Les **123 fichiers de l’application** sont identiques entre source, paquet et
installation (SHA-256). Les fichiers remplacés de la version précédente sont
sauvegardés dans `%TEMP%\EscapeBlenderWork\installation-avant-1.4.0`.
Une seconde sauvegarde `installation-avant-finition-anatomie` conserve l’état
intermédiaire avant correction du raccord poignet/manche. La version finale
prolonge la peau sous la manchette ; cette continuité a été revue en gros plan.

## 25. Emotes 67 et Passinho do Jamal — 25 septembre 2026, 1.5.0

Demande : rechercher les références sur Internet, puis créer **dans Blender** le
geste 67 et la danse associée à « Ela Ké Leitada », et les ajouter à la roue.
L’utilisateur a confirmé la variante **Passinho do Jamal** pendant le travail.

La roue possède **six choix** : les quatre scènes historiques, puis **5 — 67**
et **6 — Passinho do Jamal**. Sélection souris, touches `1–6` et pavé numérique ;
maintenir `T` puis relâcher. Le centre et Échap annulent. Les deux ajouts restent
silencieux, conformément au choix antérieur pour les emotes.

### Animation créée dans Blender

Sources : `art/emotes/tendances-v01/67-v01.blend` et
`art/emotes/tendances-v01/passinho-jamal-v01.blend`, réalisées avec Blender
**5.2.2 LTS**. Elles contiennent le joueur courant comme maquette, des contrôleurs
`CTRL_*`, de vraies Actions/courbes Bézier, les morphs des mains et paupières,
et un sol de contrôle. Les vêtements suivent le rig à seize os par contraintes.
Les appuis verticaux sont cuits dans Blender ; la correction de contact habituelle
du jeu reste active pendant les mélanges et interruptions.

- **67, 4,8 s** : paumes ouvertes vers le haut, mains alternant en hauteur,
  accompagnement discret du buste et du regard, récupération.
- **Passinho do Jamal, 6,4 s** : deux phrases de petits pas latéraux, accents
  simples/triples, bassin en contre-mouvement, bras relâchés, retour au repos.
  Adaptation originale au rig, pas une capture de mouvement.

`tools/blender/preparer_atelier_emotes.mjs` prépare la maquette du joueur.
`creer_emotes_tendances.py` construit et anime les scènes **dans Blender**.
`exporter_emotes.py` lit un `.blend` retouché sans reconstruire sa chorégraphie,
puis exporte ses courbes évaluées à 60 Hz en JSON et module JS de données.
Les deux réexports après réouverture des sources sauvegardées sont identiques
aux premiers exports : `tests/tendances/reexport-verifie.json`.

Le runtime `src/emotes-blender.js` valide et interpole ces données ; il ne
contient pas de poses chorégraphiées. `src/emotes.js` ajoute les deux définitions
et leurs réactions textuelles. `src/anatomie-blender.js` lit leurs poses de doigts
exportées et suit le poids du fondu, y compris pendant une interruption.
Aucun nouveau maillage ni son téléchargé dans le runtime. Les références vidéo
ont servi uniquement à l’étude et ne sont pas distribuées dans les assets.

### Références et validation

[Contexte et références consultées](art/emotes/tendances-v01/REFERENCES.md) ·
[Sources Blender et guide d’édition](art/emotes/tendances-v01/README.md) ·
[Galerie des deux gestes](tests/tendances/apercu.html).

`npm run test:tendances` vérifie la provenance des exports, l’orientation réelle
des paumes, l’alternance verticale, les doigts ouverts, les déplacements latéraux
des pieds, les appuis, le contour, le gameplay et **108 interruptions** des six
emotes à 30/60/144 Hz. `test:anatomie` passe également. Le contrôle de distinction
des emotes inclut désormais les coudes et poignets ; leur absence dans l’ancienne
signature masquait précisément le geste caractéristique du 67.

Revue Windows dédiée : `--selftest --personnage --tendances`. Elle contrôle les
six secteurs souris, les touches 1–6, le pavé numérique, le septième choix absent,
la séparation des cases, les deux sources Blender et la remise au repos des doigts.
Elle capture les poses et enregistre deux vidéos du joueur réel.

### Ela Ké Leitada : danse v02 calée sur la musique

Demande suivante : jouer l’extrait fourni `Ela_ke_Leitada_drop_emote.mp3`
pendant la danse. Copié en `assets/emote-passinho-jamal-son-v01.mp3` (11,29 s,
192 kb/s, 48 kHz). L’emote s’appelle désormais **Ela Ké Leitada** dans la roue
(identifiant interne inchangé : `passinho-jamal`), icône 🕺 — le drapeau 🇧🇷
s’affichait « BR » sous Windows, qui ne rend pas les drapeaux emoji.

Pourquoi une v02 : l’extrait dure presque le double de la danse v01 (6,4 s) et
couper la musique aurait raté l’intérêt du drop. Tempo mesuré dans Blender
(`aud`, enveloppe + autocorrélation) : **170 BPM, temps 0,3526 s, premier temps
à 0,692 s**, écart ≤ 10 ms. Le motif v01 faisait 8 temps de 0,32 s ; il tombe
exactement sur deux mesures une fois porté à 0,3526 s. La v02 (11,8 s) le joue
3,5 fois puis tient une pose finale bras ouverts sur le dernier accent.
Source : `art/emotes/tendances-v02/passinho-jamal-v02.blend`, **mp3 embarqué dans
le séquenceur** avec marqueurs de mesure, pour retoucher en écoutant. Réexport
depuis le fichier sauvegardé identique. La v01 reste archivée dans `tendances-v01`.

Pipeline : `creer_emotes_tendances.py --seulement --version --son` ;
`exporter_emotes.py` lit `emote_version` (v01 par défaut, donc réexports v01
inchangés) et exporte le champ `son` du clip. `emotes-blender.js` valide ce champ.

Runtime : `GameAudio.suivreMusique` est appelé en tête de `frame()` avec l’emote
en cours si l’état est `play` et qu’elle n’est pas coupée, sinon `null`. Départ à
la position de l’emote, recalage si l’écart dépasse 0,12 s, fondu 180 ms à
l’interruption, coupure en pause/chargement, reprise au bon endroit. Le mp3 est
préchargé dans `demarrerNiveau`. Les emotes restent **sans effet de bruit sur les
PNJ** : la musique n’est entendue que par le joueur.

Validation : `test:tendances` vérifie en plus la présence et la durée du mp3,
qu’il est couvert par la danse, et `suivreMusique` sur un faux AudioContext
(départ, pas de relance si calé, recalage, fondu, fin, 67 muet). Selftest Windows
`musique-leitada` : mp3 décodé par Chromium dans l’exe, musique active pendant la
danse, coupée à l’interruption, 67 muet. Toutes les suites npm passent.
Captures et vidéos : `tests/tendances/captures/` (la galerie rejoue le mp3 sur la
vidéo muette).

### Ela Ké Leitada v03 : les gestes de la vraie trend

Retour utilisateur sur la v02 : « je ne la reconnais limite pas ». Cause : ni Codex ni
moi n'avions vu la danse. La trend reconnue n'est pas un jeu de pieds (Passinho) mais
une **chorégraphie de mains** en selfie : main sur la bouche, pouce qui pointe,
balancement, montre, doigts sous le menton.

Chaîne adoptée, à réutiliser pour toute future emote « d'après une vidéo » :
1. l'utilisateur fournit une vraie vidéo et la passe dans **Rokoko Vision** (Rokoko
   Create), puis exporte un FBX depuis l'application Rokoko Studio (FBX gratuit) ;
2. Blender (`aud`) analyse la bande-son de la vidéo : ici 80 BPM, drop à 6,10 s,
   extrait mp3 à 85 BPM → `emote = (vidéo − 6,10) × 0,942` ;
3. la capture donne le **timing** et les amplitudes du buste ; les poses sont
   **reconstruites par IK** sur le rig de Lao D pour garantir les contacts
   (`tools/blender/leitada_blender.py`, écart moyen 1,4 mm).
Transférer le squelette Rokoko tel quel a été écarté : vidéo selfie à deux personnes,
jambes invisibles ; les contacts main-bouche et main-montre auraient été ratés.

Nouvel identifiant `ela-ke-leitada` (source `art/emotes/tendances-v03/`, runtime
`assets/emote-ela-ke-leitada-v03.js`, son `assets/emote-ela-ke-leitada-son-v01.mp3`).
La Passinho v02 est archivée dans `tendances-v02` et n'est plus chargée.
Détail des gestes et du calage : `art/emotes/tendances-v03/README.md`.

Correctifs d'outillage trouvés en route : `cle()` garde les quaternions dans le même
hémisphère (sinon tour complet du poignet) ; torsion du poignet bornée à ±1,15 rad
(blocage de cardan des Euler XYZ du jeu) ; l'exporteur déroule les angles au-delà
de ±π (réexport 67 v01 toujours identique). Le morph *Poing* des mains GLB n'est
qu'une légère flexion : un vrai poing demande `doigts` x ≈ 1,4.

`test:tendances` mesure désormais dans le jeu la paume sur la bouche (< 7,5 cm), le
pouce devant la poitrine, la main droite sur la montre (< 9 cm), le menton et les
appuis sur toute la danse. Toutes les suites passent ; selftest Windows OK.

## 26. Mains v02 — 25 septembre 2026

Retour utilisateur : « les mains, j'ai l'impression qu'elles sont à l'envers ».
Confirmé par mesure dans le jeu : la main « gauche » était montée sur le bras droit,
et inversement. Paumes vers l'avant, les pouces pointaient vers le ventre.
Toutes les emotes affichaient donc le pouce du mauvais côté.

Refaites dans Blender (`hands_v2`, `art/personnages/anatomie-v02/README.md`) : bon
côté pour chaque main, paume sculptée, phalanges, bouts arrondis, vrai poing, et une
nouvelle pose **Pouce** (poing, pouce levé). Le pouce porte désormais ses morphs :
`parts._mainsBlender` inclut les pièces `pouce*`. Le côté se lit par `/(doigts|pouce)L:/`.

Pose de repos naturelle via `POIGNET_REPOS` (paumes vers les cuisses) et frappe
paumes en bas via `POIGNET_CLAVIER`, pour le joueur et les collègues. Chez les
collègues, la rotation est amortie selon l'occupation.

Emotes Blender régénérées en **v04** (`art/emotes/tendances-v04/`) : 67 et Ela Ké
Leitada, avec le nouveau repos. Le « pouce qui pointe » d'Ela Ké Leitada utilise la
vraie pose Pouce et non plus l'astuce doigts ×1,4 + roulis 120°. Les clips v04 ont
72 canaux (`mainL_Pouce`, `mainR_Pouce`). Les anciens clips n'en ont pas, le runtime
prend 0. Le réexport v01 reste identique : l'exporteur n'ajoute ces canaux que s'ils
existent dans le .blend.

Tests : l'anatomie attend 4 morphs et un vrai repli (la main raccourcit de plus de
4 cm en poing). Toutes les suites passent ; selftests Windows anatomie, animations
et tendances revus en image (repos, frappe, 67, Take the L, Démission, Encore un
mail, Ela Ké Leitada).

## 27. Directeur en traque : itinéraire qui contourne les murs — 25 septembre 2026

Retour utilisateur (capture à l'étage 12) : après « Réunion terminée ! », le directeur
Wang restait collé à un mur. Cause : `bossBehaviour` le faisait marcher en **ligne
droite** vers la position de Lao D, et `collide` le repoussait contre le premier
obstacle. Aucun calcul d'itinéraire.

`src/navigation.js` : grille de passage à 25 cm construite une fois par étage
(`level.nav`, paresseuse). Les obstacles sont gonflés à 0,42 m (rayon PNJ 0,36 +
marge). A* 8 directions sans couper les coins, puis lissage en ligne droite. Le
directeur repère toujours Lao D toutes les 1,2 s, mais suit désormais ce chemin. Il
recalcule tout de suite s'il avance de moins de 25 cm en 0,8 s. Sans chemin
possible, il tente la ligne droite. Les rondes et routes café, écrites à la main,
ne changent pas.

`tests/gameplay/navigation.mjs` (dans `test:gameplay`) : 42 trajets du bureau du
directeur vers le départ du joueur et vers des cellules libres réparties dans les
6 étages. Tous arrivent à moins de 1,2 m, jamais 3 s sans avancer (pire trajet
19,2 s). Avec l'ancien comportement, le test échoue dès le premier trajet de
l'étage 1, bloqué en (4,5 ; 4,7), la situation de la capture.

## 28. Cou accroupi et têtes v02 (base CC0 Blender Studio) — 25 septembre 2026

**Cou.** Accroupi, la tête sortait du torse. `teteBase` est au niveau des yeux ; la
contre-rotation de la tête (−c·0,55) autour de ce point projetait le menton et le
cou devant le col. `pivoterCou` (`characters.js`, appelé par `animerVisage` pour
le joueur et les PNJ) fait tourner la tête autour de la base du crâne (`COU` = 9 cm
sous `teteBase`). `Player.eyeY` intègre ce déplacement : les yeux accroupis sont
1,7 cm plus haut, toujours sous un bureau de 1,10 m. Test : la jonction du cou
reste fixe dans le repère du buste. Selftest : `accroupi-profil` / `accroupi-cou`.

**Têtes v02.** Peau, nez, oreilles et yeux issus du *Human Base Meshes Bundle* CC0
de Blender Studio. Tout le reste est reposé par lancer de rayon. Voir
`art/personnages/anatomie-v02/SOURCES.md`. Emotes régénérées en **v05** sur la
nouvelle tête (l'IK repose la main sur la nouvelle bouche). Les v01 (têtes, mains,
emotes) restent dans `art/`. Les GLB v01 ont été retirés de `assets/`.

## 29. Multijoueur en réseau local (coopération à deux) — 26 septembre 2026, 1.6.0

Demande : jouer à deux sur des appareils différents, en local, avec son propre
serveur. Guide joueur : `docs/MULTIJOUEUR.md`.

**Architecture.** Le serveur est **dans le jeu**, sans aucun installable séparé.
`electron/reseau.cjs` (Node pur : net + dgram) : l'hôte écoute en TCP 47800 (un
message JSON par ligne, un seul invité, même version exigée) et émet une balise
UDP 47801 par seconde. Une balise venue de la machine elle-même est proposée en
127.0.0.1. Une session par fenêtre (`main.cjs`, IPC), pont `jeuReseau` dans
`preload.cjs`. **Hôte autoritaire** : il simule collègues, directeur, chrono et
défaite. L'invité affiche les collègues en marionnettes (`Multijoueur.appliquerMonde`,
15 Hz, positions lissées, signaux sursaut/haussement recalculés, répliques relayées
par `dire`). Chacun envoie sa posture à 20 Hz ; le coéquipier est un `Player` en
veste bordeaux piloté par ces états (`animerCoequipier`), avec étiquette et flèche
orange sur la minicarte.

**Règles.** Collègues : perception de tous les `game.joueurs`, réaction au plus
exposé, traque du plus proche (solo strictement inchangé). Objets communs. Un repéré
= défaite commune. Victoire quand les deux sont sortis. Pause synchronisée. L'hôte
choisit l'étage et la suite. Photocopieuse et ascenseur de l'invité exécutés chez
l'hôte ; ses emotes font réagir les collègues de l'hôte. Démarrage commun : l'hôte
attend le `pret` de l'invité (étiqueté par l'étage), l'invité attend le premier
état du monde.

**Bug trouvé par l'autotest.** Une déconnexion pendant le chargement d'étage
renvoyait l'hôte au menu, puis le chargement relançait l'étage. `demarrerNiveau`
porte désormais un jeton annulé par `retourMenuMulti`.

**Tests.** `npm run test:multijoueur` (découverte, 51 messages, 3ᵉ joueur refusé,
versions, déconnexion). `--selftest --multi` : deux fenêtres du même exe, côte à
côte (une fenêtre masquée tombe à ≈ 10 i/s). Parcours : héberger, découvrir,
connexion, lancement, suivi du coéquipier (écart < 1 cm), collègues synchronisés
(< 0,2 m), objet partagé, perception de l'invité par les collègues de l'hôte,
défaite commune, relance, victoire à deux, déconnexion. 5 passages sur 5 verts.

**Partage.** `npm run paquet:win` → `dist/EscapeYourBoss-win64.zip` (≈ 125 Mo), le
seul fichier à envoyer. `.gitignore` ajouté (node_modules, dist, zips). Le mp3
d'origine resté à la racine est exclu des builds.

## 30. Sorties rééquilibrées : stores et passe de sécurité — 26 septembre 2026

Retour utilisateur : l'escalier était trop simple, l'ascenseur sans intérêt dans
les premiers niveaux.

**Diagnostic chiffré.** Un simulateur (vrais PNJ, vraie perception, joueur qui
suit le plus court chemin après une attente variable, 30 essais) mesurait la zone
de sortie depuis les portes de l'open space. Ascenseur : 0 à 3 % de réussite à
tous les étages. Le directeur le voit à travers sa façade vitrée (12,6 m, plein
cône) et sa pause café s'arrête à 2,7 m de l'ascenseur : aucune fenêtre, jamais.
Escalier au niveau 1 : 80 à 90 %, à 8 m de la porte sud, sans aucun témoin.
L'escalier dominait donc strictement : plus proche, 1,3 s au lieu de 3,4 s, sans
« ding ».

**Principes retenus** (jeux d'infiltration) : aucune sortie ne doit dominer ; la
sortie principale est sur le chemin naturel mais exposée ; la sortie discrète se
mérite par un objet posé dans une zone à risque (Hitman, Deus Ex) ; toute sortie
surveillée offre une fenêtre lisible, dictée par une routine (Metal Gear).

**Changements.**
- `niveau.stores` (étages 1, 2, 3 et 5) : lamelles sur la façade du directeur
  côté hall. Obstacle `kind: 'stores'`, `noClip`, qui ne coupe que le regard ; la
  paroi sur le couloir reste vitrée. Assis, il ne voit plus l'ascenseur : la
  fenêtre, c'est tant qu'il travaille ; le danger, sa pause café.
- Porte coupe-feu verrouillée après 18 h : l'escalier exige le passe de la
  sécurité, objet facultatif `ouvre: 'stairs'` (◇ dans les objectifs, repère
  « facultatif, ouvre l'escalier »). `objetsRestants(sortie)` n'exige un objet
  `ouvre` que pour sa sortie ; badge et portable restent obligatoires partout.
  Emplacements : casiers du fond (1, à l'opposé de l'escalier), salle de réunion
  sur la ronde du vigile (2), machine à café en plein hall (4), bureau du
  directeur, accessible pendant sa pause café, quand le hall ne l'est plus (5),
  armoire de reprographie (6, où l'escalier est la voie rapide).
- Étage 6 : 62 → 66 s pour garder la marge malgré le détour du passe.

**Après.** Ascenseur du niveau 1 depuis la porte sud : 3 % → 63-80 % (échecs =
pause café). Étages 2, 3 et 5 : de 0-3 % à 10-20 %, Lao Liu restant l'obstacle
à contourner. Étages 4 et 6 (stores levés) : zone de sortie inchangée, le coût de
l'escalier est le passe. Collisions, départs et sorties identiques hors stores :
la référence `tests/environnement/collisions-avant.json` est régénérée pour les
étages 1, 2, 3 et 5 seulement.

**Budgets.** Les objets ramassables échappent à la fusion : halo et balise tiennent
désormais en un maillage, le passe en un autre (≈ 90 triangles). L'étage 6 reste à
99 lots. Lamelles en `BoxGeometry` : l'étage 5 est à 259 972 triangles avec les
modèles Blender, **28 sous le budget de 260 000** — plus aucune marge. Les lampes
d'objectif étant dimensionnées sur l'étage le plus chargé, il y en a désormais
trois (sans ombre, éteintes quand elles ne servent pas) au lieu de deux.

**Multijoueur.** L'étiquette du coéquipier n'était pas recensée dans
`recenserOverlays` : dessinée dans les passes de profondeur/normales du GTAO, elle
devenait un rectangle noir (même cause que les « POSTE LIBRE » autrefois). Son
contour et ses sprites sont maintenant masqués pendant ces passes.

**Tests.** Toutes les suites Node sont vertes. Les autotests Electron (`--selftest`,
`--gameplay`, `--gameplay --reperes`) ramassent désormais le passe avant l'escalier
et vérifient que la porte refuse de s'ouvrir sans lui. Ils n'ont pas pu être
rejoués : l'exe lancé depuis WSL n'obtient pas de contexte WebGL. À relancer sous
Windows après `npm run build:win`.

## 31. Jouer en ligne via playit.gg — 26 septembre 2026, 1.7.0

Demande : jouer avec un ami sur un autre réseau, au moindre coût. Choix : un tunnel
playit.gg (*playit Premium*, 3 $/mois pour le TCP générique) plutôt qu'une redirection
de port (IPv4 parfois partagée, port exposé) ou un serveur loué (le jeu de l'hôte
simule les PNJ : un serveur ne servirait que de relais).

Le seul frein côté jeu : *Rejoindre* visait toujours le port 47800, alors qu'un tunnel
publie un autre port. `lireAdresse` (`electron/reseau.cjs`) accepte `hôte`,
`hôte:port`, `[IPv6]:port` et une IPv6 nue, ignore un `tcp://` collé, et refuse une
saisie invalide **avant** de fermer la session en cours. Côté hôte, rien ne change :
l'agent playit.gg relaie vers `127.0.0.1:47800`, sans passer par le pare-feu.

Version 1.7.0 : le contrôle de version est le seul garde-fou contre un ami resté
sur un ancien zip. Or les stores et le passe (section 30) changent les objets
partagés : un invité en 1.6.0 face à un hôte à jour se désynchroniserait.

Tests : `npm run test:multijoueur` couvre les formats d'adresse et une vraie
connexion par `127.0.0.1:<port>` depuis une session réglée sur le port par défaut.
Guide joueur : `docs/MULTIJOUEUR.md`, section « Jouer en ligne ».

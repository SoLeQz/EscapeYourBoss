# Lao D dans Blender : contrat et jalons

Ce document décrit les jalons historiques du **personnage complet**.
Depuis la version **1.4.0**, une intégration modulaire distincte est livrée :
les têtes et mains Blender remplacent l’anatomie procédurale en jeu normal,
pour le joueur et les PNJ. [Sources et contrat des modules](../../art/personnages/anatomie-v01/README.md).
Le corps habillé et le rig historiques restent utilisés. Les GLB complets
`lao-d-v03` et collègues restent des propositions d’atelier.

## Audit de l'état réel

Reproduction de l'audit :

```sh
node --import ./tests/personnages/resolveur.mjs tools/blender/auditer-contrat.mjs
```

Résultat : `tests/blender/audit/contrat.json`, calculé depuis le code courant,
sans copier la géométrie du personnage. Three.js **r169**, **41 appels**, **5
surfaces skinnées**, **31 018 triangles**, **26 matériaux** pour Lao D complet.
Hauteur géométrique : 1,79 m ; semelles au sol. Le contrat public de
`makeCharacter()` est `{ group, parts }`. Les références de rig restent hors
`userData`, car le clonage du contour sérialise celui-ci.

| Os | Parent | Position locale en mètres | Pilotage |
|---|---|---|---|
| racine | groupe | 0 / 0,85 / 0 | bassin, saut |
| buste | racine | 0 / 0 / 0 | upper, torso, respiration |
| teteBase | buste | 0 / 0,78 / 0 | head, regard global |
| tete | teteBase | 0 / 0 / 0 | teteMicro, expressions |
| epauleL/R | buste | ∓0,215 / 0,53 / 0 | armL/R |
| coudeL/R | epauleL/R | 0 / −0,27 / 0 | elbowL/R |
| mainL/R | coudeL/R | 0 / −0,27 / 0 | mainL/R |
| hancheL/R | racine | ∓0,105 / 0 / 0 | legL/R |
| genouL/R | hancheL/R | 0 / −0,43 / 0 | kneeL/R |
| chevilleL/R | genouL/R | 0 / −0,38 / 0 | footL/R |

Toutes les rotations de repos sont l'identité, ordre Euler `XYZ`, échelle 1.
Le monde Three est en mètres, +Y vers le haut et +Z vers l'avant du personnage.
Les jambes/bras descendent dans leur pose de liaison ; la légère pose A du jeu
est une animation, pas une rotation de repos. X pilote principalement la flexion,
Y la rotation du corps et Z l'écartement/roulis. Blender utilise +Z vers le haut ;
la conversion géométrique choisie est `(x,y,z) -> (x,-z,y)`.

Autres points requis : `doigtsL/R` et `pouceL/R`, groupes indépendants sous
`mainL/R` (nécessaires au L) ; `regard` animé en position ; `paupiere` et
`clignement.morphTargetInfluences[0]` ; `bouche` animée en échelle Y. Sac et
sangles suivent le buste, souliers les chevilles. Les positions exactes et
parents de ces points sont dans le JSON d'audit.

Les animations réinitialisent les rotations, appliquent locomotion, accroupissement,
travail, emote puis micro-expression. Le bassin descend physiquement à
l'accroupissement. `HEIGHT.eye=1.63`, `chest=1.30`, `hip=.85` et `seatOffset=-.37`
ne doivent pas être modifiés pour compenser un asset.

Le contour est un clone BackSide : sa hiérarchie et ses morphs sont synchronisés
par `Player.syncOutline()`. Un modèle importé devra avoir un clone dont les
squelettes et les liens restent corrects ; le simple renommage des os ne suffit pas.

## Ressources et chargement

Le pont `jeuAssets.lire(nom)` appelle `asset:lire` dans le main Electron. Celui-ci
n'accepte qu'un nom de fichier simple sous `assets/`, puis renvoie un ArrayBuffer.
Aucune ouverture de chemin arbitraire n'est nécessaire. Le chargeur officiel
[GLTFLoader r169](https://github.com/mrdoob/three.js/blob/r169/examples/jsm/loaders/GLTFLoader.js)
a été ajouté au vendor avec sa provenance et son SHA-256.

`src/personnage-glb.js` est un module expérimental, non branché sur le joueur.
Il refuse les ressources externes, les lumières/caméras embarquées, les codecs
nécessitant un décodeur et les clips. Il transporte les transformations du
squelette canonique vers l'armature importée avec ses matrices de liaison.
Chaque import possède actuellement ses ressources ; aucun cache global de
personnages n'est remplacé. `libererArbre` dispose les ressources propres et
préserve celles explicitement déclarées partagées via `partager()`.

Le secours procédural contrôlé et la synchronisation des expressions/contours
appartiennent à l'intégration C. Le jalon technique doit charger strictement le
GLB attendu et échouer explicitement si son import échoue.

## État des jalons — 24 septembre 2026

- Blender **5.2.2 LTS**, Windows, commit `d13f752e3b9c`, exécuté réellement depuis
  `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`. Le raccourci fourni
  par l'utilisateur pointe vers `blender-launcher.exe` dans le même dossier.
  L'utilisateur a installé Blender lui-même ; aucun autre téléchargement effectué.
- **A validé** : création, sauvegarde `.blend`, export GLB et rendu Cycles CPU,
  puis chargement strict dans Electron/Three r169. Échelle, orientation, UV et
  poids vérifiés, coude à 45°/90°, placement monde et 121 images d'animation.
  Erreur maximale de l'oracle analytique : environ `3,3e-7 m` avec déplacement
  du groupe. Trois imports/libérations reviennent au même nombre de ressources
  GPU. Ce contrôle ne mesure pas la mémoire système.
- Test négatif Windows : GLB absent → erreur explicite et code de sortie 1,
  sans secours. Rapport sous `tests/blender/audit/absence-electron/`.
- **B : première proposition créée, validation artistique demandée.** Source
  `art/lao-d/proposition-v01/lao-d-v01.blend`, export `assets/lao-d-v01.glb`.
  Vêtements raccordés, visage à relief continu, coiffure asymétrique, lunettes,
  mains, chaussures et sac. UV et poids présents ; 11 matériaux PBR simples,
  aucune texture externe ni dépendance réseau.
- Budget B mesuré dans Electron : **11 appels, 11 surfaces skinnées,
  27 096 triangles**, contre **41 appels, 5 surfaces skinnées, 31 018 triangles**
  sur l'ancien modèle. Les surfaces skinnées augmentent car chaque matériau
  exporté constitue ici une surface. Aucun gain de FPS revendiqué.
- Personnages, confort, gameplay et transitions : quatre suites relancées et
  réussies après les changements, logs sous `tests/blender/audit/apres/`.
- Export depuis le `.blend` sauvegardé sans régénération : exécuté, rapport
  `tests/blender/audit/export-manuel.json`.
- **C non commencé** : attendre la validation artistique. Expressions, doigts
  indépendants pour Take the L, contour, secours en production, transitions
  complètes avec le nouveau joueur et mesures répétées de performance restent
  à traiter. Les captures des premières poses de B ne prouvent pas ces points.

Le joueur normal et les PNJ utilisent toujours leurs modèles procéduraux.
Les deux ateliers sont activés uniquement par `--selftest --blender`, avec
`--visuel` pour B. Les sources Blender et scripts sont exclus du paquet runtime.
Voir [le guide de reprise et d'export](GUIDE_LAO_D.md) pour les fichiers et commandes.

## Reproduire le jalon A

Le parcours a été exécuté ; les commandes ci-dessous permettent de le reproduire.

1. Reproduire l'audit ci-dessus. Utiliser son `contrat.json` et le script
   `tools/blender/creer_test.py` avec le véritable exécutable Blender :

   ```text
   blender.exe --background --factory-startup --python-exit-code 1 --python creer_test.py -- --contrat contrat.json --out nouveau-dossier
   ```

   Les chemins doivent être accessibles depuis Windows. Le dossier de sortie doit
   être inexistant. Le script conserve le `.blend`, le GLB, un rendu et un rapport
   avec la version Blender. La présence du seul GLB ne prouve pas que le rendu a réussi.

2. Copier uniquement l'export `lao-d-test.glb` dans `resources/app/assets/` d'une
   **copie de test** de l'exécutable, avec les versions courantes de `src/`,
   `electron/` et `vendor/`. Conserver les sources Blender sous `art/lao-d/`.

3. Lancer cette copie :

   ```text
   EscapeYourBoss.exe --selftest --blender --out=C:\chemin\rapport
   ```

   Le profil est temporaire et indépendant des sauvegardes réelles. Le harnais
   `electron/blender-test.cjs` charge exclusivement l'éprouvette attendue : pas de
   secours, pas de remplacement du joueur en partie normale. Il contrôle échelle,
   orientation, UV, poids, flexion à 45° et 90°, déplacement/rotation du groupe,
   121 images d'animation, retour au repos et trois imports/libérations GPU.
   Il produit des captures et un `rapport.json`. Un test manquant ou en erreur
   interdit de déclarer A validé ; un import raté renvoie le code de sortie 1.

4. Vérifier les captures, le rapport Blender, le rapport Electron et les erreurs
   console. Après A seulement, créer le premier Lao D pour la validation B.

Le contrôle de préparation sans Blender reste disponible :

```sh
node --import ./tests/personnages/resolveur.mjs tests/blender/preparation.mjs
```

Ce test JavaScript ne remplace ni l'export Blender ni l'animation dans Electron.


## Correctif du sac — version courante v03

Après un avis favorable sur la direction, correction demandée des bretelles qui
passaient dans les épaules. Source courante :
`art/lao-d/proposition-v03/lao-d-v03.blend` ; export `assets/lao-d-v03.glb`.
Le harnais visuel charge désormais v03. Projection sur la veste réelle, rubans
continus, poids interpolés, attaches inférieures le long du buste. Contrôle
Blender : 952 échantillons par épaule, marge minimale d'environ 6,2 mm au repos.
Coût : 29 248 triangles et toujours 11 appels. Anciennes versions conservées.
[Comparaison ciblée du sac](../../tests/blender/sac-corrige/README.md).

## Propositions des collègues

L'utilisateur a ensuite autorisé la création d'autres personnages. Trois
propositions sont disponibles : Directeur Wang, Zhang Jie et Lao Liu, sous
`art/collegues/proposition-v01/`. Elles conservent les os du contrat, avec de
nouvelles silhouettes, tenues et coiffures. Le nouvel atelier
`--selftest --blender --collegues` contrôle leur import strict et leurs premières
poses, sans les substituer aux PNJ de la partie normale.
[Sources, résultats et guide](GUIDE_COLLEGUES.md). L'intégration C reste distincte.

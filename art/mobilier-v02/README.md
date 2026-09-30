# Mobilier Blender v02 — le mobilier des étages, refait dans Blender

Jusqu'en 1.10.0, une bonne partie du mobilier était encore construite en code
(`src/level.js`) à coups de boîtes arrondies : postes de travail, bibliothèque du
directeur, photocopieuse, machine à café, fontaine, casiers, plantes, cartons, salon,
cloisons… Ce kit les remplace tous par des modèles Blender, plus détaillés et plus
légers.

- Source : [`mobilier-v02.blend`](mobilier-v02.blend) — script
  [`tools/blender/creer_mobilier.py`](../../tools/blender/creer_mobilier.py).
- Export : [`mobilier-v02.glb`](mobilier-v02.glb), copié tel quel dans `assets/`
  (`test:decor-blender` vérifie qu'ils sont identiques).
- Planche de relecture : [`planche-mobilier.png`](planche-mobilier.png) (silhouette de 1,75 m).
- [`rapport.json`](rapport.json) : objets, triangles et matériaux par modèle.

## Les 26 modèles

| Famille | Modèles | Détails |
|---|---|---|
| Poste de travail | `poste`, `poste-code`, `poste-sheet`, `poste-graph` | écran sur bras, post-it, clavier à touches, souris et tapis, tasse, verre d'eau, papiers, câbles ; variantes : cadre photo, thermos et figurine / classeurs et calculatrice / pot à crayons et feutres |
| Direction | `bureau-direction`, `bibliotheque-direction` | caissons à tiroirs, sous-main, lampe de banquier, téléphone, chevalet ; trois travées de livres, classeurs, globe, trophée, archives, plante |
| Réunion | `table-reunion`, `ecran-mural` | plateau arrondi, piètement, visio, tasses, blocs-notes, carafe ; téléviseur et barre de son |
| Services | `photocopieuse`, `machine-cafe`, `fontaine` | tiroirs, chargeur de documents, bras de commande ; meuble, bec, égouttoir, trémie à grains, gobelets ; bonbonne, robinets, distributeur de gobelets |
| Rangement | `casier`, `casier-b` | module de deux portes (ouïes, poignée, plaque, serrure), deux teintes |
| Plantes | `plante-ficus`, `plante-sansevieria` | pot en terre cuite ou béton, feuilles à deux faces |
| Détente | `canape`, `fauteuil`, `table-basse` | coussins, pieds en bois, plaid, coussins colorés |
| Divers | `cartons-pile`, `extincteur`, `horloge`, `tableau-blanc`, `luminaire`, `bouche`, `cloison`, `cloison-notes` | scotch, étiquettes ; flexible et manomètre ; cadran à 18:00 ; auget et feutres ; profilé de néon ; grille d'aération ; module de cloison feutrée (post-it et feuilles épinglées) |

## Règles de mise en place

- **Emprises inchangées.** Chaque modèle reprend exactement la place, la hauteur et
  l'obstacle de la version codée : collisions, couvertures, lignes de vue, rondes et
  équilibrage ne changent pas. `test:environnement` compare les empreintes des dix
  étages, et `test:decor-blender` les recompare avec le kit chargé. Ce dernier vérifie aussi
  que chaque meuble tient dans son obstacle à 5 cm près.
- **Écrans et affiches restent au jeu.** Les dalles d'écran (code, tableur, graphique,
  « COPIE / PRÊT », « CAFÉ / PRÊT »), le planning du tableau blanc, la photo de marque et
  le carnet sont des images de l'atlas, posées aux mêmes coordonnées sur les modèles.
- **Canards et objets posés.** Les 30 canards et les objets à ramasser reposent sur leur
  meuble au demi-centimètre près (contrôle « Posés » de `test:decor-blender`).
- Les meubles longs sont assemblés par le jeu : casiers par modules de 0,62 m, cloisons
  basses par modules d'environ 1,2 m (étirés de quelques pour cent pour tomber juste),
  luminaires étirés à leur longueur.
- Sans préchargement (tests de géométrie pure), le jeu retombe sur la version codée.

## Coût

Matières du niveau (bois, chêne, feutre, aluminium, carton, terre cuite…) avec UV
métriques, plus les trois matières partagées à couleurs de sommet des accessoires :
aucun lot supplémentaire. Mesuré sur les dix étages construits avec tous les GLB :

| | Avant (1.10.0) | Après |
|---|---|---|
| Lots de rendu | 98 à 108 | **67 à 76** |
| Triangles | 203 000 à 265 000 | **155 000 à 198 000** |

Le poste de travail passe de ~9 500 triangles (clavier à 75 touches arrondies) à ~2 600,
la bibliothèque du directeur de 15 000–22 000 à 4 400.

## Reconstruire

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup `
  --python-exit-code 1 --python tools/blender/creer_mobilier.py -- --out NOUVEAU_DOSSIER
```

Le script refuse d'écrire dans un dossier existant. Copier ensuite
`NOUVEAU_DOSSIER/mobilier-v02.glb` vers `assets/`.

## Revoir un étage en place

Deux outils rendent un étage tel que le jeu le construit, sans lancer le jeu :

```powershell
node --import ./tests/personnages/resolveur.mjs tools/exporter-etage.mjs 7 etage-7.obj
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup `
  --python tools/blender/apercu_etage.py -- etage-7.obj revue-7.png
```

On obtient une vue de dessus coupée sous le plafond et des vues à hauteur d'yeux
(reprographie, hall, couloir, direction, réunion, postes, casiers, salon, salle
secrète), aux couleurs du jeu, avec les collègues figurés par des jalons.

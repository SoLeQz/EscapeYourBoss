# Garde-robe Blender v01 — le vestiaire de Lao D

Toutes les pièces du vestiaire (menu principal → **Vestiaire**) sont modélisées ici,
sur la maquette exacte du joueur, puis exportées dans un seul fichier lu par le jeu.

- Source : [`garde-robe-v01.blend`](garde-robe-v01.blend) (une collection par famille,
  tête et veste de référence masquées au rendu et non exportées).
- Export : [`garde-robe-v01.glb`](garde-robe-v01.glb), copié tel quel dans
  `assets/` (`test:garde-robe` vérifie qu'ils sont identiques).
- Planches de relecture (face, trois-quarts, profil) :
  [couvre-chefs](planche-couvre-chefs.png) · [visage](planche-visage.png) · [torse et dos](planche-torse.png).
- [`rapport.json`](rapport.json) : objets, triangles, matériaux et parties animées par pièce.

## Les pièces

| Emplacement | Pièces | Débloquée par |
|---|---|---|
| Tête (os `tete`) | casquette, bonnet à pompon, casque audio, bandeau de sport, chapeau melon, chapeau de fête, oreilles de chat, casque de chantier | — |
| | casquette à hélice (hélice animée) | étage 3 |
| | couronne de l'employé du mois | étage 6 |
| Yeux | lunettes rondes, aviateur, lunettes 3D | — |
| | lunettes pixel « deal with it » | étage 4 |
| Moustache | brosse, guidon (couleur des cheveux) | — |
| Cou (os `buste`) | nœud papillon (couleur de la cravate), collier de fleurs | — |
| Torse | gilet fluo | étage 2 |
| | cape de super-héros | un speedrun complet |
| Dos | sac banane, sac de livreur | — |
| | jetpack (flammes animées) | étage 5 |

Les lunettes de bureau viennent des têtes Blender (`tete-*-v02.glb`), la cravate et
le sac à dos du rig : ce sont les pièces du Lao D d'origine, qui ne coûte donc aucun
appel de dessin de plus. Le sac de livreur et le jetpack tiennent par les sangles du sac.

## Conventions (lues par `src/garde-robe-blender.js`)

- Chaque objet porte trois propriétés personnalisées, exportées en *extras* glTF :
  `garde_id` (identifiant du catalogue `src/garde-robe.js`), `garde_os` (`tete` ou
  `buste`) et `garde_role` (vide, `helice` ou `flamme`). Une partie animée porte aussi
  `garde_pivot` = [x, y, z] dans le repère de l'os.
- Les coordonnées sont celles de l'os, en mètres : aucune mise à l'échelle au jeu.
  Tête : origine au pivot `tete` (y = 1,63 m au repos). Buste : origine au bassin (0,85 m).
- Matériaux `GARDE_<nom>`. `teinte` prend la couleur choisie pour l'emplacement,
  `cheveux` celle des cheveux ; les autres (or, métal, fluo, verre, flamme…) sont fixes.
- Le jeu regroupe les géométries par pièce et par matériau : une pièce coûte entre 1
  et 8 appels de dessin, et seuls le joueur et le coéquipier en portent.

Les pièces de tête sont posées sur la tête « employé » en mesurant sa surface par
lancer de rayons (front, pommettes, tempes, nez, lèvre) ; celles du torse sur la
silhouette réelle veste + chemise (rayons autour du buste, manches retirées), ce qui
évite les objets qui flottent ou traversent. `test:garde-robe` contrôle ensuite le
placement dans le jeu sur les **quatre visages**. Le chignon passe sous le bonnet (le
jeu choisit la chevelure sans chignon, même nombre d'appels de dessin) et sort par
l'ouverture des casquettes, comme en vrai.

## Reconstruire

Depuis la racine du dépôt (Windows ou WSL ; sous WSL, passer les chemins en `wslpath -w`) :

```powershell
# 1. maquette du joueur courant
node --import ./tests/personnages/resolveur.mjs tools/blender/preparer_atelier_emotes.mjs atelier.json

# 2. modélisation, planches, rapport, export et .blend
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup `
  --python-exit-code 1 --python tools/blender/creer_garde_robe.py -- `
  --atelier atelier.json --assets assets --out NOUVEAU_DOSSIER
```

Le script refuse d'écrire dans un dossier existant, pour ne jamais écraser une
retouche. `--sans-rendu` saute les planches. Copier ensuite
`NOUVEAU_DOSSIER/garde-robe-v01.glb` vers `assets/`.

## Ajouter une pièce

1. La modéliser dans `creer_garde_robe.py` (ou à la main dans le `.blend`) avec les
   propriétés ci-dessus, et l'exporter.
2. L'ajouter au catalogue `PIECES` de `src/garde-robe.js` (nom, icône, `teinte`,
   `debloque` éventuel) — et, pour le fun, un titre de badge et une remarque des collègues.
3. `npm run test:garde-robe` : le test refuse une pièce du GLB absente du catalogue,
   et inversement.

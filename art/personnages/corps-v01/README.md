# Corps v01 — silhouette sculptée

Le corps de tous les personnages : chemise, pantalon et veste taillés sur un vrai
maillage de corps, à la place des tubes de `src/body.js`.

- `planche.png` : rendu Blender, sans et avec veste.
- `en-jeu.png`, `poses.png` : captures dans le jeu (repos, signe, danses, accroupi, marche).
- `rapport.json` : sommets, triangles, sections mesurées et articulations relevées.
- `corps-v01.blend` : les couches telles qu'exportées (aperçu, pas une source à retoucher).
- Le jeu charge `assets/corps-v01.js`, écrit par le script.

## Source et licence

« Body Male - Stylized » du *Human Base Meshes Bundle* v1.4.1 de Blender Studio,
licence **CC0** (domaine public), comme les visages v02 (`../anatomie-v02/SOURCES.md`).
Le bundle (50 Mo) n'est pas versionné :
https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip

## Régénérer

```sh
blender --background --factory-startup --disable-autoexec --python-exit-code 1 \
  --python tools/blender/sculpter_corps.py -- \
  --base human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend --out DOSSIER_NEUF
cp DOSSIER_NEUF/corps-v01.js assets/corps-v01.js
```

Le script ne retouche rien à la main : posture, carrure (`LARGEUR`, `PROFONDEUR`),
repose sur les 16 os, poids, décalages des vêtements et coupes sont des constantes
en tête de chaque étape. La tête, les mains et les pieds de la base ne servent pas.

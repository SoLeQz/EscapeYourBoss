# Têtes v02 — sources et licence

Peau du visage, nez, oreilles, cou et globes oculaires : **« Head (Animation) -
Realistic »** du *Human Base Meshes Bundle* v1.4.1 de Blender Studio, sous licence
**CC0** (domaine public). Usage libre, y compris commercial, sans attribution
obligatoire. Mentionné ici par courtoisie.

- Téléchargement : https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip
- Documentation : https://developer.blender.org/docs/features/asset_system/asset_bundles/human_base_meshes/

Le bundle (50 Mo) n'est pas versionné dans ce dépôt. Pour régénérer :

```powershell
blender --background --factory-startup --python tools/blender/creer_anatomie.py -- `
  --out NOUVEAU_DOSSIER --only tete-employe --version v02 `
  --base human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend
```

`head_v2` (dans `creer_anatomie.py`) prend le niveau de base du multires
(3 242 sommets). Elle adapte la tête au repère de Lao D : yeux au pivot `teteBase`,
échelle ×1,08 pour le corps trapu du jeu. Elle coupe ensuite sous la mâchoire par un
plan incliné et prolonge le bord par un cou en six anneaux jusqu'au col.

Sont posés par lancer de rayon sur cette surface : iris/pupille/reflet mobiles,
paupière en coque sphérique (clignement), sourcils, couleur des lèvres, lunettes,
coiffures des 4 profils et chignon. Les variantes de mâchoire (`form`) de la v01 sont
conservées.

Coût : de 13 200 à 15 000 triangles par tête, contre 15 000 à 16 800 en v01.

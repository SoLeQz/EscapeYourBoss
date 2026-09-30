# Mains v03 — cercle du Griddy

[Source Blender](mains-v03.blend) · [export GLB](mains-v03.glb) · [rendu](cercle.jpg).

Ajout de **Cercle** : index et pouce forment un anneau, les trois autres doigts
restent exactement dans leur pose **Ouvert**. Le contact entre les centres des
calottes est de **0,50 mm** sur chaque main. Même topologie et budget de triangles
que v02. Basis, Poing, Index, Ouvert et Pouce sont conservés sommet par sommet.

Canaux d’animation : `mainL_Cercle` et `mainR_Cercle`, entre 0 et 1. Mettre les
autres poids à zéro pendant Cercle. Les anciens clips gardent Cercle à zéro.
Le centre du trou est approximativement `(±0,046, -0,049, 0,017)` dans le repère
du poignet : doigts vers −Y, paume vers +Z ; gauche = X négatif.

Le `.blend` s’ouvre sur la pose Cercle pour inspection. L’export GLB est neutre.
Les têtes restent en version v02.

Reproduction, depuis la racine du projet avec Blender 5.2 :

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background `
  --python-exit-code 1 --python tools/blender/ajouter_main_cercle.py -- `
  --source art/personnages/anatomie-v02/mains-v02.blend --out NOUVEAU_DOSSIER
```

Le script contrôle les anciens morphs, la distance entre pulpes et l’immobilité
des trois doigts ouverts. `test:anatomie` compare aussi les sommets des GLB v02
et v03 et vérifie la remise à zéro de Cercle dans les anciens clips.

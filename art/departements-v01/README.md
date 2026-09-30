# Kit Blender des départements — v01

Complément au mobilier v02 : **22 modèles / 13 772 triangles** dans un GLB de
1,4 Mo environ. Les meubles génériques sont réutilisés.

- Dix `rangement-*` : RH, Finance, Support, Studio, Archives, Juridique,
  Marketing, Logistique, IT, Direction. Modules de 0,62 × 0,75 m, hauteur 1,848 m.
- Dix `poste-*` : plante, calculatrice, casque, prototype de chaise, fiches,
  tampon, packaging, boîte à outils, deuxième écran/câbles et sceau de direction.
- `vitrine-direction` remplace la pile de cartons dans son emprise, avec un dessus
  à 1,27 m pour conserver l'appui des canards.
- `moodboard` : cadre, six échantillons en relief et punaises.

`departements-v01.blend` est organisé en grille pour inspection. Les translations
entre modèles sont une présentation de l'atelier ; le GLB est exporté **avant**
cette mise en grille, chaque modèle à l'origine. Pour réexporter à la main après
édition, ramener les translations des modèles sélectionnés à zéro et conserver
leurs propriétés `acc_id` et matériaux `ACC_*`. Le script ci-dessous reproduit
l'intégralité de l'export sans cette opération manuelle.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup `
 --python-exit-code 1 --python tools/blender/creer_departements.py -- --out NOUVEAU_DOSSIER
```

L'export utilise les matériaux du jeu et les familles communes de couleurs de
sommet. Pas de texture supplémentaire dans le GLB. Source de la direction
artistique : `docs/art/DEPARTEMENTS.md`. Images en jeu et rapport :
`tests/departements/windows/`.

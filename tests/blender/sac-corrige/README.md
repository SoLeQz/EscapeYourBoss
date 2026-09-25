# Sac corrigé — Lao D v03

Source Blender : [lao-d-v03.blend](../../../art/lao-d/proposition-v03/lao-d-v03.blend).
Export utilisé par l'atelier : `assets/lao-d-v03.glb`.

Les bretelles suivent désormais la surface réelle des épaules et passent à
l'extérieur des revers. Leur épaisseur est explicite, sans subdivision ultérieure
qui les ferait rentrer dans la veste. Leurs poids suivent ceux du vêtement.
Les attaches inférieures longent le buste sous les bras et rejoignent le sac.

| Vue rapprochée | Avant (v01) | Après (v03) |
|---|---|---|
| Profil | [Avant](avant/apres-epaules-profil.jpg) | [Après](apres/apres-epaules-profil.jpg) |
| Dos | [Avant](avant/apres-epaules-dos.jpg) | [Après](apres/apres-epaules-dos.jpg) |
| Face | [Avant](avant/apres-epaules-face.jpg) | [Après](apres/apres-epaules-face.jpg) |
| Accroupi | [Avant](avant/epaules-accroupi-0.jpg) | [Après](apres/epaules-accroupi-0.jpg) |
| Travail | [Avant](avant/epaules-travail-0.jpg) | [Après](apres/epaules-travail-0.jpg) |
| Marche, instant 1 | [Avant](avant/epaules-marche-0.8.jpg) | [Après](apres/epaules-marche-0.8.jpg) |
| Marche, instant 2 | [Avant](avant/epaules-marche-2.8.jpg) | [Après](apres/epaules-marche-2.8.jpg) |

Les noms `apres-*` dans le dossier `avant/` viennent du harnais initial, qui compare
le personnage procédural au GLB. Pour ce correctif, ils désignent le GLB v01 ;
ceux du dossier `apres/` désignent le GLB v03. Éclairage et cadrage identiques.

Validation exécutée dans Blender 5.2.2 LTS et Electron Windows :

- 952 échantillons par épaule (sommets et milieux de faces) ; marge radiale minimale
  d'environ 6,2 mm en pose de liaison, rapport dans le dossier du `.blend`.
- Deux parcours visuels de 7 étapes et 26 captures chacun, sans erreur d'étape,
  sans erreur JavaScript ni secours. [Rapport après](apres/rapport.json).
- Examen des gros plans au repos, en marche, accroupi et au poste.
- 29 248 triangles et 11 appels de dessin ; +2 152 triangles par rapport à v01,
  toujours moins que les 31 018 triangles du joueur procédural.
- [Contrôle des autres lots](geometrie.json) : seule la géométrie du lot contenant
  les bretelles change ; arrondi UV négligeable sur la chemise.
- `npm run test:blender` réussi. Paquet Windows reconstruit ; les fichiers concernés
  sont identiques à ceux de la copie testée ([empreintes](paquet-sha256.json)).

Ce correctif concerne l'asset et l'atelier. L'intégration complète C, les expressions
et les autres défauts de déformation restent distincts. Le joueur normal n'est pas
remplacé dans cette passe. Les versions Blender précédentes restent conservées.

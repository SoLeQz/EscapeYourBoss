# Lao D — proposition B à valider

Source : `art/lao-d/proposition-v01/lao-d-v01.blend` (Blender 5.2.2 LTS).
Export : `assets/lao-d-v01.glb`. Rendu : Electron Windows, Three r169, même
éclairage, environnement, caméra et pose de base pour les deux modèles.

| Vue | Personnage actuel | Proposition Blender |
|---|---|---|
| Face entière | [Avant](avant-face-corps.jpg) | [Après](apres-face-corps.jpg) |
| Trois-quarts | [Avant](avant-trois-quarts.jpg) | [Après](apres-trois-quarts.jpg) |
| Visage | [Avant](avant-visage.jpg) | [Après](apres-visage.jpg) |
| Profil | [Avant](avant-profil.jpg) | [Après](apres-profil.jpg) |
| Dos | [Avant](avant-dos.jpg) | [Après](apres-dos.jpg) |
| Distance de jeu, en studio | [Avant](avant-distance-jeu.jpg) | [Après](apres-distance-jeu.jpg) |

![Proposition](apres-trois-quarts.jpg)

Contrôles exploratoires de pose : [accroupi](pose-accroupi-0.jpg),
[travail](pose-travail-0.jpg), marche [instant 1](pose-marche-0.8.jpg) et
[instant 2](pose-marche-2.8.jpg). Ces vues signalent les points à reprendre au
jalon C ; elles ne valident pas toutes les animations et les expressions.

Coûts du personnage seul, sans contour ni passes d'ombre :

| | Actuel | Proposition |
|---|---:|---:|
| Appels de dessin | 41 | 11 |
| Triangles | 31 018 | 27 096 |
| Surfaces skinnées | 5 | 11 |
| Matériaux | 26 | 11 |

Pas de mesure ni de gain FPS revendiqué. Le paquet normal garde le personnage
actuel. La proposition attend l'avis artistique avant la finition des déformations,
expressions, doigts, contour et integration gameplay. Le col et les sangles,
notamment, nécessiteront une vérification soignée en poses extrêmes.

Rapport d'exécution : [rapport.json](rapport.json). Le mode de test utilise un
profil temporaire, sans lire ni modifier les sauvegardes réelles. Les avertissements
ANGLE de compilation des shaders sont conservés dans le rapport.

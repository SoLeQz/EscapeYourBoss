# Mobilier Méridien — première passe Blender

Quatre modèles générés dans **Blender 5.2.2 LTS**, puis intégrés dans les niveaux
normaux d’Escape your boss 1.1.0. Sources éditables, exports GLB et rendus de studio
sont réunis ici. Le script `creer_decor.py` est la source de génération archivée.

| Source à ouvrir | Contenu | Triangles | Lots dans le jeu |
| --- | --- | ---: | ---: |
| [bureau-v01.blend](bureau-v01.blend) | Plateau biseauté, structure acier, caisson à tiroirs, poignées, passe-câbles | 2 704 | 6 |
| [chaise-v01.blend](chaise-v01.blend) | Assise creusée, dossier courbe, support lombaire, accoudoirs, vérin et roulettes | 3 068 | 4 |
| [escalier-v01.blend](escalier-v01.blend) | Deux volées en béton, palier, marches en pierre, nez antidérapants et garde-corps | 12 012 | 5 |
| [porte-escalier-v01.blend](porte-escalier-v01.blend) | Porte vitrée, barre anti-panique, paumelles, protection basse et ferme-porte | 1 212 | 3 |

Les bureaux de travail et les chaises utilisent ces exports. La table de réunion,
le bureau de direction, les murs, plafonds, luminaires et accessoires restent
procéduraux. La cage conserve ses murs et sa signalétique ; son escalier et sa
porte proviennent de Blender. Les personnages n’ont pas été remplacés par cette passe.

## Retoucher

1. Ouvrir un `.blend`, puis **Enregistrer sous** une nouvelle version avant de retoucher.
2. Conserver les dimensions et l’origine. Dans Blender, Z est le haut ; l’export
   glTF convertit vers Y haut pour Three.js. Le pivot de la porte est sa charnière.
3. Garder les noms `DECOR_…` des matériaux : le jeu leur réaffecte ses matières
   et textures. Les couleurs du rendu Blender ne sont donc pas exactement celles
   du niveau. Conserver les UV et les normales.
4. Exporter uniquement les pièces du modèle : GLB, objets sélectionnés, Y haut,
   modificateurs appliqués, sans caméra, éclairage, animation ni compression.
   Le studio inclus dans le `.blend` sert seulement aux rendus de référence.
5. Placer l’export dans `assets/`, adapter son nom dans `src/decor-blender.js`,
   lancer `npm run test:decor-blender`, puis reconstruire et copier le paquet Windows.

Les géométries sont fusionnées par matériau à l’import. Le moteur les met en cache,
puis fusionne le décor fixe par niveau. La porte conserve trois lots indépendants
pour son animation. Le chargement doit réussir avant l’ouverture du jeu : une
ressource manquante produit une erreur explicite.

La géométrie n’étend pas la zone jouable : les emprises, objectifs et sorties sont
conservés. L’escalier reste une sortie avec animation, pas un nouvel étage jouable.

[Captures prises dans le jeu](../../../tests/environnement/blender-v01/apercu.html).

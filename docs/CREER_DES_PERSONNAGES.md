# Créer tes personnages pour Escape your boss

## Têtes et mains utilisées en partie depuis la version 1.4.0

Les nouvelles sources sont dans **`art/personnages/anatomie-v01/`** : quatre
visages et une paire de mains, réellement utilisés dans les six niveaux.
[Ouvrir les sources et lire le guide de retouche/export](../art/personnages/anatomie-v01/README.md).
Les paupières et poses de doigts sont éditables par clés de forme dans Blender.
Le reste du corps conserve sa construction procédurale.

## Personnages complets proposés précédemment

Ouvre **[lao-d-v03.blend](../art/lao-d/proposition-v03/lao-d-v03.blend)** : version corrigée des bretelles du
personnage complet, créée dans Blender 5.2.2 LTS. Les fichiers
sont dans `art/lao-d/` à la racine du projet. L'[éprouvette technique](../art/lao-d/jalon-a-01/test.blend)
est distincte du personnage. Le brouillon `brouillon-b02` est une ancienne version.

[Guide court : retoucher, exporter et tester](blender/GUIDE_LAO_D.md).
L'import Blender et l'animation de test fonctionnent dans Electron. La direction visuelle a reçu un avis favorable ; cette version corrige le sac.
L'intégration complète du nouveau joueur reste à réaliser.

Trois nouveaux collègues sont également disponibles : **Directeur Wang, Zhang Jie et Lao Liu**.
[Ouvrir leurs fichiers Blender et consulter les aperçus](blender/GUIDE_COLLEGUES.md).
Ce sont des propositions artistiques, encore séparées des PNJ en partie.

## Informations générales

Oui, tu peux installer Unreal Engine 5 pour expérimenter avec des personnages.
Pour modeler toi-même un personnage destiné au jeu actuel, je recommande Blender.
Le jeu utilise aujourd’hui Three.js dans Electron : ce n’est pas un projet Unreal.

## Unreal Engine 5 et MetaHuman

1. Télécharge [Epic Games Launcher depuis le site Unreal](https://www.unrealengine.com/download).
2. Connecte-toi, ouvre l’onglet Unreal Engine, puis installe une version UE5 récente.
3. Dans les options d’installation du moteur, sélectionne **MetaHuman Creator Core Data**.
4. Crée un projet et active le plugin **MetaHuman Creator** pour composer un personnage humain.

MetaHuman Creator est intégré au moteur depuis UE 5.6. C’est une bonne piste pour
personnaliser des humains réalistes. Voir les [instructions officielles MetaHuman](https://www.metahuman.com/download?lang=en-US).

Un personnage MetaHuman devra être adapté et optimisé pour ce jeu. Installer UE5
ne convertit ni les niveaux ni les animations existantes. Porter tout le jeu dans
Unreal constituerait un chantier distinct.

## Blender : le chemin conseillé pour tes propres modèles

[Blender](https://www.blender.org/features/modeling/) propose modélisation, sculpture
et travail des UV. Il permet de dessiner librement la silhouette, le visage et les
vêtements, puis de préparer un personnage léger pour le jeu.

Pour un premier essai :

1. Commence par un employé en tenue de bureau, d’environ 1,75 m, debout en pose A.
2. Travaille d’abord la silhouette, les épaules, la mâchoire et la coupe des vêtements.
   Vérifie régulièrement le rendu de loin : c’est ainsi que le personnage sera vu en jeu.
3. Ajoute les UV et des matériaux simples : couleur, rugosité et normale. Préfère
   quelques matériaux partagés à un matériau par petit accessoire.
4. Ajoute une armature et vérifie une flexion des genoux et des coudes.
5. Conserve le fichier `.blend` et exporte une version **glTF Binary (`.glb`)**, avec
   maillage, armature et textures. Le format regroupe ces données dans un fichier :
   [documentation de l’exporteur glTF](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/docs/blender_docs/scene_gltf2.rst).

Budget de départ conseillé pour ce projet, à valider ensuite en jeu : 20 000 à
30 000 triangles par personnage, quelques matériaux et textures de 1K ou 2K.
Les personnages procéduraux actuels coûtent environ 31 000 triangles ; les appels
aux matériaux restent aussi importants que le nombre de triangles.

**L’import expérimental de GLB est implémenté et testé dans Electron.** Déposer un
`.glb` dans `assets/` ne remplace pas automatiquement Lao D. L’adaptateur utilise
les matrices de liaison ; l’intégration complète des poses et des quatre emotes actuelles
appartient au jalon C, après la validation artistique. Garde aussi ton fichier
source pour permettre les corrections de proportions et de poids d’animation.


## Référence actuelle pour une création maison

La refonte du 24 septembre est documentée au §15 de `PROJECT_STATE.md`. Les vues
comparables du modèle sont dans `tests/personnages/refonte/avant/` et
`tests/personnages/refonte/apres/`. Elles montrent aussi les poses à vérifier pour
un futur modèle : dos avec sac, accroupissement, frappe au clavier, bras levé et marche.

Repères du squelette actuel, en mètres, personnage orienté vers **+Z** : hanches à
0,85 ; épaules à 1,38 ; regard à 1,63 ; sommet de la coiffure vers 1,79. Le sol est
à zéro. Les noms des 16 os et leurs positions de repos sont disponibles dans
`src/body.js` (`nomsOs()` et `reposMonde()`). Ces repères servent à préparer
l’intégration ; ils ne rendent pas un export Blender automatiquement compatible.

Pour dépasser cette base, concentre ta sculpture sur le visage et les volumes des
cheveux, puis sur une silhouette propre à chaque rôle. Les expressions faciales,
les doigts indépendants et les plis déformés à la main demanderaient également
un rig plus détaillé que celui utilisé aujourd’hui.

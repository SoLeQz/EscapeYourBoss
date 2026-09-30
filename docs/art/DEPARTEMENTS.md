# Méridien — dix départements, une même entreprise

## Diagnostic avant intervention

À conserver : la coque de l'immeuble, les cinq plans et leurs orientations, les
rondes, les sorties alternatives, le salon clandestin, les 26 meubles Blender v02,
les textures de bois/feutre/béton et la signalétique des actions.

Ce qui manquait : six premiers niveaux définis surtout par l'heure, écrans code /
tableur / graphiques mélangés sur chaque plan, mêmes casiers partout, mêmes affiches
et palette pétrole/ocre omniprésente. Le Marketing et l'IT avaient surtout leur
panneau ; la Direction partageait le déménagement des Services généraux.

## Choix d'art

Méridien conserve ses proportions, ses arêtes adoucies, ses matières sobres et ses
interfaces. Chaque service reçoit trois lectures : silhouette à distance, poste
reconnaissable à moyenne distance, histoire à examiner de près. On réutilise les
meubles qui portent déjà une collision : aucune nouvelle barrière décorative dans
les trajets. Les signes de sortie, d'objet à ramasser et de menace restent communs.

| Étape / étage | Service et palette | Lecture du lieu | Détail à découvrir |
|---|---|---|---|
| 1 / 23 | RH : sauge, argile, crème | Casiers à paniers et plantes, tapis ronds, entretien individuel | Le ficus employé du mois |
| 2 / 22 | Finance : vert profond, laiton, noyer | Coffres à molettes, calculatrices, compositions symétriques | Le graphique « redressé » en retournant l'écran |
| 3 / 19 | Support : bleu ardoise, miel | Casques sur supports, matériel de prêt, rythme acoustique | Le client premier dans la file depuis 1998 |
| 4 / 18 | Studio produit : bleu de plan, corail, bois clair | Maquettes de chaise, échantillons en relief, tracés techniques | La chaise sans assise, version finale 8 |
| 5 / 12 | Archives : tabac, kraft, parchemin | Rayonnages de dossiers, fiches indexées, classement au sol | Le dossier 404 |
| 6 / 11 | Juridique : prune, bronze, ivoire | Contrats scellés, tampons, panneaux de procédure | L'autorisation de demander une autorisation |
| 7 / 9 | Marketing : framboise, jaune, rose poudré | Mur de campagne, produits dérivés, moodboard et îlots ronds | RIEN™, désormais en format familial |
| 8 / 7 | Services généraux : kaki, ambre, kraft | Armoires à outils, cartons conservés, marquages de manutention | La caisse contenant le moral de l'équipe |
| 9 / 4 | IT : graphite, cyan pâle, menthe | Baies ventilées, doubles écrans, patchs réseau et câbles | Un serveur au vert parce que ses voyants rouges sont retirés |
| 10 / 2 | Direction : encre, champagne, noyer | Vitrines à la place des cartons, trophées, symétrie et moulures | Le trophée « Parti à l'heure », jamais attribué |

Les trois anciens doublons d'étage deviennent 22, 18 et 11. Les identifiants de
progression restent 1–10 : aucun déblocage ni record n'est effacé.

## Production et exploration

22 modèles complémentaires dans `art/departements-v01/`, générateur Blender
`tools/blender/creer_departements.py`. Les casiers et accessoires de poste sont
remplacés selon le service ; tables, sièges, plantes, ascenseur et escalier
existants sont réutilisés. Les nouvelles images sont des dessins vectoriels dans
l'atlas commun, pas dix bibliothèques de textures. Les températures de couleur
changent sur les lumières déjà présentes, sans ajout de source ou d'ombre.

Dix observations se lisent avec la touche d'interaction devant leur tableau ou
mur de présentation ; elles rejoignent le carnet existant et se conservent après
un échec. La découverte est partagée en coopération. Elles ne confèrent ni
invisibilité ni diversion fictive. Les répliques des collègues reprennent le thème
sans modifier leurs rondes ni leur portée de détection.

Source de vérité : `src/departements.js`. Habillage :
`src/habillage-departements.js`. Illustrations : `src/graphisme-departements.js`.
Les variantes de matériau partagent les textures et sont réutilisées à chaque
visite. Le budget existant reste 110 lots / 270 000 triangles par décor.

La moquette conserve ses cartes Blender de grain, normales et rugosité ; une correction de luminance commune empêche son vert initial de dominer les dix palettes.

# Diagnostic des textures — Escape your boss 1.2.0

Revue des **51 matières de la bibliothèque** (25 décor, 26 personnages), de leurs
52 textures initiales partagées, des atlas graphiques et de l’ambiance. Inventaire
mesuré dans le jeu : [avant/diagnostic.json](avant/diagnostic.json). Les variantes
colorées des collègues réutilisent ces familles. Les captures ont été prises au
même étage, sous le même éclairage et avec les mêmes cadrages.

## Ce qui dégradait le plus le rendu

| Famille | Diagnostic avant | Correction livrée |
| --- | --- | --- |
| Bois clair et foncé | Fil trop régulier ; plateaux trop vernis. La rugosité réelle descendait à 0,29 / 0,27 par multiplication de la carte. | Placage à fil irrégulier préparé dans Blender, microrelief discret, rugosité autour de 0,55 ; une carte commune avec deux teintes. |
| Fauteuils, cloisons et canapé | Grosses stries et damiers visibles ; grain étiré selon la taille du meuble. | Textile chiné Blender, grain fin, reflet diffus de tissu ; UV en mètres sur les boîtes du décor. |
| Moquette | Alternance trop régulière de carrés et stries qui formaient du moiré. | Fibres pétrole plus discrètes, joints fins, filtrage anisotrope et mipmaps ; aspect plus calme à distance. |
| Pierre / terrazzo | Agrégats carrés issus de bruit pixelisé ; contraste trop dur de près. | Inclusions organiques discrètes dans une matrice calcaire, rugosité mate. |
| Métal clair et sombre | Reflets presque chromés : rugosité réelle 0,17 / 0,14. Le « brossage » était un bruit isotrope. | Grain directionnel Blender, rugosité autour de 0,51 ; métal sombre moins réfléchissant. |
| Béton | Même relief que la peinture murale, sans identité propre. | Matière Blender distincte, nuances chaudes et petits pores. |
| Souliers et ceinture | Le cuir des chaussures utilisait une carte de tissu. | Grain de cuir Blender et rugosité dédiée, vernis atténué. |
| Plastiques noir et blanc | Couche de vernis trop forte sur les accessoires. | Rugosité augmentée, couche transparente réduite. |
| Plafond, longs rails et panneaux | Certaines primitives étiraient une texture sur toute leur longueur. | Échelle métrique cohérente ; dalles de plafond de 60 cm. |

Les sept nouvelles matières ont été construites avec des graphes de nœuds dans
**Blender 5.2.2 LTS**, puis cuites avec Cycles. Les cartes de normales sont dérivées
des hauteurs cuites, sans ombre ni reflet peints dans les textures. Deux passes de
comparaison ont servi à calmer les reflets, puis ajuster le chiné et le bois.

## Familles conservées après examen

| Famille | Décision et raison |
| --- | --- |
| Murs peints et soubassements | Grain suffisamment discret ; échelle corrigée avec les autres boîtes. |
| Verre, vitres, eau | Transparence utile à la lecture des espaces ; pas de salissures ajoutées qui masqueraient les collègues. |
| Papier, feuillage, pots, carton, câbles, laiton | Surfaces simples adaptées aux petits objets et à la direction stylisée ; leur limite principale est la géométrie et la variété des accessoires. |
| Peau et cheveux | Détail discret, espaces colorimétriques corrects. Les limites du visage et de la coiffure tiennent surtout aux maillages. |
| Chemise, veste, pantalon, sac, sangles, cravate | Textures de vêtement existantes conservées ; elles distinguent déjà leurs matières. Les plis et déformations pourront encore progresser avec les modèles de personnages. |
| Yeux, bouche, lunettes, boutons, badge et ceinture hors cuir | Petits matériaux colorés ; pas de résolution supplémentaire justifiée. |
| Signalétique Méridien | Atlas commun 2048 × 1280, texte lisible et cohérent ; conservé. |
| Écrans, horloge, panneaux de sortie | Graphismes canvas, adaptés aux informations qu’ils portent ; conservés. |
| Étiquettes, bulles et icônes | Cartes transparentes sans écriture en profondeur ; conservées. |
| Ciel et environnement réfléchi | Ciel linéaire 1024 × 512, environnement PMREM cohérent avec l’éclairage ; conservés. |
| Façades lointaines | Motif de fenêtres simple de 128 × 256, acceptable en arrière-plan ; une future passe pourra varier les silhouettes. |
| Ancienne `cityTexture()` | Générateur historique non utilisé par le rendu actuel : aucun effet visuel à corriger en partie. |

## Coût et vérifications

- 19 cartes Blender réellement chargées, partagées entre les variantes de matières.
- 1024² pour le bois, 512² pour les autres matières ; environ **37,3 Mio** de cartes
  GPU avec mipmaps pour cette bibliothèque (estimation RGBA8, pas une mesure VRAM globale).
- Sources et PNG maîtres conservés ; copies de livraison en 8 bits : **2,65 Mo**
  au lieu de 20,38 Mo, aux mêmes dimensions. Le runtime utilise déjà des textures RGBA8.
- 47 textures uniques dans les 51 matières après la passe, contre 52 avant.
  Cela ne signifie pas que la consommation mémoire totale a diminué : les nouvelles
  cartes sont plus grandes et les autres textures du rendu ne sont pas incluses.
- Les UV sont corrigées sur les primitives ; les matériaux des modèles Blender
  utilisent déjà des UV métriques. Atlas, textes et sprites conservent leurs UV.
- `test:textures` vérifie fichiers PNG, espaces couleur, normales, rugosité,
  raccord horizontal et ressources partagées ; il construit les six niveaux avec
  les vraies cartes et les GLB, puis contrôle les transitions et le passage du niveau 6.
- `test:personnages` vérifie les maillages et poses existants. Revue Windows dédiée :
  `--selftest --decor --textures --textures-final`, avec captures et transitions 4 → 6 → 1.

La revue finale des matières passe 6 étapes. Le parcours de gameplay lancé
depuis la copie Windows installée en 1.2.0 passe 17 étapes, sans erreur JavaScript
ni échec : [rapport installé](installation-gameplay/rapport.json). Les avertissements
ANGLE sont conservés avec les logs.

Aucun gain de FPS en partie complète n’est revendiqué. Cette passe corrige les
matières et leur échelle, sans reconstruire tous les objets ni les personnages.

[Comparer les captures](apercu.html) · [Sources Blender](../../art/matieres/meridien-v01/README.md)

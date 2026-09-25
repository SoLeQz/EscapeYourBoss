# Humour dans les six niveaux — version 1.3.0

[Voir les captures du jeu](apercu.html) ·
[Ouvrir les sources Blender](../../art/humour/meridien-v01/README.md)

La revue graphique Windows utilise les vrais exports Blender et les textures
chargées au démarrage. Les six vues rapprochées conservent les lumières et les
PNJ de chaque niveau ; le joueur et le HUD sont masqués pour examiner le décor.
`captures/en-jeu.jpg` retrouve le HUD et la caméra jouable du premier niveau.

La revue a validé dix étapes, sans erreur JavaScript ni échec de contrôle.
Les avertissements de compilation des shaders ANGLE sont conservés dans le
rapport. La validation automatisée ne remplace pas le jugement visuel : les
captures ont aussi été examinées pour corriger les chevauchements et contrastes.

| Niveau | Lots du décor | Triangles du décor |
|---|---:|---:|
| 1 | 91 | 229 547 |
| 2 | 95 | 229 516 |
| 3 | 94 | 252 599 |
| 4 | 96 | 252 240 |
| 5 | 92 | 259 420 |
| 6 | 99 | 259 708 |

Budget maintenu : **100 lots et 260 000 triangles par niveau**. Le papier recyclé
et le plastique orange ajoutent chacun un lot dans leur niveau ; les autres
accessoires se fondent dans les lots existants. L’atlas commun gagne une rangée,
sans ajouter de texture indépendante ni de lumière. Aucun gain de FPS n’est revendiqué.

Les tests contrôlent la présence réelle des six GLB, leurs emprises, la distance
aux objets de mission, les collisions historiques, le passage réunion/escalier,
les budgets et la libération des ressources lors des transitions.

```bash
npm run test:humour
npm run test:decor-blender
npm run test:textures
npm run test:gameplay
```

La revue graphique se relance avec l’exécutable Windows :

```text
EscapeYourBoss.exe --selftest --decor --humour --out=C:\chemin\revue-humour
```

Le harnais utilise une progression temporaire isolée. Les journaux locaux sont
conservés dans `validation/`, le rapport de revue dans `captures/rapport.json`.

L’exécutable installé dans `C:\Users\nicol\EscapeYourBoss` a également passé
les **17 étapes** du harnais `--selftest --gameplay`, sans erreur JavaScript
ni échec. Rapport et captures : `installation-gameplay/`.

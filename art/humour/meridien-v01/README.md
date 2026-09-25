# Les cinq petites minutes — accessoires Blender

Six modèles originaux créés et exportés avec **Blender 5.2.2 LTS**, intégrés aux
six niveaux depuis la version **1.3.0**. Les fichiers `.blend` sont éditables :
les pièces sont nommées séparément et un studio de revue est inclus.

| Niveau | Source Blender | Scène | Triangles |
|---|---|---|---:|
| 1 | [trophee-cafe-v01.blend](trophee-cafe-v01.blend) | Une tasse en cravate, deux anses de trophée : le café est employé du mois. | 427 |
| 2 | [cascade-papier-v01.blend](cascade-papier-v01.blend) | La photocopieuse imprime le rappel « zéro papier » en accordéon. | 200 |
| 3 | [cone-chef-v01.blend](cone-chef-v01.blend) | Le responsable des travaux est un cône à lunettes et cravate. | 251 |
| 4 | [sablier-reunion-v01.blend](sablier-reunion-v01.blend) | Un sablier pour la réunion express qui n’a toujours pas dépassé l’introduction. | 752 |
| 5 | [tour-dossiers-v01.blend](tour-dossiers-v01.blend) | La petite tâche rapide est une tour de dossiers avec une échelle. | 564 |
| 6 | [tampon-sortie-v01.blend](tampon-sortie-v01.blend) | Un tampon géant et les formulaires d’autorisation de partir. | 316 |

Les `.glb` sont les exports statiques livrés dans `assets/`. Les `.png` sont des
rendus de studio Blender ; les [captures du jeu](../../../tests/humour/apercu.html)
montrent les véritables matériaux et éclairages des niveaux.

Les textes français et placements sont dans `src/humour.js`. Ils utilisent le
même atlas que la signalétique existante, dessiné par `src/environment.js`.
Les personnages, l’architecture et les autres meubles ne sont pas remplacés par
ces fichiers. Le sablier est un objet de décor statique, pas le chrono du niveau.

## Retoucher ou régénérer

Ouvrir un `.blend`, modifier les pièces du modèle puis exporter **uniquement
les maillages sélectionnés** en glTF binaire, sans lumières, caméra ni animation,
avec Y vers le haut. Conserver les noms de matériaux `DECOR_*` pour retrouver les
matières du jeu. Les maillages doivent garder UV et normales ; unités : mètres.

Le générateur `tools/blender/creer_humour.py` reconstruit l’ensemble dans un
**nouveau dossier obligatoire**, sans écraser les sources existantes :

```text
blender --background --factory-startup --python-exit-code 1 --python tools/blender/creer_humour.py -- --out DOSSIER_NEUF
```

Après une modification, contrôler les emprises avec `npm run test:humour`, puis
les pixels dans l’exécutable Windows avec `--selftest --decor --humour --out=...`.
Les accessoires sont volontairement contenus dans les meubles ou dans l’accès
condamné du niveau 3 : ne pas les agrandir sans revérifier la circulation.

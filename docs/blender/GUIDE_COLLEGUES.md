# Trois collègues à ouvrir dans Blender

Ces propositions reprennent trois rôles déjà présents dans **Escape your boss**.
Elles partagent l'armature de Lao D, avec des vêtements, coiffures et proportions
propres à chaque rôle. Les personnages de la partie normale restent procéduraux ;
ces fichiers permettent d'abord de juger et retoucher la direction artistique.

| Personnage | Source Blender | Direction |
|---|---|---|
| Directeur Wang | [directeur-v01.blend](../../art/collegues/proposition-v01/directeur/directeur-v01.blend) | Costume sombre ample, cravate bordeaux, pochette, mâchoire plus large, tempes grises |
| Zhang Jie | [zhang-v01.blend](../../art/collegues/proposition-v01/zhang/zhang-v01.blend) | Ensemble prune cintré, visage affiné, chignon, sans lunettes ni cravate |
| Lao Liu | [liu-v01.blend](../../art/collegues/proposition-v01/liu/liu-v01.blend) | Épaules larges, uniforme zippé, poches, insigne et radio |

[Aperçu dans le moteur du jeu](../../tests/blender/collegues-v01/ensemble-corps.jpg).
Lao D apparaît à droite pour comparer la famille visuelle.
[Captures et résultats détaillés](../../tests/blender/collegues-v01/README.md).

## Retoucher les sources

Chaque dossier contient le `.blend`, son GLB, un rendu Blender et le rapport de
création. L'armature, les UV, les poids et le studio sont présents dans la source.
Les maillages sont regroupés par matériau ; leurs îlots restent éditables.

Depuis Blender Windows, obtenir le chemin d'un fichier avec :

```sh
wslpath -w /home/nicleena/fun/jeu/art/collegues/proposition-v01/directeur/directeur-v01.blend
```

Utiliser **Enregistrer sous** pour conserver une copie de tes retouches. Pour
exporter sans régénérer la géométrie, adapter les chemins Windows :

```text
blender.exe --background personnage-retouche.blend --python-exit-code 1 --python exporter_lao_d.py -- --out nouvel-export.glb
```

Le script commun `tools/blender/exporter_lao_d.py` sélectionne l'armature et les
maillages, exclut le studio, refuse d'écraser un GLB et ne sauvegarde pas la source.
Déposer un nouvel export ne remplace pas automatiquement un PNJ.

## Reproduire les propositions

La copie figée sous `art/collegues/proposition-v01/` comprend `creer_lao_d.py`,
`variantes_bureau.py`, `exporter_lao_d.py`, `contrat.json` et un manifeste SHA-256.
Garder les deux scripts de génération côte à côte. Adapter les chemins Windows :

```text
blender.exe --background --factory-startup --python-exit-code 1 --python creer_lao_d.py -- --contrat contrat.json --out NOUVEAU_DOSSIER --profil directeur --nom directeur-v01
```

Remplacer les deux derniers arguments par `--profil zhang --nom zhang-v01` ou
`--profil liu --nom liu-v01`. Chaque sortie exige un dossier inexistant. Les
premiers essais de cette passe sont conservés sous `art/collegues/brouillon-01/`.

## Prévisualiser dans Electron

Copier le dossier complet du paquet Windows dans un dossier local Windows, puis :

```text
EscapeYourBoss.exe --selftest --blender --collegues --out=C:\chemin\captures-collegues
```

Cet atelier charge strictement les trois GLB et Lao D v03 pour comparaison,
capture les vues et les poses, puis quitte. Il utilise un profil temporaire.
Les exports sont sous `assets/`. Les sources Blender restent exclues du paquet.

Il reste à finaliser les expressions, clignements, doigts, poses extrêmes et
l'intégration des PNJ en partie. Les contrôles de poses ne valent pas une
validation complète des animations ou une mesure de performances en jeu.

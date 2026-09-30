# Émotes retravaillées dans Blender — v07

Les trois `.blend` de ce dossier sont les sources éditables. Les fichiers
`*-export/*.json` et `*.js` sont évalués depuis ces scènes à 60 images/seconde ;
le jeu lit ces poses, il ne fabrique pas les gestes. Les versions v06 restent
archivées à côté.

| Emote | Durée | Repères de mouvement |
| --- | --- | --- |
| Aura Farming | 8,4 s | Avant-bras présenté, balayage de l'autre main, deux petits cercles de poignets, ouvertures et pointés ; buste et regard calmes. L'ancienne pagaie imaginaire a été retirée. |
| Griddy | 7,2 s | Huit talons alternés, pointes relevées, flexion de l'appui et passage sous le bassin ; bras bas, deux pas avec les B's aux yeux, puis balancier arrière. |
| Floss | 8,3 s | Trois cycles de six balancements : devant / derrière / devant puis inversion ; bassin en opposition, passages des mains autour des flancs et paumes cohérentes. |

Le Griddy utilise les mains Blender v03 : anneau pouce-index et trois autres
doigts ouverts (`mainL_Cercle` / `mainR_Cercle`). Le centre de chaque anneau est
aligné sur l'œil par cinématique inverse, puis animé par les courbes Blender.
Les clés, les temps musicaux et les gestes sont nommés dans la Timeline.
Les contacts avec le sol sont cuits image par image dans Blender.

## Références gestuelles

- Aura : [Dhika au Pacu Jalur, reportage CNA](https://www.youtube.com/watch?v=3EViIwcYlMM).
- Griddy : [tutoriel du créateur Allen Davis](https://www.youtube.com/watch?v=f-PZjHjurJ4).
- Floss : [Backpack Kid explique son geste](https://www.youtube.com/watch?v=PgfjZSbX4Fo),
  [décomposition STEEZY](https://www.youtube.com/watch?v=zRQDeeGKcz4).
  Le choix demandé est la variante popularisée par Fortnite.

Ce sont des adaptations au personnage du jeu, pas une capture de mouvement
recopiée image par image. La fidélité porte sur les gestes qui identifient
chaque danse et leur enchaînement.

## Cadence et son

Cadences de travail : Aura 130 BPM, Griddy 158 BPM (pas à 79/min), Floss 128 BPM.
Ces valeurs calent les **courbes d'animation**. Elles ne certifient pas le tempo
ou le départ d'un futur extrait musical, qui devra être mesuré et recalé.

Les scènes et exports v07 n'embarquent actuellement **aucun son**. Il n'y a pas de
musique synthétique présentée comme l'original. Le générateur accepte en option
`--son DOSSIER` avec des fichiers `emote-<identifiant>-son-v02.mp3` : il les
embarque dans le séquenceur Blender et inscrit leur nom dans l'export.

## Retoucher et régénérer

Sources Python : `tools/blender/tendances_v07.py` (chorégraphies),
`tools/blender/creer_emotes_tendances.py` (atelier et cuisson),
`tools/blender/exporter_emotes.py` (évaluation des courbes).

```text
blender.exe --background --factory-startup --python-exit-code 1 \
  --python tools/blender/creer_emotes_tendances.py -- \
  --atelier atelier-avec-mains-v03.json --out DOSSIER_NEUF \
  --version v07 --seulement aura-farming,griddy,floss
```

Pour exporter une retouche manuelle : ouvrir son `.blend`, modifier les courbes,
puis appeler `exporter_emotes.py -- --out DOSSIER_NEUF`. Ne pas écraser les scènes
manuellement retouchées en relançant le générateur au même emplacement.

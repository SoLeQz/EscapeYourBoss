# Emotes Blender v06 — Aura Farming, Griddy, Floss, Apple

Quatre tendances ajoutées à la roue en 1.8.0 (cases **7, 8, 9 et 0**), chacune avec
**sa musique originale**. Mêmes principes que les v01–v05 : animation par clés dans
Blender sur la maquette exacte du joueur, contacts posés par cinématique inverse,
appuis cuits au sol, puis export des courbes à 60 images/s lu tel quel par le jeu.

- Sources : [`aura-farming-v06.blend`](aura-farming-v06.blend) · [`griddy-v06.blend`](griddy-v06.blend) ·
  [`floss-v06.blend`](floss-v06.blend) · [`apple-v06.blend`](apple-v06.blend) — musique embarquée
  dans le séquenceur, marqueurs `Mesure n`.
- Planches (haut : face, bas : profil) : [Aura Farming](planche-aura-farming.png) ·
  [Griddy](planche-griddy.png) · [Floss](planche-floss.png) · [Apple](planche-apple.png).
- Musiques : [`sons/`](sons/) (MP3 192 kb/s, 48 kHz) et leurs [spectrogrammes](sons/spectrogrammes.png).
- [Références des gestes](REFERENCES.md).

## Les quatre danses

La grille rythmique de chaque emote (tempo, premier temps, durée) est définie une
seule fois dans `tools/blender/tendances_v06.py` et partagée par la musique et la
chorégraphie : les accents tombent sur les temps. `T(k) = T0 + k × 60 / BPM`.

| Emote | Musique | Durée | Déroulé |
|---|---|---|---|
| **Aura Farming** 🛶 | 90 BPM, ré mineur, lo-fi : piano électrique FM, flûte, grain de vinyle | 8,6 s | appuis de proue (0) · vague du bras droit, poignet qui roule (1–2,5) · vague du bras gauche (3,5–5) · 4 coups de pagaie à droite puis à gauche, mains devant le corps (6–9,5) · salut au front (10) · index vers l'horizon (10,75) · hochement (11,5) |
| **Griddy** 🥽 | 140 BPM, fa# mineur, trap : 808 qui glisse, clap sur le 3, charleston en rafales, cloche | 7,4 s | 4 talons avec balancier des bras (0–3) · jumelles devant les yeux, talons continus (4–5) · bras relancés en arrière (6–7) · même phrase (8–15) · jumelles finales, clin d'œil (16) |
| **Floss** 🦷 | 128 BPM, la mineur, électro : grosse caisse régulière, basse à contretemps, arpèges | 8,0 s | 6 séries de 4 balancements, un par demi-temps : bras devant d'un côté / derrière de l'autre, hanches à contresens ; côté inversé à chaque série (1–13) · passage final plus large, clin d'œil (13,25–15,5) |
| **Apple** 🍏 | 124 BPM, do# mineur, électroclash : basse en scie pompée, riff en carré | 8,3 s | mains sur les hanches, 4 coups de hanche (0–3) · pomme au-dessus de la tête, regard vers elle (4–5) · vague du buste (6–7,3) · volant à 10 h 10, braquage à gauche puis à droite (8–12) · balancier des bras (13–14,3) · pose finale, clin d'œil (15,3–16) |

Contacts vérifiés **dans le jeu** par `npm run test:tendances` : jumelles à hauteur
des yeux, talon 30 cm devant pointe relevée, main du Floss qui croise la ligne
médiane devant puis derrière le dos, mains à ±17 cm sur les hanches, pomme au-dessus
de la tête, volant tenu symétrique puis braqué, salut au front, pagaie tenue devant.
Écart de la cinématique inverse : 0,3 mm (Aura Farming), 4,5 mm (Griddy), 11 mm (Apple).

## Musiques originales

Aucune musique de trend n'est téléchargée ni embarquée : les morceaux associés sont
protégés. `tools/blender/composer_sons_emotes.py` compose et synthétise chaque piste
dans Blender (numpy : grosse caisse, caisse claire, clap, charleston, 808, FM, scie,
carré, flûte, cloche ; limiteur doux à −1 dBFS), puis l'encode en MP3 avec `aud`.
Le script est **déterministe** : relancé, il produit les mêmes fichiers au bit près.
Chaque musique dure 0,15 s de moins que sa danse (marge du remplissage MP3).

Pour remplacer une musique par un extrait à toi : même nom de fichier
(`emote-<id>-son-v01.mp3`) dans `assets/`, durée inférieure à celle de la danse.

## Reconstruire

Depuis `tools/blender/` (Windows ou WSL ; sous WSL, passer les chemins en `wslpath -w`) :

```powershell
# 1. maquette du joueur courant (depuis la racine du dépôt)
node --import ./tests/personnages/resolveur.mjs tools/blender/preparer_atelier_emotes.mjs atelier-emotes.json

# 2. musiques
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup `
  --python-exit-code 1 --python composer_sons_emotes.py -- --out NOUVEAU_DOSSIER_SONS

# 3. scènes, export et vignettes
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python-exit-code 1 `
  --python creer_emotes_tendances.py -- --atelier atelier-emotes.json --out NOUVEAU_DOSSIER `
  --version v06 --seulement aura-farming,griddy,floss,apple --son NOUVEAU_DOSSIER_SONS

# 4. planche de relecture d'une emote
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background `
  --python apercu_emotes.py -- griddy-v06.blend planche-griddy.png 0.5,1.0,1.8
```

Les scripts refusent d'écrire dans un dossier existant, pour ne jamais écraser une
retouche. Copier ensuite `<id>-export/<id>-v06.js` vers `assets/emote-<id>-v06.js`
et les MP3 vers `assets/` ; `test:tendances` vérifie qu'ils sont identiques aux sources.

## Retoucher à la main

Ouvrir le `.blend`, appuyer sur **Espace** : la danse se joue avec sa musique.
Retoucher les contrôleurs `CTRL_*` (courbes Bézier du Graph Editor) et l'objet
`Expressions` (mains, clignement, bouche), puis réexporter sans reconstruire la
chorégraphie :

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' griddy-v06.blend --background `
  --python-exit-code 1 --python exporter_emotes.py -- --out NOUVEL_EXPORT
```

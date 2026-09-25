# Emote Blender — Passinho do Jamal v02 (archivée)

> **Archivée le 25/09/2026** : remplacée par la [v03 d’après la vraie trend](../tendances-v03/README.md).
> La danse de pieds ne correspondait pas au geste reconnu. Le son s’appelle désormais
> `assets/emote-ela-ke-leitada-son-v01.mp3`.

Remplace `passinho-jamal-v01` dans le jeu **1.5.0** : maintenir `T`, choisir
**6 — Ela Ké Leitada**, relâcher. C’est la seule emote qui joue une musique :
`assets/emote-passinho-jamal-son-v01.mp3` (extrait fourni, 11,29 s).
Le 67 et les quatre emotes historiques restent muets.

- [Ouvrir passinho-jamal-v02.blend](passinho-jamal-v02.blend) — 11,8 secondes.
- [Planche de contrôle rendue dans Blender](planche/).
- [Références des mèmes](../tendances-v01/REFERENCES.md) ·
  [Guide des contrôleurs et du réexport](../tendances-v01/README.md).
- [Vidéos et captures du jeu](../../../tests/tendances/apercu.html).

## Calage sur la musique

La grille a été mesurée dans Blender (module `aud`) sur l’enveloppe du mp3 :
un temps toutes les **0,3526 s (170 BPM)**, premier temps après le drop à
**0,692 s**, écart maximal de 10 ms sur 22 attaques détectées. Une mesure dure
1,41 s ; les accents forts tombent à 0 / 1,41 / 2,82 s…

Le motif « un, deux, un-deux-trois » de la v01 occupe 8 temps, soit exactement
deux mesures. La v02 le joue trois fois et demie sur la grille, puis tient une
**pose finale bras ouverts** sur le dernier accent (10,56 s) avant le retour au
repos à 11,8 s. `TEMPS`, `T0` et `MOTIF` dans `creer_emotes_tendances.py`.

## Retoucher avec le son

Le mp3 est **embarqué** (packed) dans le `.blend`, dans le séquenceur, avec la
synchronisation *Sync to Audio* et le scrub audio actifs : Espace joue la danse
avec la musique. Les marqueurs `Mesure 1…8` sont posés sur les temps forts.

Le réexport suit la même procédure que la v01 ; les fichiers produits s’appellent
`passinho-jamal-v02.*` (propriété de scène `emote_version`). Le JSON exporté
contient un champ `son` (fichier dans `assets/`, décalage `debut`) lu par le jeu.
Copier le JS vers `assets/emote-passinho-jamal-v02.js`, puis `npm run test:tendances`.

Reconstruire depuis zéro (dossier de sortie neuf) :

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background `
  --python-exit-code 1 --python creer_emotes_tendances.py -- `
  --atelier atelier-emotes.json --out NOUVEAU_DOSSIER `
  --seulement passinho-jamal --version v02 --son emote-passinho-jamal-son-v01.mp3
```

## Dans le jeu

`GameAudio.suivreMusique` (`src/audio.js`) suit l’emote à chaque image : départ à
la position de la danse, recalage au-delà de 0,12 s d’écart, fondu de 180 ms à
l’interruption (marche, accroupi), coupure en pause, reprise au bon endroit.
Le volume suit l’option Son du jeu. Le mp3 est préchargé au lancement d’un étage.

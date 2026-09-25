# Emote Blender — Ela Ké Leitada v03 (gestes de la vraie trend)

> **Remplacée par la v04** (`../tendances-v04/`) : même chorégraphie, mains v02 et vraie pose « Pouce ».
> La section « Poing » plus bas décrit un contournement devenu inutile.

Remplace la Passinho do Jamal (v01/v02, archivées) dans la case **6** de la roue.
La v02 était une danse de pieds calée sur la musique. Mais la trend que
l'utilisateur reconnaît est une **chorégraphie de mains** filmée en selfie. La v03
la reproduit à partir d'une vraie vidéo.

- [Ouvrir ela-ke-leitada-v03.blend](ela-ke-leitada-v03.blend) — 11,8 s, mp3 embarqué.
- [Planche des poses clés (Blender)](planche-poses.jpg) · [gros plan du pouce](pouce.jpg).
- [Référence : vidéo, capture Rokoko, planches](../references/).
- [Captures et vidéo du jeu](../../../tests/tendances/apercu.html).

## Source

1. Vidéo TikTok `#arthurlima #dance #tiktok #shorts` (15 s, 30 i/s, 360×640),
   fournie par l'utilisateur. Deux danseurs cadrés à la taille, caméra à la main.
2. Capture de mouvement **Rokoko Vision** (Rokoko Create → Rokoko Studio → FBX,
   squelette Newton, 443 images à 30 i/s) :
   [`leitada-arthurlima-rokoko.fbx`](../references/leitada-arthurlima-rokoko.fbx).

Les jambes ne sont jamais visibles et la capture est bruitée (selfie, deux
personnes). Transférer le squelette tel quel aurait raté les contacts, qui font
justement le geste. La capture sert donc à **deux choses** :
- le **timing** de chaque geste : distance main-tête, hauteur des mains ;
- l'**amplitude** du buste : penché avant jusqu'à 26°, recul, rotation de 35°.

Les poses sont reconstruites dans Blender sur le rig de Lao D par **cinématique
inverse** (`tools/blender/leitada_blender.py`) : paume sur la bouche, main sur
la montre, doigts sous le menton. L'écart moyen à la cible est de 1,4 mm.

## Calage musical

Le drop de la vidéo tombe à **6,10 s**. La vidéo est à 80 BPM et le mp3 à 85 :
les accents reviennent toutes les 1,5 s dans la vidéo et toutes les 1,413 s dans
le mp3. Conversion : `emote = (vidéo − 6,10) × 0,942`. Les clés sont ensuite
posées sur la grille du mp3 (`temps(k) = 0,692 + 0,3526·k`).

| Emote | Vidéo | Geste |
|---|---|---|
| 0 – 2,1 s | 6,1 – 8,4 s | **Choc** : main droite sur la bouche, pouce gauche qui pointe sur les temps ; rire penché à partir de 1 s |
| 2,3 s | 8,5 s | clap |
| 2,6 – 3,5 s | 8,7 – 10,1 s | balancement satisfait : recul, rotation, tête penchée |
| 3,97 s | 10,4 s | coup d'œil à la **montre** |
| 4,4 – 5 s | 10,5 – 11,7 s | **doigts sous le menton**, penché vers la caméra |
| 5,4 – 5,9 s | 11,8 – 12,3 s | poings qui roulent |
| 6,2 – 6,4 s | 12,5 – 12,9 s | l'autre main sur la bouche |
| 6,8 s | 13,2 s | penché, mains jointes |
| 7,4 – 7,7 s | 13,9 – 14,4 s | montre |
| 8,1 – 9,5 s | — | reprise du choc (la vidéo s'arrête ; le mp3 continue) |
| 9,9 – 11,1 s | — | final : tapote la montre deux fois, regard caméra. Il est l'heure de partir. |

## Pièges rencontrés (et réglés dans l'outil)

- **Poing** : sur `mains-v01.glb`, le morph *Poing* n'est qu'une légère flexion.
  Le poing du pouce levé vient de `doigts` x = 1,4, avec un roulis de 120° du
  poignet pour faire sortir le pouce. Choisi sur une grille de rendus.
- **Hémisphère des quaternions** : Blender interpole les quaternions composante
  par composante. `cle()` garde désormais chaque clé dans l'hémisphère de la
  précédente ; sinon le poignet faisait un tour complet en 0,1 s.
- **Blocage de cardan** : les angles du jeu sont des Euler XYZ. La torsion `y` du
  poignet et du bras est bornée à ±1,15 rad dans l'IK, loin de ±π/2.
- L'exporteur déroule les angles qui franchissent ±π. Les réexports v01 restent
  identiques au bit près.

## Reconstruire / retoucher

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background `
  --python-exit-code 1 --python creer_emotes_tendances.py -- `
  --atelier atelier-emotes.json --out NOUVEAU_DOSSIER `
  --seulement ela-ke-leitada --version v03 --son emote-ela-ke-leitada-son-v01.mp3
```

`leitada_blender.py` doit se trouver à côté du script. Pour retoucher à la main :
ouvrir le `.blend` et appuyer sur Espace pour jouer avec la musique (marqueurs
`Mesure n`). Retoucher les contrôleurs `CTRL_*`, puis réexporter comme en v01
(voir [le guide v01](../tendances-v01/README.md)). Copier ensuite le JS vers
`assets/emote-ela-ke-leitada-v03.js` et lancer `npm run test:tendances`. Ce test
mesure dans le jeu les contacts main-bouche et main-montre.

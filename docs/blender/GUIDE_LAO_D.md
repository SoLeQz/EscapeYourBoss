# Ouvrir et retoucher Lao D

Le fichier à ouvrir dans Blender est
**[art/lao-d/proposition-v03/lao-d-v03.blend](../../art/lao-d/proposition-v03/lao-d-v03.blend)**.
Il contient le personnage, ses UV, ses poids, l'armature et un studio de rendu.
Cette version corrige le passage des bretelles dans les épaules. La direction
visuelle a été jugée satisfaisante ; l'intégration complète C reste à réaliser.

- [GLB correspondant](../../assets/lao-d-v03.glb), autonome, environ 1,1 Mo.
- [Éprouvette du jalon A](../../art/lao-d/jalon-a-01/test.blend).
- [Captures comparatives](../../tests/blender/sac-corrige/README.md).
- [Contrat exact et état des vérifications](CONTRAT_ET_JALONS.md).

Dans Blender Windows, ouvrir le projet WSL par son chemin Windows (la commande
`wslpath -w /home/nicleena/fun/jeu/art/lao-d/proposition-v03/lao-d-v03.blend`
donne le chemin à coller dans la boîte d'ouverture). Utiliser **Enregistrer sous**
pour tes retouches, dans un autre fichier ou dossier. Les anciennes versions
ne seront pas écrasées par les scripts.

## Régénérer une nouvelle proposition

Depuis un terminal ayant accès au véritable exécutable Blender, adapter les
chemins Windows absolus :

```text
blender.exe --background --factory-startup --python-exit-code 1 --python creer_lao_d.py -- --contrat contrat.json --out NOUVEAU_DOSSIER --nom lao-d-v03
```

Le dossier doit être inexistant. Script courant sous `tools/blender/` ; copie
figée du script et contrat dans `art/lao-d/proposition-v03/`. La génération produit
un `.blend`, un GLB, un rendu et un rapport. Aucun asset tiers téléchargé, aucune
texture externe ; matériaux PBR simples exportables.

## Exporter tes retouches sans les régénérer

Enregistrer d'abord le `.blend` retouché depuis Blender, puis :

```text
blender.exe --background personnage-retouche.blend --python-exit-code 1 --python exporter_lao_d.py -- --out nouvel-export.glb
```

Le script `tools/blender/exporter_lao_d.py` sélectionne l'armature et ses maillages,
exclut le studio, contrôle os/UV/poids et refuse d'écraser un export. Il ne sauvegarde
pas la source. Ce parcours a été exécuté depuis le `.blend` livré ; les empreintes
figurent dans `tests/blender/audit/export-manuel.json`.

## Prévisualiser dans le vrai moteur

Paquet Windows : `dist/EscapeYourBoss-win32-x64/EscapeYourBoss.exe`.
Exécuter une copie locale du dossier complet depuis Windows :

```text
EscapeYourBoss.exe --selftest --blender --visuel --out=C:\chemin\captures
```

L'atelier charge strictement `resources/app/assets/lao-d-v03.glb`, produit des vues
avant/après sous le même éclairage, puis quitte. Un modèle absent ou incompatible
échoue explicitement. Le profil est isolé des sauvegardes réelles. Sans `--visuel`,
le même harnais vérifie l'éprouvette `lao-d-test.glb` du jalon A.

Le jeu lancé normalement utilise toujours le personnage procédural : aucun retour
arrière n'est nécessaire à ce stade. Les PNJ restent procéduraux également.
Ne pas remplacer globalement `makeCharacter()` ni changer les pivots du jeu pour
compenser un modèle différent.

## Ce qui reste avant une intégration finale

Valider d'abord le visage, la silhouette, les proportions, les vêtements et le sac.
Le modèle B ne termine pas les expressions, les clignements ou les doigts des emotes.
Les poses extrêmes exigent encore une passe de poids, de col et de sangles. Contour,
secours de production, transitions et mesures FPS répétées appartiennent à C.
Les coûts géométriques sont mesurés ; aucun gain de FPS n'est annoncé.

Les animations du joueur actuel ont été retravaillées : [vidéos et validation](../../tests/animations/README.md).
Le transfert des poses du corps a été contrôlé sur v03 ; doigts et expressions du
GLB restent à intégrer avant sa bascule en partie.

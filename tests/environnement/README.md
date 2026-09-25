# Validation du décor et des repères

`npm run test:environnement` construit les six étages et contrôle :

- Les emprises historiques, départs et sorties par empreinte SHA-256.
- Les deux obstacles supplémentaires de la porte d’escalier, l’accès à la sortie,
  et un rayon qui traverse réellement la trémie avant de toucher les marches.
- Des sommets/UV finis, au plus **100 lots et 260 000 triangles** par décor.
- Le voyant d’ascenseur, la libération de la porte animée et de chaque étage.
- La projection des objectifs devant/derrière la caméra à trois résolutions.
- Les sprites sans écriture en profondeur ; les objets dessinés au-dessus des
  cônes sur la mini-carte et retirés dès leur ramassage.

Les références de `collisions-avant.json` restent celles du 24 septembre 2026.
Les deux nouveaux obstacles portent `kind: architecture` et sont contrôlés
séparément ; ils protègent la trémie derrière le point d’interaction existant.

## Revue Windows

```text
EscapeYourBoss.exe --selftest --decor --out=C:\chemin\decor
EscapeYourBoss.exe --selftest --gameplay --reperes --out=C:\chemin\reperes
EscapeYourBoss.exe --selftest --transitions --out=C:\chemin\transitions
```

Ces commandes utilisent un profil de sauvegarde temporaire. La première capture
les pièces, les meubles, la cage d’escalier, les six plans et la caméra jouable.
La simulation est figée pour reproduire les cadrages. Les mesures de rendu
portent sur 120 intervalles après 30 images d’échauffement, vsync levée ; elles
ne se comparent pas directement au précédent protocole avec simulation active.
`--decor-vues` permet de ne prendre que les vues fixes.

Le scénario `--reperes` contrôle les postes dans les passes de profondeur,
les niveaux 2/4/6, le ramassage, le nouvel essai, le masquage pour la roue,
la stabilité des lumières et le nettoyage après transition. Il vérifie aussi
l’ouverture/annulation de la porte coupe-feu et l’ouverture de l’ascenseur.
Les PNJ sont immobilisés pour cette dernière vue afin d’isoler son animation.
La campagne complète est vérifiée séparément par `--transitions`.

Captures et rapports de cette passe : `refonte/avant/`, `refonte/apres/`,
`refonte/reperes/` et `refonte/transitions/`. Les images dans `captures/`
restent les références de la passe précédente. Les avertissements du compilateur
ANGLE/D3D11 sont conservés dans les rapports.

Dernière validation : 18 étapes décor, 15 repères, 21 gameplay et 10 transitions,
sans erreur JavaScript. Les mesures de transition au premier chargement d’un
nouveau shader restent variables ; elles ne sont pas des mesures de jeu fluide.

[Escalier avant](refonte/avant/escalier-acces.jpg) ·
[Escalier reconstruit](refonte/apres/escalier-volume.jpg) ·
[Nouveau mobilier](refonte/apres/poste.jpg) ·
[Poste libre lisible](refonte/reperes/poste-libre.jpg) ·
[Deux objectifs visibles](refonte/reperes/objectifs-niveau-6.jpg)

## Décor Blender — version 1.1.0

`npm run test:decor-blender` importe les quatre GLB effectivement livrés, vérifie
l’échec explicite en cas d’absence, puis contrôle les six étages et les ressources
pendant les transitions. Coût des décors : **91–99 lots, 229 120–259 330 triangles**.

[Comparaison avant/après](blender-v01/apercu.html). Le parcours Windows `--decor`
vérifie aussi le numéro de version, les quatre emotes et la présence des quatre
modèles dans la scène. Les rapports de cette passe sont dans `blender-v01/`.

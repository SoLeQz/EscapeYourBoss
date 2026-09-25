# Matières Méridien — Blender

Ouvrir **[matieres-meridien-v01.blend](matieres-meridien-v01.blend)** dans Blender.
La scène contient sept échantillons plans et sept sphères, avec les graphes de
matériaux et les cartes cuites embarquées. Sélectionner un échantillon et passer
dans **Shading** pour modifier sa matière. Enregistrer les retouches sous une
nouvelle version ; les sources livrées ne sont pas régénérées par le jeu.

| Matière | Période physique | Usages |
| --- | --- | --- |
| bois | 1 m | Bureaux, tables, meubles et rails ; variante foncée par teinte |
| textile | 50 cm | Fauteuils, cloisons et canapé ; variantes par teinte |
| moquette | 1 m | Sol de l’open space, fibres et joints fins |
| pierre | 1 m | Sols minéraux et marches |
| beton | 1 m | Cage d’escalier et noyau |
| metal | 50 cm | Piètements, poignées, rails et montants |
| cuir | 25 cm | Souliers et ceinture |

Les graphes utilisent un bruit périodique en quatre dimensions pour raccorder
les bords. Cycles cuit séparément couleur, rugosité et hauteur sur un plan UV ;
les normales tangentes sont calculées à partir des dérivées de cette hauteur.
Couleur : sRGB. Rugosité et normales : données linéaires. Pas d’éclairage figé dans
les cartes. Les cartes blanches de métal et cuir ne sont pas chargées par le jeu.

Le script archivé `creer_matieres.py` et sa version courante sous `tools/blender/`
refusent un dossier de sortie existant. Les PNG maîtres sont conservés ici ;
le jeu utilise les copies 8 bits optimisées dans `assets/` :

```bash
node tools/blender/preparer_textures.mjs art/matieres/meridien-v01
npm run test:textures
npm run build:win
```

`src/textures-blender.js` charge les cartes une fois ; `src/materials.js` les
associe aux matériaux. Les nouveaux `.blend` de personnages et de mobilier ne
sont pas remplacés. Pour retoucher leurs matières dans Blender, on peut ajouter
les matériaux de cette bibliothèque via **Fichier → Ajouter → Material**.
Pour l’export GLB de mobilier, conserver les noms `DECOR_…` attendus par
`src/decor-blender.js` ; les cartes PNG sont livrées séparément. Les variantes de
teinte et les reflets additionnels du jeu se règlent dans `src/materials.js`.

Le premier essai est conservé dans `../essai-v01/`. Le runtime est vérifié à
l’aide des fichiers de livraison, pas à partir d’une approximation procédurale.

[Diagnostic et comparaison en jeu](../../../tests/textures/DIAGNOSTIC.md).

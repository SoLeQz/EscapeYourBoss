# Têtes et mains Blender — jeu normal 1.4.0

Ces cinq fichiers sont les sources des têtes et des mains utilisées par Lao D et
les collègues en partie. Le corps habillé, le sac, les pieds et le squelette
restent ceux du jeu : ce sont des modules anatomiques, pas cinq personnages complets.
Modélisation et export effectués avec Blender **5.2.2 LTS**.

- [Employé / Lao D](tete-employe-v01.blend) : mâchoire, lèvres, paupières, cheveux balayés et lunettes optionnelles.
- [Direction](tete-direction-v01.blend) : mâchoire élargie, sourcils et implantation des cheveux différents.
- [Chignon](tete-chignon-v01.blend) : visage plus fin et coiffure attachée.
- [Sécurité](tete-securite-v01.blend) : mâchoire plus forte, coupe courte.
- [Mains](mains-v01.blend) : paumes, pouces, quatre doigts et ongles de chaque côté.

[Comparaison dans le moteur du jeu](../../../tests/anatomie/apercu.html).

## Retoucher

Ouvrir un `.blend` ci-dessus. Les pièces sont nommées dans l’Outliner. La caméra et
les lumières servent uniquement à regarder la sculpture. Les matériaux du jeu
reprennent ses couleurs personnalisées ; `Pigment` ajoute les nuances locales
(lèvres, joues, creux d’oreille, ongles). Le rendu Blender et celui du jeu ne sont
pas identiques, car leurs éclairages et matériaux diffèrent.

Sur « Paupières mobiles », la clé de forme **Clignement** ferme les yeux.
Sur « Doigts articulés L/R », les clés **Poing**, **Index** et **Ouvert** définissent
les gestes. Garder les mêmes sommets entre les clés ; modifier `Basis` puis les
poses concernées. Ne pas renommer les propriétés `controle`, `origine`, `option`,
ni les matériaux `ANATOMIE_*` : ils assurent le montage sur le rig du jeu.
Les pouces sont pilotés séparément par les animations existantes.

Les deux mains sont écartées dans le studio pour faciliter l’édition. Leur
propriété `decalageStudio` permet à l’exporteur de retirer ce décalage : **ne pas
les réexporter avec un simple export manuel de toute la scène**.

## Exporter une retouche sans reconstruire le modèle

Utiliser `tools/blender/exporter_anatomie.py`, avec le `.blend` modifié comme entrée
et un **nouveau** fichier comme sortie. Exemple PowerShell, chemins à adapter :

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' `
  'C:\atelier\mains-v01.blend' --background --python-exit-code 1 `
  --python 'C:\atelier\exporter_anatomie.py' -- --out 'C:\atelier\mains-retouche.glb'
```

L’exporteur sélectionne les pièces anatomiques, remet les morphs au repos,
conserve `Pigment` dans `COLOR_0`, retire le décalage du studio et exclut lumières
et caméra. Il ne réécrit pas la source `.blend` et refuse d’écraser une sortie.
Remplacer ensuite le GLB concerné dans `assets/` après sauvegarde, lancer
`npm run test:anatomie`, puis revoir les portraits et les emotes dans Electron.
Le test visuel est `--selftest --personnage --anatomie --out=C:\atelier\revue`.

Le générateur `tools/blender/creer_anatomie.py` reconstruit la proposition initiale
dans un dossier neuf ; il ne doit pas servir à réexporter une sculpture retouchée.
Les anciens personnages complets dans `art/lao-d/` et `art/collegues/` restent
des propositions séparées, conservées sans écrasement.

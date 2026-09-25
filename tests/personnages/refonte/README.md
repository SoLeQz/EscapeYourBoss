# Contrôle du personnage — 24 septembre 2026

Comparer `avant/corps.jpg` à `apres/corps.jpg`, puis `face.jpg`, `profil.jpg`
et `dos.jpg`. Le décor d'atelier, les lumières, le cadrage et l'exposition sont
identiques. Ce sont des captures Electron/Three.js, sans retouche d'image.

Les autres vues contrôlent les flexions : `accroupi.jpg`, `assis.jpg`,
`salut.jpg`, `marche.jpg`. `clignement.jpg` montre la paupière à fermeture complète.
`variantes.jpg` présente un collègue en chemise et le directeur.

Reproduction dans une copie Windows de l'application, avec un profil temporaire :

```text
EscapeYourBoss.exe --selftest --gameplay --personnage --out=C:\Temp\Personnage
```

`en-jeu/rapport.json` : parcours de 21 étapes (travail, diversion, départs des
étages 5 et 6, huit emotes échantillonnées sur 90 images, sortie et transition).
Zéro échec et aucune erreur JavaScript non gérée. Les avertissements du compilateur
ANGLE sont conservés. La dernière correction d'occlusion des paupières est vérifiée
par `refonte-paupieres.log` et la capture d'atelier finale.

Les tests Node inclus dans `npm run test:personnages` vérifient l'orientation réelle
des surfaces et l'occlusion de la pupille par la paupière, les couches de vêtements,
l'appui des pieds et la hauteur de perception sur cinq positions accroupies.
Le personnage complet reste sous le budget de 44 appels (41 mesurés, 31 018 triangles).

Ces captures ne constituent pas un benchmark de fréquence d'images. La construction
procédurale conserve des limites en sculpture faciale, variété de coiffures et
plis de vêtements dans les poses extrêmes.

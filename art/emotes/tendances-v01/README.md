# Emotes Blender — 67 et Passinho do Jamal

Ces deux animations sont utilisées par la version **1.5.0** du jeu normal :
maintenir `T`, choisir **5 — 67** ou **6 — Passinho do Jamal**, puis relâcher.
Les quatre emotes précédentes restent disponibles. La roue et le 67 restent silencieux ;
la danse n° 6 (Ela Ké Leitada, v02) joue sa musique. Marcher ou s’accroupir interrompt le geste avec le fondu habituel.

- [Ouvrir 67-v01.blend](67-v01.blend) — 4,8 secondes.
- [Ouvrir passinho-jamal-v01.blend](passinho-jamal-v01.blend) — 6,4 secondes. **Archivée** : le jeu utilise la [v02 calée sur la musique](../tendances-v02/README.md).
- [Références et contexte des mèmes](REFERENCES.md).
- [Vidéos et captures du jeu](../../../tests/tendances/apercu.html).

## Modifier l’animation

Les fichiers contiennent la géométrie actuelle du joueur, son squelette de
vêtements, ses têtes/mains Blender et des **Actions avec courbes Bézier**.
Les matériaux de studio sont simplifiés ; le jeu applique ses matières habituelles.
Ouvrir le fichier dans Blender 5.2, puis lancer la timeline avec Espace.

Dans l’Outliner, choisir un contrôleur `CTRL_*` : `CTRL_armL`, `CTRL_elbowR`,
`CTRL_mainL`, `CTRL_root`, etc. Ces objets pilotent les mêmes articulations que
le jeu ; les contraintes du rig de déformation suivent leurs transformations.
Modifier leurs rotations dans le Graph Editor ou insérer une clé après une
rotation dans la vue 3D. Les courbes de rotation sont en quaternions : conserver
le mode de rotation des contrôleurs et les quatre composantes des clés.

L’objet **Expressions** pilote les clés `mainL_Ouvert`, `mainR_Ouvert`, `Poing`,
`Index`, les paupières, le regard et la bouche. Les drivers déplacent les vrais
sommets des doigts et des paupières pendant la lecture dans Blender.

La hauteur du bassin a été cuite à 60 images/s pour conserver les appuis au sol.
Après une retouche des jambes, vérifier aussi la courbe verticale de `CTRL_root`
et le sol de contrôle. Ne pas supprimer les propriétés `emote_controle` ni les
propriétés de scène `emote_id` et `emote_duree`.

## Réexporter une retouche

`tools/blender/exporter_emotes.py` lit les courbes **du fichier ouvert**. Il ne
reconstruit pas la chorégraphie et refuse d’écraser un dossier existant.
Exemple PowerShell, chemins à adapter :

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' `
  'C:\atelier\67-v01.blend' --background --python-exit-code 1 `
  --python 'C:\atelier\exporter_emotes.py' -- --out 'C:\atelier\67-retouche'
```

Le dossier produit contient un JSON inspectable et un module JS contenant
**uniquement les échantillons des courbes**, à 60 Hz. Copier le JS sous le nom
`assets/emote-67-v01.js` ou `assets/emote-passinho-jamal-v01.js`, et conserver le
JSON/source retouchés dans ce dossier. Le code du jeu se limite à interpoler ces
échantillons et à les mélanger avec le retour au repos : les deux chorégraphies
ne sont pas redessinées en JavaScript.

Puis exécuter `npm run test:tendances` et revoir le mouvement dans le jeu avec
`--selftest --personnage --tendances --out=C:\atelier\revue`.

Pour reconstruire la proposition initiale dans un nouveau dossier :
`preparer_atelier_emotes.mjs` exporte le joueur courant pour le studio ;
`creer_emotes_tendances.py` construit et anime les contrôleurs **dans Blender**,
cuit les contacts, sauvegarde les `.blend` et appelle l’exporteur.
Cette reconstruction remplace les choix artistiques : ne pas l’utiliser pour
réexporter un fichier retouché à la main.

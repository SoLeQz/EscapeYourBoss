# Revue des personnages Blender 1.4.0

Ouvrir [la galerie](apercu.html) : portraits avant/après, mains, profils,
variantes et quatre vidéos d’emotes. Les captures proviennent de l’exécutable
habituel `C:\Users\nicol\EscapeYourBoss\EscapeYourBoss.exe`, en profil de test
isolé de la progression utilisateur.

```sh
npm run test:anatomie
npm run build:win
```

Après copie du build sur Windows :

```powershell
.\EscapeYourBoss.exe --selftest --personnage --anatomie --out=C:\atelier\anatomie
.\EscapeYourBoss.exe --selftest --gameplay --out=C:\atelier\gameplay
```

`--rapide` omet seulement l’enregistrement des vidéos. La revue vérifie l’emploi
des cinq GLB par le joueur et les PNJ des six niveaux, puis capture les modèles
avec la même caméra et le même éclairage. La référence ancienne est au repos
neutre ; le modèle courant utilise la pose animée réelle du joueur.

Les tests Node chargent aussi les exports réels avant de contrôler le gameplay,
les animations et les ressources. Ils vérifient la fermeture des paupières par
lancer de rayon, le pliage des doigts, les pigments, l’indépendance des poses entre
personnages, le raccord du poignet, les appuis et les limites de rendu.
Les avertissements du compilateur de shaders Windows sont conservés dans les
rapports ; ils ne sont pas comptés comme des erreurs JavaScript. Aucun gain de
FPS n’est revendiqué.

Sources : [anatomie-v01](../../art/personnages/anatomie-v01/README.md).

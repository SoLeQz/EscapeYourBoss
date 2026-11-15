# Coiffures v03

Les quatre têtes v02 (`../anatomie-v02`), recoiffées par `tools/blender/recoiffer.py`.
Le visage, les yeux, les lunettes et le chignon sont ceux de la v02 ; seuls les
cheveux changent. `planche.png` montre les quatre profils.

```sh
blender --background ../anatomie-v02/tete-employe-v02.blend --python-exit-code 1 \
  --python tools/blender/recoiffer.py -- --profil employe --out DOSSIER_NEUF
```

Profils : `employe`, `direction`, `chignon`, `securite`. Le script refuse d'écraser
une coiffure existante. Chaque coiffure porte la clé de forme `Chapeau` (cheveux
aplatis à 5 mm), que le jeu active sous un couvre-chef du vestiaire.
Les GLB du jeu sont les `tete-*-v03.glb` de `assets/`, copies exactes de ceux-ci.

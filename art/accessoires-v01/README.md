# Accessoires Blender v01 — décor interactif et secrets des étages

Onze accessoires modélisés dans Blender pour la 1.9.0, chacun avec sa règle de jeu
(`src/interactifs.js`) : canard de débogage (collection), distributeur (diversion à
retardement), disjoncteur (lumière coupée), carton-cachette, aspirateur robot, nacelle
du laveur de vitres (sortie), toboggan d'évacuation (sortie secrète), étagère pivotante,
hamac, bouton rouge et borne d'arcade de la salle de sieste clandestine.

- Source : [`accessoires-v01.blend`](accessoires-v01.blend) — script
  [`tools/blender/creer_accessoires.py`](../../tools/blender/creer_accessoires.py).
- Export : [`accessoires-v01.glb`](accessoires-v01.glb), copié tel quel dans `assets/`.
- Planche : [`planche-accessoires.png`](planche-accessoires.png) · [`rapport.json`](rapport.json).

Contrat (partagé avec le [mobilier v02](../mobilier-v02/)) : propriétés `acc_id`,
`acc_role` et `acc_pivot` pour les parties animées (manette, trappe, bouton, porte,
yeux du carton) ; matériaux `ACC_peint`, `ACC_verni` et `ACC_lumiere` à couleurs de
sommet, ou matières du niveau (`ACC_carton`, `ACC_boisFonce`, `ACC_verre`…).
Chargeur : `src/accessoires-blender.js`.

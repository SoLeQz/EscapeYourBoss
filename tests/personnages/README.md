# Vérification des personnages, sans navigateur

`body.js` et `characters.js` tournent sous Node en une seconde. Le hook de
`resolveur.mjs` fait la correspondance que l'import map d'`index.html` fait
dans le navigateur (`three` et `three/addons/` vers `vendor/`), et
`dom-bouchon.mjs` rend juste assez de `<canvas>` pour que `materials.js`
s'importe.

```bash
npm run test:personnages   # géométrie, skinning, assemblage, animation
npm run test:appels        # un appel de dessin par ligne, avec son matériau

# où finit la main pendant une emote, à trois instants de la pose
node --import ./tests/personnages/resolveur.mjs \
     tests/personnages/pose-emote.mjs takeL 0.4,0.55,0.7
```

`verifier.mjs` contrôle, pour chaque surface : aucun NaN en position ni en
normale, indices dans les bornes, poids de skinning qui somment à 1 sur deux os
valides. Puis il assemble un Lao D complet, vérifie que les parties pilotées
par `player.js`, `npc.js` et `emotes.js` existent, joue 300 images de
`animerVisage`, et vérifie que les paupières et le regard sont **encore dans la
scène** — c'est ce dernier point qui attrape le cas où `fusionnerParPivot`
absorbe une pièce animée, un bug invisible au démarrage et qui ne se manifeste
que par un visage figé.

`appels-de-dessin.mjs` sert à surveiller le budget : le jeu est limité par les
appels de rendu (PROJECT_STATE §5.1), donc ajouter un maillage à un personnage
se paie huit fois à l'étage 6.

`pose-emote.mjs` répond à une question qu'on croit pouvoir trancher à l'œil :
où atterrit la main ? Les angles d'épaule et de coude se composent en XYZ, et
l'estimation se trompe facilement de vingt centimètres — c'est ce qui a fait
rater le L deux fois (PROJECT_STATE §5.14). Le script applique la pose à
plusieurs instants et donne la position du poignet et la boîte de la main, avec
le repère du front en regard.

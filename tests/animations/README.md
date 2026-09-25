# Animations de Lao D — quatre emotes

[Ouvrir la galerie vidéo](apercu.html). Les vidéos WebM sont lisibles localement,
sans service en ligne. [Déplacements et transitions](captures/locomotion.webm).

| Emote | Séquence | Durée | Vidéo |
|---|---|---:|---|
| Démission | Préparation, salut du poignet, révérence tenue, redressement | 3,6 s | [Voir](captures/tchao.webm) |
| Encore un mail | Regard, main au front, yeux fermés, relâchement | 3,8 s | [Voir](captures/arrogance.webm) |
| Réunion KO | Somnolence, affaissement, sursaut, contrôle des alentours | 4,4 s | [Voir](captures/moulin.webm) |
| Take the L | Préparation, L tenu, quatre pas alternés, récupération | 4,2 s | [Voir](captures/takeL.webm) |

Disco, La prime, Agent secret et Erreur 404 sont retirées de la roue. Les quatre
choix restants sont accessibles par la souris et les touches 1–4. Le centre et
Échap annulent. Les chiffres des anciennes cases ne lancent plus d'autre emote.
Les gestes et la roue restent silencieux ; les réactions visuelles des collègues
sont conservées.

## Réalisation

`src/emotes.js` contient les poses clés en secondes, interpolées par une courbe
quintique, avec préparation, accent, maintien et retour. Poignets, doigts, tête,
regard, paupières et bouche accompagnent le mouvement du corps. Les indices de
la roue ne sont pas stockés dans la sauvegarde ; les identifiants conservés
restent `tchao`, `arrogance`, `moulin`, `takeL`.

`Player` amortit aussi les changements d'allure. L'entrée et la sortie du poste
mélangent désormais les rotations des bras, mains et tête au lieu de les imposer
d'un coup. La respiration suit le temps d'animation, sans saut lié à l'horloge
murale. Le regard oisif ne concurrence plus le jeu d'acteur.

Marcher ou s'accroupir fige le clip coupé et efface sa contribution sur 180 ms ;
les entrées de déplacement sont traitées dès la première image. Le bassin suit
le point le plus bas des semelles pour éviter l'enfoncement des chaussures.
Les points sont extraits une fois à la construction, puis réutilisés. Cette
correction verticale ne constitue pas un verrouillage horizontal des pieds et
ne remplace pas une animation de locomotion capturée ou une IK complète.

## Vérifications

- `npm run test:animations` : quatre scènes et leurs fins, 72 interruptions à
  30/60/144 Hz, semelles contrôlées sur leur vraie géométrie, marche/course et
  déplacement accroupi, retour du poste, réinitialisation et indices invalides.
- Suites gameplay, confort, personnages et transitions réussies. Logs ciblés
  dans `validation/`. Aucun ajout de maillage ou d'appel de rendu au personnage.
- Atelier réel `--selftest --personnage --animations` : 12 étapes réussies,
  17 captures JPEG, cinq vidéos WebM, aucune erreur JavaScript ou d'étape.
  [Rapport](captures/rapport.json). Les avertissements de shaders du pilote sont
  conservés. Ce studio isolé n'est pas une mesure FPS de la partie complète.
- Le parcours gameplay du paquet final réussit 17 étapes sans erreur ; son rapport est
  archivé sous `gameplay/`. Les profils de test sont séparés des sauvegardes réelles.

## Modèle Blender

Les nouvelles animations sont actives sur le **joueur procédural de la partie
normale**. Les comparaisons `*-blender.jpg` transfèrent les 16 os du corps vers le
GLB Lao D v03 pour examiner les poses. Cela ne remplace pas l'intégration finale :
les doigts et les expressions de ce GLB ne sont pas encore pilotés, et ses poids
aux poses extrêmes demandent encore des retouches. Aucune source `.blend`
retouchée par l'utilisateur n'est régénérée ni écrasée par cette passe.

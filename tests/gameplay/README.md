# Vérification du gameplay

`npm run test:gameplay` vérifie les règles sur la géométrie réelle et les poses
échantillonnées, avec le DOM de texture bouchonné. Il ne juge pas les pixels.
Les tests de confort, personnages, environnement et ressources complètent ce contrôle.

Revue dans la distribution Windows copiée sur le disque C :

```text
EscapeYourBoss.exe --selftest --gameplay --out=C:\Temp\EscapeGameplay
EscapeYourBoss.exe --selftest --transitions --out=C:\Temp\EscapeTransitions
EscapeYourBoss.exe --selftest --transitions --transition-suites --out=C:\Temp\EscapeSpeedrun
```

Les trois utilisent un profil temporaire, sans modifier la progression réelle.
Le premier fait avancer la simulation manuellement et laisse le rendu Windows
actif. Il teste le silence des alertes/emotes, l’annulation de la roue, le travail,
la diversion, les menaces hors champ, les départs, les animations puis une sortie.
Les caméras frontales des captures d’emotes sont réservées à la revue. Le guide,
les menaces et la roue sont aussi capturés avec la caméra jouable.

Les autres suivent toutes les sorties et transitions de campagne/speedrun,
contrôlent les ressources, le premier déplacement qui termine le briefing, les
commandes numériques, le guide facultatif et une erreur de compilation injectée.
`TEST_CHARGEMENT_INJECTE` dans le dernier rapport est donc attendu.

Résultats enregistrés dans `validation/`, revue visuelle dans `captures/`.
La mesure de départ porte sur 30 s de briefing puis 8 s en jeu ; elle ne constitue
pas un test exhaustif de toutes les phases aléatoires des rondes. Aucun gain de FPS
n’est déduit de ces essais.


## Protection aux postes libres

`EscapeYourBoss.exe --selftest --gameplay --travail --out=C:\Temp\EscapeTravail`
valide la règle de 12 secondes : deux observateurs à moins de 2 m, dont le boss
en chasse, restent calmes pendant le travail. Le test vérifie les cônes 3D et
ceux de la mini-carte, le HUD, la mémoire des soupçons, la pause, le crédit cumulé,
l’avertissement à 3 s, l’expiration, le refus d’un poste épuisé et le restart.
La caméra rapprochée sert à contrôler le siège et les deux observateurs ; leurs
positions et routines sont maîtrisées dans ce scénario pour garantir qu’ils
regardent vraiment le joueur.

Rapport : `validation/travail.json`. Les rapports `gameplay.json`, `campagne.json`
et `speedrun.json` restent les références historiques de la passe précédente.

# Transitions et ressources graphiques

`npm run test:transitions` vérifie la destruction des ressources propres aux PNJ
et aux bulles, en préservant le joueur, les autres PNJ et les caches partagés.
Il vérifie aussi que deux étages ne partagent pas leurs portes d’ascenseur.

Validation réelle sous Windows, depuis une copie sur le disque Windows :

```text
EscapeYourBoss.exe --selftest --transitions --endurance-transitions --out=C:\rapport-campagnes
EscapeYourBoss.exe --selftest --transitions --transition-suites --out=C:\rapport-suites
```

Ces modes emploient un profil de sauvegarde temporaire et conservent la vsync
normale. Les raccourcis de déplacement du harnais téléportent le joueur aux
objectifs puis à la sortie ; le ramassage, l’attente de sortie et le bouton
« Étage suivant » passent par le vrai chemin de jeu. Les PNJ restent rendus,
mais leur gain de suspicion est neutralisé pour isoler le changement de niveau.

La première commande enchaîne trois campagnes (18 étages) et impose des bornes
aux nombres de ressources graphiques. La seconde parcourt le speedrun complet,
vérifie que le nombre de lumières reste constant au ramassage, injecte une erreur
de préparation graphique et vérifie « Réessayer ». L’erreur de console marquée
`TEST_CHARGEMENT_INJECTE` est attendue dans ce dernier scénario.

La capture finale, les résultats et le témoin avant correction sont conservés
sous `validation/`. Les durées dépendent du GPU et du cache de shaders : le test
vérifie aussi la continuité du rendu, les erreurs, la mémoire et les états du jeu.

# Livraison Blender et quatre emotes — 1.1.0

- [Comparer le décor](apercu.html).
- [Sources Blender et retouches](../../../art/decor/meridien-v01/README.md).
- [Roue à quatre choix, copie installée](installation-gameplay/02-roue.jpg).
- [Rapport de la revue des six niveaux](captures/rapport.json) : 19 étapes réussies.
- [Rapport gameplay de la copie installée](installation-gameplay/rapport.json) : 17 étapes réussies.
- [Rapport décor de la copie installée](installation-decor/rapport.json) : 13 étapes réussies.

Les parcours Windows utilisent une sauvegarde temporaire. Le test `--decor`
fige la simulation pour comparer les cadrages ; ses timings ne constituent pas
un benchmark de fluidité en partie. Les avertissements du compilateur ANGLE sont
conservés dans les rapports, sans erreur JavaScript.

Les contrôles Node réimportent les vrais GLB : collisions, dimensions, budgets,
trémie ouverte, porte animée et ressources préservées au changement de niveau.
Logs : `validation/`. Les vérifications des animations et du gameplay ont également
réussi lors de cette livraison.

Le journal natif du dernier test décor signale à la fermeture
`GPU state invalid after WaitForGetOffsetInRange`. Le processus rend le code 0 ;
les captures et les 13 contrôles sont terminés, sans erreur de page. Ce message
est conservé dans `validation/escape-installed-decor.log`.

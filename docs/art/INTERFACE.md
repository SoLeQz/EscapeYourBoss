# Interface — « Méridien Connect »

Les menus et le HUD ne sont plus une interface de jeu posée par-dessus l'immeuble :
ce sont **les logiciels et les objets de l'immeuble lui-même**. Le portail d'accueil
est l'intranet de l'agence Méridien, la pause est un statut d'absence, l'échec est
une invitation à un « point rapide », la fin d'étage un ticket de pointeuse, la
mini-carte le plan d'évacuation, les touches un post-it.

Fichiers : `index.html` (structure et pictogrammes), `interface.css` (système),
`machine-a-sous.css`, `src/intranet.js` (contenu d'ambiance), `src/menu.js`,
`src/ui.js`, `src/minimap.js`, `src/characters.js` (étiquettes dans la scène).

## Trois voix

Chaque élément appartient à **une** voix. C'est la règle qui décide de sa forme.

| Voix | Ce qu'elle raconte | Matières | Où |
|---|---|---|---|
| **L'intranet Méridien** | L'entreprise : bureaucratique, passive-agressive, sûre d'elle | papier, pétrole, codes de formulaire, tampons encreurs, lignes pointillées | portail, applications, fiches, notifications, convocation, statut d'absence |
| **La signalétique de l'immeuble** | La seule chose qui t'encourage à partir | vert « sortie de secours », pictogrammes, afficheur d'ascenseur ambre, plan d'évacuation | logo, action principale, chargement, mini-carte, sortie en cours |
| **Le feutre de Lao D** | Le joueur, qui annote et détourne | feutre rouge, surligneur jaune, post-it | survol et focus, notes manuscrites, pense-bête |

Conséquence directe : **le seul bouton éclairé en vert est toujours celui qui fait
avancer vers la sortie** (« Prendre la fuite », « Reprendre la fuite », « Étage
suivant », « Décliner et réessayer »). Tout le reste est du papier ou de l'encre.

## Jetons

| Rôle | Valeur | Usage |
|---|---|---|
| `--papier` / `--papier-clair` | `#efe9dc` / `#f8f5ee` | documents, fiches, applications |
| `--encre` | `#1b2627` | texte sur papier, bordures |
| `--petrole` / `--petrole-fonce` | `#234b49` / `#15302e` | en-têtes de l'intranet (couleur de marque Méridien, déjà dans le décor) |
| `--sortie` / `--sortie-fonce` | `#14a052` / `#0b6e36` | action principale, « discret », sorties |
| `--alerte` | `#d9412b` | feutre rouge, directeur, danger, « observé » |
| `--surligneur` | `#f5e65b` | survol, focus, sélection |
| `--ambre` | `#ffb43a` | afficheurs (horloge, ascenseur, étages) |
| `--ocre` | `#d7a24d` | marque Méridien, codes de formulaire |

Typographies — polices présentes sur toute installation de Windows 10/11 (le jeu
n'existe qu'en exécutable Windows ; aucune police téléchargée) :

- **Bahnschrift** (condensée, capitales) : la signalétique et les titres. C'est une
  DIN, la police des panneaux.
- **Segoe UI** : le texte courant, pour la lisibilité.
- **Consolas** : les chiffres des machines — horloges, codes, chronos, montants.
- **Ink Free** : le feutre. Réservé aux annotations, jamais à une information vitale.

Formes : angles vifs (0 à 3 px), papier qui porte une ombre, tampons tournés de
quelques degrés, bords de ticket dentelés. Pas de verre dépoli, pas de pilules,
pas de dégradés décoratifs (la seule lueur est celle des panneaux lumineux).

## Composants

| Composant | Voix | Description |
|---|---|---|
| `.logo-sortie` | signalétique | bloc de sortie de secours : boîtier blanc, face verte, personnage à cravate (`#p-fuite`), néon qui grésille deux fois toutes les 11 s |
| `.menu-btn` | intranet + feutre | ligne d'un index imprimé : numéro, intitulé en capitales, note ; au survol, un coup de surligneur la traverse |
| `.menu-btn.primaire`, `.bouton-sortie` | signalétique | la porte de sortie : vert, flèche qui avance au survol |
| `.bouton-papier` | intranet | contour encre, surligneur au survol |
| `.tampon`, `.dossier-tampon` | intranet | tampon encreur (double filet, léger angle, multiplication) ; arrivée « frappée » sur la convocation et le ticket |
| `.badge-employe` | intranet | badge collaborateur : ouvre le vestiaire, affiche l'intitulé de la tenue et les étages accessibles |
| `.notif`, `#toast` | intranet | notification interne ; types `alerte` (⚠ Alerte collaborateur), `succes`, `trouvaille` (objet trouvé à l'accueil) |
| `#prompt` | intranet | ruban d'étiqueteuse Dymo |
| `.postit` | feutre | pense-bête des commandes |
| `.plan-evacuation` | signalétique | mini-carte : fond papier, murs à l'encre, sorties en carrés verts, « vous êtes ici » rouge |
| `.afficheur` | signalétique | afficheur d'ascenseur ambre : l'étage de destination au chargement |
| pictogrammes `#p-*` | signalétique | 36 pictogrammes au trait, dans le style des panneaux de sécurité, dessinés dans `index.html` |

États : survol et focus clavier = surligneur (même traitement, la souris et le
clavier se valent) ; appui = enfoncement de 1–2 px ; désactivé = intitulé barré au
feutre rouge et mention « accès refusé par la sécurité » ; sélection = contour vert.

Mouvement : les documents se posent (glissement de 22 px, 0,34 s), les tampons se
frappent, les notifications arrivent de la droite, le surligneur s'étale en
0,2 s. L'option « Caméra stable » et `prefers-reduced-motion` coupent tout.

## Écran par écran

| Écran | Avant | Maintenant |
|---|---|---|
| Accueil | pile de boutons arrondis centrée | portail Méridien Connect : sortie de secours lumineuse, index des applications, badge, fil de notifications, indicateurs de performance ; horloge bloquée à **17:59** (la fin de journée est toujours dans une minute) |
| Choix d'étage | grille de cartes | tableau des étages : boutons d'ascenseur ambrés, fiche du service survolé (slogan, réplique locale, sorties connues, record) |
| Options + commandes | deux listes | Service informatique, ticket IT-0042 « en attente depuis 1998 », onglets, cases à cocher en vert |
| Carnet | cartes sans style | Bruits de couloir : dossier kraft, fiches, canards dessinés, tampons « constaté / à vérifier » |
| Multijoueur | formulaire | Départ groupé : réserver une salle, chercher une réunion, liste des participants |
| Vestiaire | panneau sombre | Service du dress code, formulaire V-04 |
| Pause | carte « Pause » | statut « Absent », réponse automatique tirée au hasard |
| Échec | carte rouge | invitation Outlook « Point rapide (5 min) », acceptée d'office, durée réelle estimée, tampon REPÉRÉ |
| Fin d'étage | carte verte | ticket de pointeuse : heure de sortie, lignes pointillées, tampon « PARTI · S » |
| Chargement | titre et jauge | afficheur d'ascenseur qui descend vers l'étage, astuce RH |
| HUD | panneaux sombres identiques | agenda de l'étage (couleur du service), « Risque de “juste 5 minutes” » à états nommés (Discret, Doute, Observé, Repéré, Protégé), suivi bien-être « obligatoire », liste « À faire avant de partir », parcours d'intégration, plan d'évacuation, pense-bête |
| Scène 3D | textes blancs cernés | noms en ruban Dymo, « ? » dans un rond jaune, « ! » dans un triangle d'avertissement, répliques en messages de messagerie interne |

## L'humour

Règle : **l'humour entoure l'information, il ne la remplace jamais.** Chaque
bouton garde un intitulé clair et une note qui dit exactement ce qu'il fait
(« Prendre la fuite — Campagne · du 23e au 2e étage »). Les blagues vivent dans
les éléments secondaires : notifications, indicateurs, codes de formulaire,
réponses automatiques, pieds de page. Tout ce texte est dans `src/intranet.js` et
testé (`npm run test:interface`). Les indicateurs utilisent la vraie progression :
« Étages quittés à l'heure 3/10 », « Heures sup' non déclarées » qui défilent
tant qu'on reste sur le portail.

## La borne « Juste 5 minutes »

La borne d'arcade de la salle de sieste fait tourner une machine à sous. Son
ergonomie reprend celle des jeux du studio **Hacksaw Gaming** ; son art, ses noms
et sa monnaie appartiennent au jeu (studio fictif : *Massicot Gaming*).

| Convention Hacksaw | Ici |
|---|---|
| Écran d'accueil : logo, fiches de fonctionnalités, « cliquer pour continuer », « ne plus afficher » | identique |
| Barre basse sombre : menu, son, solde, mise ±, gain | identique (solde et mise en tickets restaurant) |
| Gros bouton rond blanc, rappuyer pour arrêter les rouleaux | identique, barre d'espace comprise |
| Tours rapides (éclair) et lancement automatique (10 à ∞, arrêt au bonus) | identique |
| Achat de bonus à gauche des rouleaux, fiches à prix × mise, confirmation oui/non | Pause café 100×, Super pause café 400× |
| Anticipation quand deux symboles bonus sont tombés | rouleaux suivants ralentis et cerclés de jaune |
| Lignes affichées toutes ensemble puis une par une avec leur montant | identique |
| Paliers de célébration avec compteur | Gros gain (15×), Méga gain (50×), Gain épique (100×), Gain max (5 000×) |
| Tours gratuits : écran d'annonce, compteur, total final | identique ; les canards restent **scotchés** sur la vitre |
| Menu : table des gains en montants réels, règles et lignes, réglages, historique | identique |
| (propre au jeu) sortie | Échap, E ou « Quitter la borne » (toujours cliquable, même sur l'accueil) : un tour ou un bonus en cours est réglé instantanément, gains versés |

Mathématiques (`src/machine-a-sous-regles.js`) : 5 × 4, 14 lignes ; réveil
« 5 min » sauvage ; canards sauvages ×2 à ×100 dont les multiplicateurs
s'additionnent sur la ligne ; 3 sorties = 10 tours gratuits, 4 ou 5 = 13 tours avec
multiplicateurs qui gagnent +1 par tour ; plafond 5 000×. Mesuré sur 10 millions de
tours : **96,4 %** de redistribution, un tour gagnant sur 3,7, une Pause café tous
les 354 tours ; achats 95,1 % et 96,1 %. Monnaie fictive, rien ne s'achète ni ne se
retire ; l'« avance sur salaire » (+500 TR) est remboursable « sur ta prochaine
augmentation ».

## Vérifier sans lancer le jeu

- `npm run test:interface` : contenu de l'intranet, identifiants et pictogrammes,
  **chaque classe produite par le code a un style**, règles et redistribution de la
  machine.
- `tools/apercu/` : banc d'aperçu. `node tools/apercu/banc.mjs` sert le jeu avec
  une cale à la place du pont Electron ; `tools/apercu/capturer.sh <scénario>
  sortie.png` le photographie avec Edge sans fenêtre (scénarios dans `cale.js` :
  menu, niveaux, options, secrets, pause, echec, suite, roue, arcade…). Une capture
  à la fois.
- Sous Windows : `EscapeYourBoss.exe --selftest --interface --out=DOSSIER` ouvre et
  photographie tous les écrans, puis joue à la borne (tour, célébration, table des
  gains, achat d'une Pause café jusqu'au bout).

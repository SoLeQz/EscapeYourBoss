# Coopération de 2 à 4 joueurs

À partir de la **1.10.0**, un joueur héberge et jusqu’à trois invités rejoignent.
Tous doivent utiliser la même version. Le ZIP Windows contient le jeu complet :
chaque personne l’extrait et lance `EscapeYourBoss.exe`.

## Former le groupe

1. Hôte : **Multijoueur → Héberger une partie**.
2. Invités : **Rechercher une partie**, puis choisir le salon, ou saisir l’IP de
   l’hôte dans **Rejoindre**. Le salon indique les noms et le nombre de joueurs sur quatre.
3. L’hôte choisit l’étage et lance une fois le groupe réuni. Le départ attend que
   chaque joueur ait chargé. Les dix étages sont disponibles en coopération.

La découverte utilise UDP 47801 sur le réseau local, et la partie TCP 47800.
Si Windows demande une autorisation, permettre au jeu de communiquer sur le réseau privé.
À distance, un tunnel TCP déjà configuré vers `127.0.0.1:47800` peut être utilisé :
chaque invité saisit la même adresse publique, avec son port (`nom.ply.gg:12345`).
La recherche automatique ne trouve que les parties du réseau local.

## Règles communes

- Chaque joueur garde son personnage et sa tenue ; les noms apparaissent au-dessus
  des personnages et les coéquipiers figurent sur la mini-carte.
- Les collègues peuvent repérer n’importe quel joueur. Une défaite vaut pour le groupe.
- Un objectif récupéré est partagé. Secrets et canards sont enregistrés pour chacun.
- Un carton a un seul porteur ; un café profite à celui qui l’utilise. Le crédit
  d’un poste de travail reste limité, quel que soit le nombre de joueurs.
- La victoire attend **la sortie de tous**. Les premiers sortis attendent le reste
  du groupe. L’hôte choisit ensuite la suite.
- Échap ouvre un menu local, sans arrêter les autres joueurs. R ne relance qu’après
  une défaite ou une victoire, à la demande de l’hôte.
- Les nouveaux joueurs rejoignent au salon, pas pendant un étage. Un cinquième est refusé.
- Le départ d’un invité pendant un étage ramène le groupe au salon. L’hôte peut
  relancer avec les joueurs restants, ou attendre un nouvel invité.
- Le départ de l’hôte ferme la partie ; il n’y a pas de transfert automatique de l’hébergement.

## Dépannage

| Message | À vérifier |
|---|---|
| Partie complète | Quatre personnes sont déjà présentes. |
| Partie en cours | Attendre le retour au salon. |
| Versions différentes | Utiliser tous la même archive 1.10.0. |
| Aucune partie trouvée | Même réseau, isolation Wi-Fi désactivée, ou connexion directe par IP. |
| Aucune réponse | Adresse, port et autorisation réseau de l’hôte. |
| Port déjà utilisé | Fermer l’autre partie hébergée sur ce PC. |

## Validation technique

L’hôte attribue les identifiants et relaie les postures et tenues. Il simule le monde,
les collègues et les interactions partagées. Les messages d’une ancienne manche sont
ignorés. Postures à 20 Hz et état du monde à 15 Hz.

- `npm run test:multijoueur` : quatre sessions TCP, découverte UDP, identité, relais,
  destinataire individuel, cinquième joueur refusé, déconnexion et changement de version.
- `EscapeYourBoss.exe --selftest --multi --multi4 --out=DOSSIER` : quatre fenêtres
  réelles, partie à trois puis à quatre, sorties, interactions, dix départs et retour solo.
- Le parcours historique à deux reste disponible avec `--selftest --multi`.

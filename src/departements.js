import * as THREE from 'three';
import { partager } from './resources.js';

// Une identité par étape, indépendante du plan et de son orientation.
// Les volumes de circulation et les indices de danger restent communs.
export const DEPARTEMENTS = [
  { id:'rh', nom:'Relations humaines', court:'RH', etage:23, accent:0x638b78, secondaire:0xd19b80, fond:0xeee5d5, sol:0xb9b9a4, bois:0xf6dfb8, lumiere:0xffecd5,
    signature:'Jardin intérieur, casiers ouverts et petits espaces de conversation.', motif:'jardin',
    secret:'Le salarié modèle', indice:'Aux RH, le meilleur collègue ne parle jamais.',
    chute:'Le ficus est employé du mois : jamais en retard, jamais en congé. Son entretien annuel : un verre d’eau.',
    slogan:'ON CULTIVE LES TALENTS.', detail:'FICUS / EMPLOYÉ DU MOIS', ecran:'ENTRETIEN ANNUEL', replique:'Tu as cinq minutes pour parler de ton équilibre de vie ?' },
  { id:'finance', nom:'Finance & contrôle', court:'Finance', etage:22, accent:0x244c42, secondaire:0xb79b57, fond:0xe8e2cb, sol:0x797e73, bois:0xa98560, lumiere:0xffebcd,
    signature:'Coffres à molettes, dossiers alignés, laiton et longues bandes comptables.', motif:'comptes',
    secret:'Une croissance verticale', indice:'La Finance a trouvé comment redresser un graphique.',
    chute:'Le bénéfice plonge de 98 %. Le conseil recommande de retourner l’écran. Prévision désormais excellente.',
    slogan:'CHAQUE MINUTE COMPTE.', detail:'BÉNÉFICE : −98 %', ecran:'BUDGET / RÉVISION 42', replique:'Tu sais combien coûte une minute de pause ?' },
  { id:'support', nom:'Relations clients', court:'Support clients', etage:19, accent:0x486b95, secondaire:0xe4b05e, fond:0xe3eaf0, sol:0xa8b6c6, bois:0xe0d2b4, lumiere:0xe4efff,
    signature:'Stations à casques, alcôves acoustiques et rangement du matériel de prêt.', motif:'ondes',
    secret:'Votre appel est précieux', indice:'Au support, un client attend depuis un certain temps.',
    chute:'Ticket ouvert en 1998. Le client est toujours premier dans la file. Le robot lui souhaite une excellente journée.',
    slogan:'NOUS SOMMES À VOTRE ÉCOUTE.', detail:'TEMPS D’ATTENTE : 28 ANS', ecran:'FILE D’ATTENTE / 001', replique:'Tu peux reprendre cet appel ? Il est presque terminé.' },
  { id:'studio', nom:'Studio produit', court:'Studio produit', etage:18, accent:0x496d82, secondaire:0xe67f53, fond:0xece7dc, sol:0xb7b9b4, bois:0xf0d5ae, lumiere:0xeef4ff,
    signature:'Maquettes, échantillons, panneaux à croquis et repères de plans techniques.', motif:'plans',
    secret:'Le prototype définitif', indice:'Le Studio a inventé la chaise qui empêche de rester.',
    chute:'Chaise sans assise, version finale_finale_8. Test utilisateur : « On ne voit plus le temps assis passer. »',
    slogan:'PENSER. DESSINER. RECOMMENCER.', detail:'CHAISE / ASSISE EN OPTION', ecran:'PROTOTYPE / V8 FINALE', replique:'Juste une dernière version avant de partir.' },
  { id:'archives', nom:'Archives & mémoire', court:'Archives', etage:12, accent:0x826345, secondaire:0xc6ae76, fond:0xe5d6b8, sol:0xb6a283, bois:0xb58e64, lumiere:0xffe7bd,
    signature:'Rayonnages denses, boîtes numérotées, fiches et traces de classement au sol.', motif:'index',
    secret:'Le dossier introuvable', indice:'Les Archives classent même ce qui a disparu.',
    chute:'Dossier 404 : formulaire de recherche du formulaire de recherche. La dernière page demande de recommencer page 1.',
    slogan:'RIEN NE SE PERD. TOUT SE CLASSE.', detail:'404 / DOSSIER INTROUVABLE', ecran:'INDEX / CONSULTATION', replique:'Tu as bien remis le dossier dans le dossier ?' },
  { id:'juridique', nom:'Juridique & conformité', court:'Juridique', etage:11, accent:0x624f72, secondaire:0xb9976b, fond:0xe9e0d7, sol:0xa79cac, bois:0xbda080, lumiere:0xf2e8df,
    signature:'Casiers scellés, contrats reliés, tampons et panneaux de procédure.', motif:'sceaux',
    secret:'La clause de sortie', indice:'Au Juridique, même partir nécessite une signature.',
    chute:'Article 18 : toute sortie est autorisée sous réserve d’avoir obtenu l’autorisation de demander une autorisation.',
    slogan:'SOUS RÉSERVE DE VALIDATION.', detail:'ARTICLE 18 / NE PAS PARTIR', ecran:'CONTRAT / PAGE 1 SUR 900', replique:'Tu as signé le formulaire autorisant ta signature ?' },
  { id:'marketing', nom:'Marketing & communication', court:'Marketing', etage:9, accent:0x8e4764, secondaire:0xf2bd4d, fond:0xf1dfcc, sol:0xc7abb9, bois:0xf3d9b4, lumiere:0xffdfd0,
    signature:'Mur de campagne XXL, objets promotionnels, moodboards et îlots de création.', motif:'campagne',
    secret:'Le produit de trop', indice:'Au Marketing, le rien a enfin son packaging.',
    chute:'NOUVEAU : RIEN™, maintenant en format familial. 0 % de contenu, 100 % de marge. La boîte est vendue séparément.',
    slogan:'RIEN™ / TOUT SIMPLEMENT.', detail:'LE RIEN. FORMAT FAMILIAL.', ecran:'CAMPAGNE / RIEN™', replique:'On peut rendre ton départ un peu plus viral ?' },
  { id:'logistique', nom:'Services généraux', court:'Services généraux', etage:7, accent:0x56635d, secondaire:0xe2a64e, fond:0xe9dfc8, sol:0xbdb7a6, bois:0xcbb48e, lumiere:0xffebd5,
    signature:'Armoires à outils, caisses de transport et marquages de manutention.', motif:'transit',
    secret:'Livraison prioritaire', indice:'Les Services généraux prennent soin des objets fragiles.',
    chute:'Caisse FRAGILE : contient le moral de l’équipe. Ne pas secouer. Livraison reportée à lundi depuis trois ans.',
    slogan:'ÇA DÉMÉNAGE. ENFIN, PRESQUE.', detail:'FRAGILE / MORAL DE L’ÉQUIPE', ecran:'EXPÉDITION / EN RETARD', replique:'Tu peux porter ça avant de filer ? C’est presque léger.' },
  { id:'it', nom:'Systèmes & informatique', court:'IT / Tech', etage:4, accent:0x355769, secondaire:0x69d8c4, fond:0xd9e3e6, sol:0x829aa5, bois:0xb9c9c4, lumiere:0xc9e7ff,
    signature:'Baies réseau ventilées, doubles écrans, patchs et câblage sous les plateaux.', motif:'reseau',
    secret:'Tout est vert', indice:'À l’IT, le serveur de production ne signale plus aucune erreur.',
    chute:'Les voyants rouges ont été débranchés. Disponibilité : 100 %. Le serveur fonctionne uniquement quand quelqu’un le regarde.',
    slogan:'CHEZ MOI, ÇA MARCHE.', detail:'PRODUCTION / TOUT EST VERT', ecran:'git status / 999 CONFLITS', replique:'Ne pars pas, ça fonctionne seulement quand tu es là.' },
  { id:'direction', nom:'Présidence & direction', court:'Direction', etage:2, accent:0x343e4b, secondaire:0xc9ac69, fond:0xeae1ce, sol:0x92938e, bois:0xa68a6f, lumiere:0xffe7c4,
    signature:'Galerie de trophées, vitrines de prestige, symétrie et bois sombre.', motif:'galerie',
    secret:'Un départ stratégique', indice:'La Direction possède un trophée très difficile à obtenir.',
    chute:'Trophée « Parti à l’heure », édition 1998. Aucun lauréat. Le socle attend encore son héros.',
    slogan:'UNE VISION. CINQ MINUTES.', detail:'PARTI À L’HEURE / 0 LAURÉAT', ecran:'STRATÉGIE / HORIZON 2098', replique:'Partir ? Tu manques de vision à long terme.' },
];
for(const [i,d] of DEPARTEMENTS.entries())d.decouverte=['nord','direction','sud','nord','nord','sud','reunion','sud','nord','direction'][i];
export function pointDecouverte(niveau,plan){
 const lieu=departementDuNiveau(niveau).decouverte;
 if(lieu==='direction')return {x:15.4,z:plan.bossSalle==='nord'?-15.0:15.0};
 if(lieu==='reunion')return {x:15.5,z:plan.bossSalle==='nord'?15.0:-15.0};
 return {x:lieu==='sud'?-9:-11.5,z:lieu==='sud'?15.0:-15.0};
}
export const departementDuNiveau = n => DEPARTEMENTS[(n.id - 1) % DEPARTEMENTS.length];
const caches = new WeakMap();
export function materiauxDepartement(base, niveau) {
  const d=departementDuNiveau(niveau);
  let themes=caches.get(base);if(!themes){themes=new Map();caches.set(base,themes);}
  if(themes.has(d.id))return themes.get(d.id);
  const m={...base};
  for(const [cle,couleur] of Object.entries({mur:d.fond,murAccent:d.accent,cloison:d.accent,tissuChaise:d.accent,tissuCanape:d.secondaire,moquette:d.sol,bois:d.bois})){
    m[cle]=partager(base[cle].clone());m[cle].color.setHex(couleur);m[cle].name='Département:'+d.id+':'+cle;
  }
  // La moquette Blender contient sa teinte verte d'origine. On en conserve le
  // grain et les normales, mais seule sa luminance module la couleur du service.
  // Un seul programme partagé, aucune nouvelle image par palette.
  m.moquette.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
  float grainMoquette = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = diffuse * clamp(0.35 + 2.0 * grainMoquette, 0.35, 0.9);
#endif`);
  };
  m.moquette.customProgramCacheKey=()=> 'meridien-moquette-neutre-v1';
  m.deptAccent=partager(new THREE.MeshStandardMaterial({color:d.accent,roughness:.85}));
  m.deptSecondaire=partager(new THREE.MeshStandardMaterial({color:d.secondaire,roughness:.7}));
  themes.set(d.id,m);return m;
}

import { uvBoiteMetrique } from './uv.js';
import { partager } from './resources.js';
import * as THREE from 'three';
import { HUMOUR } from './humour.js';
import { poserDecorBlender } from './decor-blender.js';

// Habillage de l'agence Méridien. Graphisme dessiné à la main sur un atlas
// commun : les panneaux partagent un matériau et peuvent être fusionnés.
// Aucun texte généré aléatoirement, aucun chargement réseau.
const INK = '#234b49', PAPER = '#eee9db', GOLD = '#d7a24d', RUST = '#ad563c';
const CELLS = ['marque', 'cinq', 'pause', 'planning', 'direction', 'reunion',
  'hall', 'impression', 'cafe', 'annonces', 'projet', 'carnet', '23', '19', '12', 'service', 'escaliers', 'evacuation', ...HUMOUR.map(h=>h.id)];
const ATLAS_H = Math.ceil(CELLS.length / 4) * 256;
let assets;

function creerAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = ATLAS_H;
  const c = cv.getContext('2d');
  CELLS.forEach((id, index) => {
    c.save(); c.translate((index % 4) * 512, Math.floor(index / 4) * 256);
    c.fillStyle = PAPER; c.fillRect(0, 0, 512, 256);
    const rect = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
    const text = (str, x, y, size, color = INK, bold = false) => {
      c.fillStyle = color; c.font = `${bold ? '700' : '400'} ${size}px Arial, sans-serif`;
      c.textAlign = 'left'; c.fillText(str, x, y);
    };
    const line = (x, y, w, color = INK) => rect(x, y, w, 2, color);
    const circle = (x, y, r, color) => {
      c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    };
    const footer = label => { line(28, 218, 456); text(label, 28, 242, 11); };
    const humour = HUMOUR.find(h=>h.id===id);
    if (humour) {
      const clair=id==='humour-cafe', encre=clair?PAPER:INK;
      if(clair)rect(0,0,512,256,INK);
      rect(0,0,512,9,GOLD);
      text('LA VIE CHEZ MÉRIDIEN',28,39,13,encre);
      // 512 px pour deux lignes courtes : pas de texte débordant de l'atlas.
      const taille=humour.titre.length>20?31:35;
      text(humour.titre,28,91,taille,encre,true);
      line(28,113,456,GOLD);
      humour.lignes.forEach((ligne,i)=>text(ligne,28,152+i*34,22,encre,i===0));
      line(28,218,456,encre);text(humour.pied,28,242,11,encre);
    } else if (id === 'marque') {
      rect(0, 0, 512, 256, INK);
      circle(417, 110, 61, GOLD); rect(350, 110, 140, 80, INK);
      for (let i = 0; i < 5; i++) rect(362, 124 + i * 10, 111, 2, GOLD);
      text('MÉRIDIEN', 26, 108, 51, PAPER, true);
      text('CONSEIL  /  STRATÉGIE  /  CAFÉ', 29, 148, 14, PAPER);
      line(29, 198, 285, PAPER); text('TOUJOURS UN PEU PLUS LOIN.', 29, 229, 12, PAPER);
    } else if (id === 'cinq') {
      rect(0, 0, 512, 256, GOLD);
      text('ENCORE', 28, 62, 44, INK, true);
      text('5 MINUTES.', 28, 120, 52, INK, true);
      text('Depuis 18 heures.', 30, 177, 22);
      footer('MÉRIDIEN  /  CULTURE D’ENTREPRISE  /  N° 01');
    } else if (id === 'pause') {
      rect(0, 0, 512, 256, RUST);
      text('LA PAUSE.', 26, 84, 58, PAPER, true);
      text('Le seul point sans compte rendu.', 29, 126, 20, PAPER);
      for (let i = 0; i < 6; i++) rect(28 + i * 78, 174, 60, 4, PAPER);
      text('MÉRIDIEN  /  ESPACE COMMUN', 29, 237, 13, PAPER);
    } else if (id === 'planning') {
      text('CETTE SEMAINE', 24, 30, 19, INK, true);
      text('MARDI  /  POINT ÉQUIPE', 293, 29, 12);
      const cols = [['À FAIRE', 'Relecture budget', 'Retour client', 'Encore une V2'],
        ['EN COURS', 'Présentation', 'Dernières retouches'], ['VALIDÉ', 'Pause déjeuner']];
      cols.forEach((col, i) => {
        const x = 24 + i * 162;
        rect(x, 46, 148, 28, INK); text(col[0], x + 9, 65, 13, PAPER, true);
        col.slice(1).forEach((task, j) => {
          rect(x + 3, 84 + j * 44, 140, 36, i === 2 ? '#c6d1b6' : '#e3c678');
          text(task, x + 9, 107 + j * 44, 12);
        });
      });
      text('NE PAS EFFACER  —  MÊME SI C’EST FINI', 24, 242, 11, RUST);
    } else if (['direction', 'reunion', 'hall', 'impression'].includes(id)) {
      const labels = { direction: ['01', 'DIRECTION', 'Merci de frapper. Même en urgence.'],
        reunion: ['02', 'RÉUNION', 'Salle Horizon · 6 personnes'],
        hall: ['→', 'ASCENSEURS', 'HALL  /  ACCÈS PRINCIPAL'],
        impression: ['03', 'REPROGRAPHIE', 'Bourrage papier depuis lundi.'] };
      const [n, title, sub] = labels[id];
      rect(0, 0, 110, 256, INK); text(n, 16, 151, 68, GOLD, true);
      text('MÉRIDIEN', 133, 43, 13); text(title, 133, 125, 30, INK, true);
      line(135, 156, 350); text(sub, 135, 188, 14);
    } else if (id === 'cafe') {
      rect(0, 0, 512, 256, INK);
      text('CAFÉ / 18:00', 27, 54, 34, PAPER, true);
      [['ESPRESSO', 'COURT'], ['RÉUNION', 'LONGUE'], ['TA TASSE', 'À RINCER']].forEach((r, i) => {
        text(r[0], 29, 107 + i * 43, 20, PAPER); text(r[1], 314, 107 + i * 43, 16, GOLD);
        line(29, 118 + i * 43, 450, '#4e6e65');
      });
    } else if (id === 'annonces') {
      rect(0, 0, 512, 256, '#bb9470');
      text('LA VIE DU BUREAU', 25, 30, 18, INK, true);
      [[24, 52, 'MARDI', 'Quelqu’un a vu', 'mon chargeur ?'],
        [184, 46, 'VENDREDI', 'Pot de départ.', 'Si on arrive à partir.'],
        [343, 59, 'RAPPEL', 'Le lave-vaisselle', 'est propre.']].forEach(([x, y, a, b, d]) => {
        rect(x, y, 145, 149, PAPER); circle(x + 72, y + 7, 4, RUST);
        text(a, x + 12, y + 40, 14, INK, true); line(x + 12, y + 54, 120);
        text(b, x + 12, y + 87, 12); text(d, x + 12, y + 108, 12);
      });
      text('Merci de retirer vos annonces après le départ.', 25, 237, 13);
    } else if (id === 'projet') {
      rect(0, 0, 512, 256, INK); text('HORIZON / Q3', 27, 42, 22, PAPER, true);
      [64, 95, 73, 121, 147, 168].forEach((h, i) => rect(33 + i * 52, 226 - h, 32, h, i === 5 ? GOLD : '#6e9990'));
      text('+ 5 min', 347, 137, 31, GOLD, true); text('vs. dernier point', 347, 164, 13, PAPER);
    } else if (id === 'carnet') {
      text('MÉRIDIEN / NOTES', 28, 35, 18, INK, true);
      for (let y = 65; y < 230; y += 26) line(26, y, 460, '#bdc6bb');
      text('18:00 — partir.', 38, 118, 30, RUST);
    } else if (id === 'escaliers') {
      rect(0,0,512,256,INK);text('↓',32,175,135,PAPER,true);
      text('ESCALIERS',152,113,39,PAPER,true);text('ACCÈS ÉTAGES',155,157,20,GOLD);
      text('PORTE COUPE-FEU · NE PAS BLOQUER',30,235,13,PAPER);
    } else if (id === 'evacuation') {
      text('PLAN D’ÉVACUATION',25,40,26,INK,true);
      for(const [x,y,w,h] of [[35,70,300,8],[35,70,8,123],[35,185,300,8],[327,70,8,123],[142,70,8,88]])rect(x,y,w,h,INK);
      rect(183,135,150,7,GOLD);rect(183,99,7,43,GOLD);text('↓',348,154,58,INK,true);
      text('VOUS ÊTES ICI  →  SORTIE',26,234,17,INK,true);
    } else if (id === 'service') {
      text('MAINTENANCE', 26, 54, 30, INK, true); text('HORS SERVICE', 26, 137, 43, RUST, true);
      footer('MERCI D’EMPRUNTER L’AUTRE SORTIE');
    } else {
      rect(0, 0, 512, 256, INK); text(id, 25, 191, 180, PAPER, true);
      text('MÉRIDIEN', 281, 58, 22, GOLD, true); text('ÉTAGE', 283, 104, 18, PAPER);
      line(282, 125, 200, GOLD); text('BUREAUX', 283, 164, 18, PAPER); text('BONNE SOIRÉE.', 283, 206, 14, PAPER);
    }
    c.restore();
  });
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.85, envMapIntensity: 0.5 });
}

function bibliothequeMateriaux() {
  if (assets) return assets;
  const std = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
  assets = { atlas: creerAtlas(), petrole: std(INK), ocre: std(GOLD), terre: std(RUST),
    ivoire: std(PAPER), sombre: std('#253536'), solPause: std('#726652'), terreau: std('#302b24'),
    feuille: new THREE.MeshStandardMaterial({ color: '#42674b', roughness: 0.83, side: THREE.DoubleSide }) };
  for (const mat of Object.values(assets)) partager(mat);
  return assets;
}

export function panneauGraphique(parent, id, w, h, x, y, z, yaw = 0) {
  const index = CELLS.indexOf(id);
  if (index < 0) throw new Error(`Panneau inconnu : ${id}`);
  const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv;
  const col = index % 4, row = Math.floor(index / 4);
  // Deux pixels de garde : le filtrage ne prélève pas la cellule voisine.
  for (let i = 0; i < uv.count; i++) uv.setXY(i,
    (col * 512 + 2 + uv.getX(i) * 508) / 2048,
    1 - (row * 256 + 2 + (1 - uv.getY(i)) * 252) / ATLAS_H);
  const m = new THREE.Mesh(geo, bibliothequeMateriaux().atlas);
  m.position.set(x, y, z); m.rotation.y = yaw; m.receiveShadow = true;
  parent.add(m); return m;
}

export function habillerBureau(root, MAT, plan, niveau) {
  const A = bibliothequeMateriaux();
  const box = (w, h, d, mat, x, y, z, cast = true) => {
    const m = new THREE.Mesh(uvBoiteMetrique(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; root.add(m); return m;
  };
  const sign = (...args) => panneauGraphique(root, ...args);
  const sol = (w, d, mat, x, z, y = 0.017) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; root.add(m);
  };
  // Soubassements et rails donnent une échelle au grand volume sans
  // ajouter d'obstacle ni réduire la hauteur effective des couvertures.
  for (const z of [-15.98, 15.98]) {
    const w=z>0?23.6:31.6, x=z>0?-8:-4;
    box(w, 1.05, 0.018, A.petrole, x, 0.525, z, false);
    box(w, 0.035, 0.035, MAT.bois, x, 1.067, z, false);
  }
  const ouvertures = [...plan.portesOS].sort((a, b) => a[0] - b[0]);
  let debut = -16;
  for (const [a, b] of [...ouvertures, [16, 16]]) {
    if (a > debut) {
      for (const x of [3.69, 4.31]) {
        box(0.018, 1.05, a - debut, A.petrole, x, 0.525, (debut + a) / 2, false);
        box(0.025, 0.035, a - debut, MAT.bois, x, 1.067, (debut + a) / 2, false);
      }
    }
    debut = b;
  }
  // Le hall se lit par une bordure, et par les joints métriques du terrazzo.
  for (const x of [4.48, 11.55]) sol(0.055, 27.6, A.ocre, x, -1.8, 0.019);
  for (let z = -16; z < 12; z += 2) sol(7.0, 0.012, A.solPause, 8, z, 0.018);
  for (const x of [6, 8, 10]) sol(0.012, 27.7, A.solPause, x, -1.85, 0.018);

  // Un grand repère éditorial au sud, plutôt que des affiches minuscules
  // dispersées sur tous les murs.
  box(4.3, 2.2, 0.03, A.sombre, -9, 2.15, 15.97, false);
  sign('marque', 4.2, 2.1, -9, 2.15, 15.945, Math.PI);
  sign('cinq', 2.5, 1.25, -1.3, 2.15, 15.94, Math.PI);
  // Panneaux acoustiques en retrait derrière le tableau de travail.
  for (let i = 0; i < 9; i++) box(0.055, 2.7, 0.055, MAT.bois, -13.8 + i * 0.6, 1.77, -15.94, false);
  if(niveau.id!==2) sign('impression', 2.0, 1.0, -17.25, 2.18, -15.86);
  sign('cinq', 1.75, 0.875, 0, 2.2, -15.86);
  // La position de cette annonce est choisie dans un pan plein du mur.
  const pans = []; debut = -16;
  for (const [a, b] of [...ouvertures, [16, 16]]) { if (a - debut > 4) pans.push([debut, a]); debut = b; }
  const grand = pans.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
  if (grand) sign('annonces', 2.4, 1.2, 3.675, 2.14, (grand[0] + grand[1]) / 2, -Math.PI / 2);
  for (const [a, b] of ouvertures) sign('hall', 1.5, 0.75, 3.65, 3.02, (a + b) / 2, -Math.PI / 2);

  // Accueil en chêne à l'est : le centre reste dégagé pour l'ascenseur.
  for (const [za, zb] of [[-3.7, -0.4], [3.6, 5.75]]) {
    box(0.025, 3.35, zb - za, A.sombre, 19.95, 1.7, (za + zb) / 2, false);
    for (let z = za; z < zb; z += 0.16) box(0.055, 3.25, 0.06, MAT.bois, 19.92, 1.7, z, false);
  }
  const etage = niveau.titre.match(/Étage (\d+)/)?.[1] || '23';
  sign(etage, 1.6, 0.8, 19.85, 2.1, 4.73, -Math.PI / 2);
  if(niveau.id!==1) sign('cafe', 1.5, 0.75, 19.85, 2.3, -2.15, -Math.PI / 2);
  if (!niveau.sorties.includes('elevator')) sign('service', 1.1, 0.55, 19.61, 1.8, 1.5, -Math.PI / 2);

  // Plaques de porte posées sur la vitre, au-dessus des regards.
  // Les quelques bandes fines restent transparentes pour la lecture du PNJ.
  for (const [id, intervalle] of [['direction', plan.porteBoss], ['reunion', plan.porteReunion]]) {
    const z = (intervalle[0] + intervalle[1]) / 2;
    sign(id, 1.5, 0.75, 11.78, 2.95, z, -Math.PI / 2);
  }
  for (const [a, b, porte] of [[-16, -4, plan.bossSalle === 'nord' ? plan.porteBoss : plan.porteReunion],
    [6, 16, plan.bossSalle === 'nord' ? plan.porteReunion : plan.porteBoss]]) {
    for (const [za, zb] of [[a, porte[0]], [porte[1], b]]) {
      for (const y of [1.18, 1.23]) box(0.012, 0.018, zb - za, A.ivoire, 11.69, y, (za + zb) / 2, false);
    }
  }
  const bossZ = plan.bossSalle === 'nord' ? -15.96 : 15.96;
  const yaw = bossZ < 0 ? 0 : Math.PI;
  box(5.3, 2.45, 0.025, A.petrole, 15.4, 1.85, bossZ, false);
  sign('marque', 3.5, 1.75, 15.4, 2.02, bossZ - Math.sign(bossZ) * 0.022, yaw);
  const reunionZ = plan.bossSalle === 'nord' ? 15.94 : -15.94;
  if(![4,6].includes(niveau.id)) sign('planning', 2.8, 1.4, 15.5, 2.0, reunionZ, reunionZ < 0 ? 0 : Math.PI);

  // Îlots textiles sous les coins détente ; aucun objet dans les rondes.
  if (plan.detente) {
    const [x, z] = plan.detente.table;
    const centreX = Math.max(-18.1, Math.min(1.65, x - 0.15));
    const centreZ = Math.min(14.3, z - 0.2);
    sol(3.2, 3.2, A.solPause, centreX, centreZ);
    sol(3.02, 3.02, A.terre, centreX, centreZ, 0.018);
  }
  sign('pause', 2.1, 1.05, -17.4, 2.25, 15.94, Math.PI);

  const h=HUMOUR[niveau.id-1];
  if(h){
    const objet=poserDecorBlender(h.modele,root,MAT,h.pose);
    // Les accessoires restent sur un meuble ou derrière la barrière condamnée.
    // Les panneaux de table ont un dos et deux petits pieds, pas un plan flottant.
    for(const [w,d,x,y,z,yaw] of h.panneaux){
      sign(h.id,w,d,x,y,z,yaw);
      if((niveau.id===4||niveau.id===6)&&d<.8){
        const support=new THREE.Group();support.position.set(x,y,z);support.rotation.y=yaw;root.add(support);
        const dos=new THREE.Mesh(uvBoiteMetrique(new THREE.BoxGeometry(w+.025,d+.025,.018)),MAT.murAccent);
        dos.position.z=-.012;dos.castShadow=true;dos.receiveShadow=true;support.add(dos);
        const hauteur=Math.max(.02,y-d/2-.795);
        for(const sx of [-w*.3,w*.3]){
          const pied=new THREE.Mesh(uvBoiteMetrique(new THREE.BoxGeometry(.028,hauteur,.028)),MAT.aluSombre);
          pied.position.set(sx,-d/2-hauteur/2,-.015);pied.castShadow=true;pied.receiveShadow=true;support.add(pied);
        }
      }
    }
    root.updateMatrixWorld(true);
    const limites=objet?new THREE.Box3().setFromObject(objet):null;
    root.userData.humour={id:h.id,modele:h.modele,charge:!!objet,panneaux:h.panneaux.length,
      limites:limites?{min:limites.min.toArray(),max:limites.max.toArray()}:null};
  }



}

// Contenu de bureau choisi par rôle, toujours dans l'emprise du plateau.
export function personnaliserPoste(parent, MAT, type) {
  const A = bibliothequeMateriaux();
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const box = (w, h, d, mat, x, y, z) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  if (type === 'code') {
    box(0.25, 0.15, 0.018, MAT.boisFonce, 0.8, 0.86, -0.42).rotation.y = -0.14;
    panneauGraphique(parent, 'marque', 0.22, 0.11, 0.8, 0.86, -0.408, -0.14);
    add(new THREE.CylinderGeometry(0.04, 0.033, 0.19, 12), A.petrole, -0.82, 0.87, 0.26);
  } else if (type === 'sheet') {
    for (let i = 0; i < 3; i++) {
      box(0.07, 0.29 + (i % 2) * 0.025, 0.24, i === 1 ? A.ocre : A.petrole, 0.68 + i * 0.09, 0.92, -0.36);
      box(0.041, 0.06, 0.003, MAT.papier, 0.68 + i * 0.09, 0.97, -0.238);
    }
  } else {
    const carnet = panneauGraphique(parent, 'carnet', 0.35, 0.22, 0.67, 0.814, 0.20);
    carnet.rotation.set(-Math.PI / 2, 0, -0.18);
    for (let i = 0; i < 3; i++) box(0.018, 0.014, 0.13, i === 1 ? A.terre : A.petrole, 0.98 + i * 0.03, 0.787, 0.25);
  }
}

// Feuille de ficus effilée, bombée sur sa nervure ; plus de rectangles verts.
let feuilleGeo;
export function feuilleFicus() {
  if (feuilleGeo) return feuilleGeo;
  const points = [], uv = [], indices = [], n = 10;
  for (let j = 0; j <= n; j++) {
    const t = j / n, largeur = Math.sin(Math.PI * t) * 0.115;
    for (let i = 0; i < 3; i++) {
      points.push((i - 1) * largeur, t * 0.6, Math.sin(t * Math.PI) * (i === 1 ? 0.05 : 0) + t * t * 0.13);
      uv.push(i / 2, t);
    }
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < 2; i++) {
    const a = j * 3 + i; indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
  }
  feuilleGeo = new THREE.BufferGeometry();
  feuilleGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  feuilleGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  feuilleGeo.setIndex(indices); feuilleGeo.computeVertexNormals(); partager(feuilleGeo);
  return feuilleGeo;
}

let villeMats;
export function construireVille(root) {
  if (!villeMats) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
    const c = cv.getContext('2d'); c.fillStyle = '#68747b'; c.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 6; x++) {
      c.fillStyle = (x * 7 + y * 11) % 19 < 3 ? '#c5aa78' : '#465964';
      c.fillRect(6 + x * 21, 3 + y * 16, 12, 10);
    }
    const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
    villeMats = ['#99a5a4', '#a8aa9e', '#777f89'].map(color => new THREE.MeshBasicMaterial({ map, color, fog: true }));
    villeMats.push(new THREE.MeshBasicMaterial({ color: '#6d777c', fog: true }));
    villeMats.forEach(partager);
  }
  const ville = new THREE.Group(); ville.name = 'quartier-meridien'; root.add(ville);
  // Silhouettes composées en trois plans, avec retraits et toitures. Le pied
  // est 45 m sous l'étage, pour ne pas donner l'impression d'être au RDC.
  const immeubles = [[-42, -37, 13, 44, 15], [-47, -17, 15, 56, 12], [-39, 5, 10, 37, 14],
    [-51, 24, 17, 62, 16], [-42, 47, 13, 48, 12], [-73, -54, 19, 67, 18],
    [-78, -28, 17, 46, 17], [-83, 0, 18, 72, 20], [-74, 48, 19, 57, 18],
    [-107, -58, 19, 73, 22], [-115, 23, 21, 65, 20], [-105, 66, 21, 76, 23]];
  immeubles.forEach(([x, z, w, h, d], i) => {
    const bat = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), villeMats[i % 3]);
    bat.position.set(x, -45 + h / 2, z); ville.add(bat);
    const toit = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 2, d * 0.65), villeMats[3]);
    toit.position.set(x, -44 + h, z); ville.add(toit);
  });
}

import { POIGNET_REPOS } from './emotes.js';
import { partager } from './resources.js';
import { anatomieBlenderDisponible, poserAnatomieBlender } from './anatomie-blender.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCharacterMaterials } from './materials.js';
import { construireSquelette, lierSquelette, geometriesCorps, geometrieAccessoire,
         nomsOs, surfaceTete, surfaceBuste, surfaceBassin,
         BOUTON_VESTE_LOCAL } from './body.js';

// ============================================================
//  Personnages
//
//  Construits face à +Z pour rester cohérents avec rotation.y.
//  Proportions d'un adulte de 1,78 m : hanche à 0,85, épaules à
//  1,40, yeux à 1,63. Les noms de parties sont ceux que pilotent
//  player.js et npc.js — ne pas les renommer.
//
//  Toute pièce rigide posée sur le corps (boutons, poche, yeux,
//  sourcils, bouche, badge) est placée à partir de la SURFACE réelle
//  du maillage (surfaceTete / surfaceBuste). Avant, ces cotes étaient
//  fixes et la moitié des détails du torse se trouvait sous la
//  chemise : c'est ce qui donnait un buste sans matière.
// ============================================================

export const HEIGHT = {
  hip: 0.85,
  eye: 1.63,
  chest: 1.30,
  seatOffset: -0.37,
};

let M = null;
export function initCharacterMaterials() {
  if (!M) {
    M = buildCharacterMaterials();
    for (const mat of Object.values(M)) partager(mat);
  }
  return M;
}

const cache = new Map();
// `seg` : subdivisions de l'arrondi. 2 pour les pièces qu'on regarde de
// près, 1 pour les phalanges — une boîte arrondie de 1 cm n'a pas
// besoin de 300 triangles, et il y en a vingt par personnage.
function rb(w, h, d, r = 0.02, seg = 2) {
  const rad = Math.min(r, w / 2.05, h / 2.05, d / 2.05);
  const k = `${w},${h},${d},${rad},${seg}`;
  let g = cache.get(k);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, seg, rad); cache.set(k, partager(g)); }
  return g;
}
const sphere = (r, a = 12, b = 9) => new THREE.SphereGeometry(r, a, b);

// Petites courbes de couture et montures : fusionnées par matériau ensuite.
function courbeGeo(points, rayon = .0015, segments = 20) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, rayon, 5, false);
}

// Une forme de soulier, talon distinct, cou-de-pied et bout aminci.
// La face inférieure de la semelle est à -HEIGHT.hip + .81 = -.04 sur l'os cheville.
function soulierGeo(semelle = false) {
  const cle = semelle ? 'semelle-coupee' : 'richelieu';
  if (cache.has(cle)) return cache.get(cle);
  const profils = [[-.096,.012,.065],[-.088,.040,.089],[-.055,.048,.123],[-.015,.049,.132],
    [.030,.053,.112],[.085,.054,.071],[.130,.049,.048],[.162,.034,.038],[.177,.008,.023]];
  const pos=[],uv=[],idx=[],N=24;
  for (let i=0;i<profils.length;i++) {
    const [z,w,h]=profils[i];
    for(let j=0;j<=N;j++) {
      const a=j/N*Math.PI*2, sa=Math.sin(a),ca=Math.cos(a);
      const x=Math.sign(sa)*Math.pow(Math.abs(sa),.8)*(w+(semelle?.003:0));
      const hauteur=semelle?.018:h;
      const y=(semelle?-.040:-.023)+hauteur*(1+Math.sign(ca)*Math.pow(Math.abs(ca),semelle?.22:.85))/2;
      pos.push(x,y,z);uv.push(j/N*.16,(z+.096)*3);
      if(i<profils.length-1 && j<N){const q=i*(N+1)+j;idx.push(q,q+N+1,q+1,q+1,q+N+1,q+N+2);}
    }
  }
  // Fermer le talon et le bout : pas d'ouverture laissant voir le sol.
  for (const i of [0,profils.length-1]) {
    const base=i*(N+1), centre=pos.length/3;
    const haut=pos[base*3+1],bas=pos[(base+N/2)*3+1];
    pos.push(0,(haut+bas)/2,profils[i][0]);uv.push(.5,.5);
    for(let j=0;j<N;j++) {
      if(i===0)idx.push(centre,base+j,base+j+1);
      else idx.push(centre,base+j+1,base+j);
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
  cache.set(cle,partager(geo));return geo;
}

// Surface en amande réellement bornée par les paupières, au lieu de globes ronds.
function oeilGeo(cote, paupiere = false) {
  const pos=[],ferme=[],uv=[],idx=[],K=20;
  const ex=.036*cote,ey=.006,w=.019,h=.0078;
  if (!paupiere) {
    const centre=surfaceTete(ey,ex).p;centre[2]+=.004;
    pos.push(...centre);uv.push(.5,.5);
    for(let i=0;i<=K;i++) {
      const a=i/K*Math.PI*2,x=ex+w*Math.cos(a),y=ey+h*Math.sin(a)+.035*(x-ex)*cote;
      const p=surfaceTete(y,x).p;p[2]+=.0012;pos.push(...p);uv.push((Math.cos(a)+1)/2,(Math.sin(a)+1)/2);
      if(i<K)idx.push(0,i+1,i+2);
    }
  } else {
    for(let i=0;i<=K;i++) {
      const u=i/K,x=ex+(u*2-1)*w,arc=Math.sin(Math.PI*u)**.75;
      for(let j=0;j<=3;j++) {
        const v=j/3,ouvert=ey+h*arc+.035*(x-ex)*cote;
        const haut=ey+.015*arc+.002;
        const y=ouvert+(haut-ouvert)*v;
        const bas=ey-h*arc+.035*(x-ex)*cote;
        const p=surfaceTete(y,x).p;p[2]+=.001+Math.sin(v*Math.PI)*.0012;
        const c=surfaceTete(bas+(haut-bas)*v,x).p;c[2]+=.001+Math.sin(v*Math.PI)*.012;
        pos.push(...p);ferme.push(...c);uv.push(u,v);
        if(i<K && j<3){const a=i*4+j;idx.push(a,a+4,a+1,a+1,a+4,a+5);}
      }
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  if(paupiere)g.morphAttributes.position=[new THREE.Float32BufferAttribute(ferme,3)];
  return g;
}

// matrices de travail pour les chaînes de phalanges
const _m = new THREE.Matrix4(), _t = new THREE.Matrix4();

export function makeCharacter(o = {}) {
  const M = initCharacterMaterials();
  const c = Object.assign({
    chemise: null, pantalon: null, cheveux: null, peau: null, veste: null,
    lunettes: false, sac: false, badge: false, chignon: false, cravate: null, carrure: 1,
  }, o);

  const anatomie=c.anatomie!==false&&anatomieBlenderDisponible();

  // Variantes de teinte sans dupliquer les textures
  const teinte = (base, hex) => {
    if (!hex) return base;
    const m = base.clone();
    m.color = new THREE.Color(hex);
    return m;
  };
  const matChemise = teinte(M.chemise, c.chemise);
  const matPantalon = teinte(M.pantalon, c.pantalon);
  const matCheveux = teinte(M.cheveux, c.cheveux);
  const matVeste = teinte(M.veste, c.veste);
  const matPeauCorps = teinte(M.peau, c.peau);
  const matPeau = matPeauCorps.clone(); matPeau.vertexColors = false;
  // sourcils un peu plus clairs que les cheveux : lus comme des poils,
  // pas comme deux barres noires
  const matSourcil = matCheveux.clone();
  matSourcil.color = matCheveux.color.clone().lerp(new THREE.Color(0x6b4a34), 0.30);

  const g = new THREE.Group();
  const parts = {};
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // pose une pièce rigide avec une matrice complète (chaînes de doigts)
  const poser = (parent, geo, mat, matrice) => {
    const m = new THREE.Mesh(geo, mat);
    matrice.decompose(m.position, m.quaternion, m.scale);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ---------------- squelette et surfaces continues ----------------
  const { os, racine } = construireSquelette();
  g.add(racine);
  parts.root = racine;
  // Les matrices monde doivent être justes AVANT de construire le
  // Skeleton : c'est de là que sortent les matrices inverses de liaison.
  g.updateMatrixWorld(true);
  const squelette = lierSquelette(os);
  const NOMS = nomsOs();
  const nomOs = (n) => os[NOMS.indexOf(n)];

  // Les noms de parties sont ceux que pilotent player.js et npc.js :
  // ce sont maintenant des os, mais l'API reste `rotation.x`.
  parts.upper = nomOs('buste');
  parts.torso = nomOs('buste');
  parts.head = nomOs('teteBase');        // piloté par le jeu et les emotes
  parts.teteMicro = nomOs('tete');       // réservé aux micro-mouvements
  parts.armL = nomOs('epauleL'); parts.elbowL = nomOs('coudeL');
  parts.armR = nomOs('epauleR'); parts.elbowR = nomOs('coudeR');
  parts.legL = nomOs('hancheL'); parts.kneeL = nomOs('genouL'); parts.footL = nomOs('chevilleL');
  parts.legR = nomOs('hancheR'); parts.kneeR = nomOs('genouR'); parts.footR = nomOs('chevilleR');

  const geos = geometriesCorps();
  const peau = (geo, mat) => {
    const s = new THREE.SkinnedMesh(geo, mat);
    s.castShadow = true; s.receiveShadow = true;
    s.frustumCulled = false;      // la boîte de liaison ne suit pas l'animation
    g.add(s);
    s.updateMatrixWorld(true);
    s.bind(squelette, s.matrixWorld);
    return s;
  };
  parts.corpsHaut = peau(c.veste ? geos.hautHabille : geos.haut, matChemise);
  parts.corpsBas = peau(geos.bas, matPantalon);
  if(!anatomie){
    parts.corpsPeau = peau(geos.peau, matPeauCorps);
    parts.corpsCheveux = peau(geos.cheveux, matCheveux);
  }
  if (c.veste) parts.corpsVeste = peau(geos.veste, matVeste);

  const buste = nomOs('buste');
  const veste = !!c.veste;
  // point sur le vêtement du dessus, en coordonnées du buste
  const dessus = (y, x, decal = 0, cote = 1) => surfaceBuste(y, x, { veste, cote, decal });
  const chemiseSurf = (y, x, decal = 0) => surfaceBuste(y, x, { veste: false, decal });

  // ---------------- chemise ----------------
  // ceinture : un anneau skinné qui suit le bassin, pas une boîte dont
  // les coins ressortent. Elle ferme le raccord chemise / pantalon même
  // quand la veste la cache.
  // pièces rigides : un seul os les porte, inutile de les skinner
  parts.ceinture = add(racine, geometrieAccessoire('ceinture'), M.ceinture, 0, 0, 0);
  if (!veste) {
    const b = surfaceBassin(0.124, 0, 0.008);
    add(buste, rb(0.046, 0.038, 0.020, 0.007), M.boucle, b.p[0], b.p[1], b.p[2]);
  }
  // Boutons sur la patte, POSÉS sur la surface. Ceux que la cravate
  // recouvre sont omis : posés au même décalage qu'elle, ils la
  // traversaient et piquaient deux points blancs en plein milieu.
  for (let i = 0; i < 5; i++) {
    const y = 0.185 + i * 0.088;
    if ((c.cravate && y > 0.32) || (veste && y < .30)) continue;
    const s = chemiseSurf(y, 0, 0.007);
    add(buste, sphere(0.0075, 8, 6), M.boutonNacre, s.p[0], s.p[1], s.p[2]).scale.z = 0.5;
  }
  // poche de poitrine, orientée selon la normale locale
  if (!veste) {
    const s = chemiseSurf(0.445, -0.095, 0.0035);
    const poche = add(buste, rb(0.085, 0.092, 0.005, 0.004), matChemise, s.p[0], s.p[1], s.p[2]);
    poche.rotation.y = Math.atan2(s.n[0], s.n[2]);
  }

  // ---------------- veste ----------------
  if (veste) {
    // bouton de fermeture, sur le bord gauche du V
    const s = dessus(BOUTON_VESTE_LOCAL + 0.006, 0.012, 0.007);
    const b = add(buste, new THREE.CylinderGeometry(0.010, 0.010, 0.005, 12), M.boutonCorne,
      s.p[0], s.p[1], s.p[2]);
    b.rotation.x = Math.PI / 2;
    // boutons de manche
    for (const cote of [-1, 1]) {
      const coude = nomOs(cote < 0 ? 'coudeL' : 'coudeR');
      for (let i = 0; i < 3; i++) {
        const bm = add(coude, new THREE.CylinderGeometry(0.006, 0.006, 0.004, 10), M.boutonCorne,
          0.041 * cote, -0.188 - i * 0.017, 0.018);
        bm.rotation.z = Math.PI / 2;
      }
    }
    for (const cote of [-1, 1]) {
      const s = dessus(.168, .118*cote, .004);
      const poche = add(buste,rb(.069,.016,.005,.002),matVeste,...s.p);
      poche.rotation.set(0,Math.atan2(s.n[0],s.n[2]),-.10*cote);
    }
    // pochette de poitrine
    const p = dessus(0.455, -0.100, 0.004);
    const poche = add(buste, rb(0.086, 0.030, 0.006, 0.004), matVeste, p.p[0], p.p[1], p.p[2]);
    poche.rotation.y = Math.atan2(p.n[0], p.n[2]);
  }

  // ---------------- cravate ----------------
  if (c.cravate) {
    const soie = M.soie.clone();
    soie.color = new THREE.Color(c.cravate);
    parts.cravate = add(buste, geometrieAccessoire('cravate'), soie, 0, 0, 0);
    const s = chemiseSurf(0.612, 0, 0.006);
    const noeud = add(buste, rb(0.027, 0.031, 0.015, 0.004), soie, s.p[0], s.p[1], s.p[2]);
    noeud.rotation.x = -0.14;
  }

  // ---------------- mains ----------------
  //
  // La paume est le prolongement du tube d'avant-bras (voir body.js).
  // Les doigts sont des chaînes de deux phalanges, légèrement repliées :
  // une main au repos n'est jamais à plat, et c'est cette courbure qui
  // supprime l'effet « moufle ».
  //
  // Les dix pièces vivent dans un GROUPE par main, que l'animation peut
  // faire rouler d'un bloc pour ouvrir ou fermer la main. Le groupe ne
  // coûte rien : fusionnerParPivot regroupe ses enfants exactement comme
  // il le faisait sur l'os, puisqu'ils partagent tous la peau.
  parts.mainL = nomOs('mainL');
  parts.mainR = nomOs('mainR');
  // Repos naturel des mains (les PNJ ne pilotent pas leurs poignets).
  parts.mainL.rotation.y = POIGNET_REPOS; parts.mainR.rotation.y = -POIGNET_REPOS;
  if(!anatomie) for (const cote of [-1, 1]) {
    const main = nomOs(cote < 0 ? 'mainL' : 'mainR');
    const doigts = new THREE.Group();
    main.add(doigts);
    parts[cote < 0 ? 'doigtsL' : 'doigtsR'] = doigts;
    const longueurs = [0.045, 0.052, 0.049, 0.039];
    for (let i = 0; i < 4; i++) {
      const dx = (-0.022 + i * 0.0142) * cote;
      const l1 = longueurs[i] * 0.55, l2 = longueurs[i] * 0.45;
      const courbe = 0.24 + i * 0.065;
      _m.makeTranslation(dx, -0.070, 0.004)
        .multiply(_t.makeRotationX(courbe))
        .multiply(_t.makeRotationZ((i - 1.5) * 0.045 * cote));
      poser(doigts, rb(0.0115, l1, 0.0125, 0.0055, 1), matPeau,
        _m.clone().multiply(_t.makeTranslation(0, -l1 / 2, 0)));
      _m.multiply(_t.makeTranslation(0, -l1, 0)).multiply(_t.makeRotationX(courbe * 1.4));
      poser(doigts, rb(0.0105, l2, 0.0115, 0.005, 1), matPeau,
        _m.clone().multiply(_t.makeTranslation(0, -l2 / 2, 0)));
    }
    // Pouce : dans SON groupe. Au repos il n'est écarté que de 0,85 rad
    // des autres doigts, soit 49° — une main, pas une équerre. Pour que
    // « Take the L » dessine vraiment une lettre, il faut pouvoir
    // l'ouvrir à angle droit, donc le tourner indépendamment.
    const pouce = new THREE.Group();
    main.add(pouce);
    parts[cote < 0 ? 'pouceL' : 'pouceR'] = pouce;
    _m.makeTranslation(-0.036 * cote, -0.040, 0.014)
      .multiply(_t.makeRotationZ(0.85 * cote))
      .multiply(_t.makeRotationX(0.55));
    poser(pouce, rb(0.014, 0.026, 0.015, 0.0065, 1), matPeau,
      _m.clone().multiply(_t.makeTranslation(0, -0.013, 0)));
    _m.multiply(_t.makeTranslation(0, -0.026, 0)).multiply(_t.makeRotationX(0.6));
    poser(pouce, rb(0.012, 0.020, 0.013, 0.0055, 1), matPeau,
      _m.clone().multiply(_t.makeTranslation(0, -0.010, 0)));
  }

  // ---------------- chaussures ----------------
  for (const cote of [-1, 1]) {
    const cheville = nomOs(cote < 0 ? 'chevilleL' : 'chevilleR');
    add(cheville, soulierGeo(), M.chaussure, 0, 0, 0);
    add(cheville, soulierGeo(true), M.semelle, 0, 0, 0);
    // Quartiers et lacets plaqués sur le cou-de-pied.
    for (const z of [-.008,.008,.024]) {
      const y=.105-(z+.008)*.5;
      add(cheville,courbeGeo([[-.025,y-.008,z],[0,y+.002,z+.006],[.025,y-.008,z]],.0018,8),M.semelle,0,0,0);
    }
  }

  // ---------------- détails du visage ----------------
  //
  // Le crâne, la mâchoire, le nez et les cheveux sont des surfaces
  // continues générées dans body.js et skinnées sur l'os `tete`. Il
  // ne reste ici que ce qui doit rester une pièce distincte : yeux,
  // sourcils, bouche, oreilles, lunettes.
  if(!anatomie){
  const head = new THREE.Group();
  nomOs('tete').add(head);
  parts.visage = head;

  // oreilles : disques aplatis, un peu en arrière de la ligne des yeux
  for (const s2 of [-1, 1]) {
    const o = add(head, sphere(0.026, 12, 10), matPeau, 0.084 * s2, -0.008, -0.012);
    o.scale.set(0.30, 1.0, 0.70);
    o.rotation.set(0.06, 0.30 * s2, -0.10 * s2);
    const lobe = add(head, sphere(0.012, 10, 8), matPeau, 0.083 * s2, -0.028, -0.006);
    lobe.scale.set(0.55, 0.8, 0.9);
    // patte de cheveux devant l'oreille
    add(head, rb(0.006, 0.024, 0.010, 0.003), matCheveux, 0.086 * s2, 0.006, 0.020);
  }

  // Yeux : globe posé à fleur de peau, iris, pupille, reflet, paupière.
  //
  // Les deux yeux bougent ENSEMBLE, donc les pièces mobiles vivent dans
  // deux groupes (le regard, les paupières) au lieu d'être animées une
  // par une. C'est ce qui permet à fusionnerParPivot de les regrouper :
  // six petits maillages animés séparément, c'est six appels de dessin
  // par personnage et par image, sur un jeu limité par les appels.
  const gRegard = new THREE.Group(); head.add(gRegard);
  const gPaup = new THREE.Group(); head.add(gPaup);
  const EY = 0.006, EX = 0.036;
  const paupieres=[];
  for (const s2 of [-1, 1]) {
    const surf = surfaceTete(EY, EX * s2);
    add(head,oeilGeo(s2),M.blancOeil,0,0,0);
    const zAvant=surf.p[2]+.005;
    const iris=add(gRegard,sphere(.0072,16,12),M.iris,EX*s2,EY,zAvant-.0016);
    iris.scale.set(1,1,.32);
    const pupille=add(gRegard,sphere(.0034,12,8),M.pupille,EX*s2,EY,zAvant+.0004);
    pupille.scale.set(1,1,.3);
    add(gRegard,sphere(.00125,8,6),M.reflet,EX*s2-.002,EY+.0022,zAvant+.0015);
    paupieres.push(oeilGeo(s2,true));
    // Bord inférieur et arcades enveloppent l'œil. La peau revient à la surface du visage.
    const bord=[],sourcil=[];
    for(let i=0;i<=12;i++) {
      const u=i/12, x=EX*s2+(u*2-1)*.019;
      const y=EY-.0078*Math.sin(Math.PI*u)**.75+.035*(x-EX*s2)*s2;
      const p=surfaceTete(y,x,.0015).p;bord.push(p);
      const bx=(.018+u*.040)*s2, by=.024+Math.sin(u*Math.PI)*.005+u*.001;
      sourcil.push(surfaceTete(by,bx,.0018).p);
    }
    add(head,courbeGeo(bord,.0013,16),matPeau,0,0,0);
    add(head,courbeGeo(sourcil,.0023,16),matSourcil,0,0,0);
  }
  const paupiereGeo=mergeGeometries(paupieres);paupieres.forEach(g=>g.dispose());
  parts.clignement=add(gPaup,paupiereGeo,matPeau,0,0,0);
  parts.regard=gRegard;parts.paupiere=gPaup;
  parts.paupiereY=0;parts.paupiereDy=0;

  // Ligne de bouche légèrement asymétrique, commissures fondues dans les joues.
  {
    const centre=surfaceTete(-.050,0,.0018).p;
    const ligne=[];
    for(let i=0;i<=12;i++) {
      const x=-.019+i/12*.038, y=-.050+.0025*(x/.019)**2+.0008*x/.019;
      const p=surfaceTete(y,x,.0018).p;ligne.push(p.map((v,k)=>v-centre[k]));
    }
    parts.bouche=add(head,courbeGeo(ligne,.00085,16),M.bouche,...centre);
    const levre=[];
    for(let i=0;i<=10;i++) { const x=-.014+i/10*.028;levre.push(surfaceTete(-.054+.002*(x/.014)**2,x,.0015).p); }
    add(head,courbeGeo(levre,.0015,14),M.levre,0,0,0);
  }

  if (c.chignon) {
    const ch = add(head, rb(0.070, 0.062, 0.058, 0.028), matCheveux, 0, 0.022, -0.100);
    ch.rotation.x = -0.2;
  }

  // Monture rectangulaire adoucie, ajustée au nez et aux tempes.
  if (c.lunettes) {
    const zV=surfaceTete(EY,EX).p[2]+.018;
    for (const cote of [-1,1]) {
      const contour=[];
      for(let i=0;i<=40;i++) {
        const a=i/40*Math.PI*2, ca=Math.cos(a),sa=Math.sin(a);
        contour.push([EX*cote+Math.sign(ca)*Math.abs(ca)**.48*.026,
          EY+.001+Math.sign(sa)*Math.abs(sa)**.58*.015,
          zV-.008*Math.max(0,ca*cote)+.014*Math.max(0,-ca*cote)]);
      }
      add(head,courbeGeo(contour,.0019,40),M.monture,0,0,0);
      add(head,courbeGeo([[.062*cote,EY+.004,zV-.009],[.084*cote,EY+.003,.028],
        [.088*cote,EY,-.014],[.087*cote,-.010,-.020]],.0018,16),M.monture,0,0,0);
    }
    add(head,courbeGeo([[-.010,EY+.006,zV+.013],[0,EY+.009,zV+.025],[.010,EY+.006,zV+.013]],.0017,12),M.monture,0,0,0);
  }

  }else{
    // La sculpture Blender porte déjà ses nuances locales (pommettes, lèvres,
    // oreilles, ongles). Le teint du personnage reste personnalisable.
    const peauBlender=matPeauCorps.clone();peauBlender.vertexColors=true;
    peauBlender.normalScale.set(.10,.10);peauBlender.specularIntensity=.32;
    const cheveuxBlender=matCheveux.clone();cheveuxBlender.vertexColors=true;
    poserAnatomieBlender(parts,c,{peau:peauBlender,cheveux:cheveuxBlender,
      blancOeil:M.blancOeil,iris:M.iris,pupille:M.pupille,reflet:M.reflet,monture:M.monture});
    g.userData.anatomieBlender=parts.anatomieBlender;
  }

  // ---------------- sac à dos ----------------
  if (c.sac) {
    const sac = new THREE.Group();
    sac.position.set(0, 0.37, veste ? -0.179 : -0.165);
    buste.add(sac);
    parts.sac = sac;
    const forme = rb(0.260, 0.345, 0.120, 0.054, 4).clone();
    const v = forme.attributes.position;
    for (let i = 0; i < v.count; i++) {
      const t = (v.getY(i) + 0.1725) / 0.345;
      v.setX(i, v.getX(i) * (1 - 0.16 * t));
      v.setZ(i, v.getZ(i) * (0.88 + 0.12 * Math.sin(t * Math.PI)));
    }
    forme.computeVertexNormals();
    add(sac, forme, M.sac, 0, 0, 0);
    add(sac, rb(0.202, 0.126, 0.028, 0.012, 2), M.sac, 0, -0.075, -0.077);
    add(sac, rb(0.200, 0.004, 0.006, 0.002, 1), M.boucle, 0, -0.018, -0.098);
    add(sac, courbeGeo([[-.026,.153,.010],[-.022,.187,.010],[.022,.187,.010],[.026,.153,.010]],.004,16), M.sangle,0,0,0);
    for(const cote of [-1,1]) add(sac,courbeGeo([[cote*.095,-.13,-.048],
      [cote*.110,.045,-.050],[cote*.083,.143,-.038]],.0017,18),M.sangle,0,0,0);
    // sangles : rubans skinnés qui épousent l'épaule et le vêtement
    parts.sangles = add(buste, geometrieAccessoire('sangles', veste), M.sangle, 0, 0, 0);
    for (const s of [-1, 1])
      add(sac, rb(0.018, 0.067, 0.018, 0.006, 1), M.sangle, 0.128 * s, -0.135, 0.045);
  }

  // ---------------- badge ----------------
  if (c.badge) {
    parts.cordon = add(buste, geometrieAccessoire('cordon', veste), M.cordon, 0, 0, 0);
    const decal = 0.012;
    const a = dessus(0.355, 0, decal);
    add(buste, rb(0.014, 0.046, 0.008, 0.004), M.cordon, a.p[0], a.p[1], a.p[2]);
    const s = dessus(0.316, 0, decal + 0.002);
    const carte = add(buste, rb(0.075, 0.108, 0.006, 0.006), M.badge, s.p[0], s.p[1], s.p[2]);
    carte.rotation.z = 0.04;
    const f = s.p[2] + 0.0035;
    add(buste, rb(0.075, 0.026, 0.002, 0.001), M.badgeBande, s.p[0], s.p[1] + 0.038, f).rotation.z = 0.04;
    add(buste, rb(0.028, 0.032, 0.002, 0.001), M.badgePhoto, s.p[0] - 0.02, s.p[1] - 0.010, f).rotation.z = 0.04;
  }

  // Les menus détails (yeux, boutons, monture, badge) ne projettent
  // rien de lisible : on les sort de la passe d'ombre, ce qui divise
  // presque par deux le nombre d'appels de dessin par personnage.
  //
  // La cravate et le cordon sont grands mais PLAQUÉS sur le torse :
  // leur ombre est invisible, et les garder dans la passe les séparait
  // en plus de leur nœud et de leur attache, qui eux en sortent — deux
  // appels de dessin pour rien.
  const plaque = new Set([parts.cravate, parts.cordon].filter(Boolean));
  g.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    o.geometry.computeBoundingSphere();
    if (plaque.has(o) || (o.geometry.boundingSphere?.radius ?? 1) < 0.055) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });

  fusionnerParPivot(g);

  // La carrure différencie les silhouettes sans changer la hauteur des yeux.
  g.scale.x = THREE.MathUtils.clamp(c.carrure, .88, 1.18);
  // Garder le rig hors userData : clone() sérialise userData en JSON.
  // Les références de meshes y dupliquaient inutilement géométries et textures.
  return { group: g, parts };
}

// Fusionne les maillages d'un même pivot partageant un matériau.
//
// Les pivots (hanche, genou, cheville, buste, tête, épaule, coude)
// doivent rester séparés puisqu'ils s'animent, mais à l'intérieur d'un
// pivot tout est rigide. Une tête passe ainsi d'une trentaine de
// maillages à une poignée.
function fusionnerParPivot(racine) {
  const pivots = [];
  // les pivots sont maintenant des os ; on ne fusionne que les pièces
  // rigides qui y sont accrochées, jamais les surfaces skinnées
  racine.traverse(o => { if (o.isGroup || o.isBone || o === racine) pivots.push(o); });

  for (const pivot of pivots) {
    const lots = new Map();
    for (const enfant of pivot.children.slice()) {
      if (!enfant.isMesh || enfant.isSkinnedMesh || enfant.morphTargetInfluences?.length) continue;
      if (!enfant.geometry?.attributes?.position) continue;
      const cle = `${enfant.material.uuid}|${enfant.castShadow ? 1 : 0}${enfant.receiveShadow ? 1 : 0}`;
      let lot = lots.get(cle);
      if (!lot) {
        lot = { material: enfant.material, cast: enfant.castShadow,
                receive: enfant.receiveShadow, geos: [], src: [] };
        lots.set(cle, lot);
      }
      enfant.updateMatrix();
      // mergeGeometries refuse de mélanger de l'indexé et du non
      // indexé (§5.9). Plutôt que de séparer les lots — ce qui laissait
      // la cravate, son nœud et les rubans en maillages distincts — on
      // déroule l'index. Ces pièces sont petites : quelques centaines
      // de sommets dupliqués contre un appel de dessin économisé.
      const src = enfant.geometry;
      const geo = src.index ? src.toNonIndexed() : src.clone();
      geo.applyMatrix4(enfant.matrix);
      for (const nom of Object.keys(geo.attributes))
        if (!['position', 'normal', 'uv', 'uv1', 'color'].includes(nom)) geo.deleteAttribute(nom);
      lot.geos.push(geo);
      lot.src.push(enfant);
    }

    for (const lot of lots.values()) {
      if (lot.geos.length < 2) { for (const gg of lot.geos) gg.dispose(); continue; }
      let merged = null;
      try { merged = mergeGeometries(lot.geos, false); } catch { merged = null; }
      for (const gg of lot.geos) gg.dispose();
      if (!merged) continue;
      const m = new THREE.Mesh(merged, lot.material);
      m.castShadow = lot.cast;
      m.receiveShadow = lot.receive;
      pivot.add(m);
      for (const o of lot.src) pivot.remove(o);
    }
  }
}

// Micro-animations de visage et de corps. Des gestes très bon marché
// qui suppriment l'impression de mannequin : le clignement, le regard
// qui dérive, la crispation quand ça tourne mal, la tête qui n'est
// jamais parfaitement immobile, et la respiration.
//
// `etat` : { tension 0..1, parle bool }
// Pivot du cou. `teteBase` est au niveau des yeux (1,63 m) : une rotation pure
// autour de ce point faisait pivoter le menton et le haut du cou vers l'avant
// pendant que le bas du cou restait sur le buste. Accroupi (tête relevée de 31°),
// le cou se cisaillait et sortait du col. La tête tourne désormais autour de la
// base du crâne, là où le cou change d'os (≈ 1,54 m).
export const COU = 0.09;
const _qCou = new THREE.Quaternion(), _vCou = new THREE.Vector3();
export function pivoterCou(parts) {
  const h = parts.head; if (!h) return;
  const repos = h.userData.reposCou || (h.userData.reposCou = h.position.clone());
  _qCou.setFromEuler(h.rotation);
  _vCou.set(0, -COU, 0);
  h.position.copy(repos).add(_vCou).sub(_vCou.applyQuaternion(_qCou));
}

export function animerVisage(parts, dt, etat = {}) {
  pivoterCou(parts);
  if (!parts.paupiere) return;
  const m = parts._visage || (parts._visage = {
    prochainCli: 1 + Math.random() * 4, cli: 0,
    prochainRegard: 2 + Math.random() * 3, regardX: 0, regardY: 0, cibleX: 0, cibleY: 0,
    t: Math.random() * 100, phase: Math.random() * 6.28,
  });
  m.t += dt;
  const tension = etat.tension || 0;

  // --- clignement : plus fréquent quand la tension monte ---
  m.prochainCli -= dt * (1 + tension * 2.2);
  if (m.prochainCli <= 0) { m.prochainCli = 1.6 + Math.random() * 4.5; m.cli = 1; }
  if (m.cli > 0) m.cli = Math.max(0, m.cli - dt * 8.5);
  const ferme = Math.sin(Math.min(1, 1 - m.cli) * Math.PI);
  // sous tension l'œil s'ouvre davantage : la paupière remonte
  parts.clignement.morphTargetInfluences[0] = ferme;

  // --- le regard dérive, il ne fixe jamais le vide ---
  m.prochainRegard -= dt;
  if (m.prochainRegard <= 0) {
    m.prochainRegard = 1.2 + Math.random() * 3.4;
    m.cibleX = (Math.random() - 0.5) * 0.0060;
    m.cibleY = (Math.random() - 0.5) * 0.0030;
  }
  const k = 1 - Math.exp(-12 * dt);
  m.regardX += (m.cibleX - m.regardX) * k;
  m.regardY += (m.cibleY - m.regardY) * k;
  parts.regard.position.x = m.regardX;
  parts.regard.position.y = m.regardY;

  // --- bouche : parle, ou reste une ligne ---
  if (parts.bouche) {
    const cible = etat.parle ? 1.6 + Math.abs(Math.sin(m.t * 14)) * 1.6 : 1;
    parts.bouche.scale.y += (cible - parts.bouche.scale.y) * (1 - Math.exp(-25 * dt));
  }

  // --- la tête n'est jamais figée : une dérive lente, sur l'os
  //     réservé aux micro-mouvements, donc sans conflit avec le jeu ---
  if (parts.teteMicro) {
    const t = m.t + m.phase, a = 1 + tension * 1.5;
    parts.teteMicro.rotation.x = (Math.sin(t * 0.7) * 0.018 + Math.sin(t * 1.9) * 0.008) * a;
    parts.teteMicro.rotation.y = (Math.sin(t * 0.45) * 0.030 + Math.sin(t * 1.3) * 0.010) * a;
    parts.teteMicro.rotation.z = Math.sin(t * 0.9 + 1) * 0.010 * a;
    if (etat.parle) parts.teteMicro.rotation.x += Math.sin(m.t * 11) * 0.02;
  }

  // --- respiration : la cage thoracique se soulève et s'ouvre ---
  if (parts.torso && etat.respire !== false) {
    const s = Math.sin((m.t + m.phase) * (2.1 + tension * 2)) * (0.25 + tension * 0.45);
    parts.torso.scale.set(1, 1 + s * 0.012, 1 + s * 0.020);
  }
}

// Pose assise : cuisses horizontales, tibias verticaux, pieds à plat.
export function setSeated(parts) {
  parts.legL.rotation.x = -1.5;
  parts.legR.rotation.x = -1.5;
  parts.kneeL.rotation.x = 1.5;
  parts.kneeR.rotation.x = 1.5;
  parts.footL.rotation.x = 0;
  parts.footR.rotation.x = 0;
  parts.armL.rotation.x = -0.5;
  parts.armR.rotation.x = -0.5;
  parts.elbowL.rotation.x = -0.95;
  parts.elbowR.rotation.x = -0.95;
}

// ------------------------------------------------------------
//  Sprites d'interface
// ------------------------------------------------------------
const spriteCache = new Map();

export function makeIconSprite(text, color = '#ffd24a', size = 1) {
  const key = text + color;
  let tex = spriteCache.get(key);
  if (!tex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.font = 'bold 96px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.strokeText(text, 64, 68);
    g.fillStyle = color;
    g.fillText(text, 64, 68);
    tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    spriteCache.set(key, partager(tex));
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: false, depthWrite: false, transparent: true, toneMapped: false,
  }));
  s.scale.set(0.5 * size, 0.5 * size, 1);
  s.renderOrder = 20;
  return s;
}

export function makeLabelSprite(text, sub = '') {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  g.textAlign = 'center';
  g.font = 'bold 50px system-ui,-apple-system,sans-serif';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.strokeText(text, 256, 56);
  g.fillStyle = '#ffffff';
  g.fillText(text, 256, 56);
  if (sub) {
    g.font = '30px system-ui,sans-serif';
    g.lineWidth = 6;
    g.strokeText(sub, 256, 100);
    g.fillStyle = '#ffd9a0';
    g.fillText(sub, 256, 100);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: false, depthWrite: false, transparent: true, opacity: 0.85, toneMapped: false,
  }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 19;
  return s;
}

export function makeBubbleSprite(text) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 160;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(255,253,245,0.96)';
  roundRect(g, 8, 8, 496, 110, 22); g.fill();
  g.beginPath(); g.moveTo(230, 116); g.lineTo(256, 152); g.lineTo(282, 116); g.fill();
  g.fillStyle = '#23262c';
  g.font = 'bold 34px system-ui,-apple-system,sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: false, depthWrite: false, transparent: true, toneMapped: false,
  }));
  s.scale.set(2.6, 0.81, 1);
  s.renderOrder = 21;
  return s;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

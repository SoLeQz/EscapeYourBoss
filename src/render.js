import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { skyTexture, SKY_SCALE } from './materials.js';

// ============================================================
//  Pipeline de rendu
//
//  HDR linéaire -> GTAO -> profondeur de champ -> bloom ->
//  tone mapping ACES -> sRGB. L'éclairage repose sur une env map
//  (IBL) : sans elle, MeshStandardMaterial n'a rien à réfléchir
//  et tout paraît en plastique mat.
// ============================================================

// Soleil rasant de fin de journée, plein ouest.
// Position du soleil, ajustée à chaque niveau (heure de la journée).
export const SUN = {
  elevationDeg: 11.5,   // assez bas pour des ombres longues, assez haut
                        // pour que le sol reçoive vraiment la lumière
  azimuthDeg: -92,
  intensite: 4.4,
  get direction() {
    const phi = THREE.MathUtils.degToRad(90 - this.elevationDeg);
    const theta = THREE.MathUtils.degToRad(this.azimuthDeg);
    return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  },
};

export function setSun(conf) {
  SUN.elevationDeg = conf.elevation;
  SUN.azimuthDeg = conf.azimut;
  SUN.intensite = conf.intensite;
}

// du plus lourd au plus léger : le repli automatique descend d'un cran
export const QUALITES = ['ultra', 'haut', 'moyen', 'bas'];

// Calibré au banc d'essai. Sur GPU intégré, chaque passe plein écran
// en half-float coûte ~7 ms : le palier « bas » se passe entièrement de
// composer et rend direct, ce qui conserve matériaux, IBL et ombres.
// pixelRatio < 1 = rendu sous-échantillonné puis étiré : c'est net sur
// le papier, flou à l'écran. On rend à 1:1 par défaut ; le sacrifice se
// fait sur les passes, pas sur la résolution.
const PRESETS = {
  ultra: { pixelRatio: 1.25, msaa: 4, ombre: 3072, gtao: 16, dof: true,  bloom: true,  composer: true },
  haut:  { pixelRatio: 1.0,  msaa: 0, ombre: 2048, gtao: 8,  dof: false, bloom: true,  composer: true },
  moyen: { pixelRatio: 1.0,  msaa: 0, ombre: 2048, gtao: 0,  dof: false, bloom: true,  composer: true },
  bas:   { pixelRatio: 1.0,  msaa: 0, ombre: 1536, gtao: 0,  dof: false, bloom: false, composer: false },
};

// Échelle de rendu réglable dans les options (0,75 à 1,25).
export let ECHELLE = 1.0;
export function setEchelle(e) { ECHELLE = e; }
export function pixelRatioDe(qualite) {
  return Math.min(PRESETS[qualite].pixelRatio * ECHELLE, devicePixelRatio * 1.5);
}

// Profil matériel. Le jeu n'est distribué qu'en exécutable : on peut
// donc dimensionner les textures et le filtrage d'après la carte
// réellement présente, ce qu'une page web ne permet pas (elle doit
// prévoir le pire et rester téléchargeable).
export function profilMateriel(renderer) {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const nom = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  const faible = /Intel|UHD Graphics|HD Graphics|Iris|SwiftShader|llvmpipe|Software/i.test(nom);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  return {
    nom,
    dedie: !faible,
    // 16x au lieu de 8 : gratuit sur carte dédiée, et c'est ce qui rend
    // la moquette nette en vision rasante — soit la majorité de l'écran.
    aniso: faible ? Math.min(8, maxAniso) : Math.min(16, maxAniso),
    echelleTex: faible ? 1 : 1.5,
    ombreMax: faible ? 2048 : 4096,
  };
}

// Les GPU intégrés n'encaissent pas le post-traitement plein écran.
export function qualiteConseillee(renderer) {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const nom = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  if (/SwiftShader|llvmpipe|Software/i.test(nom)) return 'bas';
  // Mesuré sur RTX 3070 Laptop à 1426x739 : « haut » (occlusion ambiante
  // + bloom) tient les 60 fps, « ultra » retombe à 31 — la profondeur de
  // champ redessine toute la scène et le MSAA 4x coûte trop cher.
  // Sur GPU intégré Intel, « moyen » (bloom seul) est le bon compromis.
  if (/Intel|UHD Graphics|HD Graphics|Iris/i.test(nom)) return 'moyen';
  return 'haut';
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
  });
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // lu par OutputPass
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

// ------------------------------------------------------------
//  Ciel visible par la baie vitrée
// ------------------------------------------------------------
// Le ciel procédural coûte ~150 ms : on le garde en cache par heure.
const cacheCiel = new Map();
function texCiel() {
  const cle = `${SUN.elevationDeg}|${SUN.azimuthDeg}`;
  let t = cacheCiel.get(cle);
  if (!t) { t = skyTexture(SUN.direction); cacheCiel.set(cle, t); }
  return t;
}

export function majCiel(sky) {
  sky.material.map = texCiel();
  sky.material.needsUpdate = true;
}

export function addSky(scene) {
  const tex = texCiel();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(190, 48, 32),
    new THREE.MeshBasicMaterial({
      map: tex, side: THREE.BackSide, fog: false, depthWrite: false,
      // la texture est normalisée : on rend sa dynamique HDR ici
      color: new THREE.Color(SKY_SCALE, SKY_SCALE, SKY_SCALE),
    }));
  sky.renderOrder = -1000;
  scene.add(sky);
  return sky;
}

// ------------------------------------------------------------
//  IBL : on photographie une pièce factice plutôt que le ciel.
//
//  Utiliser le ciel directement éclairerait l'intérieur de façon
//  uniforme et écraserait le contraste. Cette boîte reproduit la
//  vraie distribution : baie chaude et intense à l'ouest, plafond
//  tiède, rebond sourd au sol.
// ------------------------------------------------------------
export function buildEnvironment(renderer) {
  const envScene = new THREE.Scene();
  const panneau = (couleur, intensite, w, h, pos, rot) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: couleur, side: THREE.DoubleSide }));
    m.material.color.multiplyScalar(intensite);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    envScene.add(m);
    return m;
  };

  const R = 10;
  // baie vitrée ouest : la source dominante
  panneau(0xffcd9c, 4.4, 2 * R, 7, [-R, 2, 0], [0, Math.PI / 2, 0]);
  // ciel plus froid au-dessus de l'horizon, côté ouest
  panneau(0xbcd2ff, 1.1, 2 * R, 3, [-R, 6, 0], [0, Math.PI / 2, 0]);
  // plafond : néons tièdes
  panneau(0xf0f2eb, 1.35, 2 * R, 2 * R, [0, R, 0], [Math.PI / 2, 0, 0]);
  // murs de rebond
  panneau(0xc9d5cc, 0.55, 2 * R, 7, [R, 2, 0], [0, Math.PI / 2, 0]);
  panneau(0xd9dacf, 0.45, 2 * R, 7, [0, 2, -R], [0, 0, 0]);
  panneau(0xd9dacf, 0.45, 2 * R, 7, [0, 2, R], [0, 0, 0]);
  // sol moquette : rebond sombre et chaud
  panneau(0x354d49, 0.30, 2 * R, 2 * R, [0, -1, 0], [Math.PI / 2, 0, 0]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromScene(envScene, 0.04, 0.1, 100).texture;
  pmrem.dispose();
  envScene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return env;
}

// ------------------------------------------------------------
//  Lumières
// ------------------------------------------------------------
export function addLights(scene, preset) {
  const dir = SUN.direction;

  // Soleil : rasant, chaud, ombres longues
  const soleil = new THREE.DirectionalLight(0xffc98f, SUN.intensite);
  soleil.position.copy(dir).multiplyScalar(60);
  soleil.target.position.set(-2, 0, 0);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(preset.ombre, preset.ombre);
  soleil.shadow.blurSamples = 12;
  const c = soleil.shadow.camera;
  c.left = -34; c.right = 34; c.top = 26; c.bottom = -22;
  c.near = 8; c.far = 140;
  soleil.shadow.bias = -0.0004;
  soleil.shadow.normalBias = 0.035;
  soleil.shadow.radius = 3;
  scene.add(soleil, soleil.target);

  // Appoint froid côté est, pour que les ombres ne soient pas noires
  const appoint = new THREE.DirectionalLight(0x9fb8e8, 0.42);
  appoint.position.set(30, 16, 18);
  scene.add(appoint);

  return { soleil, appoint };
}

// Applique l'heure du niveau : hauteur du soleil, teinte, appoint.
export function majSoleil(lumieres) {
  const dir = SUN.direction;
  lumieres.soleil.position.copy(dir).multiplyScalar(60);
  lumieres.soleil.intensity = SUN.intensite;
  // plus le soleil descend, plus il rougit
  const t = THREE.MathUtils.clamp(SUN.elevationDeg / 12, 0, 1);
  lumieres.soleil.color.setHSL(THREE.MathUtils.lerp(0.035, 0.085, t), 0.85,
    THREE.MathUtils.lerp(0.55, 0.72, t));
  lumieres.appoint.intensity = 0.25 + 0.25 * t;
}

// ------------------------------------------------------------
//  Composer
// ------------------------------------------------------------
export function createComposer(renderer, scene, camera, qualite, masquerOverlays) {
  const preset = PRESETS[qualite];
  if (!preset.composer) return { composer: null, gtao: null, bokeh: null, bloom: null, preset };
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());

  const cible = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,                 // HDR : indispensable pour le bloom
    colorSpace: THREE.LinearSRGBColorSpace,
    samples: preset.msaa,                      // MSAA matériel sur les arêtes
  });
  const composer = new EffectComposer(renderer, cible);
  // Toutes nos tailles sont déjà exprimées en pixels physiques.
  // Sans ceci, le ratio était appliqué une seconde fois en haute densité.
  composer.setPixelRatio(1);
  composer.addPass(new RenderPass(scene, camera));

  let gtao = null, bokeh = null, bloom = null;

  if (preset.gtao) {
    gtao = new GTAOPass(scene, camera, size.x, size.y);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial({
      radius: 0.45, distanceExponent: 1.4, thickness: 0.7,
      scale: 1.1, samples: preset.gtao, distanceFallOff: 1,
      screenSpaceRadius: false,
    });
    gtao.updatePdMaterial({
      lumaPhi: 10, depthPhi: 2, normalPhi: 3,
      radius: 4, radiusExponent: 1, rings: 2, samples: 8,
    });
    enveloppe(gtao, masquerOverlays);
    composer.addPass(gtao);
  }

  if (preset.dof) {
    // aperture très faible : on veut un flou d'arrière-plan perceptible,
    // pas un effet maquette
    bokeh = new BokehPass(scene, camera, { focus: 5.0, aperture: 0.00009, maxblur: 0.0038 });
    enveloppe(bokeh, masquerOverlays);
    composer.addPass(bokeh);
  }

  if (preset.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.24, 0.35, 1.35);
    composer.addPass(bloom);
  }

  composer.addPass(new OutputPass());   // ACES + sRGB

  return { composer, gtao, bokeh, bloom, preset, cible };
}

// GTAO et Bokeh redessinent la scène pour obtenir profondeur et normales.
// Les sprites d'interface et le contour du joueur n'ont rien à y faire :
// ils y creuseraient des trous. On les masque le temps de ces passes.
function enveloppe(pass, masquerOverlays) {
  if (!masquerOverlays) return;
  const original = pass.render.bind(pass);
  pass.render = (...args) => {
    const restaurer = masquerOverlays();
    original(...args);
    restaurer();
  };
}

// ------------------------------------------------------------
//  Brouillard atmosphérique d'intérieur
// ------------------------------------------------------------
export function addFog(scene) {
  scene.fog = new THREE.FogExp2(0xd39a63, 0.0065);
  return scene.fog;
}

export { PRESETS };

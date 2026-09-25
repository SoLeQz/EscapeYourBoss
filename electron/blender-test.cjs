// Jalon A : le vrai export de creer_test.py, dans Electron et son pont d'assets.
// Pas de secours procédural. Cette branche n'est accessible qu'en --selftest.
async function preparerAtelierBlender() {
  if (!window.jeuTest) throw new Error('Atelier Blender réservé au profil isolé');
  const THREE = await import('three');
  const { lirePersonnageGLB } = await import('./src/personnage-glb.js');
  const g = window.__game;
  g.renderer.setAnimationLoop(null);
  const modele = await lirePersonnageGLB('lao-d-test.glb');
  if (modele.secours !== false || modele.source !== 'lao-d-test.glb')
    throw new Error('Le test exige le modèle importé, sans secours');
  document.body.replaceChildren(g.renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc2c8c6);
  scene.environment = g.scene.environment;
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, .03, 30);
  camera.position.set(1.1, 1.5, 2);
  camera.lookAt(-.215, 1.12, .1);
  scene.add(new THREE.HemisphereLight(0xe9f4ff, 0x746755, 2));
  const key = new THREE.DirectionalLight(0xffedd9, 3.2);
  key.position.set(-3, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xc4dfff, 1.5);
  fill.position.set(3, 2, -3); scene.add(fill);
  scene.add(modele.group);
  modele.actualiserPose();
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const points = [], materiaux = new Set(), geos = new Set();
  let skins = 0, triangles = 0, erreurPoids = 0;
  const box = new THREE.Box3();
  modele.group.traverse(mesh => {
    if (!mesh.isMesh) return;
    assert(mesh.isSkinnedMesh, 'L’éprouvette doit être entièrement skinnée');
    skins++;
    const geo = mesh.geometry;
    geos.add(geo);
    const { position, normal, uv, skinIndex, skinWeight } = geo.attributes;
    assert(position && normal && uv && skinIndex && skinWeight, 'Attributs GLB incomplets');
    assert(uv.count === position.count, 'UV manquants');
    triangles += (geo.index ? geo.index.count : position.count) / 3;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materiaux.add(mat);
    for (let i = 0; i < position.count; i++) {
      const p = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      assert(p.toArray().every(Number.isFinite), 'Sommet non fini');
      let somme = 0, coude = 0;
      for (let k = 0; k < 4; k++) {
        const poids = skinWeight.getComponent(i, k);
        const os = mesh.skeleton.bones[skinIndex.getComponent(i, k)];
        assert(poids >= 0 && poids <= 1, 'Poids de skinning hors intervalle');
        somme += poids;
        if (poids > 0) {
          assert(os && ['epauleL', 'coudeL'].includes(os.name), 'Poids sur un os inattendu');
          if (os.name === 'coudeL') coude += poids;
        }
      }
      erreurPoids = Math.max(erreurPoids, Math.abs(somme - 1));
      box.expandByPoint(p);
      points.push({ mesh, i, repos: p, coude });
    }
  });
  assert(erreurPoids < 1e-5, 'Poids non normalisés après export');
  assert(box.min.distanceTo(new THREE.Vector3(-.265, .8, -.035)) < 2e-5, 'Échelle/origine minimale incorrecte');
  assert(box.max.distanceTo(new THREE.Vector3(-.165, 1.4, .075)) < 2e-5, 'Échelle/orientation maximale incorrecte');
  assert(points.some(p => p.coude > 0 && p.coude < 1), 'Aucun mélange de poids autour du coude');
  const pivot = new THREE.Vector3(-.215, 1.11, 0);
  const rotation = new THREE.Matrix4();
  function verifierPose(angle, position = [0, 0, 0], yaw = 0) {
    modele.group.position.fromArray(position);
    modele.group.rotation.y = yaw;
    modele.parts.elbowL.rotation.x = angle;
    modele.actualiserPose();
    rotation.makeRotationX(angle);
    let erreur = 0, deplacement = 0;
    for (const p of points) {
      // Oracle analytique indépendant des matrices de l'adaptateur : deux poids,
      // épaule immobile et rotation de l'avant-bras autour du pivot métier.
      const coude = p.repos.clone().sub(pivot).applyMatrix4(rotation).add(pivot);
      const localAttendu = p.repos.clone().lerp(coude, p.coude);
      deplacement = Math.max(deplacement, localAttendu.distanceTo(p.repos));
      const attendu = localAttendu.applyMatrix4(modele.group.matrixWorld);
      const obtenu = p.mesh.getVertexPosition(p.i, new THREE.Vector3()).applyMatrix4(p.mesh.matrixWorld);
      erreur = Math.max(erreur, obtenu.distanceTo(attendu));
    }
    assert(erreur < 2e-5, `Déformation incorrecte à ${angle} rad : ${erreur} m`);
    g.renderer.render(scene, camera);
    return { angle, erreurMaxMetres: erreur, deplacementMaxMetres: deplacement,
      appels: g.renderer.info.render.calls, triangles: g.renderer.info.render.triangles };
  }
  await g.renderer.compileAsync(scene, camera);
  verifierPose(0);
  window.__blenderA = { THREE, g, scene, camera, modele, lirePersonnageGLB, assert, verifierPose };
  return { source: modele.source, secours: modele.secours, three: THREE.REVISION,
    bounds: { min: box.min.toArray(), max: box.max.toArray() },
    skins, triangles, materiaux: materiaux.size, geometries: geos.size, erreurPoids };
}

async function animerBlender() {
  const a = window.__blenderA;
  let erreurMaxMetres = 0;
  for (let frame = 0; frame <= 120; frame++) {
    const angle = -.5 * Math.PI * Math.sin(Math.PI * frame / 120);
    const result = a.verifierPose(angle);
    erreurMaxMetres = Math.max(erreurMaxMetres, result.erreurMaxMetres);
    await new Promise(requestAnimationFrame);
  }
  return { imagesVerifiees: 121, erreurMaxMetres, retourAuRepos: a.verifierPose(0) };
}

async function verifierLiberationBlender() {
  const a = window.__blenderA;
  const dessiner = () => {
    a.g.renderer.render(a.scene, a.camera);
    return { geometries: a.g.renderer.info.memory.geometries, textures: a.g.renderer.info.memory.textures };
  };
  a.modele.dispose();
  a.modele.dispose();
  const reference = dessiner(), cycles = [];
  for (let i = 0; i < 3; i++) {
    const modele = await a.lirePersonnageGLB('lao-d-test.glb');
    a.assert(modele.secours === false, 'Secours lors du rechargement');
    a.scene.add(modele.group);
    modele.parts.elbowL.rotation.x = -Math.PI / 2;
    modele.actualiserPose();
    const avecModele = dessiner();
    a.assert(avecModele.geometries > reference.geometries, 'Modèle rechargé non dessiné');
    modele.dispose();
    const apres = dessiner();
    a.assert(apres.geometries === reference.geometries && apres.textures === reference.textures,
      'Accumulation GPU après un import/libération');
    cycles.push({ avecModele, apres });
  }
  return { reference, cycles, portee: 'ressources GPU de l’éprouvette ; ne mesure pas la mémoire système' };
}

module.exports = async ({ js, shot, step, wait }) => {
  await step('blender-import-strict', `(${preparerAtelierBlender.toString()})()`);
  // Une absence de modèle est un échec du jalon, sans cascade de faux tests.
  if (!await js('!!window.__blenderA')) return;
  await wait(350); await shot('a-repos.jpg');
  for (const [nom, angle] of [['45', -Math.PI / 4], ['90', -Math.PI / 2]]) {
    await step('blender-coude-' + nom, `window.__blenderA.verifierPose(${angle})`);
    await wait(350); await shot('a-coude-' + nom + '.jpg');
  }
  await step('blender-placement-monde', 'window.__blenderA.verifierPose(-Math.PI/2,[10,.2,-4],.7)');
  await step('blender-retour-repos', 'window.__blenderA.verifierPose(0)');
  await step('blender-animation', `(${animerBlender.toString()})()`);
  await wait(350); await shot('a-retour-repos.jpg');
  await step('blender-liberation-rechargements', `(${verifierLiberationBlender.toString()})()`);
};

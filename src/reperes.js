import * as THREE from 'three';

// Projection des objectifs connus. Un objectif derrière la caméra doit
// indiquer de se retourner, jamais se projeter comme s'il était devant.
export function projeterRepere(position, camera, largeur, hauteur) {
  const monde = new THREE.Vector3(position.x, position.y, position.z);
  const vue = monde.clone().applyMatrix4(camera.matrixWorldInverse);
  const ndc = monde.project(camera);
  const centre = { x: largeur / 2, y: hauteur / 2 };
  const margeX = Math.min(118, largeur * 0.14),
    haut = Math.min(275, hauteur * 0.36);
  const bas = hauteur - Math.min(245, hauteur * 0.3);
  const x = ((ndc.x + 1) * largeur) / 2,
    y = ((1 - ndc.y) * hauteur) / 2;
  const dedans =
    vue.z < 0 &&
    ndc.z >= -1 &&
    ndc.z <= 1 &&
    x >= margeX &&
    x <= largeur - margeX &&
    y >= haut &&
    y <= bas;
  if (dedans) return { x, y, horsChamp: false, angle: 0 };
  let dx = x - centre.x,
    dy = y - centre.y;
  if (vue.z >= 0) {
    dx = vue.x;
    dy = Math.max(0.5, Math.abs(vue.z) * 0.65);
  }
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-6) {
    dx = 0;
    dy = 1;
  }
  const tx = Math.abs(dx) > 1e-6 ? (largeur / 2 - margeX) / Math.abs(dx) : Infinity;
  const ty =
    Math.abs(dy) > 1e-6 ? (dy > 0 ? bas - centre.y : centre.y - haut) / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return {
    x: centre.x + dx * t,
    y: centre.y + dy * t,
    horsChamp: true,
    angle: Math.atan2(dy, dx) + Math.PI / 2,
  };
}

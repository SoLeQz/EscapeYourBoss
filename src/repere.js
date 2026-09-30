// ============================================================
//  Orientation d'un étage.
//
//  Chaque plan est écrit une seule fois, dans le repère de la tour
//  « d'origine » : ascenseur à l'est, escalier au sud, baie à l'ouest.
//  Un niveau peut le construire en miroir (est-ouest, nord-sud) ou
//  retourné : l'ascenseur, l'escalier et les rondes changent de côté,
//  sans rien changer aux distances ni aux angles qui font l'équilibre
//  du niveau. Toutes les données de jeu passent par `p`, `yaw` et `boite`.
// ============================================================

export const ORIENTATIONS = {
  origine: [1, 1],     // ascenseur à l'est, escalier au sud
  nord: [1, -1],       // ascenseur à l'est, escalier au nord
  ouest: [-1, 1],      // ascenseur à l'ouest, escalier au sud
  retournee: [-1, -1], // ascenseur à l'ouest, escalier au nord
};

export class Repere {
  constructor(sx = 1, sz = 1) {
    this.sx = sx; this.sz = sz;
    // Un seul axe retourné : image miroir, les textes doivent être redressés.
    this.miroir = sx * sz < 0;
    this.identite = sx === 1 && sz === 1;
  }
  p(x, z) { return { x: this.sx * x, z: this.sz * z }; }
  x(x) { return this.sx * x; }
  z(z) { return this.sz * z; }
  // rotation.y = yaw regarde vers (sin yaw, cos yaw).
  // Formes exactes (pas d'atan2) : un angle retourné deux fois revient à l'identique.
  yaw(y) {
    const r = this.sx > 0 ? (this.sz > 0 ? y : Math.PI - y) : (this.sz > 0 ? -y : y + Math.PI);
    return r > Math.PI ? r - 2 * Math.PI : r;
  }
  azimutDeg(a) { return this.yaw(a * Math.PI / 180) * 180 / Math.PI; }
  boite(o) {
    const a = this.sx * o.x1, b = this.sx * o.x2, c = this.sz * o.z1, d = this.sz * o.z2;
    return { ...o, x1: Math.min(a, b), x2: Math.max(a, b), z1: Math.min(c, d), z2: Math.max(c, d) };
  }
  points(liste) { return liste?.map(([x, z, ...reste]) => [this.sx * x, this.sz * z, ...reste]); }
  // Configuration d'un collègue (levels.js) : place, regard, rondes et pause café.
  pnj(cfg) {
    if (this.identite) return cfg;
    const r = { ...cfg, ...this.p(cfg.x, cfg.z), yaw: this.yaw(cfg.yaw ?? 0) };
    if (cfg.waypoints) r.waypoints = this.points(cfg.waypoints);
    if (cfg.coffeeRoute) r.coffeeRoute = this.points(cfg.coffeeRoute);
    if (cfg.coffeeYaw != null) r.coffeeYaw = this.yaw(cfg.coffeeYaw);
    return r;
  }
}

export function repereDuNiveau(niveau) {
  const [sx, sz] = ORIENTATIONS[niveau?.orientation || 'origine'];
  return new Repere(sx, sz);
}

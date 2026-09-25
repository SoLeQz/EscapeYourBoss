// Navigation des PNJ : grille de passage construite une fois par étage à partir
// des obstacles (boîtes alignées), puis A* 8 directions et lissage en ligne droite.
// Sans ça, un PNJ qui fonce droit vers une cible se colle au premier mur rencontré :
// `collide` le repousse, mais ne lui dit pas de contourner.

// Les obstacles sont gonflés du rayon du PNJ (0,36) plus une petite marge : le chemin
// ne frôle pas les murs et les coins ne l'accrochent pas.
export function creerNavigation(obstacles, { rayon = 0.42, cellule = 0.25 } = {}) {
  const solides = obstacles.filter(o => !o.noClip);
  if (!solides.length) return null;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const o of solides) {
    x0 = Math.min(x0, o.x1); z0 = Math.min(z0, o.z1);
    x1 = Math.max(x1, o.x2); z1 = Math.max(z1, o.z2);
  }
  x0 -= 2; z0 -= 2; x1 += 2; z1 += 2;
  const nx = Math.ceil((x1 - x0) / cellule), nz = Math.ceil((z1 - z0) / cellule);
  const libre = new Uint8Array(nx * nz).fill(1);
  const r2 = rayon * rayon;
  for (const o of solides) {
    const i0 = Math.max(0, Math.floor((o.x1 - rayon - x0) / cellule));
    const i1 = Math.min(nx - 1, Math.floor((o.x2 + rayon - x0) / cellule));
    const k0 = Math.max(0, Math.floor((o.z1 - rayon - z0) / cellule));
    const k1 = Math.min(nz - 1, Math.floor((o.z2 + rayon - z0) / cellule));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const cx = x0 + (i + 0.5) * cellule, cz = z0 + (k + 0.5) * cellule;
      const dx = cx - Math.max(o.x1, Math.min(cx, o.x2)), dz = cz - Math.max(o.z1, Math.min(cz, o.z2));
      if (dx * dx + dz * dz < r2) libre[k * nx + i] = 0;
    }
  }
  return { x0, z0, cellule, nx, nz, libre };
}

const cellX = (nav, x) => Math.floor((x - nav.x0) / nav.cellule);
const cellZ = (nav, z) => Math.floor((z - nav.z0) / nav.cellule);
function estLibre(nav, i, k) {
  return i >= 0 && k >= 0 && i < nav.nx && k < nav.nz && nav.libre[k * nav.nx + i] === 1;
}

// Cellule libre la plus proche (le joueur collé à un bureau est dans une cellule bloquée).
function plusProcheLibre(nav, i, k, portee = 10) {
  if (estLibre(nav, i, k)) return [i, k];
  for (let r = 1; r <= portee; r++) {
    let meilleur = null, dMin = Infinity;
    for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dk)) !== r || !estLibre(nav, i + di, k + dk)) continue;
      const d = di * di + dk * dk;
      if (d < dMin) { dMin = d; meilleur = [i + di, k + dk]; }
    }
    if (meilleur) return meilleur;
  }
  return null;
}

// Segment praticable : échantillonné à la demi-cellule.
export function ligneLibre(nav, a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / (nav.cellule * 0.5)));
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    if (!estLibre(nav, cellX(nav, a.x + (b.x - a.x) * t), cellZ(nav, a.z + (b.z - a.z) * t))) return false;
  }
  return true;
}

// Chemin de `a` à `b` : liste de points {x, z} à suivre (sans le départ), ou null.
export function chemin(nav, a, b) {
  if (!nav) return null;
  const dep = plusProcheLibre(nav, cellX(nav, a.x), cellZ(nav, a.z));
  const arr = plusProcheLibre(nav, cellX(nav, b.x), cellZ(nav, b.z));
  if (!dep || !arr) return null;
  const { nx } = nav, N = nav.nx * nav.nz, start = dep[1] * nx + dep[0], goal = arr[1] * nx + arr[0];
  const g = new Float32Array(N).fill(Infinity), parent = new Int32Array(N).fill(-1), ferme = new Uint8Array(N);
  const h = c => { const dx = Math.abs(c % nx - arr[0]), dz = Math.abs(((c / nx) | 0) - arr[1]); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
  // tas binaire de paires (priorité, cellule) ; entrées périmées ignorées via `ferme`
  const tasF = [], tasC = [];
  const pousser = (c, fc) => {
    let j = tasF.length; tasF.push(fc); tasC.push(c);
    while (j > 0) { const p = (j - 1) >> 1; if (tasF[p] <= fc) break; tasF[j] = tasF[p]; tasC[j] = tasC[p]; j = p; }
    tasF[j] = fc; tasC[j] = c;
  };
  const extraire = () => {
    const top = tasC[0], lf = tasF.pop(), lc = tasC.pop(), n = tasF.length;
    if (n) {
      let j = 0;
      for (;;) {
        const l = 2 * j + 1, r = l + 1; let m = j, fm = lf;
        if (l < n && tasF[l] < fm) { m = l; fm = tasF[l]; }
        if (r < n && tasF[r] < fm) m = r;
        if (m === j) break;
        tasF[j] = tasF[m]; tasC[j] = tasC[m]; j = m;
      }
      tasF[j] = lf; tasC[j] = lc;
    }
    return top;
  };
  g[start] = 0; pousser(start, h(start));
  const voisins = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  let trouve = false;
  while (tasF.length) {
    const c = extraire();
    if (ferme[c]) continue;
    if (c === goal) { trouve = true; break; }
    ferme[c] = 1;
    const ci = c % nx, ck = (c / nx) | 0;
    for (const [di, dk, cout] of voisins) {
      const i = ci + di, k = ck + dk;
      if (!estLibre(nav, i, k)) continue;
      // pas de diagonale qui coupe un coin
      if (di && dk && (!estLibre(nav, ci + di, ck) || !estLibre(nav, ci, ck + dk))) continue;
      const v = k * nx + i, ng = g[c] + cout;
      if (ferme[v] || ng >= g[v]) continue;
      g[v] = ng; parent[v] = c; pousser(v, ng + h(v));
    }
  }
  if (!trouve) return null;
  const cellules = [];
  for (let c = goal; c !== -1; c = parent[c]) cellules.push(c);
  cellules.reverse();
  const pts = cellules.map(c => ({ x: nav.x0 + (c % nx + 0.5) * nav.cellule, z: nav.z0 + (((c / nx) | 0) + 0.5) * nav.cellule }));
  pts[pts.length - 1] = ligneLibre(nav, pts[pts.length - 1], b) ? { x: b.x, z: b.z } : pts[pts.length - 1];
  // Lissage : depuis chaque point, on file vers le plus lointain visible en ligne droite.
  const lisse = [];
  let courant = { x: a.x, z: a.z }, j = 0;
  while (j < pts.length) {
    let loin = j;
    for (let m = pts.length - 1; m > j; m--) if (ligneLibre(nav, courant, pts[m])) { loin = m; break; }
    lisse.push(pts[loin]); courant = pts[loin]; j = loin + 1;
  }
  return lisse;
}

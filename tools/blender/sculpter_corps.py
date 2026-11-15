"""Corps v01 : silhouette sculptée à la place des tubes de body.js.
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python sculpter_corps.py -- \
  --base human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend --out DOSSIER_NEUF

Source : « Body Male - Stylized » du Human Base Meshes Bundle v1.4.1 de Blender Studio (CC0).
Le maillage est en pose A, sans squelette. Ce script :
  1. le passe dans le repère du jeu (x à droite, y vers le haut, z vers l'avant, mètres) ;
  2. redresse la posture et élargit la carrure ;
  3. le repose sur les 16 os du jeu (bras le long du corps, genou et cheville aux pivots)
     et calcule ses poids de peau, par position le long de chaque membre ;
  4. taille dessus chemise, pantalon et veste (décalages le long des normales) ;
  5. mesure les sections du résultat : body.js y pose col, cravate, boutons, ceinture, badge ;
  6. écrit assets/corps-v01.js (tableaux prêts pour assembler()) et rend une planche.
La tête, les mains et les pieds de la base ne servent pas : têtes v03, mains v03 et souliers du jeu.
"""
import bpy, sys, argparse, json, numpy as np
from pathlib import Path
from mathutils import Vector

p = argparse.ArgumentParser(); p.add_argument('--base', required=True); p.add_argument('--out', required=True)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:]); out = Path(a.out)
if out.exists(): raise RuntimeError('Choisir un nouveau dossier pour conserver la version précédente.')
out.mkdir(parents=True)

OS = ['racine', 'buste', 'teteBase', 'tete', 'epauleL', 'coudeL', 'mainL', 'epauleR', 'coudeR', 'mainR',
      'hancheL', 'genouL', 'chevilleL', 'hancheR', 'genouR', 'chevilleR']
I = {n: i for i, n in enumerate(OS)}
EPAULE, COUDE, POIGNET = np.array([0.215, 1.38, 0]), np.array([0.215, 1.11, 0]), 0.85     # pivots du jeu (côté +x)
HANCHE_X, GENOU_Y, OURLET_Y = 0.105, 0.435, 0.105
def lisse(a_, b_, x): t = np.clip((x - a_) / (b_ - a_), 0, 1); return t * t * (3 - 2 * t)

# ---------------------------------------------------------------- 1. base, repère du jeu
with bpy.data.libraries.load(a.base) as (src, dst): dst.objects = ['GEO-body_male_stylized']
base = dst.objects[0]
W = np.array([list(base.matrix_world @ v.co) for v in base.data.vertices])
Q = np.array([list(f.vertices) for f in base.data.polygons if len(f.vertices) == 4])
G = np.stack([W[:, 0] - (W[:, 0].min() + W[:, 0].max()) / 2, W[:, 2], -W[:, 1]], 1)
cote = np.where(G[:, 0] < 0, -1.0, 1.0)
P = G.copy(); P[:, 0] = np.abs(P[:, 0])                      # demi-espace +x : un seul côté à raisonner

# ---------------------------------------------------------------- 2. posture et carrure
# La base se tient ventre en avant, cou projeté : on ramène l'axe du tronc sous la tête du jeu (z = 0).
def redresser(y): return np.interp(y, [0.80, 0.95, 1.05, 1.15, 1.25, 1.35, 1.45, 1.50], [0.008, 0.022, 0.036, 0.030, 0.014, 0.0, -0.004, 0.0])
LARGEUR, PROFONDEUR = 1.12, 0.93                            # taille de 23,6 cm → 26,4 cm ; poitrine moins bombée
def deformer(v):
    v = np.array(v, dtype=float); v[..., 2] = (v[..., 2] - redresser(v[..., 1])) * PROFONDEUR; v[..., 0] = v[..., 0] * LARGEUR; return v
P = deformer(P)
# Articulations relevées sur la base (centres de sections) : coude, poignet ; l'épaule remonte de 27 cm.
E0, W0 = np.array([0.317, 1.145, -0.029]), np.array([0.399, 0.951, -0.009]); H0 = np.array([0.229, 1.28, -0.023])
E, Wr = deformer(E0), deformer(W0); uu = (E - deformer(H0)); uu /= np.linalg.norm(uu); S = E - 0.27 * uu
uf = Wr - E; Lf = np.linalg.norm(uf); uf /= Lf; Lu = 0.27

# ---------------------------------------------------------------- 3. poids et repose
def distance(v, o, d, t0, t1):
    t = np.clip((v - o) @ d, t0, t1); return np.linalg.norm(v - o - np.outer(t, d), axis=1)
tu, tf = (P - S) @ uu, (P - E) @ uf
du, df = distance(P, S, uu, -0.12, Lu), distance(P, E, uf, 0, Lf + 0.25)
s = np.where(du <= df, np.minimum(tu, Lu), Lu + np.maximum(tf, 0)); rho = np.minimum(du, df)
main = (s > Lu + Lf + 0.008) & (rho < 0.17)
w_bras = lisse(-0.07, 0.06, s) * (1 - lisse(0.082, 0.108, rho)); w_bras[main] = 1
w_avant = w_bras * lisse(Lu - 0.05, Lu + 0.05, s)
y = P[:, 1]
w_jambe = lisse(0.93, 0.80, y) * (lisse(0.0, 0.07, P[:, 0]) * (1 - lisse(0.83, 0.79, y)) + lisse(0.83, 0.79, y)) * (1 - w_bras)
w_tibia = w_jambe * lisse(0.555, 0.445, y)
w_pied = w_jambe * lisse(0.20, 0.13, y)

def rotation(u):                                             # amène u sur la verticale descendante
    t = np.array([0, -1.0, 0]); k = np.cross(u, t); sn = np.linalg.norm(k); c = u @ t
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]]); return np.eye(3) + K + K @ K * ((1 - c) / sn ** 2)
def os_bras(v, o, u, pivot, k):
    q = (v - o) @ rotation(u).T; q[:, 1] *= k; return pivot + q
haut_bras = os_bras(P, S, uu, EPAULE, 1.0)
avant_bras = os_bras(P, E, uf, COUDE, (COUDE[1] - POIGNET) / Lf)
B = P * (1 - w_bras)[:, None] + haut_bras * (w_bras - w_avant)[:, None] + avant_bras * w_avant[:, None]

# Jambes : presque verticales déjà. On aligne hanche, genou et cheville sur l'axe du jeu et on descend le
# genou au pivot (0,42 m) — le tibia de la base mesure 38 cm comme celui du jeu, mais 8 cm plus haut.
def centre(yc):
    m = (np.abs(y - yc) < 0.014) & (w_jambe > 0.6) & (P[:, 0] < 0.25)
    return (P[m, 0].min() + P[m, 0].max()) / 2, (P[m, 2].min() + P[m, 2].max()) / 2
(hx, hz), (gx, gz), (cx_, cz_) = centre(0.78), centre(0.50), centre(0.13)
ys = [0.0, 0.13, 0.50, 0.78, 0.93]
dx = np.interp(y, ys, [HANCHE_X - cx_, HANCHE_X - cx_, HANCHE_X - gx, HANCHE_X - hx, HANCHE_X - hx])
dz = np.interp(y, ys, [-cz_, -cz_, -(gz - 0.012), -hz, 0])
dy = np.interp(y, [0.0, 0.12, 0.50, 0.90, 1.0], [-0.02, OURLET_Y - 0.01, GENOU_Y, 0.90, 1.0]) - y
B += np.stack([dx, dy, dz], 1) * w_jambe[:, None]

# Poids : deux à quatre os par sommet, comme les tubes de body.js.
w_main = w_avant * lisse(0.905, 0.878, B[:, 1])
reste = np.clip(1 - w_bras - w_jambe, 0, 1); buste = reste * lisse(0.96, 1.07, y)
Wt = np.zeros((len(P), len(OS)))
for c_, sfx in ((-1, 'L'), (1, 'R')):
    m = cote == c_
    for nom, w in (('epaule', w_bras - w_avant), ('coude', w_avant - w_main), ('main', w_main),
                   ('hanche', w_jambe - w_tibia), ('genou', w_tibia - w_pied), ('cheville', w_pied)):
        Wt[m, I[nom + sfx]] = w[m]
Wt[:, I['buste']] = buste; Wt[:, I['racine']] = reste - buste
B[:, 0] *= cote                                              # retour aux deux côtés

# ---------------------------------------------------------------- 4. vêtements
def normales(V):
    n = np.zeros_like(V)
    fn = np.cross(V[Q[:, 2]] - V[Q[:, 0]], V[Q[:, 3]] - V[Q[:, 1]])
    for k in range(4): np.add.at(n, Q[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1), 1e-9)[:, None]
N = normales(B)
if N[np.argmax(B[:, 2]), 2] < 0: N = -N; Q = Q[:, ::-1]
voisins = [set() for _ in P]
for f in Q:
    for k in range(4): voisins[f[k]].add(f[k - 1]); voisins[f[k]].add(f[(k + 1) % 4])
voisins = [np.array(sorted(v)) for v in voisins]
def lisser(V, masque, tours, force=0.6):
    ids = np.nonzero(masque)[0]
    for _ in range(tours):
        m = np.array([V[voisins[i]].mean(0) for i in ids]); V[ids] += (m - V[ids]) * force
    return V
def gonfler(V, axe_x, masque, rmin):                         # rayon minimal autour d'un axe vertical : manche, jambe
    d = V[masque][:, [0, 2]] - np.stack([axe_x[masque], np.zeros(masque.sum())], 1); r = np.linalg.norm(d, axis=1)
    k = np.maximum(1, rmin[masque] / np.maximum(r, 1e-6)); V[masque, 0] = axe_x[masque] + d[:, 0] * k; V[masque, 2] = d[:, 1] * k
    return V

bras, jambe = w_bras > 0.5, w_jambe > 0.5
# Le menton de la base descend sous l'encolure, loin devant le cou : il part avec la tête et les mains.
menton = (B[:, 1] > 1.445) & (B[:, 2] > 0.062) & ~(w_bras > 0.5)
fbras = bras[Q].sum(1) >= 2; fmain = main[Q].any(1) | menton[Q].any(1); fbas = N[Q, 1].mean(1) < -0.55
yb = B[:, 1]; ax_bras, ax_jambe = cote * EPAULE[0], cote * HANCHE_X
def tailler(V, bas=None, haut=None, bas_bras=None):
    """Bords francs : les faces à cheval sur la coupe sont gardées et leurs sommets ramenés sur le plan."""
    lo = np.where(bras, bas_bras if bas_bras is not None else -9, bas if bas is not None else -9)
    garde = (V[Q, 1].max(1) > np.where(fbras, lo[Q].max(1), lo[Q].min(1)) + 0.004) & ~fmain
    if haut is not None: garde &= V[Q, 1].min(1) < haut - 0.004; V[:, 1] = np.minimum(V[:, 1], haut)
    V[:, 1] = np.maximum(V[:, 1], lo); return garde

# Chemise ajustée : on devine la carrure, pas les muscles.
chemise = lisser(B + N * 0.004, np.ones(len(P), bool), 2) + N * 0.003
chemise = gonfler(chemise, ax_bras, bras & (yb < 0.91), np.full(len(P), 0.0355))             # poignet de chemise
f_chemise = tailler(chemise, bas=0.935, haut=1.487, bas_bras=0.872)

# Pantalon droit : la jambe tombe du bassin à l'ourlet, sans marquer genou ni mollet.
pantalon = lisser(B + N * 0.008, jambe | (yb < 1.0), 3) + N * 0.004
pantalon = lisser(pantalon, (yb > 0.74) & (yb < 0.94) & (np.abs(B[:, 0]) < 0.075) & (B[:, 2] > 0), 10)   # braguette plate
pantalon = gonfler(pantalon, ax_jambe, jambe & (yb < 0.70), np.interp(yb, [0.105, 0.435, 0.70], [0.062, 0.066, 0.074]))
f_pantalon = tailler(pantalon, bas=OURLET_Y, haut=0.995) & ~fbras

# Veste : une coque lissée, épaules et manches en volumes pleins, basque à peine évasée.
veste = lisser(B + N * 0.012, np.ones(len(P), bool), 7) + N * 0.007
veste = lisser(veste, ~bras & (yb < 0.99), 4) + N * (0.008 * lisse(1.10, 1.0, yb) * ~bras)[:, None]   # par-dessus la ceinture
k = 1 + 0.08 * lisse(1.0, 0.80, yb) * ~bras; veste[:, 0] *= k; veste[:, 2] *= k
veste = gonfler(veste, ax_bras, bras & (yb < 1.33), np.interp(yb, [0.895, 1.11, 1.33], [0.045, 0.052, 0.058]))
f_veste = tailler(veste, bas=0.80, haut=1.487, bas_bras=0.895) & ~(fbas & (B[Q, 1].mean(1) < 0.9))
fy = B[Q, 1].mean(1)

# ---------------------------------------------------------------- 5. sections pour body.js
def sections(V, faces, ys_, garde):
    r = []; porte = np.zeros(len(P), bool); porte[Q[faces].ravel()] = True      # sommets réellement portés, hauteur d'avant la coupe
    for yc in ys_:
        m = (np.abs(yb - yc) < 0.014) & garde & porte
        c0 = m & (np.abs(V[:, 0]) < 0.04)
        r.append([yc, round(float(np.abs(V[m, 0]).max()), 4), round(float(V[c0, 2].max()), 4), round(float(-V[c0, 2].min()), 4)])
    return r
tronc = w_bras < 0.25
chaines = {'torse': sections(chemise, f_chemise, [0.95, 0.975, 1.04, 1.12, 1.24, 1.35, 1.425, 1.468], tronc),
           'veste': sections(veste, f_veste, [0.815, 0.88, 0.99, 1.06, 1.125, 1.245, 1.355, 1.428, 1.47], tronc),
           'bassin': sections(pantalon, f_pantalon, [0.79, 0.85, 0.905, 0.945, 0.98], ~bras)}
# Ouverture de la veste : même loi que ouvertureVeste() de body.js, en abscisse sur la section mesurée.
vy, vrx = [c_[0] for c_ in chaines['veste']], [c_[1] for c_ in chaines['veste']]
def ouverture(yv): return np.interp(yv, vy, vrx) * np.sin(0.48 * np.clip((yv - 1.10) / (1.488 - 1.10), 0, 1)) ** 0.84
dans_v = (veste[:, 2] > 0) & (N[:, 2] > 0.1) & (yb > 1.10) & (np.abs(veste[:, 0]) < ouverture(yb)) & ~bras
f_veste &= ~dans_v[Q].all(1)

# ---------------------------------------------------------------- 6. export
def couche(V, faces, pince=None):
    """Sommets par coin de face : UV en projection selon l'axe dominant de la face (1 unité = 0,9 m)."""
    pos, uv, idx, si, sw, vus = [], [], [], [], [], {}
    Nc = normales(V)
    for f in Q[faces]:
        n = np.cross(V[f[2]] - V[f[0]], V[f[3]] - V[f[1]]); lat = abs(n[0]) > abs(n[2]); gauche = V[f, 0].mean() < 0
        coins = []
        for v in f:
            cle = (int(v), bool(lat), bool(gauche) if pince is not None and pince[v] else None)
            if cle not in vus:
                x, yv, z = V[v]
                if cle[2] is not None: x = (-1 if gauche else 1) * float(ouverture(yv))      # lèvre de la veste sur le V
                vus[cle] = len(pos) // 3; pos += [x, yv, z]; uv += [(z if lat else x) / 0.9, yv / 0.9]
                o = np.argsort(-Wt[v])[:4]; w = Wt[v][o]; w = w / w.sum(); si += [int(i) for i in o]; sw += [float(x_) for x_ in w]
            coins.append(vus[cle])
        idx += [coins[0], coins[1], coins[2], coins[0], coins[2], coins[3]]
    r4 = lambda l: [round(x, 4) for x in l]
    return {'pos': r4(pos), 'uv': r4(uv), 'idx': idx, 'si': si, 'sw': r4(sw)}
plastron = (np.abs(chemise[Q, 0]).max(1) < 0.125) & (fy > 1.06) & (chemise[Q, 2].mean(1) > 0)
donnees = {'source': 'Body Male - Stylized, Human Base Meshes Bundle v1.4.1 (Blender Studio, CC0)', 'os': OS, 'chaines': chaines,
           'haut': couche(chemise, f_chemise),
           # sous la veste : plastron, encolure et poignets seulement
           'hautHabille': couche(chemise, f_chemise & (plastron | (fy > 1.44) | (fbras & (fy < 0.93)))),
           'bas': couche(pantalon, f_pantalon), 'veste': couche(veste, f_veste, dans_v)}
(out / 'corps-v01.js').write_text('// Export de tools/blender/sculpter_corps.py. Ne pas modifier à la main : relancer le script.\nexport default '
                                  + json.dumps(donnees, separators=(',', ':')) + ';\n', encoding='utf8')
rapport = {k_: {'sommets': len(v['pos']) // 3, 'triangles': len(v['idx']) // 3} for k_, v in donnees.items() if isinstance(v, dict) and 'pos' in v}
rapport['chaines'] = chaines; rapport['articulations'] = {'epaule': S.round(3).tolist(), 'coude': E.round(3).tolist(), 'poignet': Wr.round(3).tolist(),
    'hanche': [round(hx, 3), round(hz, 3)], 'genou': [round(gx, 3), round(gz, 3)], 'cheville': [round(cx_, 3), round(cz_, 3)]}
(out / 'rapport.json').write_text(json.dumps(rapport, indent=1), encoding='utf8'); print('RAPPORT ' + json.dumps({k_: v for k_, v in rapport.items() if k_ != 'chaines'}))

# ---------------------------------------------------------------- planche : avec et sans veste
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)      # base, et cube/lampe/caméra d'usine
scene = bpy.context.scene
def matiere(nom, rgb):
    m = bpy.data.materials.new(nom); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = 0.75; return m
def objet(nom, d, mat, dx_):
    me = bpy.data.meshes.new(nom); v = np.array(d['pos']).reshape(-1, 3); t = np.array(d['idx']).reshape(-1, 3)
    me.from_pydata([(x + dx_, -z, y_) for x, y_, z in v], [], t.tolist()); me.materials.append(mat)
    for f in me.polygons: f.use_smooth = True
    o = bpy.data.objects.new(nom, me); scene.collection.objects.link(o)
    o.modifiers.new('soudure', 'WELD').merge_threshold = 1e-5; return o
blanc, gris, marine = matiere('chemise', (.85, .82, .76)), matiere('pantalon', (.14, .15, .18)), matiere('veste', (.07, .09, .14))
objet('chemise', donnees['haut'], blanc, -0.4); objet('pantalon', donnees['bas'], gris, -0.4)
objet('plastron', donnees['hautHabille'], blanc, 0.4); objet('pantalon2', donnees['bas'], gris, 0.4); objet('veste', donnees['veste'], marine, 0.4)
scene.world = bpy.data.worlds.new('studio'); scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.3, .33, .34, 1); scene.world.node_tree.nodes['Background'].inputs[1].default_value = .7
for nom, pos, e in [('cle', (-2, -3, 3), 500), ('contre', (3, 2.5, 2), 350), ('face', (2, -3, 1), 160)]:
    l = bpy.data.lights.new(nom, 'AREA'); l.energy = e; l.size = 2; o = bpy.data.objects.new(nom, l); scene.collection.objects.link(o)
    o.location = pos; o.rotation_euler = (Vector((0, 0, 1)) - o.location).to_track_quat('-Z', 'Y').to_euler()
cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.ortho_scale = 1.9; cam = bpy.data.objects.new('cam', cd); scene.collection.objects.link(cam); scene.camera = cam
scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.render.resolution_x = 900; scene.render.resolution_y = 820; scene.render.image_settings.file_format = 'JPEG'
for nom, pos in [('face', (0, -5, .82)), ('trois-quarts', (3.2, -3.8, .82)), ('profil', (5, 0, .82)), ('dos', (0, 5, .82))]:
    cam.location = pos; cam.rotation_euler = (Vector((0, 0, .82)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(out / (nom + '.jpg')); bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'corps-v01.blend'))

"""Coiffures v03 : remplace les cheveux d'une tête v02 sans toucher au visage.
blender --background tete-employe-v02.blend --python-exit-code 1 --python recoiffer.py -- --profil employe --out DOSSIER_NEUF_OU_EXISTANT

La v02 était une calotte : même épaisseur partout, bord net au-dessus des oreilles,
nuque à 3 cm sous les yeux (coupe au bol). Ici le crâne est relevé par lancer de
rayon, puis chaque profil reçoit une vraie coupe : épaisseur variable, dégradé sur
les côtés, ligne d'implantation qui contourne l'oreille et descend sur la nuque,
mèches sculptées le long du sens de coiffage et assombries dans leurs creux (Pigment).
Repère du jeu dans tout le script : x à droite, y vers le haut, z vers l'avant,
origine au niveau des yeux. Blender : (x, -z, y).
"""
import bpy, bmesh, sys, argparse, json
from math import sin, cos, pi, exp, sqrt, atan2
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

p = argparse.ArgumentParser(); p.add_argument('--profil', required=True); p.add_argument('--out', required=True)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:]); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
nom = f'tete-{a.profil}-v03'
if (out / (nom + '.blend')).exists(): raise RuntimeError('Cette coiffure existe déjà : choisir un autre dossier.')

B = lambda v: Vector((v[0], -v[2], v[1]))            # jeu -> Blender
J = lambda v: Vector((v[0], v[2], -v[1]))            # Blender -> jeu
lisse = lambda a_, b_, x: (lambda t: t * t * (3 - 2 * t))(max(0, min(1, (x - a_) / (b_ - a_))))

visage = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Visage'))
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.split('.')[0] in
          ('Coiffure — masses peignées et raie', 'Mèches balayées — relief et séparation', 'Patte de tempe')]:
    bpy.data.objects.remove(o, do_unlink=True)
bvh = BVHTree.FromObject(visage, bpy.context.evaluated_depsgraph_get())
pts = [J(v.co) for v in visage.data.vertices]
haut = max(q.y for q in pts); xmax = max(abs(q.x) for q in pts)
oreille = [q for q in pts if abs(q.x) > xmax * 0.93]
oy0, oy1 = min(q.y for q in oreille), max(q.y for q in oreille); oz = sum(q.z for q in oreille) / len(oreille)
crane = [q for q in pts if q.y > 0.03]
c = Vector((0, haut - 0.100, (max(q.z for q in crane) + min(q.z for q in crane)) / 2))

def direction(theta, phi): return Vector((sin(phi) * sin(theta), cos(theta), cos(phi) * sin(theta)))
def rayon(d):
    h = bvh.ray_cast(B(c + d * 0.5), B(-d))[0]
    return (J(h) - c).length if h else 0.09

# Ligne d'implantation : hauteur (au-dessus des yeux) selon l'azimut, 0 = face.
aO = atan2(xmax, oz - c.z)                            # azimut de l'oreille
def ligne(phi):
    az = abs((phi + pi) % (2 * pi) - pi)
    recul = {'direction': 0.016, 'chignon': -0.006}.get(a.profil, 0)
    nuque = oy0 - (0.012 if a.profil != 'securite' else 0.004)
    cles = [(0, 0.066 + recul), (0.55, 0.071 + recul * 1.6), (aO - 0.62, 0.050 + recul), (aO - 0.40, oy1 + 0.004),
            (aO - 0.27, oy1 - 0.026), (aO - 0.14, oy1 + 0.004), (aO + 0.02, oy1 + 0.010), (aO + 0.32, oy1 + 0.002),
            (aO + 0.62, (oy1 + nuque) / 2 - 0.004), (aO + 1.05, nuque + 0.004), (pi + 0.01, nuque)]
    for (a0, y0), (a1, y1) in zip(cles, cles[1:]):
        if az <= a1: return y0 + (y1 - y0) * lisse(a0, a1, az)
    return cles[-1][1]

# Épaisseur (m), relief de mèche (-1..1) et teinte, par profil.
def coupe(q, u, phi, theta):
    x, z = q.x, q.z - c.z
    dessus = 1 - lisse(0.75, 1.25, theta)             # 1 sur le dessus, 0 sur les côtés
    bord = lisse(0.0, 0.5, 1 - u)                     # 0 à la ligne d'implantation
    cote = sin(34 * phi + 2.2 * sin(3 * theta))       # mèches qui tombent
    if a.profil == 'employe':                         # raie à gauche, volume balayé vers la droite, mèche relevée
        raie = exp(-((x + 0.040) / 0.0055) ** 2) * dessus * lisse(-0.075, -0.045, z)
        droite = lisse(-0.046, -0.030, x)
        arriere = 1 - lisse(-0.07, 0.0, z)                                            # la raie s'efface vers la couronne
        avant = 0.007 + droite * (0.012 + 0.007 * exp(-((x + 0.012) / 0.035) ** 2) + 0.013 * lisse(0.015, 0.075, z))
        t = dessus * (avant + (0.0125 - avant) * arriere) + (1 - dessus) * (0.0025 + 0.0105 * bord)
        s = z * cos(0.38) + x * sin(0.38)
        relief = dessus * sin(2 * pi * s / 0.0125 + 1.4 * sin(x * 38)) * (1 - raie) + (1 - dessus) * 0.4 * cote
        return t * (1 - 0.8 * raie), relief * (0.0030 * dessus + 0.0010), 1 - 0.3 * raie
    if a.profil == 'direction':                       # plaqué en arrière, golfes dégarnis
        t = dessus * (0.009 + 0.003 * lisse(0.0, 0.06, z)) + (1 - dessus) * (0.002 + 0.007 * bord)
        relief = dessus * sin(2 * pi * x / 0.0095 + 0.8 * sin(z * 30)) + (1 - dessus) * 0.5 * cote
        return t, relief * (0.0016 * dessus + 0.0008), 1
    if a.profil == 'chignon':                         # tiré vers le chignon, raie au milieu
        raie = exp(-(x / 0.004) ** 2) * dessus * lisse(-0.02, 0.01, z)
        t = 0.0075 + 0.003 * dessus * lisse(0.004, 0.03, abs(x)) - 0.0035 * (1 - bord)
        relief = sin(2 * pi * (z - 0.55 * abs(x)) / 0.0105 + 1.1 * sin(x * 45))
        return t * (1 - 0.6 * raie), relief * 0.0014, 1 - 0.25 * raie
    # sécurité : brosse courte, dessus à peine plus long
    return 0.0028 + 0.0030 * dessus + 0.0010 * bord, sin(53 * phi) * sin(41 * theta) * 0.0004, 1

N, R = 64, 22
vs, plats, cols, fs = [], [], [], []
for k in range(N):
    phi = 2 * pi * k / N
    cible = ligne(phi) + 0.0012 * sin(phi * 23) + 0.0008 * sin(phi * 41)    # implantation irrégulière
    lo, hi = 0.15, 2.9
    for _ in range(26):                                                    # angle polaire où le crâne atteint la ligne
        m = (lo + hi) / 2; d = direction(m, phi)
        if (c + d * rayon(d)).y > cible: lo = m
        else: hi = m
    fin = (lo + hi) / 2
    for j in range(R + 2):
        u = min(1, j / R); theta = 0.001 + (fin - 0.001) * (1 - (1 - u) ** 1.25); d = direction(theta, phi)
        q = c + d * rayon(d)
        if j > R:                                                          # retour au cuir chevelu : le bord est fermé
            d2 = direction(fin + 0.012, phi); vs.append(B(c + d2 * (rayon(d2) + 0.0003))); plats.append(vs[-1]); cols.append((0.62,) * 3); continue
        t, relief, teinte = coupe(q, u, phi, theta)
        vs.append(B(q + d * (t + relief + 0.0008)))
        # Clé « Chapeau » : cheveux aplatis à 5 mm, pour tenir sous les couvre-chefs du vestiaire.
        plats.append(B(q + d * (min(t, 0.005) + relief * 0.25 + 0.0008)))
        ton = teinte * (0.80 + 0.20 * (0.5 + 0.5 * (relief / max(1e-6, abs(relief))) * min(1, abs(relief) / 0.0012)))
        cols.append((ton, ton, ton))
col = lambda k, j: (k % N) * (R + 2) + j
for k in range(N):
    for j in range(R + 1): fs.append((col(k, j), col(k, j + 1), col(k + 1, j + 1), col(k + 1, j)))

d = bpy.data.meshes.new('Coiffure v03'); d.from_pydata(vs, [], fs); d.update()
o = bpy.data.objects.new('Coiffure v03 — ' + a.profil, d); visage.users_collection[0].objects.link(o)
d.materials.append(bpy.data.materials['ANATOMIE_cheveux'])
o['controle'] = 'head'; o['origine'] = [0, 0, 0]; o['option'] = ''
bm = bmesh.new(); bm.from_mesh(d); bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(d); bm.free()
for f in d.polygons: f.use_smooth = True
uv = d.uv_layers.new(name='UVMap')                                         # même projection que les autres pièces
for f in d.polygons:
    axe = max(range(3), key=lambda i: abs(f.normal[i])); axes = [i for i in range(3) if i != axe]
    for li in f.loop_indices:
        v = d.vertices[d.loops[li].vertex_index].co; uv.data[li].uv = (v[axes[0]], v[axes[1]])
pig = d.color_attributes.new(name='Pigment', type='FLOAT_COLOR', domain='POINT')
for i in range(len(d.vertices)): pig.data[i].color = tuple(cols[i]) + (1,)
o.shape_key_add(name='Basis'); cle = o.shape_key_add(name='Chapeau'); cle.value = 0
for i, v in enumerate(plats): cle.data[i].co = v

pieces = [o for o in bpy.data.objects if o.type == 'MESH' and 'controle' in o]
bpy.ops.object.select_all(action='DESELECT')
for piece in pieces:
    piece.select_set(True)
    if piece.data.shape_keys:
        for cle in piece.data.shape_keys.key_blocks: cle.value = 0
bpy.context.view_layer.objects.active = pieces[0]
bpy.ops.export_scene.gltf(filepath=str(out / (nom + '.glb')), export_format='GLB', use_selection=True, export_yup=True,
    export_extras=True, export_animations=False, export_morph=True, export_cameras=False, export_lights=False,
    export_vertex_color='NAME', export_vertex_color_name='Pigment', export_all_vertex_colors=False)
triangles = 0
for piece in pieces: piece.data.calc_loop_triangles(); triangles += len(piece.data.loop_triangles)
scene = bpy.context.scene; cam = scene.camera
scene.render.engine = 'CYCLES'; scene.cycles.samples = 20; scene.render.resolution_x = 520; scene.render.resolution_y = 600
for vue, pos in [('trois-quarts', (.34, -.8, .10)), ('profil', (.9, -.02, .06)), ('dos', (-.3, .85, .12))]:
    cam.location = pos; cam.rotation_euler = (Vector((0, 0, .03)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(out / f'{nom}-{vue}.jpg'); bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out / (nom + '.blend')))
print('RAPPORT ' + json.dumps({'nom': nom, 'triangles': triangles, 'cheveux': len(d.polygons) * 2, 'oreille': [round(oy0, 4), round(oy1, 4), round(oz, 4)],
    'haut': round(haut, 4), 'centre': [round(x, 4) for x in c]}))

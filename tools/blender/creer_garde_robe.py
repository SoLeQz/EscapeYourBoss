"""Garde-robe de Lao D, modélisée dans Blender.

Chaque accessoire est construit ici (bmesh, modificateurs, courbes) autour de la
vraie tête et du vrai torse du joueur, puis exporté dans un seul GLB :
assets/garde-robe-v01.glb. Le jeu les accroche aux os `tete` (repère de la tête,
os à 1,63 m) et `buste` (os au bassin, 0,85 m) ; les coordonnées sont donc écrites
dans le repère de l'os, en axes du jeu (x : droite du personnage vue de face = -x
anatomique, y : haut, z : devant). Aucun os n'est tourné au repos.

blender --background --factory-startup --python-exit-code 1 --python creer_garde_robe.py -- \
  --atelier atelier.json --assets ../../assets --out NOUVEAU_DOSSIER
"""
import bpy, bmesh, sys, json, math, argparse
from pathlib import Path
from mathutils import Vector, Matrix, Euler

a = argparse.ArgumentParser()
a.add_argument('--atelier', required=True); a.add_argument('--assets', required=True); a.add_argument('--out', required=True)
a.add_argument('--sans-rendu', action='store_true')
args = a.parse_args(sys.argv[sys.argv.index('--') + 1:])
OUT = Path(args.out)
if OUT.exists(): raise RuntimeError('Dossier existant : choisir une nouvelle sortie.')
OUT.mkdir(parents=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene
COLL = bpy.data.collections.new('Garde-robe'); S.collection.children.link(COLL)


def J(x, y, z):
    """Coordonnées du jeu (x, y haut, z devant) → Blender (x, -z, y). L'export glTF +Y
    les ramène exactement aux coordonnées du jeu."""
    return Vector((x, -z, y))


# ---------------------------------------------------------------- matériaux
MATS = {}


def mat(nom, couleur, rugosite=.55, metal=0.0, emission=0.0):
    """Matériau exporté sous le nom GARDE_<nom> ; le jeu retrouve son rôle par ce nom."""
    if nom in MATS: return MATS[nom]
    m = bpy.data.materials.new('GARDE_' + nom); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*couleur, 1)
    b.inputs['Roughness'].default_value = rugosite; b.inputs['Metallic'].default_value = metal
    if emission:
        b.inputs['Emission Color'].default_value = (*couleur, 1); b.inputs['Emission Strength'].default_value = emission
    m.diffuse_color = (*couleur, 1)
    MATS[nom] = m
    return m


# Teintes « réglables » : le jeu remplace leur couleur par celle choisie au vestiaire.
TEINTE = lambda: mat('teinte', (.75, .12, .10), .6)
TEINTE2 = lambda: mat('teinte2', (.95, .93, .88), .6)
CHEVEUX = lambda: mat('cheveux', (.03, .02, .015), .45)   # prend la couleur de cheveux choisie
NOIR = lambda: mat('noir', (.02, .02, .025), .45)
BLANC = lambda: mat('blanc', (.92, .91, .88), .6)
OR = lambda: mat('or', (.95, .68, .18), .28, 1.0)
METAL = lambda: mat('metal', (.72, .74, .78), .3, 1.0)
VERRE_FONCE = lambda: mat('verreFonce', (.02, .025, .03), .05, .0)
VERRE_CLAIR = lambda: mat('verreClair', (.7, .8, .85), .05)
FLUO = lambda: mat('fluo', (.85, 1.0, .05), .5, 0, .35)
REFLECHISSANT = lambda: mat('reflechissant', (.82, .84, .86), .25, .6)
ROUGE = lambda: mat('rouge', (.85, .06, .05), .35)
CYAN = lambda: mat('cyan', (.05, .75, .9), .35)
JAUNE = lambda: mat('jaune', (1.0, .78, .05), .45)
BLEU = lambda: mat('bleu', (.06, .25, .85), .45)
ROSE = lambda: mat('rose', (1.0, .45, .65), .6)
VERT = lambda: mat('vert', (.12, .55, .18), .6)
FLAMME = lambda: mat('flamme', (1.0, .45, .05), .9, 0, 6.0)


# ---------------------------------------------------------------- outils de modélisation
def objet(nom, bm, materiaux):
    me = bpy.data.meshes.new(nom); bm.to_mesh(me); bm.free()
    for m in materiaux: me.materials.append(m)
    o = bpy.data.objects.new(nom, me); COLL.objects.link(o)
    for p in me.polygons: p.use_smooth = True
    return o


def appliquer(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)


def lisser(o, niveaux=1):
    m = o.modifiers.new('Subdivision', 'SUBSURF'); m.levels = niveaux; m.render_levels = niveaux; appliquer(o)


def epaisseur(o, e, offset=-1.0, mat_bord=None):
    m = o.modifiers.new('Épaisseur', 'SOLIDIFY'); m.thickness = e; m.offset = offset; m.use_even_offset = True
    if mat_bord is not None: m.material_offset = mat_bord; m.material_offset_rim = mat_bord
    appliquer(o)


def calotte(nom, centre, rx, ry, rz, coupe_bas, materiau, segments=40, anneaux=20, avant_plus_bas=0.0):
    """Demi-ellipsoïde ouvert en bas (crâne de chapeau). La coupe peut descendre à l'avant."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=anneaux, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co.x * rx, v.co.z * ry, -v.co.y * rz   # sphère Blender → axes du jeu
        v.co = J(centre[0] + x, centre[1] + y, centre[2] + z)
    # coupe : plan légèrement incliné (plus bas devant si demandé)
    supprimer = [v for v in bm.verts if (v.co.z - centre[1]) < coupe_bas - avant_plus_bas * max(0.0, -v.co.y - centre[2]) / rz]
    bmesh.ops.delete(bm, geom=supprimer, context='VERTS')
    return objet(nom, bm, [materiau])


def tore(nom, centre, rx, rz, rayon, materiau, segments=48, section=10, inclinaison=0.0, hauteur_avant=0.0):
    """Anneau horizontal elliptique (bandes, bords) ; peut s'incliner (plus bas devant)."""
    bm = bmesh.new()
    anneaux = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        cx, cz = math.sin(a) * rx, math.cos(a) * rz          # a = 0 : devant (+z)
        cy = hauteur_avant * math.cos(a) + inclinaison * math.sin(a)
        n = Vector((math.sin(a) / rx, 0, math.cos(a) / rz)).normalized()
        anneau = []
        for j in range(section):
            b = 2 * math.pi * j / section
            off = n * (math.cos(b) * rayon) + Vector((0, math.sin(b) * rayon, 0))
            anneau.append(bm.verts.new(J(centre[0] + cx + off.x, centre[1] + cy + off.y, centre[2] + cz + off.z)))
        anneaux.append(anneau)
    for i in range(segments):
        A, B = anneaux[i], anneaux[(i + 1) % segments]
        for j in range(section):
            bm.faces.new((A[j], A[(j + 1) % section], B[(j + 1) % section], B[j]))
    return objet(nom, bm, [materiau])


def courbe(nom, points, rayon, materiau, fermee=False, resolution=8):
    """Tube le long d'une polyligne lissée (branches, élastiques, sangles)."""
    cu = bpy.data.curves.new(nom, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = rayon; cu.bevel_resolution = 3
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(points) - 1); sp.use_cyclic_u = fermee
    for p, q in zip(sp.bezier_points, points):
        p.co = J(*q); p.handle_left_type = p.handle_right_type = 'AUTO'
    cu.resolution_u = resolution
    o = bpy.data.objects.new(nom, cu); COLL.objects.link(o)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o.select_set(False)
    o.data.materials.clear(); o.data.materials.append(materiau)
    for p in o.data.polygons: p.use_smooth = True
    return o


def boite(nom, centre, taille, materiau, biseau=.004, rotation=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * taille[0], v.co.y * taille[1], v.co.z * taille[2]))
    o = objet(nom, bm, [materiau])
    if biseau:
        m = o.modifiers.new('Biseau', 'BEVEL'); m.width = biseau; m.segments = 3; m.limit_method = 'NONE'; appliquer(o)
    # taille donnée en axes du jeu (x, y, z) : la boîte est construite en Blender (x, y, z) = (x, z_jeu, y_jeu)
    o.data.transform(Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1))))
    o.data.transform(Euler(rotation, 'XYZ').to_matrix().to_4x4())
    o.data.transform(Matrix.Translation(J(*centre)))
    return o


def cylindre(nom, centre, rayon, longueur, axe, materiau, segments=32, biseau=.003):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=rayon, radius2=rayon, depth=longueur)
    o = objet(nom, bm, [materiau])
    if biseau:
        m = o.modifiers.new('Biseau', 'BEVEL'); m.width = biseau; m.segments = 2; m.limit_method = 'ANGLE'; appliquer(o)
    rot = {'x': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'y': Matrix.Identity(4), 'z': Matrix.Rotation(math.pi / 2, 4, 'X')}[axe]
    o.data.transform(rot); o.data.transform(Matrix.Translation(J(*centre)))
    return o


def sphere(nom, centre, r, materiau, echelle=(1, 1, 1), segments=24):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=segments // 2, radius=r)
    for v in bm.verts:
        x, y, z = v.co.x * echelle[0], v.co.z * echelle[1], -v.co.y * echelle[2]
        v.co = J(centre[0] + x, centre[1] + y, centre[2] + z)
    return objet(nom, bm, [materiau])


def cone(nom, base, rayon, hauteur, materiau, segments=32, penche=(0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=rayon, radius2=0.002, depth=hauteur)
    for v in bm.verts:  # axe du cône = haut du jeu, base à `base`
        h = v.co.z + hauteur / 2
        x, z = v.co.x + penche[0] * h, -v.co.y + penche[1] * h
        v.co = J(base[0] + x, base[1] + h, base[2] + z)
    return objet(nom, bm, [materiau])


PIECES = []  # (objet, identifiant, os, rôle)


def piece(o, ident, os_, role=None):
    o['garde_id'] = ident; o['garde_os'] = os_
    if role: o['garde_role'] = role
    PIECES.append((o, ident, os_, role))
    return o


# =====================================================================
#  COUVRE-CHEFS — repère de l'os `tete` (cheveux : |x| ≤ 0,095, haut à y 0,146,
#  z de −0,118 à 0,111 ; le chignon descend à −0,142 à l'arrière).
# =====================================================================
def visiere(nom, centre, rx, rz, y, longueur, largeur, materiau, chute=.012):
    """Visière : plaque courbe qui part du bord avant d'une calotte."""
    bm = bmesh.new(); lignes = []
    nx, nu = 14, 6
    for i in range(nx + 1):
        x = -largeur + 2 * largeur * i / nx
        zb = centre[2] + rz * math.sqrt(max(0.0, 1 - (x / rx) ** 2)) - .004
        L = longueur * math.sqrt(max(0.0, 1 - (x / (largeur * 1.04)) ** 2))
        ligne = []
        for j in range(nu + 1):
            u = j / nu
            ligne.append(bm.verts.new(J(x, y - chute * u - .014 * (x / largeur) ** 2 * u, zb + L * u)))
        lignes.append(ligne)
    for i in range(nx):
        for j in range(nu):
            bm.faces.new((lignes[i][j], lignes[i + 1][j], lignes[i + 1][j + 1], lignes[i][j + 1]))
    o = objet(nom, bm, [materiau]); epaisseur(o, .005, 0); return o


def pompon(nom, centre, r, materiau):
    o = sphere(nom, centre, r, materiau, segments=20)
    import random; rnd = random.Random(nom)
    for v in o.data.vertices:  # touffe : bosses irrégulières
        d = v.co - J(*centre); v.co = J(*centre) + d * (1 + rnd.uniform(-.18, .18))
    return o


def couronne_bande(nom, y0, rx, rz, pointes, h_creux, h_pointe, materiau):
    bm = bmesh.new(); n = pointes * 8; bas, haut = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        x, z = math.sin(a) * rx, math.cos(a) * rz
        phase = (i % 8) / 8
        h = h_creux + (h_pointe - h_creux) * (1 - abs(phase * 2 - 1))  # dents en V
        bas.append(bm.verts.new(J(x, y0, z))); haut.append(bm.verts.new(J(x * 1.02, y0 + h, z * 1.02)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bas[i], bas[j], haut[j], haut[i]))
    o = objet(nom, bm, [materiau]); epaisseur(o, .003, 1); return o


def rebord(nom, centre, rx_in, rz_in, rx_out, rz_out, y, materiau, releve=0.0, avance=0.0):
    """Bord plat d'un chapeau (anneau entre deux ellipses) ; releve : côtés relevés."""
    bm = bmesh.new(); n = 64; A, B = [], []
    for i in range(n):
        a = 2 * math.pi * i / n; s, c = math.sin(a), math.cos(a)
        A.append(bm.verts.new(J(centre[0] + s * rx_in, y, centre[2] + c * rz_in)))
        B.append(bm.verts.new(J(centre[0] + s * rx_out, y + releve * s * s - .006 * c, centre[2] + c * rz_out + avance * max(0, c))))
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((A[i], A[j], B[j], B[i]))
    o = objet(nom, bm, [materiau]); epaisseur(o, .004, 0); return o


def couvre_chefs():
    T = 'tete'
    # Casquette : calotte en six pans (coutures), visière, bouton
    c = calotte('Casquette calotte', (0, .05, -.006), .107, .106, .123, 0, TEINTE()); epaisseur(c, .004, 1)
    piece(c, 'casquette', T)
    piece(visiere('Casquette visière', (0, .05, -.006), .107, .123, .054, .10, .088, TEINTE()), 'casquette', T)
    piece(sphere('Casquette bouton', (0, .157, -.006), .009, TEINTE2(), echelle=(1, .5, 1)), 'casquette', T)
    for k in range(6):  # coutures
        a = math.pi / 6 + k * math.pi / 3
        pts = [(math.sin(a) * .108 * math.sin(t), .05 + .107 * math.cos(t), -.006 + math.cos(a) * .124 * math.sin(t))
               for t in [math.pi / 2 * (1 - i / 6) for i in range(7)]]
        piece(courbe(f'Casquette couture {k}', pts, .0012, TEINTE2(), resolution=4), 'casquette', T)

    # Bonnet : calotte un peu lâche, revers épais, pompon
    b = calotte('Bonnet', (0, .034, -.008), .109, .13, .125, 0, TEINTE()); epaisseur(b, .005, 1)
    piece(b, 'bonnet', T)
    piece(tore('Bonnet revers', (0, .047, -.008), .113, .129, .017, TEINTE(), section=12), 'bonnet', T)
    piece(pompon('Bonnet pompon', (0, .178, -.012), .032, TEINTE2()), 'bonnet', T)

    # Casque de chantier : dôme, crête, large bord plus long devant
    h = calotte('Casque chantier dôme', (0, .058, -.006), .114, .112, .129, 0, JAUNE()); epaisseur(h, .004, 1)
    piece(h, 'casque-chantier', T)
    cr = calotte('Casque chantier crête', (0, .058, -.006), .03, .12, .135, .03, JAUNE()); piece(cr, 'casque-chantier', T)
    piece(rebord('Casque chantier bord', (0, 0, -.006), .114, .129, .14, .158, .058, JAUNE(), avance=.03), 'casque-chantier', T)
    piece(tore('Casque chantier bandeau', (0, .052, -.006), .1, .115, .006, NOIR()), 'casque-chantier', T)

    # Chapeau de fête : cône rayé penché, pompon, élastique sous le menton
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=36, radius1=.054, radius2=.003, depth=.165)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > .1], cuts=11, use_grid_fill=True)
    base, penche = (.018, .122, .006), (.18, .06)
    for v in bm.verts:
        hh = v.co.z + .0825
        v.co = J(base[0] + v.co.x + penche[0] * hh, base[1] + hh, base[2] - v.co.y + penche[1] * hh)
    o = objet('Chapeau de fête', bm, [TEINTE(), BLANC()])
    for p in o.data.polygons:
        hh = sum((o.data.vertices[i].co.z for i in p.vertices)) / len(p.vertices) - base[1]
        p.material_index = int(hh / .024) % 2
    epaisseur(o, .0025, 1); piece(o, 'chapeau-fete', T)
    piece(pompon('Chapeau de fête pompon', (base[0] + penche[0] * .165, base[1] + .168, base[2] + penche[1] * .165), .019, TEINTE2()), 'chapeau-fete', T)
    for s in (-1, 1):
        piece(courbe(f'Élastique {s}', [(base[0] + s * .05, base[1] + .002, base[2] + .01), (s * .104, .03, .03),
                                        (s * .1, -.12, .045), (s * .05, -.2, .06), (0, -.207, .062)], .0011, NOIR()), 'chapeau-fete', T)

    # Chapeau melon : dôme noir, bord relevé sur les côtés, ruban
    m = calotte('Melon dôme', (0, .074, -.006), .105, .108, .121, 0, NOIR()); epaisseur(m, .004, 1)
    piece(m, 'chapeau-melon', T)
    piece(rebord('Melon bord', (0, 0, -.006), .105, .121, .152, .168, .074, NOIR(), releve=.022), 'chapeau-melon', T)
    bm = bmesh.new()
    for i in range(64):
        a = 2 * math.pi * i / 64
        for y in (.08, .102):  # au-dessus du bord (0,074 ± 2 mm) : le ruban ne dépasse plus dessous
            bm.verts.new(J(math.sin(a) * .1075, y, -.006 + math.cos(a) * .1235))
    bm.verts.ensure_lookup_table()
    for i in range(64):
        j = (i + 1) % 64; bm.faces.new((bm.verts[2 * i], bm.verts[2 * j], bm.verts[2 * j + 1], bm.verts[2 * i + 1]))
    piece(objet('Melon ruban', bm, [TEINTE()]), 'chapeau-melon', T)

    # Bandeau de sport
    piece(tore('Bandeau', (0, .072, -.004), .101, .118, .012, TEINTE(), hauteur_avant=-.004), 'bandeau', T)
    piece(boite('Bandeau étiquette', (0, .069, .124), (.03, .012, .004), TEINTE2(), biseau=.0015), 'bandeau', T)

    # Casque audio : arceau, oreillettes, coussinets, coulisses
    piece(courbe('Casque audio arceau', [(-.108, .03, -.012), (-.1, .12, -.012), (0, .168, -.012), (.1, .12, -.012), (.108, .03, -.012)],
                 .0085, TEINTE()), 'casque-audio', T)
    for s in (-1, 1):
        piece(cylindre(f'Oreillette {s}', (s * .111, -.004, -.008), .043, .032, 'x', TEINTE()), 'casque-audio', T)
        piece(cylindre(f'Coussinet {s}', (s * .096, -.004, -.008), .038, .012, 'x', NOIR(), biseau=.004), 'casque-audio', T)
        piece(cylindre(f'Coulisse {s}', (s * .109, .033, -.012), .005, .03, 'y', METAL()), 'casque-audio', T)
        piece(cylindre(f'Logo {s}', (s * .128, -.004, -.008), .016, .004, 'x', TEINTE2()), 'casque-audio', T)

    # Oreilles de chat : serre-tête fin, deux oreilles triangulaires, intérieur rose
    piece(courbe('Serre-tête', [(-.1, .02, .004), (-.095, .11, .004), (0, .158, .004), (.095, .11, .004), (.1, .02, .004)],
                 .0045, TEINTE()), 'oreilles-chat', T)
    for s in (-1, 1):
        for nom_, base_, r_, h_, m_ in ((f'Oreille {s}', (s * .058, .138, .004), .036, .06, TEINTE()),
                                        (f'Oreille intérieur {s}', (s * .058, .141, .011), .024, .044, ROSE())):
            o = cone(nom_, base_, r_, h_, m_, segments=4, penche=(s * .35, 0))
            # aplatie d'avant en arrière autour de sa base : une oreille, pas une corne
            o.data.transform(Matrix.Translation(-J(*base_))); o.data.transform(Matrix.Scale(.3, 4, Vector((0, 1, 0))))
            o.data.transform(Matrix.Translation(J(*base_))); piece(o, 'oreilles-chat', T)

    # Casquette à hélice : pans multicolores, petite visière, mât et hélice qui tourne
    hc = calotte('Hélice calotte', (0, .05, -.006), .107, .104, .123, 0, ROUGE())
    couleurs = [ROUGE(), JAUNE(), BLEU(), VERT()]
    hc.data.materials.clear()
    for m_ in couleurs: hc.data.materials.append(m_)
    for p in hc.data.polygons:
        c = p.center; ang = math.atan2(c.x, -c.y)
        p.material_index = int(((ang + math.pi) / (2 * math.pi)) * 8) % 4
    epaisseur(hc, .004, 1); piece(hc, 'casquette-helice', T)
    piece(visiere('Hélice visière', (0, .05, -.006), .107, .123, .054, .06, .07, JAUNE()), 'casquette-helice', T)
    piece(cylindre('Hélice mât', (0, .168, -.006), .004, .03, 'y', METAL()), 'casquette-helice', T)
    pivot = (0, .185, -.006)
    for s in (-1, 1):
        pale = sphere(f'Pale {s}', (pivot[0] + s * .045, pivot[1], pivot[2]), .045, ROUGE() if s < 0 else BLEU(), echelle=(1, .08, .28), segments=20)
        pale.data.transform(Matrix.Translation(-J(*pivot)) )
        pale.data.transform(Matrix.Rotation(s * .35, 4, Vector((1, 0, 0))))
        pale.data.transform(Matrix.Translation(J(*pivot)))
        pale['garde_pivot'] = list(pivot); piece(pale, 'casquette-helice', T, 'helice')
    moyeu = sphere('Hélice moyeu', pivot, .008, JAUNE()); moyeu['garde_pivot'] = list(pivot)
    piece(moyeu, 'casquette-helice', T, 'helice')

    # Couronne en carton doré de l'employé du mois, pierres rouges et bleues
    piece(couronne_bande('Couronne', .096, .1, .116, 7, .032, .085, OR()), 'couronne', T)
    for k in range(7):
        a = 2 * math.pi * k / 7
        piece(sphere(f'Couronne perle {k}', (math.sin(a) * .104, .096 + .088, -.004 + math.cos(a) * .12), .007, OR()), 'couronne', T)
    piece(sphere('Couronne rubis', (0, .114, .118), .011, ROUGE(), echelle=(1, 1, .6)), 'couronne', T)
    for s in (-1, 1):
        a = s * .9
        piece(sphere(f'Couronne saphir {s}', (math.sin(a) * .103, .112, -.004 + math.cos(a) * .118), .008, BLEU(), echelle=(1, 1, .6)), 'couronne', T)


# =====================================================================
#  LUNETTES ET MOUSTACHES — posées sur la vraie tête (surface mesurée par lancer de rayons)
# =====================================================================
TETE_REF = None


def charger_tete_reference():
    """Tête « employé » importée pour mesurer le visage (nez, lèvre, tempes)."""
    global TETE_REF
    avant = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.assets) / 'tete-employe-v02.glb'))
    objs = [o for o in bpy.data.objects if o not in avant]
    ref = bpy.data.collections.new('Référence tête (non exportée)'); S.collection.children.link(ref)
    for o in objs:
        for c in list(o.users_collection): c.objects.unlink(o)
        ref.objects.link(o); o.hide_render = True
    bpy.context.view_layer.update()  # le lancer de rayons exige des maillages évalués
    peau = [o for o in objs if o.type == 'MESH' and o.active_material and o.active_material.name.endswith('peau')]
    TETE_REF = (objs, peau)


def surface_face(x, y, marge=.0):
    """z de la peau du visage (repère tête) au point (x, y), vu de face."""
    best = None
    for o in TETE_REF[1]:
        inv = o.matrix_world.inverted()
        orig, direc = inv @ J(x, y, .4), (inv.to_3x3() @ J(0, 0, -1)).normalized()
        ok, loc, _, _ = o.ray_cast(orig, direc)
        if ok:
            z = -(o.matrix_world @ loc).y
            best = z if best is None else max(best, z)
    return (best if best is not None else .09) + marge


def contour(n, fx, fy):
    return [(fx(2 * math.pi * i / n), fy(2 * math.pi * i / n)) for i in range(n)]


def verre(nom, centre, pts, z, materiau, bombe=.004):
    """Verre plein (éventail de triangles) légèrement bombé."""
    bm = bmesh.new(); c = bm.verts.new(J(centre[0], centre[1], z + bombe))
    bord = [bm.verts.new(J(centre[0] + px, centre[1] + py, z)) for px, py in pts]
    for i in range(len(bord)): bm.faces.new((c, bord[i], bord[(i + 1) % len(bord)]))
    return objet(nom, bm, [materiau])


def branches(ident, cote_ext, y, z_avant, materiau, rayon=.0013):
    for s in (-1, 1):
        piece(courbe(f'{ident} branche {s}', [(s * cote_ext, y, z_avant), (s * .09, y + .002, .06),
                                              (s * .095, y - .002, .0), (s * .094, y - .016, -.03)], rayon, materiau), ident, 'tete')


def lunettes():
    T = 'tete'; EX, EY = .036, .006
    # Au centre de l'œil, le rayon traverse l'orbite et touche l'intérieur du crâne :
    # on mesure la peau au sourcil, à la pommette et à la tempe.
    z = max(surface_face(EX, .032), surface_face(EX, -.022), surface_face(.058, .0)) + .016

    # Aviateur : gouttes fumées, fil doré, double pont
    goutte = contour(40, lambda a: .027 * math.cos(a), lambda a: .019 * math.sin(a) - .009 * max(0, -math.sin(a)) ** 1.5)
    for s in (-1, 1):
        pts = [(px + s * .004 * max(0, -py / .02) * (1 if px * s > 0 else 0), py) for px, py in goutte]
        piece(verre(f'Aviateur verre {s}', (s * EX, EY), pts, z, VERRE_FONCE()), 'aviateur', T)
        piece(courbe(f'Aviateur cercle {s}', [(s * EX + px, EY + py, z) for px, py in pts[::2]], .0011, OR(), fermee=True, resolution=3), 'aviateur', T)
    for dy in (.013, .02):
        piece(courbe(f'Aviateur pont {dy}', [(-.011, EY + dy - .004, z), (0, EY + dy, z + .002), (.011, EY + dy - .004, z)], .0011, OR()), 'aviateur', T)
    branches('aviateur', .062, EY + .012, z - .004, OR(), .0012)

    # Rondes : deux cercles fins, verres clairs
    rond = contour(36, lambda a: .02 * math.cos(a), lambda a: .02 * math.sin(a))
    for s in (-1, 1):
        piece(verre(f'Rondes verre {s}', (s * EX, EY), rond, z, VERRE_CLAIR(), .002), 'rondes', T)
        piece(tore(f'Rondes cercle {s}', (0, 0, 0), .0205, .0205, .0016, NOIR(), segments=36, section=8), 'rondes', T)
        o = PIECES[-1][0]  # anneau horizontal → vertical, face au regard
        o.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X')); o.data.transform(Matrix.Translation(J(s * EX, EY, z)))
    piece(courbe('Rondes pont', [(-.016, EY + .004, z), (0, EY + .012, z + .004), (.016, EY + .004, z)], .0015, NOIR()), 'rondes', T)
    branches('rondes', .056, EY + .003, z - .002, NOIR())

    # Lunettes pixel « deal with it » : blocs noirs et deux reflets blancs
    px = .0062
    rangs = ['XXXXXXXXXXXXXXXXXXXXXXXX',
             'XWWXXXXXXX....XWWXXXXXXX',
             '.XXWXXXXX......XXWXXXXX.',
             '..XXXXXX........XXXXXX..']
    for r, ligne in enumerate(rangs):
        for c_, ch in enumerate(ligne):
            if ch == '.': continue
            x = (c_ - (len(ligne) - 1) / 2) * px
            piece(boite(f'Pixel {r}-{c_}', (x, EY + .016 - r * px, z + .002), (px, px, px * .9), BLANC() if ch == 'W' else NOIR(), biseau=0), 'pixel', T)
    branches('pixel', .074, EY + .016, z, NOIR(), .0018)

    # Lunettes 3D en carton : monture blanche, verre rouge à gauche du personnage (+x), cyan à droite
    for (cx, cy, lx, ly) in [(0, EY + .021, .16, .008), (0, EY - .019, .16, .006), (0, EY + .001, .014, .034),
                             (-.078, EY + .001, .006, .034), (.078, EY + .001, .006, .034)]:
        piece(boite(f'3D monture {cx}-{cy}', (cx, cy, z), (lx, ly, .003), BLANC(), biseau=.0008), 'lunettes-3d', T)
    for s, m_ in ((1, ROUGE()), (-1, CYAN())):
        piece(boite(f'3D verre {s}', (s * .0395, EY + .001, z - .0005), (.057, .034, .0015), m_, biseau=0), 'lunettes-3d', T)
    for s in (-1, 1):
        piece(boite(f'3D branche {s}', (s * .085, EY + .012, z - .06), (.004, .008, .12), BLANC(), biseau=.0008,
                    rotation=(0, 0, 0)), 'lunettes-3d', T)


def moustaches():
    T = 'tete'
    y0 = -.058  # entre le nez (≈ −0,045) et la lèvre (−0,072)
    # Brosse : épaisse et droite
    pts = [(x, y0 - .002 * (x / .028) ** 2, surface_face(x, y0) + .004) for x in [-.028 + i * .007 for i in range(9)]]
    o = courbe('Moustache brosse', pts, .0065, CHEVEUX(), resolution=6)
    o.data.transform(Matrix.Translation(-J(0, y0, pts[4][2]))); o.data.transform(Matrix.Scale(.7, 4, Vector((0, 0, 1))))
    o.data.transform(Matrix.Translation(J(0, y0, pts[4][2]))); piece(o, 'moustache-brosse', T)
    # Guidon : fine, relevée et bouclée aux pointes
    for s in (-1, 1):
        pts = [(s * .002, y0 + .002, surface_face(0, y0) + .004)]
        for x, dy in [(.012, -.002), (.024, -.003), (.036, .0), (.046, .01), (.048, .02), (.042, .024), (.038, .019)]:
            pts.append((s * x, y0 + dy, surface_face(min(x, .04) * s, y0 + dy) + .004 - max(0, x - .04) * .3))
        piece(courbe(f'Moustache guidon {s}', pts, .0034, CHEVEUX(), resolution=6), 'moustache-guidon', T)


# =====================================================================
#  TORSE, COU ET DOS — construits en coordonnées monde du jeu d'après la veste
#  réelle du joueur (atelier), puis ramenés dans le repère de l'os `buste` (y 0,85).
# =====================================================================
ATELIER = json.loads(Path(args.atelier).read_text())


def sommets_monde(noeud):
    w = noeud['world']; pos = noeud['mesh']['attributes']['position']['values']
    M = Matrix([[w[c * 4 + r] for c in range(4)] for r in range(4)])
    return [M @ Vector(pos[i:i + 3]) for i in range(0, len(pos), 3)]


def veste_atelier():
    """La veste : maillage skinné sombre qui couvre le torse (y de 0,79 à 1,51)."""
    cands = [n for n in ATELIER['nodes'] if 'mesh' in n and n['mesh']['skin']]
    def score(n):
        v = sommets_monde(n); ys = [p.y for p in v]
        return (max(ys) > 1.45 and min(ys) > .7) * 10 - sum(n['mesh']['color'])
    return max(cands, key=score)


class Silhouette:
    """Surface du torse mesurée par lancers de rayons sur la vraie veste (au repos),
    manches retirées sous l'épaule. Chaque point est moyenné sur un petit voisinage
    (revers, boutons, poches). Les tranches de sommets étaient trop creuses : la veste
    est un maillage peu dense."""
    def __init__(self, noeuds):
        v, faces = [], []
        for noeud in noeuds:  # veste + chemise : le V de la veste laisse voir la chemise
            vn = sommets_monde(noeud); idx = noeud['mesh']['index'] or list(range(len(vn))); base = len(v); v += vn
            for i in range(0, len(idx), 3):
                c = (vn[idx[i]] + vn[idx[i + 1]] + vn[idx[i + 2]]) / 3
                if abs(c.x) > .19 and c.y < 1.36: continue  # manches
                faces.append([base + k for k in idx[i:i + 3]])
        me = bpy.data.meshes.new('Torse référence'); me.from_pydata([J(p.x, p.y, p.z) for p in v], [], faces)
        ref = bpy.data.collections.get('Référence tête (non exportée)')
        self.obj = bpy.data.objects.new('Torse référence (non exporté)', me); ref.objects.link(self.obj); self.obj.hide_render = True
        bpy.context.view_layer.update()
        self.cache = {}

    def _rayon(self, y, theta):
        cle = (round(y, 3), round(theta, 3))
        if cle not in self.cache:
            d = Vector((math.sin(theta), 0, math.cos(theta)))
            o = J(*(Vector((0, y, 0)) + d * .7)); di = J(*(-d))
            ok, loc, _, _ = self.obj.ray_cast(o, di)
            self.cache[cle] = math.hypot(loc.x, -loc.y) if ok else None
        return self.cache[cle]

    def rayon(self, y, theta):
        vals = [self._rayon(y + dy, theta + dt) for dy in (-.012, 0, .012) for dt in (-.07, 0, .07)]
        vals = [r for r in vals if r]
        return sum(vals) / len(vals) if vals else .15

    def point(self, y, theta, marge=0.0):
        """theta = 0 : devant (+z) ; π/2 : côté +x. Point de la surface + marge (repère monde du jeu)."""
        r = self.rayon(y, theta) + marge
        return math.sin(theta) * r, math.cos(theta) * r

    def devant(self, y, x, marge=0.0):
        """z de la face avant à l'abscisse x."""
        vals = []
        for dy in (-.01, 0, .01):
            ok, loc, _, _ = self.obj.ray_cast(J(x, y + dy, .7), J(0, 0, -1))
            if ok: vals.append(-loc.y)
        return (sum(vals) / len(vals) if vals else .12) + marge


SIL = None
BUSTE_Y = .85


def vers_buste(o):
    o.data.transform(Matrix.Translation(-J(0, BUSTE_Y, 0))); return o


def loft(nom, ys, n, marge, materiau, theta0=-math.pi, theta1=math.pi, ferme=True):
    """Tube (ou panneau) épousant la silhouette entre plusieurs hauteurs."""
    bm = bmesh.new(); rangs = []
    for y in ys:
        rang = []
        for i in range(n + (0 if ferme else 1)):
            t = theta0 + (theta1 - theta0) * i / n
            x, z = SIL.point(y, t, marge); rang.append(bm.verts.new(J(x, y, z)))
        rangs.append(rang)
    for a_, b_ in zip(rangs, rangs[1:]):
        m = len(a_)
        for i in range(m if ferme else m - 1):
            j = (i + 1) % m
            bm.faces.new((a_[i], a_[j], b_[j], b_[i]))
    return objet(nom, bm, [materiau])


def ruban(nom, chemin, lateral, largeur, materiau):
    """Bande plate le long d'un chemin (sangles, bretelles)."""
    bm = bmesh.new(); A, B = [], []
    for p in chemin:
        c = Vector(p); A.append(bm.verts.new(J(*(c - lateral * largeur / 2)))); B.append(bm.verts.new(J(*(c + lateral * largeur / 2))))
    for i in range(len(chemin) - 1): bm.faces.new((A[i], A[i + 1], B[i + 1], B[i]))
    return objet(nom, bm, [materiau])


def bretelle(nom, s, largeur, marge, materiau, y_bas=1.27):
    """Bretelle qui passe par-dessus l'épaule, de la poitrine au dos."""
    chemin = []
    for i in range(17):
        phi = math.pi * i / 16  # 0 devant, π derrière
        y = y_bas + (1.47 - y_bas) * math.sin(phi)
        x, zfront = SIL.point(y_bas + .02, 0, marge)
        _, zback = SIL.point(y_bas + .02, math.pi, marge)
        zc, rz = (zfront + zback) / 2, (zfront - zback) / 2 + marge
        chemin.append(Vector((s * .115, y, zc + rz * math.cos(phi))))
    o = ruban(nom, chemin, Vector((1, 0, 0)), largeur, materiau); epaisseur(o, .004, 0); return o


def torse_et_dos():
    global SIL
    chemise = max((n for n in ATELIER['nodes'] if 'mesh' in n and n['mesh']['skin']), key=lambda n: sum(n['mesh']['color']))
    SIL = Silhouette([veste_atelier(), chemise])
    B = 'buste'

    # Gilet fluo : corps, bretelles, bandes réfléchissantes
    ys = [1.0 + i * .02 for i in range(17)]
    g = loft('Gilet fluo', ys, 64, .012, FLUO()); epaisseur(g, .004, 1); piece(vers_buste(g), 'gilet-fluo', B)
    for y0 in (1.05, 1.13):
        b = loft(f'Gilet bande {y0}', [y0, y0 + .026], 64, .0175, REFLECHISSANT()); piece(vers_buste(b), 'gilet-fluo', B)
    for s in (-1, 1):
        piece(vers_buste(bretelle(f'Gilet bretelle {s}', s, .075, .012, FLUO())), 'gilet-fluo', B)
        piece(vers_buste(bretelle(f'Gilet bretelle bande {s}', s, .026, .018, REFLECHISSANT())), 'gilet-fluo', B)

    # Cape : nappe évasée qui tombe des épaules, plis, doublure sombre, agrafes dorées
    bm = bmesh.new(); nu, nv = 20, 14; grille = []
    for j in range(nv + 1):
        v = j / nv; y = 1.43 - (1.43 - .8) * v; rang = []
        for i in range(nu + 1):
            u = i / nu; x = (-.19 - .12 * v) + (.38 + .24 * v) * u
            _, zdos = SIL.point(min(max(y, .95), 1.42), math.pi, .014)
            z = zdos - .008 - .09 * v ** 1.5 + .01 * math.sin(u * math.pi * 6) * v
            if v < .15:  # le haut s'enroule un peu sur les épaules
                z += (abs(u * 2 - 1) ** 3) * .06 * (1 - v / .15)
            rang.append(bm.verts.new(J(x, y, z)))
        grille.append(rang)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((grille[j][i], grille[j][i + 1], grille[j + 1][i + 1], grille[j + 1][i]))
    cape = objet('Cape', bm, [TEINTE(), NOIR()]); epaisseur(cape, .004, 1, mat_bord=1); lisser(cape)
    piece(vers_buste(cape), 'cape', B)
    for s in (-1, 1):
        piece(vers_buste(courbe(f'Cape attache {s}', [(s * .19, 1.43, -.06), (s * .16, 1.47, .0), (s * .08, 1.44, .09)], .006, TEINTE())), 'cape', B)
        piece(vers_buste(cylindre(f'Cape agrafe {s}', (s * .075, 1.435, .1), .016, .006, 'z', OR())), 'cape', B)

    # Nœud papillon : deux ailes pincées au centre, nœud
    chemise = max((n for n in ATELIER['nodes'] if 'mesh' in n and n['mesh']['skin']), key=lambda n: sum(n['mesh']['color']))
    zf = max(p.z for p in sommets_monde(chemise) if abs(p.y - 1.455) < .012 and abs(p.x) < .03)
    for s in (-1, 1):
        aile = sphere(f'Papillon aile {s}', (s * .027, 1.455, zf + .012), .03, TEINTE(), echelle=(1, .6, .35), segments=20)
        for v in aile.data.vertices:
            dx = abs(v.co.x) / .057
            v.co.z = 1.455 + (v.co.z - 1.455) * (.35 + .65 * min(1, dx * 1.8))
        piece(vers_buste(aile), 'noeud-papillon', B)
    piece(vers_buste(sphere('Papillon nœud', (0, 1.455, zf + .016), .01, TEINTE(), echelle=(1, 1.2, .9))), 'noeud-papillon', B)

    # Collier de fleurs hawaïen : fleurs à cinq pétales tout autour du cou
    petales = [ROSE(), BLANC(), JAUNE(), ROUGE()]; n = 22
    for k in range(n):
        th = -math.pi + 2 * math.pi * (k + .5) / n; c_ = math.cos(th)
        x = .13 * math.sin(th) * (1 + .25 * max(0.0, c_))
        if c_ > 0:   # devant : il tombe sur la poitrine
            y = 1.455 - .13 * c_ ** 2; z = SIL.devant(y, x, .016)
        else:        # derrière et sur les côtés : posé sur les épaules, près du cou
            y = 1.47 - .015 * (1 + c_); z = -.02 + .09 * c_
        centre = Vector((x, y, z)); normale = Vector((math.sin(th) * .6, .5 + .5 * max(0, -c_), max(0.0, c_) + .15)).normalized()
        u = normale.cross(Vector((0, 1, 0))).normalized(); w = normale.cross(u).normalized()
        for p in range(5):
            a = 2 * math.pi * p / 5 + k
            c = centre + (u * math.cos(a) + w * math.sin(a)) * .011
            pe = sphere(f'Fleur {k}-{p}', tuple(c), .0085, petales[k % 4], echelle=(1, 1, 1), segments=10)
            piece(vers_buste(pe), 'collier-fleurs', B)
        piece(vers_buste(sphere(f'Cœur {k}', tuple(centre + normale * .004), .005, JAUNE(), segments=8)), 'collier-fleurs', B)

    # Sac de livreur : gros cube thermique, couvercle, bande réfléchissante, logo
    zdos = min(SIL.point(1.03 + k * .02, math.pi, 0)[1] for k in range(18))  # un sac rigide touche le dos au point le plus saillant
    liv = boite('Sac livreur', (0, 1.21, zdos - .145), (.34, .36, .27), TEINTE(), biseau=.018); piece(vers_buste(liv), 'sac-livreur', B)
    piece(vers_buste(boite('Livreur couvercle', (0, 1.37, zdos - .145), (.35, .02, .28), TEINTE2(), biseau=.006)), 'sac-livreur', B)
    piece(vers_buste(boite('Livreur bande', (0, 1.12, zdos - .282), (.27, .028, .004), REFLECHISSANT(), biseau=0)), 'sac-livreur', B)
    piece(vers_buste(cylindre('Livreur logo', (0, 1.25, zdos - .281), .05, .004, 'z', TEINTE2())), 'sac-livreur', B)

    # Jetpack : deux réservoirs, bagues rouges, bloc central, tuyères, flammes animées
    jz = zdos - .066
    for s in (-1, 1):
        cx = s * .072
        piece(vers_buste(cylindre(f'Réservoir {s}', (cx, 1.23, jz), .058, .24, 'y', METAL(), segments=32)), 'jetpack', B)
        for yy in (1.35, 1.11):
            piece(vers_buste(sphere(f'Réservoir calotte {s}{yy}', (cx, yy, jz), .058, METAL(), echelle=(1, .55, 1))), 'jetpack', B)
        for yy in (1.3, 1.16):
            piece(vers_buste(tore(f'Bague {s}{yy}', (cx, yy, jz), .06, .06, .006, ROUGE(), segments=32, section=8)), 'jetpack', B)
        buse = cone(f'Tuyère {s}', (cx, 1.03, jz), .03, .07, NOIR(), segments=24)
        piece(vers_buste(buse), 'jetpack', B)
        flamme = cone(f'Flamme {s}', (cx, 1.03, jz), .024, .11, FLAMME(), segments=16)
        flamme.data.transform(Matrix.Translation(-J(cx, 1.03, jz))); flamme.data.transform(Matrix.Scale(-1, 4, Vector((0, 0, 1))))
        flamme.data.transform(Matrix.Translation(J(cx, 1.03, jz)))
        flamme['garde_pivot'] = [cx, 1.03 - BUSTE_Y, jz]; piece(vers_buste(flamme), 'jetpack', B, 'flamme')
    piece(vers_buste(boite('Jetpack bloc', (0, 1.24, jz + .02), (.06, .22, .07), NOIR(), biseau=.008)), 'jetpack', B)

    # Sac banane porté en bandoulière : poche sur la poitrine, sangle qui fait le tour
    chemin = []
    for k in range(73):
        th = -math.pi + 2 * math.pi * k / 72
        y = 1.235 - .19 * math.sin(th)
        x, z = SIL.point(min(max(y, .95), 1.46), th, .009); chemin.append(Vector((x, y, z)))
    sangle = courbe('Banane sangle', [tuple(p) for p in chemin], .006, NOIR(), fermee=True, resolution=2)
    piece(vers_buste(sangle), 'sac-banane', B)
    _, zf2 = SIL.point(1.235, 0, 0)
    piece(vers_buste(boite('Banane poche', (0, 1.235, zf2 + .035), (.18, .085, .055), TEINTE(), biseau=.02, rotation=(0, .33, 0))), 'sac-banane', B)
    piece(vers_buste(boite('Banane zip', (0, 1.262, zf2 + .062), (.15, .006, .006), METAL(), biseau=.001, rotation=(0, .33, 0))), 'sac-banane', B)


# =====================================================================
#  MANNEQUIN, PLANCHES DE CONTRÔLE, EXPORT
# =====================================================================
OS_MONDE = {'tete': J(0, 1.63, 0), 'buste': J(0, BUSTE_Y, 0)}


def mannequin():
    """Le joueur au repos, reconstruit depuis l'atelier : sert à juger l'ajustement."""
    objs = []
    for n in ATELIER['nodes']:
        if 'mesh' not in n: continue
        v = sommets_monde(n); idx = n['mesh']['index'] or list(range(len(v)))
        me = bpy.data.meshes.new('Mannequin'); me.from_pydata([J(p.x, p.y, p.z) for p in v], [], [idx[i:i + 3] for i in range(0, len(idx), 3)])
        m = bpy.data.materials.new('Mannequin'); m.diffuse_color = (*n['mesh']['color'], 1); me.materials.append(m)
        o = bpy.data.objects.new('Mannequin ' + str(n['name'] or n['id']), me); S.collection.objects.link(o)
        for p in me.polygons: p.use_smooth = True
        ys = [p.y for p in v]; zs = [p.z for p in v]
        o['role'] = ('sac' if max(zs) < -.1 and min(ys) > .9 else 'cravate' if n['mesh']['color'][0] > .15 and n['mesh']['color'][1] < .06
                     else 'monture' if 'monture' in str(n['name']) else '')
        objs.append(o)
    return objs


def rendu_planche(nom, lignes, vues, taille=(300, 330)):
    """lignes : [(identifiant, rôles du mannequin à masquer)] ; vues : [(position, cible, échelle)]."""
    import numpy as np
    S.render.engine = 'BLENDER_WORKBENCH'; S.display.shading.light = 'STUDIO'; S.display.shading.color_type = 'MATERIAL'
    S.display.shading.show_cavity = True; S.render.resolution_x, S.render.resolution_y = taille
    S.render.image_settings.file_format = 'PNG'; S.world = S.world or bpy.data.worlds.new('Fond')
    cam = bpy.data.objects.get('Caméra planche') or bpy.data.objects.new('Caméra planche', bpy.data.cameras.new('Caméra planche'))
    if cam.name not in S.collection.objects: S.collection.objects.link(cam)
    cam.data.type = 'ORTHO'; S.camera = cam
    tuiles = []
    for ident, masques in lignes:
        for o in MANNEQUIN: o.hide_render = o['role'] in masques
        for o, i, os_, _ in PIECES:
            o.hide_render = i != ident; o.location = OS_MONDE[os_]
        rang = []
        for pos, cible, echelle in vues:
            cam.location = pos; cam.rotation_euler = (Vector(cible) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler(); cam.data.ortho_scale = echelle
            f = str(OUT / f'_tmp_{nom}.png'); S.render.filepath = f; bpy.ops.render.render(write_still=True)
            im = bpy.data.images.load(f); px = np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4); bpy.data.images.remove(im); Path(f).unlink()
            rang.append(px)
        tuiles.append(np.concatenate(rang, 1))
    P = np.concatenate(tuiles[::-1], 0)
    im = bpy.data.images.new(nom, P.shape[1], P.shape[0]); im.pixels = P.ravel().tolist(); im.filepath_raw = str(OUT / f'{nom}.png'); im.file_format = 'PNG'; im.save()
    for o in MANNEQUIN: o.hide_render = False
    for o, *_ in PIECES: o.location = (0, 0, 0); o.hide_render = False


charger_tete_reference()
couvre_chefs(); lunettes(); moustaches(); torse_et_dos()

rapport = {}
for o, ident, os_, role in PIECES:
    tri = sum(len(p.vertices) - 2 for p in o.data.polygons)
    r = rapport.setdefault(ident, {'os': os_, 'objets': 0, 'triangles': 0, 'materiaux': set(), 'roles': set()})
    r['objets'] += 1; r['triangles'] += tri; r['materiaux'].update(m.name for m in o.data.materials)
    if role: r['roles'].add(role)
for r in rapport.values(): r['materiaux'] = sorted(r['materiaux']); r['roles'] = sorted(r['roles'])
(OUT / 'rapport.json').write_text(json.dumps(rapport, indent=1, ensure_ascii=False) + '\n')
print('GARDE-ROBE', json.dumps({k: v['triangles'] for k, v in rapport.items()}))

if not args.sans_rendu:
    MANNEQUIN = mannequin()
    tete = [(J(0, 1.66, 1.6), J(0, 1.66, 0), .42), (J(.9, 1.7, 1.3), J(0, 1.66, 0), .42), (J(1.6, 1.66, 0), J(0, 1.66, 0), .42)]
    torse = [(J(0, 1.2, 2), J(0, 1.18, 0), .95), (J(1.4, 1.25, -1.4), J(0, 1.18, 0), .95), (J(1.8, 1.2, 0), J(0, 1.18, 0), .95)]
    rendu_planche('planche-couvre-chefs', [(i, ()) for i in ['casquette', 'bonnet', 'casque-chantier', 'chapeau-fete', 'chapeau-melon',
                                                            'bandeau', 'casque-audio', 'oreilles-chat', 'casquette-helice', 'couronne']], tete)
    rendu_planche('planche-visage', [(i, ('monture',)) for i in ['aviateur', 'rondes', 'pixel', 'lunettes-3d', 'moustache-brosse', 'moustache-guidon']], tete)
    rendu_planche('planche-torse', [(i, ('sac', 'cravate') if i in ('cape', 'noeud-papillon', 'collier-fleurs', 'sac-livreur', 'jetpack', 'sac-banane') else ('sac',))
                                    for i in ['gilet-fluo', 'cape', 'noeud-papillon', 'collier-fleurs', 'sac-livreur', 'jetpack', 'sac-banane']], torse)

# Export : uniquement les pièces, à l'origine, géométrie dans le repère de leur os.
bpy.ops.object.select_all(action='DESELECT')
for o, *_ in PIECES: o.select_set(True); o.location = (0, 0, 0)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'garde-robe-v01.glb'), export_format='GLB', use_selection=True, export_extras=True,
                          export_apply=True, export_yup=True, export_animations=False, export_cameras=False, export_lights=False,
                          export_materials='EXPORT')
for o in list(S.collection.objects):
    if o.name.startswith('Mannequin') or o.name == 'Caméra planche': o.hide_viewport = True
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'garde-robe-v01.blend'))
print('EXPORT', (OUT / 'garde-robe-v01.glb').stat().st_size)

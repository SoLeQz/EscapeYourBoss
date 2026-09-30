"""Accessoires interactifs et secrets des étages, modélisés dans Blender.

Canards de débogage, distributeur, disjoncteur, carton-cachette, aspirateur robot,
nacelle du laveur de vitres, toboggan d'évacuation, pièce secrète (étagère pivotante,
hamac, bouton rouge, borne d'arcade). Un seul GLB : assets/accessoires-v01.glb.

Repère : celui du jeu (x droite, y haut, z devant), origine au sol au centre de
l'objet, face avant vers +z. Les objets muraux ont leur origine au pied du mur.
Couleurs par sommet (attribut « Couleur ») sur trois matériaux partagés :
ACC_peint (mat), ACC_verni (brillant), ACC_lumiere (lumineux). Les autres matériaux
(ACC_carton, ACC_boisFonce, ACC_verre…) sont ceux du niveau : le jeu les fusionne
avec le décor. Propriétés exportées : acc_id, acc_role, acc_pivot.

blender --background --factory-startup --python-exit-code 1 --python creer_accessoires.py -- \
  --out NOUVEAU_DOSSIER [--sans-rendu]
"""
import bpy, bmesh, sys, json, math, argparse
from pathlib import Path
from mathutils import Vector, Matrix, Euler

a = argparse.ArgumentParser()
a.add_argument('--out', required=True); a.add_argument('--sans-rendu', action='store_true')
args = a.parse_args(sys.argv[sys.argv.index('--') + 1:])
OUT = Path(args.out)
if OUT.exists(): raise RuntimeError('Dossier existant : choisir une nouvelle sortie.')
OUT.mkdir(parents=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene
COLL = bpy.data.collections.new('Accessoires'); S.collection.children.link(COLL)


def J(x, y, z):
    """Jeu (x, y haut, z devant) → Blender (x, -z, y). L'export glTF +Y revient au jeu."""
    return Vector((x, -z, y))


def lin(h):
    """Couleur hexadécimale sRGB → linéaire (les couleurs de sommet glTF sont linéaires)."""
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)


# ---------------------------------------------------------------- matériaux
MATS = {}
NIVEAU = {'carton': 0xa7865a, 'boisFonce': 0x5a3b28, 'bois': 0xb48a5e, 'alu': 0xc9ccd1, 'aluSombre': 0x4a4e55,
          'plastiqueNoir': 0x1d1f22, 'plastiqueBlanc': 0xe9e7e2, 'verre': 0x9ec3cf, 'papier': 0xf1efe8,
          'tissuCanape': 0x5d6b73, 'laiton': 0xc8a24a}


def materiau(nom):
    """ACC_peint / ACC_verni / ACC_lumiere lisent la couleur des sommets ; les autres
    portent le nom d'un matériau du niveau et une couleur indicative pour les planches."""
    if nom in MATS: return MATS[nom]
    m = bpy.data.materials.new('ACC_' + nom); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    if nom in ('peint', 'verni', 'lumiere'):
        attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Couleur'
        nt.links.new(attr.outputs['Color'], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = {'peint': .6, 'verni': .25, 'lumiere': .5}[nom]
        b.inputs['Metallic'].default_value = .35 if nom == 'verni' else 0
        if nom == 'lumiere':
            nt.links.new(attr.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 2
    else:
        c = lin(NIVEAU[nom]); b.inputs['Base Color'].default_value = (*c, 1); m.diffuse_color = (*c, 1)
    MATS[nom] = m
    return m


# ---------------------------------------------------------------- outils
PIECES = []


def objet(nom, bm, mat, couleur):
    # matériau du niveau : couleur indicative pour les planches (non exportée)
    if mat in NIVEAU and not couleur: couleur = NIVEAU[mat]
    me = bpy.data.meshes.new(nom); bm.to_mesh(me); bm.free()
    me.materials.append(materiau(mat))
    o = bpy.data.objects.new(nom, me); COLL.objects.link(o)
    colorer(o, couleur)
    return o


def colorer(o, couleur):
    me = o.data
    if 'Couleur' in me.color_attributes: me.color_attributes.remove(me.color_attributes['Couleur'])
    at = me.color_attributes.new('Couleur', 'FLOAT_COLOR', 'CORNER')
    c = (*lin(couleur), 1.0)
    for d in at.data: d.color = c
    me.color_attributes.active_color = at


def lisse(o, angle=40):
    for p in o.data.polygons: p.use_smooth = True
    try: o.data.set_sharp_from_angle(angle=math.radians(angle))
    except AttributeError: pass


def appliquer(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)


def boite(nom, centre, taille, mat, couleur, biseau=.004, rotation=(0, 0, 0), pivot=None):
    """Boîte en axes du jeu ; `rotation` (rx, ry, rz) en radians autour de `pivot` (défaut : centre)."""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
    for v in bm.verts: v.co = Vector((v.co.x * taille[0], v.co.y * taille[1], v.co.z * taille[2]))
    o = objet(nom, bm, mat, couleur)
    if biseau:
        m = o.modifiers.new('Biseau', 'BEVEL'); m.width = min(biseau, min(taille) * .45); m.segments = 2; m.limit_method = 'NONE'; appliquer(o)
    placer(o, centre, rotation, pivot)
    lisse(o, 30)
    return o


def placer(o, centre, rotation=(0, 0, 0), pivot=None):
    """Les maillages sont construits en coordonnées du jeu autour de l'origine. On les
    tourne (angles du jeu, autour de `pivot` s'il est donné, sinon du centre), on les
    pose, puis on passe en axes Blender (J est une rotation : les faces restent à l'endroit)."""
    R = Euler(rotation, 'XYZ').to_matrix()
    c = Vector(centre)
    for v in o.data.vertices:
        g = Vector(v.co)
        g = R @ (g + c - Vector(pivot)) + Vector(pivot) if pivot is not None else R @ g + c
        v.co = J(*g)
    o.data.update()


def cylindre(nom, centre, rayon, longueur, axe, mat, couleur, segments=20, rayon2=None, rotation=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=rayon, radius2=rayon if rayon2 is None else rayon2,
                          depth=longueur, calc_uvs=True)
    # cône construit le long de z : on l'aligne sur l'axe du jeu demandé
    rot = {'y': Matrix.Rotation(-math.pi / 2, 4, 'X'), 'x': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'z': Matrix.Identity(4)}[axe]
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    o = objet(nom, bm, mat, couleur)
    placer(o, centre, rotation)
    lisse(o, 35)
    return o


def sphere(nom, centre, r, mat, couleur, echelle=(1, 1, 1), segments=16, coupe_bas=None, rotation=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=max(6, segments // 2), radius=r, calc_uvs=True)
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(-math.pi / 2, 4, 'X'), verts=bm.verts)   # pôles sur l'axe vertical du jeu
    for v in bm.verts: v.co = Vector((v.co.x * echelle[0], v.co.y * echelle[1], v.co.z * echelle[2]))
    if coupe_bas is not None:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < coupe_bas - 1e-6], context='VERTS')
    o = objet(nom, bm, mat, couleur)
    placer(o, centre, rotation)
    lisse(o, 80)
    return o


def tube(nom, points, rayon, mat, couleur, resolution=6):
    cu = bpy.data.curves.new(nom, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = rayon; cu.bevel_resolution = 2
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY'); sp.points.add(len(points) - 1)
    for p, q in zip(sp.points, points): p.co = (*J(*q), 1)
    cu.resolution_u = resolution
    o = bpy.data.objects.new(nom, cu); COLL.objects.link(o)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o.select_set(False)
    o.data.materials.clear(); o.data.materials.append(materiau(mat))
    colorer(o, couleur or NIVEAU.get(mat, 0)); lisse(o, 50)
    return o


def piece(objets, ident, role=None, pivot=None):
    for o in objets if isinstance(objets, (list, tuple)) else [objets]:
        o['acc_id'] = ident
        if role: o['acc_role'] = role
        if pivot is not None: o['acc_pivot'] = list(pivot)
        PIECES.append((o, ident, role))


# Palette
JAUNE_CANARD, ORANGE, NOIR, BLANC, ROUGE = 0xffc61a, 0xff7a12, 0x111114, 0xf3f1ea, 0xc8191e
GRIS, GRIS_CLAIR, GRIS_FONCE = 0x8d9298, 0xc3c7cc, 0x2e3035


# ================================================================ canard de débogage
def canard():
    o = []
    o.append(sphere('Canard corps', (0, .036, -.004), .05, 'peint', JAUNE_CANARD, (1.0, .74, 1.25), 12))
    o.append(sphere('Canard queue', (0, .058, -.064), .02, 'peint', JAUNE_CANARD, (1.0, 1.1, 1.0), 8, rotation=(-.7, 0, 0)))
    o.append(sphere('Canard tête', (0, .089, .03), .034, 'peint', JAUNE_CANARD, (1, 1, 1), 12))
    o.append(sphere('Canard bec', (0, .083, .064), .021, 'peint', ORANGE, (1.0, .38, 1.0), 10))
    for s in (-1, 1):
        o.append(sphere(f'Canard œil {s}', (s * .017, .097, .058), .0062, 'peint', NOIR, (1, 1, 1), 8))
        o.append(sphere(f'Canard aile {s}', (s * .047, .042, -.008), .03, 'peint', 0xf2b20f, (.35, .62, 1.0), 8))
    piece(o, 'canard')


# ================================================================ distributeur
def distributeur():
    R, SIDE = 0xa3151d, 0x1c1d22
    o = []
    W, H, D = .95, 1.85, .85
    # coque : flancs, dessus, socle, dos, colonne de commande
    for s in (-1, 1): o.append(boite(f'Distributeur flanc {s}', (s * (W / 2 - .03), H / 2, 0), (.06, H, D), 'peint', SIDE, .008))
    o.append(boite('Distributeur dessus', (0, H - .09, 0), (W, .18, D), 'peint', R, .01))
    o.append(boite('Distributeur socle', (0, .19, 0), (W, .38, D), 'peint', R, .01))
    o.append(boite('Distributeur dos', (0, H / 2, -D / 2 + .03), (W, H, .06), 'peint', SIDE, .006))
    o.append(boite('Distributeur colonne', (.305, 1.0, .01), (.25, 1.26, D - .02), 'peint', R, .006))
    # vitrine : fond sombre, tablettes, friandises
    o.append(boite('Distributeur fond', (-.12, 1.02, -.34), (.6, 1.26, .02), 'peint', 0x121216, 0))
    couleurs = [0xff8a1c, 0x2a64d6, 0x3cae4a, 0x8a3bc4, 0xf2d21a, 0xe0452c]
    for i in range(5):
        y = .47 + i * .245
        o.append(boite(f'Tablette {i}', (-.12, y, -.08), (.58, .012, .5), 'verni', GRIS_CLAIR, 0))
        o.append(boite(f'Étiquettes {i}', (-.12, y + .012, .17), (.56, .02, .01), 'peint', BLANC, 0))
        for j in range(4):
            x = -.34 + j * .145
            c = couleurs[(i * 2 + j) % len(couleurs)]
            if (i + j) % 3 == 0:
                for k in range(2):
                    o.append(cylindre(f'Canette {i}{j}{k}', (x, y + .07, .06 - k * .13), .032, .12, 'y', 'verni', c, 8))
            else:
                bascule = (0.5, 0, .12) if (i, j) == (2, 1) else (0, 0, 0)   # le paquet coincé
                for k in range(2 if (i, j) != (2, 1) else 1):
                    o.append(boite(f'Paquet {i}{j}{k}', (x, y + .085, .09 - k * .13 + (.05 if bascule[0] else 0)), (.11, .15, .035), 'peint', c, 0, bascule))
    o.append(boite('Distributeur vitre', (-.12, 1.02, .405), (.62, 1.28, .012), 'verre', 0, 0))
    # commandes
    o.append(boite('Écran prix', (.305, 1.42, .425), (.17, .06, .01), 'lumiere', 0x49f28a, 0))
    for r in range(4):
        for c in range(3):
            o.append(boite(f'Touche {r}{c}', (.255 + c * .05, 1.3 - r * .045, .428), (.035, .03, .012), 'verni', GRIS_CLAIR, 0))
    o.append(boite('Fente pièces', (.305, 1.05, .426), (.06, .1, .012), 'verni', GRIS, .003))
    o.append(boite('Fente noire', (.305, 1.05, .433), (.008, .06, .004), 'peint', NOIR, 0))
    o.append(boite('Trappe', (-.12, .24, .425), (.58, .17, .02), 'peint', NOIR, .004))
    o.append(boite('Poignée trappe', (-.12, .31, .44), (.2, .025, .02), 'verni', GRIS_CLAIR, .004))
    o.append(boite('Bandeau lumineux', (0, 1.745, .428), (.84, .1, .01), 'lumiere', 0xffe3a0, 0))
    for s in (-1, 1): o.append(boite(f'Pied {s}', (s * .38, .02, 0), (.1, .04, .7), 'peint', NOIR, .004))
    piece(o, 'distributeur')


# ================================================================ disjoncteur (mural)
def disjoncteur():
    o = [boite('Armoire', (0, 1.45, .06), (.46, .62, .12), 'peint', 0x9aa0a6, .008),
         boite('Porte armoire', (0, 1.45, .122), (.42, .58, .006), 'peint', 0xb4b9bf, .003),
         cylindre('Gaine', (-.15, 2.68, .05), .025, 1.84, 'y', 'peint', 0x9aa0a6, 12)]
    # triangle « danger » et éclair
    bm = bmesh.new()
    vs = [bm.verts.new(Vector(p)) for p in ((-.07, 0, 0), (.07, 0, 0), (0, .12, 0))]
    bm.faces.new(vs); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.004)
    tri = objet('Danger', bm, 'peint', 0xf6c416); placer(tri, (.0, 1.6, .126)); o.append(tri)
    o.append(boite('Éclair a', (.006, 1.655, .131), (.012, .04, .003), 'peint', NOIR, 0, (0, 0, -.5)))
    o.append(boite('Éclair b', (-.004, 1.628, .131), (.012, .035, .003), 'peint', NOIR, 0, (0, 0, -.5)))
    piece(o, 'disjoncteur')
    # manette : pivot sur son axe, levée = lumière
    P = (.12, 1.33, .15)
    lev = [boite('Manette', (P[0], P[1] + .07, P[2]), (.035, .14, .035), 'verni', GRIS_FONCE, .006),
           sphere('Pommeau', (P[0], P[1] + .15, P[2]), .03, 'verni', ROUGE, (1, 1, 1), 14),
           cylindre('Axe', P, .02, .07, 'x', 'verni', GRIS, 12)]
    piece(lev, 'disjoncteur', 'levier', P)


# ================================================================ carton-cachette
def carton():
    W, H = .82, 1.0
    o = []
    for s in (-1, 1):
        o.append(boite(f'Carton flanc {s}', (s * (W / 2 - .006), H / 2, 0), (.012, H, W), 'carton', 0, .003))
        o.append(boite(f'Carton face {s}', (0, H / 2, s * (W / 2 - .006)), (W, H, .012), 'carton', 0, .003))
        o.append(boite(f'Rabat {s}', (s * W / 4, H + .004, 0), (W / 2 - .01, .01, W - .01), 'carton', 0, .002, (0, 0, s * .04)))
    o.append(boite('Scotch dessus', (0, H + .012, 0), (.07, .004, W + .02), 'peint', 0xd8c49a, 0))
    for s in (-1, 1): o.append(boite(f'Scotch côté {s}', (0, H - .08, s * (W / 2 + .002)), (.07, .16, .004), 'peint', 0xd8c49a, 0))
    o.append(boite('Étiquette fragile', (.2, .72, W / 2 + .004), (.26, .12, .004), 'peint', 0xd62b25, 0))
    o.append(boite('Étiquette texte', (.2, .72, W / 2 + .007), (.2, .03, .002), 'peint', BLANC, 0))
    for i, x in enumerate((-.27, -.19)):
        o.append(boite(f'Flèche {i}', (x, .83, W / 2 + .004), (.02, .12, .003), 'peint', NOIR, 0))
        o.append(boite(f'Flèche pointe {i}', (x, .9, W / 2 + .004), (.06, .02, .003), 'peint', NOIR, 0))
    o.append(boite('Fente', (0, .58, W / 2 + .003), (.34, .05, .004), 'peint', 0x1a1410, 0))
    piece(o, 'carton')
    # deux yeux dans la fente, visibles seulement quand Lao D est dedans
    piece([sphere(f'Œil carton {s}', (s * .05, .58, W / 2 + .004), .014, 'lumiere', BLANC, (1, .7, .4), 10) for s in (-1, 1)], 'carton', 'yeux', (0, .58, W / 2))


# ================================================================ aspirateur robot
def aspirateur():
    o = [cylindre('Robot corps', (0, .045, 0), .17, .07, 'y', 'verni', 0x2b2d31, 36),
         cylindre('Robot anneau', (0, .082, 0), .15, .012, 'y', 'verni', 0x60656d, 36),
         cylindre('Robot capot', (0, .09, -.02), .09, .006, 'y', 'verni', 0x1d1e21, 28),
         cylindre('Robot bouton', (0, .095, .06), .022, .008, 'y', 'verni', GRIS_CLAIR, 18),
         cylindre('Robot voyant', (0, .1, .06), .008, .004, 'y', 'verni', 0x2ee6ff, 12),
         cylindre('Robot pare-chocs', (0, .038, 0), .174, .05, 'y', 'verni', NOIR, 36)]
    for s in (-1, 1): o.append(cylindre(f'Robot brosse {s}', (s * .11, .006, .11), .035, .004, 'y', 'verni', GRIS, 12))
    piece(o, 'aspirateur')


# ================================================================ nacelle du laveur de vitres
def nacelle():
    J_ = 0xf2b705
    L, P = 2.4, .72
    o = [boite('Plancher', (0, .03, 0), (L, .06, P), 'peint', 0x7f858c, .01)]
    for s in (-1, 1):
        o.append(boite(f'Plinthe longue {s}', (0, .12, s * (P / 2 - .01)), (L, .15, .02), 'peint', J_, .004))
        o.append(boite(f'Plinthe courte {s}', (s * (L / 2 - .01), .12, 0), (.02, .15, P), 'peint', J_, .004))
    # garde-corps : côté extérieur (-z) complet, côté vitres (+z) plus bas
    for x in (-L / 2 + .03, -L / 4, 0, L / 4, L / 2 - .03):
        o.append(cylindre(f'Montant ext {x:.2f}', (x, .55, -P / 2 + .03), .02, 1.1, 'y', 'peint', J_, 10))
    for x in (-L / 2 + .03, L / 2 - .03):
        o.append(cylindre(f'Montant int {x:.2f}', (x, .45, P / 2 - .03), .02, .9, 'y', 'peint', J_, 10))
        o.append(cylindre(f'Montant bout {x:.2f}', (x, .55, -.0), .02, 1.1, 'y', 'peint', J_, 10))
    for y in (.55, 1.08):
        o.append(cylindre(f'Lisse ext {y}', (0, y, -P / 2 + .03), .022, L, 'x', 'peint', J_, 10))
        for s in (-1, 1): o.append(cylindre(f'Lisse bout {y} {s}', (s * (L / 2 - .03), y, 0), .022, P - .06, 'z', 'peint', J_, 10))
    o.append(cylindre('Lisse int', (0, .88, P / 2 - .03), .022, L, 'x', 'peint', J_, 10))
    # étriers et câbles qui montent vers le toit
    for s in (-1, 1):
        x = s * (L / 2 + .05)
        o.append(boite(f'Treuil {s}', (x, .45, 0), (.16, .34, .3), 'peint', 0x5a5f66, .01))
        o.append(tube(f'Étrier {s}', [(x, .1, -P / 2), (x, 2.1, 0), (x, .1, P / 2)], .025, 'peint', J_))
        o.append(cylindre(f'Câble {s}', (x, 16.0, 0), .007, 27.8, 'y', 'peint', 0x1a1a1c, 6))
    o.append(boite('Panneau nacelle', (0, .82, -P / 2 + .005), (.7, .28, .015), 'peint', BLANC, .004))
    o.append(boite('Bande panneau', (0, .72, -P / 2 - .004), (.7, .05, .006), 'peint', 0xd62b25, 0))
    o.append(cylindre('Seau', (.7, .16, .05), .13, .22, 'y', 'peint', 0x2a64d6, 20, .11))
    o.append(boite('Raclette manche', (-.6, .5, .1), (.03, .9, .03), 'peint', GRIS, .005, (0, 0, .35)))
    o.append(boite('Raclette lame', (-.44, .92, .1), (.36, .05, .04), 'peint', NOIR, .005, (0, 0, .35)))
    piece(o, 'nacelle')


# ================================================================ toboggan d'évacuation (mural)
def toboggan():
    o = [boite('Cadre haut', (0, 1.34, .08), (.96, .1, .16), 'peint', 0xf2c200, .01),
         boite('Cadre bas', (0, .4, .08), (.96, .1, .16), 'peint', 0xf2c200, .01),
         boite('Cadre g', (-.43, .87, .08), (.1, .84, .16), 'peint', 0xf2c200, .01),
         boite('Cadre d', (.43, .87, .08), (.1, .84, .16), 'peint', 0xf2c200, .01),
         boite('Gueule', (0, .87, .02), (.78, .86, .04), 'peint', 0x07070a, 0),
         cylindre('Tube', (0, .87, -.2), .36, .4, 'z', 'verni', 0x3a3d42, 24)]
    # rayures noires sur le cadre
    for i in range(6):
        o.append(boite(f'Rayure h {i}', (-.36 + i * .145, 1.34, .162), (.05, .1, .004), 'peint', NOIR, 0, (0, 0, .6)))
        o.append(boite(f'Rayure b {i}', (-.36 + i * .145, .4, .162), (.05, .1, .004), 'peint', NOIR, 0, (0, 0, .6)))
    o.append(boite('Plaque verte', (0, 1.62, .03), (.7, .22, .02), 'peint', 0x0d7a3c, .004))
    o.append(boite('Pictogramme', (-.22, 1.62, .042), (.1, .14, .004), 'peint', BLANC, 0))
    o.append(boite('Flèche plaque', (.08, 1.62, .042), (.34, .035, .004), 'peint', BLANC, 0))
    piece(o, 'toboggan')
    # trappe à charnière haute
    P = (0, 1.29, .17)
    piece([boite('Trappe tôle', (0, .87, .17), (.78, .84, .025), 'verni', 0x9ea3a9, .006),
           boite('Trappe poignée', (0, .6, .195), (.26, .04, .04), 'verni', GRIS_FONCE, .008),
           boite('Trappe étiquette', (0, 1.0, .185), (.3, .1, .004), 'verni', 0xd62b25, 0)], 'toboggan', 'trappe', P)


# ================================================================ pièce secrète
def hamac():
    o = []
    for s in (-1, 1):
        o.append(boite(f'Poteau {s}', (s * 1.35, .72, 0), (.1, 1.44, .1), 'boisFonce', 0, .01))
        o.append(boite(f'Pied {s}', (s * 1.35, .03, 0), (.16, .06, .8), 'boisFonce', 0, .01))
    # toile : bandes de couleur qui pendent en chaînette
    bandes = [0xe0452c, 0xf2c200, 0x2a9d8f, 0x264653, 0xf4a261]
    for b, c in enumerate(bandes):
        z0, z1 = -.4 + b * .16, -.4 + (b + 1) * .16
        bm = bmesh.new(); rangs = []
        for i in range(17):
            t = i / 16; x = -1.05 + 2.1 * t
            y = .92 - .38 * (1 - (2 * t - 1) ** 2)
            rangs.append([bm.verts.new(Vector((x, y, z))) for z in (z0 + .003, z1 - .003)])
        for i in range(16):
            bm.faces.new((rangs[i][0], rangs[i][1], rangs[i + 1][1], rangs[i + 1][0]))
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.012)
        t_ = objet(f'Toile {b}', bm, 'peint', c)
        placer(t_, (0, 0, 0))
        lisse(t_, 60); o.append(t_)
    for s in (-1, 1):
        for z in (-.38, 0, .38):
            o.append(tube(f'Corde {s} {z}', [(s * 1.3, 1.25, 0), (s * 1.05, .93, z)], .008, 'peint', 0xd9c9a8))
    o.append(sphere('Oreiller', (-.75, .72, 0), .16, 'peint', BLANC, (1.1, .45, 1.6), 16))
    piece(o, 'hamac')


def bouton_rouge():
    o = [cylindre('Socle', (0, .03, 0), .26, .06, 'y', 'peint', 0xf2c200, 28),
         boite('Colonne', (0, .5, 0), (.16, .9, .16), 'verni', 0x6b7077, .01),
         boite('Plateau', (0, .98, 0), (.34, .07, .34), 'verni', 0x3a3d42, .012)]
    for i in range(8):
        a = i * math.pi / 4
        o.append(boite(f'Rayure socle {i}', (math.sin(a) * .2, .062, math.cos(a) * .2), (.05, .006, .09), 'peint', NOIR, 0, (0, a, 0)))
    o.append(boite('Capot', (0, 1.13, -.13), (.26, .012, .24), 'verre', 0, .003, (1.1, 0, 0)))
    o.append(boite('Plaque', (0, .7, .082), (.13, .1, .006), 'peint', 0xf2c200, 0))
    piece(o, 'bouton-rouge')
    P = (0, 1.015, 0)
    piece([sphere('Bouton', (0, 1.015, 0), .085, 'verni', 0xe0141a, (1, .55, 1), 22, coupe_bas=-.01)], 'bouton-rouge', 'bouton', P)


def borne_arcade():
    VI, RO = 0x4b1f78, 0xff3d8b
    o = []
    for s in (-1, 1):
        o.append(boite(f'Flanc {s}', (s * .32, .86, 0), (.04, 1.72, .78), 'peint', VI, .006))
        for k, dy in enumerate((0, .12)):
            o.append(boite(f'Liseré {s} {k}', (s * .342, .95 + dy, .05), (.004, .8, .05), 'peint', RO, 0, (.55, 0, 0)))
    o.append(boite('Dos', (0, .86, -.37), (.6, 1.72, .04), 'peint', 0x2a1242, .004))
    o.append(boite('Bas', (0, .42, .28), (.6, .84, .06), 'peint', 0x1a1a1f, .006))
    for s in (-1, 1): o.append(boite(f'Monnayeur {s}', (s * .08, .6, .315), (.06, .1, .01), 'lumiere', 0xff8a1c, 0))
    o.append(boite('Pupitre', (0, .95, .28), (.6, .06, .3), 'peint', NOIR, .008, (-.25, 0, 0)))
    o.append(cylindre('Joystick tige', (-.13, 1.02, .3), .01, .08, 'y', 'verni', GRIS_CLAIR, 10))
    o.append(sphere('Joystick boule', (-.13, 1.07, .3), .025, 'verni', 0xe0141a, (1, 1, 1), 14))
    for i, c in enumerate((0xe0141a, 0x2a64d6, 0xf2c200)):
        o.append(cylindre(f'Bouton arcade {i}', (.05 + i * .07, 1.0, .3 - i * .01), .022, .02, 'y', 'verni', c, 14))
    o.append(boite('Cadre écran', (0, 1.35, .12), (.6, .5, .04), 'peint', NOIR, .006, (-.2, 0, 0)))
    o.append(boite('Fronton', (0, 1.66, .2), (.6, .14, .12), 'lumiere', 0xffd23a, .004))
    # fond d'écran : le jeu y superpose une petite animation (interactifs.js)
    o.append(boite('Écran', (0, 1.35, .142), (.5, .38, .004), 'lumiere', 0x1a2c7a, 0, (-.2, 0, 0)))
    piece(o, 'borne-arcade')


def etagere_secrete():
    W, H, D = 1.3, 2.3, .38
    o = []
    for s in (-1, 1): o.append(boite(f'Montant {s}', (s * (W / 2 - .03), H / 2, 0), (.06, H, D), 'boisFonce', 0, .006))
    o.append(boite('Chapeau', (0, H - .03, 0), (W, .06, D), 'boisFonce', 0, .006))
    o.append(boite('Fond', (0, H / 2, -D / 2 + .01), (W - .06, H, .02), 'boisFonce', 0, .003))
    couleurs = [0x8c4a3a, 0x3d5a80, 0x54683f, 0x7a5c8a, 0xb08a3c, 0x8a8f95, 0x2f4858]
    k = 0
    for r in range(5):
        y = .06 + r * .45
        o.append(boite(f'Rayon {r}', (0, y, 0), (W - .1, .035, D - .02), 'boisFonce', 0, .004))
        if r == 4: continue
        x = -W / 2 + .1
        while x < W / 2 - .12:
            h = .26 + (k % 4) * .03; e = .035 + (k % 3) * .012
            rouge = (r, k % 9) == (2, 4)
            c = 0xd01818 if rouge else couleurs[k % len(couleurs)]
            incl = (0, 0, .0) if not rouge else (.25, 0, 0)
            o.append(boite(f'Livre {r}-{k}', (x + e / 2, y + .02 + h / 2, (.05 if rouge else 0)), (e, h, .24), 'peint', c, 0, incl))
            x += e + .004; k += 1
    piece(o, 'etagere-secrete', 'porte', (-W / 2, 0, 0))


canard(); distributeur(); disjoncteur(); carton(); aspirateur(); nacelle(); toboggan()
hamac(); bouton_rouge(); borne_arcade(); etagere_secrete()

# ---------------------------------------------------------------- rapport
rapport = {}
for o, ident, role in PIECES:
    r = rapport.setdefault(ident, {'objets': 0, 'triangles': 0, 'materiaux': set(), 'roles': set()})
    r['objets'] += 1
    o.data.calc_loop_triangles(); r['triangles'] += len(o.data.loop_triangles)
    r['materiaux'].add(o.data.materials[0].name)
    if role: r['roles'].add(role)
for r in rapport.values(): r['materiaux'] = sorted(r['materiaux']); r['roles'] = sorted(r['roles'])
(OUT / 'rapport.json').write_text(json.dumps(rapport, indent=1, ensure_ascii=False), encoding='utf-8')
print('RAPPORT', json.dumps({k: v['triangles'] for k, v in rapport.items()}))


# ---------------------------------------------------------------- planche de relecture
def planche():
    """Chaque accessoire seul, de trois quarts, à côté d'une silhouette de 1,75 m."""
    S.render.engine = 'BLENDER_WORKBENCH'
    sh = S.display.shading; sh.light = 'STUDIO'; sh.color_type = 'VERTEX'; sh.show_cavity = True
    S.render.resolution_x = 520; S.render.resolution_y = 520; S.render.film_transparent = False
    S.world = bpy.data.worlds.new('Fond') if not S.world else S.world
    cam = bpy.data.objects.new('Caméra', bpy.data.cameras.new('Caméra')); S.collection.objects.link(cam); S.camera = cam
    cam.data.type = 'ORTHO'
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=.2, radius2=.16, depth=1.75)
    for v in bm.verts: v.co.z += .875
    ref = objet('Silhouette 1,75 m', bm, 'peint', 0x9aa6b2)
    cadrages = {'canard': (.35, .06), 'distributeur': (2.4, .95), 'disjoncteur': (2.4, 1.5), 'carton': (2.2, .8),
                'aspirateur': (.9, .1), 'nacelle': (3.4, 1.2), 'toboggan': (2.4, 1.0), 'hamac': (3.6, .9),
                'bouton-rouge': (2.2, .9), 'borne-arcade': (2.4, .95), 'etagere-secrete': (2.8, 1.2)}
    images = []
    for ident, (echelle, hauteur) in cadrages.items():
        # le verre s'afficherait opaque : on le masque pour voir l'intérieur
        for o in COLL.objects: o.hide_render = o.get('acc_id') != ident or o.data.materials[0].name == 'ACC_verre'
        ref.hide_render = echelle < 1
        ref.location = J(-1.0 if ident != 'nacelle' else -1.9, 0, -.2)
        cam.data.ortho_scale = echelle
        a = math.radians(35)
        cible = J(0, hauteur, 0)
        cam.location = cible + J(math.sin(a) * 6, 2.2, math.cos(a) * 6) - J(0, 0, 0)
        direction = cible - cam.location
        cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        f = OUT / f'_{ident}.png'; S.render.filepath = str(f); bpy.ops.render.render(write_still=True); images.append(f)
    bpy.data.objects.remove(ref)
    # assemblage en grille 4 colonnes
    import numpy as np
    T = 520; col = 4; lignes = math.ceil(len(images) / col)
    out = np.zeros((lignes * T, col * T, 4), np.float32)
    for i, f in enumerate(images):
        im = bpy.data.images.load(str(f)); px = np.array(im.pixels[:], np.float32).reshape(T, T, 4)
        y = (lignes - 1 - i // col) * T; x = (i % col) * T; out[y:y + T, x:x + T] = px
        bpy.data.images.remove(im); f.unlink()
    im = bpy.data.images.new('planche', out.shape[1], out.shape[0]); im.pixels = out.ravel()
    im.filepath_raw = str(OUT / 'planche-accessoires.png'); im.file_format = 'PNG'; im.save()


if not args.sans_rendu: planche()

# ---------------------------------------------------------------- export
for o in bpy.data.objects: o.select_set(o.get('acc_id') is not None)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'accessoires-v01.glb'), export_format='GLB', use_selection=True,
                          export_extras=True, export_yup=True, export_apply=True, export_vertex_color='MATERIAL',
                          export_normals=True, export_texcoords=True, export_materials='EXPORT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'accessoires-v01.blend'))
print('EXPORT', (OUT / 'accessoires-v01.glb').stat().st_size)

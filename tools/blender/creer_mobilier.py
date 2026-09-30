"""Mobilier v02 : tout le mobilier des étages encore construit en code, refait dans Blender.

Objets de poste (écran, clavier, souris, tasse, papiers et variantes), bibliothèque de
direction, photocopieuse, machine à café, fontaine, casiers, plantes, piles de cartons,
salon (canapé, fauteuil, table basse), bureau de direction, table de réunion, extincteur,
horloge, tableau blanc, écran mural, luminaires et bouches d'aération.

Chaque modèle reprend exactement l'emprise, la hauteur et les points d'accroche de la
version codée (level.js) : collisions, couvertures et équilibrage ne changent pas. Les
écrans, affiches et panneaux à texte restent dessinés par le jeu, aux mêmes endroits.
Même contrat que les accessoires (accessoires-blender.js) : acc_id, matériaux ACC_*,
couleurs de sommet pour les détails colorés, matières du niveau pour le reste.

blender --background --factory-startup --python-exit-code 1 --python creer_mobilier.py -- \
  --out NOUVEAU_DOSSIER [--sans-rendu]
"""
import bpy, bmesh, sys, json, math, random, argparse
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
COLL = bpy.data.collections.new('Mobilier'); S.collection.children.link(COLL)
PI = math.pi


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
          'tissuCanape': 0xbb7658, 'laiton': 0xa79d7f, 'terreCuite': 0xa2643c, 'cableNoir': 0x15171a,
          'eau': 0x71a7b9, 'beton': 0xb3b1a4, 'murAccent': 0x3c6561, 'tissuChaise': 0x3e5a55, 'cloison': 0x8a9a94}


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



# ---------------------------------------------------------------- outils propres au mobilier
def revolution(nom, profil, mat, couleur, centre=(0, 0, 0), segments=20, fond=True, dessus=False, rotation=(0, 0, 0)):
    """Solide de révolution autour de l'axe vertical du jeu. `profil` : [(rayon, y), …] de bas en haut."""
    bm = bmesh.new(); anneaux = []
    for r, y in profil:
        anneaux.append([bm.verts.new(Vector((math.sin(2 * PI * i / segments) * r, y, math.cos(2 * PI * i / segments) * r)))
                        for i in range(segments)])
    for A, B in zip(anneaux, anneaux[1:]):
        for i in range(segments):
            bm.faces.new((A[i], B[i], B[(i + 1) % segments], A[(i + 1) % segments]))
    if fond and profil[0][0] > 1e-4: bm.faces.new(list(reversed(anneaux[0])))
    if dessus and profil[-1][0] > 1e-4: bm.faces.new(anneaux[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = objet(nom, bm, mat, couleur); placer(o, centre, rotation); lisse(o, 50)
    return o


def groupe(objets, translation=(0, 0, 0), rot_y=0.0):
    """Tourne (angle du jeu autour de la verticale) puis déplace des pièces déjà posées."""
    M = Matrix.Translation(J(*translation)) @ Matrix.Rotation(rot_y, 4, 'Z')
    for o in objets: o.data.transform(M); o.data.update()
    return objets


def feuille(nom, base, direction, longueur, largeur, couleur, courbure=.25):
    """Feuille à deux faces, en losange légèrement creusé, orientée selon `direction` (jeu)."""
    d = Vector(direction).normalized()
    cote = d.cross(Vector((0, 1, 0)))
    if cote.length < 1e-3: cote = Vector((1, 0, 0))
    cote.normalize(); haut = cote.cross(d).normalized()
    b = Vector(base)
    pts = [b, b + d * longueur * .45 + cote * largeur / 2 + haut * largeur * courbure,
           b + d * longueur, b + d * longueur * .45 - cote * largeur / 2 + haut * largeur * courbure]
    bm = bmesh.new(); vs = [bm.verts.new(p) for p in pts]
    bm.faces.new((vs[0], vs[1], vs[2])); bm.faces.new((vs[0], vs[2], vs[3]))
    ws = [bm.verts.new(p - haut * .0015) for p in pts]
    bm.faces.new((ws[0], ws[2], ws[1])); bm.faces.new((ws[0], ws[3], ws[2]))
    o = objet(nom, bm, 'peint', couleur); placer(o, (0, 0, 0)); lisse(o, 20)
    return o


def dalle_arrondie(nom, largeur, profondeur, rayon, epaisseur, centre, mat, couleur, coins=6, biseau=.01):
    """Plateau rectangulaire aux coins arrondis (table de réunion)."""
    bm = bmesh.new(); contour = []
    for cx, cz, a0 in ((1, 1, 0), (-1, 1, PI / 2), (-1, -1, PI), (1, -1, 3 * PI / 2)):
        for i in range(coins + 1):
            a = a0 + (PI / 2) * i / coins
            contour.append((cx * (largeur / 2 - rayon) + math.cos(a) * rayon, cz * (profondeur / 2 - rayon) + math.sin(a) * rayon))
    bas = [bm.verts.new(Vector((x, -epaisseur / 2, z))) for x, z in contour]
    haut = [bm.verts.new(Vector((x, epaisseur / 2, z))) for x, z in contour]
    n = len(contour)
    bm.faces.new(bas); bm.faces.new(list(reversed(haut)))
    for i in range(n): bm.faces.new((bas[i], bas[(i + 1) % n], haut[(i + 1) % n], haut[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = objet(nom, bm, mat, couleur)
    if biseau:
        m = o.modifiers.new('Biseau', 'BEVEL'); m.width = biseau; m.segments = 2; m.limit_method = 'ANGLE'; appliquer(o)
    placer(o, centre); lisse(o, 35)
    return o


INK, GOLD, RUST, PAPER = 0x234b49, 0xd7a24d, 0xad563c, 0xeee9db
NOIR, BLANC, GRIS = 0x16171a, 0xf1efea, 0x8d9298
LIVRES = [0x8c4a3a, 0x3d5a80, 0x54683f, 0x7a5c8a, 0xb08a3c, 0x8a8f95, 0x2f4858, 0x9c3b2e, 0x416a5f]
ALEA = random.Random(1998)


# ================================================================ poste de travail
# Repère du bureau (level.js, poste) : plateau à 0,77 m, chaise en +z.
def ecran_poste():
    """Écran 24 pouces sur pied ; la dalle (texture code / tableur / graphique) reste au jeu,
    à (0 ; 1,05 ; 0,019) dans le repère de l'écran."""
    e = [boite('Écran cadre', (0, 1.05, -.002), (.63, .39, .03), 'plastiqueNoir', 0, .006),
         boite('Écran dos', (0, 1.03, -.03), (.46, .27, .03), 'plastiqueNoir', 0, .012),
         boite('Écran menton', (0, .862, .004), (.63, .018, .022), 'aluSombre', 0, .003),
         boite('Écran bras', (0, .93, -.066), (.05, .22, .026), 'aluSombre', 0, .006, (-.12, 0, 0)),
         boite('Écran rotule', (0, 1.01, -.052), (.08, .05, .03), 'aluSombre', 0, .008),
         boite('Écran socle', (0, .777, -.03), (.25, .012, .17), 'aluSombre', 0, .005),
         boite('Écran voyant', (.29, .873, .016), (.008, .004, .002), 'lumiere', 0x6ee7ff, 0)]
    for i, c in enumerate((0xf7e06a, 0xf2a3c0, 0x9fe08a)):
        e.append(boite(f'Post-it {i}', (.337, 1.16 - i * .07, .0145), (.058, .058, .0015), 'peint', c, 0, (0, 0, (1 if i % 2 else -1) * .08)))
    return groupe(e, (-.35, 0, -.2), .17)


def clavier_souris():
    k = [boite('Clavier châssis', (0, -.001, 0), (.44, .014, .155), 'plastiqueNoir', 0, .004, (.03, 0, 0))]
    for r in range(5):
        for c in range(15):
            if r == 4 and 4 <= c <= 10: continue
            k.append(boite(f'Touche {r}-{c}', (-.207 + c * .0295, .0115 + r * .0012, -.058 + r * .029), (.023, .008, .022), 'plastiqueNoir', 0, 0))
    k.append(boite('Barre espace', (-.207 + 7 * .0295, .0163, .058), (.2, .008, .022), 'plastiqueNoir', 0, 0))
    k.append(boite('Diode clavier', (.19, .008, -.072), (.012, .002, .004), 'lumiere', 0x49f28a, 0))
    groupe(k, (-.35, .775, .14), .06)
    s = [boite('Tapis souris', (.12, .7715, .16), (.28, .003, .22), 'cableNoir', 0, 0),
         sphere('Souris', (.12, .773, .16), .03, 'plastiqueNoir', 0, (1, .6, 1.7), 12, coupe_bas=0),
         boite('Molette', (.12, .79, .135), (.006, .006, .012), 'aluSombre', 0, 0)]
    return k + s


def tasse(centre, couleur_tasse=BLANC):
    x, y, z = centre
    t = [revolution('Tasse', [(.036, 0), (.041, .008), (.043, .098), (.039, .098), (.037, .012)], 'plastiqueBlanc', 0, (x, y, z), 16, fond=True),
         revolution('Café', [(.037, .07), (.037, .071)], 'boisFonce', 0, (x, y, z), 16, fond=False, dessus=True),
         tube('Anse', [(x + .041, y + .078, z), (x + .066, y + .07, z), (x + .066, y + .03, z), (x + .04, y + .022, z)], .007, 'plastiqueBlanc', 0)]
    return t


def poste():
    o = ecran_poste() + clavier_souris() + tasse((.42, .772, .1))
    o.append(boite('Feuilles 1', (.8, .776, -.14), (.3, .006, .22), 'papier', 0, 0, (0, .28, 0)))
    o.append(boite('Feuilles 2', (.83, .782, -.1), (.26, .006, .19), 'papier', 0, 0, (0, -.15, 0)))
    o.append(boite('Trombone', (.9, .7865, -.13), (.03, .002, .008), 'verni', GRIS, 0))
    o.append(revolution('Verre', [(.03, 0), (.035, .2), (.032, .2), (.027, .006)], 'verre', 0, (-.92, .772, -.2), 14))
    o.append(revolution('Eau', [(.026, .008), (.031, .13)], 'eau', 0, (-.92, .772, -.2), 14, dessus=True))
    o.append(tube('Câble écran', [(-.37, .8, -.3), (-.32, .74, -.42), (-.3, .42, -.5), (-.2, .06, -.42), (-.1, .012, -.3)], .007, 'cableNoir', 0))
    o.append(tube('Câble clavier', [(-.35, .775, .06), (-.38, .775, -.05), (-.45, .776, -.18)], .003, 'cableNoir', 0))
    piece(o, 'poste')


def poste_code():
    o = [boite('Cadre photo', (.8, .86, -.425), (.25, .15, .018), 'boisFonce', 0, .003, (0, -.14, 0)),
         boite('Béquille cadre', (.81, .82, -.46), (.02, .1, .01), 'boisFonce', 0, 0, (.5, -.14, 0)),
         revolution('Thermos', [(.034, 0), (.04, .01), (.04, .15), (.032, .17), (.032, .19)], 'peint', INK, (-.82, .772, .26), 16, dessus=True),
         revolution('Bouchon', [(.034, .19), (.034, .205)], 'verni', 0x1b2d2c, (-.82, .772, .26), 16, fond=False, dessus=True),
         boite('Figurine socle', (.62, .78, -.35), (.05, .012, .05), 'peint', NOIR, 0),
         sphere('Figurine tête', (.62, .845, -.35), .022, 'peint', 0xf2c200, (1, 1, 1), 10),
         boite('Figurine corps', (.62, .806, -.35), (.03, .04, .02), 'peint', 0x2a64d6, 0)]
    piece(o, 'poste-code')


def poste_sheet():
    o = []
    for i in range(3):
        h = .29 + (i % 2) * .025; c = (INK, GOLD, INK)[i]
        o.append(boite(f'Classeur {i}', (.68 + i * .09, .772 + h / 2, -.36), (.07, h, .24), 'peint', c, .003))
        o.append(boite(f'Étiquette {i}', (.68 + i * .09, .772 + h * .62, -.238), (.042, .06, .003), 'papier', 0, 0))
        o.append(cylindre(f'Anneau {i}', (.68 + i * .09, .772 + h * .2, -.238), .011, .004, 'z', 'verni', GRIS, 10))
    o.append(boite('Calculatrice', (.45, .78, -.3), (.09, .012, .15), 'plastiqueNoir', 0, .004, (0, .2, 0)))
    o.append(boite('Écran calculatrice', (.455, .787, -.34), (.07, .002, .03), 'lumiere', 0x9fd4a3, 0, (0, .2, 0)))
    piece(o, 'poste-sheet')


def poste_graph():
    o = []
    for i, c in enumerate((INK, RUST, 0x2a64d6)):
        o.append(cylindre(f'Feutre {i}', (.98 + i * .03, .781, .25), .008, .13, 'z', 'peint', c, 8, rotation=(0, .1 * i, 0)))
    o.append(revolution('Pot à crayons', [(.035, 0), (.035, .1)], 'aluSombre', 0, (-.8, .772, -.35), 14))
    for i, c in enumerate((0xf2c200, RUST, INK)):
        o.append(cylindre(f'Crayon {i}', (-.8 + (i - 1) * .012, .772 + .13, -.35 + (i % 2) * .01), .004, .16, 'y', 'peint', c, 6, rotation=(.12 * (i - 1), 0, .1 * (i - 1))))
    piece(o, 'poste-graph')


# ================================================================ bibliothèque de direction
# Longueur 3,2 m sur x, profondeur 1,3 m sur z (façade +z), hauteur 1,9 m.
def bibliotheque():
    o = []
    for s in (-1, 1): o.append(boite(f'Joue {s}', (s * 1.58, .95, 0), (.04, 1.9, 1.3), 'boisFonce', 0, .006))
    for s in (-.53, .53): o.append(boite(f'Montant {s}', (s, .95, -.02), (.03, 1.84, 1.24), 'boisFonce', 0, .004))
    o.append(boite('Fond', (0, .95, -.635), (3.16, 1.9, .03), 'boisFonce', 0, .004))
    o.append(boite('Chapeau', (0, 1.88, 0), (3.22, .04, 1.32), 'boisFonce', 0, .006))
    o.append(boite('Socle', (0, .045, .01), (3.12, .09, 1.26), 'boisFonce', 0, .004))
    niveaux = [.09, .54, .99, 1.44]
    for y in niveaux[1:]: o.append(boite(f'Tablette {y}', (0, y - .015, 0), (3.12, .03, 1.26), 'boisFonce', 0, .003))
    k = 0
    for b, x0 in enumerate((-1.56, -.515, .545)):
        for n, y in enumerate(niveaux):
            x = x0 + .03; fin = x0 + 1.0
            motif = (b + n) % 4
            if motif == 3 and n > 0:
                # objets : globe, trophée ou boîtes d'archives
                if b == 1: o += [revolution(f'Globe pied {n}', [(.07, 0), (.02, .03), (.015, .08)], 'laiton', 0, (x0 + .5, y, .35), 12, dessus=True),
                                 sphere(f'Globe {n}', (x0 + .5, y + .2, .35), .12, 'peint', 0x3d7ea6, (1, 1, 1), 16)]
                elif b == 0: o += [revolution(f'Trophée {n}', [(.06, 0), (.06, .03), (.02, .05), (.018, .16), (.07, .2), (.06, .28)], 'verni', GOLD, (x0 + .5, y, .35), 14)]
                else:
                    for j in range(3): o.append(boite(f'Archive {n}-{j}', (x0 + .2 + j * .3, y + .15, .3), (.28, .3, .42), 'carton', 0, .004))
                continue
            while x < fin - .05:
                if motif == 2 and x > x0 + .55:
                    # pile de livres couchés
                    for j in range(4):
                        o.append(boite(f'Livre couché {k}-{j}', (x + .15, y + .02 + j * .04, .4), (.28 - j * .02, .038, .22), 'peint', LIVRES[(k + j) % len(LIVRES)], 0, (0, .05 * (j % 2), 0)))
                    break
                e = .025 + ALEA.random() * .03; h = .24 + ALEA.random() * .1
                incline = .22 if ALEA.random() < .06 else 0
                c = LIVRES[k % len(LIVRES)] if motif != 1 else (INK if k % 3 else GOLD)
                if motif == 1: e, h = .06, .31   # classeurs
                o.append(boite(f'Livre {k}', (x + e / 2, y + h / 2 + .002, .42), (e, h, .24 if motif != 1 else .28), 'peint', c, 0, (0, 0, incline)))
                if motif == 1: o.append(boite(f'Dos classeur {k}', (x + e / 2, y + h * .7, .565), (.04, .06, .003), 'papier', 0, 0))
                x += e + .003; k += 1
    # plante et boîtes sur le dessus
    o.append(revolution('Pot dessus', [(.1, 0), (.12, .16)], 'plastiqueBlanc', 0, (1.2, 1.9, .2), 16))
    for i in range(18):
        a = i * 2.39996; r = .05 + (i % 5) * .025
        o.append(feuille(f'Feuille dessus {i}', (1.2 + math.cos(a) * .03, 2.05, .2 + math.sin(a) * .03),
                         (math.cos(a) * .7, .6 + (i % 3) * .3, math.sin(a) * .7), .16 + r, .06, (0x3e7a42, 0x4f8f4a, 0x2f6b3a)[i % 3]))
    piece(o, 'bibliotheque-direction')


# ================================================================ photocopieuse
# Emprise 2,0 × 1,8 m, façade +z ; écran de commande au jeu (+0,57 ; 1,17 ; +0,746).
def photocopieuse():
    o = [boite('Socle', (0, .055, 0), (1.78, .11, 1.58), 'aluSombre', 0, .01),
         boite('Corps', (0, .44, -.01), (1.85, .66, 1.6), 'plastiqueBlanc', 0, .02)]
    for i in range(3):
        y = .21 + i * .205
        o.append(boite(f'Tiroir {i}', (-.08, y, .8), (1.62, .185, .03), 'plastiqueBlanc', 0, .008))
        o.append(boite(f'Poignée {i}', (-.08, y + .045, .818), (.42, .028, .02), 'plastiqueNoir', 0, .006))
        o.append(boite(f'Jauge {i}', (.58, y, .818), (.1, .02, .004), 'peint', (0x49c26b, 0xf2c200, 0x49c26b)[i], 0))
    o.append(boite('Joue avant', (.79, .44, .8), (.2, .6, .03), 'plastiqueBlanc', 0, .006))
    o.append(boite('Logo', (.79, .66, .817), (.14, .03, .003), 'peint', INK, 0))
    # sortie papier en creux, entre le corps et le scanner
    for s in (-1, 1): o.append(boite(f'Colonne {s}', (s * .83, .87, -.02), (.18, .22, 1.52), 'plastiqueBlanc', 0, .01))
    o.append(boite('Fond sortie', (0, .87, -.65), (1.5, .22, .3), 'plastiqueBlanc', 0, .006))
    o.append(boite('Plateau sortie', (0, .775, .05), (1.48, .02, 1.2), 'aluSombre', 0, .004))
    for j in range(5): o.append(boite(f'Copie {j}', (-.1 + j * .004, .79 + j * .006, .12 + j * .006), (.3, .005, .42), 'papier', 0, 0, (0, .03 * j, 0)))
    o.append(boite('Scanner', (0, 1.03, -.02), (1.84, .12, 1.64), 'plastiqueBlanc', 0, .015))
    o.append(boite('Bandeau scanner', (0, 1.095, .79), (1.84, .018, .04), 'plastiqueNoir', 0, .004))
    o.append(boite('Chargeur', (-.15, 1.17, -.2), (1.1, .12, .95), 'plastiqueBlanc', 0, .02))
    o.append(boite('Bac chargeur', (-.15, 1.245, .06), (.8, .02, .5), 'aluSombre', 0, .004, (-.08, 0, 0)))
    for j in range(8): o.append(boite(f'Original {j}', (-.15, 1.26 + j * .003, .06), (.3, .003, .42), 'papier', 0, 0, (-.08, 0, 0)))
    # bras du panneau de commande, calé sur l'écran du jeu
    o.append(boite('Bras panneau', (.57, 1.02, .6), (.08, .16, .2), 'plastiqueBlanc', 0, .01))
    o.append(boite('Panneau', (.57, 1.12, .73), (.52, .08, .25), 'plastiqueNoir', 0, .012, (.34, 0, 0)))
    for i in range(4): o.append(boite(f'Touche panneau {i}', (.4 + i * .04, 1.14, .83), (.025, .01, .025), 'verni', GRIS, 0, (.34, 0, 0)))
    o.append(boite('Voyant', (.78, 1.155, .8), (.015, .008, .015), 'lumiere', 0x49f28a, 0, (.34, 0, 0)))
    # bac manuel replié et grilles d'aération
    o.append(boite('Bac manuel', (-.94, .62, 0), (.03, .22, .8), 'plastiqueBlanc', 0, .006))
    for j in range(6): o.append(boite(f'Aération {j}', (.93, .3 + j * .045, -.3), (.004, .012, .5), 'plastiqueNoir', 0, 0))
    piece(o, 'photocopieuse')


# ================================================================ machine à café (façade +z)
# Écran « CAFÉ / PRÊT » au jeu, centré à 1,29 m sur la façade (z = 0,322).
def machine_cafe():
    o = [boite('Meuble', (0, .4, 0), (.6, .78, .58), 'boisFonce', 0, .008),
         boite('Porte meuble', (0, .41, .292), (.54, .66, .01), 'boisFonce', 0, .004),
         boite('Poignée meuble', (.2, .5, .302), (.012, .16, .014), 'alu', 0, .003),
         boite('Plinthe meuble', (0, .03, .01), (.58, .06, .54), 'plastiqueNoir', 0, .004),
         boite('Plan', (0, .802, 0), (.63, .035, .6), 'alu', 0, .004),
         boite('Corps machine', (0, 1.0, -.1), (.5, .38, .38), 'plastiqueNoir', 0, .015),
         boite('Capot', (0, 1.265, .01), (.56, .27, .6), 'plastiqueNoir', 0, .02),
         boite('Façade inox', (0, 1.265, .312), (.5, .23, .01), 'alu', 0, .004)]
    for s in (-1, 1): o.append(boite(f'Flanc inox {s}', (s * .282, 1.03, -.05), (.012, .44, .45), 'alu', 0, .003))
    o.append(boite('Égouttoir', (0, .835, .16), (.34, .03, .24), 'verni', GRIS, .004))
    for j in range(6): o.append(boite(f'Grille {j}', (0, .852, .06 + j * .04), (.3, .004, .01), 'verni', 0x3a3d42, 0))
    o.append(cylindre('Bec', (-.05, 1.1, .17), .024, .06, 'y', 'alu', 0, 12))
    o.append(cylindre('Bec 2', (.05, 1.1, .17), .024, .06, 'y', 'alu', 0, 12))
    o += tasse((0, .85, .17))
    o.append(revolution('Trémie', [(.1, 0), (.11, .12), (.1, .13)], 'verre', 0, (.12, 1.4, -.12), 16, dessus=True))
    o.append(revolution('Grains', [(.09, .005), (.095, .07)], 'peint', 0x3b2416, (.12, 1.4, -.12), 16, dessus=True))
    for i in range(3): o.append(cylindre(f'Bouton {i}', (-.15 + i * .15, 1.18, .318), .016, .006, 'z', 'lumiere', (0xffe3a0, 0x6ee7ff, 0xffe3a0)[i], 12))
    # pile de gobelets
    o.append(revolution('Gobelets', [(.028, 0), (.036, .3)], 'plastiqueBlanc', 0, (-.22, .82, -.15), 14, dessus=True))
    piece(o, 'machine-cafe')


# ================================================================ fontaine à eau (façade +z)
def fontaine():
    o = [boite('Socle fontaine', (0, .035, 0), (.44, .07, .43), 'aluSombre', 0, .006),
         boite('Corps fontaine', (0, .42, 0), (.46, .7, .44), 'plastiqueBlanc', 0, .03),
         boite('Niche', (0, .86, .1), (.34, .17, .22), 'plastiqueNoir', 0, .01),
         boite('Égouttoir fontaine', (0, .79, .14), (.34, .02, .18), 'verni', GRIS, .004),
         boite('Chapeau fontaine', (0, .99, 0), (.48, .12, .48), 'plastiqueBlanc', 0, .025)]
    for s, c in ((-1, 0x2a64d6), (1, 0xd62b25)):
        o.append(boite(f'Robinet {s}', (s * .085, .92, .21), (.055, .06, .06), 'verni', c, .012))
    o.append(revolution('Bonbonne', [(.04, 1.05), (.06, 1.09), (.16, 1.14), (.17, 1.2), (.165, 1.3), (.17, 1.42), (.16, 1.47), (.1, 1.5), (.0, 1.51)], 'verre', 0, (0, 0, 0), 22))
    o.append(revolution('Eau fontaine', [(.05, 1.1), (.15, 1.15), (.16, 1.2), (.155, 1.3), (.16, 1.36)], 'eau', 0, (0, 0, 0), 22, dessus=True))
    for y in (1.2, 1.38): o.append(revolution(f'Cerclage {y}', [(.172, y), (.172, y + .012)], 'alu', 0, (0, 0, 0), 22, fond=False))
    o.append(revolution('Distributeur gobelets', [(.035, 0), (.035, .34)], 'plastiqueBlanc', 0, (.2, .48, -.18), 12, dessus=True))
    piece(o, 'fontaine')


# ================================================================ casiers (module de 0,62 m, façade +z)
def casier(ident, porte):
    o = [boite('Caisson', (0, .925, -.005), (.62, 1.85, .74), 'verni', 0x8e969c, .006)]
    for j, y in enumerate((.49, 1.37)):
        o.append(boite(f'Porte {j}', (0, y, .372), (.58, .84, .012), 'verni', porte, .004))
        for f in range(4): o.append(boite(f'Ouïe {j}-{f}', (0, y + .3 - f * .03, .379), (.3, .012, .003), 'peint', 0x2b2e33, 0))
        o.append(boite(f'Poignée casier {j}', (.23, y - .05, .386), (.02, .13, .02), 'alu', 0, .004))
        o.append(boite(f'Plaque {j}', (-.17, y + .33, .38), (.07, .035, .003), 'peint', BLANC, 0))
        o.append(cylindre(f'Serrure {j}', (.23, y + .06, .381), .012, .008, 'z', 'alu', 0, 10))
    piece(o, ident)


# ================================================================ plantes (emprise 0,6 m, 1,45 m)
def pot(nom, mat, couleur):
    return [revolution(nom, [(.2, 0), (.22, .03), (.26, .34), (.27, .36), (.26, .38), (.24, .38), (.23, .37)], mat, couleur, (0, 0, 0), 20),
            revolution(nom + ' terreau', [(.236, .36), (.0, .372)], 'peint', 0x302b24, (0, 0, 0), 20, fond=False)]


def plante_ficus():
    o = pot('Pot ficus', 'terreCuite', 0)
    r = random.Random(7)
    for t in range(3):
        a = t * 2.1
        o.append(tube(f'Tronc {t}', [(math.cos(a) * .04, .36, math.sin(a) * .04), (math.cos(a + 1) * .05, .7, math.sin(a + 1) * .05),
                                     (math.cos(a + 2) * .08, 1.05, math.sin(a + 2) * .08)], .012, 'boisFonce', 0))
    verts = (0x3e7a42, 0x4f8f4a, 0x2f6b3a, 0x5a9a4c)
    for i in range(140):
        # nuage de feuilles : ellipsoïde entre 0,6 et 1,45 m
        u, v = r.random(), r.random()
        th, ph = 2 * PI * u, math.acos(2 * v - 1)
        rx, ry = .33 + r.random() * .06, .36
        c = Vector((math.sin(ph) * math.cos(th) * rx, 1.08 + math.cos(ph) * ry, math.sin(ph) * math.sin(th) * rx))
        if c.y < .62: continue
        dirn = (c - Vector((0, 1.0, 0))).normalized() + Vector((r.uniform(-.4, .4), r.uniform(-.5, .2), r.uniform(-.4, .4)))
        o.append(feuille(f'Feuille {i}', tuple(c), tuple(dirn), .085 + r.random() * .03, .045, verts[i % 4]))
    piece(o, 'plante-ficus')


def plante_sansevieria():
    o = pot('Pot sansevieria', 'beton', 0)
    r = random.Random(11)
    for i in range(16):
        a = i * 2.39996; d = .03 + (i % 4) * .03
        base = (math.cos(a) * d, .36, math.sin(a) * d)
        haut = .8 + r.random() * .5
        pts = [Vector(base), Vector((math.cos(a) * (d + .05), .36 + haut * .5, math.sin(a) * (d + .05))),
               Vector((math.cos(a) * (d + .09), .36 + haut, math.sin(a) * (d + .09)))]
        bm = bmesh.new()
        cote = Vector((-math.sin(a), 0, math.cos(a))); normale = Vector((math.cos(a), 0, math.sin(a)))
        for face, decal in ((0, 0.0), (1, -.002)):
            gauche = [bm.verts.new(p - cote * l + normale * decal) for p, l in zip(pts, (.03, .035, .002))]
            droite = [bm.verts.new(p + cote * l + normale * decal) for p, l in zip(pts, (.03, .035, .002))]
            for k in range(2):
                bm.faces.new((gauche[k], droite[k], droite[k + 1], gauche[k + 1]) if face == 0
                             else (gauche[k], gauche[k + 1], droite[k + 1], droite[k]))
        f = objet(f'Lame {i}', bm, 'peint', (0x2e5e34, 0x3f7a3c, 0x4b6b2f)[i % 3]); placer(f, (0, 0, 0)); lisse(f, 20)
        o.append(f)
    piece(o, 'plante-sansevieria')


# ================================================================ piles de cartons (emprise 0,84 × 0,76, 1,28 m)
def carton_boite(nom, taille, centre, rot):
    w, h, d = taille; x, y, z = centre
    o = [boite(nom, (x, y + h / 2, z), (w, h, d), 'carton', 0, .006, (0, rot, 0), (x, y, z)),
         boite(nom + ' scotch', (x, y + h + .001, z), (.07, .002, d + .004), 'peint', 0xd8c49a, 0, (0, rot, 0), (x, y, z)),
         boite(nom + ' étiquette', (x - w * .2, y + h * .6, z + d / 2 + .002), (.14, .08, .002), 'papier', 0, 0, (0, rot, 0), (x, y, z)),
         boite(nom + ' flèche', (x + w * .25, y + h * .6, z + d / 2 + .002), (.02, .09, .002), 'peint', NOIR, 0, (0, rot, 0), (x, y, z)),
         boite(nom + ' poignée', (x, y + h * .78, z - d / 2 - .001), (.1, .025, .002), 'peint', 0x2b1d10, 0, (0, rot, 0), (x, y, z))]
    return o


def cartons_pile():
    o = carton_boite('Carton bas', (.7, .5, .6), (0, 0, 0), 0)
    o += carton_boite('Carton milieu', (.55, .42, .5), (.06, .5, -.05), .3)
    o += carton_boite('Carton haut', (.45, .35, .42), (.06, .92, -.05), .552)
    piece(o, 'cartons-pile')


# ================================================================ salon
def canape():
    """3 places, longueur 2,2 m sur x, profondeur 1,0 m, façade +z (le jeu le tourne vers la pièce)."""
    o = [boite('Assise', (0, .3, .02), (2.1, .2, .9), 'tissuCanape', 0, .04),
         boite('Dossier', (0, .6, -.41), (2.2, .52, .2), 'tissuCanape', 0, .06)]
    for s in (-1, 1): o.append(boite(f'Accoudoir {s}', (s * 1.02, .5, .02), (.17, .44, .94), 'tissuCanape', 0, .06))
    for i in range(3):
        x = -.62 + i * .62
        o.append(boite(f'Coussin {i}', (x, .47, .08), (.6, .14, .72), 'tissuCanape', 0, .05))
        o.append(boite(f'Dossier coussin {i}', (x, .7, -.26), (.6, .4, .16), 'tissuCanape', 0, .06, (-.15, 0, 0)))
    for sx in (-1, 1):
        for sz in (-1, 1): o.append(cylindre(f'Pied {sx}{sz}', (sx * 1.0, .09, sz * .38), .022, .18, 'y', 'bois', 0, 8, .014))
    o.append(boite('Coussin déco 1', (-.72, .66, -.12), (.4, .38, .12), 'peint', GOLD, .05, (-.25, .2, .12)))
    o.append(boite('Coussin déco 2', (.74, .66, -.12), (.38, .36, .12), 'peint', RUST, .05, (-.25, -.25, -.1)))
    o.append(boite('Plaid', (1.02, .74, .2), (.2, .04, .5), 'peint', INK, .01))
    o.append(boite('Plaid tombant', (1.12, .56, .2), (.03, .36, .5), 'peint', INK, .008))
    piece(o, 'canape')


def fauteuil():
    o = [boite('Assise fauteuil', (0, .3, .02), (.56, .22, .54), 'tissuCanape', 0, .04),
         boite('Coussin fauteuil', (0, .45, .05), (.44, .1, .46), 'tissuCanape', 0, .04),
         boite('Dossier fauteuil', (0, .64, -.23), (.6, .5, .14), 'tissuCanape', 0, .05, (-.12, 0, 0))]
    for s in (-1, 1): o.append(boite(f'Bras {s}', (s * .26, .48, .02), (.09, .2, .52), 'tissuCanape', 0, .035))
    for sx in (-1, 1):
        for sz in (-1, 1): o.append(cylindre(f'Pied f {sx}{sz}', (sx * .22, .1, sz * .22), .018, .2, 'y', 'bois', 0, 8, .012))
    piece(o, 'fauteuil')


def table_basse():
    o = [revolution('Plateau table basse', [(.6, .635), (.62, .645), (.62, .67), (.6, .685)], 'bois', 0, (0, 0, 0), 32, dessus=True),
         revolution('Pied table basse', [(.2, .0), (.2, .02), (.05, .06), (.04, .64)], 'aluSombre', 0, (0, 0, 0), 20),
         boite('Magazine', (-.18, .69, .1), (.22, .008, .3), 'papier', 0, 0, (0, .4, 0)),
         boite('Couverture', (-.18, .6945, .1), (.2, .001, .28), 'peint', RUST, 0, (0, .4, 0))]
    o += tasse((.2, .685, -.12))
    piece(o, 'table-basse')


# ================================================================ bureau de direction
# Repère : le directeur s'assoit en -z ; dalle d'écran au jeu en (0 ; 1,1 ; -0,341).
def bureau_direction():
    o = [boite('Plateau direction', (0, .75, 0), (3.0, .06, 1.5), 'boisFonce', 0, .012),
         boite('Voile de fond', (0, .47, .5), (1.87, .5, .06), 'boisFonce', 0, .008)]
    for dx in (-1.18, 1.18):
        o.append(boite(f'Caisson {dx}', (dx, .4, 0), (.48, .66, 1.22), 'boisFonce', 0, .008))
        for i in range(3):
            o.append(boite(f'Tiroir {dx}-{i}', (dx, .21 + i * .2, -.616), (.42, .18, .02), 'bois', 0, .004))
            o.append(boite(f'Poignée {dx}-{i}', (dx, .25 + i * .2, -.632), (.18, .014, .02), 'laiton', 0, .004))
    o.append(boite('Sous-main', (0, .782, -.38), (1.0, .004, .5), 'peint', 0x2f4a3a, 0))
    o.append(boite('Cadre écran direction', (0, 1.1, -.31), (.92, .53, .035), 'plastiqueNoir', 0, .008))
    o.append(boite('Pied écran direction', (0, .88, -.28), (.07, .2, .05), 'aluSombre', 0, .008))
    o.append(boite('Socle écran direction', (0, .787, -.28), (.34, .012, .21), 'aluSombre', 0, .005))
    o.append(boite('Clavier direction', (0, .792, -.6), (.44, .016, .14), 'aluSombre', 0, .004))
    o.append(boite('Téléphone', (-.7, .81, -.45), (.2, .06, .22), 'plastiqueNoir', 0, .015, (0, .3, 0)))
    o.append(boite('Combiné', (-.73, .855, -.45), (.05, .035, .2), 'plastiqueNoir', 0, .012, (0, .3, 0)))
    o.append(boite('Parapheur', (.9, .79, .2), (.34, .03, .24), 'peint', 0x5a2230, .004, (0, .2, 0)))
    o.append(revolution('Pot direction', [(.045, 0), (.045, .1)], 'laiton', 0, (-.95, .78, .25), 14))
    o.append(boite('Chevalet nom', (0, .81, .45), (.3, .06, .05), 'boisFonce', 0, .004, (.4, 0, 0)))
    o.append(boite('Plaque nom', (0, .812, .478), (.24, .035, .003), 'laiton', 0, 0, (.4, 0, 0)))
    # lampe de banquier
    o.append(revolution('Lampe pied', [(.11, 0), (.12, .02), (.02, .04), (.015, .3)], 'laiton', 0, (1.2, .78, -.4), 16, dessus=True))
    o.append(revolution('Abat-jour', [(.02, .3), (.11, .22), (.12, .2)], 'peint', 0x1f5e46, (1.2, .78, -.4), 16, fond=False))
    piece(o, 'bureau-direction')


# ================================================================ table de réunion (4,34 × 1,74 m)
def table_reunion():
    o = [dalle_arrondie('Plateau réunion', 4.34, 1.74, .3, .04, (0, .75, 0), 'bois', 0)]
    for dx in (-1.7, 1.7):
        o.append(boite(f'Pied réunion {dx}', (dx, .37, 0), (.12, .7, .9), 'aluSombre', 0, .012))
        o.append(boite(f'Patin {dx}', (dx, .015, 0), (.2, .03, 1.0), 'aluSombre', 0, .006))
    o.append(boite('Poutre', (0, .3, 0), (3.2, .09, .1), 'aluSombre', 0, .01))
    o.append(boite('Trappe câbles', (.62, .772, 0), (.5, .006, .13), 'alu', 0, .002))
    o.append(boite('Visio', (0, .8, 0), (.36, .06, .18), 'plastiqueNoir', 0, .015))
    o.append(boite('Visio voyant', (0, .82, .091), (.02, .006, .003), 'lumiere', 0x49f28a, 0))
    for (dx, dz) in ((-1.2, -.4), (.7, .35), (1.5, -.3)): o += tasse((dx, .77, dz))
    for i, (dx, dz) in enumerate(((-1.3, .55), (0, .55), (1.3, .55), (-1.3, -.55), (0, -.55), (1.3, -.55))):
        o.append(boite(f'Bloc-notes {i}', (dx, .774, dz), (.15, .006, .21), 'papier', 0, 0, (0, .1 * (i - 2.5), 0)))
        o.append(cylindre(f'Stylo {i}', (dx + .1, .776, dz), .005, .14, 'z', 'peint', (INK, RUST, NOIR)[i % 3], 6, rotation=(0, .1 * i, 0)))
    o.append(revolution('Carafe', [(.05, 0), (.06, .12), (.03, .22), (.035, .25)], 'verre', 0, (-.3, .77, .1), 16))
    piece(o, 'table-reunion')


# ================================================================ petits équipements muraux
def extincteur():
    """Repère : mur en -z (support), façade +z."""
    o = [revolution('Bouteille', [(.07, .5), (.076, .52), (.076, .86), (.06, .92), (.03, .94)], 'peint', 0xc8191e, (0, 0, 0), 18),
         cylindre('Tête', (0, .96, 0), .025, .05, 'y', 'verni', NOIR, 12),
         boite('Poignée haute', (0, 1.0, .03), (.03, .012, .12), 'alu', 0, .004, (-.3, 0, 0)),
         boite('Gâchette', (0, .975, .05), (.028, .01, .1), 'alu', 0, .004, (-.1, 0, 0)),
         cylindre('Manomètre', (.03, .95, .03), .016, .01, 'z', 'plastiqueBlanc', 0, 12),
         tube('Flexible', [(-.02, .95, 0), (-.08, .9, .02), (-.09, .65, .04), (-.07, .56, .06)], .01, 'cableNoir', 0),
         boite('Étiquette extincteur', (0, .7, .077), (.08, .12, .002), 'papier', 0, 0),
         boite('Support', (0, .72, -.085), (.13, .24, .03), 'aluSombre', 0, .006),
         boite('Collier', (0, .8, -.02), (.16, .02, .12), 'aluSombre', 0, .004)]
    piece(o, 'extincteur')


def horloge():
    """Centre du cadran à l'origine, face +z ; il est 18:00, l'heure de partir."""
    # profil tourné autour de l'axe du cadran (z), pas de la verticale
    o = [revolution('Cadre horloge', [(.2, -.025), (.215, -.02), (.215, .02), (.2, .028), (.19, .028)], 'aluSombre', 0, (0, 0, 0), 32,
                    fond=True, dessus=False, rotation=(PI / 2, 0, 0)),
         cylindre('Cadran', (0, 0, .018), .19, .004, 'z', 'peint', 0xf4f2ec, 32)]
    groupe_z = []
    for i in range(12):
        a = i / 12 * 2 * PI; longue = i % 3 == 0
        o.append(boite(f'Index {i}', (math.sin(a) * .155, math.cos(a) * .155, .022), (.012, .036 if longue else .02, .003), 'peint', NOIR, 0, (0, 0, -a)))
    o.append(boite('Aiguille heures', (0, -.05, .025), (.016, .1, .003), 'peint', NOIR, 0))
    o.append(boite('Aiguille minutes', (0, .075, .027), (.012, .15, .003), 'peint', NOIR, 0))
    o.append(cylindre('Axe', (0, 0, .029), .01, .006, 'z', 'peint', 0xc8191e, 12))
    piece(o, 'horloge')


def tableau_blanc():
    """Centre à l'origine, face +z ; le planning (affiche du jeu) est posé à z = 0,033."""
    o = [boite('Fond tableau', (0, 0, .005), (3.02, 1.52, .02), 'plastiqueBlanc', 0, .004)]
    for s in (-1, 1):
        o.append(boite(f'Cadre h {s}', (0, s * .785, .018), (3.1, .03, .036), 'alu', 0, .006))
        o.append(boite(f'Cadre v {s}', (s * 1.535, 0, .018), (.03, 1.6, .036), 'alu', 0, .006))
    o.append(boite('Auget', (0, -.82, .06), (3.1, .04, .1), 'alu', 0, .008))
    for i, c in enumerate((0x2f6fd0, 0xc0392b, 0x1f7a4d)):
        o.append(cylindre(f'Feutre tableau {i}', (-.6 + i * .18, -.785, .08), .013, .13, 'x', 'peint', c, 10))
    o.append(boite('Brosse', (.4, -.78, .075), (.14, .04, .05), 'peint', 0x2b2e33, .01))
    piece(o, 'tableau-blanc')


def ecran_mural():
    """Centre à l'origine, face +z ; l'image (graphique du jeu) est à z = 0,032."""
    o = [boite('Téléviseur', (0, 0, 0), (2.0, 1.16, .05), 'plastiqueNoir', 0, .012),
         boite('Support mural', (0, 0, -.05), (.4, .3, .05), 'aluSombre', 0, .006),
         boite('Barre de son', (0, -.66, .03), (1.2, .08, .08), 'plastiqueNoir', 0, .02),
         boite('Diode', (.9, -.55, .026), (.01, .006, .002), 'lumiere', 0xff5a3a, 0)]
    piece(o, 'ecran-mural')


def luminaires():
    """Corps de luminaire de 1 m, étiré en z par le jeu (3 à 5 m) ; le tube lumineux reste au jeu."""
    o = [boite('Profilé', (0, 0, 0), (.16, .07, 1.0), 'alu', 0, .01),
         boite('Joue +', (0, 0, .498), (.17, .075, .006), 'aluSombre', 0, .002),
         boite('Joue -', (0, 0, -.498), (.17, .075, .006), 'aluSombre', 0, .002)]
    piece(o, 'luminaire')
    g = [boite('Grille cadre', (0, 0, 0), (.6, .03, .6), 'alu', 0, .006)]
    for i in range(7): g.append(boite(f'Lame {i}', (0, -.02, -.24 + i * .08), (.52, .012, .025), 'aluSombre', 0, 0, (.5, 0, 0)))
    piece(g, 'bouche')


# ================================================================ cloisons basses
# Module de 1,2 m sur x, 0,16 m d'épaisseur, 1,15 m de haut (rail compris) ; le jeu
# les pose bout à bout sur la longueur exacte de chaque cloison.
def cloison(ident, notes):
    o = [boite('Panneau feutré', (0, .6, 0), (1.16, 1.08, .12), 'cloison', 0, .01),
         boite('Rail', (0, 1.175, 0), (1.2, .05, .18), 'alu', 0, .01),
         boite('Plinthe cloison', (0, .03, 0), (1.16, .06, .13), 'aluSombre', 0, 0)]
    for s in (-1, 1):
        o.append(boite(f'Montant {s}', (s * .59, .58, 0), (.03, 1.14, .17), 'aluSombre', 0, 0))
        o.append(boite(f'Pied {s}', (s * .59, .012, 0), (.05, .024, .26), 'aluSombre', 0, 0))
    if notes:
        for i, (x, y, c) in enumerate(((-.32, .9, 0xf7e06a), (-.22, .86, 0xf2a3c0), (.3, .95, 0x9fe08a))):
            o.append(boite(f'Post-it cloison {i}', (x, y, .0615), (.07, .07, .002), 'peint', c, 0, (0, 0, .1 * (i - 1))))
        o.append(boite('Feuille épinglée', (.05, .82, .0615), (.21, .29, .002), 'papier', 0, 0, (0, 0, -.04)))
        o.append(boite('Punaise', (.05, .95, .064), (.012, .012, .006), 'peint', 0xd62b25, 0))
        o.append(boite('Planning', (.1, .8, -.0615), (.3, .2, .002), 'papier', 0, 0))
    piece(o, ident)


poste(); poste_code(); poste_sheet(); poste_graph()
cloison('cloison', False); cloison('cloison-notes', True)
bibliotheque(); photocopieuse(); machine_cafe(); fontaine()
casier('casier', 0xc9ccd0); casier('casier-b', 0x2f5d5a)
plante_ficus(); plante_sansevieria(); cartons_pile()
canape(); fauteuil(); table_basse(); bureau_direction(); table_reunion()
extincteur(); horloge(); tableau_blanc(); ecran_mural(); luminaires()


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
    # identifiant : (échelle orthographique, hauteur visée, décalage de la silhouette)
    cadrages = {'poste': (1.7, .95, 1.4), 'poste-code': (2.2, .85, 0), 'poste-sheet': (2.2, .85, 0), 'poste-graph': (2.2, .85, 0),
                'bibliotheque-direction': (4.2, 1.0, 2.1), 'photocopieuse': (3.0, .75, 1.5), 'machine-cafe': (2.2, .85, .8),
                'fontaine': (2.2, .8, .7), 'casier': (2.4, .95, .8), 'casier-b': (2.4, .95, .8), 'plante-ficus': (2.2, .8, .8),
                'plante-sansevieria': (2.2, .8, .8), 'cartons-pile': (2.2, .7, .9), 'canape': (3.2, .6, 1.6), 'fauteuil': (2.2, .6, .8),
                'table-basse': (2.2, .5, .9), 'bureau-direction': (4.0, .75, 2.0), 'table-reunion': (5.2, .6, 2.6),
                'extincteur': (1.8, .8, .6), 'horloge': (.7, 0, 0), 'tableau-blanc': (3.6, 0, 0), 'ecran-mural': (2.6, 0, 0),
                'luminaire': (1.6, 0, 0), 'bouche': (1.0, 0, 0), 'cloison': (1.8, .6, 0), 'cloison-notes': (1.8, .6, 0)}
    images = []
    for ident, (echelle, hauteur, decalage) in cadrages.items():
        # le verre s'afficherait opaque : on le masque pour voir l'intérieur
        for o in COLL.objects: o.hide_render = o.get('acc_id') != ident or o.data.materials[0].name in ('ACC_verre', 'ACC_eau')
        ref.hide_render = decalage == 0
        ref.location = J(-decalage, 0, -.2)
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
    im.filepath_raw = str(OUT / 'planche-mobilier.png'); im.file_format = 'PNG'; im.save()


if not args.sans_rendu: planche()

# ---------------------------------------------------------------- export
for o in bpy.data.objects: o.select_set(o.get('acc_id') is not None)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'mobilier-v02.glb'), export_format='GLB', use_selection=True,
                          export_extras=True, export_yup=True, export_apply=True, export_vertex_color='MATERIAL',
                          export_normals=True, export_texcoords=True, export_materials='EXPORT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'mobilier-v02.blend'))
print('EXPORT', (OUT / 'mobilier-v02.glb').stat().st_size)

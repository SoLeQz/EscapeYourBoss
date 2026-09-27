"""Tendances v06 : Aura Farming, Griddy, Floss et Apple.

Grille rythmique commune à la musique (composer_sons_emotes.py) et aux
chorégraphies (creer_emotes_tendances.py --version v06). Un temps k tombe à
T0 + k × 60 / BPM secondes ; la durée de l'emote couvre toute la musique.

Musiques ORIGINALES, composées et synthétisées ici : aucune musique de trend
n'est téléchargée ni embarquée. Les gestes sont des adaptations documentées
dans art/emotes/tendances-v06/REFERENCES.md, réanimées pour le rig de Lao D.
"""
import math
from mathutils import Vector

GRILLES = {
    # identifiant : (BPM, premier temps en s, nombre de temps joués, durée de l'emote en s)
    'aura-farming': (90, .15, 12, 8.6),
    'griddy': (140, .10, 16, 7.4),
    'floss': (128, .10, 16, 8.0),
    'apple': (124, .10, 16, 8.3),
}


def grille(ident):
    bpm, t0, n, duree = GRILLES[ident]
    temps = 60 / bpm
    return (lambda k: t0 + k * temps), temps, n, duree


# ---------------------------------------------------------------------------
#  Repères du corps de Lao D (coordonnées du jeu : x = droite du personnage,
#  y = haut, z = devant). C convertit vers Blender. Mesurés sur l'atelier.
# ---------------------------------------------------------------------------
def G(C, x, y, z): return C @ Vector((x, y, z))


REPOS_JAMBES = {'legL': [-.05, 0, -.07], 'legR': [-.05, 0, .07], 'kneeL': [.12, 0, 0], 'kneeR': [.12, 0, 0],
                'footL': [-.07, 0, 0], 'footR': [-.07, 0, 0]}


def fusion(*poses):
    p = {}
    for q in poses: p.update(q)
    return p


class Choregraphe:
    """Pose des clés sur la grille musicale ; IK pour les contacts (mains, visage)."""
    def __init__(self, ident, rig, cle, C):
        self.t, self.temps, self.n, self.duree = grille(ident)
        self.rig, self.cle, self.C = rig, cle, C
        self.cache = {}

    def main(self, pose, cote, cible, normale=None, doigts=None, depart=None):
        """Place la paume ; mémorise la solution (les cibles reviennent souvent)."""
        cle = (cote, tuple(round(v, 4) for v in cible), normale and tuple(round(v, 3) for v in normale),
               doigts and tuple(round(v, 3) for v in doigts), tuple(sorted((k, tuple(v) if isinstance(v, list) else v)
                                                               for k, v in pose.items() if k in ('root', 'upper', 'dx', 'dy', 'dz'))))
        if cle not in self.cache:
            n = normale and G(self.C, *normale).normalized()
            d = doigts and G(self.C, *doigts).normalized()
            r = self.rig.ik(dict(pose), cote, G(self.C, *cible), n, d, depart)
            self.cache[cle] = {k: r[k] for k in ('arm' + cote, 'elbow' + cote, 'main' + cote)}
        return fusion(pose, self.cache[cle])

    def k(self, beat, pose): self.cle(self.t(beat), pose)
    def a(self, temps_s, pose): self.cle(temps_s, pose)


# ---------------------------------------------------------------------------
#  AURA FARMING — le jeune danseur du Pacu Jalur (Riau, 2025) : posture de proue
#  stable, regard impassible, vagues lentes des bras, poignets qui roulent, coups de
#  pagaie pour l'équipage, salut du bout des doigts. 90 BPM, 12 temps.
# ---------------------------------------------------------------------------
def aura_farming(ch):
    stable = fusion({'legL': [-.03, 0, -.13], 'legR': [-.03, 0, .13], 'kneeL': [.26, 0, 0], 'kneeR': [.26, 0, 0],
                     'footL': [-.2, 0, .09], 'footR': [-.2, 0, -.09], 'dy': -.035, 'clignement': .38, 'bouche': .95,
                     'head': [-.07, .0, 0]})

    def balance(s): return {'dx': .022 * s, 'root': [0, .05 * s, -.035 * s], 'upper': [-.02, -.07 * s, .05 * s],
                            'head': [-.07, -.14 * s, .04 * s]}

    def vague(cote, phase):
        # Bras de vague : monte en avant, déroule, s'ouvre sur le côté. phase 0..3
        s = 1 if cote == 'R' else -1
        bras = [[-.65, 0, .25 * s], [-1.35, .15 * s, .55 * s], [-1.1, .35 * s, 1.05 * s], [-.45, .2 * s, 1.2 * s]][phase]
        coude = [-1.25, -.75, -.35, -.2][phase]
        poignet = [[.35, s * .6, -.4 * s], [-.45, s * 1.0, .35 * s], [.4, s * .85, .6 * s], [-.25, s * .5, .2 * s]][phase]
        return {'arm' + cote: bras, 'elbow' + cote: [coude, 0, 0], 'main' + cote: poignet, 'main' + cote + '_Ouvert': .85}

    ch.a(0, {})
    ch.k(0, fusion(stable, balance(0)))
    # Vague droite puis gauche : chaque phase sur un demi-temps, balancement du bassin
    for i, (cote, s) in enumerate([('R', 1), ('L', -1)]):
        base = 1 + i * 2.5
        for ph in range(4):
            ch.k(base + ph * .5, fusion(stable, balance(s if ph < 2 else -s), vague(cote, ph)))
    # Pagaie : deux coups à droite, deux à gauche ; mains l'une au-dessus de l'autre
    def pagaie(s, avant):
        # Les deux mains sur le manche, du même côté, devant le corps : on plante loin
        # devant puis on tire jusqu'à la hanche (jamais derrière le dos).
        z = .38 if avant else .12
        haut = ('L' if s > 0 else 'R'); bas = ('R' if s > 0 else 'L')
        p = fusion(stable, {'upper': [.16, -s * (.28 if avant else .1), -s * .05], 'root': [0, -s * .08, 0], 'dy': -.06,
                            'head': [-.02, s * .18, 0]})
        p = ch.main(p, haut, (s * .1, 1.28, .37 if avant else .24))  # jamais contre le buste
        p = ch.main(p, bas, (s * .31, .98, z))
        p.update({'main' + haut + '_Poing': .7, 'main' + bas + '_Poing': .7})
        return p
    for j, (s, avant) in enumerate([(1, 1), (1, 0), (1, 1), (1, 0), (-1, 1), (-1, 0), (-1, 1), (-1, 0)]):
        ch.k(6 + j * .5, pagaie(s, avant))
    # Salut du bout des doigts puis index vers l'horizon, regard lointain
    salut = ch.main(fusion(stable, balance(-1)), 'R', (.1, 1.74, .1), (-.4, -.3, 1), (-.6, .8, 0))
    salut.update({'mainR_Index': .7, 'mainR_Ouvert': .3, 'head': [-.1, -.12, .06]})
    ch.k(10, salut)
    pointe = ch.main(fusion(stable, balance(1)), 'R', (.26, 1.5, .5), (0, -.4, -1), (.3, .1, 1))
    pointe.update({'mainR_Index': 1, 'head': [-.12, .18, 0], 'clignement': .5})
    ch.k(10.75, pointe)
    ch.k(11.5, fusion(pointe, {'head': [.12, .18, 0], 'clignement': .6}))  # petit hochement : l'aura est là
    ch.a(ch.duree - .35, fusion(REPOS_JAMBES, {'elbowL': [-.35, 0, 0], 'elbowR': [-.35, 0, 0]}))
    ch.a(ch.duree, {})


# ---------------------------------------------------------------------------
#  GRIDDY — talons tapés en alternance, bras qui balancent à l'opposé, puis les
#  mains en jumelles devant les yeux (« put your B's up »). 140 BPM, 16 temps.
# ---------------------------------------------------------------------------
def griddy(ch):
    def talon(cote, bras=True, haut=0):
        s = 1 if cote == 'R' else -1
        autre = 'L' if cote == 'R' else 'R'
        p = {'leg' + cote: [-.42, 0, .04 * s], 'knee' + cote: [.08, 0, 0], 'foot' + cote: [-.62, 0, 0],
             'leg' + autre: [.02, 0, -.05 * s], 'knee' + autre: [.36, 0, 0], 'foot' + autre: [-.3, 0, 0],
             'dy': -.045 + haut, 'upper': [-.08, -.14 * s, 0], 'root': [0, .08 * s, 0], 'head': [-.05, .1 * s, 0], 'bouche': 1.15}
        if bras:  # bras opposé devant, poings mi-fermés
            p.update({'arm' + autre: [-.75, 0, .08 * -s], 'elbow' + autre: [-1.2, 0, 0], 'main' + autre: [.2, -s * .8, 0],
                      'arm' + cote: [.5, 0, .1 * s], 'elbow' + cote: [-.55, 0, 0], 'main' + cote: [.1, s * .9, 0],
                      'mainL_Poing': .55, 'mainR_Poing': .55})
        return p

    def jumelles(pose):
        for cote, s in [('L', -1), ('R', 1)]:
            pose = ch.main(pose, cote, (s * .04, 1.66, .16), (-s, 0, .15), (0, .2, 1), [-1.4, -s * .2, -s * .2, -2.1, 0, 0, 0])
        pose.update({'doigtsL': [1.05, 0, 0], 'doigtsR': [1.05, 0, 0], 'head': [.05, 0, 0], 'bouche': 1.3,
                     'regard_x': 0, 'clignement': .15})
        return pose

    ch.a(0, {})
    for phrase in range(2):
        b = phrase * 8
        for i in range(4):  # quatre talons avec balancier des bras
            cote = 'R' if i % 2 == 0 else 'L'
            ch.k(b + i - .45, talon(cote, True, .025))   # petit rebond entre deux appuis
            ch.k(b + i, talon(cote))
        # Jumelles tenues deux temps, les talons continuent
        ch.k(b + 4, jumelles(talon('R', False)))
        ch.k(b + 5, jumelles(talon('L', False)))
        # Les bras repartent en arrière, deux talons
        for i, cote in enumerate(['R', 'L']):
            p = talon(cote, False)
            p.update({'armL': [.65, 0, -.1], 'armR': [.65, 0, .1], 'elbowL': [-.35, 0, 0], 'elbowR': [-.35, 0, 0],
                      'upper': [.12, 0, 0], 'mainL_Poing': .4, 'mainR_Poing': .4})
            ch.k(b + 6 + i, p)
    fin = jumelles(fusion(REPOS_JAMBES, {'dy': -.02}))
    fin.update({'head': [-.08, .15, 0], 'clignement': .55})
    ch.k(16, fin)
    ch.a(ch.duree - .3, fusion(REPOS_JAMBES, {'elbowL': [-.4, 0, 0], 'elbowR': [-.4, 0, 0]}))
    ch.a(ch.duree, {})


# ---------------------------------------------------------------------------
#  FLOSS — bras tendus qui passent devant d'un côté, derrière de l'autre, hanches
#  à contresens (« tirer les hanches à travers les bras »). 128 BPM, 16 temps.
# ---------------------------------------------------------------------------
def floss(ch):
    def pose(cote, devant):
        # cote : côté où partent les bras ('L' ou 'R') ; devant : bras devant ou derrière le corps
        s = 1 if cote == 'R' else -1   # +1 : vers la droite du personnage (+x)
        av = -1 if devant else 1        # x < 0 : bras vers l'avant
        ext = 'R' if s > 0 else 'L'     # bras du côté où l'on va : il s'ouvre
        crx = 'L' if s > 0 else 'R'     # l'autre croise devant ou derrière le corps
        p = {'arm' + ext: [av * .4, 0, s * .85], 'arm' + crx: [av * .72, 0, s * .85],
             'elbowL': [-.08, 0, 0], 'elbowR': [-.08, 0, 0], 'mainL': [0, .9, 0], 'mainR': [0, -.9, 0],
             'mainL_Poing': 1, 'mainR_Poing': 1, 'doigtsL': [.9, 0, 0], 'doigtsR': [.9, 0, 0],
             # hanches à l'opposé des bras, buste qui accompagne les bras
             'dx': -s * .08, 'root': [0, -s * .15, s * .1], 'upper': [.05, s * (.42 if devant else .25), -s * .1],
             'head': [-.03, -s * .12, s * .05], 'bouche': 1.2,
             'legL': [-.06, 0, -.07 - s * .05], 'legR': [-.06, 0, .07 - s * .05],
             'kneeL': [.14 + (.12 if s > 0 else 0), 0, 0], 'kneeR': [.14 + (.12 if s < 0 else 0), 0, 0],
             'footL': [-.08, 0, 0], 'footR': [-.08, 0, 0]}
        return p

    ch.a(0, {})
    ch.k(0, fusion(REPOS_JAMBES, {'elbowL': [-.1, 0, 0], 'elbowR': [-.1, 0, 0], 'mainL_Poing': 1, 'mainR_Poing': 1}))
    # Six séries de quatre balancements (un par demi-temps) : on change de côté toutes les deux
    # mesures de basse — gauche devant / droite derrière, puis droite devant / gauche derrière.
    k = 1
    for serie in range(6):
        devant, derriere = ('L', 'R') if serie % 2 == 0 else ('R', 'L')
        for _ in range(2):
            ch.k(k, pose(devant, True)); k += .5
            ch.k(k, pose(derriere, False)); k += .5
    # Final sur le dernier temps : un passage devant plus large, clin d'œil
    fin = pose('L', True); fin.update({'clignement': .8, 'bouche': 1.4, 'head': [-.12, .2, .1]})
    ch.k(k + .25, fin)
    ch.k(15.5, fin)
    ch.a(ch.duree - .35, fusion(REPOS_JAMBES, {'elbowL': [-.3, 0, 0], 'elbowR': [-.3, 0, 0]}))
    ch.a(ch.duree, {})


# ---------------------------------------------------------------------------
#  APPLE — mains sur les hanches et coups de hanche, pomme tenue au-dessus de la
#  tête, vague du buste, volant imaginaire, balancier des bras. 124 BPM, 16 temps.
# ---------------------------------------------------------------------------
def apple(ch):
    base = fusion(REPOS_JAMBES, {'kneeL': [.2, 0, 0], 'kneeR': [.2, 0, 0], 'legL': [-.08, 0, -.09], 'legR': [-.08, 0, .09],
                                 'footL': [-.12, 0, 0], 'footR': [-.12, 0, 0], 'dy': -.02, 'bouche': 1.1})

    def hanches(pose, cotes='LR'):
        for cote in cotes:
            s = 1 if cote == 'R' else -1
            pose = ch.main(pose, cote, (s * .165, 1.0, .03), (-s, .1, 0), (0, -.55, .75), [.15, 0, s * .6, -1.7, 0, 0, 0])
            pose['main' + cote + '_Ouvert'] = .6
        return pose

    def coup_de_hanche(s, extra=None):
        return fusion(base, {'dx': .06 * s, 'root': [0, .08 * s, -.09 * s], 'upper': [0, -.06 * s, .1 * s],
                             'head': [-.04, .08 * s, -.08 * s], 'leg' + ('L' if s > 0 else 'R'): [-.18, 0, -.1 * s],
                             'knee' + ('L' if s > 0 else 'R'): [.45, 0, 0], 'foot' + ('L' if s > 0 else 'R'): [-.25, 0, 0]},
                      extra or {})

    ch.a(0, {})
    # Mains sur les hanches, quatre coups de hanche avec haussement d'épaules
    for i in range(4):
        s = 1 if i % 2 == 0 else -1
        p = hanches(coup_de_hanche(s))
        ch.k(i, p)
    # La pomme : main droite au-dessus de la tête, paume vers le ciel ; regard vers elle
    pomme = hanches(fusion(base, {'upper': [-.1, 0, -.06], 'head': [-.32, .1, 0], 'bouche': 1.35}), 'L')
    pomme = ch.main(pomme, 'R', (.12, 1.86, .1), (0, 1, 0), (0, 0, 1), [-2.6, 0, .3, -.6, 0, 0, 0])
    pomme.update({'mainR_Poing': .35, 'mainR_Ouvert': .5})
    ch.k(4, pomme)
    ch.k(5, fusion(pomme, {'dx': .03, 'root': [0, 0, -.05]}))
    # Vague du buste en redescendant
    for j, (ux, dy) in enumerate([(-.18, 0), (.28, -.06), (-.05, -.02)]):
        p = hanches(fusion(base, {'upper': [ux, 0, 0], 'head': [-ux * .6, 0, 0], 'dy': dy, 'root': [ux * .4, 0, 0]}))
        ch.k(6 + j * .66, p)

    # Volant : mains à 10 h et 2 h, on tourne à gauche puis à droite
    def volant(angle, s=0):
        centre = (0, 1.17, .34); r = .2
        p = fusion(base, {'upper': [.08, angle * .35, 0], 'head': [0, angle * .4, 0], 'dx': .02 * s, 'bouche': 1.2})
        for cote, a0 in [('L', 150), ('R', 30)]:
            a = math.radians(a0) + angle
            # Main gauche du côté x < 0 (là où se trouve l'épaule gauche), droite du côté x > 0
            pos = (centre[0] + r * math.cos(a), centre[1] + r * math.sin(a), centre[2])
            sgn = -1 if cote == 'L' else 1
            p = ch.main(p, cote, pos, (-sgn * .25, 0, 1), (-sgn * .2, .9, .2), [-1.0, 0, 0, -1.6, 0, 0, 0])
            p['main' + cote + '_Poing'] = .75
        return p
    for j, (ang, s) in enumerate([(0, 0), (-.8, -1), (-.8, -1), (.8, 1), (.8, 1), (0, 0)]):
        ch.k(8 + j * .8, volant(ang, s))
    # Balancier des bras et genoux qui rebondissent
    for j in range(3):
        s = 1 if j % 2 == 0 else -1
        ch.k(13 + j * .66, fusion(coup_de_hanche(s), {'armL': [-.7 * s, 0, -.1], 'armR': [.7 * s, 0, .1],
                                                      'elbowL': [-.5, 0, 0], 'elbowR': [-.5, 0, 0], 'mainL_Ouvert': .8, 'mainR_Ouvert': .8}))
    fin = hanches(coup_de_hanche(1, {'head': [-.1, .22, -.12], 'clignement': .7, 'bouche': 1.4}))
    ch.k(15.3, fin)
    ch.k(16, fin)
    ch.a(ch.duree - .3, fusion(REPOS_JAMBES, {'elbowL': [-.35, 0, 0], 'elbowR': [-.35, 0, 0]}))
    ch.a(ch.duree, {})


CHOREGRAPHIES = {'aura-farming': aura_farming, 'griddy': griddy, 'floss': floss, 'apple': apple}
APERCUS = {'aura-farming': 3.9, 'griddy': 2.1, 'floss': 1.1, 'apple': 2.1}  # instant du rendu de vignette (s)

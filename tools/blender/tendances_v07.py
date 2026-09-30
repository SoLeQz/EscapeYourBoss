"""Chorégraphies v07, créées et cuites exclusivement dans Blender.

Les cadences sont des choix d'animation, pas une attribution de droits ni une
mesure d'un morceau embarqué. Aura : 130 BPM provisoire (à recaler sur le master
fourni) ; Griddy : 158 BPM, pas sur les demi-temps à 79 ; Floss : 128 BPM.
Références visuelles : Dhika / reportage CNA 3EViIwcYlMM ; Allen Davis
f-PZjHjurJ4 ; Backpack Kid / DistractTV PgfjZSbX4Fo et STEEZY zRQDeeGKcz4.
Aucune musique n'est synthétisée ou téléchargée par ce module.
"""
import math
from mathutils import Vector

GRILLES = {
    'aura-farming': (130, .35, 16, 8.4),
    'griddy': (158, .35, 16, 7.2),
    'floss': (128, .35, 16, 8.3),
}
APERCUS = {'aura-farming': 2.19, 'griddy': 2.60, 'floss': 1.76}


def grille(ident):
    bpm, t0, n, duree = GRILLES[ident]
    temps = 60 / bpm
    return (lambda k: t0 + k * temps), temps, n, duree


def fusion(*poses):
    p = {}
    for q in poses:
        p.update(q)
    return p


def appui(flex=.22, ecart=.08):
    """Genoux souples, semelles horizontales avant correction des contacts."""
    return {'legL': [-flex / 2, 0, -ecart], 'legR': [-flex / 2, 0, ecart],
            'kneeL': [flex, 0, 0], 'kneeR': [flex, 0, 0],
            'footL': [-flex / 2, 0, 0], 'footR': [-flex / 2, 0, 0]}


class Choregraphe:
    """Courbes originales sur grille ; clés triées avant interpolation quaternion."""
    def __init__(self, ident, rig, cle, C):
        self.t, self.temps, self.n, self.duree = grille(ident)
        self.rig, self.cle, self.C = rig, cle, C
        self.cache, self.keys, self.marqueurs = {}, {}, []

    def main(self, pose, cote, cible, normale=None, doigts=None, depart=None):
        # Les appuis n'affectent pas le bras : réutiliser exactement le même IK
        # permet d'animer plusieurs rebonds sans faire papillonner les coudes.
        key = (cote, tuple(cible), tuple(normale or ()), tuple(doigts or ()),
               tuple(depart or ()), tuple((k, tuple(pose[k]) if isinstance(pose[k], list) else pose[k])
                                        for k in ('root', 'upper', 'dx', 'dy', 'dz') if k in pose))
        if key not in self.cache:
            V = lambda v: self.C @ Vector(v)
            solution = self.rig.ik(dict(pose), cote, V(cible),
                                   V(normale).normalized() if normale else None,
                                   V(doigts).normalized() if doigts else None, depart)
            self.cache[key] = {k: solution[k] for k in ('arm' + cote, 'elbow' + cote, 'main' + cote)}
        return fusion(pose, self.cache[key])

    def a(self, seconds, pose):
        if not 0 <= seconds <= self.duree:
            raise ValueError('Clé hors du clip : %s' % seconds)
        self.keys[round(seconds * 60) / 60] = dict(pose)

    def k(self, beat, pose):
        self.a(self.t(beat), pose)

    def marker(self, beat, name):
        self.marqueurs.append((self.t(beat), name))

    def finir(self):
        for t, pose in sorted(self.keys.items()):
            self.cle(t, pose)


def aura_farming(ch):
    """Pacu Jalur : économie du buste, assurance calme, isolations des poignets.

    Une phrase de quatre gestes, avec anticipations et tenues lisibles. La v06
    mimait une pagaie : supprimée car ce n'est pas la signature du danseur.
    """
    base = fusion(appui(.24, .105), {'head': [-.05, 0, 0], 'clignement': .2,
                                   'bouche': 1.0, 'mainL_Ouvert': .65, 'mainR_Ouvert': .65})

    def corps(s=0):
        return fusion(base, {'root': [0, s * .045, -s * .025],
                             'upper': [-.025, -s * .10, s * .025],
                             'head': [-.045, s * .065, -s * .025]})

    def essuie(phase, s=1):
        # Avant-bras horizontal ; autre main balaie sa longueur en dessous, à
        # 7 cm de distance. Pas de « pagaie » ni de contact paume/torse.
        p = corps(s)
        haut, bas = ('R', 'L') if s > 0 else ('L', 'R')
        p = ch.main(p, haut, (s * .10, 1.31, .40), (0, -1, 0), (-s, 0, 0),
                    [-.85, 0, s * .30, -1.10, 0, 0, 0])
        p = ch.main(p, bas, (s * (-.18 + .40 * phase), 1.22, .39), (0, 1, .12), (s, 0, 0),
                    [-.65, 0, -s * .24, -1.45, 0, 0, 0])
        p['main' + haut + '_Poing'] = .2
        p['main' + haut + '_Ouvert'] = .3
        p['main' + bas + '_Ouvert'] = .85
        return p

    def roule(phase):
        # Deux petits cercles alternés, poings devant le buste. Une main passe
        # au-dessus de l'autre, avec 12 cm de profondeur entre leurs trajectoires.
        p = corps(0)
        a = phase * 2 * math.pi
        for cote, s in [('L', -1), ('R', 1)]:
            ang = a + (math.pi if s > 0 else 0)
            p = ch.main(p, cote, (s * .16, 1.27 + .085 * math.sin(ang), .36 + .07 * math.cos(ang)),
                        (0, -1, .25), (s, 0, 0),
                        [-.7, 0, s * .28, -1.5, 0, -s * .5, 0])
            p['main' + cote + '_Ouvert'] = 0
            p['main' + cote + '_Poing'] = .60
        return p

    def ouvre(s, avant):
        p = corps(s)
        actif, autre = ('R', 'L') if s > 0 else ('L', 'R')
        p = ch.main(p, actif, (s * (.28 if avant else .43), 1.40 if avant else 1.26, .40 if avant else .12),
                    (0, 1 if avant else .1, .15 if avant else 1), (s * .3, 0, 1),
                    [-1.2, 0, s * .65, -.60, 0, 0, 0])
        p.update({'arm' + autre: [.28, 0, -s * .3], 'elbow' + autre: [-.38, 0, 0],
                  'main' + autre: [.15, s * .55, -s * .18]})
        p['main' + actif + '_Index'] = .75 if avant else 0
        p['main' + actif + '_Ouvert'] = .15 if avant else .75
        return p

    ch.a(0, {})
    ch.k(0, corps())
    ch.marker(1, 'Avant-bras posé / balayage')
    for beat, phase in [(1, 0), (1.5, .1), (2.5, 1), (3, 1), (3.5, .6)]:
        ch.k(beat, essuie(phase))
    ch.marker(4, 'Poignets : deux rotations contrôlées')
    for j in range(9):
        ch.k(4 + j * .5, roule((j % 4) / 4))
    ch.marker(8.5, 'Ouvrir et pointer, regard impassible')
    ch.k(8.5, ouvre(1, False)); ch.k(9.5, ouvre(1, True)); ch.k(10, ouvre(1, True))
    ch.k(10.5, ouvre(-1, False)); ch.k(11.5, ouvre(-1, True)); ch.k(12, ouvre(-1, True))
    ch.marker(12.5, 'Balayage retour et pose calme')
    ch.k(12.5, essuie(0, -1)); ch.k(13.5, essuie(1, -1)); ch.k(14, essuie(1, -1))
    final = ouvre(1, False)
    final.update({'head': [-.08, .13, .035], 'clignement': .32})
    ch.k(15, final); ch.k(16, final)
    ch.a(ch.duree - .25, fusion(appui(.16), {'elbowL': [-.32, 0, 0], 'elbowR': [-.32, 0, 0]}))
    ch.a(ch.duree, {})


def griddy(ch):
    """Huit talons alternés à 79 pas/minute ; appui, rebond, retour sous le bassin.

    Épaules souples, bras bas et balancier arrière, sans lever haut les genoux.
    Les jumelles viennent aux yeux sur deux pas, puis repartent vers l'arrière.
    Le morph Cercle (mains-v03) ferme index et pouce, trois doigts ouverts.
    L'IK aligne le centre de l'anneau devant chaque œil, sans enfoncer la paume.
    """
    def pas(s, phase):
        actif, support = ('R', 'L') if s > 0 else ('L', 'R')
        # contact / compression / passage / préparation du prochain talon
        thigh, knee, toe, bend, sway = [(-.28, .10, -.40, .32, 1),
                                      (-.12, .22, -.05, .42, .7),
                                      (.16, .44, -.16, .26, .15),
                                      (.10, .30, -.20, .20, -.45)][phase]
        p = {'leg' + actif: [thigh, .035 * s, .055 * s],
             'knee' + actif: [knee, 0, 0], 'foot' + actif: [toe, 0, 0],
             'leg' + support: [-bend / 2, 0, -.045 * s],
             'knee' + support: [bend, 0, 0], 'foot' + support: [-bend / 2, 0, 0],
             'root': [0, .045 * s * sway, -.022 * s * sway],
             'upper': [.10, -.085 * s * sway, .045 * s * sway],
             'head': [-.055, .08 * s * sway, -.04 * s * sway],
             'bouche': 1.08, 'mainL_Poing': .35, 'mainR_Poing': .35}
        # Mains toujours sous la ceinture sur le balancier, coudes débloqués.
        p.update({'arm' + actif: [.35 * sway, 0, .10 * s],
                  'arm' + support: [-.22 * sway, 0, -.12 * s],
                  'elbow' + actif: [-.32, 0, 0], 'elbow' + support: [-.45, 0, 0],
                  'mainL': [.08, .75, -.08], 'mainR': [.08, -.75, .08]})
        return p

    # IK calculée une fois avec buste centré. Les petits rebonds restent dans
    # les jambes ; les mains suivent ensuite la tête dans le même espace local.
    visage = {'upper': [.06, 0, 0], 'root': [0, 0, 0], 'head': [-.045, 0, 0]}
    for cote, s in [('L', -1), ('R', 1)]:
        # Le repère de l'IK est la base des doigts, pas le centre de l'anneau.
        # Recaler ce dernier explicitement après une première solution évite
        # le faux regard à travers les paumes au lieu des trous pouce/index.
        oeil = ch.C @ Vector((s * .041, 1.665, .171))
        locale = ch.C @ Vector((s * .046, -.049, .017))
        cible = ch.C @ Vector((s * .085, 1.65, .15))
        normale = ch.C @ Vector((0, 0, 1))
        doigts = ch.C @ Vector((0, 1, 0))
        depart = [-1.6, 0, s * .45, -2.05, 0, -s * .6, 0]
        for _ in range(3):
            visage = ch.rig.ik(visage, cote, cible, normale, doigts, depart)
            trou = ch.rig.monde(ch.rig.controls['main' + cote], visage) @ locale
            cible += oeil - trou
            depart = visage['arm' + cote] + [visage['elbow' + cote][0]] + visage['main' + cote]
        print('GRIDDY centre anneau', cote, 'écart %.1f mm' % (1000 * (oeil - trou).length), flush=True)
    visage.update({'mainL_Cercle': 1, 'mainR_Cercle': 1,
                   'mainL_Poing': 0, 'mainR_Poing': 0,
                   'doigtsL': [0, 0, 0], 'doigtsR': [0, 0, 0], 'clignement': .08})

    ch.a(0, {})
    ch.a(.18, fusion(appui(.30), {'upper': [.10, 0, 0], 'elbowL': [-.38, 0, 0], 'elbowR': [-.38, 0, 0]}))
    ch.marker(0, 'Talon droit / pointe relevée')
    ch.marker(4, 'B\'s aux yeux : deux pas')
    ch.marker(8, 'Relâcher les bras vers l\'arrière')
    for i in range(8):
        s = 1 if i % 2 == 0 else -1
        for offset, phase in [(0, 0), (.55, 1), (1.05, 2), (1.50, 3)]:
            p = pas(s, phase)
            if i in [2, 3]:
                p.update(visage)
            elif i in [4, 5]:
                swing = [.55, .38, .10, -.12][phase]
                p.update({'armL': [swing, 0, -.16], 'armR': [swing, 0, .16],
                          'elbowL': [-.25, 0, 0], 'elbowR': [-.25, 0, 0]})
            if i == 7 and phase == 0:
                p['clignement'] = .55
            ch.k(i * 2 + offset, p)
    ch.k(16, fusion(appui(.28), {'upper': [.07, 0, 0], 'elbowL': [-.4, 0, 0], 'elbowR': [-.4, 0, 0]}))
    ch.a(ch.duree - .22, fusion(appui(.16), {'elbowL': [-.3, 0, 0], 'elbowR': [-.3, 0, 0]}))
    ch.a(ch.duree, {})


def floss(ch):
    """Trois balancements par côté, puis inversion ; bassin à contresens.

    Le bras intérieur contourne le bassin, l'autre reste dehors. Les clés de
    passage latéral empêchent une interpolation directe ventre -> dos. Les
    poignets restent presque rigides et les coudes légèrement déverrouillés.
    """
    def corps(s):
        # Le bassin se déplace de 8 cm ; les jambes compensent l'inclinaison
        # (~dx / longueur de jambe), et les semelles restent à plat.
        p = fusion(appui(.18, .10), {'dx': -.08 * s,
                      'root': [0, -.045 * s, .10 * s],
                      'upper': [.025, .11 * s, -.10 * s],
                      'head': [-.02, -.065 * s, .015 * s],
                      'mainL_Poing': .92, 'mainR_Poing': .92, 'bouche': 1.03})
        p['footL'] = [-.09, 0, .10 - .10 * s]
        p['footR'] = [-.09, 0, -.10 - .10 * s]
        return p

    def devant(s):
        p = corps(s)
        ext, croise = ('R', 'L') if s > 0 else ('L', 'R')
        p = ch.main(p, ext, (s * .50, .96, .12), (-s * .85, -.55, 0), (s * .55, -.85, 0),
                    [-.2, 0, s * .65, -.10, 0, -s * .9, 0])
        p = ch.main(p, croise, (s * .15, 1.0, .29), (s * .85, .55, 0), (s * .55, -.85, 0),
                    [-.42, 0, s * .58, -.12, 0, s * .9, 0])
        return p

    def derriere(s):
        p = corps(s)
        ext, croise = ('R', 'L') if s > 0 else ('L', 'R')
        p = ch.main(p, ext, (s * .49, .96, .14), (-s * .85, -.55, 0), (s * .55, -.85, 0),
                    [-.18, 0, s * .63, -.10, 0, -s * .9, 0])
        p = ch.main(p, croise, (s * .075, .98, -.28), (s * .85, .55, 0), (s * .55, -.85, 0),
                    [.55, 0, s * .50, -.10, 0, s * .9, 0])
        return p

    def contour(s, vers_dos):
        # Pour passer de devant(-s) à derrière(s), la main qui croise doit
        # d'abord revenir du côté de SON épaule, à l'extérieur du flanc.
        p = corps(0)
        croise = 'L' if s > 0 else 'R'
        autre = 'R' if s > 0 else 'L'
        p = ch.main(p, croise, (-s * .36, .94, -.20),
                    (s, 0, 0), (0, -1, 0), [.12, 0, -s * .22, -.10, 0, s, 0])
        p = ch.main(p, autre, (s * .32, .91, .25),
                    (-s, 0, 0), (0, -1, 0), [-.15, 0, s * .2, -.10, 0, -s, 0])
        return p

    milieu = corps(0)
    for cote, s in [('L', -1), ('R', 1)]:
        milieu = ch.main(milieu, cote, (s * .25, .93, .30),
                        (-s, 0, 0), (0, -1, 0), [-.48, 0, s * .1, -.20, 0, -s, 0])

    poses = {s: {'front': devant(s), 'back': derriere(s),
                 'in': contour(s, True), 'out': contour(s, False)} for s in [-1, 1]}
    ch.a(0, {})
    ch.k(0, milieu)
    # Un cycle = six balancements : gauche avant, droite arrière, gauche
    # avant, droite avant, gauche arrière, droite avant. Trois cycles complets.
    # Les clefs intermédiaires sont des passages, pas des arrêts de geste.
    for cycle in range(3):
        b = .5 + cycle * 5
        for offset, s, nom in [(0, -1, 'front'), (.27, 0, 'middle'), (.45, 1, 'in'), (.85, 1, 'back'),
                                (1.10, 1, 'out'), (1.35, 0, 'middle'), (1.65, -1, 'front'),
                                (2.05, 0, 'middle'), (2.50, 1, 'front'), (2.77, 0, 'middle'),
                                (2.95, -1, 'in'), (3.35, -1, 'back'), (3.60, -1, 'out'),
                                (3.85, 0, 'middle'), (4.15, 1, 'front'), (4.60, 0, 'middle')]:
            ch.k(b + offset, milieu if s == 0 else poses[s][nom])
        ch.marker(b, 'Floss : devant / derrière / devant, inversion')
    ch.k(15.5, poses[-1]['front'])
    ch.k(16, milieu)
    ch.a(ch.duree - .22, fusion(appui(.12), {'elbowL': [-.25, 0, 0], 'elbowR': [-.25, 0, 0]}))
    ch.a(ch.duree, {})


CHOREGRAPHIES = {'aura-farming': aura_farming, 'griddy': griddy, 'floss': floss}

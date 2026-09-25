"""Ela Ké Leitada — chorégraphie de gestes posée dans Blender (v03).

Référence : vidéo TikTok d'Arthur Lima (#arthurlima #dance), capturée avec
Rokoko Vision (art/emotes/references/). La capture sert au TIMING et aux
amplitudes du buste (penché, rotation) ; les gestes sont reposés sur le rig de
Lao D avec une cinématique inverse, pour que les contacts tombent juste :
paume sur la bouche, main sur la montre, doigts sous le menton.

Temps vidéo → temps emote : e = (v - 6.10) × 0.942 (le drop de la vidéo à 6,10 s
tombe au début du mp3 ; 80 BPM dans la vidéo, 85 dans l'extrait).
"""
import math
import numpy as np
from mathutils import Matrix, Vector, Quaternion

TEMPS = .3526; T0 = .692           # grille du mp3 (voir creer_emotes_tendances.py)
def temps(k): return T0 + k * TEMPS  # accents forts : k = -2, 2, 6, 10, 14, 18, 22, 26


class Rig:
    """Cinématique directe sur les empties de l'atelier, sans passer par le depsgraph."""
    def __init__(self, controls, nodes, data, quaternion, C, REST):
        self.controls, self.nodes, self.q, self.C, self.REST = controls, nodes, quaternion, C, REST
        self.bone_of = {o: b for b, o in controls.items()}
        self.bouche = nodes[data['controls']['bouche']]

    def monde(self, o, pose):
        m = Matrix.Identity(4)
        chaine = []
        while o is not None: chaine.append(o); o = o.parent
        for n in reversed(chaine):
            b = self.bone_of.get(n)
            if b == 'root':
                loc = self.C @ Vector((pose.get('dx', 0), .85 + pose.get('dy', 0), pose.get('dz', 0)))
            else:
                loc = n.location
            rot = self.q(pose.get(b, self.REST[b])) if b in self.REST else n.rotation_quaternion
            m = m @ Matrix.LocRotScale(loc, rot, n.scale)
        return m

    def pos(self, nom, pose): return self.monde(self.controls[nom], pose).translation
    def bouche_pos(self, pose): return self.monde(self.bouche, pose).translation
    def avant(self, pose):  # direction du regard (Blender)
        return (self.monde(self.controls['head'], pose).to_quaternion() @ Vector((0, -1, 0))).normalized()

    def paume(self, cote, pose):
        main = self.monde(self.controls['main' + cote], pose)
        doigts = self.monde(self.controls['doigts' + cote], pose).translation
        w = main.translation
        normale = (main.to_quaternion() @ Vector((0, -1, 0))).normalized()  # +Z du jeu = paume
        return w + (doigts - w) * 1.0, normale, (doigts - w).normalized()

    def ik(self, pose, cote, cible, normale=None, doigts=None, depart=None, poids_n=.6, poids_d=.3):
        """Place la paume de `cote` sur `cible` (Blender, m). Renvoie la pose complétée."""
        cles = ['arm' + cote, 'elbow' + cote, 'main' + cote]
        x0 = np.array(depart or [-.6, 0, 0, -1.4, 0, 0, 0], float)
        torse = self.pos('upper', pose)
        # y du poignet et du bras loin de ±π/2 : sinon blocage de cardan des Euler XYZ du jeu
        bornes = [(-3.0, 1.0), (-1.2, 1.2), (-1.6, 1.6), (-2.55, -.05), (-1.3, 1.3), (-1.15, 1.15), (-1.3, 1.3)]
        def poser(x):
            p = dict(pose); p[cles[0]] = [x[0], x[1], x[2]]; p[cles[1]] = [x[3], 0, 0]; p[cles[2]] = [x[4], x[5], x[6]]; return p
        def cout(x):
            x = np.clip(x, [b[0] for b in bornes], [b[1] for b in bornes])
            p = poser(x); P, n, d = self.paume(cote, p)
            e = 1e4 * (P - cible).length_squared
            if normale is not None: e += poids_n * 40 * (1 - n.dot(normale))
            if doigts is not None: e += poids_d * 40 * (1 - d.dot(doigts))
            coude = self.pos('elbow' + cote, p)
            h = Vector((coude.x - torse.x, coude.y - torse.y)).length
            if h < .19 and coude.z > torse.z + .1: e += 3e3 * (.19 - h) ** 2  # coude hors du buste
            e += .15 * float(((x - x0) ** 2).sum())
            return e
        meilleur = None
        rng = np.random.default_rng(7)
        for essai in range(6):
            x = x0 + (rng.normal(0, .35, 7) if essai else 0)
            x = nelder_mead(cout, x, 700)
            c = cout(x)
            if meilleur is None or c < meilleur[0]: meilleur = (c, x)
        x = np.clip(meilleur[1], [b[0] for b in bornes], [b[1] for b in bornes])
        P, _, _ = self.paume(cote, poser(x))
        self.ecarts.append(((P - cible).length, cote))
        return poser([round(float(v), 4) for v in x])
    ecarts = []


def nelder_mead(f, x0, iters):
    n = len(x0); pts = [np.array(x0, float)] + [np.array(x0, float) + np.eye(n)[i] * .25 for i in range(n)]
    val = [f(p) for p in pts]
    for _ in range(iters):
        o = np.argsort(val); pts = [pts[i] for i in o]; val = [val[i] for i in o]
        c = sum(pts[:-1]) / n; r = c + (c - pts[-1]); fr = f(r)
        if fr < val[0]:
            e = c + 2 * (c - pts[-1]); fe = f(e)
            pts[-1], val[-1] = (e, fe) if fe < fr else (r, fr)
        elif fr < val[-2]: pts[-1], val[-1] = r, fr
        else:
            k = c + .5 * (pts[-1] - c); fk = f(k)
            if fk < val[-1]: pts[-1], val[-1] = k, fk
            else:
                pts = [pts[0]] + [pts[0] + .5 * (p - pts[0]) for p in pts[1:]]; val = [val[0]] + [f(p) for p in pts[1:]]
    return pts[int(np.argmin(val))]


def choregraphie(rig, cle):
    """Pose les clés. `cle(t, pose)` est celui de creer_emotes_tendances.py."""
    Z = Vector((0, 0, 1)); X = Vector((1, 0, 0))

    def appui(pose, flex=.16):
        pose.update({'legL': [-flex / 2, 0, -.07], 'legR': [-flex / 2, 0, .07], 'kneeL': [flex, 0, 0], 'kneeR': [flex, 0, 0],
                     'footL': [-flex / 2, 0, 0], 'footR': [-flex / 2, 0, 0]}); return pose

    def corps(lean=0., tourne=0., tete=(0., 0., 0.), rebond=0., flex=.16):
        p = appui({'upper': [lean, tourne, 0], 'head': list(tete), 'root': [0, tourne * .35, 0]}, flex + rebond)
        p['dy'] = -rebond * .12; return p

    # --- gestes -----------------------------------------------------------
    def main_bouche(p, cote='R'):
        b = rig.bouche_pos(p); av = rig.avant(p); s = 1 if cote == 'R' else -1
        cible = b + av * .045 + Vector((0, 0, -.005))
        # paume vers le visage, doigts en travers de la bouche
        return rig.ik(p, cote, cible, normale=-av, doigts=(Vector((-s, 0, 0)) + Z * .5).normalized(),
                      depart=[-1.1, 0, -s * .3, -2.2, 0, 0, 0])

    def pouce(p, cote='L', jab=0.):
        # poing fermé, pouce sorti, devant la poitrine ; le jab pousse vers la caméra
        torse = rig.pos('upper', p); av = rig.avant(p); s = 1 if cote == 'R' else -1
        # pouce levé bien devant, à hauteur de poitrine, qui « pique » vers la caméra sur le temps
        cible = torse + Vector((s * .16, 0, .40 + .03 * jab)) + av * (.32 + .08 * jab)
        p = rig.ik(p, cote, cible, normale=(X * -s).normalized(), doigts=av, depart=[-1.0, 0, 0, -1.2, 0, 0, 0], poids_n=.5)
        # Mains v02 : pose « Pouce » = poing fermé, pouce levé. Paume vers l'intérieur,
        # poing vers l'avant : le pouce pointe vers le haut.
        p['main' + cote + '_Pouce'] = 1
        return p

    def montre(p, tap=0.):
        # poignet gauche levé devant la poitrine, cadran vers les yeux ; main droite dessus
        torse = rig.pos('upper', p); av = rig.avant(p)
        poignet = torse + Vector((.0, 0, .36)) + av * .30
        p = rig.ik(p, 'L', poignet + Vector((.05, 0, 0)), normale=-Z, doigts=X, depart=[-.9, 0, .3, -1.9, 0, 0, 0])
        p['mainL_Poing'] = .7
        w = rig.pos('mainL', p) + Vector((0, 0, .035 + .03 * tap))
        p = rig.ik(p, 'R', w, normale=-Z, doigts=-X, depart=[-.9, 0, -.3, -1.9, 0, 0, 0], poids_n=.4)
        p['mainR_Index'] = 1; p['head'] = [.42, -.05, 0]; p['regard_y'] = -.004
        return p

    def menton(p, cote='R'):
        b = rig.bouche_pos(p); av = rig.avant(p)
        cible = b + av * .06 + Vector((0, 0, -.055))
        p = rig.ik(p, cote, cible, normale=Z, doigts=(av + Z).normalized(), depart=[-1.0, 0, -.2, -2.3, 0, 0, 0], poids_n=.3)
        p['main' + cote + '_Index'] = 1; return p

    def mains_jointes(p, h=.24):
        torse = rig.pos('upper', p); av = rig.avant(p)
        for cote, s in [('L', -1), ('R', 1)]:
            p = rig.ik(p, cote, torse + Vector((s * .025, 0, h)) + av * .24, normale=X * -s, doigts=av,
                       depart=[-.5, 0, 0, -1.4, 0, 0, 0])
        return p

    def ventre(p, ouvert=.15):
        torse = rig.pos('upper', p); av = rig.avant(p)
        for cote, s in [('L', -1), ('R', 1)]:
            p = rig.ik(p, cote, torse + Vector((s * .13, 0, -.02)) + av * .17, normale=Z, doigts=av,
                       depart=[-.3, 0, 0, -1.1, 0, 0, 0], poids_n=.2)
            p['main' + cote + '_Poing'] = ouvert
        return p

    def poings(p, haut):
        torse = rig.pos('upper', p); av = rig.avant(p)
        for cote, s in [('L', -1), ('R', 1)]:
            dz = .40 if cote == haut else .24
            p = rig.ik(p, cote, torse + Vector((s * .09, 0, dz)) + av * (.30 if cote == haut else .22), normale=X * -s, doigts=av,
                       depart=[-.6, 0, 0, -1.6, 0, 0, 0], poids_n=.3)
            p['main' + cote + '_Poing'] = 1
        return p

    # --- timeline (voir REFERENCES v03) ----------------------------------
    cle(0, {})
    # A · « Choc » : main sur la bouche, pouce qui pointe (vidéo 6,1–8,4 s)
    for i, k in enumerate([-1.3, -1, 0, 1, 2, 3]):
        rire = 1 if k >= 1 else 0
        p = corps(lean=.05 + .28 * rire, tete=(.06 + .1 * rire, -.08, .04), rebond=.05 * (i % 2))
        p = main_bouche(p, 'R'); p = pouce(p, 'L', jab=i % 2)
        p['bouche'] = 1.0; p['clignement'] = .35 if rire else 0
        cle(max(.28, temps(k)), p)
    # B · clap (vidéo 8,5 s)
    p = corps(lean=.06); p = mains_jointes(p); p['clignement'] = .6; cle(temps(4.5), p)
    # C · balancement satisfait, léger recul et rotation (vidéo 8,7–10,1 s)
    for j, k in enumerate([5.6, 6.3, 7.1, 8]):
        p = corps(lean=-.12, tourne=.12 * (j + 1), tete=(-.08, .1, .15 if j % 2 else .08), rebond=.06 * (j % 2))
        p = ventre(p); p['bouche'] = 1.12; p['regard_x'] = .003
        cle(temps(k), p)
    # D · coup d'œil à la montre (vidéo 10,3–10,5 s)
    p = corps(lean=.1, tourne=.2); p = montre(p); cle(temps(9.3), p)
    # E · doigts sous le menton, penché vers la caméra (vidéo 10,5–11,7 s)
    for j, k in enumerate([10.4, 11, 12]):
        p = corps(lean=.42 - .12 * j, tourne=.12, tete=(-.12, -.1, -.1)); p = menton(p, 'R')
        p['bouche'] = 1.2; cle(temps(k), p)
    # F · poings qui roulent (vidéo 11,8–12,3 s)
    for j, k in enumerate([13.25, 13.75, 14.25, 14.75]):
        p = corps(lean=.08, tete=(.05, 0, .06 * (-1) ** j), rebond=.05 * (j % 2)); p = poings(p, 'L' if j % 2 else 'R'); cle(temps(k), p)
    # G · l'autre main sur la bouche (vidéo 12,5–12,9 s)
    p = corps(lean=.12, tete=(.1, .08, -.05)); p = main_bouche(p, 'L'); cle(temps(15.5), p)
    cle(temps(16.3), p)
    # H · penché, mains jointes (vidéo 13,1–13,4 s)
    p = corps(lean=.42, tete=(.15, 0, 0)); p = mains_jointes(p, .18); p['clignement'] = .7; cle(temps(17.3), p)
    # I · montre (vidéo 13,9–14,4 s)
    p = corps(lean=.08, tourne=-.1); p = montre(p); cle(temps(19), p); cle(temps(20), p)
    # J · reprise du choc sur la mesure suivante
    for i, k in enumerate([21.3, 22, 23, 24, 25]):
        p = corps(lean=.05 + .26 * (i >= 2), tete=(.06, -.08, .04), rebond=.05 * (i % 2))
        p = main_bouche(p, 'R'); p = pouce(p, 'L', jab=i % 2); p['clignement'] = .35 if i >= 2 else 0
        cle(temps(k), p)
    # K · final : l'heure de partir. Tapote la montre deux fois, regarde la caméra.
    for j, (k, tap) in enumerate([(26, 1), (26.5, 0), (27, 1), (27.5, 0)]):
        p = corps(lean=.06, tourne=0); p = montre(p, tap); cle(temps(k), p)
    p = corps(lean=0, tete=(-.05, 0, .1)); p = montre(p); p['head'] = [-.05, 0, .12]; p['regard_y'] = 0; p['bouche'] = 1.15
    cle(temps(28.3), p); cle(temps(29.2), p)
    cle(11.8, {})

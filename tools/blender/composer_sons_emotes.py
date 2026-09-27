"""Musiques ORIGINALES des emotes v06, synthétisées dans Blender (numpy + aud).

Aucune musique de trend n'est téléchargée : chaque morceau est composé ici (motifs,
accords, batterie) dans le style et au tempo de la danse, puis écrit en WAV et MP3.
Déterministe : même script, mêmes fichiers.

blender --background --factory-startup --python-exit-code 1 --python composer_sons_emotes.py -- --out DOSSIER_NEUF
"""
import sys, argparse, wave, importlib.util
from pathlib import Path
import numpy as np
import aud

spec = importlib.util.spec_from_file_location('v06', Path(__file__).with_name('tendances_v06.py'))
v06 = importlib.util.module_from_spec(spec); spec.loader.exec_module(v06)

SR = 48000


def note(n):  # numéro MIDI → Hz
    return 440.0 * 2 ** ((n - 69) / 12)


class Piste:
    def __init__(self, duree):
        self.buf = np.zeros((int(SR * duree) + SR, 2))

    def ajouter(self, t, son, gain=1.0, pan=0.0):
        i = int(round(t * SR)); son = np.asarray(son) * gain
        g, d = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
        n = min(len(son), len(self.buf) - i)
        if n <= 0: return
        self.buf[i:i + n, 0] += son[:n] * g
        self.buf[i:i + n, 1] += son[:n] * d


def env(n, a=.004, d=.2, s=0.0, r=.05, duree=None):
    """Enveloppe ADSR (secondes) sur n échantillons."""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    if duree is not None:
        fin = t > duree
        e = np.where(fin, e * np.exp(-(t - duree) / max(r, 1e-6)), e)
    return e


def passe_bas(x, fc):
    """Filtre passe-bas à un pôle (fc constante ou tableau)."""
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc); y[i] = acc
    return y


def passe_haut(x, fc): return x - passe_bas(x, fc)


RNG = np.random.default_rng(2026)


def bruit(n): return RNG.uniform(-1, 1, n)


# ------------------------------------------------------------------ instruments
def kick(dur=.35, f0=150, f1=45, sale=0.0):
    n = int(SR * dur); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / .035)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (dur * .45))
    x += .25 * bruit(n) * np.exp(-t / .004)
    if sale: x = np.tanh(x * (1 + sale * 6)) / np.tanh(1 + sale * 6)
    return x


def caisse(dur=.22, ton=190, clap=False):
    n = int(SR * dur); t = np.arange(n) / SR
    b = passe_haut(bruit(n), 900)
    if clap:  # trois claquements rapprochés puis la queue
        e = sum(np.exp(-np.clip(t - d, 0, None) / .006) * (t >= d) for d in (0, .011, .022)) * .6 + np.exp(-t / .09) * (t > .022)
        return passe_bas(b, 4500) * e
    return b * np.exp(-t / .07) * .8 + np.sin(2 * np.pi * ton * t) * np.exp(-t / .05) * .5


def charley(dur=.05, ouvert=False):
    n = int(SR * (dur if not ouvert else .28)); t = np.arange(n) / SR
    return passe_haut(bruit(n), 7000) * np.exp(-t / (.018 if not ouvert else .09)) * .7


def rim(dur=.08):
    n = int(SR * dur); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1700 * t) * .6 + passe_haut(bruit(n), 3000) * .5) * np.exp(-t / .012)


def basse808(hz, dur, glisse_vers=None):
    n = int(SR * dur); t = np.arange(n) / SR
    f = np.full(n, hz) if glisse_vers is None else hz * (glisse_vers / hz) ** np.clip((t - dur * .55) / (dur * .3), 0, 1)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return np.tanh(1.6 * x) * env(n, .003, dur * .7, .0, .06, dur)


def fm(hz, dur, ratio=1.0, indice=1.2, d=.6):
    """Piano électrique en synthèse FM."""
    n = int(SR * dur); t = np.arange(n) / SR
    mod = indice * np.exp(-t / .25) * np.sin(2 * np.pi * hz * ratio * t)
    return np.sin(2 * np.pi * hz * t + mod) * env(n, .003, d, .0, .1, dur)


def scie(hz, dur, harmoniques=14, fc=3000, d=.25, s=.3):
    n = int(SR * dur); t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * hz * k * t) / k for k in range(1, harmoniques + 1) if hz * k < 16000)
    return passe_bas(x, fc * (0.35 + env(n, .002, d, .0))) * env(n, .004, d * 2, s, .06, dur)


def carre(hz, dur, d=.18, s=.25, fc=5000):
    n = int(SR * dur); t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * hz * k * t) / k for k in range(1, 16, 2) if hz * k < 16000)
    return passe_bas(x, fc) * env(n, .003, d, s, .05, dur)


def flute(hz, dur):
    n = int(SR * dur); t = np.arange(n) / SR
    vib = 1 + .006 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t / .25, 0, 1)
    x = np.sin(2 * np.pi * np.cumsum(hz * vib) / SR) + .12 * np.sin(4 * np.pi * np.cumsum(hz * vib) / SR)
    x += .04 * passe_bas(bruit(n), 2500)
    return x * env(n, .06, dur, .85, .12, dur * .92)


def cloche(hz, dur):
    n = int(SR * dur); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * hz * t + 1.8 * np.exp(-t / .3) * np.sin(2 * np.pi * hz * 3.5 * t))) * np.exp(-t / .45)


# ------------------------------------------------------------------ morceaux
def morceau_aura(p, T, b):
    """Lo-fi posé en ré mineur, 90 BPM : accords FM, flûte, pas de caisse claire appuyée."""
    accords = [[50, 57, 60, 64, 65], [46, 53, 57, 60, 65], [43, 50, 53, 57, 62], [45, 52, 55, 61, 64]]  # Dm9 Bbmaj9 Gm9 A7
    for mesure in range(3):
        for k in range(4):
            beat = mesure * 4 + k
            p.ajouter(T(beat), kick(.4, 120, 42), .9) if k in (0,) or (k == 2 and mesure != 1) else None
            if k == 2 and mesure == 1: p.ajouter(T(beat + .5), kick(.4, 120, 42), .7)
            if k in (1, 3): p.ajouter(T(beat), rim(), .45, .1)
            for demi in (0, .5):  # charleston swingué
                p.ajouter(T(beat + demi + (.08 if demi else 0)), charley(), .22 if demi else .3, -.3)
        ac = accords[mesure] if mesure < 2 else accords[2]
        # accords tenus jusqu'à la mesure suivante : pas de trou en fin de mesure
        for h in ac: p.ajouter(T(mesure * 4), fm(note(h), b * 4.4, 1.0, 1.1, 2.2), .09, .15)
        p.ajouter(T(mesure * 4), basse808(note(ac[0] - 12), b * 1.8), .55)
        p.ajouter(T(mesure * 4 + 2.5), basse808(note(ac[0] - 12 + (7 if mesure == 0 else 5)), b * 1.3), .45)
    for h in accords[3]: p.ajouter(T(11), fm(note(h), b * 2.5, 1.0, 1.1, 1.2), .08, .15)
    p.ajouter(T(11), basse808(note(45 - 12), b * 1.6), .5)
    # Motif de flûte (pentatonique de ré mineur), réponse à la 2e mesure
    motif = [(0, 69, 1.0), (1, 72, .5), (1.5, 74, .5), (2, 72, 1.5), (4, 67, .5), (4.5, 69, .5), (5, 72, 1),
             (6, 74, .75), (6.75, 77, .25), (7, 76, 1.5), (8, 74, 1), (9, 72, .5), (9.5, 69, 1.5), (11, 62, 1.2)]
    for k, h, d in motif: p.ajouter(T(k), flute(note(h), b * d), .16, -.2)
    # Grain de vinyle : souffle filtré et craquements épars, du début à la fin
    n = int(SR * (T(12) + b)); souffle = passe_bas(bruit(n), 1800) * .018
    craq = np.zeros(n); craq[RNG.integers(0, n, 90)] = RNG.uniform(.05, .18, 90)
    p.ajouter(0, souffle + passe_haut(craq, 2000), 1.0)


def morceau_griddy(p, T, b):
    """Trap en fa# mineur, 140 BPM (demi-temps) : 808 qui glisse, clap sur le 3, charleston en rafales, cloche."""
    racines = [42, 42, 45, 40]
    for mesure in range(4):
        m = mesure * 4
        p.ajouter(T(m), kick(.3, 170, 50), .9)
        p.ajouter(T(m), basse808(note(racines[mesure] - 12), b * 2.2, note(racines[mesure] - 12 + (3 if mesure == 1 else 0)) if mesure == 1 else None), .75)
        p.ajouter(T(m + 2.5), kick(.25, 160, 50), .6)
        p.ajouter(T(m + 2.5), basse808(note(racines[mesure] - 12), b * 1.2), .55)
        p.ajouter(T(m + 2), caisse(clap=True), .7)
        for k in range(8):  # croches
            p.ajouter(T(m + k * .5), charley(), .25 if k % 2 else .35, .25)
        if mesure % 2 == 1:  # rafale de triples croches
            for k in range(6): p.ajouter(T(m + 3 + k / 6), charley(.03), .2, .25)
    cloches = [66, 69, 73, 71, 69, 66, 64, 66]
    for i, h in enumerate(cloches):
        for rep in (0, 8): p.ajouter(T(rep + i * .5 + (1 if i >= 4 else 0)), cloche(note(h + 12), b * 1.1), .1, -.25)
    p.ajouter(T(16), kick(.5, 170, 45), .8); p.ajouter(T(16), basse808(note(42 - 12), b * 2.2), .7); p.ajouter(T(16), caisse(clap=True), .5)


def morceau_floss(p, T, b):
    """Électro rebondissante en la mineur, 128 BPM : grosse caisse régulière, basse à contretemps, arpèges pincés."""
    grille = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]]  # Am F C G
    for k in range(16):
        p.ajouter(T(k), kick(.28, 140, 48), .85)
        if k % 2: p.ajouter(T(k), caisse(clap=True), .6)
        p.ajouter(T(k + .5), charley(ouvert=True), .22, .3)
        ac = grille[(k // 4) % 4]
        p.ajouter(T(k + .5), scie(note(ac[0] - 24), b * .45, 10, 900, .12, .2), .5)
        for j, h in enumerate([ac[0], ac[1], ac[2], ac[1]]):  # arpège en doubles croches
            p.ajouter(T(k + j * .25), scie(note(h + 12), b * .22, 8, 3500, .06, 0), .09, -.3 + .2 * j)
    # Petit gimmick joyeux sur les deux dernières mesures
    for i, h in enumerate([76, 79, 81, 79, 76, 74, 72, 74]):
        p.ajouter(T(8 + i), carre(note(h), b * .45, .12, .15, 3500), .08, .2)
    p.ajouter(T(16), kick(.4, 140, 45), .8); p.ajouter(T(16), scie(note(45 - 12), b * 1.5, 10, 700, .3, .2), .5)


def morceau_apple(p, T, b):
    """Électroclash saturée en do# mineur, 124 BPM : basse en scie pompée, riff en carré, claps."""
    racines = [49, 49, 54, 52]  # C#  C#  F#  E
    riff = [(0, 73, .5), (.5, 76, .5), (1, 78, .75), (2, 76, .5), (2.5, 73, .5), (3, 71, .75)]
    for mesure in range(4):
        m = mesure * 4
        for k in range(4):
            p.ajouter(T(m + k), kick(.3, 150, 50, .6), .9)
            if k in (1, 3): p.ajouter(T(m + k), caisse(clap=True), .7)
            p.ajouter(T(m + k + .5), charley(), .3, .2)
            for demi in (0, .5):  # basse en croches, pompée par la grosse caisse
                x = scie(note(racines[mesure] - 24), b * .45, 16, 1600, .1, .5)
                x = x * (0.35 + 0.65 * np.clip(np.arange(len(x)) / (SR * .09), 0, 1)) if demi == 0 else x
                p.ajouter(T(m + k + demi), np.tanh(2.2 * x), .32)
        if mesure in (1, 3):
            for k, h, d in riff: p.ajouter(T(m - 4 + k + 4), np.tanh(1.5 * carre(note(h), b * d, .2, .35, 4200)), .12, -.15)
        else:
            for k, h, d in riff[:3]: p.ajouter(T(m + k), np.tanh(1.5 * carre(note(h), b * d, .2, .35, 4200)), .12, -.15)
    p.ajouter(T(16), kick(.5, 150, 45, .6), .8); p.ajouter(T(16), caisse(clap=True), .6)
    p.ajouter(T(16), np.tanh(2 * scie(note(49 - 24), b * 1.6, 16, 1400, .4, .3)), .35)


MORCEAUX = {'aura-farming': morceau_aura, 'griddy': morceau_griddy, 'floss': morceau_floss, 'apple': morceau_apple}


def composer(ident, dossier):
    T, b, n, duree_emote = v06.grille(ident)
    duree = T(n) + b * 1.4  # dernier accent tenu, puis extinction
    # Le MP3 ajoute jusqu'à ~60 ms (trames de 1152 échantillons) : la musique doit rester
    # couverte par la danse une fois encodée.
    duree = min(duree, duree_emote - .15)
    p = Piste(duree)
    MORCEAUX[ident](p, T, b)
    x = p.buf[:int(SR * duree)]
    x = x - x.mean(0)
    x = np.tanh(1.1 * x / max(1e-9, np.abs(x).max())) / np.tanh(1.1)  # limiteur doux
    fondu = np.clip((duree - np.arange(len(x)) / SR) / .35, 0, 1)[:, None]
    x = x * fondu * .89  # -1 dBFS
    wav = Path(dossier) / f'emote-{ident}-son-v01.wav'
    with wave.open(str(wav), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
    mp3 = Path(dossier) / f'emote-{ident}-son-v01.mp3'
    aud.Sound(str(wav)).write(str(mp3), rate=SR, channels=aud.CHANNELS_STEREO, format=aud.FORMAT_S16,
                              container=aud.CONTAINER_MP3, codec=aud.CODEC_MP3, bitrate=192000)
    return {'id': ident, 'bpm': v06.GRILLES[ident][0], 'duree_son': round(duree, 3), 'duree_emote': duree_emote,
            'mp3': mp3.name, 'wav': wav.name}


if __name__ == '__main__':
    a = argparse.ArgumentParser(); a.add_argument('--out', required=True); a.add_argument('--seulement', default=','.join(MORCEAUX))
    args = a.parse_args(sys.argv[sys.argv.index('--') + 1:])
    out = Path(args.out)
    if out.exists(): raise RuntimeError('Dossier existant : choisir une nouvelle sortie.')
    out.mkdir(parents=True)
    import json
    bilan = [composer(i, out) for i in args.seulement.split(',')]
    (out / 'sons.json').write_text(json.dumps(bilan, indent=2, ensure_ascii=False) + '\n')
    print('SONS', json.dumps(bilan, ensure_ascii=False))

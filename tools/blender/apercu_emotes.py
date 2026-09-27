"""Planche de contrôle d'une emote : rendus Workbench rapides, vue de face (haut) et de
profil (bas), aux instants demandés. Sert à relire une chorégraphie sans ouvrir Blender.
blender --background --python apercu_emotes.py -- EMOTE.blend PLANCHE.png 0.5,1.2,2.0
"""
import bpy, sys, numpy as np, json
from pathlib import Path
from mathutils import Vector
args = sys.argv[sys.argv.index('--')+1:]
blend, sortie, instants = args[0], args[1], [float(t) for t in args[2].split(',')]
bpy.ops.wm.open_mainfile(filepath=blend)
s = bpy.context.scene
s.render.engine = 'BLENDER_WORKBENCH'
s.display.shading.light = 'STUDIO'; s.display.shading.color_type = 'MATERIAL'
s.display.shading.show_shadows = True; s.display.shading.show_cavity = True
s.render.resolution_x, s.render.resolution_y = 260, 330
s.render.image_settings.file_format = 'PNG'
vues = []
for nom, pos in [('face', (0.0, -4.0, 1.05)), ('profil', (4.0, 0.0, 1.05)), ('dessus', (0.01, -1.2, 4.0))]:
    cam = bpy.data.cameras.new(nom); cam.type = 'ORTHO'; cam.ortho_scale = 2.3
    o = bpy.data.objects.new(nom, cam); s.collection.objects.link(o); o.location = pos
    o.rotation_euler = (Vector((0, 0, 1.0 if nom != 'dessus' else 0.0)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    vues.append(o)
tmp = Path(sortie).with_suffix('')
lignes = []
for v in vues[:2]:
    s.camera = v; ligne = []
    for t in instants:
        s.frame_set(1 + round(t * 60))
        s.render.filepath = str(tmp) + f'_{v.name}_{t:.2f}.png'
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(s.render.filepath)
        px = np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4)
        ligne.append(px); bpy.data.images.remove(im); Path(s.render.filepath).unlink()
    lignes.append(np.concatenate(ligne, 1))
P = np.concatenate(lignes[::-1], 0)  # pixels Blender : bas en premier
out = bpy.data.images.new('planche', P.shape[1], P.shape[0]); out.pixels = P.ravel().tolist()
out.filepath_raw = sortie; out.file_format = 'PNG'; out.save()
print('PLANCHE', sortie)

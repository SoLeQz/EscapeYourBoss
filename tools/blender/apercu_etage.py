"""Revue de mise en place d'un étage exporté par tools/exporter-etage.mjs.

Vue de dessus coupée sous le plafond, puis vues à hauteur d'yeux (reprographie, hall,
couloir, direction, réunion, postes, casiers, salon, salle secrète). Rendu Workbench
aux couleurs de sommet : on relit l'orientation et la pose de chaque meuble.

blender --background --factory-startup --python apercu_etage.py -- etage.obj planche.png
"""
import bpy, sys, json, math
from pathlib import Path
from mathutils import Vector

obj, sortie = sys.argv[sys.argv.index('--') + 1:][:2]
vues = json.loads(Path(obj).with_suffix('.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene
bpy.ops.wm.obj_import(filepath=obj, forward_axis='NEGATIVE_Z', up_axis='Y')
S.render.engine = 'BLENDER_WORKBENCH'
sh = S.display.shading; sh.light = 'STUDIO'; sh.color_type = 'VERTEX'; sh.show_cavity = True; sh.show_shadows = True
sh.shadow_intensity = .35
S.render.resolution_x = 960; S.render.resolution_y = 600
cam = bpy.data.objects.new('Caméra', bpy.data.cameras.new('Caméra')); S.collection.objects.link(cam); S.camera = cam
J = lambda p: Vector((p[0], -p[2], p[1]))
images = []
for nom, v in vues.items():
    if v is None:
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = 44; cam.location = (0, 0, 50); cam.rotation_euler = (0, 0, 0)
        cam.data.clip_start = 47.2; cam.data.clip_end = 60
        S.render.resolution_x, S.render.resolution_y = 960, 750
    else:
        cam.data.type = 'PERSP'; cam.data.lens = 18; cam.data.clip_start = .1; cam.data.clip_end = 100
        S.render.resolution_x, S.render.resolution_y = 960, 600
        cam.location = J(v[0]); d = J(v[1]) - cam.location
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    f = Path(sortie).parent / f'{Path(sortie).stem}-{nom}.png'
    S.render.filepath = str(f); bpy.ops.render.render(write_still=True); images.append(str(f))
print('VUES', json.dumps(images))

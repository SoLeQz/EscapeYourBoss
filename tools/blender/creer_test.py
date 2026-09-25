"""Jalon A seulement : éprouvette skinnée, pas le nouveau personnage.

Blender --background --factory-startup --python creer_test.py -- \
  --contrat contrat.json --out dossier-nouveau
Aucun fichier existant n'est remplacé. Le dossier de sortie doit être nouveau.
"""
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--contrat', required=True)
parser.add_argument('--out', required=True)
opt = parser.parse_args(args)
contrat = json.loads(Path(opt.contrat).read_text(encoding='utf-8'))
out = Path(opt.out).resolve()
if out.exists():
    raise RuntimeError('Sortie déjà présente : choisir un nouveau dossier pour protéger les retouches.')
if len(contrat['os']) != 16:
    raise RuntimeError('Le contrat doit provenir du squelette actuel de 16 os.')
out.mkdir(parents=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

# Three (+Y haut, +Z avant) -> Blender (+Z haut, -Y avant).
def coord(v):
    return Vector((v[0], -v[2], v[1]))

def material(name, color, roughness=.8):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    return mat

arm_data = bpy.data.armatures.new('Rig_LaoD_test')
arm = bpy.data.objects.new('Armature', arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for definition in contrat['os']:
    bone = arm_data.edit_bones.new(definition['nom'])
    bone.head = coord(definition['monde'])
    # Des axes Blender explicites. L'adaptateur prend les matrices de liaison,
    # sans supposer que ces repères locaux sont ceux du moteur.
    bone.tail = bone.head + Vector((0, 0, .1))
    bone.roll = 0
    bone.use_connect = False
    if definition['parent']:
        bone.parent = arm_data.edit_bones[definition['parent']]
bpy.ops.object.mode_set(mode='OBJECT')

# Section asymétrique : le sommet pointant vers +Z dans le jeu indique l'avant.
# Treize boucles permettent de vérifier la déformation autour du coude gauche.
section = [(-.05, -.035), (.05, -.035), (.05, .035), (0, .075), (-.05, .035)]
verts, faces, heights = [], [], []
for row in range(13):
    y = 1.40 - row * .05
    for x, z in section:
        verts.append(tuple(coord((-.215 + x, y, z))))
        heights.append(y)
for row in range(12):
    for col in range(5):
        a = row * 5 + col
        b = row * 5 + (col + 1) % 5
        faces.append((a, b, b + 5, a + 5))
faces.extend([tuple(reversed(range(5))), tuple(60 + i for i in range(5))])
mesh = bpy.data.meshes.new('Eprouvette_deformation')
mesh.from_pydata(verts, [], faces)
mesh.update()
obj = bpy.data.objects.new('Test_bras_gauche', mesh)
scene.collection.objects.link(obj)
obj.data.materials.append(material('Test_petrole', (.08, .32, .29)))
obj.data.materials.append(material('Test_avant_ocre', (.75, .38, .08)))
for poly in obj.data.polygons:
    poly.material_index = 1 if poly.index % 5 in (2, 3) else 0
    poly.use_smooth = True
uv = mesh.uv_layers.new(name='UVMap')
for poly in mesh.polygons:
    for loop in poly.loop_indices:
        vertex = mesh.loops[loop].vertex_index
        uv.data[loop].uv = ((vertex % 5) / 5, (vertex // 5) / 12)
groups = {name: obj.vertex_groups.new(name=name) for name in ['epauleL', 'coudeL']}
for i, y in enumerate(heights):
    w = min(1., max(0., (1.17-y)/.12))
    if w < 1: groups['epauleL'].add([i], 1-w, 'REPLACE')
    if w > 0: groups['coudeL'].add([i], w, 'REPLACE')
modifier = obj.modifiers.new('Skin', 'ARMATURE')
modifier.object = arm
obj.parent = arm
for vertex in mesh.vertices:
    if abs(sum(g.weight for g in vertex.groups) - 1) > 1e-6:
        raise RuntimeError('Poids non normalisés')

bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
obj.select_set(True)
bpy.context.view_layer.objects.active = arm
params = dict(filepath=str(out/'lao-d-test.glb'), export_format='GLB', use_selection=True,
              export_yup=True, export_animations=False, export_skins=True, export_morph=True,
              export_cameras=False, export_lights=False, export_def_bones=False,
              export_leaf_bone=False, export_apply=False)
properties = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
for required in ['export_format', 'use_selection', 'export_yup', 'export_skins']:
    if required not in properties:
        raise RuntimeError('Exporteur glTF incompatible : ' + required)
bpy.ops.export_scene.gltf(**{k:v for k,v in params.items() if k in properties})

# Le studio ne fait pas partie du GLB. Il est conservé dans le .blend.
world = bpy.data.worlds.new('Studio')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.19, .23, .24, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .35
for name, pos, power, size in [('Key', (2,-3,4), 450, 3), ('Fill', (-3,-1,2), 250, 3)]:
    light_data = bpy.data.lights.new(name, 'AREA')
    light_data.energy = power
    light_data.shape = 'DISK'
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    scene.collection.objects.link(light)
    light.location = pos
    light.rotation_euler = (Vector((-.215,0,1.1))-light.location).to_track_quat('-Z','Y').to_euler()
camera_data = bpy.data.cameras.new('Camera_test')
camera = bpy.data.objects.new('Camera_test', camera_data)
scene.collection.objects.link(camera)
camera.location = (1.1,-1.9,1.5)
camera.rotation_euler = (Vector((-.215,0,1.1))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 1.1
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
scene.render.resolution_x = 768
scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(out/'blender-test.png')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'test.blend'))
bpy.ops.render.render(write_still=True)
rapport = {'versionBlender':bpy.app.version_string, 'os':len(arm.data.bones),
           'sommets':len(mesh.vertices), 'faces':len(mesh.polygons), 'poidsNormalises':True,
           'glbOctets':(out/'lao-d-test.glb').stat().st_size,
           'optionsExport':{k:v for k,v in params.items() if k in properties},
           'statut':'création, sauvegarde, export et rendu Blender exécutés'}
(out/'rapport-blender.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(rapport,ensure_ascii=False))

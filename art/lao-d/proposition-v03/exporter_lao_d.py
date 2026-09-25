"""Exporter des retouches d'un .blend sans régénérer ni enregistrer la source.
blender.exe personnage.blend --background --python-exit-code 1 --python exporter_lao_d.py -- --out nouveau.glb
"""
import bpy, argparse, sys, json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--out',required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out)
if out.exists():raise RuntimeError('Export existant : choisir un autre nom pour protéger le fichier.')
if out.suffix.lower()!='.glb':raise RuntimeError('Un fichier .glb autonome est requis.')
arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
if len(arms)!=1:raise RuntimeError('Une seule armature est attendue.')
arm=arms[0]
required={'racine','buste','teteBase','tete','epauleL','coudeL','mainL','epauleR','coudeR','mainR','hancheL','genouL','chevilleL','hancheR','genouR','chevilleR'}
if not required.issubset(arm.data.bones.keys()):raise RuntimeError('Os du contrat manquants.')
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' and m.object==arm for m in o.modifiers)]
if not meshes:raise RuntimeError('Aucun maillage associé à l’armature.')
for o in meshes:
 if not o.data.uv_layers:raise RuntimeError('UV manquants : '+o.name)
 if o.data.validate():raise RuntimeError('Maillage réparé automatiquement mais export annulé : corriger la source '+o.name)
 for v in o.data.vertices:
  if abs(sum(g.weight for g in v.groups)-1)>.0001:raise RuntimeError('Poids non normalisés : '+o.name)
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=arm
out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_skins=True,export_morph=True,export_cameras=False,export_lights=False,export_def_bones=False,export_leaf_bone=False,export_apply=False)
print(json.dumps({'export':str(out),'sourceSauvegardee':False,'version':bpy.app.version_string}))

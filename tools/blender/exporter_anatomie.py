"""Réexporter une source anatomie-v01.blend éditée sans reconstruire la sculpture.
blender source.blend --background --python exporter_anatomie.py -- --out nouveau.glb
"""
import bpy,sys,argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--out',required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out)
if out.exists():raise RuntimeError('Choisir un nouveau fichier pour conserver la version précédente.')
bpy.ops.object.select_all(action='DESELECT');pieces=[]
for o in bpy.data.objects:
 if o.type!='MESH' or 'controle' not in o:continue
 o.select_set(True);pieces.append(o)
 # Le studio écarte les deux mains pour travailler confortablement.
 # Le décalage de présentation ne fait pas partie du modèle exporté.
 o.location.x-=o.get('decalageStudio',0)
 if o.data.shape_keys:
  for key in o.data.shape_keys.key_blocks:key.value=0
if not pieces:raise RuntimeError('Aucune pièce anatomique dans ce fichier.')
bpy.context.view_layer.objects.active=pieces[0]
try:
 bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_animations=False,export_morph=True,export_cameras=False,export_lights=False,export_vertex_color='NAME',export_vertex_color_name='Pigment',export_all_vertex_colors=False)
finally:
 for o in pieces:o.location.x+=o.get('decalageStudio',0)
# Ne pas sauvegarder le .blend : le fichier de travail reste inchangé.

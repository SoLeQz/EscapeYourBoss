"""Ajoute une pose Cercle aux mains v02, sans modifier les cinq poses existantes.
Blender --background --python-exit-code 1 --python ajouter_main_cercle.py -- --source mains-v02.blend --out NOUVEAU_DOSSIER
Le geste ferme uniquement l'index sur le pouce ; majeur, annulaire et auriculaire
restent exactement en pose Ouvert. Sources, topologie et anciens morphs conservés.
"""
import argparse,json,math,sys,tempfile,shutil
from pathlib import Path
import bpy
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--out',required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out)
if out.exists():raise RuntimeError('Choisir un nouveau dossier pour préserver les sources.')
out.mkdir(parents=True)
bpy.ops.wm.open_mainfile(filepath=str(Path(a.source)))
C=lambda v:Vector((v[0],-v[2],v[1]))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and 'controle' in o]
old={o.name:{k.name:[tuple(v.co) for v in k.data] for k in o.data.shape_keys.key_blocks} for o in objects if o.data.shape_keys}
for o in objects:o.location.x-=o.get('decalageStudio',0)

def bezier(points,t):
 a,b,c,d=map(Vector,points);q=1-t
 pos=a*q**3+3*b*q*q*t+3*c*q*t*t+d*t**3
 direction=(3*(b-a)*q*q+6*(c-b)*q*t+3*(d-c)*t*t).normalized()
 n=Vector((0,0,1));n=(n-direction*n.dot(direction)).normalized();lat=direction.cross(n).normalized()
 return pos,direction,n,lat

def doigt(points,nr,radius,thumb=False):
 # Correspondance exacte des anneaux et pastilles d'ongle du loft v02.
 vs=[]
 for j in range(nr+1):
  t=min(j,nr-4)/(nr-4);c,d,n,l=bezier(points,t)
  r=radius*(1-.17*t) if not thumb else .0105+(.0079-.0105)*t
  if j>nr-4:
   v=(j-(nr-4))/4;c+=d*r*(.9 if thumb else .92)*math.sin(v*math.pi/2);r*=max(.08,math.cos(v*math.pi/2))
  for k in range(10):
   ang=2*math.pi*k/10;vs.append(c+l*r*math.sin(ang)+n*r*(.88 if thumb else .86)*math.cos(ang))
 nails=[]
 for j in range(5):
  t=(.76+.042*j) if thumb else (.74+.045*j);c,d,n,l=bezier(points,t)
  r=.0105+(.0079-.0105)*t if thumb else radius*(1-.17*t)
  for k in range(7):
   ang=math.pi+(k/6-.5)*(1.6 if thumb else 1.7)
   nails.append(c+l*r*.98*math.sin(ang)+n*(r*(.88 if thumb else .86)*math.cos(ang)-.00055))
 return vs,nails

report=[]
for s,suffix in [(-1,'L'),(1,'R')]:
 fingers=next(o for o in objects if o['controle']=='doigts'+suffix)
 thumb=next(o for o in objects if o['controle']=='pouce'+suffix)
 assert len(fingers.data.vertices)==900 and len(thumb.data.vertices)==205,'Topologie v02 requise'
 keys=fingers.data.shape_keys.key_blocks;k=fingers.shape_key_add(name='Cercle');k.value=0
 for v,src in zip(k.data,keys['Ouvert'].data):v.co=src.co
 # Anneau dans le plan de la paume, index arrondi et pouce opposé. Les deux
 # calottes se rejoignent par leur pulpe sans traverser les doigts voisins.
 index_points=[(s*.0235,-.0475,-.0015),(s*.028,-.090,.005),(s*.062,-.089,.020),(s*.062,-.056885,.019)]
 thumb_points=[(s*.019,-.012,.008),(s*.062,-.010,.024),(s*.062,-.019,.019),(s*.062,-.04309284,.0188075)]
 index_vs,index_nails=doigt(index_points,18,.0081)
 thumb_vs,thumb_nails=doigt(thumb_points,16,.0105,True)
 origin=Vector(fingers['origine'])
 for i,co in enumerate(index_vs):k.data[i].co=C(co-origin)
 for i,co in enumerate(index_nails):k.data[760+i].co=C(co-origin)
 kt=thumb.shape_key_add(name='Cercle');kt.value=0;origin=Vector(thumb['origine'])
 for v,co in zip(kt.data,thumb_vs+thumb_nails):v.co=C(co-origin)
 tip_index=sum(index_vs[180:190],Vector())/10;tip_thumb=sum(thumb_vs[160:170],Vector())/10
 contact=(tip_index-tip_thumb).length
 stable=max((k.data[i].co-keys['Ouvert'].data[i].co).length for i in [*range(190,760),*range(795,900)])
 assert contact<.01 and stable==0,(contact,stable)
 report.append({'main':suffix,'contact_metres':contact,'autres_doigts_ecart':stable,'bout_index':list(tip_index),'bout_pouce':list(tip_thumb)})
for o in objects:
 for name,positions in old.get(o.name,{}).items():
  assert positions==[tuple(v.co) for v in o.data.shape_keys.key_blocks[name].data],(o.name,name,'ancienne pose modifiée')
for o in objects:o.select_set(True)
for o in bpy.context.scene.objects:
 if o not in objects:o.select_set(False)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.export_scene.gltf(filepath=str(out/'mains-v03.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_animations=False,export_morph=True,export_cameras=False,export_lights=False,export_vertex_color='NAME',export_vertex_color_name='Pigment',export_all_vertex_colors=False)
for o in objects:
 o.location.x+=o.get('decalageStudio',0)
 if o.data.shape_keys:o.data.shape_keys.key_blocks['Cercle'].value=1
scene=bpy.context.scene
scene.camera.location=(0,-.75,-.045);scene.camera.rotation_euler=(Vector((0,0,-.04))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=.34
scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.cycles.samples=32
# Blender traite parfois les UNC de rendu comme des chemins relatifs.
# Rendre sur le disque Windows temporaire puis copier vers la source demandée.
preview=Path(tempfile.mkdtemp(prefix='eyb-main-cercle-'))/'cercle.jpg'
scene.render.filepath=str(preview)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'mains-v03.blend'))
bpy.ops.render.render(write_still=True)
shutil.copy2(preview,out/'cercle.jpg');shutil.rmtree(preview.parent)
manifest={'source':'mains-v02.blend','blender':bpy.app.version_string,'fichier':'mains-v03.glb','nouveau_morph':'Cercle','poses_existantes_identiques':True,'mesures':report}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(manifest,ensure_ascii=False))

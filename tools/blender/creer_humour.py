"""Six petites scènes de bureau originales. Blender -> GLB statique, mètres.
Usage : blender --background --factory-startup --python-exit-code 1 --python creer_humour.py -- --out DOSSIER_NEUF
Les textes sont dans l'atlas du jeu (src/humour.js), pas rasterisés dans les GLB.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy
from mathutils import Vector

p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--only',choices=['trophee-cafe','cascade-papier','cone-chef','sablier-reunion','tour-dossiers','tampon-sortie'])
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out)
if out.exists():raise RuntimeError('Le dossier doit être neuf : aucune source écrasée.')
out.mkdir(parents=True)
C=lambda p:Vector((p[0],-p[2],p[1]))
PALETTE={'bois':'B39871','boisFonce':'765D48','aluSombre':'434D49','alu':'A2ABA5','plastiqueNoir':'242C2B','plastiqueBlanc':'DADBCF','murAccent':'3C6561','papier':'F0EADD','verre':'B4CDC3','signalOrange':'D18A43','papierRecyclage':'DCCFA4'}

def setup():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for mat in list(bpy.data.materials):bpy.data.materials.remove(mat)
 global mats,pieces
 mats={};pieces=[]
 for key,col in PALETTE.items():
  m=bpy.data.materials.new('DECOR_'+key);m.use_nodes=True
  color=tuple(((int(col[i:i+2],16)/255+.055)/1.055)**2.4 for i in (0,2,4))+(1,)
  m.diffuse_color=color;n=m.node_tree.nodes['Principled BSDF'];n.inputs['Base Color'].default_value=color;n.inputs['Roughness'].default_value=.65
  n.inputs['Metallic'].default_value=.7 if key in ['alu','aluSombre'] else 0
  if key=='verre':
   n.inputs['Alpha'].default_value=.2;m.surface_render_method='DITHERED'
  mats[key]=m

def finish(o,name,mat,bevel=0,smooth=False):
 o.name=name;o.data.materials.append(mats[mat]);bpy.context.view_layer.objects.active=o
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  m=o.modifiers.new('Chants adoucis','BEVEL');m.width=bevel;m.segments=1;bpy.ops.object.modifier_apply(modifier=m.name)
 for f in o.data.polygons:f.use_smooth=smooth
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 for f in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(f.normal[i]));axes=[i for i in range(3) if i!=axis]
  for li in f.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]],v[axes[1]])
 pieces.append(o);return o

def box(name,size,pos,mat,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=C(pos));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);return finish(o,name,mat,bevel)
def mesh(name,vs,fs,mat,smooth=False):
 d=bpy.data.meshes.new(name);d.from_pydata([C(v) for v in vs],[],fs);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);return finish(o,name,mat,smooth=smooth)
def revolution(name,profile,mat,n=16):
 vs=[(r*math.cos(i*2*math.pi/n),y,r*math.sin(i*2*math.pi/n)) for r,y in profile for i in range(n)]
 fs=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(profile)-1) for i in range(n)]
 return mesh(name,vs,[tuple(reversed(f)) for f in fs],mat,True)
def tube(name,pts,r,mat,n=6):
 vs=[]
 for i,p in enumerate(pts):
  d=(Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(0,i-1)])).normalized();axis=Vector((0,1,0)) if abs(d.y)<.95 else Vector((1,0,0));u=d.cross(axis).normalized();v=d.cross(u)
  for k in range(n):vs.append(tuple(Vector(p)+r*(math.cos(k*2*math.pi/n)*u+math.sin(k*2*math.pi/n)*v)))
 fs=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(pts)-1) for i in range(n)]
 fs.extend([tuple(reversed(range(n))),tuple((len(pts)-1)*n+i for i in range(n))]);return mesh(name,vs,fs,mat,True)

def cafe():
 box('Socle employé du mois',(.40,.075,.36),(0,.0375,0),'boisFonce',.008)
 box('Plaque de récompense',(.29,.045,.008),(0,.040,.184),'alu')
 revolution('Tasse trophée, intérieur et bord roulé',[(0,.11),(.135,.11),(.175,.47),(.177,.49),(.157,.49),(.153,.46),(.122,.135),(0,.135)],'plastiqueBlanc')
 revolution('Le café travaille encore',[(0,.447),(.151,.447)],'boisFonce')
 for s in [-1,1]:tube('Anse de coupe',[(s*.165,.415,0),(s*.235,.425,0),(s*.265,.365,0),(s*.244,.275,0),(s*.15,.24,0)],.022,'alu',6)
 # Une cravate transforme la tasse en collègue sans lui ajouter un visage.
 mesh('Cravate du collègue café',[(-.025,.40,.180),(.025,.40,.180),(.039,.20,.168),(0,.16,.163),(-.039,.20,.168)],[(4,3,2,1,0)],'murAccent')

def papier():
 # Accordéon à double face, retenu sur le capot, qui déborde devant la machine.
 points=[(-.55,.15),(-.40,.17),(-.25,.13),(-.10,.16),(.22,.09),(.33,-.10),(.20,-.28),(.36,-.44),(.23,-.62),(.39,-.78),(.28,-.90),(.42,-.99)]
 vs=[(x,y,z) for z,y in points for x in [-.235,.235]]
 fs=[]
 for i in range(len(points)-1):
  f=(i*2,i*2+1,i*2+3,i*2+2);fs.append(tuple(reversed(f)))
 o=mesh('Rappel zéro papier en accordéon',vs,fs,'papierRecyclage')
 # Deux faces opposées partageant leurs sommets sont dédupliquées par Blender.
 # Une vraie épaisseur garantit que les plis restent visibles des deux côtés.
 bpy.context.view_layer.objects.active=o
 solid=o.modifiers.new('Épaisseur du papier','SOLIDIFY');solid.thickness=.001;solid.offset=0
 bpy.ops.object.modifier_apply(modifier=solid.name)
 for i in range(3,len(points)-1):
  z0,y0=points[i];z1,y1=points[i+1]
  for t in [.42,.57,.72]:
   line=[(x,y0+(y1-y0)*u,z0+(z1-z0)*u+.002) for u in [t,t+.045] for x in [-.145,.145]]
   mesh('Ligne imprimée',line,[(2,3,1,0)],'aluSombre')
 for i in range(5):box('Rame en attente',(.46,.034,.34),((i%2)*.024-.01,.017+i*.035,-.32),'papierRecyclage')



def cone():
 box('Pied du responsable travaux',(.48,.045,.48),(0,.0225,0),'aluSombre',.012)
 revolution('Cône de chantier',[(0,.045),(.205,.045),(.045,.69),(0,.69)],'signalOrange',12)
 for y in [.23,.45]:
  r=.205-(y-.045)*.16/.645
  revolution('Bande réfléchissante',[(r+.002,y),(r-.014+.002,y+.057)],'plastiqueBlanc',12)
 mesh('Cravate du chef de chantier',[(-.026,.57,.086),(.026,.57,.086),(.052,.26,.163),(0,.19,.181),(-.052,.26,.163)],[(4,3,2,1,0)],'murAccent')
 # Lunettes reposant sur la pointe : il a le profil pour encadrer les travaux.
 for s in [-1,1]:tube('Lunettes du chef',[(s*.012,.605,.079),(s*.105,.605,.079),(s*.105,.548,.095),(s*.012,.548,.095),(s*.012,.605,.079)],.009,'plastiqueNoir',4)
 tube('Pont de lunettes',[(-.012,.585,.085),(.012,.585,.085)],.007,'plastiqueNoir',4)


def sablier():
 for y in [.035,.715]:revolution('Socle du sablier',[(0,y-.025),(.235,y-.025),(.235,y+.025),(0,y+.025)],'boisFonce',12)
 for x,z in [(-.175,-.12),(.175,-.12),(-.175,.12),(.175,.12)]:tube('Colonne du sablier',[(x,.06,z),(x,.69,z)],.013,'alu',6)
 # Verre et sable séparés, reconnaissables également en silhouette.
 revolution('Ampoule de verre soufflé',[(0,.09),(.135,.09),(.16,.17),(.145,.23),(.023,.36),(.023,.38),(.14,.52),(.16,.6),(.13,.66),(0,.66)],'verre',16)
 revolution('Sable déjà écoulé',[(0,.105),(.13,.105),(.14,.17),(.018,.30),(0,.30)],'bois',16)
 revolution('Sable restant',[(0,.395),(.042,.414),(.13,.55),(0,.55)],'bois',16)
 revolution('Filet de sable',[(.007,.30),(.007,.42)],'bois',8)


def dossiers():
 # Silhouette de tour penchée, volumes dans l'emprise du casier.
 for i in range(10):
  x=.036*math.sin(i*.73);z=.025*math.cos(i)
  box('Dossier urgent %02d'%i,(.50,.11,.44),(x,.055+i*.108,z),'murAccent' if i%3 else 'boisFonce')
  box('Tranche de papier',(.473,.082,.421),(x-.018,.056+i*.108,z),'papier')
  box('Dos du classeur',(.029,.112,.445),(x+.244,.055+i*.108,z),'murAccent')
  box('Étiquette urgente',(.24,.041,.003),(x,.055+i*.108,z+.223),'papier')
 # Un petit escabeau donne une échelle absurde au classement.
 for x in [-.11,.11]:tube('Montant échelle',[(x,0,.36),(x,.83,.24)],.011,'alu',4)
 for i in range(5):
  y=.075+i*.16;z=.36-y*.12/.83;tube('Barreau échelle',[(-.11,y,z),(.11,y,z)],.009,'alu',4)


def tampon():
 for i in range(4):box('Formulaire de sortie en quadruple',(.75,.028,.50),((i%2)*.027,.014+i*.028,0),'papier')
 box('Semelle du tampon géant',(.52,.055,.29),(0,.143,0),'plastiqueNoir',.012)
 box('Porte-tampon',(.54,.045,.31),(0,.188,0),'boisFonce',.012)
 revolution('Poignée tournée du tampon',[(0,.21),(.095,.21),(.065,.26),(.065,.41),(.14,.45),(.15,.51),(.115,.55),(0,.55)],'murAccent',12)
 box('Plaque de validation',(.39,.044,.006),(0,.185,.159),'papier')

def export(name,fn):
 setup();fn();bpy.ops.object.select_all(action='DESELECT')
 for o in pieces:o.select_set(True)
 bpy.context.view_layer.objects.active=pieces[0]
 bpy.ops.export_scene.gltf(filepath=str(out/(name+'-v01.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_apply=True)
 for o in pieces:o.data.calc_loop_triangles()
 record={'objet':name,'blender':bpy.app.version_string,'triangles':sum(len(o.data.loop_triangles) for o in pieces),'piecesEditables':len(pieces),'materiaux':sorted({m.name for o in pieces for m in o.data.materials})}
 points=[o.matrix_world@Vector(c) for o in pieces for c in o.bound_box];lo=Vector(tuple(min(v[i] for v in points) for i in range(3)));hi=Vector(tuple(max(v[i] for v in points) for i in range(3)));center=(lo+hi)/2;size=max(hi-lo)
 scene=bpy.context.scene;scene.world.color=(.25,.25,.25)
 for label,offset in [('Lumière principale',(-2,-3,4)),('Contre-jour',(3,2,3))]:
  d=bpy.data.lights.new(label,'AREA');d.energy=250;d.size=3;o=bpy.data.objects.new(label,d);scene.collection.objects.link(o);o.location=center+Vector(offset);o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
 d=bpy.data.cameras.new('Caméra de revue');o=bpy.data.objects.new('Caméra de revue',d);scene.collection.objects.link(o);o.location=center+Vector((1.3,-2.4,1.25))*size;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=size*1.45;scene.camera=o
 scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=720;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.filepath=str(out/(name+'.png'))
 bpy.ops.wm.save_as_mainfile(filepath=str(out/(name+'-v01.blend')));bpy.ops.render.render(write_still=True)
 return record

manifest=[export(name,fn) for name,fn in [('trophee-cafe',cafe),('cascade-papier',papier),('cone-chef',cone),('sablier-reunion',sablier),('tour-dossiers',dossiers),('tampon-sortie',tampon)] if not a.only or name==a.only]
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(manifest,ensure_ascii=False))

"""Mobilier Méridien et escalier. Géométrie Blender originale, sorties non écrasables.
blender --background --factory-startup --python-exit-code 1 --python creer_decor.py -- --out NOUVEAU_DOSSIER
Unités du jeu : mètres, Y haut, Z avant. Conversion Blender (x,-z,y).
"""
import bpy, math, argparse, sys, json
from pathlib import Path
from mathutils import Vector
from math import sin,cos,pi
p=argparse.ArgumentParser();p.add_argument('--out',required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out)
if out.exists():raise RuntimeError('Choisir un dossier neuf : les sources existantes ne sont jamais écrasées.')
out.mkdir(parents=True)
C=lambda p:Vector((p[0],-p[2],p[1]))
PALETTE={'bois':'B39871','boisFonce':'5D493A','aluSombre':'303F3E','alu':'A2ABA5','plastiqueNoir':'242C2B','plastiqueBlanc':'DADBCF','tissuChaise':'3E5A55','beton':'B3B1A4','pierre':'8D9487','murAccent':'3C6561','verre':'9FC0B4'}
def setup():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for mat in list(bpy.data.materials):bpy.data.materials.remove(mat)
 global mats,pieces
 mats={};pieces=[]
 for key,col in PALETTE.items():
  m=bpy.data.materials.new('DECOR_'+key);m.diffuse_color=tuple(((int(col[i:i+2],16)/255+.055)/1.055)**2.4 for i in (0,2,4))+(1,)
  m.use_nodes=True;n=m.node_tree.nodes['Principled BSDF'];n.inputs['Base Color'].default_value=m.diffuse_color
  n.inputs['Roughness'].default_value=.32 if key=='alu' else .8
  n.inputs['Metallic'].default_value=.75 if key in ['alu','aluSombre'] else 0
  if key=='verre':m.diffuse_color=(*m.diffuse_color[:3],.14);n.inputs['Alpha'].default_value=.14;m.surface_render_method='DITHERED'
  mats[key]=m

def finish(o,name,mat,bevel=0,segments=2):
 o.name=name;o.data.materials.append(mats[mat]);bpy.context.view_layer.objects.active=o
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  b=o.modifiers.new('Arêtes usinées','BEVEL');b.width=bevel;b.segments=segments;bpy.ops.object.modifier_apply(modifier=b.name)
 n=o.modifiers.new('Normales pondérées','WEIGHTED_NORMAL');n.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=n.name)
 for f in o.data.polygons:f.use_smooth=True
 # Projection métrique par face : cohérente avec les matériaux PBR du jeu.
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 for face in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
  for li in face.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]],v[axes[1]])
 pieces.append(o);return o

def box(name,size,pos,mat,bevel=.008):
 bpy.ops.mesh.primitive_cube_add(size=1,location=C(pos));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);return finish(o,name,mat,bevel)
def mesh(name,vs,fs,mat,bevel=0):
 data=bpy.data.meshes.new(name);data.from_pydata([C(v) for v in vs],[],fs);data.update()
 o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);return finish(o,name,mat,bevel)
def tube(name,points,r,mat='aluSombre',sides=8):
 vs=[];fs=[]
 for i,p in enumerate(points):
  d=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
  axis=Vector((0,1,0)) if abs(d.y)<.95 else Vector((1,0,0));u=d.cross(axis).normalized();v=d.cross(u).normalized()
  for j in range(sides):vs.append(tuple(Vector(p)+r*(cos(2*pi*j/sides)*u+sin(2*pi*j/sides)*v)))
 for i in range(len(points)-1):
  for j in range(sides):fs.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
 fs.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))]);return mesh(name,vs,fs,mat)
def cyl(name,a,b,r,mat='alu',n=12):return tube(name,[a,b],r,mat,n)
def panneau(name,points,nx,ny,mat,thickness=.015):
 vs=[points(i/nx,j/ny) for j in range(ny+1) for i in range(nx+1)]
 fs=[(j*(nx+1)+i,j*(nx+1)+i+1,(j+1)*(nx+1)+i+1,(j+1)*(nx+1)+i) for j in range(ny) for i in range(nx)]
 if name.startswith('Assise'):fs=[tuple(reversed(f)) for f in fs]
 o=mesh(name,vs,fs,mat);bpy.context.view_layer.objects.active=o;s=o.modifiers.new('Épaisseur','SOLIDIFY');s.thickness=thickness;s.offset=-1;bpy.ops.object.modifier_apply(modifier=s.name);return o

def bureau():
 box('Plateau chêne aux arêtes adoucies',(2.3,.045,1.2),(0,.748,0),'bois',.02)
 box('Sous-face du plateau',(2.20,.012,1.10),(0,.719,0),'boisFonce',.008)
 for side in (-1,1):
  x=side*1.015
  tube('Montant en acier plié',[(x,.09,.02),(x,.33,-.045),(x,.68,-.07)],.036,'aluSombre',4)
  box('Traverse haute',(.085,.055,.76),(x,.69,-.01),'aluSombre',.015)
  box('Patin oblong',(.12,.05,.96),(x,.045,0),'aluSombre',.024)
  for z in (-.39,.39):box('Patin caoutchouc',(.095,.018,.13),(x,.010,z),'plastiqueNoir',.009)
 box('Traverse arrière',(1.98,.055,.065),(0,.66,-.38),'aluSombre',.012)
 box('Goulotte câbles',(1.32,.085,.20),(-.14,.635,-.40),'aluSombre',.012)
 for x in (-.84,.87):
  cyl('Passe-câble',(x,.768,-.44),(x,.779,-.44),.046,'aluSombre',16)
  box('Fente passe-câble',(.052,.004,.008),(x,.784,-.44),'plastiqueNoir',.001)
 box('Caisson mobile',(.43,.55,.53),(.74,.342,.03),'plastiqueBlanc',.018)
 for i in range(3):
  y=.171+i*.174
  box('Façade tiroir',(.389,.160,.025),(.74,y,.308),'plastiqueBlanc',.010)
  box('Gorge de prise',(.19,.018,.008),(.74,y+.043,.323),'aluSombre',.004)
  tube('Poignée rabattue',[(.645,y+.036,.33),(.659,y+.047,.345),(.821,y+.047,.345),(.835,y+.036,.33)],.006,'alu',6)
 for x in (.58,.90):
  for z in (-.15,.22):cyl('Roulette caisson',(x-.016,.035,z),(x+.016,.035,z),.032,'plastiqueNoir',10)


def chaise():
 def assise(u,v):
  x=(u-.5)*.46;z=(v-.5)*.44
  return (x,.465+.018*(x/.23)**2-.014*max(0,v-.65)/.35,z)
 panneau('Assise creusée',assise,10,10,'tissuChaise',.055)
 box('Coque sous assise',(.40,.042,.36),(0,.397,-.02),'plastiqueNoir',.02)
 def dos(u,v):
  width=.195+.027*sin(v*pi);x=(u-.5)*2*width
  return (x,.55+v*.54,-.225-.085*v+.045*sin(v*pi)+.035*(x/width)**2)
 panneau('Dossier ergonomique',dos,10,12,'tissuChaise',.012)
 contours=[dos(0,i/12) for i in range(13)]+[dos(i/10,1) for i in range(1,11)]+[dos(1,1-i/12) for i in range(1,13)]+[dos(1-i/10,0) for i in range(1,11)]
 tube('Cadre continu du dossier',contours+[contours[0]],.015,'plastiqueNoir',8)
 tube('Support lombaire',[(0,.37,-.18),(0,.48,-.28),(0,.68,-.26),(0,.82,-.26)],.027,'aluSombre',6)
 box('Appui lombaire',(.31,.075,.045),(0,.68,-.277),'plastiqueNoir',.020)
 for s in (-1,1):
  tube('Accoudoir réglable',[(s*.19,.395,-.06),(s*.28,.44,-.07),(s*.28,.635,-.07)],.019,'aluSombre',6)
  box('Manchette accoudoir',(.075,.042,.275),(s*.28,.663,-.005),'plastiqueNoir',.020)
 cyl('Vérin chromé',(0,.14,0),(0,.385,0),.026,'alu')
 cyl('Carter vérin',(0,.10,0),(0,.23,0),.045,'plastiqueNoir')
 for i in range(5):
  a=i*2*pi/5;sn,cs=sin(a),cos(a)
  tube('Branche moulée',[(0,.145,0),(.14*sn,.105,.14*cs),(.285*sn,.075,.285*cs)],.025,'aluSombre',6)
  for side in (-1,1):
   x,z=.285*sn+side*.019*cs,.285*cs-side*.019*sn
   cyl('Roulette jumelée',(x-.008*cs,.034,z+.008*sn),(x+.008*cs,.034,z-.008*sn),.034,'plastiqueNoir',10)
 tube('Levier de réglage',[(.07,.36,.035),(.20,.36,.07),(.25,.34,.10)],.007,'alu',6)
 box('Poignée levier',(.085,.018,.027),(.24,.34,.10),'plastiqueNoir',.009)


def escalier():
 box('Palier intermédiaire',(7.64,.20,1.20),(0,-1.90,3.57),'beton',.015)
 box('Revêtement du palier',(7.58,.018,1.14),(0,-1.791,3.57),'pierre',.008)
 for x,start,sens,top in [(-.3,0,1,0),(2.2,3,-1,-1.8)]:
  profile=[(start,top-.18)]
  for i in range(10):
   z=start+sens*(i+1)*.3;y=top-(i+1)*.18;profile.append((z,y))
   if i<9:profile.append((z,y-.18))
  profile.extend([(start+sens*3,top-2.1),(start,top-.48)])
  vs=[(x+side*1.025,y,z) for side in (-1,1) for z,y in profile];n=len(profile)
  fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
  mesh('Volée béton continue',vs,fs,'beton',.004)
  for i in range(10):
   z=start+sens*(i+.5)*.3;y=top-(i+1)*.18
   box('Marche pierre',(2.045,.022,.294),(x,y+.011,z),'pierre',.006)
   box('Nez antidérapant',(2.02,.005,.035),(x,y+.025,z-sens*.12),'aluSombre',.002)
   box('Liseré de sécurité',(2.02,.003,.008),(x,y+.028,z-sens*.143),'plastiqueBlanc',.001)
  for side in (-1,1):
   px=x+side*1.02;end=start+sens*3
   tube('Main courante retournée',[(px,top+.76,start-sens*.16),(px,top+.97,start-sens*.16),(px,top+.98,start),(px,top-.82,end),(px,top-.83,end+sens*.12),(px,top-1.03,end+sens*.12)],.027,'aluSombre',10)
   tube('Lisse basse',[(px,top+.16,start),(px,top-1.64,end)],.012,'aluSombre',6)
   for i in range(11):
    t=i/10;z=start+sens*3*t;y=top-1.8*t
    cyl('Barreau garde-corps',(px,y-.05,z),(px,y+.94,z),.012,'aluSombre',6)
    if i%2==0:
     box('Platine vissée',(.092,.016,.092),(px,y+.018,z),'alu',.006)
 tube('Retour du palier',[(-1.32,-.82,3),(-1.32,-.82,3.88),(3.22,-.82,3.88),(3.22,-.82,3)],.027,'aluSombre',10)


def porte():
 # Origine = charnière, porte ouverte par le moteur autour de Y.
 for x in (.043,1.897):box('Montant',(.086,2.62,.085),(x,1.35,0),'murAccent',.009)
 box('Traverse supérieure',(1.94,.145,.085),(.97,2.587,0),'murAccent',.009)
 box('Panneau bas',(1.94,.86,.085),(.97,.48,0),'murAccent',.010)
 box('Vitrage de sécurité',(1.755,1.595,.020),(.97,1.712,0),'verre',.003)
 box('Pare-chocs brossé',(1.77,.25,.012),(.97,.29,-.050),'alu',.006)
 for x in (.20,1.72):box('Ancrage barre',(.07,.11,.075),(x,1.02,-.075),'alu',.012)
 tube('Barre anti-panique',[(.20,1.02,-.10),(.28,1.02,-.145),(1.64,1.02,-.145),(1.72,1.02,-.10)],.024,'alu',10)
 for y in (.24,1.33,2.38):cyl('Paumelle',(-.012,y-.065,.008),(-.012,y+.065,.008),.024,'alu',12)
 box('Ferme-porte',(.25,.07,.09),(1.53,2.56,-.09),'alu',.009)
 tube('Bras du ferme-porte',[(1.53,2.60,-.10),(1.26,2.63,-.19),(.99,2.65,-.025)],.009,'alu',6)


def exporter(nom,fn):
 setup();fn();bpy.ops.object.select_all(action='DESELECT')
 for o in pieces:o.select_set(True)
 bpy.context.view_layer.objects.active=pieces[0]
 bpy.ops.export_scene.gltf(filepath=str(out/(nom+'-v01.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_apply=True)
 count=0
 for o in pieces:o.data.calc_loop_triangles();count+=len(o.data.loop_triangles)
 rapport={'blender':bpy.app.version_string,'objet':nom,'triangles':count,'piecesEditables':len(pieces),'materiaux':sorted({m.name for o in pieces for m in o.data.materials}),'source':'Géométrie originale modelée dans Blender ; matériaux PBR réassignés aux matériaux du jeu à l’import.'}
 # Studio exclu de l'export mais présent dans la source modifiable.
 scene=bpy.context.scene;world=bpy.data.worlds.new('Studio '+nom);scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.23,.28,.26,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7
 points=[o.matrix_world@Vector(c) for o in pieces for c in o.bound_box]
 lo=Vector(tuple(min(v[i] for v in points) for i in range(3)));hi=Vector(tuple(max(v[i] for v in points) for i in range(3)));centre=(lo+hi)*.5;taille=max(hi-lo)
 for label,offset,power in [('Principale',(-2,-3,4),700),('Contre',(3,2,4),850)]:
  d=bpy.data.lights.new(label,'AREA');d.energy=power*max(1,taille);d.shape='DISK';d.size=max(2,taille);o=bpy.data.objects.new(label,d);scene.collection.objects.link(o);o.location=centre+Vector(offset)*max(1,taille*.55);o.rotation_euler=(centre-o.location).to_track_quat('-Z','Y').to_euler()
 d=bpy.data.cameras.new('Caméra');o=bpy.data.objects.new('Caméra',d);scene.collection.objects.link(o);o.location=centre+Vector((1.6,-2.3,1.45))*max(1,taille);o.rotation_euler=(centre-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=taille*1.45;scene.camera=o
 scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.filepath=str(out/(nom+'.png'))
 bpy.ops.wm.save_as_mainfile(filepath=str(out/(nom+'-v01.blend')));bpy.ops.render.render(write_still=True)
 (out/(nom+'-rapport.json')).write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(rapport,ensure_ascii=False))
for name,fn in [('bureau',bureau),('chaise',chaise),('escalier',escalier),('porte-escalier',porte)]:exporter(name,fn)

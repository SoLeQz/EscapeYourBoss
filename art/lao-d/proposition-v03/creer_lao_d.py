"""Lao D — proposition artistique B. Source modifiable, aucune écriture sur une sortie existante.
Blender --background --factory-startup --python-exit-code 1 --python creer_lao_d.py -- --contrat contrat.json --out NOUVEAU
Coordonnées de construction en mètres du jeu ; conversion Blender uniquement à la création.
"""
import bpy, bmesh, math, json, sys, argparse
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
from math import sin, cos, pi, exp, sqrt
p=argparse.ArgumentParser();p.add_argument('--contrat',required=True);p.add_argument('--out',required=True);p.add_argument('--nom',default='lao-d-v01')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out)
if not a.nom.startswith('lao-d-v') or not a.nom[7:].isdigit():raise RuntimeError('Nom attendu : lao-d-vNN')
if out.exists(): raise RuntimeError('Dossier existant : choisir une nouvelle version, ne pas écraser les retouches.')
contract=json.loads(Path(a.contrat).read_text(encoding='utf8'));out.mkdir(parents=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
C=lambda p:(p[0],-p[2],p[1])
clamp=lambda x: max(0,min(1,x))
smooth=lambda x: clamp(x)**2*(3-2*clamp(x))
def lin(x): return x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4
def mat(name,h,rough=.8,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=tuple(lin(int(h[i:i+2],16)/255) for i in (0,2,4))+(1,)
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=m.diffuse_color;n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
 return m
skin=mat('01 Peau chaude','DDA878',.82);jacket=mat('02 Laine ardoise','454F60',.94);shirt=mat('03 Coton écru','EAE1CE',.95)
trousers=mat('04 Pantalon graphite','525660',.93);hair=mat('05 Cheveux bruns','29211D',.9);dark=mat('06 Cuir et monture','292B2B',.69)
red=mat('07 Cravate bordeaux','853F48',.88);white=mat('08 Yeux ivoire','E6DECA',.65);iris=mat('09 Iris brun','67513A',.68)
accent=mat('10 Lèvres et oreilles','AC765C',.87);bagmat=mat('11 Toile du sac','4B5050',.96);trim=mat('12 Métal brossé','92938B',.48,.55)
materials=[skin,jacket,shirt,trousers,hair,dark,red,white,iris,accent,bagmat,trim]
armdata=bpy.data.armatures.new('LaoD_Armature');arm=bpy.data.objects.new('Armature',armdata);scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for d in contract['os']:
 b=armdata.edit_bones.new(d['nom']);b.head=C(d['monde']);b.tail=b.head+Vector((0,0,.08));b.use_connect=False
 if d['parent']:b.parent=armdata.edit_bones[d['parent']]
bpy.ops.object.mode_set(mode='OBJECT');arm.select_set(False)
objects=[]
def activate(o):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o

def mesh(name,verts,faces,material,weights,sub=0):
 data=bpy.data.meshes.new(name);data.from_pydata([C(v) for v in verts],[],faces);data.update()
 o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.data.materials.append(material)
 # Normales cohérentes sur les surfaces ouvertes et fermées, sans faces retournées.
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 groups={}
 for i,v in enumerate(verts):
  w={weights:1} if isinstance(weights,str) else weights(v)
  for bone,value in w.items():
   if value>1e-6:
    if bone not in groups:groups[bone]=o.vertex_groups.new(name=bone)
    groups[bone].add([i],value,'REPLACE')
 activate(o)
 if sub:
  mod=o.modifiers.new('Surface de subdivision','SUBSURF');mod.levels=sub
  bpy.ops.object.modifier_apply(modifier=mod.name)
 for poly in data.polygons:poly.use_smooth=True
 # UV réels conservés dans la source et l'export, sans shader procédural requis.
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
 bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
 mod=o.modifiers.new('Armature','ARMATURE');mod.object=arm;o.parent=arm;objects.append(o)
 return o

def rings(name,rows,n,material,weights,sub=1,cap=True):
 # row : y, centre x, centre z, largeur, profondeur avant, profondeur arrière, exposant
 vs=[];fs=[]
 for y,x,z,rx,rf,rb,power in rows:
  for i in range(n):
   t=2*pi*i/n;st,ct=sin(t),cos(t)
   vs.append((x+math.copysign(abs(st)**power,st)*rx,y,z+math.copysign(abs(ct)**power,ct)*(rf if ct>=0 else rb)))
 for r in range(len(rows)-1):
  for i in range(n):fs.append((r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i))
 if cap:fs.extend([tuple(reversed(range(n))),tuple((len(rows)-1)*n+i for i in range(n))])
 return mesh(name,vs,fs,material,weights,sub)

def stroke(name,points,radius,material,bone,n=6):
 vs=[];fs=[]
 for i,p in enumerate(points):
  p=Vector(p);t=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
  t.normalize();u=t.cross(Vector((0,0,1)))
  if u.length<.01:u=t.cross(Vector((0,1,0)))
  u.normalize();v=t.cross(u).normalized()
  for j in range(n):vs.append(tuple(p+radius*(cos(2*pi*j/n)*u+sin(2*pi*j/n)*v)))
 for i in range(len(points)-1):
  for j in range(n):fs.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
 fs.extend([tuple(reversed(range(n))),tuple((len(points)-1)*n+j for j in range(n))])
 return mesh(name,vs,fs,material,bone)

def patch(name,vs,material,bone,thickness=.002):
 o=mesh(name,vs,[tuple(range(len(vs)))],material,bone)
 activate(o);s=o.modifiers.new('Épaisseur de coupe','SOLIDIFY');s.thickness=thickness;o.modifiers.move(len(o.modifiers)-1,0);bpy.ops.object.modifier_apply(modifier=s.name)
 b=o.modifiers.new('Arêtes du tissu','BEVEL');b.width=.0015;b.segments=2;o.modifiers.move(len(o.modifiers)-1,0);bpy.ops.object.modifier_apply(modifier=b.name)
 return o

def oval(name,pos,size,material,bone,segments=16,ringsn=10):
 vs=[];fs=[]
 for i in range(ringsn+1):
  t=pi*i/ringsn
  for j in range(segments):
   q=2*pi*j/segments;vs.append((pos[0]+size[0]*sin(t)*cos(q),pos[1]+size[1]*cos(t),pos[2]+size[2]*sin(t)*sin(q)))
 for i in range(ringsn):
  for j in range(segments):fs.append((i*segments+j,i*segments+(j+1)%segments,(i+1)*segments+(j+1)%segments,(i+1)*segments+j))
 return mesh(name,vs,fs,material,bone)

def bodyweights(v):
 x,y,z=v;suffix='R' if x>0 else 'L'
 shoulder=smooth((abs(x)-.165)/.10)*smooth((1.45-y)/.15)
 fore=smooth((1.18-y)/.14)
 return {'buste':1-shoulder,'epaule'+suffix:shoulder*(1-fore),'coude'+suffix:shoulder*fore}
# Veste : véritable surface continue, emmanchures ouvertes puis manches raccordées.
rows=[(.9,.155,.101),(.92,.158,.103),(1.02,.148,.100),(1.13,.158,.114),(1.23,.18,.123),(1.28,.194,.118),(1.36,.215,.103),(1.415,.193,.084),(1.445,.086,.06),(1.45,.069,.055)]
vs=[];fs=[];n=16
for y,rx,rz in rows:
 for j in range(n):
  t=2*pi*j/n;vs.append((sin(t)*rx,y,cos(t)*rz))
for r in range(len(rows)-1):
 for j in range(n):
  if r in (5,6) and j in (3,4,11,12):continue
  fs.append((r*n+j,r*n+(j+1)%n,(r+1)*n+(j+1)%n,(r+1)*n+j))
for sign,c in [(1,4),(-1,12)]:
 boundary=[5*n+c-1,5*n+c,5*n+c+1,6*n+c+1,7*n+c+1,7*n+c,7*n+c-1,6*n+c-1]
 if sign<0:boundary=[5*n+c+1,5*n+c,5*n+c-1,6*n+c-1,7*n+c-1,7*n+c,7*n+c+1,6*n+c+1]
 prev=boundary
 for y,cx,rx,rz in [(1.28,.244,.067,.078),(1.23,.25,.061,.073),(1.17,.254,.058,.065),(1.13,.253,.057,.065),(1.10,.249,.055,.06),(1.06,.245,.049,.055),(.96,.237,.046,.05),(.881,.233,.04,.043),(.875,.233,.04,.043)]:
  new=[]
  for k in range(8):
   t=(k+1)*pi/4;new.append(len(vs));vs.append((sign*(cx-sin(t)*rx),y,cos(t)*rz))
  for k in range(8):fs.append((prev[k],prev[(k+1)%8],new[(k+1)%8],new[k]))
  prev=new
j=mesh('Veste continue — emmanchures cousues',vs,fs,jacket,bodyweights,1)
def thoraxz(x,y):
 for a,b in zip(rows,rows[1:]):
  if a[0]<=y<=b[0]:
   t=(y-a[0])/(b[0]-a[0]);rx=a[1]*(1-t)+b[1]*t;rz=a[2]*(1-t)+b[2]*t
   return rz*sqrt(max(0,1-(x/rx)**2))
 return .055

def torse_patch(name,verts,material,offset=.007):
 o=mesh(name,verts,[tuple(reversed(range(len(verts))))],material,'buste')
 activate(o)
 bm=bmesh.new();bm.from_mesh(o.data)
 bmesh.ops.triangulate(bm,faces=list(bm.faces))
 bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=2,use_grid_fill=True)
 bm.to_mesh(o.data);bm.free()
 for v in o.data.vertices:v.co.y=-(thoraxz(v.co.x,v.co.z)+offset)
 o.data.update()
 mod=o.modifiers.new('Coupe du tissu','SOLIDIFY');mod.thickness=.002;mod.offset=0
 o.modifiers.move(len(o.modifiers)-1,0);bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
# Chemise apparente et revers façonnés sur le volume du thorax.
torse_patch('Plastron chemise',[(-.065,1.447,.052),(.065,1.447,.052),(.082,1.345,.094),(0,1.155,.117),(-.082,1.345,.094)],shirt,.007)
for s in (-1,1):
 torse_patch('Revers cranté',[(s*.062,1.445,.064),(s*.13,1.405,.073),(s*.103,1.36,.105),(s*.132,1.345,.1),(s*.013,1.14,.122),(s*.075,1.36,.116)],jacket,.012)
 patch('Pointe col',[(s*.012,1.457,.063),(s*.062,1.44,.062),(s*.067,1.389,.091),(s*.026,1.408,.101)],shirt,'buste',.003)
 patch('Poche passepoilée',[(s*.065,1.057,.094),(s*.133,1.069,.065),(s*.134,1.057,.067),(s*.066,1.045,.096)],dark,'buste',.001)
 stroke('Bord ouverture',[(s*.01,1.155,.122),(s*.023,1.02,.102),(s*.028,.907,.103)],.0015,dark,'buste')
 rings('Manchette',[(.849,s*.233,0,.032,.033,.033,.8),(.853,s*.233,0,.035,.036,.036,.8),(.884,s*.233,0,.035,.036,.036,.8)],12,shirt,'coudeR' if s>0 else 'coudeL',1)
torse_patch('Cravate',[(-.012,1.395,.109),(.012,1.395,.109),(.023,1.19,.123),(0,1.167,.129),(-.024,1.19,.123)],red,.017)
torse_patch('Nœud cravate',[(-.015,1.418,.108),(.015,1.418,.108),(.009,1.392,.12),(-.009,1.392,.12)],red,.02)
rings('Pied de col',[(1.439,0,-.007,.069,.06,.062,1),(1.449,0,-.007,.065,.056,.058,1),(1.478,0,-.008,.049,.046,.048,1)],16,shirt,'buste',1)
# Cou anatomique évasé à sa base.
rings('Cou',[(1.43,0,-.008,.055,.045,.046,1),(1.455,0,-.01,.047,.043,.043,1),(1.49,0,-.012,.041,.04,.041,1),(1.53,0,-.015,.045,.043,.047,1)],16,skin,'tete',1)
# Pantalon : bassin + jambes fuselées, volumes de cuisse, cassure au genou, ourlets.
vs=[];fs=[];n=16
for y,rx,rf,rb in [(.928,.15,.094,.102),(.91,.155,.095,.104),(.845,.161,.102,.107),(.785,.156,.09,.1)]:
 for k in range(n):
  t=2*pi*k/n;vs.append((rx*sin(t),y,(rf if cos(t)>0 else rb)*cos(t)))
for r in range(3):
 for k in range(n):fs.append((r*n+k,r*n+(k+1)%n,(r+1)*n+(k+1)%n,(r+1)*n+k))
crotch=len(vs);vs.append((0,.775,-.005))
for sign in (1,-1):
 boundary=[48+k for k in range(9)]+[crotch] if sign>0 else [48+(8+k)%16 for k in range(9)]+[crotch]
 prev=boundary
 for y,cx,rx,rz,cz in [(.73,.09,.074,.09,-.005),(.65,.105,.069,.083,-.01),(.48,.105,.055,.068,-.004),(.43,.105,.054,.075,.001),(.38,.105,.053,.065,0),(.26,.105,.046,.057,-.012),(.14,.105,.047,.056,-.007),(.10,.105,.05,.058,0),(.086,.105,.05,.058,0)]:
  new=[]
  for k in range(10):
   t=-.2*pi+2*pi*k/10;x=sign*(cx+rx*sin(t));z=rz*cos(t)+cz
   if sign<0:z=-z
   new.append(len(vs));vs.append((x,y,z))
  for k in range(10):fs.append((prev[k],prev[(k+1)%10],new[(k+1)%10],new[k]))
  prev=new
 fs.append(tuple(reversed(prev)))
def pantsweights(v):
 x,y,z=v;suffix='R' if x>0 else 'L';hip=smooth((.87-y)/.12);knee=smooth((.49-y)/.14)
 return {'racine':1-hip,'hanche'+suffix:hip*(1-knee),'genou'+suffix:hip*knee}
mesh('Pantalon continu — bassin et entrejambe',vs,fs,trousers,pantsweights,1)
for s in (-1,1):
 suffix='R' if s>0 else 'L'
 # Souliers dessinés par sections horizontales : talon, empeigne et bout aplati.
 shoe=[(.012,s*.105,.034,.06,.135,.093,.55),(.025,s*.105,.034,.061,.135,.094,.55),(.039,s*.105,.034,.061,.133,.094,.55),(.061,s*.105,.028,.058,.124,.087,.55),(.087,s*.105,-.001,.05,.096,.064,.75),(.112,s*.105,-.012,.042,.055,.053,.85),(.125,s*.105,-.012,.038,.044,.046,1)]
 rings('Soulier '+suffix,shoe,16,dark,'cheville'+suffix,1)
 rings('Semelle '+suffix,[(.004,s*.105,.034,.061,.136,.095,.5),(.008,s*.105,.034,.062,.137,.096,.5),(.023,s*.105,.034,.062,.137,.096,.5),(.028,s*.105,.034,.06,.135,.094,.5)],16,bagmat,'cheville'+suffix,1)
 for k in range(3):stroke('Lacet',[(s*.105-.025,.095+k*.006,.058-k*.015),(s*.105+.025,.095+k*.006,.058-k*.015)],.0016,bagmat,'cheville'+suffix)
# Mains ramifiées : paume et doigts partagent une surface Skin subdivisée.
for s in (-1,1):
 suffix='R' if s>0 else 'L';cx=s*.232
 verts=[(cx,.85,0),(cx,.822,0),(cx,.8,.001)];edges=[(0,1),(1,2)];radii=[(.023,.026),(.028,.025),(.028,.021)]
 for f,z in enumerate([-.024,-.008,.008,.024]):
  length=[.046,.058,.062,.05][f];i=len(verts);verts.extend([(cx,.782,z),(cx+s*.003,.782-length*.5,z+.003),(cx+s*.007,.782-length,z+.008)])
  edges.extend([(2,i),(i,i+1),(i+1,i+2)]);radii.extend([(.008,.008),(.007,.007),(.005,.005)])
 i=len(verts);verts.extend([(cx-s*.03,.818,.018),(cx-s*.039,.797,.023),(cx-s*.037,.785,.027)]);edges.extend([(1,i),(i,i+1),(i+1,i+2)]);radii.extend([(.011,.011),(.009,.009),(.006,.006)])
 data=bpy.data.meshes.new('Main');data.from_pydata([C(v) for v in verts],edges,[]);o=bpy.data.objects.new('Main '+suffix,data);scene.collection.objects.link(o);activate(o)
 mod=o.modifiers.new('Paume et doigts continus','SKIN')
 for i,r in enumerate(radii):data.skin_vertices[0].data[i].radius=r
 data.skin_vertices[0].data[0].use_root=True
 bpy.ops.object.modifier_apply(modifier=mod.name)
 mod=o.modifiers.new('Articulations adoucies','SUBSURF');mod.levels=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 o.data.materials.append(skin);g=o.vertex_groups.new(name='main'+suffix);g.add(list(range(len(o.data.vertices))),1,'REPLACE')
 for poly in o.data.polygons:poly.use_smooth=True
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
 mod=o.modifiers.new('Armature','ARMATURE');mod.object=arm;o.parent=arm;objects.append(o)
# Visage : surface unique à relief continu, nez/arcades/pommettes/menton intégrés.
profile=[(1.495,.03,.025,.035),(1.51,.054,.057,.054),(1.53,.072,.067,.068),(1.55,.088,.069,.078),(1.57,.097,.071,.082),(1.59,.103,.073,.086),(1.61,.11,.076,.09),(1.63,.111,.074,.094),(1.65,.111,.075,.098),(1.67,.112,.081,.101),(1.70,.11,.081,.10),(1.73,.105,.076,.094),(1.755,.088,.067,.084),(1.775,.059,.045,.058),(1.783,.008,.009,.012)]
def dims(y):
 for a,b in zip(profile,profile[1:]):
  if a[0]<=y<=b[0]:
   t=(y-a[0])/(b[0]-a[0]);return [a[i]*(1-t)+b[i]*t for i in range(1,4)]
 return profile[0][1:] if y<profile[0][0] else profile[-1][1:]
def relief(x,y):
 def gauss(cx,cy,sx,sy):return exp(-((x-cx)/sx)**2-((y-cy)/sy)**2)
 return (.025*gauss(0,1.639,.014,.041)+.035*gauss(0,1.607,.02,.018)
  +.010*gauss(0,1.527,.038,.018)+.009*gauss(0,1.566,.038,.014)
  -.005*(gauss(.043,1.64,.028,.014)+gauss(-.043,1.64,.028,.014))
  +.007*(gauss(.067,1.61,.029,.019)+gauss(-.067,1.61,.029,.019)))
def facez(x,y):
 rx,rf,rb=dims(y);return rf*sqrt(max(0,1-(x/rx)**2))+relief(x,y)
vs=[];fs=[];n=32
ys=sorted(set([p[0] for p in profile]+[1.598,1.604,1.616,1.624,1.637,1.644,1.657,1.563,1.576]))
for y in ys:
 rx,rf,rb=dims(y)
 for k in range(n):
  t=2*pi*k/n;x=rx*sin(t);z=cos(t)*(rf if cos(t)>=0 else rb)
  if cos(t)>0:z+=relief(x,y)*min(1,cos(t)*3)
  vs.append((x,y,z))
for i in range(len(ys)-1):
 for k in range(n):fs.append((i*n+k,i*n+(k+1)%n,(i+1)*n+(k+1)%n,(i+1)*n+k))
fs.extend([tuple(reversed(range(n))),tuple((len(ys)-1)*n+k for k in range(n))])
mesh('Visage sculpté — profil continu',vs,fs,skin,'tete',1)
for s in (-1,1):
 oval('Oreille',(s*.108,1.614,-.009),(.019,.036,.019),skin,'tete')
 oval('Conque oreille',(s*.123,1.618,.001),(.006,.021,.009),accent,'tete',12,8)
 x=s*.043;y=1.637;z=facez(x,y)+.0005
 oval('Œil',(x,y,z),(.023,.012,.008),white,'tete',24,12)
 oval('Iris',(x-s*.001,y,z+.0075),(.008,.008,.0018),iris,'tete',16,10)
 oval('Pupille',(x-s*.001,y,z+.009),(.0038,.0049,.001),dark,'tete',12,8)
 oval('Reflet',(x-.002,y+.003,z+.010),(.0013,.0015,.0007),white,'tete',8,6)
 for top in (True,False):
  pts=[]
  for k in range(17):
   t=pi*k/16;xx=x+.023*cos(t);yy=y+(.011 if top else -.009)*sin(t)
   pts.append((xx,yy,z+.003+.003*sin(t)))
  stroke('Paupière supérieure' if top else 'Paupière inférieure',pts,.0028 if top else .002,skin,'tete')
 pts=[(x+(k/12-.5)*.048,1.668+.005*sin(pi*k/12)+s*.003*(k/12-.5),facez(x+(k/12-.5)*.048,1.668)+.002) for k in range(13)]
 stroke('Sourcil',pts,.0026,hair,'tete')
 # Monture arrondie rectangulaire, branches épousant les tempes.
 pts=[]
 for cx,cy,start in [(.022,.012,0),(-.022,.012,pi/2),(-.022,-.012,pi),(.022,-.012,3*pi/2)]:
  for k in range(6):
   t=start+k*pi/10;xx=x+cx+.008*cos(t);yy=y+cy+.007*sin(t);pts.append((xx,yy,.102-abs(xx)*.20))
 pts.append(pts[0]);stroke('Monture',pts,.0026,dark,'tete',8)
 stroke('Branche lunette',[(s*.074,y+.006,.088),(s*.104,y+.005,.044),(s*.119,y+.003,-.005),(s*.12,y-.01,-.024)],.0025,dark,'tete')
 stroke('Narine',[(s*.009,1.596,.110),(s*.016,1.596,.108),(s*.020,1.599,.102)],.0012,accent,'tete')
stroke('Pont lunettes',[(-.014,1.643,.098),(0,1.647,.116),(.014,1.643,.098)],.0024,dark,'tete',8)
pts=[((k/20-.5)*.055,1.565+.004*(2*k/20-1)**2,facez((k/20-.5)*.055,1.567)+.002) for k in range(21)]
stroke('Sourire discret',pts,.00125,accent,'tete')
stroke('Lèvre inférieure',[((k/16-.5)*.041,1.560+.003*(2*k/16-1)**2,facez((k/16-.5)*.041,1.56)+.001) for k in range(17)],.0018,skin,'tete')
# Coiffure asymétrique, tempes courtes et volumes balayés sans calotte séparée.
vs=[];fs=[];n=32;nr=10
for r in range(nr+1):
 u=r/nr
 for k in range(n):
  t=2*pi*k/n;front=max(0,cos(t));bottom=1.612+.094*front-.011*sin(t)*front
  y=bottom+(1.799-bottom)*sin(u*pi/2)
  rx,rf,rb=dims(min(y,1.776));scale=cos(u*pi/2)
  # Le volume reste posé sur le crâne ; réduction du sommet sans trou ni double coque.
  if y>1.755:rx=.093*sqrt(max(0,(1.8-y)/.045));rf=.078*sqrt(max(0,(1.8-y)/.045));rb=.088*sqrt(max(0,(1.8-y)/.045))
  wave=.0025*sin(7*t+4*u)*(sin(pi*u)**2)
  shift=-.012*sin(pi*u/2)**6
  x=(rx+.009+wave+abs(shift))*sin(t)+shift
  z=(rf+.009+wave)*cos(t) if cos(t)>=0 else (rb+.009+wave)*cos(t)
  if r==nr:x=-.012;z=0
  vs.append((x,y+.008*max(0,-sin(t))*sin(pi*u),z))
for r in range(nr):
 for k in range(n):fs.append((r*n+k,r*n+(k+1)%n,(r+1)*n+(k+1)%n,(r+1)*n+k))
mesh('Coiffure balayée',vs,fs,hair,'tete',1)
# Sac plus étroit : épaules et côtés de veste visibles depuis le dos.
rings('Sac toile structuré',[(1.007,0,-.165,.098,.042,.05,.5),(1.024,0,-.165,.111,.046,.06,.5),(1.21,0,-.169,.107,.044,.057,.55),(1.276,0,-.169,.09,.037,.049,.65),(1.288,0,-.167,.067,.029,.038,.7)],16,bagmat,'buste',1)
rings('Poche du sac',[(1.034,0,-.221,.078,.017,.021,.4),(1.041,0,-.222,.085,.018,.021,.4),(1.131,0,-.222,.085,.018,.021,.4),(1.138,0,-.219,.078,.018,.021,.4)],12,bagmat,'buste',1)
stroke('Zip sac',[(-.09,1.153,-.219),(-.097,1.237,-.212),(-.07,1.273,-.211),(0,1.282,-.209),(.07,1.273,-.211),(.097,1.237,-.212),(.09,1.153,-.219)],.0015,dark,'buste')
stroke('Poignée sac',[(-.027,1.283,-.17),(-.027,1.309,-.17),(.027,1.309,-.17),(.027,1.283,-.17)],.005,dark,'buste',8)
# Bretelles ajustées à la surface réelle : projection sur la veste ET les revers.
# Aucun lissage après projection : il faisait rentrer l'arc d'épaule dans le tissu.
body_vertices=[];body_triangles=[];body_weights=[]
for clothing in [o for o in objects if o==j or o.name.startswith('Revers cranté')]:
 start=len(body_vertices);clothing.data.calc_loop_triangles()
 body_vertices.extend([v.co.copy() for v in clothing.data.vertices])
 for v in clothing.data.vertices:
  body_weights.append({clothing.vertex_groups[g.group].name:g.weight for g in v.groups})
 body_triangles.extend([tuple(start+i for i in t.vertices) for t in clothing.data.loop_triangles])
body_bvh=BVHTree.FromPolygons(body_vertices,body_triangles,all_triangles=True)

def contact_sangle(x,theta):
 center=Vector(C((x,1.235,0)));direction=Vector(C((0,sin(theta),cos(theta))))
 point,normal,face,_=body_bvh.ray_cast(center+direction*.6,-direction,1.2)
 if point is None:raise RuntimeError('Bretelle sans appui sur la veste')
 if normal.dot(direction)<0:normal=-normal
 indices=body_triangles[face]
 bary=barycentric_transform(point,*[body_vertices[i] for i in indices],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
 weights={}
 for index,w in zip(indices,bary):
  for bone,value in body_weights[index].items():weights[bone]=weights.get(bone,0)+max(0,w)*value
 total=sum(weights.values());weights={bone:w/total for bone,w in weights.items()}
 return point,normal,weights

strap_report=[]
for side in (-1,1):
 surface=[];columns=4;arc_rows=57
 for row in range(arc_rows):
  t=row/(arc_rows-1);theta=2.4-(2.4+.91)*t
  cx=side*(.142+.007*sin(pi*t))
  surface.append([contact_sangle(cx+(col/(columns-1)-.5)*.026,theta) for col in range(columns)])
 # Les deux bouts rejoignent le sac au lieu de se terminer dans le torse.
 def attache(reference,center):
  end=[]
  for col,(_,normal,_) in enumerate(reference):
   point=Vector(C((center[0]+(col/(columns-1)-.5)*.026,center[1],center[2])))
   end.append((point,normal.copy(),{'buste':1}))
  return end
 back=attache(surface[0],(side*.08,1.27,-.15))
 rows_strap=[back]+surface
 # Retour sous le bras autour de la taille, puis attache basse sur le sac.
 base_angle=math.atan2(abs(surface[-1][columns//2][0].x),-surface[-1][columns//2][0].y)
 for k in range(1,19):
  t=k/18;end_angle=pi-math.atan2(.085,.10);angle=base_angle+(end_angle-base_angle)*t;row=[]
  start_y=sum(point.z for point,_,_ in surface[-1])/columns
  y=start_y+(1.06-start_y)*smooth(t)
  for col in range(columns):
   yy=y+(col/(columns-1)-.5)*.026
   center=Vector(C((0,yy,0)));direction=Vector(C((side*sin(angle),0,cos(angle))))
   # Depuis l'intérieur du buste : le premier impact est la veste.
   # Depuis l'extérieur, ce rayon touchait d'abord la manche et entourait le bras.
   point,normal,face,_=body_bvh.ray_cast(center,direction,.6)
   if point is None:raise RuntimeError('Retour bas sans appui')
   if normal.dot(direction)<0:normal=-normal
   row.append((point,normal,{'buste':1}))
  rows_strap.append(row)
 rows_strap.append(attache(rows_strap[-1],(side*.085,1.052,-.133)))
 vs=[];weights=[];fs=[];count=len(rows_strap)*columns
 # 6 mm d'écart intérieur, 3 mm de textile. Épaisseur créée explicitement,
 # pour conserver l'appui et éviter un déplacement intérieur du modificateur.
 for offset in (.006,.009):
  for row in rows_strap:
   for point,normal,w in row:
    p=point+normal*offset;vs.append((p.x,p.z,-p.y));weights.append(w)
 for r in range(len(rows_strap)-1):
  for col in range(columns-1):
   i=r*columns+col;quad=(i,i+1,i+1+columns,i+columns)
   fs.append(tuple(reversed(quad)));fs.append(tuple(i+count for i in quad))
  for col in (0,columns-1):
   i=r*columns+col;fs.append((i,i+columns,i+columns+count,i+count))
 for r in (0,len(rows_strap)-1):
  for col in range(columns-1):
   i=r*columns+col;fs.append((i,i+1,i+1+count,i+count))
 it=iter(weights);strap=mesh('Bretelle ajustée '+('R' if side>0 else 'L'),vs,fs,dark,lambda _:next(it))
 # Identifiant exporté en extras, utile au contrôle des vrais sommets skinnés.
 strap['piece']='bretelle'
 # Distance signée contrôlée au niveau des épaules, y compris au milieu des faces.
 samples=[]
 for poly in strap.data.polygons:
  points=[strap.data.vertices[i].co for i in poly.vertices]
  samples.extend(points);samples.append(sum(points,Vector())/len(points))
 clearances=[];diagnostics=[]
 for p in samples:
  if p.z<1.32:continue
  # Distance extérieure suivant un rayon sortant. Une simple normale du
  # triangle le plus proche donne un faux signe au bord d'un revers ouvert.
  center=Vector(C((p.x,1.235,0)));direction=(p-center).normalized()
  nearest,normal,index,_=body_bvh.ray_cast(center+direction*.6,-direction,1.2)
  if nearest is None:raise RuntimeError('Échantillon de bretelle sans veste dessous')
  clearance=(p-nearest).dot(direction);clearances.append(clearance)
  diagnostics.append({'distance':clearance,'point':list(p),'surface':list(nearest),'face':index})
 if not clearances or min(clearances)<.002:
  print(json.dumps(sorted(diagnostics,key=lambda d:d['distance'])[:6]))
  raise RuntimeError('Bretelle trop proche ou traversante à l’épaule : '+str(min(clearances)))
 strap_report.append({'cote':side,'echantillonsEpaule':len(clearances),'margeMinMetres':min(clearances)})
patch('Étiquette du sac',[(-.024,1.183,-.228),(.024,1.183,-.228),(.024,1.161,-.229),(-.024,1.161,-.229)],dark,'buste',.001)
# Badge sur poche, sans grand cordon qui masque les revers.
patch('Porte badge',[(.057,1.32,.111),(.098,1.32,.089),(.098,1.267,.105),(.057,1.267,.126)],dark,'buste',.003)
patch('Carte badge',[(.06,1.316,.114),(.094,1.316,.096),(.094,1.273,.107),(.06,1.273,.128)],shirt,'buste',.001)
# Rassembler par matière : douze surfaces skinnées maximum, armature partagée.
# La source conserve les noms des pièces dans la collection avant export ? Source éditable
# dans ces 12 objets par matériau ; îlots sélectionnables, poids et UV conservés.
for material in materials:
 group=[o for o in scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==material]
 if not group:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in group:o.select_set(True)
 bpy.context.view_layer.objects.active=group[0]
 if len(group)>1:bpy.ops.object.join()
 group[0].name=material.name
objects=[o for o in scene.objects if o.type=='MESH']
for o in objects:
 # La subdivision peut produire 1.0000001 : borner et renormaliser avant validation.
 for v in o.data.vertices:
  weights=[(g.group,max(0,min(1,g.weight))) for g in v.groups]
  total=sum(w for _,w in weights)
  if total<=0:raise RuntimeError('Sommet sans poids : '+o.name)
  for index,w in weights:o.vertex_groups[index].add([v.index],w/total,'REPLACE')
 if o.data.validate(verbose=True):raise RuntimeError('Maillage invalide : '+o.name)
 for poly in o.data.polygons:poly.use_smooth=True
 for v in o.data.vertices:
  total=sum(g.weight for g in v.groups)
  if abs(total-1)>1e-4:raise RuntimeError(f'Poids incorrects {o.name}: {total}')
arm['jalon']='B — proposition, expressions et poses extrêmes à finaliser après validation'
arm['contrat']='16 os, +Y haut/+Z avant dans le jeu, mètres ; adaptateur de matrices de liaison'
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=arm
params=dict(filepath=str(out/(a.nom+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_skins=True,export_morph=True,export_cameras=False,export_lights=False,export_def_bones=False,export_leaf_bone=False,export_apply=False)
props=set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys());bpy.ops.export_scene.gltf(**{k:v for k,v in params.items() if k in props})
# Studio source hors export.
world=bpy.data.worlds.new('Studio');scene.world=world;world.node_tree.nodes['Background'].inputs[0].default_value=(.25,.29,.28,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6
for name,pos,power,size in [('Principale',(-3,-4,5),550,4),('Contour',(3,2,4),650,3),('Remplissage',(3,-2,2),180,3)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',d);scene.collection.objects.link(cam);scene.camera=cam
cam.location=(2,-4,2.1);cam.rotation_euler=(Vector((0,0,.96))-cam.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=2.15
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(out/'blender-vue.png')
bpy.ops.wm.save_as_mainfile(filepath=str(out/(a.nom+'.blend')));bpy.ops.render.render(write_still=True)
triangles=0
for o in objects:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
rapport={'versionBlender':bpy.app.version_string,'jalon':'B proposition à valider','objetsSkinnes':len(objects),'triangles':triangles,'materiaux':len(objects),'glbOctets':(out/(a.nom+'.glb')).stat().st_size,'textures':0,'bretelles':strap_report,'expressions':'regard, clignements, doigts indépendants non finalisés — jalon C','source':'géométrie originale créée dans Blender, aucun asset tiers'}
(out/'rapport-blender.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(rapport,ensure_ascii=False))

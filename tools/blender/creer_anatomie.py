"""Têtes et mains Méridien. Géométrie, couleurs et poses de doigts créées dans Blender.
Exports modulaires en mètres, +Y haut/+Z avant dans le jeu. Aucun asset tiers.
blender --background --factory-startup --python-exit-code 1 --python creer_anatomie.py -- --out DOSSIER_NEUF
"""
import bpy,bmesh,math,argparse,sys,json
from pathlib import Path
from mathutils import Vector,Quaternion
from math import sin,cos,pi,sqrt,exp,radians
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--only',default='');p.add_argument('--version',default='v01');p.add_argument('--base',default='')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out)
if out.exists():raise RuntimeError('Choisir un nouveau dossier pour conserver les sources précédentes.')
out.mkdir(parents=True)
C=lambda v:Vector((v[0],-v[2],v[1]))
clamp=lambda x:max(0,min(1,x))
lerp=lambda a,b,t:a+(b-a)*t
PALETTE={'peau':'EAC096','cheveux':'302723','blancOeil':'DDD8C7','iris':'725136','pupille':'211E1B','reflet':'FFF5D9','monture':'353B3C'}
def setup():
 bpy.ops.wm.read_factory_settings(use_empty=True)
 global objects,mats
 objects=[];mats={}
 for name,h in PALETTE.items():
  m=bpy.data.materials.new('ANATOMIE_'+name);m.use_nodes=True
  rgba=tuple(((int(h[i:i+2],16)/255+.055)/1.055)**2.4 for i in (0,2,4))+(1,)
  m.diffuse_color=rgba;n=m.node_tree.nodes['Principled BSDF'];n.inputs['Base Color'].default_value=rgba
  n.inputs['Roughness'].default_value=.76 if name in ['peau','cheveux'] else .48
  if name in ['peau','cheveux']:
   vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Pigment'
   mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=rgba
   m.node_tree.links.new(vc.outputs['Color'],mix.inputs[2]);m.node_tree.links.new(mix.outputs[0],n.inputs['Base Color'])
  mats[name]=m

def mesh(name,vs,fs,mat,control='head',origin=(0,0,0),colors=None,morphs=None,option=''):
 d=bpy.data.meshes.new(name);d.from_pydata([C(Vector(v)-Vector(origin)) for v in vs],[],fs);d.update()
 o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=C(origin);d.materials.append(mats[mat])
 o['controle']=control;o['origine']=list(origin);o['option']=option
 # Normales de faces explicites ; ne pas fermer les ouvertures anatomiques.
 for f in d.polygons:f.use_smooth=True
 uv=d.uv_layers.new(name='UVMap')
 for f in d.polygons:
  axis=max(range(3),key=lambda i:abs(f.normal[i]));axes=[i for i in range(3) if i!=axis]
  for li in f.loop_indices:
   v=d.vertices[d.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]],v[axes[1]])
 col=d.color_attributes.new(name='Pigment',type='FLOAT_COLOR',domain='POINT')
 for i,item in enumerate(col.data):item.color=tuple(colors[i] if colors else (1,1,1))+(1,)
 if morphs:
  o.shape_key_add(name='Basis')
  for key,verts in morphs.items():
   k=o.shape_key_add(name=key);k.value=0
   for v,co in zip(k.data,verts):v.co=C(Vector(co)-Vector(origin))
 objects.append(o);return o

def tube(name,points,r,mat,control='head',origin=(0,0,0),n=8,color=None):
 vs=[];fs=[]
 for i,p in enumerate(points):
  d=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
  axis=Vector((0,0,1)) if abs(d.z)<.93 else Vector((0,1,0));u=d.cross(axis).normalized();v=d.cross(u)
  rr=r[i] if isinstance(r,list) else r
  for k in range(n):vs.append(tuple(Vector(p)+rr*(cos(k*2*pi/n)*u+sin(k*2*pi/n)*v)))
 for j in range(len(points)-1):
  for k in range(n):fs.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
 fs.extend([tuple(reversed(range(n))),tuple((len(points)-1)*n+k for k in range(n))])
 return mesh(name,vs,fs,mat,control,origin,[color]*len(vs) if color else None)

def ellipsoid(name,pos,size,mat,control='head',origin=(0,0,0),n=20,rings=12,color=None):
 vs=[];fs=[]
 for j in range(rings+1):
  a=pi*j/rings
  for k in range(n):
   t=k*2*pi/n;vs.append((pos[0]+size[0]*sin(a)*cos(t),pos[1]+size[1]*cos(a),pos[2]+size[2]*sin(a)*sin(t)))
 for j in range(rings):
  for k in range(n):fs.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
 # L'ordre sphérique ci-dessus est extérieur en coordonnées Y haut.
 return mesh(name,vs,fs,mat,control,origin,[color]*len(vs) if color else None)

PROFILE=[(-.115,.016,.023,.030),(-.105,.038,.042,.044),(-.088,.061,.054,.061),(-.062,.075,.058,.073),(-.035,.083,.060,.081),(0,.086,.060,.085),(.027,.085,.064,.087),(.063,.083,.069,.087),(.100,.074,.061,.080),(.130,.054,.044,.057),(.145,.022,.018,.024),(.15,.001,.001,.001)]
def head(profil):
 def dims(y):
  for a,b in zip(PROFILE,PROFILE[1:]):
   if a[0]<=y<=b[0]:
    t=(y-a[0])/(b[0]-a[0]);return [lerp(a[k],b[k],t) for k in range(1,4)]
  return PROFILE[0][1:] if y<PROFILE[0][0] else PROFILE[-1][1:]
 def form(x,y,z):
  jaw=exp(-((y+.070)/.048)**2)
  if profil=='direction':return (x*(1.045+.085*jaw),y,z*(1.025+.01*jaw))
  if profil=='chignon':return (x*(.97-.045*jaw),y,z*.98)
  if profil=='securite':return (x*(1.035+.055*jaw),y,z*1.02)
  return (x,y,z)
 def relief(x,y):
  def g(cx,cy,sx,sy):return exp(-((x-cx)/sx)**2-((y-cy)/sy)**2)
  return (.014*g(.001,.004,.012,.032)+.024*g(.001,-.028,.014,.013)
   +.007*(g(.015,-.032,.009,.008)+g(-.015,-.032,.009,.008))
   +.004*g(0,-.065,.025,.016)+.006*g(0,-.093,.035,.015)
   +.004*(g(.055,-.025,.025,.026)+g(-.055,-.025,.025,.026))
   -.006*(g(.035,.007,.022,.012)+g(-.035,.007,.022,.012))
   +.003*(g(.035,.026,.026,.010)+g(-.035,.026,.026,.010)))
 def face(x,y):
  rx,rf,_=dims(y);return rf*sqrt(max(0,1-(x/rx)**2))+relief(x,y)
 def facepoint(x,y,offset=0):return form(x,y,face(x,y)+offset)
 vs=[];fs=[];colors=[];n=64;ys=[lerp(-.115,.15,j/46) for j in range(47)]
 for y in ys:
  rx,rf,rb=dims(y)
  for k in range(n):
   t=2*pi*k/n;x=rx*sin(t);z=cos(t)*(rf if cos(t)>=0 else rb)
   if cos(t)>0:z+=relief(x,y)*min(1,cos(t)*4)
   vs.append(form(x,y,z))
   flush=max(0,cos(t))*exp(-((abs(x)-.055)/.026)**2-((y+.029)/.03)**2)
   beard=(.017 if profil in ['direction','securite'] else .006)*exp(-((y+.071)/.031)**2)*max(0,cos(t))
   colors.append((1-beard,1-.065*flush-beard,1-.075*flush-beard))
 for j in range(len(ys)-1):
  for k in range(n):fs.append((j*n+k,(j+1)*n+k,(j+1)*n+(k+1)%n,j*n+(k+1)%n))
 fs.extend([tuple(range(n)),tuple(reversed([(len(ys)-1)*n+k for k in range(n)]))])
 mesh('Visage — pommettes, nez, mâchoire et menton',vs,[tuple(reversed(f)) for f in fs],'peau',colors=colors)
 # Cou dans le col : aucune tête posée sur une bille.
 vs=[];fs=[]
 for y,rx,rz,z in [(-.194,.046,.040,-.009),(-.17,.040,.036,-.01),(-.135,.036,.034,-.011),(-.102,.042,.042,-.015),(-.084,.044,.046,-.014)]:
  for k in range(24):
   t=k*2*pi/24;vs.append((rx*sin(t),y,z+rz*cos(t)))
 for j in range(4):
  for k in range(24):fs.append((j*24+k,(j+1)*24+k,(j+1)*24+(k+1)%24,j*24+(k+1)%24))
 mesh('Cou et insertion sous la mâchoire',vs,[tuple(reversed(f)) for f in fs],'peau')
 # Oreilles avec hélix et conque, dimension adulte plutôt que disques.
 for s in [-1,1]:
  ex=form(s*.087,-.014,0)[0]
  ellipsoid('Pavillon oreille',(ex,-.017,-.004),(.012,.025,.013),'peau',n=16,rings=10,color=(1,.96,.95))
  pts=[(ex+s*.009,-.017+.019*cos(k*2*pi/24),-.002+.010*sin(k*2*pi/24)) for k in range(25)]
  tube('Hélix',pts,.0022,'peau',n=6,color=(1,.96,.94))
  ellipsoid('Conque',(ex+s*.011,-.017,.001),(.0015,.012,.007),'peau',n=12,rings=8,color=(.83,.73,.70))
  tube('Anti-hélix',[(ex+s*.012,-.027,.003),(ex+s*.013,-.018,-.003),(ex+s*.011,-.006,-.002)],.0015,'peau',n=6)
 # Yeux en amande. Les iris restent mobiles sous les paupières sculptées.
 lidvs=[];lidclosed=[];lidfs=[]
 for s in [-1,1]:
  ex=s*.035;ey=.007;w=.0182;h=.0066
  eyevs=[facepoint(ex,ey,.004)];eyefs=[]
  for k in range(33):
   a=k*2*pi/32;xx=ex+w*cos(a);yy=ey+h*sin(a)+s*.04*(xx-ex)
   eyevs.append(facepoint(xx,yy,.0018))
   if k<32:eyefs.append((0,k+1,k+2))
  mesh('Sclérotique en amande',eyevs,eyefs,'blancOeil')
  x,y,z=facepoint(ex,ey,.004)
  ellipsoid('Iris',(x,y,z+.0002),(.0058,.0060,.0014),'iris','regard',n=20,rings=10)
  ellipsoid('Pupille',(x,y,z+.0014),(.0025,.0030,.0007),'pupille','regard',n=14,rings=8)
  ellipsoid('Reflet humide',(x-.0017,y+.0021,z+.002),(.0009,.0009,.0004),'reflet','regard',n=8,rings=6)
  lower=[];crease=[];brow=[]
  start=len(lidvs)
  for i in range(25):
   u=i/24;xx=ex+(2*u-1)*w;arc=sin(pi*u)**.72;slant=s*.04*(xx-ex)
   low=ey-h*arc+slant;edge=ey+h*arc+slant;outer=edge+.006*arc+.001
   lower.append(facepoint(xx,low,.0017))
   for j in range(4):
    v=j/3;oy=lerp(edge,outer,v);cy=lerp(low-.001*arc,outer,v)
    lidvs.append(facepoint(xx,oy,.0018+sin(pi*v)*.001))
    lidclosed.append(facepoint(xx,cy,.010*(1-v)+.0018*v))
    if i<24 and j<3:
     q=start+i*4+j;lidfs.append((q,q+4,q+5,q+1))
   crease.append(facepoint(xx,outer+.002,.001))
   bx=(.015+u*.042)*s;by=.027+.006*sin(pi*u)-u*.003-(.003 if profil=='direction' else 0)
   brow.append(facepoint(bx,by,.0023))
  tube('Paupière inférieure',lower,.0013,'peau',n=6)
  tube('Pli palpébral',crease,.0006,'peau',n=5,color=(.94,.87,.85))
  tube('Sourcil effilé',brow,[.0006+.0016*sin(pi*k/24)**.55 for k in range(25)],'cheveux',n=6)
  # Narines dans le relief du nez, très courtes, ni trous noirs ni boutons.
  tube('Narine',[facepoint(s*x,-.036+.001*i,.0008) for i,x in enumerate([.007,.010,.013])],.0007,'peau',n=6,color=(.24,.16,.13))
 mesh('Paupières mobiles',lidvs,lidfs,'peau','paupiere',morphs={'Clignement':lidclosed})
 # Lèvres avec arc de Cupidon, lèvre inférieure et commissures intégrées.
 center=facepoint(0,-.063,.0015);width=.023 if profil!='chignon' else .021
 vs=[];fs=[];cols=[]
 for j in range(7):
  v=j/6
  for i in range(33):
   u=i/32;x=(u*2-1)*width;arch=sin(pi*u)**.7
   seam=-.063+.0012*(2*u-1)**2+.00045*(2*u-1)
   top=seam+(.0032+.0014*exp(-((abs(x)-.006)/.004)**2))*arch
   bot=seam-.0040*arch
   y=lerp(bot,top,v);p=facepoint(x,y,.001+sin(pi*v)*.0015*arch);vs.append(p)
   pigment=.5+.5*sin(pi*v);cols.append((.98,.83-.10*pigment,.82-.10*pigment))
   if j<6 and i<32:
    q=j*33+i;fs.append((q,q+1,q+34,q+33))
 mesh('Lèvres dessinées',vs,fs,'peau','bouche',center,cols)
 pts=[facepoint((i/24*2-1)*width,-.063+.0012*(i/12-1)**2+.00045*(i/12-1),.003) for i in range(25)]
 tube('Ligne de bouche',pts,[.0003+.00045*sin(pi*i/24) for i in range(25)],'peau','bouche',center,n=6,color=(.61,.46,.44))
 # Monture optionnelle : elle suit la surface des tempes et du nez.
 for s in [-1,1]:
  pts=[]
  for i in range(41):
   a=2*pi*i/40;x=s*.035+math.copysign(abs(cos(a))**.5,cos(a))*.025;y=.008+math.copysign(abs(sin(a))**.6,sin(a))*.014
   pts.append(form(x,y,max(face(x,y)+.0045,face(s*.035,.007)+.014-.008*max(0,(x-s*.035)*s/.025))))
  ob=tube('Monture optique',pts,.0017,'monture',n=6);ob['option']='lunettes'
  ob=tube('Branche de lunettes',[pts[0 if s>0 else 20],form(s*.080,.012,.03),form(s*.09,.005,-.009),form(s*.089,-.005,-.025)],.0015,'monture',n=6);ob['option']='lunettes'
 ob=tube('Pont des lunettes',[form(-.01,.008,max(face(-.01,.008)+.0045,face(-.035,.007)+.014)),form(-.005,.014,face(0,.014)+.008),form(.005,.014,face(0,.014)+.008),form(.01,.008,max(face(.01,.008)+.0045,face(.035,.007)+.014))],.0015,'monture',n=6);ob['option']='lunettes'
 # Coiffure : coque ajustée, ligne de cheveux irrégulière et mèches sculptées.
 vs=[];fs=[];cols=[];n=56;nr=15
 for j in range(nr+1):
  u=j/nr
  for k in range(n):
   t=2*pi*k/n;front=max(0,cos(t));line=-.025+.094*front-.011*sin(t)*front
   if profil=='direction':line+=.015*front+.012*abs(sin(t))*front
   if profil=='chignon':line-=.006*front
   y=line+(.153-line)*sin(u*pi/2)
   rx,rf,rb=dims(min(.149,y));f=sqrt(max(0,(.156-y)/.030)) if y>.126 else 1
   if y>.126:rx=.060*f;rf=.050*f;rb=.062*f
   shift=(-.008*sin(pi*u)**2 if profil=='employe' else 0)
   ridge=(.0013 if profil=='securite' else .0026)*sin(9*t+u*5)*sin(pi*u)**2
   x=(rx+.004+ridge+abs(shift))*sin(t)+shift;z=(rf+.003+ridge if cos(t)>=0 else rb+.003+ridge)*cos(t)
   if j==nr:x=0;z=0
   vs.append(form(x,y+.0015,z));tone=.92+.08*(.5+.5*sin(9*t+u*5));cols.append((tone,tone,tone))
 for j in range(nr):
  for k in range(n):fs.append((j*n+k,(j+1)*n+k,(j+1)*n+(k+1)%n,j*n+(k+1)%n))
 mesh('Coiffure — masses peignées et raie',vs,[tuple(reversed(f)) for f in fs],'cheveux',colors=cols)
 if profil!='securite':
  scalp=vs;locks=[];quads=[];pigments=[]
  def sample(u,t):
   row=min(nr-1,int(u*nr));v=u*nr-row;col=(t%(2*pi))/(2*pi)*n;k=int(col);w=col-k
   a=Vector(scalp[row*n+k%n]).lerp(Vector(scalp[row*n+(k+1)%n]),w)
   b=Vector(scalp[(row+1)*n+k%n]).lerp(Vector(scalp[(row+1)*n+(k+1)%n]),w)
   return a.lerp(b,v)
  for lock in range(7):
   off=len(locks)
   for j in range(15):
    u=.025+.86*j/14;t=-1.26+lock*.40+.37*sin(u*pi)
    for k in range(5):
     across=k/4;point=sample(u,t+(across-.5)*.36)
     normal=Vector((point.x, max(0,point.y-.085)*1.4,point.z)).normalized()
     point+=normal*(.0003+.0030*sin(pi*across)**1.5*sin(pi*(j+.3)/14.6)**.7)
     locks.append(tuple(point));shade=.90+.10*sin(pi*across);pigments.append((shade,shade,shade))
     if j<14 and k<4:
      q=off+j*5+k;quads.append((q,q+1,q+6,q+5))
  mesh('Mèches balayées — relief et séparation',locks,quads,'cheveux',colors=pigments)

 if profil=='chignon':
  vs=[];fs=[];n=32;nr=16
  for j in range(nr+1):
   a=pi*j/nr
   for k in range(n):
    t=2*pi*k/n;r=1+.045*sin(7*t+2*a);vs.append((.043*sin(a)*cos(t)*r,.077+.043*cos(a),-.088+.041*sin(a)*sin(t)*r))
  for j in range(nr):
   for k in range(n):fs.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
  mesh('Chignon torsadé',vs,fs,'cheveux')
 for s in [-1,1]:
  tube('Patte de tempe',[form(s*.081,.035,.028),form(s*.086,.006,.008),form(s*.084,-.006,.002)],[.005,.003,.001],'cheveux',n=8)


# ---------------------------------------------------------------- têtes v02
# Peau, nez, oreilles et globes oculaires : « Head (Animation) - Realistic » du
# Human Base Meshes Bundle de Blender Studio (CC0, v1.4.1, niveau de base du multires).
# https://download.blender.org/demo/asset-bundles/human-base-meshes/
# Tout le reste (iris mobiles, paupières qui clignent, sourcils, lèvres, lunettes,
# coiffures, profils) est posé par lancer de rayon sur cette surface.
BASE_TETE={'objet':'GEO-head_animation_realistic','yeux':['GEO-head_animation_realistic.sclera.L','GEO-head_animation_realistic.sclera.R'],
 'centre':(1.4626,.7667,.050),'echelle':1.08}  # 8 % au-dessus du réel : le corps du jeu est trapu
_base_cache=None
def base_tete():
 global _base_cache
 if _base_cache:return _base_cache
 if not a.base:raise RuntimeError('--base CHEMIN_DU_BUNDLE.blend requis pour les têtes v02')
 noms=[BASE_TETE['objet']]+BASE_TETE['yeux']
 with bpy.data.libraries.load(a.base,link=False) as (src,dst):dst.objects=[x for x in src.objects if x in noms]
 # matrix_world n'est évaluée qu'une fois l'objet dans la scène
 for o in dst.objects:bpy.context.scene.collection.objects.link(o)
 bpy.context.view_layer.update()
 cx,cy,cz=BASE_TETE['centre'];S=BASE_TETE['echelle']
 def jeu(o,v):
  w=o.matrix_world@v.co;return Vector(((w.x-cx)*S,(w.z-cy)*S+.006,(-w.y-cz)*S))
 tete=next(o for o in dst.objects if o.name==BASE_TETE['objet'])
 vs=[jeu(tete,v) for v in tete.data.vertices];fs=[tuple(p.vertices) for p in tete.data.polygons]
 yeux=[]
 for o in dst.objects:
  if o.name in BASE_TETE['yeux']:
   ps=[jeu(o,v) for v in o.data.vertices];c=sum(ps,Vector())/len(ps);yeux.append((c,max((p-c).length for p in ps)))
 yeux.sort(key=lambda e:e[0].x)
 for o in dst.objects:bpy.data.objects.remove(o)
 _base_cache=(vs,fs,yeux);return _base_cache

def head_v2(profil):
 from mathutils.bvhtree import BVHTree
 base_vs,base_fs,yeux=base_tete()
 def form(x,y,z):
  jaw=exp(-((y+.080)/.048)**2)
  if profil=='direction':return (x*(1.045+.085*jaw),y,z*(1.025+.01*jaw))
  if profil=='chignon':return (x*(.97-.045*jaw),y,z*.98)
  if profil=='securite':return (x*(1.035+.055*jaw),y,z*1.02)
  return (x,y,z)
 # --- peau : coupée sous la mâchoire, puis cou « pont » jusqu'au col -----------
 # Plan incliné : plus bas devant (sous le menton) que derrière (nuque).
 COU_BAS=-.194;COU_RX=.047;COU_RZ=.045;COU_Z=-.011
 ycut=lambda z:-.105-.25*max(0.,z)
 vs=[Vector(form(v.x,v.y,v.z)) for v in base_vs]
 garde=[f for f in base_fs if all(vs[i].y>ycut(vs[i].z) for i in f)]
 utilises=sorted({i for f in garde for i in f});remap={o:n for n,o in enumerate(utilises)}
 vs=[vs[i] for i in utilises];fs=[tuple(remap[i] for i in f) for f in garde]
 # bord de coupe ordonné (boucle), prolongé par des anneaux qui rejoignent l'ellipse du col
 bm=bmesh.new()
 for p in vs:bm.verts.new(p)
 bm.verts.index_update();bm.verts.ensure_lookup_table()  # sinon index = -1
 for f in fs:
  try:bm.faces.new([bm.verts[i] for i in f])
  except ValueError:pass
 bm.edges.ensure_lookup_table()
 bord=[e for e in bm.edges if e.is_boundary]
 voisins={}
 for e in bord:
  a_,b_=e.verts[0].index,e.verts[1].index;voisins.setdefault(a_,[]).append(b_);voisins.setdefault(b_,[]).append(a_)
 # plus longue boucle (la coupe du cou)
 vus=set();boucles=[]
 for d in voisins:
  if d in vus:continue
  boucle=[d];vus.add(d);prev=None;cur=d
  while True:
   nxt=[x for x in voisins[cur] if x!=prev and x not in vus]
   if not nxt:break
   prev,cur=cur,nxt[0];boucle.append(cur);vus.add(cur)
  boucles.append(boucle)
 bm.free()
 boucle=max(boucles,key=len)
 # sens trigonométrique autour de l'axe du cou
 ang=lambda i:math.atan2(vs[i].x,vs[i].z-COU_Z)
 if sum((ang(boucle[(k+1)%len(boucle)])-ang(boucle[k])+pi)%(2*pi)-pi for k in range(len(boucle)))<0:boucle.reverse()
 NR=6;prec=boucle
 for r in range(1,NR+1):
  t=r/NR;ring=[]
  for i in boucle:
   p=vs[i];th=math.atan2(p.x,p.z-COU_Z);cible=Vector((COU_RX*sin(th),0,COU_Z+COU_RZ*cos(th)))
   w=smooth(0,.55,t);y=lerp(p.y,COU_BAS,t)
   q=Vector((lerp(p.x,cible.x,w),y,lerp(p.z,cible.z,w)));vs.append(q);ring.append(len(vs)-1)
  for k in range(len(boucle)):
   a0,a1=prec[k],prec[(k+1)%len(boucle)];b0,b1=ring[k],ring[(k+1)%len(boucle)]
   fs.append((a0,b0,b1,a1))
  prec=ring
 cols=[]
 for p in vs:
  flush=exp(-((abs(p.x)-.048)/.024)**2-((p.y+.03)/.03)**2)*(p.z>0)
  beard=(.017 if profil in ['direction','securite'] else .006)*exp(-((p.y+.085)/.03)**2)*(p.z>.02)
  cols.append((1-beard,1-.06*flush-beard,1-.07*flush-beard))
 o=mesh('Visage — base CC0 Blender Studio (Head Animation Realistic)',[tuple(p) for p in vs],fs,'peau',colors=cols)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
 bvh=BVHTree.FromPolygons([tuple(p) for p in vs],fs)
 def face(x,y):
  hit=bvh.ray_cast(Vector((x,y,.5)),Vector((0,0,-1)))
  if hit[0] is not None:return hit[0].z
  for dx in [.004,.008,.012,.02]:  # dans l'ouverture de l'œil : on s'appuie sur les bords
   hs=[bvh.ray_cast(Vector((x+sx*dx,y,.5)),Vector((0,0,-1)))[0] for sx in [-1,1]]
   hs=[h for h in hs if h is not None]
   if hs:return sum(h.z for h in hs)/len(hs)
  return 0.
 def facepoint(x,y,offset=0):return (x,y,face(x,y)+offset)
 # dimensions du crâne par lancers de rayons horizontaux, lissées (pour la coiffure)
 HAUT=max(p.y for p in vs)
 cz=(bvh.ray_cast(Vector((0,.06,.5)),Vector((0,0,-1)))[0].z+bvh.ray_cast(Vector((0,.06,-.5)),Vector((0,0,1)))[0].z)/2
 def rayon(o,d):
  h=bvh.ray_cast(Vector(o),Vector(d));return None if h[0] is None else h[0]
 brut={}
 for k in range(0,71):
  y=-.03+k*.0022
  if y>HAUT-.0015:break
  hx=rayon((.5,y,cz),(-1,0,0));hf=rayon((0,y,.5),(0,0,-1));hb=rayon((0,y,-.5),(0,0,1))
  if hx and hf and hb:brut[round(y,4)]=(abs(hx.x),hf.z,-hb.z)
 yk=sorted(brut)
 # au-dessus des sourcils, le devant est le front ; au-dessous, on garde la valeur du front (pas le nez)
 yfront=min((y for y in yk if y>.035),default=yk[-1])
 for y in yk:
  if y<.03:rx_,rf_,rb_=brut[y];brut[y]=(min(rx_,brut[yfront][0]),brut[yfront][1],rb_)
 def dims(y):
  y=min(max(y,yk[0]),yk[-1]);ks=[k for k in yk if abs(k-y)<.0045]
  return tuple(sum(brut[k][i] for k in ks)/len(ks) for i in range(3))
 # --- yeux : globes CC0, iris/pupille/reflet mobiles, paupière en coque -------
 lidvs=[];lidclosed=[];lidfs=[]
 for (c,r),s in zip(yeux,[-1,1]):
  gv=[];gf=[];n=20;rings=12
  for j in range(rings+1):
   aa=pi*j/rings
   for k in range(n):
    t=k*2*pi/n;gv.append((c.x+r*sin(aa)*cos(t),c.y+r*cos(aa),c.z+r*sin(aa)*sin(t)))
  for j in range(rings):
   for k in range(n):gf.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
  o=mesh('Globe oculaire',gv,gf,'blancOeil');bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
  x,y,z=c.x,c.y,c.z+r
  ellipsoid('Iris',(x,y,z-.0010),(.0056,.0058,.0013),'iris','regard',n=20,rings=10)
  ellipsoid('Pupille',(x,y,z-.0001),(.0024,.0028,.0006),'pupille','regard',n=14,rings=8)
  ellipsoid('Reflet humide',(x-.0017,y+.0021,z+.0003),(.0009,.0009,.0003),'reflet','regard',n=8,rings=6)
  # coque : ouverte, repliée sous la paupière haute ; fermée, elle descend devant l'œil
  R=r+.0022;start=len(lidvs);na=17;nv=6  # nettement devant l'iris (pas de scintillement)
  for i in range(na):
   al=radians(-68+136*i/(na-1))
   for j in range(nv):
    v=j/(nv-1)
    for liste,bord in [(lidvs,13),(lidclosed,-32)]:  # ouverte : recouvre le haut de l'iris (regard détendu)
     e=radians(lerp(70,bord,v));liste.append((c.x+R*sin(al)*cos(e),c.y+R*sin(e),c.z+R*cos(al)*cos(e)))
    if i<na-1 and j<nv-1:q=start+i*nv+j;lidfs.append((q,q+1,q+nv+1,q+nv))
  # sourcils, au-dessus de l'arcade de la base
  ex=c.x;ey=c.y
  brow=[facepoint(ex+s*(-.020+u*.040),ey+.021+.006*sin(pi*u)-u*.003-(.003 if profil=='direction' else 0),.0023) for u in [k/24 for k in range(25)]]
  tube('Sourcil effilé',brow,[.0006+.0016*sin(pi*k/24)**.55 for k in range(25)],'cheveux',n=6)
 o=mesh('Paupières mobiles',lidvs,lidfs,'peau','paupiere',morphs={'Clignement':lidclosed})
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
 # --- bouche : couleur des lèvres et ligne, posées sur les lèvres sculptées ---
 # la fente est le creux le plus marqué du profil entre le nez et le menton
 prof=[(y,face(0,y)) for y in [-.035-.001*k for k in range(55)]]
 fente=min(range(1,len(prof)-1),key=lambda k:prof[k][1]-(prof[k-1][1]+prof[k+1][1])/2)
 ym=prof[fente][0];width=.024 if profil!='chignon' else .022
 center=facepoint(0,ym,.0015);vs2=[];fs2=[];cols2=[]
 for j in range(7):
  v=j/6
  for i in range(33):
   u=i/32;x=(u*2-1)*width;arch=sin(pi*u)**.7
   top=ym+(.0036+.0014*exp(-((abs(x)-.006)/.004)**2))*arch;bot=ym-.0048*arch
   y=lerp(bot,top,v);vs2.append(facepoint(x,y,.0009+sin(pi*v)*.0008*arch))
   pigment=.5+.5*sin(pi*v);cols2.append((.98,.83-.10*pigment,.82-.10*pigment))
   if j<6 and i<32:q=j*33+i;fs2.append((q,q+1,q+34,q+33))
 mesh('Lèvres colorées',vs2,fs2,'peau','bouche',center,cols2)
 pts=[facepoint((i/24*2-1)*width,ym,.0018) for i in range(25)]
 tube('Ligne de bouche',pts,[.0003+.00045*sin(pi*i/24) for i in range(25)],'peau','bouche',center,n=6,color=(.61,.46,.44))
 # --- lunettes : autour des globes, branches jusqu'aux oreilles ----------------
 for (c,r),s in zip(yeux,[-1,1]):
  pts=[]
  for i in range(41):
   aa=2*pi*i/40;x=c.x+math.copysign(abs(cos(aa))**.5,cos(aa))*.025;y=c.y+.002+math.copysign(abs(sin(aa))**.6,sin(aa))*.014
   pts.append((x,y,max(face(x,y)+.0045,c.z+r+.010-.008*max(0,(x-c.x)*s/.025))))
  rx=dims(c.y)[0]
  ob=tube('Monture optique',pts,.0017,'monture',n=6);ob['option']='lunettes'
  ob=tube('Branche de lunettes',[pts[0 if s>0 else 20],(s*(rx-.004),c.y+.006,c.z-.02),(s*(rx+.002),c.y,-.02),(s*(rx+.001),c.y-.01,-.04)],.0015,'monture',n=6);ob['option']='lunettes'
 (cL,rL),(cR,rR)=yeux
 zp=lambda x,y:face(x,y)+.008
 ob=tube('Pont des lunettes',[(cL.x+.025,cL.y+.002,max(face(cL.x+.025,cL.y)+.0045,cL.z+rL+.004)),(-.005,cL.y+.008,zp(-.005,cL.y+.008)),(.005,cL.y+.008,zp(.005,cL.y+.008)),(cR.x-.025,cR.y+.002,max(face(cR.x-.025,cR.y)+.0045,cR.z+rR+.004))],.0015,'monture',n=6);ob['option']='lunettes'
 # --- coiffure : même dessin qu'en v01, recalé sur le crâne de la base ---------
 H=HAUT+.016;cvs=[];cfs=[];ccols=[];n=56;nr=15
 for j in range(nr+1):
  u=j/nr
  for k in range(n):
   t=2*pi*k/n;front=max(0,cos(t));side=abs(sin(t))*(1-front)
   # au-dessus de l'oreille sur les côtés, plus bas sur la nuque
   line=-.030+.094*front-.011*sin(t)*front+.020*side*(cos(t)>-.3)
   if profil=='direction':line+=.015*front+.012*abs(sin(t))*front
   if profil=='chignon':line-=.006*front
   y=line+(H-line)*sin(u*pi/2)
   # calotte : au-dessus de y0, section circulaire qui se referme en dôme (pas en oignon)
   y0=H-.042
   if y>y0:
    rx,rf,rb=dims(y0);f=sqrt(max(0,1-((y-y0)/(H-y0))**2))
    rx*=f;rf=cz+(rf-cz)*f;rb=-cz+(rb+cz)*f
   else:rx,rf,rb=dims(y)
   shift=(-.008*sin(pi*u)**2 if profil=='employe' else 0)*(1-smooth(y0-.02,H,y))
   ridge=(.0013 if profil=='securite' else .0026)*sin(9*t+u*5)*sin(pi*u)**2*(1-smooth(y0-.03,y0+.02,y))
   x=(rx+.0065+ridge+abs(shift))*sin(t)+shift;z=cz+((rf-cz)+.0045+ridge if cos(t)>=0 else (rb+cz)+.0115+ridge)*cos(t)
   if j==nr:x=0;z=cz
   cvs.append((x,y+.0015,z));tone=.92+.08*(.5+.5*sin(9*t+u*5));ccols.append((tone,tone,tone))
 for j in range(nr):
  for k in range(n):cfs.append((j*n+k,(j+1)*n+k,(j+1)*n+(k+1)%n,j*n+(k+1)%n))
 mesh('Coiffure — masses peignées et raie',cvs,[tuple(reversed(f)) for f in cfs],'cheveux',colors=ccols)
 if profil!='securite':
  scalp=cvs;locks=[];quads=[];pigments=[]
  def sample(u,t):
   row=min(nr-1,int(u*nr));v=u*nr-row;col=(t%(2*pi))/(2*pi)*n;k=int(col);w=col-k
   a_=Vector(scalp[row*n+k%n]).lerp(Vector(scalp[row*n+(k+1)%n]),w)
   b_=Vector(scalp[(row+1)*n+k%n]).lerp(Vector(scalp[(row+1)*n+(k+1)%n]),w)
   return a_.lerp(b_,v)
  for lock in range(7):
   off=len(locks)
   for j in range(15):
    u=.025+.86*j/14;t=-1.26+lock*.40+.37*sin(u*pi)
    for k in range(5):
     across=k/4;point=sample(u,t+(across-.5)*.36)
     normal=Vector((point.x,max(0,point.y-(HAUT-.05))*1.4,point.z)).normalized()
     point+=normal*(.0003+.0030*sin(pi*across)**1.5*sin(pi*(j+.3)/14.6)**.7)
     locks.append(tuple(point));shade=.90+.10*sin(pi*across);pigments.append((shade,shade,shade))
     if j<14 and k<4:
      q=off+j*5+k;quads.append((q,q+1,q+6,q+5))
  mesh('Mèches balayées — relief et séparation',locks,quads,'cheveux',colors=pigments)
 if profil=='chignon':
  bvs=[];bfs=[];n=32;nr=16;rb=dims(HAUT-.06)[2];bc=(0,HAUT-.058,-rb-.006)
  for j in range(nr+1):
   aa=pi*j/nr
   for k in range(n):
    t=2*pi*k/n;r=1+.045*sin(7*t+2*aa);bvs.append((bc[0]+.043*sin(aa)*cos(t)*r,bc[1]+.043*cos(aa),bc[2]+.041*sin(aa)*sin(t)*r))
  for j in range(nr):
   for k in range(n):bfs.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
  mesh('Chignon torsadé',bvs,bfs,'cheveux')
 for s in [-1,1]:
  def tempe(y,z):
   h=bvh.ray_cast(Vector((s*.5,y,z)),Vector((-s,0,0)))[0];return (h.x+s*.0018,y,z) if h else (s*dims(y)[0],y,z)
  tube('Patte de tempe',[tempe(.032,.030),tempe(.014,.030),tempe(-.004,.028)],[.004,.0028,.0008],'cheveux',n=8)


def hands():
 for side in [-1,1]:
  suffix='L' if side<0 else 'R';control='main'+suffix
  # Le poignet se resserre, la paume s'élargit, puis les jointures se dessinent.
  rows=[(.070,.032,.029,0),(.037,.023,.019,0),(.018,.020,.017,0),(.007,.021,.016,0),(-.008,.026,.017,0),(-.030,.034,.021,.002),(-.051,.033,.018,.002),(-.065,.029,.014,.001),(-.070,.026,.010,.001)]
  vs=[];fs=[];n=24
  for y,w,d,z in rows:
   for k in range(n):
    t=2*pi*k/n;thenar=.006*exp(-((y+.033)/.022)**2)*max(0,-sin(t))*max(0,cos(t));vs.append((side*w*sin(t),y,z+d*cos(t)+thenar))
  for j in range(len(rows)-1):
   for k in range(n):
    f=(j*n+k,(j+1)*n+k,(j+1)*n+(k+1)%n,j*n+(k+1)%n);fs.append(f if side<0 else tuple(reversed(f)))
  fs.extend([tuple(range(n)),tuple(reversed([(len(rows)-1)*n+k for k in range(n)]))])
  o=mesh('Paume et poignet '+suffix,vs,fs,'peau',control)
  # Recalcul pour les deux paumes fermées, dont une est miroir.
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
  # Les doigts sont des volumes continus : trois phalanges, pulpe et ongle.
  vertices={k:[] for k in ['Basis','Poing','Index','Ouvert']};faces=[];colors=[]
  lengths=[.064,.073,.068,.053];widths=[.0078,.0084,.0080,.0066]
  for finger,(length,radius) in enumerate(zip(lengths,widths)):
   x=side*(-.024+finger*.016);basey=-.056-(.002 if finger==0 else .001 if finger==3 else 0);basez=.001
   n=12;nr=16;offset=len(vertices['Basis'])
   def point(t,a,pose):
    curl=[.13,.30,.46][min(2,int(t*3))]
    if pose=='Ouvert':curl=.015
    if pose=='Poing' or (pose=='Index' and finger>0):curl=.20+1.9*t
    if pose=='Index' and finger==0:curl=.015
    # Intégration de la ligne centrale pour ne pas raccourcir la phalange pliée.
    y,z=basey,basez
    for j in range(24):
     u=t*(j+.5)/24
     ang=(.20+1.9*u) if pose=='Poing' or (pose=='Index' and finger>0) else .015 if pose in ['Ouvert','Index'] else .10+.48*u
     y-=length*t/24*cos(ang);z+=length*t/24*sin(ang)
    tip=sqrt(max(.001,1-((max(0,t-.84))/.16)**2))
    rr=radius*(.94-.22*t)*tip
    knuckle=1+.08*exp(-((t-.42)/.07)**2)+.07*exp(-((t-.72)/.06)**2);rr*=knuckle
    spread=side*(finger-1.5)*(.002 if pose!='Ouvert' else .006)*t
    # Dorsale -Z : ongles, face palmaire +Z : pulpe.
    return (x+spread+rr*sin(a),y+rr*.88*sin(curl)*cos(a),z+rr*.88*cos(curl)*cos(a))
   for pose in vertices:
    for j in range(nr+1):
     for k in range(n):vertices[pose].append(point(j/nr,k*2*pi/n,pose))
   for j in range(nr):
    for k in range(n):faces.append((offset+j*n+k,offset+(j+1)*n+k,offset+(j+1)*n+(k+1)%n,offset+j*n+(k+1)%n))
   colors.extend([(1,1,1)]*((nr+1)*n))
   # Ongle discret, posé sur la dernière phalange, suit les mêmes morphs.
   offset=len(vertices['Basis'])
   for pose in vertices:
    for j in range(5):
     t=.72+j*.047
     for k in range(7):
      aa=pi+(k/6-.5)*1.65;p=point(t,aa,pose);vertices[pose].append((p[0],p[1],p[2]-.00045))
   colors.extend([(1,.98,.96)]*35)
   for j in range(4):
    for k in range(6):q=offset+j*7+k;faces.append((q,q+7,q+8,q+1))
  mesh('Doigts articulés '+suffix,vertices['Basis'],faces,'peau','doigts'+suffix,(0,-.056,0),colors,{k:v for k,v in vertices.items() if k!='Basis'})
  # Pouce opposable : éminence thénar et deux phalanges, pivot à sa base.
  origin=(-side*.024,-.028,.006)
  pts=[(-side*.026,-.025,.009),(-side*.036,-.036,.016),(-side*.043,-.052,.019),(-side*.042,-.066,.022)]
  tube('Pouce opposable '+suffix,pts,[.011,.010,.008,.0055],'peau','pouce'+suffix,origin,n=12)
  ellipsoid('Ongle pouce '+suffix,(-side*.042,-.062,.016),(.005,.007,.001),'peau','pouce'+suffix,origin,n=12,rings=8,color=(1,.98,.96))


# ---------------------------------------------------------------- mains v02
# Correctif : en v01, la main « L » avait le pouce côté ventre (paume vers l'avant, pouce
# vers l'intérieur : impossible anatomiquement), c.-à-d. les deux mains étaient inversées.
# Ici `s` = côté du monde (L = -1 → -X). Le pouce est LATÉRAL (x = s·…) quand la paume
# regarde +Z, et l'index est à côté du pouce. Axes conservés : doigts vers -Y, paume +Z,
# pivots main (poignet), doigts (0,-.056,0), pouce (base du pouce) — les emotes restent valides.
def smooth(e0,e1,x):
 t=clamp((x-e0)/(e1-e0));return t*t*(3-2*t)

def solide(name,anneaux,mat,control,origin=(0,0,0),colors=None,morphs=None):
 """Loft fermé : anneaux[pose] = liste d'anneaux (listes de points). Normales recalculées."""
 base=anneaux['Basis'];n=len(base[0]);vs=[p for r in base for p in r];fs=[]
 for j in range(len(base)-1):
  for k in range(n):fs.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
 fs.append(tuple(reversed(range(n))));fs.append(tuple((len(base)-1)*n+k for k in range(n)))
 m={k:[p for r in v for p in r] for k,v in anneaux.items() if k!='Basis'} if morphs is None else morphs
 o=mesh(name,vs,fs,mat,control,origin,colors,m or None)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
 return o

def doigt_centre(base,phi,angles,longueurs,u,s):
 """Ligne centrale d'un doigt : direction initiale dans le plan de la paume (écart phi),
 flexion progressive vers la paume (+Z) aux trois articulations, lissée sur quelques mm."""
 D0=Vector((sin(phi),-cos(phi),0));N=Vector((0,0,1));L=D0.cross(N).normalized()
 j1,j2=longueurs[0],longueurs[0]+longueurs[1]
 def theta(x):return angles[0]*smooth(-.004,.008,x)+angles[1]*smooth(j1-.004,j1+.005,x)+angles[2]*smooth(j2-.003,j2+.004,x)
 c=Vector(base);steps=max(1,int(u/.0015));du=u/steps if steps else 0
 for i in range(steps):
  th=theta((i+.5)*du);c+=(D0*cos(th)+N*sin(th))*du
 th=theta(u);D=D0*cos(th)+N*sin(th);Np=N*cos(th)-D0*sin(th)
 return c,D,Np,L

def hands_v2():
 POSES=['Basis','Poing','Index','Ouvert','Pouce']  # Pouce : poing fermé, pouce levé
 for s in [-1,1]:
  suffix='L' if s<0 else 'R'
  # --- paume et poignet -----------------------------------------------------
  ys=[.070,.052,.034,.018,.006,-.004,-.014,-.024,-.034,-.044,-.052,-.058,-.062,-.0655,-.0685,-.0705]
  def section(y):
   w=lerp(.026,.023,smooth(.07,.015,y));d=lerp(.020,.0165,smooth(.07,.015,y))
   w=lerp(w,.031,smooth(.004,-.02,y));w=lerp(w,.0365,smooth(-.02,-.05,y));w=lerp(w,.0345,smooth(-.054,-.062,y))
   d=lerp(d,.0185,smooth(.004,-.02,y));d=lerp(d,.0145,smooth(-.03,-.062,y))
   # bas de paume arrondi sous les jointures (plus de marche entre les doigts)
   f=smooth(-.062,-.0705,y);w*=1-.30*f;d*=1-.55*f;return w,d
  fx=[s*.0235,s*.008,-s*.0075,-s*.0215];fy=[-.0605,-.0635,-.0615,-.0565]
  n=24;rings=[];cols=[]
  for y in ys:
   w,d=section(y);ring=[]
   for k in range(n):
    t=2*pi*k/n;sx=sin(t);cz=cos(t)
    x=w*math.copysign(abs(sx)**.8,sx);z=d*math.copysign(abs(cz)**.9,cz)
    if cz>0:  # face palmaire : creux central, éminences thénar (pouce) et hypothénar
     paume=smooth(-.008,-.02,y)*smooth(-.058,-.045,y)
     z-=.0045*paume*exp(-(x/.013)**2)*cz
     z+=.0065*exp(-((x-s*.019)/.011)**2)*exp(-((y+.02)/.013)**2)*cz
     z+=.0035*exp(-((x+s*.026)/.009)**2)*exp(-((y+.034)/.018)**2)*cz
    else:     # dos : jointures en relief au bord de la paume
     z-=.0022*sum(exp(-((x-f)/.0055)**2) for f in fx)*smooth(-.05,-.06,y)*(-cz)
    yy=y-.0055*(1-(x/max(w,1e-4))**2)*smooth(-.05,-.062,y)  # arc des jointures
    ring.append((x,yy,z))
    rougeur=.06*smooth(-.052,-.062,y)*(cz<0)
    cols.append((1-rougeur*.3,1-rougeur,1-rougeur*1.1) if cz<0 else (1,.985,.97))
   rings.append(ring)
  solide('Paume et poignet '+suffix,{'Basis':rings},'peau','main'+suffix,colors=cols,morphs={})
  # --- doigts ---------------------------------------------------------------
  L_doigts=[.068,.077,.072,.057];R_doigts=[.0081,.0087,.0082,.0069];ratios=[.45,.31,.24]
  ecart=[.07,.015,-.045,-.12]  # vers le pouce > 0 (multiplié par s)
  flex={'Basis':[[.16,.30,.14],[.22,.36,.18],[.30,.42,.22],[.38,.50,.26]],
        'Poing':[[1.30,1.95,1.05]]*4,
        'Index':[[.04,.05,.03]]+[[1.30,1.95,1.05]]*3,
        'Ouvert':[[-.04,.03,.02]]*4,
        'Pouce':[[1.30,1.95,1.05]]*4}
  anneaux={p:[] for p in POSES};couleurs=[];ongles={p:[] for p in POSES};ongle_col=[]
  nr=18;nc=10
  for f in range(4):
   # base enfoncée de 9 mm dans la paume : pas d'encoche entre paume et doigts
   lon=L_doigts[f]+.009;seg=[.009+L_doigts[f]*ratios[0],L_doigts[f]*ratios[1],L_doigts[f]*ratios[2]];base=(fx[f],fy[f]+.013,-.0015)
   for pose in POSES:
    phi=s*ecart[f]*(2.2 if pose=='Ouvert' else 0.25 if pose in ['Poing','Pouce'] or (pose=='Index' and f>0) else 1)
    ang=flex[pose][f]
    for j in range(nr+1):
     u=lon*min(j,nr-4)/(nr-4)  # 4 derniers anneaux : calotte arrondie du bout
     c,D,Np,Lx=doigt_centre(base,phi,ang,seg,u,s)
     r=R_doigts[f]*(1-.17*u/lon)*(1+.07*exp(-((u-seg[0])/.005)**2)+.05*exp(-((u-seg[0]-seg[1])/.004)**2))
     if j>nr-4:
      v=(j-(nr-4))/4;c=c+D*r*.92*sin(v*pi/2);r*=max(.08,cos(v*pi/2))
     ring=[]
     for k in range(nc):
      a=2*pi*k/nc;ring.append(tuple(c+Lx*(r*sin(a))+Np*(r*.86*cos(a))))
     anneaux[pose].append(ring)
     if pose=='Basis':
      for k in range(nc):
       a=2*pi*k/nc;bout=smooth(.8,1,u/lon)*(cos(a)<0)
       couleurs.append((1,.93-.03*bout,.9-.04*bout) if cos(a)<0 and abs(u-seg[0])<.006 else (1,1-.06*bout,1-.08*bout))
    # ongle : pastille sur le dos de la phalange distale
    for j in range(5):
     u=lon*(.74+.045*j);c,D,Np,Lx=doigt_centre(base,phi,ang,seg,u,s);r=R_doigts[f]*(1-.17*u/lon)
     for k in range(7):
      a=pi+(k/6-.5)*1.7;ongles[pose].append(tuple(c+Lx*(r*.98*sin(a))+Np*(r*.86*cos(a)-.00055)))
   ongle_col+=[(1,.97,.95)]*35
  # un seul maillage « doigts » : quatre lofts + ongles, mêmes sommets dans toutes les poses
  vs=[];fs=[];morph={p:[] for p in POSES if p!='Basis'}
  anneau_par_doigt=nr+1
  for f in range(4):
   off=len(vs)
   for j in range(anneau_par_doigt):vs+=anneaux['Basis'][f*anneau_par_doigt+j]
   for pose in morph:
    for j in range(anneau_par_doigt):morph[pose]+=anneaux[pose][f*anneau_par_doigt+j]
   for j in range(nr):
    for k in range(nc):fs.append((off+j*nc+k,off+j*nc+(k+1)%nc,off+(j+1)*nc+(k+1)%nc,off+(j+1)*nc+k))
   fs.append(tuple(off+k for k in reversed(range(nc))));fs.append(tuple(off+nr*nc+k for k in range(nc)))
  for f in range(4):
   off=len(vs);vs+=ongles['Basis'][f*35:(f+1)*35]
   for pose in morph:morph[pose]+=ongles[pose][f*35:(f+1)*35]
   for j in range(4):
    for k in range(6):q=off+j*7+k;fs.append((q,q+7,q+8,q+1))
  o=mesh('Doigts articulés '+suffix,vs,fs,'peau','doigts'+suffix,(0,-.056,0),couleurs+ongle_col,morph)
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
  # --- pouce : trois segments, coussinet tourné vers les doigts ----------------
  O=(s*.019,-.012,.008);lon=.070;seg=[.028,.023,.019]
  D0=Vector((s*.40,-.80,.42)).normalized()
  pad=(Vector((-s*.55,-.05,.83))-D0*Vector((-s*.55,-.05,.83)).dot(D0)).normalized()
  poses_pouce={'Basis':(0,[.10,.22,.18]),'Poing':('replie',[0,.75,.55]),'Index':('leve',[0,.05,.05]),'Ouvert':(.30,[-.02,.04,.04]),'Pouce':('leve',[0,.02,.02])}
  anneaux_p={p:[] for p in POSES};ong_p={p:[] for p in POSES};col_p=[]
  for pose,(abd,ang) in poses_pouce.items():
   # abduction : le pouce s'écarte (abd > 0) ou passe devant les doigts (abd < 0) autour de l'axe Y du poignet
   if abd=='leve':  # pouce levé : tendu sur le côté radial du poing, perpendiculaire à l'avant-bras
    D=Vector((s*.92,.05,.38)).normalized();P=(Vector((0,0,1))-D*D.z).normalized()
   elif abd=='replie':  # poing : le pouce descend devant la paume puis se couche en travers de l'index et du majeur
    D=Vector((-s*.25,-.80,.55)).normalized();m=Vector((-s,0,0));P=(m-D*m.dot(D)).normalized()
   else:
    qa=Quaternion(Vector((0,1,0)),-s*abd*.9)@Quaternion(Vector((0,0,1)),s*abd*.5);D=qa@D0;P=qa@pad
   Lt=D.cross(P).normalized()
   j1,j2=seg[0],seg[0]+seg[1]
   def th(x):return ang[0]*smooth(-.004,.01,x)+ang[1]*smooth(j1-.004,j1+.005,x)+ang[2]*smooth(j2-.003,j2+.004,x)
   def centre(u):
    c=Vector(O);st=max(1,int(u/.0015))
    for i in range(st):
     t=th((i+.5)*u/st);c+=(D*cos(t)+P*sin(t))*(u/st)
    t=th(u);return c,D*cos(t)+P*sin(t),P*cos(t)-D*sin(t)
   nr_p=16
   for j in range(nr_p+1):
    u=lon*min(j,nr_p-4)/(nr_p-4);c,Dd,Pd=centre(u)
    r=lerp(.0105,.0079,u/lon)*(1+.06*exp(-((u-j1)/.005)**2))
    if j>nr_p-4:
     v=(j-(nr_p-4))/4;c=c+Dd*r*.9*sin(v*pi/2);r*=max(.08,cos(v*pi/2))
    ring=[tuple(c+Lt*(r*sin(2*pi*k/10))+Pd*(r*.88*cos(2*pi*k/10))) for k in range(10)]
    anneaux_p[pose].append(ring)
    if pose=='Basis':col_p+=[(1,.985,.97) if cos(2*pi*k/10)>0 else (1,.96,.94) for k in range(10)]
   for j in range(5):
    u=lon*(.76+.042*j);c,Dd,Pd=centre(u);r=lerp(.0105,.0079,u/lon)
    for k in range(7):
     a=pi+(k/6-.5)*1.6;ong_p[pose].append(tuple(c+Lt*(r*.98*sin(a))+Pd*(r*.88*cos(a)-.00055)))
  vs=[p for r in anneaux_p['Basis'] for p in r];fs=[]
  for j in range(nr_p):
   for k in range(10):fs.append((j*10+k,j*10+(k+1)%10,(j+1)*10+(k+1)%10,(j+1)*10+k))
  fs.append(tuple(reversed(range(10))));fs.append(tuple(nr_p*10+k for k in range(10)))
  off=len(vs);vs+=ong_p['Basis']
  for j in range(4):
   for k in range(6):q=off+j*7+k;fs.append((q,q+7,q+8,q+1))
  morph={p:[pt for r in anneaux_p[p] for pt in r]+ong_p[p] for p in POSES if p!='Basis'}
  o=mesh('Pouce opposable '+suffix,vs,fs,'peau','pouce'+suffix,O,col_p+[(1,.97,.95)]*35,morph)
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()


def export(name,fn):
 setup();fn();bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.export_scene.gltf(filepath=str(out/(name+'-'+a.version+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_animations=False,export_morph=True,export_cameras=False,export_lights=False,export_vertex_color='NAME',export_vertex_color_name='Pigment',export_all_vertex_colors=False)
 triangles=0
 for o in objects:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
 report={'nom':name,'blender':bpy.app.version_string,'triangles':triangles,'piecesEditables':len(objects),'controles':sorted({o['controle'] for o in objects}),'morphs':sorted({k.name for o in objects if o.data.shape_keys for k in o.data.shape_keys.key_blocks if k.name!='Basis'})}
 # Studio de sculpture. Pour les mains, décaler les deux côtés après export.
 if name=='mains':
  for o in objects:
   o['decalageStudio']=-.09 if o['controle'].endswith('L') else .09;o.location.x+=o['decalageStudio']
 scene=bpy.context.scene;scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.25,.25,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
 for name_light,pos,power in [('Lumière',(-1,-2,2),100),('Contour',(1,1,1),90),('Remplissage',(1,-2,.5),35)]:
  d=bpy.data.lights.new(name_light,'AREA');d.energy=power;d.size=1.5;o=bpy.data.objects.new(name_light,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
 d=bpy.data.cameras.new('Portrait');o=bpy.data.objects.new('Portrait',d);scene.collection.objects.link(o);o.location=(.34,-.8,.10);o.rotation_euler=(Vector((0,0,-.015))-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=.42 if name!='mains' else .36;scene.camera=o
 scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=800;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=92;scene.render.filepath=str(out/(name+'.jpg'))
 bpy.ops.wm.save_as_mainfile(filepath=str(out/(name+'-'+a.version+'.blend')));bpy.ops.render.render(write_still=True)
 return report

jobs=[('tete-'+p,lambda p=p:(head_v2 if a.version>='v02' else head)(p)) for p in ['employe','direction','chignon','securite']]+[('mains',hands_v2 if a.version>='v02' else hands)]
report=[export(n,f) for n,f in jobs if not a.only or n==a.only]
(out/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(report,ensure_ascii=False))

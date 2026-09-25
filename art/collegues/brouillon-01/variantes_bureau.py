"""Directions des trois premiers collègues Blender. Appliquées avant fusion/export.
Les variantes changent la géométrie et les vêtements, jamais les os du contrat.
"""
import math
from math import sin, cos, pi, sqrt

PROFILS={
 'directeur': {'nom':'Directeur Wang','role':'le boss','palette':{'skin':'E6B288','jacket':'2B3140','shirt':'E8EEF4','trousers':'22262E','hair':'2A2320','red':'6E2B33'},'description':'Costume ample, taille large, mâchoire affirmée, tempes grisonnantes, cheveux peignés en arrière.'},
 'zhang': {'nom':'Zhang Jie','role':'chef d’équipe','palette':{'skin':'E9B58E','jacket':'5E4B5A','shirt':'E3DCC6','trousers':'5F4757','hair':'1D1512','red':'925F76'},'description':'Blazer prune cintré, visage plus fin, chignon et mèches aux tempes, sans lunettes ni cravate.'},
 'liu': {'nom':'Lao Liu','role':'sécurité','palette':{'skin':'DDA878','jacket':'3F4550','shirt':'C3CCD4','trousers':'454951','hair':'34302C','red':'75827D'},'description':'Carrure solide, veste de sécurité zippée, poches, insigne et radio, coiffure courte.'},
}

def appliquer(profil,g):
 import bpy
 from mathutils import Vector
 cfg=PROFILS[profil]
 objects=g['objects'];mesh=g['mesh'];rings=g['rings'];stroke=g['stroke'];oval=g['oval'];patch=g['patch'];torse=g['torse_patch']
 skin=g['skin'];jacket=g['jacket'];shirt=g['shirt'];hair=g['hair'];dark=g['dark'];trim=g['trim'];red=g['red']
 for name,color in cfg['palette'].items():
  m=g[name];rgba=tuple(g['lin'](int(color[i:i+2],16)/255) for i in (0,2,4))+(1,)
  m.diffuse_color=rgba;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=rgba
 def retirer(prefixes):
  for o in objects[:]:
   if o.name.startswith(tuple(prefixes)):
    objects.remove(o);bpy.data.objects.remove(o,do_unlink=True)
 retirer(['Sac toile','Poche du sac','Zip sac','Poignée sac','Bretelle ajustée','Étiquette du sac','Coiffure balayée'])
 g['strap_report']=[]
 if profil=='zhang':
  retirer(['Monture','Branche lunette','Pont lunettes','Cravate','Nœud cravate'])
 if profil=='liu':
  retirer(['Revers cranté','Cravate','Nœud cravate','Plastron chemise','Pointe col','Porte badge','Carte badge','Poche passepoilée'])

 # Coiffures propres à chaque rôle. La coque est ajustée au crâne existant ;
 # les changements de morphologie qui suivent s'appliquent aux deux ensemble.
 vs=[];fs=[];n=40;nr=11
 for r in range(nr+1):
  u=r/nr
  for k in range(n):
   t=2*pi*k/n;front=max(0,cos(t))
   if profil=='directeur':
    bottom=1.612+.12*front+.018*abs(sin(t))*front
    top=1.797;wave=.0014*sin(8*t+5*u)*sin(pi*u)**2
   elif profil=='zhang':
    bottom=1.604+.098*front-.005*sin(t)*front
    top=1.797;wave=.0015*cos(9*t-3*u)*sin(pi*u)**2
   else:
    bottom=1.615+.091*front
    top=1.79;wave=.001*sin(12*t)*sin(pi*u)**2
   y=bottom+(top-bottom)*sin(u*pi/2)
   rx,rf,rb=g['dims'](min(y,1.776))
   if y>1.755:
    f=sqrt(max(0,(top-y)/(top-1.755)))
    rx=.098*f;rf=.082*f;rb=.094*f
   x=(rx+.009+wave)*sin(t);z=(rf+.009+wave)*cos(t) if cos(t)>=0 else (rb+.009+wave)*cos(t)
   if r==nr:x=0;z=0
   vs.append((x,y,z))
 for r in range(nr):
  for k in range(n):fs.append((r*n+k,r*n+(k+1)%n,(r+1)*n+(k+1)%n,(r+1)*n+k))
 mesh('Coiffure '+profil,vs,fs,hair,'tete',1)
 if profil=='zhang':
  bun=oval('Chignon tressé',(0,1.718,-.115),(.060,.062,.060),hair,'tete',32,16)
  # Mèches structurantes sculptées dans le volume du chignon, pas une boule lisse.
  for v in bun.data.vertices:
   x,y,z=v.co.x,v.co.z,-v.co.y
   t=math.atan2(y-1.718,x)
   radial=1+.035*sin(9*t+10*(z+.115))
   v.co.x=x*radial;v.co.z=1.718+(y-1.718)*radial
  for sign in (-1,1):
   stroke('Mèche de tempe',[(sign*.086,1.71,.064),(sign*.105,1.68,.038),(sign*.113,1.635,.004)],.004,hair,'tete',8)
  # Petit fermoir de veste, une forme lisible sans accessoire tenu en main.
  oval('Bouton blazer',(0,1.12,.127),(.005,.005,.002),trim,'buste',12,6)
 elif profil=='directeur':
  grey=g['mat']('13 Tempes argentées','77706A',.92);g['materials'].append(grey)
  for sign in (-1,1):
   # Petites mèches intégrées aux tempes ; mêmes formes que la coiffure sous-jacente.
   for k in range(4):
    t=(pi/2-.11)+k*.07;points=[]
    for y in [1.644,1.658,1.674]:
     rx,rf,rb=g['dims'](y);points.append((sign*(rx+.0095)*sin(t),y,(rf if cos(t)>0 else rb)*cos(t)))
    stroke('Mèche grise',points,.0018,grey,'tete',5)
  for y in [1.155,1.065]:
   oval('Bouton costume',(.031,y,g['thoraxz'](.031,y)+.014),(.0055,.0055,.0025),trim,'buste',12,6)
  torse('Pochette pliée',[(.062,1.35,.1),(.079,1.367,.1),(.088,1.352,.1),(.105,1.363,.1),(.11,1.337,.1),(.062,1.328,.1)],shirt,.016)
 else:
  # Fermeture, rabats, insigne et radio : détails propres à un agent de sécurité.
  stroke('Fermeture veste',[(0,y,g['thoraxz'](0,y)+.005) for y in [1.44,1.4,1.35,1.28,1.2,1.1,.99,.925]],.0018,dark,'buste',6)
  for sign in (-1,1):
   torse('Rabat uniforme',[(sign*.047,1.326,.1),(sign*.12,1.326,.1),(sign*.116,1.303,.1),(sign*.052,1.298,.1)],jacket,.012)
   oval('Pression poche',(sign*.081,1.308,g['thoraxz'](sign*.081,1.308)+.015),(.003,.003,.0018),trim,'buste',10,6)
  torse('Insigne sécurité',[(.06,1.395,.1),(.098,1.395,.1),(.096,1.365,.1),(.079,1.353,.1),(.062,1.365,.1)],trim,.008)
  # Radio compacte à la poitrine : poids buste, pas de mécanique ou de son ajouté.
  rings('Radio',[(1.19,-.095,.137,.024,.011,.01,.4),(1.196,-.095,.137,.026,.013,.013,.4),(1.27,-.095,.137,.026,.013,.013,.4),(1.278,-.095,.137,.021,.01,.009,.4)],12,dark,'buste',1)
  stroke('Antenne radio',[(-.107,1.274,.137),(-.107,1.34,.137)],.0024,dark,'buste',6)
  for y in [1.22,1.23,1.24]:stroke('Grille radio',[(-.111,y,.151),(-.08,y,.151)],.0012,trim,'buste',5)

 # Morphologie : os conservés, échelle du groupe inchangée. La hauteur des yeux,
 # la semelle et les pivots métier restent ceux du contrat.
 def morph(x,y,z,is_head):
  if is_head:
   if profil=='directeur':
    jaw=g['smooth']((1.635-y)/.10)
    return x*(1.075+.095*jaw),1.637+(y-1.637)*1.035,z*1.04+.004*jaw
   if profil=='zhang':
    jaw=g['smooth']((1.63-y)/.11)
    return x*(.95-.055*jaw),1.637+(y-1.637)*.96,z*.96
   jaw=g['smooth']((1.63-y)/.1)
   return x*(1.08+.05*jaw),1.637+(y-1.637)*.97,z*1.04
  upper=g['smooth']((y-.80)/.35);waist=math.exp(-((y-1.03)/.19)**2)
  if profil=='directeur':sx=1+.13*upper+.12*waist;sz=1+.10*upper+.16*waist
  elif profil=='zhang':sx=1-.065*upper-.055*waist;sz=1-.05*upper-.05*waist
  else:sx=1+.16*upper+.03*waist;sz=1+.14*upper
  # Ne pas écarter les souliers ni modifier les hauteurs de perception.
  return x*sx,y,z*sz
 for o in objects:
  groups={vg.name for vg in o.vertex_groups}
  head=bool(groups) and groups.issubset({'tete','teteBase'})
  for v in o.data.vertices:
   x,y,z=morph(v.co.x,v.co.z,-v.co.y,head)
   if o.name.startswith('Sourcil'):
    if profil=='directeur':y-=.0035+max(0,.06-abs(x))*.03
    elif profil=='liu':y-=.002
   if profil in ('directeur','liu') and o.name.startswith(('Sourire discret','Lèvre inférieure')):
    # Ligne de bouche plus horizontale, sans figer une grimace agressive.
    y=1.565+(y-1.565)*.35
   if profil=='liu' and o.name.startswith('Monture'):y=1.637+(y-1.637)*.85
   v.co=(x,-z,y)
  o.data.update()
 return cfg

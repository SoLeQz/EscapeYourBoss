"""Complément du mobilier existant : dix rangements et dix dessus de poste.
Dimensions identiques aux casiers / plateaux du jeu. Export au contrat ACC_*.
Blender --background --factory-startup --python creer_departements.py -- --out DOSSIER
"""
import bpy, bmesh, math, json, sys, argparse
from pathlib import Path
from mathutils import Vector, Matrix
p=argparse.ArgumentParser();p.add_argument('--out',required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out)
if out.exists():raise RuntimeError('La sortie existe déjà : '+str(out))
out.mkdir(parents=True);bpy.ops.wm.read_factory_settings(use_empty=True)
M={};parts=[];ident='';s=bpy.context.scene
COLORS={'bois':0xb39871,'boisFonce':0x6b4b33,'aluSombre':0x434d49,'alu':0xb9bec0,'plastiqueNoir':0x1b1d21,'papier':0xf3efe4,'laiton':0xc9ac69,'murAccent':0x355769,'verre':0x9fbec6}
def linear(h):
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in [((h>>i)&255)/255 for i in [16,8,0]])
def mat(key):
 if key in M:return M[key]
 m=bpy.data.materials.new('ACC_'+key);m.use_nodes=True;n=m.node_tree;bs=n.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=.65
 if key in ['peint','lumiere']:
  vc=n.nodes.new('ShaderNodeVertexColor');vc.layer_name='Couleur';n.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
  if key=='lumiere':n.links.new(vc.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=.6
 else:bs.inputs['Base Color'].default_value=(*linear(COLORS[key]),1)
 M[key]=m;return m

def finish(bm,name,pos,material,color=0,bevel=0):
 me=bpy.data.meshes.new(name);bm.to_mesh(me);bm.free();o=bpy.data.objects.new(name,me);s.collection.objects.link(o);o['acc_id']=ident
 bpy.context.view_layer.objects.active=o
 if bevel:
  b=o.modifiers.new('Arêtes adoucies','BEVEL');b.width=bevel;b.segments=1;bpy.ops.object.modifier_apply(modifier=b.name)
 for v in o.data.vertices:
  x,y,z=v.co+Vector(pos);v.co=Vector((x,-z,y))
 o.data.materials.append(mat(material));c=o.data.color_attributes.new(name='Couleur',type='FLOAT_COLOR',domain='CORNER')
 for v in c.data:v.color=(*linear(color or COLORS.get(material,0xffffff)),1)
 o.data.color_attributes.active_color=c;parts.append(o);return o

def box(name,pos,size,material='bois',color=0,bevel=.003):
 bm=bmesh.new();bmesh.ops.create_cube(bm,size=1)
 for v in bm.verts:v.co=Vector([v.co[i]*size[i] for i in range(3)])
 return finish(bm,name,pos,material,color,bevel)
def cyl(name,pos,r,h,material='aluSombre',color=0,axis='y',n=12):
 bm=bmesh.new();bmesh.ops.create_cone(bm,cap_ends=True,segments=n,radius1=r,radius2=r,depth=h)
 if axis=='y':bmesh.ops.transform(bm,matrix=Matrix.Rotation(math.pi/2,4,'X'),verts=bm.verts)
 return finish(bm,name,pos,material,color)
def line(name,a,b,r=.009,material='aluSombre',color=0):
 a,b=Vector(a),Vector(b);bm=bmesh.new();bmesh.ops.create_cone(bm,cap_ends=True,segments=6,radius1=r,radius2=r,depth=(b-a).length)
 bmesh.ops.transform(bm,matrix=(b-a).to_track_quat('Z','Y').to_matrix().to_4x4(),verts=bm.verts)
 return finish(bm,name,(a+b)/2,material,color)
def plant(x,y,z):
 cyl('Pot', (x,y+.055,z),.065,.11,'peint',0xc79271)
 for i in range(5):
  a=i*2.4;line('Tige',(x,y+.11,z),(x+math.sin(a)*.075,y+.26+(i%2)*.04,z+math.cos(a)*.055),.025,'peint',0x68885a)
def books(y,color=0x886754):
 for i in range(6):
  x=-.224+i*.087;h=.24+(i%3)*.012;box('Dossier relié',(x,y+h/2,.13),(.066,h,.32),'peint',color if i%2 else 0xc8b791)
  box('Étiquette',(x,y+h*.65,.296),(.034,.07,.002),'papier',bevel=0)
  cyl('Œillet',(x,y+.06,.3),.012,.003,'aluSombre',axis='z',n=8)
def cup(x,y,z,color):
 cyl('Gobelet promo',(x,y+.06,z),.045,.12,'peint',color)
 line('Anse',(x+.04,y+.08,z),(x+.08,y+.08,z),.012,'peint',color)
def chair(x,y,z):
 for dx in [-.075,.075]:
  for dz in [-.065,.065]:box('Pied du prototype',(x+dx,y+.10,z+dz),(.018,.2,.018),'aluSombre')
 box('Dossier sans assise',(x,y+.28,z-.065),(.18,.14,.02),'peint',0xe67f53)
 for dx in [-.075,.075]:box('Traverse',(x+dx,y+.18,z),(.018,.018,.15),'aluSombre')

themes=['rh','finance','support','studio','archives','juridique','marketing','logistique','it','direction']
for theme in themes:
 ident='rangement-'+theme
 casing='aluSombre' if theme in ['it','logistique','support'] else 'boisFonce' if theme in ['direction','finance','juridique'] else 'bois'
 for x in [-.294,.294]:box('Joue',(x,.924,0),(.032,1.848,.72),casing)
 box('Fond opaque',(0,.924,-.337),(.56,1.848,.045),casing)
 for y in [.036,1.824]:box('Dessus' if y>1 else 'Socle',(0,y,0),(.62,.048,.75),casing)
 if theme=='finance':
  for y in [.49,1.37]:
   box('Porte blindée',(0,y,.32),(.548,.83,.065),'murAccent')
   cyl('Molette',(0,y+.08,.363),.078,.018,'laiton',axis='z')
   for dx in [-.205,.205]:box('Charnière',(dx,y,.364),(.025,.16,.019),'laiton')
   box('Bord du coffre',(0,y-.24,.363),(.35,.014,.012),'laiton')
 elif theme=='it':
  for i in range(9):
   y=.16+i*.18;box('Serveur',(0,y,.12),(.53,.135,.45),'plastiqueNoir')
   for j in range(7):box('Ventilation',(-.22+j*.05,y,.351),(.022,.045,.004),'alu',bevel=0)
   for j in range(2):cyl('Voyant vert',(.18+j*.035,y,.356),.008,.005,'lumiere',0x6edcb5,axis='z',n=6)
  for i in range(3):line('Patch réseau',(-.23,.22+i*.09,.365),(-.23+.11*i,1.6-i*.16,.365),.009,'peint',[0x72bdcd,0xdfb664,0xbb7798][i])
 elif theme=='logistique':
  box('Panneau perforé',(0,1.15,.27),(.53,1.15,.035),'murAccent')
  for i in range(3):
   x=-.16+i*.16;line('Manche outil',(x,.86,.316),(x,1.44,.316),.025,'peint',0xdba553)
   box('Tête outil',(x,1.49,.32),(.12,.095,.038),'alu')
  box('Bac',(0,.29,.08),(.53,.40,.51),'peint',0x667671)
 else:
  for y in [.5,.94,1.38]:box('Tablette',(0,y,0),(.56,.03,.68),casing)
  for k,y in enumerate([.065,.515,.955,1.395]):
   if theme=='rh':
    if k%2:plant(0,y,.15)
    else:
     for i in [-1,1]:box('Panier tissé',(i*.13,y+.16,.05),(.22,.3,.47),'peint',0xbd9b72);box('Poignée',(i*.13,y+.24,.292),(.08,.035,.003),'aluSombre')
   elif theme in ['archives','juridique']:
    if theme=='archives':books(y)
    else:
     box('Contrats scellés',(0,y+.17,.05),(.52,.32,.48),'papier');box('Ruban de scellement',(0,y+.17,.294),(.045,.32,.004),'peint',0x79577e);cyl('Sceau', (0,y+.17,.3),.034,.008,'peint',0xa25862,axis='z')
   elif theme=='studio':chair(0,y,.1)
   elif theme=='marketing':
    for i in [-1,1]:cup(i*.14,y,.16,0xdcaa48 if k%2 else 0xb66c82)
    box('Boîte RIEN',(0,y+.12,-.15),(.44,.24,.18),'peint',0xe5c5c4)
   elif theme=='support':
    box('Matériel de prêt',(0,y+.10,.10),(.5,.19,.43),'peint',0x607e9c)
    for x in [-.13,.13]:cyl('Casque',(x,y+.26,.22),.055,.04,'plastiqueNoir',axis='z')
    line('Arceau',(-.13,y+.3,.22),(.13,y+.3,.22),.018)
   else:
    box('Socle trophée',(0,y+.04,.08),(.38,.08,.38),'laiton')
    if k%2:cyl('Distinction',(0,y+.23,.08),.085,.25,'laiton',n=6)
    else:
     for dx in [-.08,.08]:line('Sculpture',(dx,y+.08,.08),(-dx,y+.34,.08),.027,'laiton')
 ident='poste-'+theme
 if theme=='it':
  box('Second écran',(.66,1.11,-.30),(.62,.39,.035),'plastiqueNoir')
  box('Pied écran',(.66,.90,-.32),(.04,.24,.045),'aluSombre');box('Socle écran',(.66,.785,-.30),(.24,.02,.17),'aluSombre')
  for i in range(3):line('Câble sous plateau',(-.2+i*.09,.71,-.47),(.5+i*.06,.45,-.48),.009,'peint',[0x79afc4,0xe0b65a,0xb36f87][i])
 elif theme=='rh':plant(.78,.79,-.3);box('Fiche entretien',(.72,.80,.23),(.38,.015,.22),'papier')
 elif theme=='finance':
  box('Calculatrice',(.77,.81,-.26),(.24,.035,.27),'plastiqueNoir');box('Afficheur',(.77,.832,-.33),(.18,.004,.06),'peint',0x719d83)
  for x in range(3):
   for z in range(3):box('Touche',(.70+x*.068,.838,-.26+z*.055),(.035,.014,.03),'papier',bevel=0)
 elif theme=='support':
  cyl('Pied casque',(.77,.792,-.3),.12,.018);line('Support casque',(.77,.8,-.3),(.77,1.16,-.3),.014)
  for x in [.65,.89]:cyl('Oreillette',(x,1.04,-.3),.065,.06,'plastiqueNoir',axis='z')
  line('Arceau casque',(.65,1.1,-.3),(.89,1.1,-.3),.022)
 elif theme=='studio':chair(.76,.785,-.3)
 elif theme=='archives':
  for i in range(4):box('Fiches en pile',(.74,.80+i*.036,-.30),(.45,.031,.32),'papier')
  box('Index alphabétique',(.78,.97,-.36),(.29,.075,.02),'peint',0xc5a575)
 elif theme=='juridique':
  box('Contrat',(.73,.806,-.30),(.40,.058,.30),'papier');cyl('Tampon',(.74,.90,-.27),.035,.12,'boisFonce');box('Base tampon',(.74,.843,-.27),(.14,.018,.09),'peint',0x925867)
 elif theme=='marketing':
  box('Packaging vide',(.75,.94,-.30),(.36,.31,.24),'peint',0xb96585);box('Face du packaging',(.75,.96,-.174),(.24,.19,.009),'papier')
 elif theme=='logistique':
  box('Boîte outils',(.73,.86,-.30),(.44,.16,.29),'peint',0xd2a14e);line('Poignée',(.60,.98,-.30),(.86,.98,-.30),.014)
 else:
  box('Sous-main',(.76,.786,-.26),(.47,.008,.36),'boisFonce');cyl('Sceau Méridien',(.78,.82,-.32),.095,.055,'laiton',n=8)
# Remplacer les piles de cartons de la direction par de petites vitrines opaques,
# dont le dessus reste exactement à 1,27 m pour les canards à collectionner.
ident='vitrine-direction'
box('Piédestal',(0,.39,0),(.80,.78,.72),'boisFonce')
for x in [-.365,.365]:box('Montant',(x,1.0,0),(.045,.46,.72),'laiton')
box('Fond du coffret',(0,1.0,-.34),(.75,.46,.04),'murAccent')
box('Couvercle',(0,1.245,0),(.82,.05,.74),'boisFonce')
cyl('Trophée', (0,.99,0),.12,.38,'laiton',n=6)
# Petites feuilles/échantillons en relief pour les moodboards : support mural.
ident='moodboard'
box('Support liège',(0,0,-.02),(2.98,1.48,.035),'bois')
for i in range(6):
 x=-1.16+(i%3)*.9;y=.35-(i//3)*.72;box('Échantillon',(x,y,.012),(.72,.53,.016),'peint',[0xe7c36f,0x92b9ba,0xc78898,0xe4d8ba,0x668779,0xf2e8dc][i]);cyl('Punaise',(x,y+.2,.03),.025,.014,'laiton',axis='z',n=8)
report={}
for o in parts:
 o.data.calc_loop_triangles();d=report.setdefault(o['acc_id'],{'triangles':0,'objets':0});d['triangles']+=len(o.data.loop_triangles);d['objets']+=1
(out/'rapport.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
for o in parts:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'departements-v01.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=True,export_vertex_color='MATERIAL')
# Scène source lisible : modèles répartis en grille APRÈS export à l’origine.
for i,key in enumerate(report):
 for o in parts:
  if o['acc_id']==key:o.location=Vector(((i%6)*2.6,(i//6)*3,0))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'departements-v01.blend'))
print('DÉPARTEMENTS',len(report),'modèles',sum(v['triangles'] for v in report.values()),'triangles')

"""Deux scènes animées dans Blender : 67 et Passinho do Jamal.
Source : joueur courant + courbes Bézier éditables. Aucun mouvement créé dans le runtime.
v02 : Passinho calé sur le drop « Ela Ké Leitada » (170 BPM), son embarqué dans le .blend.
--seulement passinho-jamal --version v02 --son CHEMIN.mp3
"""
import bpy,json,sys,argparse,math,importlib.util
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
p=argparse.ArgumentParser();p.add_argument('--atelier',required=True);p.add_argument('--out',required=True);p.add_argument('--seulement',default='67,passinho-jamal');p.add_argument('--version',default='v01');p.add_argument('--son')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out)
if out.exists():raise RuntimeError('Dossier existant : conserver les retouches, choisir une nouvelle sortie.')
out.mkdir(parents=True);data=json.loads(Path(a.atelier).read_text())
spec=importlib.util.spec_from_file_location('exporter',Path(__file__).with_name('exporter_emotes.py'));exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
C=exporter.C;CI=C.transposed();C4=C.to_4x4();CI4=CI.to_4x4();BONES=exporter.BONES
REST={b:[0,0,0] for b in BONES};REST.update(armL=[0,0,-.03],armR=[0,0,.03],elbowL=[-.22,0,0],elbowR=[-.22,0,0])
if a.version>='v04':REST.update(mainL=[0,1.0,0],mainR=[0,-1.0,0])  # mains v02 : repos naturel = POIGNET_REPOS du jeu
EXPR=exporter.EXPRESSION+(['mainL_Pouce','mainR_Pouce'] if a.version>='v04' else [])
def matrix(values):return Matrix([[values[c*4+r] for c in range(4)] for r in range(4)])
def quaternion(angles):
 m=Matrix.Rotation(angles[0],3,'X')@Matrix.Rotation(angles[1],3,'Y')@Matrix.Rotation(angles[2],3,'Z');return (C@m@CI).to_quaternion()
def driver(owner,path,expression,properties,index=-1):
 curve=owner.driver_add(path,index) if index>=0 else owner.driver_add(path);d=curve.driver;d.expression=expression
 for key in properties:
  v=d.variables.new();v.name=key;v.targets[0].id=expr;v.targets[0].data_path='["'+key+'"]'
def atelier():
 bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene;s.render.fps=60;s.unit_settings.system='METRIC'
 nodes={};controls={}
 inverse={v:k for k,v in data['controls'].items() if k in BONES+['teteMicro']}
 for n in data['nodes']:
  o=bpy.data.objects.new('CTRL_'+inverse[n['id']] if n['id'] in inverse else (n['name'] or n['type'])+'_'+str(n['id']),None);s.collection.objects.link(o);nodes[n['id']]=o;o.empty_display_size=.025
  if n['parent'] is not None:o.parent=nodes[n['parent']]
  o.matrix_local=C4@matrix(n['matrix'])@CI4;o.rotation_mode='QUATERNION'
  if n['id'] in inverse:controls[inverse[n['id']]]=o;o['emote_controle']=inverse[n['id']];o.show_name=True;o.empty_display_type='SPHERE'
 # Déformation des vêtements par les mêmes seize os ; contrôleurs manipulables à la souris.
 armdata=bpy.data.armatures.new('Squelette actuel');arm=bpy.data.objects.new('Rig vêtements',armdata);s.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 bones={n['name']:n for n in data['nodes'] if n['type']=='Bone'}
 for name in data['os']:
  n=bones[name];b=armdata.edit_bones.new(name);b.head=C@matrix(n['world']).translation;b.tail=b.head+Vector((0,0,.08));b.use_connect=False
  par=next((x['name'] for x in data['nodes'] if x['id']==n['parent'] and x['type']=='Bone'),None)
  if par:b.parent=armdata.edit_bones[par]
 bpy.ops.object.mode_set(mode='OBJECT');arm.select_set(False)
 for name in data['os']:
  helper=bpy.data.objects.new('Liaison '+name,None);s.collection.objects.link(helper);helper.parent=nodes[bones[name]['id']];helper.rotation_mode='QUATERNION';helper.rotation_quaternion=C.to_quaternion();helper.empty_display_size=.005
  c=arm.pose.bones[name].constraints.new('COPY_TRANSFORMS');c.target=helper
 global expr
 expr=bpy.data.objects.new('Expressions',None);s.collection.objects.link(expr)
 for k in EXPR:expr[k]=1.0 if k=='bouche' else 0.0;expr.id_properties_ui(k).update(min=0 if k not in ['regard_x','regard_y'] else -.006,max=2 if k=='bouche' else .006 if k.startswith('regard') else 1)
 for n in data['nodes']:
  if 'mesh' not in n:continue
  m=n['mesh'];attrs=m['attributes'];pos=attrs['position']['values'];verts=[C@Vector(pos[i:i+3]) for i in range(0,len(pos),3)];idx=m['index'] or list(range(len(verts)));fs=[idx[i:i+3] for i in range(0,len(idx),3)];geo=bpy.data.meshes.new('Surface '+str(n['id']));geo.from_pydata(verts,[],fs);geo.update()
  obj=bpy.data.objects.new(n['name'] or 'Vêtement',geo);s.collection.objects.link(obj);obj.parent=nodes[n['id']]
  for f in geo.polygons:f.use_smooth=True
  mat=bpy.data.materials.new('Matière '+str(n['id']));mat.diffuse_color=tuple(m['color'])+(1,);mat.use_nodes=True;bsdf=mat.node_tree.nodes['Principled BSDF'];bsdf.inputs['Base Color'].default_value=mat.diffuse_color;bsdf.inputs['Roughness'].default_value=m['roughness'];bsdf.inputs['Metallic'].default_value=m['metalness'];geo.materials.append(mat)
  if 'color' in attrs:
   color=geo.color_attributes.new(name='Pigment',type='FLOAT_COLOR',domain='POINT');values=attrs['color']['values'];size=attrs['color']['size']
   for i,col in enumerate(color.data):col.color=tuple(values[i*size:i*size+3])+(1,)
   vc=mat.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Pigment';mix=mat.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=mat.diffuse_color;mat.node_tree.links.new(vc.outputs['Color'],mix.inputs[2]);mat.node_tree.links.new(mix.outputs[0],bsdf.inputs['Base Color'])
  if m['skin']:
   groups=[obj.vertex_groups.new(name=name) for name in data['os']];si=attrs['skinIndex']['values'];sw=attrs['skinWeight']['values']
   for i in range(len(verts)):
    for k in range(4):
     weight=sw[i*4+k]
     if weight>0:groups[int(si[i*4+k])].add([i],weight,'REPLACE')
   mod=obj.modifiers.new('Vêtements déformés','ARMATURE');mod.object=arm
  if m['morphs']:
   obj.shape_key_add(name='Basis')
   for key,values in m['morphs'].items():
    shape=obj.shape_key_add(name=key);shape.value=0
    for i,v in enumerate(shape.data):v.co=(verts[i] if m['relative'] else Vector())+C@Vector(values[i*3:i*3+3])
    channel='clignement' if key=='Clignement' else 'main'+('L' if 'doigtsL' in n['name'] else 'R')+'_'+key
    driver(shape,'value',channel,[channel])
 regard=nodes[data['controls']['regard']];driver(regard,'location','regard_x',['regard_x'],0);driver(regard,'location','regard_y',['regard_y'],2)
 bouche=nodes[data['controls']['bouche']];driver(bouche,'scale','bouche',['bouche'],2)
 s.world=bpy.data.worlds.new('Studio');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.2,.24,.25,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.5
 for name,pos,power in [('Lumière',(-3,-4,5),650),('Contour',(2,3,4),800),('Remplissage',(3,-2,2),280)]:
  d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=4;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
 d=bpy.data.cameras.new('Vue animation');o=bpy.data.objects.new('Vue animation',d);s.collection.objects.link(o);o.location=(2,-5,2.1);o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=2.45;s.camera=o
 s.render.engine='CYCLES';s.cycles.samples=16;s.render.resolution_x=840;s.render.resolution_y=900;s.render.resolution_percentage=100;s.render.image_settings.file_format='JPEG';s.render.image_settings.quality=92
 bpy.ops.object.select_all(action='DESELECT');controls['root'].select_set(True);bpy.context.view_layer.objects.active=controls['root']
 atelier.nodes=nodes
 return controls

DERNIER={}
def cle(t,pose):
 # Même hémisphère que la clé précédente : Blender interpole les quaternions composante par
 # composante ; q et -q opposés feraient faire un tour complet à l'articulation.
 frame=1+round(t*60)
 if frame==1:DERNIER.clear()
 for b in BONES:
  qv=quaternion(pose.get(b,REST[b]))
  if b in DERNIER and DERNIER[b].dot(qv)<0:qv.negate()
  DERNIER[b]=qv.copy()
  o=controls[b];o.rotation_quaternion=qv;o.keyframe_insert('rotation_quaternion',frame=frame,group=b)
 controls['root'].location=C@Vector((pose.get('dx',0),.85+pose.get('dy',0),pose.get('dz',0)));controls['root'].keyframe_insert('location',frame=frame,group='Bassin')
 for k in EXPR:expr[k]=pose.get(k,1.0 if k=='bouche' else 0.0);expr.keyframe_insert(data_path='["'+k+'"]',frame=frame,group='Visage et mains')

def sixseven():
 cle(0,{});cle(.28,{'head':[.08,-.12,0],'elbowL':[-.65,0,0],'elbowR':[-.65,0,0]})
 for i in range(11):
  t=.65+i*.32;s=1 if i%2==0 else -1;pose={'upper':[0,.035*s,.018*s],'head':[-.045,-.09*s,-.025*s],'mainL_Ouvert':.95,'mainR_Ouvert':.95,'pouceL':[0,0,-.14],'pouceR':[0,0,.14],'bouche':1.10}
  for side,sign in [('L',1),('R',-1)]:
   elbow=-1.30-.46*s*sign;pose['arm'+side]=[-.28,0,-.27*sign];pose['elbow'+side]=[elbow,0,0];pose['main'+side]=[-math.pi/2+.28-elbow,0,0]
  if i in [3,8]:pose['clignement']=.9
  cle(t,pose)
 cle(4.15,{'armL':[-.12,0,-.14],'armR':[-.12,0,.14],'elbowL':[-.8,0,0],'elbowR':[-.8,0,0],'mainL_Ouvert':.45,'mainR_Ouvert':.45});cle(4.8,{})

def jamal_pose(side,hit,lift=False):
 # Le pied pointe d'un côté ; bassin en contre-mouvement. Bras libres ensemble.
 s=side;active='L' if s<0 else 'R';other='R' if s<0 else 'L'
 p={'dx':-s*.027,'root':[0,s*.075,-s*.014],'upper':[.04,-s*.15,s*.04],'head':[-.03,s*.11,-s*.025],
    'armL':[-.35,-s*.10,-.15+s*.35],'armR':[-.35,-s*.10,.15+s*.35],
    'elbowL':[-.64-s*.18,0,0],'elbowR':[-.64+s*.18,0,0],
    'mainL':[.18,0,-s*.14],'mainR':[.18,0,-s*.14],'mainL_Poing':.16,'mainR_Poing':.16,'bouche':1.08,
    'leg'+other:[-.08,0,-s*.025],'knee'+other:[.16,0,0],'foot'+other:[-.08,0,0]}
 p['leg'+active]=[-.16 if lift else -.07,s*.10,s*(.10 if lift else .22)]
 p['knee'+active]=[.38 if lift else .17,0,0];p['foot'+active]=[-.22 if lift else -.10,-s*.08,0]
 if lift:
  p['armL'][2]*=.65;p['armR'][2]*=.65;p['dx']*=.55
 if hit in [4,14]:p['clignement']=.9
 return p

# Grille mesurée sur Ela_ke_Leitada_drop_emote.mp3 (enveloppe + autocorrélation dans Blender/aud) :
# un temps toutes les 0,3526 s, premier temps après le drop à 0,692 s, écart max 10 ms.
TEMPS=.3526;T0=.692
def temps(k):return T0+k*TEMPS
MOTIF=[(0,-1),(1,1),(2,-1),(2.5,-1),(3,-1),(4,1),(5,-1),(6,1),(6.5,1),(7,1)]  # « un, deux, un-deux-trois », 8 temps = 2 mesures

def jamal_final(side):
 # Pose tenue sur le dernier accent : bras ouverts, bassin sorti, clin d'œil.
 p=jamal_pose(side,0);p.update({'armL':[-.45,0,-.78],'armR':[-.45,0,.78],'elbowL':[-.3,0,0],'elbowR':[-.3,0,0],
  'mainL':[.1,0,0],'mainR':[.1,0,0],'mainL_Ouvert':.85,'mainR_Ouvert':.85,'mainL_Poing':0,'mainR_Poing':0,
  'head':[-.1,side*.16,-side*.1],'bouche':1.35,'clignement':.55});return p

def jamal_son():
 cle(0,{});cle(temps(-1),{'legL':[-.08,0,-.08],'legR':[-.08,0,.08],'kneeL':[.16,0,0],'kneeR':[.16,0,0],'footL':[-.08,0,0],'footR':[-.08,0,0],'elbowL':[-.5,0,0],'elbowR':[-.5,0,0]})
 pas=[(c*8+k,side) for c in range(3) for k,side in MOTIF]+[(24+k,side) for k,side in MOTIF[:5]]
 for i,(k,side) in enumerate(pas):
  stamp=temps(k);cle(stamp-.07,jamal_pose(side,i,True));cle(stamp,jamal_pose(side,i))
 cle(temps(27.5),jamal_pose(1,0,True));cle(temps(28),jamal_final(1));cle(temps(29),jamal_final(1))
 cle(temps(30.5),{'armL':[-.1,0,-.12],'armR':[-.1,0,.12],'elbowL':[-.45,0,0],'elbowR':[-.45,0,0],'legL':[-.05,0,-.08],'legR':[-.05,0,.08],'kneeL':[.1,0,0],'kneeR':[.1,0,0],'footL':[-.05,0,0],'footR':[-.05,0,0]});cle(11.8,{})

def jamal():
 cle(0,{});cle(.3,{'legL':[-.08,0,-.08],'legR':[-.08,0,.08],'kneeL':[.16,0,0],'kneeR':[.16,0,0],'footL':[-.08,0,0],'footR':[-.08,0,0],'elbowL':[-.5,0,0],'elbowR':[-.5,0,0]})
 steps=[(0,-1),(.32,1),(.64,-1),(.80,-1),(.96,-1),(1.28,1),(1.60,-1),(1.92,1),(2.08,1),(2.24,1)]
 for cycle in range(2):
  for i,(t,side) in enumerate(steps):
   stamp=.70+cycle*2.56+t;cle(stamp-.07,jamal_pose(side,i+cycle*10,True));cle(stamp,jamal_pose(side,i+cycle*10))
 cle(5.9,{'armL':[-.1,0,-.12],'armR':[-.1,0,.12],'elbowL':[-.45,0,0],'elbowR':[-.45,0,0],'legL':[-.05,0,-.08],'legR':[-.05,0,.08],'kneeL':[.1,0,0],'kneeR':[.1,0,0],'footL':[-.05,0,0],'footR':[-.05,0,0]});cle(6.4,{})

def contacts_sol():
 # Cuisson des appuis dans Blender. Le jeu conserve son filet de sécurité au sol.
 s=bpy.context.scene;feet=[]
 for o in bpy.data.objects:
  if o.type!='MESH':continue
  parent=o.parent
  while parent:
   if parent.get('emote_controle') in ['footL','footR']:feet.append(o);break
   parent=parent.parent
 for frame in range(s.frame_start,s.frame_end+1):
  s.frame_set(frame);bpy.context.view_layer.update()
  low=min((o.matrix_world@v.co).z for o in feet for v in o.data.vertices)
  controls['root'].location.z-=low
  controls['root'].keyframe_insert('location',index=2,frame=frame,group='Appuis cuits dans Blender')
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.003));floor=bpy.context.object;floor.name='Sol de contrôle — hors export'
 mat=bpy.data.materials.new('Sol studio');mat.diffuse_color=(.15,.19,.19,1);floor.data.materials.append(mat)

def leitada():
 # v03 : gestes de la vidéo de référence, posés par cinématique inverse (leitada_blender.py).
 spec=importlib.util.spec_from_file_location('leitada',Path(__file__).with_name('leitada_blender.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 rig=m.Rig(controls,atelier.nodes,data,quaternion,C,REST);m.choregraphie(rig,cle)
 print('IK ECARTS max %.1f mm'%(1000*max(e for e,_ in rig.ecarts)),'moyen %.1f mm'%(1000*sum(e for e,_ in rig.ecarts)/len(rig.ecarts)))

def son(chemin,fichier):
 # Musique dans le séquenceur : retoucher les clés en l'écoutant (lecture synchronisée sur l'audio).
 s=bpy.context.scene;se=s.sequence_editor_create();strips=se.strips if hasattr(se,'strips') else se.sequences
 strip=strips.new_sound('Ela Ké Leitada (drop)',str(Path(chemin).resolve()),1,1);strip.sound.pack()
 s.sync_mode='AUDIO_SYNC';s.use_audio_scrub=True
 s['emote_son']=json.dumps({'fichier':fichier,'debut':0})
 for k in range(0,29,4):s.timeline_markers.new('Mesure %d'%(k//4+1),frame=1+round(temps(k)*60))

VERSION=a.version;CHOIX=a.seulement.split(',')
scenes={'v01':[('67',4.8,sixseven,1.61),('passinho-jamal',6.4,jamal,1.34)],'v02':[('passinho-jamal',11.8,jamal_son,temps(28)+.1)],'v03':[('ela-ke-leitada',11.8,leitada,temps(1))],'v04':[('67',4.8,sixseven,1.61),('ela-ke-leitada',11.8,leitada,temps(1))],'v05':[('67',4.8,sixseven,1.61),('ela-ke-leitada',11.8,leitada,temps(1))]}[VERSION]
manifest=[]
for ident,duree,fn,apercu in [x for x in scenes if x[0] in CHOIX]:
 controls=atelier();s=bpy.context.scene;s['emote_id']=ident;s['emote_duree']=duree;s['emote_version']=VERSION;s['provenance']='Animation originale par clés Blender, référence gestuelle documentée dans REFERENCES.md';s.frame_start=1;s.frame_end=1+round(duree*60);fn()
 if a.son and ident in ['passinho-jamal','ela-ke-leitada']:son(a.son,'emote-'+ident+'-son-v01.mp3')
 # Blender crée de vraies Actions et courbes Bézier AUTO_CLAMPED, éditables dans le Graph Editor.
 for action in bpy.data.actions:
  for layer in action.layers:
   for strip in layer.strips:
    for bag in strip.channelbags:
     for fc in bag.fcurves:
      for k in fc.keyframe_points:k.interpolation='BEZIER';k.handle_left_type='AUTO_CLAMPED';k.handle_right_type='AUTO_CLAMPED'
 for t,label in [(0,'Repos'),(.65,'Départ du geste'),(duree-.5,'Récupération')]:s.timeline_markers.new(label,frame=1+round(t*60))
 contacts_sol()
 s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/(ident+'-'+VERSION+'.blend')))
 exported=exporter.exporter(out/(ident+'-export'));manifest.append({k:exported[k] for k in ['source','blender','fps','duree']})
 s.frame_set(1+round(apercu*60));s.render.filepath=str(out/(ident+'.jpg'));bpy.ops.render.render(write_still=True)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('EMOTES BLENDER',json.dumps(manifest))

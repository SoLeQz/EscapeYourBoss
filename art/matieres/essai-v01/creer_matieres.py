"""Matériaux Méridien : graphes Blender éditables, cuisson Cycles, PNG tuilables.
blender --background --factory-startup --python-exit-code 1 --python creer_matieres.py -- --out DOSSIER_NEUF
Couleur en sRGB ; relief, rugosité et normales en données linéaires.
"""
import bpy, math, sys, argparse, json
import numpy as np
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out)
if out.exists():raise RuntimeError('Le dossier doit être neuf ; ne jamais écraser une retouche.')
out.mkdir(parents=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.bake.margin=0;scene.render.bake.use_clear=True

def linear(c):
 vals=[int(c[i:i+2],16)/255 for i in (0,2,4)]
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in vals)+(1,)
class Graphe:
 def __init__(self,nom):
  self.mat=bpy.data.materials.new('MERIDIEN_'+nom);self.mat.use_nodes=True;self.nodes=self.mat.node_tree.nodes;self.nodes.clear();self.links=self.mat.node_tree.links;self.i=0
  tex=self.node('ShaderNodeTexCoord','Coordonnées UV');self.uv=tex.outputs['UV'];sep=self.node('ShaderNodeSeparateXYZ','U et V');self.links.new(self.uv,sep.inputs[0]);self.u=sep.outputs['X'];self.v=sep.outputs['Y']
 def node(self,kind,label):
  n=self.nodes.new(kind);n.label=label;n.location=((self.i%7)*220,-(self.i//7)*240);self.i+=1;return n
 def link(self,value,socket):
  if isinstance(value,(float,int)):socket.default_value=(value,value,value,1) if socket.type=='RGBA' else value
  elif isinstance(value,tuple):socket.default_value=value
  else:self.links.new(value,socket)
 def math(self,op,a,b=None):
  n=self.node('ShaderNodeMath',op);n.operation=op;self.link(a,n.inputs[0]);
  if b is not None:self.link(b,n.inputs[1])
  return n.outputs[0]
 def noise(self,su,sv,detail=2):
  # Plongement torique en 4D : le champ et sa pente se raccordent aux bords.
  u=self.math('MULTIPLY',self.u,2*math.pi);v=self.math('MULTIPLY',self.v,2*math.pi)
  co=self.node('ShaderNodeCombineXYZ','Bruit sans couture')
  for source,op,k,dest in [(u,'COSINE',su,'X'),(u,'SINE',su,'Y'),(v,'COSINE',sv,'Z')]:self.link(self.math('MULTIPLY',self.math(op,source),k),co.inputs[dest])
  n=self.node('ShaderNodeTexNoise','Grain tuilable');n.noise_dimensions='4D';n.inputs['Scale'].default_value=1;n.inputs['Detail'].default_value=detail;n.inputs['Roughness'].default_value=.65
  self.link(co.outputs[0],n.inputs['Vector']);self.link(self.math('MULTIPLY',self.math('SINE',v),sv),n.inputs['W']);return n.outputs['Fac']
 def ramp(self,value,stops,label):
  n=self.node('ShaderNodeValToRGB',label);r=n.color_ramp;r.interpolation='EASE'
  while len(r.elements)>2:r.elements.remove(r.elements[-1])
  for i,(pos,color) in enumerate(stops):
   e=r.elements[i] if i<2 else r.elements.new(pos);e.position=pos;e.color=linear(color) if isinstance(color,str) else (color,color,color,1)
  self.link(value,n.inputs[0]);return n.outputs['Color']
 def blend(self,a,b,k):
  n=self.node('ShaderNodeMixRGB','Mélange');n.blend_type='MIX';self.link(k,n.inputs[0]);self.link(a,n.inputs[1]);self.link(b,n.inputs[2]);return n.outputs[0]
 def finish(self,color,rough,height,distance,metal=0):
  bs=self.node('ShaderNodeBsdfPrincipled','Matière finale');bs.inputs['Metallic'].default_value=metal
  self.link(color,bs.inputs['Base Color']);self.link(rough,bs.inputs['Roughness']);bu=self.node('ShaderNodeBump','Microrelief en mètres');bu.inputs['Distance'].default_value=distance;self.link(height,bu.inputs['Height']);self.links.new(bu.outputs[0],bs.inputs['Normal'])
  self.output=self.node('ShaderNodeOutputMaterial','Sortie');self.links.new(bs.outputs[0],self.output.inputs['Surface']);self.bs=bs
  return self.mat,{'color':color,'rough':rough,'height':height},distance

def matiere(nom):
 g=Graphe(nom)
 if nom=='bois':
  grain=g.noise(.45,11,3);pores=g.noise(2.5,85,2);broad=g.noise(.6,1.8,2)
  h=g.math('ADD',g.math('MULTIPLY',grain,.8),g.math('MULTIPLY',pores,.2))
  col=g.ramp(grain,[(.22,'867254'),(.43,'AF9772'),(.64,'C4AE87'),(.84,'CCB891')],'Chêne à fil irrégulier')
  col=g.blend(col,g.ramp(broad,[(.2,'A99779'),(.8,'D0BB93')],'Nuances du placage'),.15)
  return g,g.finish(col,g.math('ADD',.49,g.math('MULTIPLY',pores,.12)),h,.00022)
 if nom=='textile':
  micro=g.noise(42,42,1);chiné=g.noise(7,7,2)
  # Boucles douces, sans gros damier ni sinusoïde verticale du tissu précédent.
  h=g.math('ADD',g.math('MULTIPLY',micro,.8),g.math('MULTIPLY',chiné,.2))
  col=g.ramp(h,[(.22,'A6ADA9'),(.5,'BBC1BD'),(.8,'CED2CA')],'Laine chinée neutre')
  return g,g.finish(col,g.math('ADD',.87,g.math('MULTIPLY',micro,.10)),h,.00022)
 if nom=='moquette':
  micro=g.noise(62,62,1);chin=g.noise(9,9,2)
  h=g.math('ADD',g.math('MULTIPLY',micro,.82),g.math('MULTIPLY',chin,.18))
  col=g.ramp(h,[(.2,'405752'),(.5,'4B615C'),(.8,'566B65')],'Fibres pétrole')
  # Quatre dalles de 50 cm, orientation indiquée sans effet échiquier.
  u=g.math('FRACT',g.math('MULTIPLY',g.u,2));v=g.math('FRACT',g.math('MULTIPLY',g.v,2))
  joint=g.math('LESS_THAN',g.math('MINIMUM',g.math('MINIMUM',u,g.math('SUBTRACT',1,u)),g.math('MINIMUM',v,g.math('SUBTRACT',1,v))),.0018)
  col=g.blend(col,linear('425852'),g.math('MULTIPLY',joint,.35));h=g.math('SUBTRACT',h,g.math('MULTIPLY',joint,.15))
  return g,g.finish(col,.96,h,.0005)
 if nom=='pierre':
  noise=g.noise(24,24,2);detail=g.noise(67,67,1);broad=g.noise(2,2,2)
  # Agrégats arrondis irréguliers, inclus dans la masse plutôt que points carrés.
  inclusions=g.ramp(noise,[(.30,1),(.38,.5),(.42,0),(.8,0)],'Petits granulats')
  base=g.ramp(broad,[(.2,'BFBDB0'),(.8,'C9C7BC')],'Matrice calcaire')
  chips=g.ramp(detail,[(.2,'8F9690'),(.48,'ACAE9E'),(.7,'DED8C6')],'Agrégats discrets')
  col=g.blend(base,chips,inclusions)
  h=g.math('ADD',g.math('MULTIPLY',detail,.15),.4)
  return g,g.finish(col,g.math('ADD',.64,g.math('MULTIPLY',noise,.10)),h,.00008)
 if nom=='beton':
  broad=g.noise(2.7,2.7,3);fine=g.noise(45,45,2)
  pores=g.ramp(fine,[(.2,.08),(.35,.45),(.45,.5),(.8,.55)],'Pores fermés')
  col=g.ramp(broad,[(.2,'AAA99D'),(.5,'B8B7AC'),(.8,'C1BFB3')],'Béton chaud')
  return g,g.finish(col,g.math('ADD',.79,g.math('MULTIPLY',fine,.12)),pores,.00035)
 if nom=='metal':
  grain=g.noise(.3,60,2)
  return g,g.finish(linear('FFFFFF'),g.math('ADD',.43,g.math('MULTIPLY',grain,.16)),grain,.000012,1)
 if nom=='cuir':
  grain=g.noise(26,26,2);h=g.ramp(grain,[(.2,.15),(.4,.48),(.55,.53),(.8,.56)],'Grain de cuir fin')
  return g,g.finish(linear('FFFFFF'),g.math('ADD',.39,g.math('MULTIPLY',grain,.16)),h,.00009)
 raise ValueError(nom)

rapports=[];modeles=[]
for nom,taille,metres in [('bois',1024,1),('textile',512,.5),('moquette',512,1),('pierre',512,1),('beton',512,1),('metal',512,.5),('cuir',512,.25)]:
 g,(mat,canaux,distance)=matiere(nom)
 bpy.ops.mesh.primitive_plane_add(size=metres);plane=bpy.context.object;plane.name='Échantillon_'+nom;plane.data.materials.append(mat)
 images={};stats={}
 for canal,source in canaux.items():
  img=bpy.data.images.new(nom+'_'+canal,width=taille,height=taille,alpha=False,float_buffer=True);img.colorspace_settings.name='sRGB' if canal=='color' else 'Non-Color'
  target=g.node('ShaderNodeTexImage','Export '+canal);target.image=img;g.nodes.active=target;target.select=True
  emission=g.node('ShaderNodeEmission','Cuisson '+canal);g.link(source,emission.inputs['Color']);g.links.new(emission.outputs[0],g.output.inputs['Surface'])
  bpy.ops.object.bake(type='EMIT')
  data=np.array(img.pixels[:],dtype=np.float32).reshape((taille,taille,4));stats[canal]=[float(data[:,:,:3].min()),float(data[:,:,:3].max())]
  g.nodes.remove(emission)
  if canal=='height':
   # Dérivées périodiques, pas d'éclairage figé dans les cartes de relief.
   h=data[:,:,0];dx=(np.roll(h,-1,1)-np.roll(h,1,1))*distance*taille/(2*metres);dy=(np.roll(h,-1,0)-np.roll(h,1,0))*distance*taille/(2*metres)
   xyz=np.stack((-dx,-dy,np.ones_like(h)),axis=2);xyz/=np.linalg.norm(xyz,axis=2,keepdims=True)
   data[:,:,:3]=xyz*.5+.5;data[:,:,3]=1;img.pixels.foreach_set(data.ravel());canal='normal'
   stats[canal]=[float(data[:,:,:3].min()),float(data[:,:,:3].max())]
  img.filepath_raw=str(out/('mat-'+nom+'-v01-'+canal+'.png'));img.file_format='PNG';img.save();img.pack();images[canal]=img.name
 g.links.new(g.bs.outputs[0],g.output.inputs['Surface'])
 plane.location.x=len(modeles)*1.5;modeles.append(plane)
 rapports.append({'matiere':nom,'resolution':taille,'tailleMetres':metres,'reliefMetres':distance,'cartes':images,'plagesLineaires':stats})
 print('CUISSON_OK '+nom,flush=True)
# Sources complètes avec graphes et cartes embarquées, pas une simple collection de PNG.
scene.world.color=(.35,.35,.35);scene.view_settings.view_transform='AgX'
for i,plane in enumerate(modeles):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=.34,location=(i*1.5,0,.38));sphere=bpy.context.object;sphere.name='Sphère_'+plane.name;sphere.data.materials.append(plane.data.materials[0]);bpy.ops.object.shade_smooth()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'matieres-meridien-v01.blend'))
(out/'rapport.json').write_text(json.dumps({'blender':bpy.app.version_string,'moteur':'Cycles EMIT + normales tangentes dérivées des hauteurs cuites','matieres':rapports},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('BIBLIOTHEQUE_TERMINEE',flush=True)

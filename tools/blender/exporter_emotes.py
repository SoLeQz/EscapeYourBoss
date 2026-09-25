"""Export des courbes évaluées de la scène Blender courante. Ne génère aucune pose.
blender EMOTE.blend --background --python exporter_emotes.py -- --out DOSSIER_NEUF
"""
import bpy,math,json,sys,argparse
from pathlib import Path
from mathutils import Matrix,Vector
C=Matrix(((1,0,0),(0,0,-1),(0,1,0)));CI=C.transposed()
BONES=['root','upper','head','armL','armR','elbowL','elbowR','mainL','mainR','legL','legR','kneeL','kneeR','footL','footR','doigtsL','doigtsR','pouceL','pouceR']
EXPRESSION=['clignement','regard_x','regard_y','bouche','mainL_Ouvert','mainR_Ouvert','mainL_Poing','mainR_Poing','mainL_Index','mainR_Index']
def euler_jeu(q):
 m=CI@q.to_matrix()@C;y=math.asin(max(-1,min(1,m[0][2])))
 if abs(m[0][2])<.9999999:return [math.atan2(-m[1][2],m[2][2]),y,math.atan2(-m[0][1],m[0][0])]
 return [math.atan2(m[2][1],m[1][1]),y,0]
def exporter(out):
 out=Path(out);out.mkdir(parents=True,exist_ok=False);s=bpy.context.scene;fps=60;duration=float(s['emote_duree']);controls={o['emote_controle']:o for o in bpy.data.objects if 'emote_controle' in o};expr=bpy.data.objects['Expressions'];frames=[];version=s.get('emote_version','v01')
 expressions=EXPRESSION+[k for k in ['mainL_Pouce','mainR_Pouce'] if k in expr]  # v01 : pas de canal Pouce, réexport identique
 channels=[b+'_'+axis for b in BONES for axis in 'xyz']+['deplacement_x','deplacement_y','deplacement_z']+expressions
 for i in range(round(duration*fps)+1):
  s.frame_set(s.frame_start+round(i*s.render.fps/fps));row=[]
  for bone in BONES:row+=euler_jeu(controls[bone].rotation_quaternion.normalized())
  pos=CI@controls['root'].location-Vector((0,.85,0));row+=list(pos)
  row+=[float(expr[k]) for k in expressions]
  if frames:  # angles déroulés : pas de saut de 2π quand une rotation franchit ±π
   for j in range(len(BONES)*3):
    k=round((frames[-1][j]-row[j])/(2*math.pi))
    if k:row[j]+=2*math.pi*k
  frames.append([round(v,7) for v in row])
 data={'schema':1,'source':s['emote_id']+'-'+version+'.blend','blender':bpy.app.version_string,'fps':fps,'duree':duration,'channels':channels,'frames':frames}
 if 'emote_son' in s:data['son']=json.loads(s['emote_son'])
 (out/(s['emote_id']+'-'+version+'.json')).write_text(json.dumps(data,separators=(',',':'))+'\n')
 (out/(s['emote_id']+'-'+version+'.js')).write_text('// Export Blender. Modifier les courbes du .blend, puis réexporter.\nexport default '+json.dumps(data,separators=(',',':'))+';\n')
 s.frame_set(s.frame_start);return data
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);exporter(a.out)

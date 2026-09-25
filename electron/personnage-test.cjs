// Atelier de validation, accessible seulement dans le profil --selftest.
module.exports = async ({ js, shot, step, wait }) => {
  await step('atelier', `(async()=>{
    const THREE=await import('three'); const g=window.__game;
    g.step=()=>{};g.renderer.setAnimationLoop(null);
    document.body.replaceChildren(g.renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0xc2c8c6);scene.environment=g.scene.environment;
    const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.03,30);
    scene.add(new THREE.HemisphereLight(0xe9f4ff,0x746755,2));
    const light=new THREE.DirectionalLight(0xffedd9,3.2);light.position.set(-3,5,4);scene.add(light);
    light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-2;light.shadow.camera.right=2;
    light.shadow.camera.top=3;light.shadow.camera.bottom=-1;light.shadow.bias=-.00015;light.shadow.normalBias=.015;
    const fill=new THREE.DirectionalLight(0xc4dfff,1.5);fill.position.set(3,2,-3);scene.add(fill);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x9ca7a3,roughness:1}));
    floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
    const p=g.player;p.pos.set(0,0,0);p.yaw=0;p.speed=0;p.working=null;p.crouch=0;p.animate(0);scene.add(p.mesh);
    p.parts.torso.scale.setScalar(1);p.parts.teteMicro.rotation.set(0,0,0);
    window.atelier={scene,camera,p,THREE};
    window.vue=(x,y,z,ty)=>{camera.position.set(x,y,z);camera.lookAt(0,ty,0)};
    vue(2.1,1.55,3.5,.94);
    g.renderer.setAnimationLoop(()=>g.renderer.render(scene,camera));
    return {hauteur:1.8};
  })()`);
  for (const [name,pos] of [ ['corps',[1.8,1.35,3.6,.93]],['face',[0,1.65,1.05,1.59]],['profil',[1.2,1.63,.12,1.57]],['dos',[-1.6,1.45,-3.6,.95]] ]) {
    await js(`vue(${pos.join(',')})`);await wait(750);await shot(name+'.jpg');
  }
  await step('clignement', `(()=>{const {p}=atelier;p.parts.clignement.morphTargetInfluences[0]=1;vue(0,1.65,1.05,1.59);return 'paupières fermées'})()`);
  await wait(750);await shot('clignement.jpg');
  await js('atelier.p.parts.clignement.morphTargetInfluences[0]=0');
  await step('poses' , `(()=>{const {p}=atelier;p.crouch=1;p.animate(.016);vue(2,1.25,3,.8);return 'accroupi'})()`);
  await wait(750);await shot('accroupi.jpg');
  await js(`(()=>{const {p}=atelier;p.crouch=0;p.working={};for(let i=0;i<90;i++)p.animate(1/60);vue(2,1.25,3,.8)})()`);
  await wait(750);await shot('assis.jpg');
  await js(`(()=>{const {p}=atelier;p.working=null;p.workBlend=0;p.animate(0);p.parts.armR.rotation.x=-2.6;p.parts.elbowR.rotation.x=-.4;vue(1.8,1.35,3.6,.93)})()`);
  await wait(750);await shot('salut.jpg');
  await step('marche', `(()=>{const {p}=atelier;p.speed=2.8;p.running=false;for(let i=0;i<30;i++)p.animate(1/60);return {phase:p.phase}})()`);
  await wait(750);await shot('marche.jpg');
  await step('variantes', `(async()=>{
    const {scene,p}=atelier;scene.remove(p.mesh);
    const {makeCharacter}=await import('./src/characters.js');
    const looks=[{chemise:0xf0d6dd,pantalon:0x3a3e46,chignon:true,badge:true,carrure:.93},
      {chemise:0xe8eef4,pantalon:0x22262e,veste:0x2b3140,lunettes:true,badge:true,cravate:0x6e2b33,carrure:1.15}];
    for(let i=0;i<2;i++){const {group}=makeCharacter(looks[i]);group.position.x=(i-.5)*.85;scene.add(group);}
    vue(1.3,1.5,4.1,.93);return 'collègue et directeur';
  })()`);
  await wait(750);await shot('variantes.jpg');
};

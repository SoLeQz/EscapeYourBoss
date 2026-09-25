// Projection locale en mètres pour les boîtes du décor. Les UV suivent le meuble
// lorsqu'il tourne ; un motif ne s'étire plus pour remplir un mur entier.
export function uvBoiteMetrique(geometry) {
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
  for(let i=0;i<p.count;i++){
    const x=Math.abs(n.getX(i)),y=Math.abs(n.getY(i)),z=Math.abs(n.getZ(i));
    if(y>=x&&y>=z)uv.setXY(i,p.getX(i),-p.getZ(i));
    else if(x>=z)uv.setXY(i,p.getZ(i),p.getY(i));
    else uv.setXY(i,p.getX(i),p.getY(i));
  }
  return geometry;
}

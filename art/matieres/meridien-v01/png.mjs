import { inflateSync, deflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
// Décode uniquement les PNG RGB/RGBA sans entrelacement produits par Blender.
// Sert à contrôler les cartes livrées, pas à réimplémenter un encodeur graphique.
export function lirePNG(buffer){
  assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const w=buffer.readUInt32BE(16),h=buffer.readUInt32BE(20),bits=buffer[24],type=buffer[25];
  assert([8,16].includes(bits)&&[2,6].includes(type)&&buffer[28]===0,'PNG Blender non pris en charge');
  const chunks=[];for(let p=8;p<buffer.length;){const n=buffer.readUInt32BE(p);if(buffer.toString('ascii',p+4,p+8)==='IDAT')chunks.push(buffer.subarray(p+8,p+8+n));p+=n+12;}
  const src=inflateSync(Buffer.concat(chunks)),bpp=(type===2?3:4)*bits/8,stride=w*bpp,raw=Buffer.alloc(stride*h);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  let j=0;
  for(let y=0;y<h;y++){
    const f=src[j++];assert(f<=4);
    for(let x=0;x<stride;x++){
      const i=y*stride+x,a=x>=bpp?raw[i-bpp]:0,b=y?raw[i-stride]:0,c=y&&x>=bpp?raw[i-stride-bpp]:0;
      raw[i]=(src[j++]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][f])&255;
    }
  }
  assert.equal(j,src.length);
  const rgb=new Float32Array(w*h*3),step=bits/8,max=bits===8?255:65535;
  for(let i=0;i<w*h;i++)for(let c=0;c<3;c++)rgb[i*3+c]=(bits===8?raw[i*bpp+c]:raw.readUInt16BE(i*bpp+c*step))/max;
  return {width:w,height:h,bits,rgb};
}

export function ecrirePNG8({width,height,rgb}) {
  const table=new Uint32Array(256);
  for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[i]=c;}
  const chunk=(type,data)=>{const label=Buffer.from(type),payload=Buffer.concat([label,data]);let c=0xffffffff;
    for(const b of payload)c=table[(c^b)&255]^(c>>>8);
    const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((c^0xffffffff)>>>0);return Buffer.concat([head,payload,tail]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  const pixels=Buffer.alloc(height*(width*3+1));
  for(let y=0;y<height;y++)for(let x=0;x<width*3;x++)pixels[y*(width*3+1)+x+1]=Math.round(Math.min(1,Math.max(0,rgb[y*width*3+x]))*255);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}

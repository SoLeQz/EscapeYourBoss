// Copies de livraison 8 bits ; masters Blender et PNG 16 bits conservés.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {lirePNG,ecrirePNG8} from './png.mjs';
const dossier=process.argv[2];if(!dossier)throw Error('Indiquer le dossier des PNG maîtres Blender.');
let avant=0,apres=0;
for(const nom of ['bois','textile','moquette','pierre','beton','metal','cuir'])for(const canal of ['color','normal','rough']){
  const fichier=`mat-${nom}-v01-${canal}.png`,master=readFileSync(resolve(dossier,fichier));
  const encoded=ecrirePNG8(lirePNG(master));writeFileSync(resolve('assets',fichier),encoded);avant+=master.length;apres+=encoded.length;
}
console.log(JSON.stringify({pngMaitresOctets:avant,pngLivresOctets:apres,note:'Résolution et canaux conservés ; quantification 8 bits pour ImageBitmap/Three.js.'}));

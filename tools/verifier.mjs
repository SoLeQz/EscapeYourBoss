// Point d'entrée unique ; chaque suite reste exécutable séparément avec npm run test:…
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const racine=fileURLToPath(new URL('../',import.meta.url));
const {scripts}=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
for(const [nom,commande] of Object.entries(scripts).filter(([n])=>n.startsWith('test:'))) {
  console.log('\n'+nom);
  const r=spawnSync(commande,{cwd:racine,shell:true,stdio:'inherit'});
  if(r.status!==0)process.exit(r.status||1);
}
console.log('\nToutes les suites sont validées. Les parcours graphiques Electron se lancent séparément.');

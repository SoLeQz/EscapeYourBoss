// Le projet n'a pas de bundler : le navigateur résout « three » et
// « three/addons/… » par l'import map d'index.html. Node ne la lit pas.
// Ce hook fait la même correspondance vers vendor/, sans symlink ni
// faux paquet dans node_modules.
import { register } from 'node:module';
register('./hook-three.mjs', import.meta.url);

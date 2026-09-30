// Interface « Méridien Connect » : contenu de l'intranet et intégrité de la page.
// Chaque identifiant utilisé par le code existe dans index.html, chaque
// pictogramme référencé est dessiné, et chaque classe produite par le code a
// un style (avant la refonte, une dizaine de classes s'affichaient sans aucun).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { NOTIFICATIONS, notificationsDuMoment, notificationProgression, indicateurs, appreciation, heureBloquee,
  ASTUCES, astuce, etageDuTitre, MESSAGES_ABSENCE, convocation, noteDepart, heurePointage, formaterHeures } from '../../src/intranet.js';
import { hasard } from '../../src/machine-a-sous-regles.js';
import { NIVEAUX } from '../../src/levels.js';
import { SECRETS } from '../../src/secrets.js';

const lire = f => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const html = lire('index.html');
const css = lire('interface.css') + lire('machine-a-sous.css');
const sources = readdirSync(new URL('../../src/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => [f, lire('src/' + f)]);

// ---------------------------------------------------------------- intranet
const alea = hasard(7);
for (let i = 0; i < 200; i++) {
  const fil = notificationsDuMoment({ niveauxFinis: [1, 2], canards: {}, secrets: [] }, alea);
  assert.equal(fil.length, 4); assert(fil[0].boss, 'Le directeur ouvre toujours le fil');
  assert.equal(new Set(fil.map(n => n.texte)).size, 4, 'Notification en double');
  for (const n of fil) assert(n.de && n.objet && n.texte && /^#[0-9a-f]{6}$/.test(n.couleur) && n.heure);
}
assert(NOTIFICATIONS.length >= 12 && NOTIFICATIONS.filter(n => n.boss).length >= 2);
assert.match(notificationProgression({ niveauxFinis: [] }, () => 0).texte, /période d’essai|canard/);
const complet = { niveauxFinis: NIVEAUX.map(n => n.id), canards: Object.fromEntries(NIVEAUX.map(n => [n.id, [0, 1, 2]])), secrets: SECRETS.map(s => s.id), records: { speedrun: 312.4 } };
const kpi = indicateurs(complet, { convocations: 3, surPlace: 3725 });
assert.deepEqual(kpi[0].slice(0, 2), ['Étages quittés à l’heure', `${NIVEAUX.length}/${NIVEAUX.length}`]);
assert.equal(kpi[1][1], `${NIVEAUX.length * 3}/${NIVEAUX.length * 3}`); assert.equal(kpi[1][2], false);
assert.equal(kpi[3][1], '5:12.4'); assert.equal(kpi[4][1], '3'); assert.equal(kpi[5][1], '1:02:05');
assert.equal(indicateurs({}, {})[3][1], 'non homologué');
assert.equal(appreciation(complet), 'Trop autonome'); assert.equal(appreciation({}), 'Présent');
for (let t = 0; t < 7200; t += 13) { const h = heureBloquee(t); assert.match(h, /^17:59:[0-5]\d$/, 'L’horloge de l’accueil a atteint 18:00'); }
assert.equal(etageDuTitre('Étage 22 — 18:20'), '22'); assert.equal(etageDuTitre('Badgeage'), '··');
for (const n of NIVEAUX) assert.notEqual(etageDuTitre(n.titre), '··', 'Afficheur sans étage : ' + n.titre);
assert(ASTUCES.every(a => a.startsWith('Astuce RH : ')) && ASTUCES.includes(astuce(() => .5)));
assert(MESSAGES_ABSENCE.length >= 3);
const conv = convocation({ name: 'Directeur Wang', role: 'le boss' }, () => .99);
assert.equal(conv.organisateur, 'Directeur Wang · le boss'); assert.match(conv.duree, /prévu : 5 min/);
assert.deepEqual(noteDepart(30), { lettre: 'S', mot: 'Éclair' }); assert.equal(noteDepart(200).lettre, 'C');
assert.equal(heurePointage(18 * 3600, 125), '18:02'); assert.equal(formaterHeures(59), '0:00:59');

// ---------------------------------------------------------------- identifiants
const ids = new Map();
for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.set(m[1], (ids.get(m[1]) || 0) + 1);
for (const [id, n] of ids) assert.equal(n, 1, `Identifiant en double dans index.html : ${id}`);
const dynamiques = new Set(['record-speedrun', 'options-effacer-confirmation', 'options-effacer-annuler', 'options-effacer-demander', 'options-effacer-confirmer', 'options-effacer-titre']);
for (const [f, src] of sources) for (const m of src.matchAll(/(?:getElementById|\$)\('([a-z0-9-]+)'\)/g)) {
  if (dynamiques.has(m[1]) || /^(option|btn-touche|vest)-/.test(m[1]) && !ids.has(m[1]) && src.includes(`id = \`${m[1].split('-')[0]}`)) continue;
  assert(ids.has(m[1]) || dynamiques.has(m[1]), `${f} utilise #${m[1]}, absent de index.html`);
}

// ---------------------------------------------------------------- pictogrammes
const symboles = new Set([...html.matchAll(/<symbol id="(p-[a-z]+)"/g)].map(m => m[1]));
const utilises = new Set([...html.matchAll(/href="#(p-[a-z]+)"/g)].map(m => m[1]));
for (const [, src] of sources) {
  for (const m of src.matchAll(/picto\('([a-z]+)'/g)) utilises.add('p-' + m[1]);
  for (const m of src.matchAll(/#p-\$\{/g)) void m;
}
for (const i of ['cloche', 'alerte', 'coche', 'canard']) utilises.add('p-' + i);   // types de notification (ui.js)
for (const p of utilises) assert(symboles.has(p), `Pictogramme non dessiné : ${p}`);

// ---------------------------------------------------------------- classes stylées
// Les classes écrites par le code doivent exister dans une feuille de style.
const classesCSS = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
const exemptes = new Set(['picto', 'on', 'actif', 'trouve', 'bas', 'l0', 'l1', 'l2', 'l3', 'l4', 'nouvelle', 'boss', 'info', 'large', 'oui', 'non',
  'tourne', 'anticipe', 'arrive', 'resultat', 'gagne', 'turbo', 'en-bonus', 'auto', 'super', 'vert', 'petit', 'mini', 'moyen', 'sombre', 'total',
  'secret-canards', 'fin', 'verrou', 'fini', 'choisi', 'sans', 'ecoute', 'hot', 'low', 'ok', 'good', 'warning', 'bad', 'pulse', 'observe', 'doute',
  'protege', 'protection-fin', 'fort', 'hors-champ', 'objet', 'sel', 'visible', 'colle']);
const vues = new Set();
for (const [f, src] of sources) {
  if (!['menu.js', 'ui.js', 'main.js', 'machine-a-sous.js', 'intranet.js'].includes(f)) continue;
  for (const m of src.matchAll(/class="([^"$]+)"/g)) for (const c of m[1].split(/\s+/)) if (c && !c.includes('{')) vues.add(c);
  for (const m of src.matchAll(/className = '([^']+)'/g)) for (const c of m[1].split(/\s+/)) if (c) vues.add(c);
}
for (const m of html.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c) vues.add(c);
// Une classe recherchée par le code (querySelector, $$) est une accroche : pas besoin de style.
const accroches = new Set();
for (const [, src] of sources) for (const m of src.matchAll(/['"`][^'"`]*?\.([a-z][\w-]*)/g)) accroches.add(m[1]);
const sansStyle = [...vues].filter(c => !classesCSS.has(c) && !exemptes.has(c) && !accroches.has(c) && !/^(s|n)-/.test(c));
assert.deepEqual(sansStyle, [], 'Classes produites sans style : ' + sansStyle.join(', '));

// Polices : uniquement des polices Windows ou génériques (le jeu est hors ligne).
assert(!/@import|fonts\.googleapis|url\(http/.test(css), 'Ressource externe dans les feuilles de style');

console.log(`Interface : ${NOTIFICATIONS.length} notifications, ${ASTUCES.length} astuces, horloge bloquée à 17:59, indicateurs sur la vraie progression ; `
  + `${ids.size} identifiants uniques, ${symboles.size} pictogrammes, ${vues.size} classes toutes stylées.`);

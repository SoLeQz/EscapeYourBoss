// Vestiaire : pièces Blender (assets/garde-robe-v01.glb), catalogue et règles.
//
// Chaque pièce doit tenir sur les quatre visages, suivre son os, garder la
// couleur de son emplacement, ne rien libérer de partagé quand on se change,
// et ne rien coûter au Lao D d'origine (aucun appel de dessin en plus).
import '../personnages/dom-bouchon.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {prechargerAnatomieBlender} from '../../src/anatomie-blender.js';
import {prechargerGardeRobe, etatGardeRobe, gardeRobeDisponible, animerGardeRobe, FICHIER_GARDE_ROBE} from '../../src/garde-robe-blender.js';
import {Player} from '../../src/player.js';
import * as G from '../../src/garde-robe.js';

const fichier = n => readFileSync(new URL('../../' + n, import.meta.url));
const lire = async n => { const b = fichier('assets/' + n); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
await prechargerAnatomieBlender(lire);

// ---------------------------------------------------------------- fichier Blender
assert.equal(gardeRobeDisponible(), false);
await assert.rejects(prechargerGardeRobe(async () => null), /absente/);
const etat = await prechargerGardeRobe(lire);
assert.deepEqual(fichier('assets/' + FICHIER_GARDE_ROBE), fichier('art/garde-robe-v01/garde-robe-v01.glb'), 'Le GLB du jeu doit être l’export du .blend');
assert(fichier('art/garde-robe-v01/garde-robe-v01.blend').length > 100000, 'Source Blender manquante');
const rapport = JSON.parse(fichier('art/garde-robe-v01/rapport.json'));
assert.deepEqual(Object.keys(etat).sort(), Object.keys(rapport).sort(), 'Pièces du GLB ≠ rapport Blender');

// Pièces construites ailleurs : lunettes de bureau (tête Blender), cravate et sac (rig).
const HORS_GLB = new Set(['aucun', 'aucune', 'classiques', 'cravate', 'sac']);
const OS_ATTENDU = {tete: 'tete', yeux: 'tete', moustache: 'tete', cou: 'buste', torse: 'buste', dos: 'buste'};
const catalogue = Object.entries(G.PIECES).flatMap(([e, l]) => l.map(p => ({...p, emplacement: e})));
for (const p of catalogue) {
  if (HORS_GLB.has(p.id)) { assert(!etat[p.id], p.id + ' ne doit pas venir du GLB'); continue; }
  const e = etat[p.id];
  assert(e, 'Pièce absente du GLB : ' + p.id);
  assert.equal(e.os, OS_ATTENDU[p.emplacement], 'Os de ' + p.id);
  assert(e.triangles > 300 && e.triangles <= 10000, `Budget de ${p.id} : ${e.triangles} triangles`);
  assert(e.lots <= 8, `Trop de lots pour ${p.id} : ${e.lots}`);
  assert.equal(e.materiaux.includes('teinte'), !!p.teinte, 'Couleur personnalisable de ' + p.id);
  assert.deepEqual(e.roles, {'casquette-helice': ['helice'], jetpack: ['flamme']}[p.id] || [], 'Parties animées de ' + p.id);
}
for (const id of Object.keys(etat)) assert(catalogue.some(p => p.id === id), 'Pièce du GLB hors catalogue : ' + id);
assert.equal(new Set(catalogue.map(p => p.emplacement + p.id)).size, catalogue.length, 'Identifiants en double');
const total = Object.values(etat).reduce((s, e) => s + e.triangles, 0);

// ---------------------------------------------------------------- sur le personnage
const scene = new THREE.Scene();
const p = new Player(scene, {playerStart: {x: 0, z: 0, yaw: 0}, obstacles: []});
const pieces = (id = '') => { const r = []; p.mesh.traverse(o => { if (o.isMesh && o.name.startsWith('Garde-robe:' + id)) r.push(o); }); return r; };
const appels = () => { let n = 0; p.mesh.traverse(o => { if (o.isMesh) n++; }); return n; };
const monde = n => p.parts[n].getWorldPosition(new THREE.Vector3());
const sousOs = (o, os) => { for (let x = o; x; x = x.parent) if (x === os) return true; return false; };

assert.equal(pieces().length, 0, 'Le Lao D d’origine ne porte aucune pièce du vestiaire');
const appelsOrigine = appels();
p.changerApparence(G.APPARENCE_DEFAUT);
assert.equal(appels(), appelsOrigine, 'Tenue par défaut : aucun appel de dessin en plus');

const FORMES = {
  tete: (b, h) => b.max.y > h.y + .07 && Math.hypot((b.min.x + b.max.x) / 2 - h.x, (b.min.z + b.max.z) / 2 - h.z) < .06,
  yeux: (b, h) => b.max.z > h.z + .1 && b.max.z < h.z + .135 && b.min.y > h.y - .03 && b.max.y < h.y + .04 && b.max.x - b.min.x > .16,
  moustache: (b, h) => b.min.z > h.z + .085 && b.max.y < h.y - .025 && b.min.y > h.y - .075,
  cou: (b, h) => b.max.y < h.y - .14 && b.min.y > 1.25 && b.max.z > .1,
  torse: b => b.min.z < -.15 && b.max.x - b.min.x > .38 && b.min.y < 1.02 && b.max.y > 1.4,
  dos: b => b.min.z < -.12 && b.max.y < 1.45,
};
for (const visage of G.VISAGES.map(v => v.id)) {
  for (const x of catalogue) {
    if (HORS_GLB.has(x.id)) continue;
    const a = G.nettoyerApparence({visage, [x.emplacement]: x.id, couleurs: {tete: 0x123456, torse: 0x234567, dos: 0x345678}, cravate: 0xd4af37, cheveux: 0x9c3b1f});
    p.changerApparence(a); p.mesh.updateMatrixWorld(true);
    const liste = pieces(x.id + ':');
    assert(liste.length, `${x.id} absent sur ${visage}`);
    const os = OS_ATTENDU[x.emplacement] === 'tete' ? p.parts.teteMicro : p.parts.upper;
    const b = new THREE.Box3();
    for (const m of liste) {
      assert(sousOs(m, os), `${x.id} doit suivre l’os ${OS_ATTENDU[x.emplacement]}`);
      b.expandByObject(m);
      const couleur = m.material.color.getHex(), attendu = m.name.endsWith(':teinte')
        ? {tete: 0x123456, yeux: 0x123456, torse: 0x234567, dos: 0x345678, cou: 0xd4af37}[x.emplacement]
        : m.name.endsWith(':cheveux') ? 0x9c3b1f : null;
      if (attendu != null) assert.equal(couleur, attendu, `Couleur de ${m.name}`);
    }
    assert(FORMES[x.emplacement](b, monde('head')), `${x.id} mal placé sur ${visage} : ${b.min.toArray().map(v => v.toFixed(3))} → ${b.max.toArray().map(v => v.toFixed(3))}`);
    assert(appels() - appelsOrigine <= 8, `${x.id} : trop d’appels de dessin`);
  }
}

// Le bonnet range le chignon, la casquette le laisse sortir : même nombre d'appels.
const cheveux = () => p.mesh.getObjectByName('Blender:head:cheveux').geometry.attributes.position.count;
p.changerApparence({visage: 'chignon', tete: 'casquette'}); const avecChignon = cheveux(), appelsCasquette = appels();
p.changerApparence({visage: 'chignon', tete: 'bonnet'});
assert(cheveux() < avecChignon, 'Le chignon doit passer sous le bonnet');
assert.equal(appels(), appelsCasquette, 'Chignon rangé : pas d’appel de dessin en plus');
p.changerApparence({visage: 'employe', tete: 'bonnet'}); const sansChignon = cheveux();
p.changerApparence({visage: 'employe', tete: 'casquette'}); assert.equal(cheveux(), sansChignon, 'Seul le visage « chignon » a un chignon');

// Tenue complète : les pièces suivent la tête pendant une emote.
const complete = {tete: 'casquette-helice', yeux: 'pixel', moustache: 'moustache-guidon', cou: 'noeud-papillon', torse: 'cape', dos: 'jetpack'};
p.changerApparence(complete);
assert(appels() - appelsOrigine <= 24, 'Tenue complète : ' + (appels() - appelsOrigine) + ' appels de plus');
assert(!p.parts.sac && p.parts.sangles, 'Le jetpack tient par les sangles, sans le sac');
p.declencherEmote(0);
for (let t = 0; t < 1.2; t += 1 / 60) p.animate(1 / 60);
p.mesh.updateMatrixWorld(true);
const helice = p.mesh.getObjectByName('Garde-robe:casquette-helice:helice');
const local = helice.getWorldPosition(new THREE.Vector3()).applyMatrix4(p.parts.teteMicro.matrixWorld.clone().invert());
assert(local.distanceTo(new THREE.Vector3(0, .185, -.006)) < 1e-4, 'L’hélice doit rester sur la casquette pendant l’emote');

// Hélice qui tourne, flammes qui vacillent.
const anim = p.parts._animGarde;
assert.deepEqual(anim.map(a => a.role).sort(), ['flamme', 'flamme', 'helice']);
animerGardeRobe(anim, 1, 0); const r1 = helice.rotation.y, f1 = anim.find(a => a.role === 'flamme').objet.scale.y;
animerGardeRobe(anim, 1.05, 1); assert.notEqual(helice.rotation.y, r1); assert.notEqual(anim.find(a => a.role === 'flamme').objet.scale.y, f1);

// Se changer garde la place, l'emote en cours, et ne libère que ce qui est propre au personnage.
p.pos.set(3, 0, -2); p.yaw = 1.1; p.animate(0);
const partagees = new Set(), propres = new Set(), liberees = new Set();
for (const m of pieces()) { partagees.add(m.geometry); (/:(teinte|cheveux)$/.test(m.name) ? propres : partagees).add(m.material); }
for (const r of [...partagees, ...propres]) r.addEventListener('dispose', () => liberees.add(r));
const emote = p.emote;
for (let i = 0; i < 12; i++) p.changerApparence(G.apparenceSurprise({niveauxFinis: [1, 2, 3, 4, 5, 6], records: {speedrun: 300}}, () => (i * .37 + .11) % 1));
p.changerApparence(complete);
assert.equal(p.emote, emote, 'L’emote continue pendant l’essayage');
assert(p.mesh.position.distanceTo(new THREE.Vector3(3, 0, -2)) < 1e-9 && Math.abs(p.mesh.rotation.y - 1.1) < 1e-9, 'Se changer ne déplace pas');
for (const r of partagees) assert(!liberees.has(r), 'Ressource partagée du vestiaire libérée');
for (const m of propres) assert(liberees.has(m), 'Matériau teinté non libéré');
assert.equal(p._srcNodes.length, p._dstNodes.length, 'Contour désynchronisé');
assert.equal(scene.children.filter(o => o === p.mesh || o === p.outline).length, 2);
assert.equal(scene.children.length, 2, 'L’ancien personnage doit quitter la scène');

// ---------------------------------------------------------------- règles
const D = G.APPARENCE_DEFAUT, tout = {niveauxFinis: [1, 2, 3, 4, 5, 6], records: {speedrun: 300}};
for (const brut of [null, 42, 'x', [], {}, {tete: 'sombrero', peau: -1, veste: 'bleu', couleurs: 5, badge: 'oui'}])
  assert.deepEqual(G.nettoyerApparence(brut), G.nettoyerApparence(D), 'Apparence abîmée → Lao D d’origine');
const net = G.nettoyerApparence({veste: null, tete: 'couronne', couleurs: {dos: 0xff00ff, tete: 1.5}});
assert.equal(net.veste, null); assert.equal(net.tete, 'couronne'); assert.equal(net.couleurs.dos, 0xff00ff); assert.equal(net.couleurs.tete, D.couleurs.tete);
assert.deepEqual(G.nettoyerApparence(JSON.parse(JSON.stringify(net))), net, 'L’apparence doit survivre au JSON (sauvegarde, réseau)');

const verrouillees = catalogue.filter(x => x.debloque).map(x => x.id).sort();
assert.deepEqual(verrouillees, ['cape', 'casquette-helice', 'couronne', 'gilet-fluo', 'jetpack', 'pixel']);
assert.equal(G.compterPieces({}).total - G.compterPieces({}).debloquees, 6);
assert.equal(G.compterPieces(tout).debloquees, G.compterPieces(tout).total);
assert.deepEqual(G.nouveautes({niveauxFinis: [1]}, {niveauxFinis: [1, 2]}).map(x => x.id), ['gilet-fluo']);
assert.deepEqual(G.nouveautes({}, {records: {speedrun: 1}}).map(x => x.id), ['cape']);
assert.match(G.conditionDeblocage(catalogue.find(x => x.id === 'couronne')), /étage 6/);
assert.equal(G.restreindre({tete: 'couronne', torse: 'cape', dos: 'jetpack', yeux: 'aviateur'}, {}).tete, 'aucun');
assert.equal(G.restreindre({torse: 'cape'}, {}).torse, 'aucun');
assert.equal(G.restreindre({yeux: 'aviateur', dos: 'jetpack'}, {niveauxFinis: [5]}).dos, 'jetpack');
assert.equal(G.restreindre({yeux: 'aviateur'}, {}).yeux, 'aviateur');

// Options du rig : sac, sangles, cravate, lunettes de bureau, chignon rangé.
const o = G.optionsPersonnage({dos: 'jetpack', cou: 'noeud-papillon', yeux: 'aviateur', tete: 'bonnet'});
assert.equal(o.sac, false); assert.equal(o.sangles, true); assert.equal(o.cravate, null); assert.equal(o.lunettes, false); assert.equal(o.sansChignon, true);
const od = G.optionsPersonnage(null);
assert.equal(od.sac, true); assert.equal(od.sangles, false); assert.equal(od.cravate, D.cravate); assert.equal(od.lunettes, true); assert.equal(od.sansChignon, false);

// Surprise : toujours valide, jamais une pièce verrouillée, et variée.
let graine = 7; const alea = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
const vus = new Set(), visages = new Set();
for (let i = 0; i < 300; i++) {
  const s = G.apparenceSurprise({}, alea);
  assert.deepEqual(G.nettoyerApparence(s), s); assert.deepEqual(G.restreindre(s, {}), s, 'Surprise avec une pièce verrouillée');
  vus.add(s.tete); visages.add(s.visage);
}
assert(vus.size >= 8 && visages.size === 4, 'Surprise trop peu variée');

// Tenues toutes faites : chaque pièce citée existe (rien n'est ramené au défaut en silence).
assert(G.TENUES.length >= 8);
for (const t of G.TENUES) {
  const a = G.tenue(t.id);
  for (const [k, v] of Object.entries(t.a)) if (k !== 'couleurs') assert.deepEqual(a[k], v, `Tenue ${t.id} : ${k} inconnu`);
  assert.equal(G.tenueDisponible(t.id, tout), true);
}
assert.equal(G.tenue('inconnue'), null);
assert.equal(G.tenueDisponible('mois', {}), false); assert.equal(G.tenueDisponible('vendredi', {}), true);
assert.deepEqual(G.tenue('lundi'), G.nettoyerApparence(D));

// Badge et collègues.
assert.equal(G.titreBadge(D), 'Développeur, version réunion');
assert.equal(G.titreBadge({veste: null}), 'Développeur, version décontractée');
assert.equal(G.titreBadge(G.tenue('mois')), 'Employé du mois (autoproclamé)');
for (const t of G.TENUES) assert(G.titreBadge(G.tenue(t.id)).length < 44, 'Titre trop long pour le badge : ' + t.id);
assert.equal(G.remarqueTenue(D), null);
assert.match(G.remarqueTenue({torse: 'gilet-fluo'}, () => 0), /maintenance/);
for (const x of catalogue) assert.equal(typeof x.icone, 'string');

// ---------------------------------------------------------------- interface (menu.js)
// Mini-DOM : juste ce que le panneau utilise. Le parcours Windows (--selftest --vestiaire)
// refait la même chose avec de vrais clics et des captures.
class El {
  constructor(tag) { Object.assign(this, {tagName: tag.toUpperCase(), children: [], className: '', style: {}, textContent: '', title: '', disabled: false, html: ''}); }
  set innerHTML(v) { this.html = v; this.children = []; } get innerHTML() { return this.html; }
  appendChild(c) { this.children.push(c); return c; }
  *tous() { for (const c of this.children) { yield c; yield* c.tous(); } }
  querySelectorAll(sel) { if (sel.includes(' ')) return []; const cl = sel.split('.').filter(Boolean); return [...this.tous()].filter(e => cl.every(c => e.className.split(' ').includes(c))); }
  click() { if (!this.disabled) this.onclick?.(); }
  setPointerCapture() {}
}
const elements = new Map(), creer = document.createElement;
document.createElement = tag => tag === 'canvas' ? creer(tag) : new El(tag);
document.getElementById = id => elements.get(id) ?? elements.set(id, new El('div')).get(id);
const $ = id => document.getElementById(id);
const {Menu} = await import('../../src/menu.js');
const jeu = {
  etat: {niveauxFinis: [], records: {}}, player: p, audio: {start() {}}, vestiaire: null,
  ouvrirVestiaire() { this.vestiaire = {brouillon: G.nettoyerApparence(p.apparence), zoom: 'corps', tour: 0, auto: true}; },
  essayerTenue(a) { this.vestiaire.brouillon = G.nettoyerApparence(a); p.changerApparence(this.vestiaire.brouillon); },
  fermerVestiaire(garder) { this.ferme = garder; this.vestiaire = null; },
};
p.emote = null; p.changerApparence(null);
const menu = Object.create(Menu.prototype); menu.jeu = jeu; menu.installerVestiaire();
$('btn-vestiaire').click();
const b = () => jeu.vestiaire.brouillon;
const onglet = id => { const o = $('vest-onglets').children.find(x => x.html.includes(id)); assert(o, 'Onglet ' + id); o.click(); };
const cartes = () => $('vest-contenu').querySelectorAll('vest-carte'), teintes = () => $('vest-contenu').querySelectorAll('vest-teinte');
const carte = nom => cartes().find(c => c.html.includes(`<span>${nom}</span>`));
assert.equal($('vest-onglets').children.length, 8);
const {total: nPieces} = G.compterPieces({});
assert.equal($('vest-compteur').textContent, `${nPieces - 6}/${nPieces} pièces`);
assert.equal($('vest-titre-badge').textContent, 'Développeur, version réunion');
for (const o of $('vest-onglets').children.map(x => x.html)) { $('vest-onglets').children.find(x => x.html === o).click(); assert(cartes().length + teintes().length > 0, 'Onglet vide : ' + o); }
const ONGLET = {tete: 'Chapeau', yeux: 'Lunettes', moustache: 'Cheveux', cou: 'Cou', torse: 'Cou', dos: 'Dos'};
for (const [slot, liste] of Object.entries(G.PIECES)) for (const x of liste) {
  onglet(ONGLET[slot]); const avant = b()[slot], c = carte(x.nom);
  assert(c, 'Carte absente : ' + x.nom); c.click();
  if (x.debloque) { assert(c.disabled && c.html.includes('🔒') && c.html.includes(G.conditionDeblocage(x)), x.id + ' doit être verrouillé'); assert.equal(b()[slot], avant); }
  else { assert.equal(b()[slot], x.id, 'Clic sur ' + x.nom); assert(carte(x.nom).className.includes('choisi')); }
}
onglet('Chapeau'); carte('Casquette').click(); assert.equal(teintes().length, G.PALETTES.accent.length); teintes()[2].click();
assert.equal(b().couleurs.tete, G.PALETTES.accent[2]); assert.equal(p.mesh.getObjectByName('Garde-robe:casquette:teinte').material.color.getHex(), G.PALETTES.accent[2]);
carte('Casque de chantier').click(); assert.equal(teintes().length, 0, 'Pas de nuancier pour une pièce aux couleurs fixes');
onglet('Tenue'); teintes()[3].click(); assert.equal(b().chemise, G.PALETTES.chemise[3]);
teintes().find(t => t.className.includes('sans')).click(); assert.equal(b().veste, null);
carte('Incognito').click(); assert.equal(b().badge, false); assert.equal(p.parts.badge, undefined, 'Badge retiré');
onglet('Cou'); carte('Col ouvert').click(); const sansCravate = teintes().length; carte('Nœud papillon').click();
assert.equal(teintes().length, sansCravate + G.PALETTES.cravate.length, 'Couleur du nœud proposée'); teintes()[1].click(); assert.equal(b().cravate, G.PALETTES.cravate[1]);
onglet('Tenues'); assert(carte('Employé du mois').disabled); carte('Agent secret').click(); assert.deepEqual(b(), G.tenue('agent'));
$('vest-surprise').click(); assert.deepEqual(G.restreindre(b(), jeu.etat), b(), 'Surprise verrouillée');
$('vest-zoom').click(); assert.equal(jeu.vestiaire.zoom, 'tete'); assert.match($('vest-zoom').textContent, /Corps/);
$('vest-defaut').click(); assert.deepEqual(b(), G.nettoyerApparence(D));
const zone = $('vestiaire-scene'); zone.onpointerdown({clientX: 100, pointerId: 1}); zone.onpointermove({clientX: 150}); zone.onpointerup();
assert(!jeu.vestiaire.auto && Math.abs(jeu.vestiaire.tour - .6) < 1e-9, 'Rotation à la souris'); zone.ondblclick(); assert(jeu.vestiaire.auto);
jeu.etat = tout; menu.majVestiaire(); assert.equal($('vest-compteur').textContent, `${nPieces}/${nPieces} pièces`);
for (const o of ['Chapeau', 'Lunettes', 'Cou', 'Dos', 'Tenues']) { onglet(o); assert(cartes().every(c => !c.disabled), 'Tout est débloqué : ' + o); }
carte('Employé du mois').click(); assert.equal(b().tete, 'couronne'); assert.equal($('vest-titre-badge').textContent, 'Employé du mois (autoproclamé)');
$('vest-garder').click(); assert.equal(jeu.ferme, true);

console.log(`Vestiaire : ${Object.keys(etat).length} pièces Blender (${total} triangles), ${G.VISAGES.length} visages, ` +
  `${G.TENUES.length} tenues ; placement, couleurs, chignon, animations, ressources, règles et panneau OK.`);

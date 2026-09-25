const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { lireSauvegarde } = require('../../electron/sauvegarde.cjs');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'escape-save-test-'));
  try {
    const actuel = path.join(dir, 'EscapeYourBoss.json');
    const ancien = path.join(dir, 'PartirALHeure.json');
    const donnees = { niveauxFinis: [1,2], records: { n1: 33 }, touches: { interagir: ['KeyF'] } };
    await fs.writeFile(ancien, JSON.stringify(donnees));
    assert.deepEqual(await lireSauvegarde(actuel, ancien), donnees);
    assert.equal(await fs.readFile(ancien, 'utf8'), JSON.stringify(donnees));
    await fs.writeFile(actuel, JSON.stringify({ niveauxFinis: [1,2,3] }));
    assert.deepEqual(await lireSauvegarde(actuel, ancien), { niveauxFinis: [1,2,3] });
    assert.equal(await lireSauvegarde(path.join(dir, 'absent')), null);
    console.log('Migration : progression, records et touches repris, ancien fichier intact, nouveau profil prioritaire.');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });

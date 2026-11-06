import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { officialSunatEndpoints, parseSunatConfig } from '../src/config/sunat.js';

async function files(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? files(join(folder, entry.name)) : [join(folder, entry.name)],
    ),
  );
  return nested.flat();
}
const javascript = (await Promise.all(['src', 'scripts'].map(files)))
  .flat()
  .filter((file) => file.endsWith('.js'));
for (const file of javascript) {
  const result = spawnSync(process.execPath, ['--check', resolve(file)], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(1);
  }
}
const history = await readFile('BITACORA.md', 'utf8');
if (!history.includes('2026-10-30')) throw new Error('Falta la entrada inicial en BITACORA.md.');
const configuredEndpoint = 'https://beta.example.test/billService';
assert.equal(
  parseSunatConfig({ SUNAT_ENV: 'beta', SUNAT_BETA_URL: configuredEndpoint }).endpoint,
  configuredEndpoint,
);
assert.equal(parseSunatConfig({ SUNAT_ENV: 'beta' }).endpoint, officialSunatEndpoints.beta);
assert.throws(
  () => parseSunatConfig({ SUNAT_ENV: 'beta', SUNAT_BETA_URL: 'http://example.test' }),
  /SUNAT_BETA_URL debe usar HTTPS/,
);
console.log(`Sintaxis verificada: ${javascript.length} archivos. Bitacora presente.`);

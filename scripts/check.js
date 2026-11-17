import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { parseSunatConfig } from '../src/config/sunat.js';
import { loadSunatCertificate } from '../src/services/sunat-documento.service.js';

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
assert.equal(nodeMajor, 20, 'Las verificaciones deben ejecutarse con Node.js 20.');
assert.ok(nodeMinor >= 12, 'Se requiere Node.js 20.12 o superior.');

async function files(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? files(join(folder, entry.name)) : [join(folder, entry.name)],
    ),
  );
  return nested.flat();
}
const javascript = (await Promise.all(['src', 'scripts', 'tests'].map(files)))
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
// Datos ficticios: estas verificaciones no cargan .env ni contactan SUNAT.
const sunatEnv = {
  SUNAT_URL: 'https://sunat.example.test/billService',
  SUNAT_USERNAME: 'usuario-prueba',
  SUNAT_PASSWORD: 'clave-prueba',
  SUNAT_SERIE_FACTURA: 'F123',
  SUNAT_SERIE_BOLETA: 'B456',
  SUNAT_CODIGO_LOCAL: '0123',
};
for (const endpoint of [
  'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
]) {
  const env = {
    ...sunatEnv,
    SUNAT_URL: endpoint,
    SUNAT_CERTIFICATE_PATH: 'certificado-prueba.pem',
    SUNAT_PRIVATE_KEY_PATH: 'clave-prueba.pem',
  };
  const config = parseSunatConfig(env);
  assert.equal(config.environment, endpoint.includes('e-beta.') ? 'beta' : 'production');
  assert.equal(config.endpoint, env.SUNAT_URL);
  assert.equal(config.username, env.SUNAT_USERNAME);
  assert.equal(config.password, env.SUNAT_PASSWORD);
  assert.equal(config.invoiceSeries, env.SUNAT_SERIE_FACTURA);
  assert.equal(config.receiptSeries, env.SUNAT_SERIE_BOLETA);
  assert.equal(config.localCode, env.SUNAT_CODIGO_LOCAL);
  for (const name of [
    'SUNAT_URL',
    'SUNAT_USERNAME',
    'SUNAT_PASSWORD',
    'SUNAT_SERIE_FACTURA',
    'SUNAT_SERIE_BOLETA',
    'SUNAT_CODIGO_LOCAL',
  ]) {
    for (const value of [undefined, '', '   ']) {
      assert.throws(() => parseSunatConfig({ ...env, [name]: value }), {
        message: `Falta ${name}.`,
      });
    }
  }
}
assert.throws(
  () => parseSunatConfig({ ...sunatEnv, SUNAT_URL: 'http://example.test' }),
  /SUNAT_URL debe usar HTTPS/,
);
// La configuracion se carga sin certificados; el servicio los exige antes de firmar.
for (const paths of [
  {},
  { SUNAT_CERTIFICATE_PATH: 'certificado-prueba.pem' },
  { SUNAT_PRIVATE_KEY_PATH: 'clave-prueba.pem' },
]) {
  const config = parseSunatConfig({ ...sunatEnv, ...paths });
  await assert.rejects(
    () => loadSunatCertificate(config),
    /Faltan las rutas del certificado y la clave privada SUNAT/,
  );
}
console.log(`Sintaxis verificada: ${javascript.length} archivos. Bitacora presente.`);
console.log('Configuracion SUNAT verificada: URL, credenciales y valores requeridos.');
await import('./check-env.js');

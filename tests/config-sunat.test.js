import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSunatConfig, loadSunatConfig } from '../src/config/sunat.js';
import { createSunatBetaService } from '../src/services/sunat-beta.service.js';

const betaUrl = 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService';
const productionUrl = 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService';

test('selecciona los endpoints de beta y produccion sin ejecutar llamadas HTTP', () => {
  assert.equal(parseSunatConfig().endpoint, betaUrl);
  assert.equal(parseSunatConfig({ SUNAT_ENV: 'production' }).endpoint, productionUrl);
  assert.equal(
    parseSunatConfig({ SUNAT_BETA_URL: betaUrl.replace('.pe/', '.pe:443/') }).endpoint,
    betaUrl,
  );
  assert.equal(parseSunatConfig({ NODE_ENV: 'production', SUNAT_ENV: 'beta' }).environment, 'beta');
});

test('rechaza ambientes desconocidos, URLs cruzadas y destinos no autorizados', () => {
  for (const env of [
    { SUNAT_ENV: 'desarrollo' },
    { SUNAT_ENV: '' },
    { SUNAT_BETA_URL: productionUrl },
    { SUNAT_PRODUCTION_URL: betaUrl },
    { SUNAT_BETA_URL: betaUrl.replace('https:', 'http:') },
    { SUNAT_BETA_URL: betaUrl.replace('e-beta.sunat.gob.pe', 'otro.example') },
    { SUNAT_BETA_URL: `${betaUrl}?wsdl` },
    { SUNAT_BETA_URL: `${betaUrl}#fragmento` },
    { SUNAT_BETA_URL: betaUrl.replace('https://', 'https://usuario:clave@') },
  ])
    assert.throws(() => parseSunatConfig(env));
});

test('un adaptador beta rechaza produccion y configuracion manipulada antes de usar fetch', () => {
  const fetchImpl = () => assert.fail('No debe llamar a ningun servicio');
  assert.throws(
    () =>
      createSunatBetaService({ config: parseSunatConfig({ SUNAT_ENV: 'production' }), fetchImpl }),
    /solo permite/,
  );
  assert.throws(
    () =>
      createSunatBetaService({
        config: { environment: 'beta', endpoint: productionUrl, timeoutMs: 30000 },
        fetchImpl,
      }),
    /no corresponde/,
  );
});

test('valida timeout y no acepta valores fuera de rango', () => {
  for (const value of ['0', '999', '60001', 'NaN', '3000.5'])
    assert.throws(() => parseSunatConfig({ SUNAT_TIMEOUT_MS: value }));
  assert.equal(parseSunatConfig({ SUNAT_TIMEOUT_MS: '25000' }).timeoutMs, 25000);
});

test('carga .env con prioridad de proceso y overrides sin modificar process.env', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sunat-config-test-'));
  const previous = process.env.SUNAT_ENV;
  try {
    const envFile = join(directory, '.env');
    await writeFile(
      envFile,
      `SUNAT_ENV=beta\nSUNAT_BETA_URL=${betaUrl}\nSUNAT_PRODUCTION_URL=${productionUrl}\nSUNAT_TIMEOUT_MS=25000\n`,
    );
    process.env.SUNAT_ENV = 'production';
    assert.equal(loadSunatConfig({ envFile }).environment, 'production');
    const config = loadSunatConfig({
      envFile,
      overrides: { SUNAT_ENV: 'beta', SUNAT_TIMEOUT_MS: '20000' },
    });
    assert.equal(config.endpoint, betaUrl);
    assert.equal(config.timeoutMs, 20000);
    assert.equal(process.env.SUNAT_ENV, 'production');
  } finally {
    if (previous === undefined) delete process.env.SUNAT_ENV;
    else process.env.SUNAT_ENV = previous;
    if (resolve(directory).startsWith(`${resolve(tmpdir())}${sep}sunat-config-test-`))
      await rm(directory, { recursive: true, force: true });
  }
});

test('la consola configurada en produccion se detiene antes de crear archivos de pruebas', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sunat-config-test-'));
  try {
    const script = fileURLToPath(new URL('../scripts/probar-sunat-beta.js', import.meta.url));
    assert.throws(
      () =>
        execFileSync(process.execPath, [script], {
          cwd: directory,
          env: { ...process.env, SUNAT_ENV: 'production' },
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 10000,
        }),
      (error) => {
        assert.match(error.stderr, /solo permite SUNAT_ENV=beta/);
        return true;
      },
    );
    assert.deepEqual(await readdir(directory), []);
  } finally {
    if (resolve(directory).startsWith(`${resolve(tmpdir())}${sep}sunat-config-test-`))
      await rm(directory, { recursive: true, force: true });
  }
});

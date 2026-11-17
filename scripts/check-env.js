import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Cada proceso usa archivos ficticios aislados; no se carga el .env del proyecto.
const directory = await mkdtemp(join(tmpdir(), 'comprobantes-env-'));
const childEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    ['SYSTEMROOT', 'WINDIR', 'PATH', 'TEMP', 'TMP'].includes(name.toUpperCase()),
  ),
);
const configUrl = new URL('../src/config/env.js', import.meta.url).href;
const sunatUrl = new URL('../src/config/sunat.js', import.meta.url).href;
const inspectConfig = `
  import { loadConfig } from ${JSON.stringify(configUrl)};
  import { loadSunatConfig } from ${JSON.stringify(sunatUrl)};
  const config = loadConfig();
  console.log(JSON.stringify({
    environment: config.environment,
    username: config.sunat.username,
    endpoint: config.sunat.endpoint,
    diagnosticUsername: loadSunatConfig().username,
    diagnosticEndpoint: loadSunatConfig().endpoint,
    issuerName: config.pdf.issuerName,
  }));
`;

function inspect(args = [], env = {}) {
  return spawnSync(process.execPath, [...args, '--input-type=module', '-e', inspectConfig], {
    cwd: directory,
    env: { ...childEnv, ...env },
    encoding: 'utf8',
  });
}

try {
  const common = [
    'MAIL_MODE=capture',
    'DB_DRIVER=pglite',
    'INTEGRATION_API_KEY=clave-de-integracion-ficticia-de-32-caracteres',
    'ADMIN_PASSWORD_HASH=hash-ficticio',
    'SUNAT_PASSWORD=clave-ficticia',
    'SUNAT_SERIE_FACTURA=F001',
    'SUNAT_SERIE_BOLETA=B001',
    'SUNAT_CODIGO_LOCAL=0000',
    'SUNAT_CERTIFICATE_PATH=certificado-ficticio.pem',
    'SUNAT_PRIVATE_KEY_PATH=clave-ficticia.pem',
  ].join('\n');
  await writeFile(
    join(directory, '.env'),
    `${common}\nNODE_ENV=development\nSUNAT_URL=https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService\nSUNAT_USERNAME=local\nPDF_ISSUER_NAME=Solo local\n`,
  );
  await writeFile(
    join(directory, '.env.production'),
    `${common}\nCOMPROBANTES_ENV_FILE=.env.production\nNODE_ENV=production\nSUNAT_URL=https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService\nSUNAT_USERNAME=produccion\n`,
  );

  const local = inspect();
  assert.equal(local.status, 0, local.stderr);
  assert.deepEqual(JSON.parse(local.stdout), {
    environment: 'development',
    username: 'local',
    endpoint: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
    diagnosticUsername: 'local',
    diagnosticEndpoint: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
    issuerName: 'Solo local',
  });

  // NODE_ENV no debe cambiar la URL ni impedir probar beta dentro de un contenedor.
  const betaInContainer = inspect([], { NODE_ENV: 'production' });
  assert.equal(betaInContainer.status, 0, betaInContainer.stderr);
  assert.deepEqual(JSON.parse(betaInContainer.stdout), {
    ...JSON.parse(local.stdout),
    environment: 'production',
  });

  // Arranque Node, seleccion por variable y variables inyectadas por el servidor.
  for (const [args, env, username] of [
    [['--env-file=.env.production'], {}, 'produccion'],
    [[], { COMPROBANTES_ENV_FILE: '.env.production' }, 'produccion'],
    [['--env-file=.env.production'], { SUNAT_USERNAME: 'servidor' }, 'servidor'],
  ]) {
    const result = inspect(args, env);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      environment: 'production',
      username,
      endpoint: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
      diagnosticUsername: username,
      diagnosticEndpoint: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
      issuerName: '',
    });
  }

  await rm(join(directory, '.env.production'));
  assert.notEqual(inspect(['--env-file=.env.production']).status, 0);
  // Un archivo seleccionado inexistente nunca recurre al archivo local.
  assert.notEqual(inspect([], { COMPROBANTES_ENV_FILE: '.env.production' }).status, 0);
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log('Archivos de entorno verificados: local, produccion, precedencia y aislamiento.');

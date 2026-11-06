import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

export const officialSunatEndpoints = Object.freeze({
  beta: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  production: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
});

function integer(value, name, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max)
    throw new Error(`${name} debe estar entre ${min} y ${max}.`);
  return number;
}

const required = (value, name) => {
  if (!value?.trim()) throw new Error(`Falta ${name}.`);
  return value.trim();
};

/** Una configuracion y un contrato para beta y produccion; solo cambian credenciales y destino. */
export function parseSunatConfig(env = {}) {
  const environment = env.SUNAT_ENV ?? 'beta';
  if (!Object.hasOwn(officialSunatEndpoints, environment))
    throw new Error('SUNAT_ENV debe ser beta o production.');

  const beta = environment === 'beta';
  const endpointName = beta ? 'SUNAT_BETA_URL' : 'SUNAT_PRODUCTION_URL';
  const endpoint = (env[endpointName] || officialSunatEndpoints[environment]).trim();
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.protocol !== 'https:') throw new Error(`${endpointName} debe usar HTTPS.`);
  const config = {
    environment,
    endpoint,
    timeoutMs: integer(env.SUNAT_TIMEOUT_MS ?? 30000, 'SUNAT_TIMEOUT_MS', 1000, 60000),
    username: env.SUNAT_USERNAME || (beta ? '20000000001MODDATOS' : ''),
    password: env.SUNAT_PASSWORD || (beta ? 'MODDATOS' : ''),
    certificatePath: env.SUNAT_CERTIFICATE_PATH ? resolve(env.SUNAT_CERTIFICATE_PATH) : '',
    privateKeyPath: env.SUNAT_PRIVATE_KEY_PATH ? resolve(env.SUNAT_PRIVATE_KEY_PATH) : '',
    certificateDirectory: resolve(env.SUNAT_CERTIFICATE_DIRECTORY || '.local/sunat/certificados'),
    invoiceSeries: env.SUNAT_SERIE_FACTURA || (beta ? 'F001' : ''),
    receiptSeries: env.SUNAT_SERIE_BOLETA || (beta ? 'B001' : ''),
    localCode: env.SUNAT_CODIGO_LOCAL || (beta ? '0000' : ''),
    undefinedTax: env.SUNAT_AFECTACION_POR_DEFINIR || '',
  };

  config.username = required(config.username, 'SUNAT_USERNAME');
  config.password = required(config.password, 'SUNAT_PASSWORD');
  config.invoiceSeries = required(config.invoiceSeries, 'SUNAT_SERIE_FACTURA');
  config.receiptSeries = required(config.receiptSeries, 'SUNAT_SERIE_BOLETA');
  config.localCode = required(config.localCode, 'SUNAT_CODIGO_LOCAL');
  if (!/^[A-Z0-9]{4}$/.test(config.invoiceSeries) || !/^[A-Z0-9]{4}$/.test(config.receiptSeries))
    throw new Error('Las series SUNAT deben contener cuatro caracteres alfanumericos.');
  if (!/^\d{4}$/.test(config.localCode))
    throw new Error('SUNAT_CODIGO_LOCAL debe contener cuatro digitos.');
  if (!['', 'EXONERADO', 'INAFECTO'].includes(config.undefinedTax))
    throw new Error('SUNAT_AFECTACION_POR_DEFINIR debe ser EXONERADO, INAFECTO o vacio.');
  if (!beta && (!config.certificatePath || !config.privateKeyPath))
    throw new Error(
      'Produccion requiere SUNAT_CERTIFICATE_PATH y SUNAT_PRIVATE_KEY_PATH institucionales.',
    );
  return Object.freeze(config);
}

/** Precedencia: overrides > entorno del proceso > .env > valores predeterminados. */
export function loadSunatConfig({ envFile = resolve('.env'), overrides = {} } = {}) {
  const file = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  return parseSunatConfig({ ...file, ...process.env, ...overrides });
}

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

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

/** La URL configurada define el destino SUNAT; no se requiere SUNAT_ENV. */
export function parseSunatConfig(env = {}) {
  const endpoint = required(env.SUNAT_URL, 'SUNAT_URL');
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.protocol !== 'https:') throw new Error('SUNAT_URL debe usar HTTPS.');
  const config = {
    // Se conserva como dato interno porque beta tiene certificado y RUC de prueba propios.
    // El despliegue lo determina con la URL configurada, sin otra variable de entorno.
    environment: endpointUrl.hostname === 'e-beta.sunat.gob.pe' ? 'beta' : 'production',
    endpoint,
    timeoutMs: integer(env.SUNAT_TIMEOUT_MS ?? 30000, 'SUNAT_TIMEOUT_MS', 1000, 60000),
    username: required(env.SUNAT_USERNAME, 'SUNAT_USERNAME'),
    password: required(env.SUNAT_PASSWORD, 'SUNAT_PASSWORD'),
    certificatePath: env.SUNAT_CERTIFICATE_PATH ? resolve(env.SUNAT_CERTIFICATE_PATH) : '',
    privateKeyPath: env.SUNAT_PRIVATE_KEY_PATH ? resolve(env.SUNAT_PRIVATE_KEY_PATH) : '',
    certificateDirectory: resolve(env.SUNAT_CERTIFICATE_DIRECTORY || '.local/sunat/certificados'),
    invoiceSeries: required(env.SUNAT_SERIE_FACTURA, 'SUNAT_SERIE_FACTURA'),
    receiptSeries: required(env.SUNAT_SERIE_BOLETA, 'SUNAT_SERIE_BOLETA'),
    localCode: required(env.SUNAT_CODIGO_LOCAL, 'SUNAT_CODIGO_LOCAL'),
    undefinedTax: env.SUNAT_AFECTACION_POR_DEFINIR || '',
  };

  if (!/^[A-Z0-9]{4}$/.test(config.invoiceSeries) || !/^[A-Z0-9]{4}$/.test(config.receiptSeries))
    throw new Error('Las series SUNAT deben contener cuatro caracteres alfanumericos.');
  if (!/^\d{4}$/.test(config.localCode))
    throw new Error('SUNAT_CODIGO_LOCAL debe contener cuatro digitos.');
  if (!['', 'EXONERADO', 'INAFECTO'].includes(config.undefinedTax))
    throw new Error('SUNAT_AFECTACION_POR_DEFINIR debe ser EXONERADO, INAFECTO o vacio.');
  return Object.freeze(config);
}

/** Precedencia: overrides > entorno del proceso > archivo seleccionado > valores predeterminados. */
export function loadSunatConfig({
  envFile = resolve(process.env.COMPROBANTES_ENV_FILE || '.env'),
  overrides = {},
} = {}) {
  const file = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  return parseSunatConfig({ ...file, ...process.env, ...overrides });
}

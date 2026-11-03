import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const defaults = Object.freeze({
  beta: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  production: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
});

function validateEndpoint(value, environment) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`URL SUNAT invalida para ${environment}.`);
  }
  // Acepta el :443 explicito del WSDL. Impide mezclar ambientes o enviar credenciales a otro host.
  if (url.href !== defaults[environment])
    throw new Error(`El endpoint SUNAT no corresponde al servicio oficial de ${environment}.`);
  return url.href;
}

function validateTimeout(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1000 || number > 60000)
    throw new Error('SUNAT_TIMEOUT_MS debe estar entre 1000 y 60000.');
  return number;
}

/** Puro: selecciona configuracion; no habilita ni ejecuta emision. */
export function parseSunatConfig(env = {}) {
  const environment = env.SUNAT_ENV ?? 'beta';
  if (!Object.hasOwn(defaults, environment))
    throw new Error('SUNAT_ENV debe ser beta o production.');
  const endpoints = {
    beta: validateEndpoint(env.SUNAT_BETA_URL ?? defaults.beta, 'beta'),
    production: validateEndpoint(env.SUNAT_PRODUCTION_URL ?? defaults.production, 'production'),
  };
  return Object.freeze({
    environment,
    endpoint: endpoints[environment],
    timeoutMs: validateTimeout(env.SUNAT_TIMEOUT_MS ?? 30000),
  });
}

/** Precedencia: overrides > entorno del proceso > .env > valores predeterminados. */
export function loadSunatConfig({ envFile = resolve('.env'), overrides = {} } = {}) {
  const file = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  return parseSunatConfig({ ...file, ...process.env, ...overrides });
}

export function requireBetaConfig(config) {
  if (config?.environment !== 'beta')
    throw new Error(
      'Este circuito solo permite SUNAT_ENV=beta. El adaptador de produccion aun no esta implementado.',
    );
  return Object.freeze({
    environment: 'beta',
    endpoint: validateEndpoint(config.endpoint, 'beta'),
    timeoutMs: validateTimeout(config.timeoutMs),
  });
}

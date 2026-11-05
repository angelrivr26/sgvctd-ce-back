import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { databaseSchema } from '../database/schema.js';
import { parseSunatConfig } from './sunat.js';

export function loadConfig(overrides = {}) {
  const envPath = resolve('.env');
  if (existsSync(envPath) && !process.env.COMPROBANTES_SKIP_ENV) process.loadEnvFile(envPath);
  const env = { ...process.env, ...overrides };
  const integer = (name, fallback, min, max) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`Configuracion invalida: ${name}`);
    return value;
  };
  const config = {
    environment: env.NODE_ENV || 'development',
    host: env.HOST || '127.0.0.1',
    port: integer('PORT', 4005, 1024, 65535),
    appOrigin: env.APP_ORIGIN || 'http://localhost:4205',
    databaseDriver: env.DB_DRIVER || 'pglite',
    databaseUrl: env.DATABASE_URL,
    databaseSchema: env.DB_SCHEMA || undefined,
    databaseSsl: env.DB_SSL === 'true',
    databasePoolMax: integer('DB_POOL_MAX', 5, 1, 30),
    databaseConnectTimeoutMs: integer('DB_CONNECT_TIMEOUT_MS', 5000, 1000, 60000),
    databaseStatementTimeoutMs: integer('DB_STATEMENT_TIMEOUT_MS', 30000, 1000, 300000),
    databaseLockTimeoutMs: integer('DB_LOCK_TIMEOUT_MS', 5000, 1000, 60000),
    dataDirectory: resolve(env.DATA_DIRECTORY || '.local/data'),
    documentDirectory: resolve(env.DOCUMENT_DIRECTORY || '.local/documentos'),
    mailDirectory: resolve(env.MAIL_DIRECTORY || '.local/correos'),
    callbackDirectory: resolve(env.CALLBACK_DIRECTORY || '.local/notificaciones'),
    sunat: parseSunatConfig(env),
    integrationKey: env.INTEGRATION_API_KEY || '',
    adminUsername: env.ADMIN_USERNAME || 'contador',
    adminPasswordHash: env.ADMIN_PASSWORD_HASH || '',
    sessionHours: integer('SESSION_HOURS', 8, 1, 24),
    workerConcurrency: integer('WORKER_CONCURRENCY', 2, 1, 10),
    workerIntervalMs: integer('WORKER_INTERVAL_MS', 1000, 100, 60000),
    leaseSeconds: integer('WORKER_LEASE_SECONDS', 60, 15, 600),
    maxAttempts: integer('WORKER_MAX_ATTEMPTS', 5, 1, 20),
    callbackUrl: env.BOLETOS_CALLBACK_URL || '',
    callbackKey: env.BOLETOS_CALLBACK_KEY || '',
    workersEnabled: env.WORKERS_ENABLED !== 'false',
  };
  if (!['pglite', 'postgres'].includes(config.databaseDriver))
    throw new Error('DB_DRIVER no soportado.');
  if (config.databaseDriver === 'postgres' && !config.databaseUrl)
    throw new Error('Falta DATABASE_URL.');
  config.databaseSchema = databaseSchema(config);
  if (config.leaseSeconds * 1000 <= config.sunat.timeoutMs + 5000)
    throw new Error('WORKER_LEASE_SECONDS debe superar SUNAT_TIMEOUT_MS en mas de 5 segundos.');
  if (config.environment === 'production' && config.sunat.environment !== 'production')
    throw new Error('NODE_ENV=production requiere SUNAT_ENV=production.');
  if (config.integrationKey.length < 32 || !config.adminPasswordHash)
    throw new Error('Ejecute npm run setup:local para configurar el acceso.');
  if (config.callbackUrl) {
    const url = new URL(config.callbackUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
      throw new Error('El callback requiere HTTPS o loopback local.');
    if (config.callbackKey.length < 32)
      throw new Error('Falta BOLETOS_CALLBACK_KEY de al menos 32 caracteres.');
  }
  return Object.freeze(config);
}

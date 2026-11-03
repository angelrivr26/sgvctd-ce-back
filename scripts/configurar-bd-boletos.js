import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { parseEnv, parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { validateSchema } from '../src/database/schema.js';

const { values } = parseArgs({
  options: {
    origen: { type: 'string', default: '../backend-interno/.env' },
    esquema: { type: 'string', default: 'comprobantes' },
    base: { type: 'string', default: 'sgvcb' },
  },
});
const schema = validateSchema(values.esquema);
const source = parseEnv(await readFile(resolve(values.origen), 'utf8'));
if (source.DB_NAME !== values.base)
  throw new Error(
    'La base del archivo de origen no coincide con --base. No se ha modificado .env.',
  );
for (const field of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
  if (!source[field]) throw new Error(`Falta ${field} en el origen. No se ha modificado .env.`);
}
const port = Number(source.DB_PORT || 5432);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Puerto PostgreSQL no valido.');
const url = new URL('postgresql://localhost');
url.hostname = source.DB_HOST;
url.port = String(port);
url.username = source.DB_USER;
url.password = source.DB_PASSWORD;
url.pathname = `/${encodeURIComponent(source.DB_NAME)}`;
const current = await readFile('.env', 'utf8');
const env = parseEnv(current);
if (env.DB_DRIVER === 'postgres' && env.DATABASE_URL === url.href && env.DB_SCHEMA === schema) {
  console.log(`Configuracion ya preparada para base ${source.DB_NAME}, esquema ${schema}.`);
  process.exit(0);
}
function replaceValue(text, key, value) {
  const line = `${key}=${value}`;
  return new RegExp(`^${key}=.*$`, 'm').test(text)
    ? text.replace(new RegExp(`^${key}=.*$`, 'm'), () => line)
    : `${text.trimEnd()}\n${line}\n`;
}
let updated = replaceValue(current, 'DB_DRIVER', 'postgres');
updated = replaceValue(updated, 'DATABASE_URL', url.href);
updated = replaceValue(updated, 'DB_SCHEMA', schema);
await mkdir('.local', { recursive: true });
const backup = `.local/env-antes-postgres-${Date.now()}.backup`;
await copyFile('.env', backup);
await writeFile('.env', updated, { mode: 0o600 });
console.log(
  `Conexion local configurada para base ${source.DB_NAME}, esquema ${schema}. Se conservo una copia privada del .env anterior. No se han creado tablas ni modificado archivos de Boletos.`,
);

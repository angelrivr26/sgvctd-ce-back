import { readdir, readFile } from 'node:fs/promises';
import { validateSchema, quoteSchema } from './schema.js';

/** Script portable revisable. No abre conexiones ni toma credenciales. */
export async function buildMigrationSql(schema = 'comprobantes') {
  validateSchema(schema);
  const quoted = quoteSchema(schema);
  const folder = new URL('../../migrations/', import.meta.url);
  const files = (await readdir(folder)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  const commands = [
    '-- Generado desde migrations/. No editar el archivo generado; agregar una migracion.',
    '-- Ejecutar conectado a la base elegida. Este archivo solo administra el esquema indicado.',
    'BEGIN;',
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '30s';",
    `SELECT pg_advisory_xact_lock(hashtext('sernanp.comprobantes'),hashtext('${schema}'));`,
    `CREATE SCHEMA IF NOT EXISTS ${quoted};`,
    `SET LOCAL search_path TO ${quoted}, pg_catalog;`,
    `CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`,
  ];
  for (const [index, file] of files.entries()) {
    const sql = await readFile(new URL(file, folder), 'utf8');
    const marker = `$comprobantes_migration_${index}$`;
    if (sql.includes(marker))
      throw new Error('La migracion contiene un delimitador reservado para generar SQL.');
    const version = file.replaceAll("'", "''");
    commands.push(
      `DO ${marker}\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version='${version}') THEN\n${sql}\n    INSERT INTO schema_migrations(version) VALUES ('${version}');\n  END IF;\nEND;\n${marker};`,
    );
  }
  commands.push('COMMIT;', '');
  return commands.join('\n\n');
}

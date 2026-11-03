import { readdir, readFile } from 'node:fs/promises';
import { quoteSchema } from './schema.js';

export async function migrate(database) {
  const folder = new URL('../../migrations/', import.meta.url);
  const files = (await readdir(folder)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  await database.transaction(async (tx) => {
    if (database.driver === 'postgres')
      await tx.query(
        "SELECT pg_advisory_xact_lock(hashtext('sernanp.comprobantes'),hashtext($1))",
        [database.schema],
      );
    if (database.schema !== 'public')
      await tx.exec(`CREATE SCHEMA IF NOT EXISTS ${quoteSchema(database.schema)}`);
    await tx.exec(`SET LOCAL search_path TO ${quoteSchema(database.schema)}, pg_catalog`);
    const current = await tx.query('SELECT current_schema() AS esquema');
    if (current[0].esquema !== database.schema)
      throw new Error('No se pudo seleccionar el esquema de Comprobantes.');
    await tx.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const file of files) {
      const done = await tx.query('SELECT version FROM schema_migrations WHERE version = $1', [
        file,
      ]);
      if (done.length) continue;
      await tx.exec(await readFile(new URL(file, folder), 'utf8'));
      await tx.query('INSERT INTO schema_migrations(version) VALUES ($1) RETURNING version', [
        file,
      ]);
    }
  });
}

import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';
import { migrate } from '../src/database/migrate.js';

const config = loadConfig();
let database;
try {
  database = await createDatabase(config);
  await migrate(database);
  const tables = await database.query(
    `SELECT t.table_name AS nombre FROM information_schema.tables AS t
    WHERE t.table_schema=$1 AND t.table_type='BASE TABLE' ORDER BY t.table_name`,
    [database.schema],
  );
  console.log(
    JSON.stringify(
      {
        estado: 'MIGRACIONES_APLICADAS',
        esquema: database.schema,
        tablas: tables.map((row) => row.nombre),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    `No se pudieron aplicar las migraciones (${error.original?.code || error.code || error.name}). No se muestran credenciales.`,
  );
  process.exitCode = 1;
} finally {
  await database?.close();
}

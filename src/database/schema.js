/** Los identificadores SQL no se pueden enviar como parametros: validarlos antes de citarlos. */
export function validateSchema(schema, { allowPublic = false } = {}) {
  if (typeof schema !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(schema)) {
    throw new Error(
      'DB_SCHEMA debe contener solo minusculas, numeros y guion bajo (maximo 63 caracteres).',
    );
  }
  if (
    schema.startsWith('pg_') ||
    schema === 'information_schema' ||
    schema === 'sgvcboletos' ||
    (schema === 'public' && !allowPublic)
  ) {
    throw new Error(
      'DB_SCHEMA debe ser un esquema propio de Comprobantes, separado de Boletos y de los esquemas del sistema.',
    );
  }
  return schema;
}

export function databaseSchema(config) {
  return validateSchema(
    config.databaseSchema || (config.databaseDriver === 'postgres' ? 'comprobantes' : 'public'),
    {
      allowPublic: config.databaseDriver === 'pglite',
    },
  );
}

export const quoteSchema = (schema) => `"${schema}"`;

/** El DBA administra el esquema; la aplicacion solo comprueba que este completo. */
export async function verifyDatabaseSchema(database) {
  const requiredTables = [
    'auditoria',
    'comprobantes',
    'documentos',
    'entregas',
    'sesiones',
    'sunat_control',
    'sunat_envios',
  ];
  // information_schema oculta objetos cuando el usuario no tiene privilegios
  // sobre ellos. El catálogo permite verificar la estructura que creó el DBA.
  const tables = await database.query(
    `SELECT relation.relname AS table_name
     FROM pg_catalog.pg_class AS relation
     JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = $1
       AND relation.relkind IN ('r', 'p')`,
    [database.schema],
  );
  const existing = new Set(tables.map((row) => row.table_name));
  const missing = requiredTables.filter((table) => !existing.has(table));
  const sequences = await database.query(
    `SELECT relation.relname AS sequence_name
     FROM pg_catalog.pg_class AS relation
     JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = $1
       AND relation.relkind = 'S'
       AND relation.relname = 'sunat_numero_seq'`,
    [database.schema],
  );
  if (!sequences.length) missing.push('sunat_numero_seq');
  if (missing.length) {
    const [connection] = await database.query(
      `SELECT current_database() AS database_name,
              current_user AS database_user,
              current_schema() AS active_schema`,
    );
    throw new Error(
      `Esquema ${database.schema} incompleto en base ${connection.database_name} ` +
        `(usuario ${connection.database_user}, esquema activo ${connection.active_schema || 'ninguno'}). ` +
        `Ejecutar sql/001_esquema.sql. Faltan: ${missing.join(', ')}.`,
    );
  }
}

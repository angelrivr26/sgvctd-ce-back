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
  const tables = await database.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema=$1 AND table_type='BASE TABLE'`,
    [database.schema],
  );
  const existing = new Set(tables.map((row) => row.table_name));
  const missing = requiredTables.filter((table) => !existing.has(table));
  const sequences = await database.query(
    `SELECT sequence_name FROM information_schema.sequences
     WHERE sequence_schema=$1 AND sequence_name='sunat_numero_seq'`,
    [database.schema],
  );
  if (!sequences.length) missing.push('sunat_numero_seq');
  if (missing.length)
    throw new Error(
      `Esquema ${database.schema} incompleto. Ejecutar sql/001_esquema.sql. Faltan: ${missing.join(', ')}.`,
    );
}

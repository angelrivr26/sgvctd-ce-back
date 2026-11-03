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

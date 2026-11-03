import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/database/database.js';
import { migrate } from '../src/database/migrate.js';
import { validateSchema } from '../src/database/schema.js';
import { buildMigrationSql } from '../src/database/migration-sql.js';
import { createComprobanteModel } from '../src/models/comprobante.model.js';
import { createDemoPurchase } from '../src/utils/compra-prueba.js';
import { compraSchema } from '../src/validators/compra.validator.js';
import { readFile } from 'node:fs/promises';

test('rechaza nombres reservados, esquema de Boletos e identificadores SQL no seguros', () => {
  for (const schema of [
    'public',
    'sgvcboletos',
    'pg_catalog',
    'information_schema',
    'pg_temporal',
    '"comprobantes";DROP TABLE x;--',
    'dos,esquemas',
    '',
  ]) {
    assert.throws(() => validateSchema(schema));
  }
  assert.equal(validateSchema('comprobantes'), 'comprobantes');
  assert.equal(validateSchema('comprobantes_qa'), 'comprobantes_qa');
});

test('migraciones y consultas quedan en su esquema sin tocar tablas homonimas ajenas', async () => {
  const db = await createDatabase({
    databaseDriver: 'pglite',
    dataDirectory: 'memory://',
    databaseSchema: 'comprobantes',
  });
  try {
    await db.exec(`CREATE SCHEMA sgvcboletos;
      CREATE TABLE sgvcboletos.sesiones(marca text);
      INSERT INTO sgvcboletos.sesiones VALUES ('conservar-boletos');
      CREATE TABLE public.comprobantes(marca text);
      INSERT INTO public.comprobantes VALUES ('conservar-public');
      CREATE TABLE public.schema_migrations(version text PRIMARY KEY);
      INSERT INTO public.schema_migrations VALUES ('migracion-ajena');`);
    await migrate(db);
    await migrate(db);
    assert.equal((await db.query('SELECT current_schema() AS esquema'))[0].esquema, 'comprobantes');
    const tables = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='comprobantes' AND table_type='BASE TABLE'",
    );
    assert.equal(tables.length, 7);
    assert.equal(
      (await db.query('SELECT count(*)::int AS total FROM schema_migrations'))[0].total,
      2,
    );
    await createComprobanteModel(db).receive(compraSchema.parse(createDemoPurchase()));
    assert.equal((await db.query('SELECT count(*)::int AS total FROM comprobantes'))[0].total, 1);
    assert.equal(
      (await db.query('SELECT marca FROM public.comprobantes'))[0].marca,
      'conservar-public',
    );
    assert.equal(
      (await db.query('SELECT marca FROM sgvcboletos.sesiones'))[0].marca,
      'conservar-boletos',
    );
    assert.equal(
      (await db.query('SELECT version FROM public.schema_migrations'))[0].version,
      'migracion-ajena',
    );
  } finally {
    await db.close();
  }
});

test('el SQL portable puede ejecutarse dos veces y conserva datos existentes', async () => {
  const db = await createDatabase({ databaseDriver: 'pglite', dataDirectory: 'memory://' });
  try {
    const sql = await buildMigrationSql();
    // PGlite no implementa advisory locks entre procesos; el resto del script es SQL PostgreSQL real.
    const localSql = sql.replace(/^SELECT pg_advisory_xact_lock\([^\n]+\);$/m, '');
    await db.exec(localSql);
    await db.query(
      "INSERT INTO comprobantes.schema_migrations(version) VALUES ('verificacion-conservar') RETURNING version",
    );
    await db.exec(localSql);
    const rows = await db.query(
      'SELECT version FROM comprobantes.schema_migrations ORDER BY version',
    );
    assert.deepEqual(
      rows.map((row) => row.version),
      ['001_inicial.sql', '002_documentos_independientes.sql', 'verificacion-conservar'],
    );
    assert.equal((await db.query('SELECT current_schema() AS esquema'))[0].esquema, 'public');
  } finally {
    await db.close();
  }
});

test('la migracion aditiva conserva compras y rutas de documentos anteriores', async () => {
  const db = await createDatabase({ databaseDriver: 'pglite', dataDirectory: 'memory://' });
  try {
    await db.exec(
      await readFile(new URL('../migrations/001_inicial.sql', import.meta.url), 'utf8'),
    );
    await db.exec(
      "CREATE TABLE schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()); INSERT INTO schema_migrations(version) VALUES ('001_inicial.sql');",
    );
    const model = createComprobanteModel(db);
    const { record } = await model.receive(compraSchema.parse(createDemoPurchase()));
    await db.query(
      "UPDATE comprobantes SET estado='PROCESADO',estado_fiscal='SIMULADO',serie='PRUEBA',numero=123 WHERE id=$1 RETURNING id",
      [record.id],
    );
    await db.query(
      "INSERT INTO documentos(id,comprobante_id,tipo,clave,sha256,bytes) VALUES($1,$1,'PDF',$2,$3,10) RETURNING id",
      [record.id, `${record.id}/pdf.pdf`, 'a'.repeat(64)],
    );
    await migrate(db);
    await migrate(db);
    const preserved = await model.get(record.id);
    assert.equal(preserved.numero, 123);
    assert.equal(preserved.estado_documentos, 'DISPONIBLES');
    assert.equal(preserved.version_plantilla, 'simulado-v1');
    assert.equal(preserved.resultado_emision, null);
    assert.equal((await model.document(record.id, 'PDF')).clave, `${record.id}/pdf.pdf`);
  } finally {
    await db.close();
  }
});

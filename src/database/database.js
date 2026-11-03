import { mkdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Sequelize, QueryTypes } from 'sequelize';
import { acquireLocalLock } from './local-lock.js';
import { databaseSchema, quoteSchema } from './schema.js';

/** SQL parametrizado compartido: PGlite local y PostgreSQL con Sequelize. */
export async function createDatabase(config) {
  const schema = databaseSchema(config);
  if (config.databaseDriver === 'pglite') {
    if (config.dataDirectory !== 'memory://')
      await mkdir(config.dataDirectory, { recursive: true });
    const unlock =
      config.dataDirectory === 'memory://'
        ? async () => {}
        : await acquireLocalLock(config.dataDirectory);
    let engine;
    try {
      engine = await PGlite.create(config.dataDirectory);
      await engine.exec(`SET search_path TO ${quoteSchema(schema)}, pg_catalog`);
    } catch (error) {
      await engine?.close().catch(() => {});
      await unlock();
      throw error;
    }
    const adapt = (client) => ({
      query: async (sql, values = []) => (await client.query(sql, values)).rows,
      exec: (sql) => client.exec(sql),
    });
    return {
      ...adapt(engine),
      driver: 'pglite',
      schema,
      transaction: (work) => engine.transaction((client) => work(adapt(client))),
      async close() {
        try {
          await engine.close();
        } finally {
          await unlock();
        }
      },
    };
  }
  const sequelize = new Sequelize(config.databaseUrl, {
    dialect: 'postgres',
    logging: false,
    pool: { min: 0, max: config.databasePoolMax, acquire: 10000, idle: 10000 },
    dialectOptions: {
      ssl: config.databaseSsl ? { require: true, rejectUnauthorized: true } : false,
      connectionTimeoutMillis: config.databaseConnectTimeoutMs || 5000,
      statement_timeout: config.databaseStatementTimeoutMs || 30000,
      lock_timeout: config.databaseLockTimeoutMs || 5000,
      options: `-c search_path=${schema},pg_catalog -c application_name=sernanp_comprobantes`,
    },
  });
  try {
    await sequelize.authenticate();
  } catch (error) {
    await sequelize.close();
    throw error;
  }
  const adapt = (transaction) => ({
    query: (sql, bind = []) => sequelize.query(sql, { bind, type: QueryTypes.SELECT, transaction }),
    exec: (sql) => sequelize.query(sql, { transaction }),
  });
  return {
    ...adapt(),
    driver: 'postgres',
    schema,
    transaction: (work) => sequelize.transaction((transaction) => work(adapt(transaction))),
    close: () => sequelize.close(),
  };
}

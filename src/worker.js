import { loadConfig } from './config/env.js';
import { createDatabase } from './database/database.js';
import { verifyDatabaseSchema } from './database/schema.js';
import { createApplication } from './composition.js';

const config = loadConfig();
if (config.databaseDriver !== 'postgres')
  throw new Error(
    'Los workers separados requieren PostgreSQL. PGlite se ejecuta en un unico proceso local.',
  );
const database = await createDatabase(config);
// WORKER SEPARADO: verificar en solo lectura el esquema preparado por el DBA.
await verifyDatabaseSchema(database);
const services = createApplication(database, config);
// Proceso aparte, sin HTTP. Retoma las fases de envio, documentos y entregas.
// LLAMADO POR: npm run worker. El arranque normal usa src/index.js y no entra por este archivo.
services.worker.start();
console.log(`Worker Comprobantes iniciado: SUNAT ${config.sunat.environment}, PostgreSQL.`);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await services.worker.stop();
  await database.close();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

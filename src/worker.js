import { loadConfig } from './config/env.js';
import { createDatabase } from './database/database.js';
import { verifyDatabaseSchema } from './database/schema.js';
import { createApplicationServices } from './services/application.service.js';

const config = loadConfig();
if (config.databaseDriver !== 'postgres')
  throw new Error(
    'Los workers separados requieren PostgreSQL. PGlite se ejecuta en un unico proceso local.',
  );
const database = await createDatabase(config);
// WORKER SEPARADO: verificar en solo lectura el esquema preparado por el DBA.
await verifyDatabaseSchema(database);
const services = createApplicationServices(database, config);
// Proceso aparte, sin HTTP. Retoma el mismo mapa en FLUJO 05 (emitir) y FLUJO 16 (entregar).
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

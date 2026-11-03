import { loadConfig } from './config/env.js';
import { createDatabase } from './database/database.js';
import { migrate } from './database/migrate.js';
import { createApplicationServices } from './services/application.service.js';

const config = loadConfig();
if (config.databaseDriver !== 'postgres')
  throw new Error(
    'Los workers separados requieren PostgreSQL. PGlite se ejecuta en un unico proceso local.',
  );
const database = await createDatabase(config);
await migrate(database);
const services = createApplicationServices(database, config);
services.worker.start();
console.log('Worker Comprobantes iniciado: proveedor simulado, PostgreSQL.');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await services.worker.stop();
  await database.close();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

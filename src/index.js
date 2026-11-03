import { loadConfig } from './config/env.js';
import { createDatabase } from './database/database.js';
import { migrate } from './database/migrate.js';
import { createApplicationServices } from './services/application.service.js';
import { createApp } from './app.js';

const config = loadConfig();
const database = await createDatabase(config);
await migrate(database);
const services = createApplicationServices(database, config);
const app = createApp({ services, database, config });
const server = app.listen(config.port, config.host);
server.once('listening', () => {
  console.log(
    `Comprobantes: http://${config.host}:${config.port} | ambiente de PRUEBAS | proveedor simulado`,
  );
  if (config.workersEnabled) services.worker.start();
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const requestsClosed = new Promise((resolve) => server.close(resolve));
  server.closeIdleConnections();
  await Promise.all([requestsClosed, services.worker.stop()]);
  await database.close();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
server.on('error', async (error) => {
  console.error('No se pudo iniciar el servidor:', error.code);
  await services.worker.stop();
  await database.close();
  process.exitCode = 1;
});

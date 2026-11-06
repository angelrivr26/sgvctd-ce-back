import { loadConfig } from './config/env.js';
import { createDatabase } from './database/database.js';
import { verifyDatabaseSchema } from './database/schema.js';
import { createApplicationServices } from './services/application.service.js';
import { createApp } from './app.js';

// ARRANQUE. No emite comprobantes.
// CONTINUA EN: services/application.service.js (mapa FLUJO 01 a 18).
// El worker arranca al final, en server.once('listening'), y retoma en FLUJO 05.
// ARRANQUE A: leer configuracion. No abre red ni modifica la base.
const config = loadConfig();
// ARRANQUE B: conectar y verificar en solo lectura el esquema creado por el DBA.
const database = await createDatabase(config);
await verifyDatabaseSchema(database);
// ARRANQUE C: componer servicios y rutas en un unico punto.
const services = createApplicationServices(database, config);
const app = createApp({ services, database, config });
// ARRANQUE D: aceptar HTTP e iniciar workers si estan habilitados.
const server = app.listen(config.port, config.host);
server.once('listening', () => {
  console.log(
    `Comprobantes: http://${config.host}:${config.port} | SUNAT ${config.sunat.environment}`,
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

import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createAuthMiddleware } from './middleware/auth.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { createAuthController } from './controllers/auth.controller.js';
import { createComprobanteController } from './controllers/comprobante.controller.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createComprobanteRouter, createIntegrationRouter } from './routes/comprobante.routes.js';
import { openApiDocument } from './routes/openapi.js';

export function createApp({ services, database, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: config.appOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-API-Key'],
    }),
  );
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.set('X-Request-ID', req.id);
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '256kb', strict: true }));
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 1000,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: {
          codigo: 'LIMITE_SOLICITUDES',
          mensaje: 'Limite temporal de solicitudes. Reintente mas tarde.',
        },
      },
    }),
  );
  const auth = createAuthMiddleware(services.auth, config);
  const controller = createComprobanteController(services.comprobantes);
  app.get('/api/health', async (_req, res) => {
    await database.query('SELECT 1 AS ok');
    res.json({ estado: 'DISPONIBLE', modo: 'PRUEBAS', proveedor: 'SIMULADO', version: '0.1.0' });
  });
  app.get('/api/openapi.json', (_req, res) => res.json(openApiDocument));
  app.use('/api/v1/auth', createAuthRouter(createAuthController(services.auth, config), auth));
  app.use('/api/v1/comprobantes', createComprobanteRouter(controller, auth));
  app.use('/api/v1/integraciones/boletos', createIntegrationRouter(controller, auth));
  app.post('/api/v1/pruebas/compras', auth.session, controller.demo);
  app.use((_req, res) =>
    res
      .status(404)
      .json({ error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: 'Ruta no encontrada.' } }),
  );
  app.use(errorMiddleware);
  return app;
}

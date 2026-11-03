import { Router } from 'express';

export function createComprobanteRouter(controller, middleware) {
  const router = Router();
  router.use(middleware.session);
  router.get('/', controller.list);
  router.get('/:id', controller.detail);
  router.get('/:id/documentos/:tipo', controller.download);
  router.post('/:id/reintentar', controller.retry);
  router.post('/:id/reenviar-correo', controller.resend);
  router.post('/:id/reintentar-entregas', controller.retryDeliveries);
  return router;
}

export function createIntegrationRouter(controller, middleware) {
  const router = Router();
  router.use(middleware.integration);
  router.post('/compras', controller.receive);
  router.get('/comprobantes/:id', controller.detail);
  router.get('/comprobantes/:id/documentos/:tipo', controller.download);
  return router;
}

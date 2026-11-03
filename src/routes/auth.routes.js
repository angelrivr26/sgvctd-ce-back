import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

export function createAuthRouter(controller, middleware) {
  const router = Router();
  const limit = rateLimit({
    windowMs: 15 * 60000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: {
        codigo: 'DEMASIADOS_INTENTOS',
        mensaje: 'Espere antes de volver a intentar ingresar.',
      },
    },
  });
  router.post('/sesion', limit, controller.login);
  router.get('/sesion', middleware.session, controller.me);
  router.delete('/sesion', middleware.session, controller.logout);
  return router;
}

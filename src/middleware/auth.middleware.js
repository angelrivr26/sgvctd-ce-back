import { AppError } from '../utils/errors.js';
import { secureEqual } from '../utils/security.js';

export const sessionCookie = 'comprobantes_session';
export function readSessionCookie(req) {
  const item = (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookie}=`));
  return item ? item.slice(sessionCookie.length + 1) : '';
}

export function createAuthMiddleware(auth, config) {
  return {
    integration(req, _res, next) {
      const key = req.get('x-api-key') || '';
      if (!secureEqual(key, config.integrationKey))
        throw new AppError(
          401,
          'INTEGRACION_NO_AUTORIZADA',
          'Credencial de integracion no valida.',
        );
      next();
    },
    async session(req, _res, next) {
      req.actor = await auth.session(readSessionCookie(req));
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
        req.get('origin') !== config.appOrigin
      ) {
        throw new AppError(403, 'ORIGEN_NO_AUTORIZADO', 'Origen de la solicitud no autorizado.');
      }
      next();
    },
  };
}

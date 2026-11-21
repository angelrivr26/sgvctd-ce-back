import { AppError } from '../utils/errors.js';
import { secureEqual } from '../utils/security.js';

function basicCredentials(req) {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(req.get('authorization') || '');
  if (!match) throw new AppError(401, 'SESION_REQUERIDA', 'Inicie sesion para continuar.');
  const credentials = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = credentials.indexOf(':');
  if (separator < 1) throw new AppError(401, 'SESION_REQUERIDA', 'Inicie sesion para continuar.');
  return { username: credentials.slice(0, separator), password: credentials.slice(separator + 1) };
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
      const { username, password } = basicCredentials(req);
      req.actor = auth.authenticate(username, password);
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

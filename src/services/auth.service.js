import { secureEqual } from '../utils/security.js';
import { AppError } from '../utils/errors.js';

export function createAuthService(config) {
  return {
    authenticate(username, password) {
      if (
        !secureEqual(username, config.adminUsername) ||
        !secureEqual(password, config.adminPassword)
      )
        throw new AppError(401, 'ACCESO_INVALIDO', 'Usuario o clave incorrectos.');
      return username;
    },
  };
}

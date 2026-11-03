import { randomBytes } from 'node:crypto';
import { digest, verifyPassword, secureEqual } from '../utils/security.js';
import { AppError } from '../utils/errors.js';

export function createAuthService(database, config) {
  return {
    async login(username, password) {
      const validPassword = await verifyPassword(password, config.adminPasswordHash);
      if (!secureEqual(username, config.adminUsername) || !validPassword)
        throw new AppError(401, 'ACCESO_INVALIDO', 'Usuario o clave incorrectos.');
      const token = randomBytes(32).toString('hex');
      await database.query('DELETE FROM sesiones WHERE expira_en < now() RETURNING token_hash');
      await database.query(
        `INSERT INTO sesiones(token_hash,usuario,expira_en)
        VALUES($1,$2,now()+($3::int * interval '1 hour')) RETURNING usuario`,
        [digest(token), username, config.sessionHours],
      );
      return { token, usuario: username };
    },
    async session(token) {
      if (!token || !/^[a-f0-9]{64}$/.test(token))
        throw new AppError(401, 'SESION_REQUERIDA', 'Inicie sesion para continuar.');
      const rows = await database.query(
        'SELECT usuario FROM sesiones WHERE token_hash=$1 AND expira_en>now()',
        [digest(token)],
      );
      if (!rows.length)
        throw new AppError(
          401,
          'SESION_REQUERIDA',
          'La sesion ha vencido. Inicie sesion nuevamente.',
        );
      return rows[0].usuario;
    },
    async logout(token) {
      await database.query('DELETE FROM sesiones WHERE token_hash=$1 RETURNING token_hash', [
        digest(token || ''),
      ]);
    },
  };
}

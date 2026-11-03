import { z } from 'zod';
import { AppError } from '../utils/errors.js';
import { readSessionCookie, sessionCookie } from '../middleware/auth.middleware.js';

export function createAuthController(auth, config) {
  return {
    async login(req, res) {
      if (req.get('origin') && req.get('origin') !== config.appOrigin)
        throw new AppError(403, 'ORIGEN_NO_AUTORIZADO', 'Origen no autorizado.');
      const input = z
        .object({ usuario: z.string().min(1).max(80), clave: z.string().min(1).max(200) })
        .strict()
        .parse(req.body);
      const session = await auth.login(input.usuario, input.clave);
      res.cookie(sessionCookie, session.token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.appOrigin.startsWith('https:'),
        maxAge: config.sessionHours * 3600000,
        path: '/api',
      });
      res.json({ usuario: session.usuario, modo: 'PRUEBAS' });
    },
    me(req, res) {
      res.json({ usuario: req.actor, modo: 'PRUEBAS' });
    },
    async logout(req, res) {
      await auth.logout(readSessionCookie(req));
      res.clearCookie(sessionCookie, {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.appOrigin.startsWith('https:'),
        path: '/api',
      });
      res.status(204).end();
    },
  };
}

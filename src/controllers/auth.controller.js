import { z } from 'zod';
import { AppError } from '../utils/errors.js';

export function createAuthController(auth, config) {
  return {
    async login(req, res) {
      if (req.get('origin') && req.get('origin') !== config.appOrigin)
        throw new AppError(403, 'ORIGEN_NO_AUTORIZADO', 'Origen no autorizado.');
      const input = z
        .object({ usuario: z.string().min(1).max(80), clave: z.string().min(1).max(200) })
        .strict()
        .parse(req.body);
      res.json({ usuario: auth.authenticate(input.usuario, input.clave), modo: 'PRUEBAS' });
    },
    me(req, res) {
      res.json({ usuario: req.actor, modo: 'PRUEBAS' });
    },
  };
}

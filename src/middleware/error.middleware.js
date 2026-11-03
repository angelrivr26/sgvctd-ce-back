import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';

export function errorMiddleware(error, req, res, _next) {
  if (error instanceof ZodError)
    return res.status(422).json({
      error: {
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'Revise los datos enviados.',
        detalles: error.issues.map((issue) => ({
          campo: issue.path.join('.'),
          mensaje: issue.message,
        })),
        solicitudId: req.id,
      },
    });
  if (error instanceof AppError)
    return res.status(error.status).json({
      error: {
        codigo: error.code,
        mensaje: error.message,
        detalles: error.details,
        solicitudId: req.id,
      },
    });
  if (error.type === 'entity.too.large')
    return res.status(413).json({
      error: {
        codigo: 'TAMANO_EXCEDIDO',
        mensaje: 'La solicitud excede el limite permitido.',
        solicitudId: req.id,
      },
    });
  if (error instanceof SyntaxError && error.status === 400)
    return res.status(400).json({
      error: {
        codigo: 'JSON_INVALIDO',
        mensaje: 'El cuerpo JSON no es valido.',
        solicitudId: req.id,
      },
    });
  // No imprimir payloads, claves, SQL ni mensajes de infraestructura que puedan incluir datos personales.
  console.error(
    JSON.stringify({ solicitudId: req.id, error: error.code || error.name || 'INTERNO' }),
  );
  return res.status(500).json({
    error: {
      codigo: 'ERROR_INTERNO',
      mensaje: 'No se pudo completar la operacion.',
      solicitudId: req.id,
    },
  });
}

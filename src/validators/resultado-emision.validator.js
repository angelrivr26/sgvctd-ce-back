import { z } from 'zod';
import { ProviderError } from '../utils/errors.js';

const resultSchema = z
  .object({
    estado: z.literal('COMPLETADO'),
    estadoFiscal: z.literal('SIMULADO'),
    simulado: z.literal(true),
    operacionId: z.uuid(),
    serie: z.literal('PRUEBA'),
    numero: z.string().regex(/^[1-9]\d{0,17}$/),
    fechaEmision: z.iso.datetime(),
    documentos: z
      .array(
        z
          .object({
            tipo: z.enum(['XML', 'CDR']),
            contenido: z.string().min(1).max(2_000_000),
          })
          .strict(),
      )
      .length(2),
  })
  .strict();

/** COMPLETADO debe acreditar el resultado del adaptador, nunca solo HTTP 200. */
export function validateEmissionResult(result, operationId) {
  const parsed = resultSchema.safeParse(result);
  if (
    !parsed.success ||
    parsed.data.operacionId !== operationId ||
    !['XML', 'CDR'].every(
      (type) => parsed.data.documentos.filter((doc) => doc.tipo === type).length === 1,
    )
  )
    throw new ProviderError('El proveedor no entrego una confirmacion de emision valida.', {
      uncertain: true,
    });
  return parsed.data;
}

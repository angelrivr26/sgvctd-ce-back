import { z } from 'zod';
import { ProviderError } from '../utils/errors.js';

const resultSchema = z
  .object({
    estado: z.enum(['COMPLETADO', 'RECHAZADO']),
    estadoFiscal: z.enum(['ACEPTADO', 'RECHAZADO', 'ERROR_SOAP']),
    simulado: z.literal(false),
    operacionId: z.uuid(),
    serie: z.string().regex(/^[A-Z0-9]{4}$/),
    numero: z.string().regex(/^[1-9]\d{0,7}$/),
    fechaEmision: z.iso.datetime(),
    perfilTributario: z.enum(['EXONERADO', 'INAFECTO']).nullable(),
    respuestaSunat: z
      .object({
        ambiente: z.enum(['beta', 'production']),
        codigo: z.string().min(1).max(20),
        descripcion: z.string().min(1).max(2000),
        fechaRespuesta: z.iso.datetime(),
      })
      .strict(),
    documentos: z
      .array(
        z
          .object({ tipo: z.enum(['XML', 'CDR']), contenido: z.string().min(1).max(2_000_000) })
          .strict(),
      )
      .max(2),
  })
  .strict()
  .superRefine((value, context) => {
    const accepted = value.estado === 'COMPLETADO';
    if (
      accepted !== (value.estadoFiscal === 'ACEPTADO') ||
      (accepted && value.respuestaSunat.codigo !== '0') ||
      (!accepted && value.respuestaSunat.codigo === '0')
    )
      context.addIssue({ code: 'custom', message: 'Confirmacion SUNAT inconsistente.' });
    if (
      value.estadoFiscal === 'ERROR_SOAP'
        ? value.documentos.length !== 0
        : !['XML', 'CDR'].every(
            (type) => value.documentos.filter((document) => document.tipo === type).length === 1,
          )
    )
      context.addIssue({ code: 'custom', message: 'Documentos SUNAT incompletos.' });
  });

/** COMPLETADO debe acreditar CDR codigo 0; un HTTP exitoso no basta. */
export function validateEmissionResult(result, operationId, expectedState = 'COMPLETADO') {
  const parsed = resultSchema.safeParse(result);
  if (
    !parsed.success ||
    parsed.data.estado !== expectedState ||
    parsed.data.operacionId !== operationId ||
    (expectedState === 'COMPLETADO' &&
      !['XML', 'CDR'].every(
        (type) => parsed.data.documentos.filter((document) => document.tipo === type).length === 1,
      ))
  )
    throw new ProviderError('SUNAT no entrego una confirmacion de emision valida.', {
      uncertain: true,
    });
  return parsed.data;
}

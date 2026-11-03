import { ProviderError } from '../utils/errors.js';

const retryDelay = (attempt) =>
  Math.min(300, 2 ** Math.min(attempt, 8)) + Math.floor(Math.random() * 3);

export function createProcesamientoService({ model, provider, documentos, config }) {
  return {
    async process(record) {
      let confirmed = record.resultado_emision != null;
      try {
        if (!confirmed) {
          // Si se perdio la respuesta externa, reconciliar antes de emitir otra vez.
          const previous = await provider.consultarResultado(record.id);
          const result =
            previous ??
            (await provider.solicitarEmision(record.payload, record.id, record.intentos));
          if (!result || result.estado === 'PENDIENTE') {
            await model.fail(record, {
              message: 'El proveedor simulado sigue procesando.',
              retry: record.intentos < config.maxAttempts,
              delaySeconds: 2,
            });
            return;
          }
          if (result.estado === 'RECHAZADO') {
            await model.fail(record, {
              message: 'Rechazo simulado: revisar los datos con el sistema de origen.',
              retry: false,
              fiscalState: 'RECHAZADO_SIMULADO',
            });
            return;
          }
          if (result.estado !== 'COMPLETADO')
            throw new ProviderError('Respuesta del proveedor no reconocida.', { uncertain: true });
          // Este commit precede cualquier PDF o escritura de documentos.
          const saved = await model.saveEmission(record, result);
          if (!saved) return;
          record = saved;
          confirmed = true;
        }
        const generating = await model.startDocuments(record);
        if (!generating) return;
        const result = await documentos.generate(generating);
        await model.complete(generating, result.documents, result.templateVersion);
      } catch (error) {
        const known = error instanceof ProviderError;
        await model.fail(record, {
          message: confirmed
            ? 'La emision simulada esta confirmada. Fallo la preparacion de documentos; se recuperara sin volver a emitir.'
            : known
              ? error.message
              : 'No se pudo confirmar el resultado del proveedor.',
          uncertain: !confirmed && (!known || error.uncertain),
          retry: record.intentos < config.maxAttempts,
          delaySeconds: retryDelay(record.intentos),
        });
      }
    },
  };
}

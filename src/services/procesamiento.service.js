import { ProviderError } from '../utils/errors.js';

const retryDelay = (attempt) =>
  Math.min(300, 2 ** Math.min(attempt, 8)) + Math.floor(Math.random() * 3);

export function createProcesamientoService({ model, provider, documentos, config }) {
  async function confirmEmission(record) {
    // FLUJO 07/18: consultar primero el diario; nunca reenviar a ciegas.
    const previous = await provider.consultarResultado(record.id);
    const result =
      previous ?? (await provider.solicitarEmision(record.payload, record.id, record.intentos));

    if (!result || result.estado === 'PENDIENTE') {
      if (result?.esperaCapacidad) await model.defer(record);
      else
        await model.fail(record, {
          message: 'El proveedor sigue procesando.',
          retry: record.intentos < config.maxAttempts,
          delaySeconds: 2,
        });
      return null;
    }

    // FLUJO 11/18: decidir una sola vez entre rechazo y aceptacion.
    if (result.estado === 'RECHAZADO') {
      await model.saveRejection(record, result);
      return null;
    }
    if (result.estado !== 'COMPLETADO')
      throw new ProviderError('Respuesta del proveedor no reconocida.', { uncertain: true });
    return model.saveEmission(record, result);
  }

  async function generateDocuments(record) {
    const generating = await model.startDocuments(record);
    if (!generating) return;
    // FLUJO 14/18: generar y guardar PDF/XML/CDR.
    const generated = await documentos.generate(generating);
    await model.complete(generating, generated.documents, generated.templateVersion);
  }

  return {
    async process(record) {
      // FLUJO 06/18: orquestar emision y documentos de una compra reservada.
      // CONTINUA EN FLUJO 07: confirmEmission().
      let confirmed = record.resultado_emision != null;
      try {
        if (!confirmed) {
          record = await confirmEmission(record);
          if (!record) return;
          confirmed = true;
        }
        await generateDocuments(record);
      } catch (error) {
        // RUTA DE ERROR: programar reintento o atencion sin perder una emision confirmada.
        const known = error instanceof ProviderError;
        await model.fail(record, {
          message: confirmed
            ? 'La emision esta confirmada. Fallo la preparacion de documentos; se recuperara sin volver a emitir.'
            : known
              ? error.message
              : 'No se pudo confirmar el resultado del proveedor.',
          uncertain: !confirmed && (!known || error.uncertain),
          retry: (!known || error.retryable) && record.intentos < config.maxAttempts,
          delaySeconds: retryDelay(record.intentos),
        });
      }
    },
  };
}

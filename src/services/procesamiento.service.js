import { ProviderError } from '../utils/errors.js';

const retryDelay = (attempt) =>
  Math.min(300, 2 ** Math.min(attempt, 8)) + Math.floor(Math.random() * 3);

export function createProcesamientoService({ model, provider, documentos, config }) {
  async function confirmEmission(record) {
    // FASES 2 y 3/6. Funcion interna; no la llama HTTP.
    // LLAMADO POR: process(), solo si la fila todavia no tiene resultado_emision.
    // HACE: pregunta el diario SUNAT. Si no hay respuesta, pide la emision. Despues elige rechazo o aceptacion.
    // CONTINUA EN: sunat.service.js -> consultarResultado() y, si falta, solicitarEmision().
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

    // FASE 3/6, decision unica.
    // RECHAZADO continua en model.saveRejection(). El aviso a Boletos lo toma despues el worker.
    // COMPLETADO continua en model.saveEmission() y luego generateDocuments().
    if (result.estado === 'RECHAZADO') {
      await model.saveRejection(record, result);
      return null;
    }
    if (result.estado !== 'COMPLETADO')
      throw new ProviderError('Respuesta del proveedor no reconocida.', { uncertain: true });
    return model.saveEmission(record, result);
  }

  async function generateDocuments(record) {
    // FASE 4/6. Solo corre despues de una aceptacion guardada.
    // LLAMADO POR: process(), tambien en un reintento si la emision ya estaba confirmada.
    // HACE: reserva la generacion, crea los archivos y cierra el comprobante.
    // CONTINUA EN: model.startDocuments(), documentos.generate() y model.complete().
    const generating = await model.startDocuments(record);
    if (!generating) return;
    const generated = await documentos.generate(generating);
    await model.complete(generating, generated.documents, generated.templateVersion);
  }

  return {
    async process(record) {
      // FASE 2/6. Punto de entrada de una compra ya reservada.
      // LLAMADO POR: workers/procesamiento.worker.js -> emit().
      // HACE: si falta la respuesta SUNAT, la confirma; si ya existe, solo recupera los documentos.
      // CONTINUA EN: confirmEmission(). Si devuelve null, esta funcion termina.
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

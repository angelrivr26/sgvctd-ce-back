export function createEntregaService({ model, comprobantes, correo, integracion, config }) {
  return {
    async process(job) {
      // FASES 5 y 6/6: despachador de entregas independientes.
      // LLAMADO POR: workers/procesamiento.worker.js -> deliver().
      // HACE: carga el comprobante y elige un solo destino: CORREO o BOLETOS.
      // CONTINUA EN: correo.service.js -> send() o integracion-boletos.service.js -> notify().
      try {
        const detail = await comprobantes.detail(job.comprobante_id);
        const state =
          job.tipo === 'CORREO'
            ? await correo.send(job, detail)
            : await integracion.notify(job, detail);
        await model.complete(job, state);
      } catch {
        await model.fail(job, job.intentos < config.maxAttempts, Math.min(300, 2 ** job.intentos));
      }
    },
  };
}

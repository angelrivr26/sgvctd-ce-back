export function createEntregaService({ model, comprobantes, correo, integracion, config }) {
  return {
    async process(job) {
      // FLUJO 17/18.
      // LLAMADO POR: workers/procesamiento.worker.js -> deliver().
      // HACE: carga el comprobante y elige un solo destino: CORREO o BOLETOS.
      // CONTINUA EN: correo.service.js -> send() o integracion-boletos.service.js -> notify() (FLUJO 18).
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

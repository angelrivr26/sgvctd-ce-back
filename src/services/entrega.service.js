export function createEntregaService({ model, comprobantes, correo, integracion, config }) {
  return {
    async process(job) {
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

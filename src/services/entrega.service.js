export function createEntregaService({ model, comprobantes, correo, integracion, config }) {
  return {
    async process(job) {
      // FLUJO 17/18: elegir exactamente un destino segun el tipo del trabajo.
      // CONTINUA EN FLUJO 18: correo.send() o integracion.notify().
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

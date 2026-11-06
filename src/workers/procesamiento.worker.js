/** Un ciclo no se superpone con el anterior. Los limites aplican por proceso. */
export function createWorker({
  comprobanteModel,
  entregaModel,
  procesamiento,
  entregas,
  config,
  onError = (error) => console.error('Fallo de ciclo de trabajo:', error.code || error.name),
}) {
  const timers = new Set();
  const active = new Set();
  let stopped = true;
  async function emit() {
    // FLUJO 05/18, lado del worker.
    // LLAMADO POR: start() al arrancar, y luego el mismo loop cada workerIntervalMs.
    // HACE: pide compras reservadas y procesa cada una. Un ciclo no pisa al anterior.
    // CONTINUA EN: models/comprobante.model.js -> claim() y procesamiento.service.js -> process().
    const purchases = await comprobanteModel.claim(config.workerConcurrency, config.leaseSeconds);
    await Promise.all(purchases.map((record) => procesamiento.process(record)));
  }
  async function deliver() {
    // FLUJO 16/18, lado del worker.
    // LLAMADO POR: start(), en paralelo con emit(). No espera a que termine la emision del mismo ciclo.
    // HACE: reserva entregas ya creadas por complete() o saveRejection().
    // CONTINUA EN: models/entrega.model.js -> claim() y entrega.service.js -> process() (FLUJO 17).
    const notifications = await entregaModel.claim(config.workerConcurrency, config.leaseSeconds);
    await Promise.all(notifications.map((job) => entregas.process(job)));
  }
  function loop(work) {
    if (stopped) return;
    const pending = work()
      .catch(onError)
      .finally(() => {
        active.delete(pending);
        if (!stopped) {
          const timer = setTimeout(() => {
            timers.delete(timer);
            loop(work);
          }, config.workerIntervalMs);
          timers.add(timer);
        }
      });
    active.add(pending);
  }
  return {
    async tick() {
      await emit();
      await deliver();
    },
    start() {
      if (!stopped) return;
      stopped = false;
      loop(emit);
      loop(deliver);
    },
    async stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      await Promise.all([...active]);
    },
  };
}

import { createSimulatedProvider } from './proveedor-fiscal-simulado.service.js';

export function createFiscalProvider(config, database) {
  if (config.provider === 'simulado') return createSimulatedProvider(database);
  throw new Error('Proveedor fiscal no implementado. Consulte docs/CONTRATO_PROVEEDOR.md.');
}

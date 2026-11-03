import { loadConfig } from '../src/config/env.js';
import { createDemoPurchase } from '../src/utils/compra-prueba.js';

const config = loadConfig();
const purchase = createDemoPurchase({
  cantidad: 3,
  tipoComprobante: 'FACTURA',
  modalidad: 'EXPRESS',
});
const response = await fetch(
  `http://${config.host}:${config.port}/api/v1/integraciones/boletos/compras`,
  {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { 'content-type': 'application/json', 'x-api-key': config.integrationKey },
    body: JSON.stringify(purchase),
  },
);
if (!response.ok)
  throw new Error(`No se pudo registrar la compra de prueba: HTTP ${response.status}`);
const result = await response.json();
console.log(
  JSON.stringify(
    {
      compraId: purchase.compraId,
      comprobanteId: result.comprobante.id,
      estado: result.comprobante.estado,
    },
    null,
    2,
  ),
);

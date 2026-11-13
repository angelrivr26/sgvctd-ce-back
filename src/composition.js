import { createComprobanteModel } from './models/comprobante.model.js';
import { createEntregaModel } from './models/entrega.model.js';
import { createAuthService } from './services/auth.service.js';
import { createDocumentosService } from './services/documentos.service.js';
import { createSunatProvider } from './services/sunat.service.js';
import { createComprobanteService } from './services/comprobante.service.js';
import { createProcesamientoService } from './services/procesamiento.service.js';
import { createCorreoService } from './services/correo.service.js';
import { createIntegracionBoletosService } from './services/integracion-boletos.service.js';
import { createEntregaService } from './services/entrega.service.js';
import { createWorker } from './workers/procesamiento.worker.js';

/**
 * MAPA DEL FLUJO DE NEGOCIO.
 *
 * 1. Recepcion: valida y guarda la compra una sola vez; despues responde HTTP 202.
 * 2. Envio: el worker reserva, crea y firma el UBL, lo registra y llama sendBill.
 * 3. Respuesta: guarda SOAP/CDR y confirma aceptacion, rechazo o resultado incierto.
 * 4. Documentos: genera PDF y conserva PDF/XML/CDR con verificacion de integridad.
 * 5. Correo: captura localmente o envia por SMTP, de forma independiente.
 * 6. Boletos: notifica el resultado mediante callback idempotente.
 *
 * Este archivo solo compone dependencias. Ningun servicio abre su propia conexion de BD.
 */
export function createApplication(database, config, { provider, sunat = {}, pdfRenderer } = {}) {
  const model = createComprobanteModel(database);
  const deliveryModel = createEntregaModel(database);
  const documentos = createDocumentosService(config.documentDirectory, {
    pdfConfig: config.pdf,
    pdfRenderer,
  });
  const fiscalProvider = provider ?? createSunatProvider(database, config.sunat, sunat);
  const comprobantes = createComprobanteService(model, documentos);
  const procesamiento = createProcesamientoService({
    model,
    provider: fiscalProvider,
    documentos,
    config,
  });
  const correo = createCorreoService({
    mode: config.mailMode ?? 'capture',
    directory: config.mailDirectory,
    smtp: config.smtp,
  });
  const integracion = createIntegracionBoletosService(config);
  const entregas = createEntregaService({
    model: deliveryModel,
    comprobantes,
    correo,
    integracion,
    config,
  });
  const worker = createWorker({
    comprobanteModel: model,
    entregaModel: deliveryModel,
    procesamiento,
    entregas,
    config,
  });
  return { auth: createAuthService(database, config), comprobantes, worker };
}

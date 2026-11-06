import { createComprobanteModel } from '../models/comprobante.model.js';
import { createEntregaModel } from '../models/entrega.model.js';
import { createAuthService } from './auth.service.js';
import { createArchivoService } from './archivo.service.js';
import { createPdfService } from './pdf.service.js';
import { createDocumentosService } from './documentos.service.js';
import { createSunatProvider } from './sunat.service.js';
import { createComprobanteService } from './comprobante.service.js';
import { createProcesamientoService } from './procesamiento.service.js';
import { createCorreoService } from './correo.service.js';
import { createIntegracionBoletosService } from './integracion-boletos.service.js';
import { createEntregaService } from './entrega.service.js';
import { createWorker } from '../workers/procesamiento.worker.js';

/**
 * MAPA DEL FLUJO PRINCIPAL. Buscar "FLUJO NN" en el codigo.
 *
 * Recepcion (termina con HTTP 202; SUNAT todavia no fue llamada)
 * 01 routes POST /compras          lo llama backend-externo
 * 02 controller.receive            lo llama la ruta
 * 03 comprobante.service.receive   valida el JSON
 * 04 comprobante.model.receive     guarda una sola vez y deja la fila PENDIENTE
 *
 * Emision (la retoma el worker, no el HTTP)
 * 05 worker.emit + model.claim     reserva la compra
 * 06 procesamiento.process         orquesta esa fila
 * 07 sunat.consultarResultado      lee el diario antes de usar la red
 * 08 UBL + firma + model.prepare   deja la solicitud guardada
 * 09 transport.send                un solo POST sendBill
 * 10 parseSunatResponse            convierte SOAP/CDR en aceptado o rechazado
 * 11 confirmEmission               decide el destino de esa respuesta
 * 12 model.saveEmission o saveRejection
 *
 * Documentos y aviso (solo si SUNAT acepto)
 * 13 model.startDocuments
 * 14 documentos.generate           PDF local; XML y CDR salen de SUNAT
 * 15 model.complete                crea los trabajos de entrega
 * 16 worker.deliver + entrega.claim
 * 17 entrega.process               elige correo o callback
 * 18 correo.send o integracion.notify
 *    El rechazo salta de 12 a 16 y solo avisa a Boletos.
 *
 * Este archivo solo conecta piezas. Ningun servicio abre su propia conexion.
 */
export function createApplicationServices(database, config, { provider, sunat = {} } = {}) {
  const model = createComprobanteModel(database);
  const deliveryModel = createEntregaModel(database);
  const files = createArchivoService(config.documentDirectory);
  const pdf = createPdfService();
  const documentos = createDocumentosService({ files, pdf });
  const fiscalProvider = provider ?? createSunatProvider(database, config.sunat, sunat);
  const comprobantes = createComprobanteService(model, files);
  const procesamiento = createProcesamientoService({
    model,
    provider: fiscalProvider,
    documentos,
    config,
  });
  const correo = createCorreoService(config.mailDirectory);
  const integracion = createIntegracionBoletosService(config);
  const entregas = createEntregaService({
    model: deliveryModel,
    comprobantes,
    correo,
    integracion,
    config,
  });
  return {
    auth: createAuthService(database, config),
    comprobantes,
    model,
    deliveryModel,
    files,
    pdf,
    documentos,
    provider: fiscalProvider,
    procesamiento,
    entregas,
    worker: createWorker({
      comprobanteModel: model,
      entregaModel: deliveryModel,
      procesamiento,
      entregas,
      config,
    }),
  };
}

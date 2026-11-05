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
 * MAPA DEL FLUJO PRINCIPAL (buscar "FLUJO NN" para seguirlo en el codigo)
 * 01 route POST                -> 02 controller.receive
 * 02 controller.receive       -> 03 comprobanteService.receive
 * 03 validar compra           -> 04 comprobanteModel.receive -> HTTP 202
 * 05 worker reserva compra    -> 06 procesamiento.process
 * 07 consultar diario SUNAT   -> 08 preparar UBL, firma y solicitud
 * 09 enviar SOAP              -> 10 persistir/interpretar respuesta
 * 11 decidir resultado        -> 12 guardar aceptacion o rechazo
 * 13 habilitar documentos     -> 14 generar PDF/XML/CDR
 * 15 cerrar comprobante       -> 16 worker reserva entregas
 * 17 decidir destino          -> 18 callback a Boletos o captura de correo
 *
 * Este es el unico lugar de composicion: ningun servicio crea conexiones ocultas.
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

import { createComprobanteModel } from '../models/comprobante.model.js';
import { createEntregaModel } from '../models/entrega.model.js';
import { createAuthService } from './auth.service.js';
import { createArchivoService } from './archivo.service.js';
import { createPdfService } from './pdf.service.js';
import { createDocumentosService } from './documentos.service.js';
import { createFiscalProvider } from './proveedor-fiscal.service.js';
import { createComprobanteService } from './comprobante.service.js';
import { createProcesamientoService } from './procesamiento.service.js';
import { createCorreoService } from './correo.service.js';
import { createIntegracionBoletosService } from './integracion-boletos.service.js';
import { createEntregaService } from './entrega.service.js';
import { createWorker } from '../workers/procesamiento.worker.js';

/** Unico lugar de composicion: los servicios no crean conexiones ni dependencias ocultas. */
export function createApplicationServices(database, config) {
  const model = createComprobanteModel(database);
  const deliveryModel = createEntregaModel(database);
  const files = createArchivoService(config.documentDirectory);
  const pdf = createPdfService();
  const documentos = createDocumentosService({ files, pdf });
  const provider = createFiscalProvider(config, database);
  const comprobantes = createComprobanteService(model, files);
  const procesamiento = createProcesamientoService({ model, provider, documentos, config });
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
    provider,
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

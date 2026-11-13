import { compraSchema } from '../validators/compra.validator.js';

export function presentComprobante(record) {
  return {
    id: record.id,
    eventoId: record.evento_id,
    compraId: record.compra_id,
    modalidad: record.payload.modalidad,
    tipoComprobante: record.payload.tipoComprobante,
    comprador: record.payload.comprador,
    total: record.payload.total,
    moneda: record.payload.moneda,
    fechaPago: record.payload.fechaPago,
    cantidadBoletos: record.payload.detalle.reduce((sum, item) => sum + item.boletoIds.length, 0),
    estado: record.estado,
    estadoFiscal: record.estado_fiscal,
    estadoDocumentos: record.estado_documentos,
    fechaEmision: record.resultado_emision?.fechaEmision ?? null,
    respuestaSunat: record.resultado_emision?.respuestaSunat ?? null,
    serie: record.serie,
    numero: record.numero === null ? null : String(record.numero),
    intentos: record.intentos,
    ultimoError: record.ultimo_error,
    estadoCorreo: record.estado_correo ?? null,
    creadoEn: record.creado_en,
    actualizadoEn: record.actualizado_en,
    simulado: false,
  };
}

export function createComprobanteService(model, documentos) {
  return {
    async receive(input, actor) {
      // FASE 1/6: validacion del contrato de entrada.
      // LLAMADO POR: controllers/comprobante.controller.js -> receive().
      // HACE: valida el contrato de la compra. Si el JSON es invalido, no se guarda nada.
      // CONTINUA EN: models/comprobante.model.js -> receive().
      const payload = compraSchema.parse(input);
      const { record, duplicate } = await model.receive(payload, actor);
      return { comprobante: presentComprobante(record), duplicado: duplicate };
    },
    async list(filters) {
      const result = await model.list(filters);
      return {
        datos: result.rows.map(presentComprobante),
        resumen: result.summary,
        pagina: result.page,
        limite: result.limit,
      };
    },
    async detail(id) {
      const result = await model.detail(id);
      return {
        ...presentComprobante(result.record),
        compra: result.record.payload,
        documentos: result.documents.map((document) => ({
          id: document.id,
          tipo: document.tipo,
          sha256: document.sha256,
          bytes: Number(document.bytes),
          descarga: `/api/v1/comprobantes/${id}/documentos/${document.tipo}`,
        })),
        entregas: result.deliveries,
        historial: result.history,
      };
    },
    async retry(id, actor) {
      return presentComprobante(await model.retry(id, actor));
    },
    resend: (id, actor) => model.resend(id, actor),
    retryDeliveries: (id, actor) => model.retryDeliveries(id, actor),
    async download(id, type) {
      const document = await model.document(id, type);
      return { content: await documentos.read(document), hash: document.sha256 };
    },
  };
}

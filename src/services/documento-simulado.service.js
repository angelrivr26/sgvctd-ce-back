const escapeXml = (text) =>
  String(text).replace(
    /[<>&"']/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char],
  );

/** Exclusivo del simulador; nunca produce UBL ni una constancia SUNAT. */
export function prepareSimulatedResult(payload, operationId, row) {
  if (row.estado !== 'COMPLETADO') return { estado: row.estado, operacionId: operationId };
  const fechaEmision = new Date(row.creado_en).toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ComprobanteSimulado sinValidezTributaria="true"><Id>${operationId}</Id><Compra>${escapeXml(payload.compraId)}</Compra><Tipo>${payload.tipoComprobante}</Tipo><Serie>PRUEBA</Serie><Numero>${row.numero}</Numero><FechaEmision>${fechaEmision}</FechaEmision><Total moneda="${payload.moneda}">${payload.total}</Total><Datos>${escapeXml(JSON.stringify(payload))}</Datos></ComprobanteSimulado>`;
  const cdr = `<?xml version="1.0" encoding="UTF-8"?>\n<RespuestaSimulada sinValidezTributaria="true"><Id>${operationId}</Id><Estado>SIMULADO</Estado><Mensaje>No es una constancia SUNAT</Mensaje></RespuestaSimulada>`;
  return {
    estado: 'COMPLETADO',
    estadoFiscal: 'SIMULADO',
    simulado: true,
    operacionId: operationId,
    serie: 'PRUEBA',
    numero: String(row.numero),
    fechaEmision,
    documentos: [
      { tipo: 'XML', contenido: xml },
      { tipo: 'CDR', contenido: cdr },
    ],
  };
}

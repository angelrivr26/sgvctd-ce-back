/** Presentacion unica; solo la etiqueta de validez cambia segun la respuesta SUNAT. */
export function comprobanteTemplate(record) {
  const data = record.payload;
  const result = record.resultado_emision;
  const beta = result.respuestaSunat.ambiente === 'beta';
  const emitted = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(result.fechaEmision));
  const documentName = data.tipoComprobante === 'FACTURA' ? 'FACTURA' : 'BOLETA DE VENTA';
  return {
    version: `sunat-${result.respuestaSunat.ambiente}-v1`,
    title: beta ? `${documentName} DE PRUEBA` : documentName,
    reference: `${result.serie}-${result.numero}`,
    sections: [
      {
        title: 'EMISOR',
        lines: [data.emisor.razonSocial, `RUC: ${data.emisor.ruc}`, data.emisor.direccion],
      },
      {
        title: 'COMPROBANTE',
        lines: [
          `Fecha de emision (Lima): ${emitted}`,
          `Compra: ${data.compraId} | ${data.modalidad}`,
          `Fecha de pago: ${data.fechaPago}`,
        ],
      },
      {
        title: 'COMPRADOR',
        lines: [
          data.comprador.nombre,
          `${data.comprador.tipoDocumento}: ${data.comprador.numeroDocumento}`,
          ...(data.comprador.direccion ? [data.comprador.direccion] : []),
        ],
      },
    ],
    items: data.detalle.map((item) => ({
      title: `${item.cantidad} x ${item.descripcion}`,
      lines: [
        `Boletos: ${item.boletoIds.join(', ')}`,
        `Precio unitario ${data.moneda} ${item.precioUnitario} | Descuento ${data.moneda} ${item.descuento}`,
        `Impuesto informado ${data.moneda} ${item.impuesto} | Afectacion: ${item.afectacion}`,
      ],
      amount: `${data.moneda} ${item.total}`,
    })),
    total: `TOTAL ${data.moneda} ${data.total}`,
    footer: beta
      ? 'ACEPTADO POR SUNAT BETA. DOCUMENTO DE PRUEBA SIN VALIDEZ TRIBUTARIA.'
      : 'COMPROBANTE ELECTRONICO ENVIADO A SUNAT.',
  };
}

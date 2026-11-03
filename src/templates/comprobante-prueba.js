export const templateVersion = 'simulado-v2';

/** Presentacion versionada: consume la compra inmutable y el resultado persistido. */
export function comprobantePruebaTemplate(record) {
  const data = record.payload;
  const result = record.resultado_emision;
  const emitted = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(result.fechaEmision));
  return {
    version: templateVersion,
    title: `${data.tipoComprobante === 'FACTURA' ? 'FACTURA' : 'BOLETA DE VENTA'} DE PRUEBA`,
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
          data.comprador.direccion,
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
    footer: 'SIMULADO. Sin firma digital ni QR fiscal. No acredita aceptacion ante SUNAT.',
  };
}

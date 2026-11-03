import { randomUUID } from 'node:crypto';

/** Datos ficticios exclusivos del generador de pruebas; nunca son defaults fiscales. */
export function createDemoPurchase({
  modalidad = 'NORMAL',
  tipoComprobante = 'BOLETA',
  cantidad = 1,
  escenarioPrueba = 'EXITO',
} = {}) {
  const id = randomUUID();
  return {
    eventoId: randomUUID(),
    origen: 'BOLETOS',
    compraId: `PRUEBA-${id.slice(0, 8)}`,
    estadoPago: 'PAGADO',
    modalidad,
    tipoComprobante,
    fechaPago: new Date().toISOString(),
    moneda: 'PEN',
    emisor: {
      ruc: '20000000001',
      razonSocial: 'EMISOR FICTICIO PARA PRUEBAS',
      direccion: 'Direccion ficticia de pruebas, Lima',
    },
    comprador: {
      tipoDocumento: tipoComprobante === 'FACTURA' ? 'RUC' : 'DNI',
      numeroDocumento: tipoComprobante === 'FACTURA' ? '20000000002' : '00000001',
      nombre: tipoComprobante === 'FACTURA' ? 'EMPRESA FICTICIA DE PRUEBA' : 'COMPRADOR DE PRUEBA',
      direccion: 'Direccion ficticia',
      correo: 'pruebas@example.invalid',
    },
    detalle: Array.from({ length: cantidad }, (_, index) => ({
      boletoIds: [`B-${id.slice(0, 8)}-${index + 1}`],
      descripcion: `Ingreso de prueba - boleto ${index + 1}`,
      cantidad: 1,
      precioUnitario: '30.00',
      descuento: '0.00',
      impuesto: '0.00',
      total: '30.00',
      afectacion: 'POR_DEFINIR',
    })),
    total: `${cantidad * 30}.00`,
    escenarioPrueba,
  };
}

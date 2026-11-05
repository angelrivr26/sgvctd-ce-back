import { z } from 'zod';

export const money = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,6})\.\d{2}$/,
    'Utilice un importe decimal con dos posiciones, por ejemplo 30.00',
  );
const identifier = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
const text = (max) => z.string().trim().min(1).max(max);
export const cents = (value) => BigInt(value.replace('.', ''));

export const compraSchema = z
  .object({
    eventoId: z.uuid(),
    origen: z.literal('BOLETOS'),
    compraId: identifier,
    estadoPago: z.literal('PAGADO'),
    modalidad: z.enum(['NORMAL', 'EXPRESS']),
    tipoComprobante: z.enum(['BOLETA', 'FACTURA']),
    fechaPago: z.iso.datetime({ offset: true }),
    moneda: z.literal('PEN'),
    emisor: z
      .object({ ruc: z.string().regex(/^\d{11}$/), razonSocial: text(200), direccion: text(250) })
      .strict(),
    comprador: z
      .object({
        tipoDocumento: z.enum(['DNI', 'RUC', 'CE', 'PASAPORTE', 'OTRO']),
        numeroDocumento: text(20),
        nombre: text(200),
        direccion: z.string().trim().max(250).optional(),
        correo: z.email().max(254),
      })
      .strict(),
    detalle: z
      .array(
        z
          .object({
            boletoIds: z.array(identifier).min(1).max(200),
            // Campo nuevo desde Boletos. Es opcional durante la transicion para
            // aceptar snapshots antiguos; las compras nuevas siempre lo envian.
            nombreAnp: text(200).optional(),
            descripcion: text(250),
            cantidad: z.number().int().min(1).max(200),
            precioUnitario: money,
            descuento: money,
            impuesto: money,
            total: money,
            afectacion: z.enum(['POR_DEFINIR', 'GRAVADO', 'EXONERADO', 'INAFECTO', 'GRATUITO']),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    total: money,
  })
  .strict()
  .superRefine((value, context) => {
    const issue = (path, message) => context.addIssue({ code: 'custom', path, message });
    if (value.tipoComprobante === 'FACTURA' && !value.comprador.direccion) {
      issue(['comprador', 'direccion'], 'La factura requiere direccion del comprador.');
    }
    if (
      value.tipoComprobante === 'FACTURA' &&
      (value.comprador.tipoDocumento !== 'RUC' || !/^\d{11}$/.test(value.comprador.numeroDocumento))
    ) {
      issue(
        ['comprador', 'numeroDocumento'],
        'La factura requiere comprador con RUC de 11 digitos.',
      );
    }
    if (value.comprador.tipoDocumento === 'DNI' && !/^\d{8}$/.test(value.comprador.numeroDocumento))
      issue(['comprador', 'numeroDocumento'], 'El DNI debe tener 8 digitos.');
    const boletos = new Set();
    let sum = 0n;
    value.detalle.forEach((line, index) => {
      if (line.cantidad !== line.boletoIds.length)
        issue(
          ['detalle', index, 'cantidad'],
          'La cantidad debe corresponder a los boletos de la linea.',
        );
      for (const id of line.boletoIds) {
        if (boletos.has(id))
          issue(['detalle', index, 'boletoIds'], 'Un boleto no puede repetirse en la compra.');
        boletos.add(id);
      }
      // El formato se valida antes de calcular; nunca usar punto flotante para dinero.
      if (
        [line.precioUnitario, line.descuento, line.impuesto, line.total].every(
          (amount) => money.safeParse(amount).success,
        )
      ) {
        const calculated =
          BigInt(line.cantidad) * cents(line.precioUnitario) -
          cents(line.descuento) +
          cents(line.impuesto);
        if (calculated < 0n || calculated !== cents(line.total))
          issue(
            ['detalle', index, 'total'],
            'El total de la linea no coincide con cantidad, precio, descuento e impuesto.',
          );
        sum += cents(line.total);
      }
    });
    if (boletos.size > 200)
      issue(['detalle'], 'Maximo 200 boletos por compra en este contrato inicial.');
    if (money.safeParse(value.total).success && sum !== cents(value.total))
      issue(['total'], 'El total no coincide con la suma del detalle.');
  });

export const listSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(15),
    fecha: z.iso.date().optional(),
    estado: z.enum(['PENDIENTE', 'PROCESANDO', 'PROCESADO', 'REQUIERE_ATENCION']).optional(),
    modalidad: z.enum(['NORMAL', 'EXPRESS']).optional(),
    tipo: z.enum(['BOLETA', 'FACTURA']).optional(),
    buscar: z.string().trim().max(80).optional(),
  })
  .strict();

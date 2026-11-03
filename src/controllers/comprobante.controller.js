import { z } from 'zod';
import { listSchema } from '../validators/compra.validator.js';
import { createDemoPurchase } from '../utils/compra-prueba.js';

const id = (req) => z.uuid().parse(req.params.id);
export function createComprobanteController(service) {
  return {
    async receive(req, res) {
      res.status(202).json(await service.receive(req.body, 'BOLETOS'));
    },
    async list(req, res) {
      res.json(await service.list(listSchema.parse(req.query)));
    },
    async detail(req, res) {
      res.json(await service.detail(id(req)));
    },
    async retry(req, res) {
      res.status(202).json(await service.retry(id(req), req.actor));
    },
    async resend(req, res) {
      res.status(202).json(await service.resend(id(req), req.actor));
    },
    async retryDeliveries(req, res) {
      res.status(202).json(await service.retryDeliveries(id(req), req.actor));
    },
    async download(req, res) {
      const type = z.enum(['PDF', 'XML', 'CDR']).parse(req.params.tipo);
      const identifier = id(req);
      const result = await service.download(identifier, type);
      res.set('Cache-Control', 'no-store');
      res.set(
        'Content-Disposition',
        `attachment; filename="prueba-${identifier}-${type.toLowerCase()}.${type === 'PDF' ? 'pdf' : 'xml'}"`,
      );
      res.set('X-Content-SHA256', result.hash);
      res.type(type === 'PDF' ? 'application/pdf' : 'application/xml').send(result.content);
    },
    async demo(req, res) {
      const input = z
        .object({
          modalidad: z.enum(['NORMAL', 'EXPRESS']),
          tipoComprobante: z.enum(['BOLETA', 'FACTURA']),
          cantidad: z.number().int().min(1).max(20),
          escenarioPrueba: z.enum([
            'EXITO',
            'RECHAZO',
            'ERROR_TEMPORAL',
            'RESPUESTA_INCIERTA',
            'DEMORADO',
          ]),
        })
        .strict()
        .parse(req.body);
      res.status(202).json(await service.receive(createDemoPurchase(input), req.actor));
    },
  };
}

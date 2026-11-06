import { z } from 'zod';
import { listSchema } from '../validators/compra.validator.js';

const id = (req) => z.uuid().parse(req.params.id);
export function createComprobanteController(service) {
  return {
    async receive(req, res) {
      // FLUJO 02/18.
      // LLAMADO POR: routes/comprobante.routes.js -> POST /compras.
      // HACE: pasa el JSON al servicio y responde 202. El 202 significa recibido, no aceptado por SUNAT.
      // CONTINUA EN: services/comprobante.service.js -> receive() (FLUJO 03).
      res.status(202).json(await service.receive(req.body, 'BOLETOS'));
    },
    // FUERA DEL FLUJO SUNAT. Los usa el panel y la consulta de Boletos; no emiten.
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
        `attachment; filename="comprobante-${identifier}-${type.toLowerCase()}.${type === 'PDF' ? 'pdf' : 'xml'}"`,
      );
      res.set('X-Content-SHA256', result.hash);
      res.type(type === 'PDF' ? 'application/pdf' : 'application/xml').send(result.content);
    },
  };
}

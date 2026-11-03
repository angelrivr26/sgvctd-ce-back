import { ProviderError } from '../utils/errors.js';
import { prepareSimulatedResult } from './documento-simulado.service.js';

/** Contrato del adaptador: consultar antes de emitir; id de operacion estable. */
export function createSimulatedProvider(database) {
  async function consultarResultado(operationId) {
    const rows = await database.query(
      `SELECT p.*,p.disponible_en <= now() AS listo,c.payload
       FROM proveedor_simulado p JOIN comprobantes c ON c.id=p.comprobante_id
       WHERE p.comprobante_id=$1`,
      [operationId],
    );
    if (!rows.length) return null;
    const row = rows[0];
    if (!row.listo) return { estado: 'PENDIENTE', operacionId: operationId };
    return prepareSimulatedResult(row.payload, operationId, row);
  }
  return {
    consultarResultado,
    async solicitarEmision(payload, operationId, attempt) {
      const previous = await consultarResultado(operationId);
      if (previous) return previous;
      if (payload.escenarioPrueba === 'ERROR_TEMPORAL' && attempt === 1)
        throw new ProviderError('Indisponibilidad temporal simulada.');
      await database.query(
        `INSERT INTO proveedor_simulado(comprobante_id,estado,disponible_en)
        VALUES($1,$2,now()+($3::int * interval '1 millisecond')) ON CONFLICT DO NOTHING RETURNING comprobante_id`,
        [
          operationId,
          payload.escenarioPrueba === 'RECHAZO' ? 'RECHAZADO' : 'COMPLETADO',
          payload.escenarioPrueba === 'DEMORADO' ? 1500 : 0,
        ],
      );
      if (payload.escenarioPrueba === 'RESPUESTA_INCIERTA')
        throw new ProviderError('La emision fue recibida pero se perdio la respuesta (simulado).', {
          uncertain: true,
        });
      return consultarResultado(operationId);
    },
  };
}

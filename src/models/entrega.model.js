import { randomUUID } from 'node:crypto';
import { applicationNow, addSeconds } from '../utils/time.js';

export function createEntregaModel(database) {
  return {
    claim(limit, leaseSeconds) {
      // FASES 5 y 6/6.
      // LLAMADO POR: workers/procesamiento.worker.js -> deliver().
      // HACE: reserva entregas PENDIENTES, o PROCESANDO con reserva vencida, sin tomar la misma dos veces.
      // CONTINUA EN: services/entrega.service.js -> process().
      const now = applicationNow();
      const leaseUntil = addSeconds(now, leaseSeconds);
      return database.transaction((tx) =>
        tx.query(
          `WITH candidates AS (
        SELECT id FROM entregas WHERE (estado='PENDIENTE' AND proximo_intento<=$2)
        OR (estado='PROCESANDO' AND reserva_hasta<$2)
        ORDER BY proximo_intento,creado_en,id FOR UPDATE SKIP LOCKED LIMIT $1
      ) UPDATE entregas e SET estado='PROCESANDO',intentos=e.intentos+1,
        reserva_token=$3,reserva_hasta=$4,actualizado_en=$2
        FROM candidates WHERE e.id=candidates.id RETURNING e.*`,
          [limit, now, randomUUID(), leaseUntil],
        ),
      );
    },
    complete(job, state) {
      // FIN DE LA ENTREGA.
      // LLAMADO POR: entrega.service.js -> process(), cuando el destino respondio bien.
      // HACE: marca la entrega terminada y deja auditoria. No vuelve a SUNAT.
      // CONTINUA EN: aqui cierra el recorrido de esa entrega.
      const now = applicationNow();
      return database.transaction(async (tx) => {
        const updated = await tx.query(
          `UPDATE entregas SET estado=$3,ultimo_error=NULL,
          reserva_token=NULL,reserva_hasta=NULL,actualizado_en=$4
          WHERE id=$1 AND reserva_token=$2 RETURNING id`,
          [job.id, job.reserva_token, state, now],
        );
        if (updated.length)
          await tx.query(
            `INSERT INTO auditoria(comprobante_id,accion,actor,detalle,creado_en)
          VALUES($1,$2,'WORKER',$3,$4) RETURNING id`,
            [job.comprobante_id, `${job.tipo}_${state}`, job.id, now],
          );
      });
    },
    fail(job, retry, delaySeconds) {
      // RUTA DE ERROR DE ENTREGA. No cambia el resultado fiscal ni llama a SUNAT.
      // LLAMADO POR: entrega.service.js -> process(), cuando el callback o el archivo local fallan.
      // CONTINUA EN: si quedan intentos, el siguiente deliver() vuelve a tomar la misma entrega.
      const now = applicationNow();
      return database.query(
        `UPDATE entregas SET estado=$3,ultimo_error=$4,
        proximo_intento=$5,reserva_token=NULL,reserva_hasta=NULL,actualizado_en=$6
        WHERE id=$1 AND reserva_token=$2 RETURNING id`,
        [
          job.id,
          job.reserva_token,
          retry ? 'PENDIENTE' : 'REQUIERE_ATENCION',
          'No se pudo completar la entrega. Verifique el servicio destino.',
          addSeconds(now, delaySeconds),
          now,
        ],
      );
    },
  };
}

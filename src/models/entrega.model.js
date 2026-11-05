import { randomUUID } from 'node:crypto';

export function createEntregaModel(database) {
  return {
    claim(limit, leaseSeconds) {
      // FLUJO 16/18: reservar callbacks/correos sin duplicar su ejecucion.
      return database.transaction((tx) =>
        tx.query(
          `WITH candidates AS (
        SELECT id FROM entregas WHERE (estado='PENDIENTE' AND proximo_intento<=now())
        OR (estado='PROCESANDO' AND reserva_hasta<now())
        ORDER BY proximo_intento,creado_en,id FOR UPDATE SKIP LOCKED LIMIT $1
      ) UPDATE entregas e SET estado='PROCESANDO',intentos=e.intentos+1,
        reserva_token=$2,reserva_hasta=now()+($3::int * interval '1 second'),actualizado_en=now()
        FROM candidates WHERE e.id=candidates.id RETURNING e.*`,
          [limit, randomUUID(), leaseSeconds],
        ),
      );
    },
    complete(job, state) {
      // FIN DEL FLUJO 18: guardar el resultado de la entrega y auditarlo.
      return database.transaction(async (tx) => {
        const updated = await tx.query(
          `UPDATE entregas SET estado=$3,ultimo_error=NULL,
          reserva_token=NULL,reserva_hasta=NULL,actualizado_en=now()
          WHERE id=$1 AND reserva_token=$2 RETURNING id`,
          [job.id, job.reserva_token, state],
        );
        if (updated.length)
          await tx.query(
            `INSERT INTO auditoria(comprobante_id,accion,actor,detalle)
          VALUES($1,$2,'WORKER',$3) RETURNING id`,
            [job.comprobante_id, `${job.tipo}_${state}`, job.id],
          );
      });
    },
    fail(job, retry, delaySeconds) {
      // RUTA DE ERROR DE ENTREGA: no cambia el resultado fiscal.
      return database.query(
        `UPDATE entregas SET estado=$3,ultimo_error=$4,
        proximo_intento=now()+($5::int * interval '1 second'),reserva_token=NULL,reserva_hasta=NULL,actualizado_en=now()
        WHERE id=$1 AND reserva_token=$2 RETURNING id`,
        [
          job.id,
          job.reserva_token,
          retry ? 'PENDIENTE' : 'REQUIERE_ATENCION',
          'No se pudo completar la entrega. Verifique el servicio destino.',
          delaySeconds,
        ],
      );
    },
  };
}

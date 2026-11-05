import { randomUUID } from 'node:crypto';
import { canonicalJson, digest } from '../utils/security.js';
import { AppError } from '../utils/errors.js';
import { validateEmissionResult } from '../validators/resultado-emision.validator.js';

function validateDocumentSet(documents, templateVersion) {
  const types = documents.map((document) => document.tipo);
  if (
    documents.length !== 3 ||
    new Set(types).size !== 3 ||
    !['PDF', 'XML', 'CDR'].every((type) => types.includes(type)) ||
    !templateVersion
  )
    throw new Error('El conjunto de documentos esta incompleto.');
}

export function createComprobanteModel(database) {
  const audit = (db, id, action, actor, detail = '') =>
    db.query(
      'INSERT INTO auditoria(comprobante_id,accion,actor,detalle) VALUES($1,$2,$3,$4) RETURNING id',
      [id, action, actor, detail.slice(0, 500)],
    );
  const delivery = (db, id, type) =>
    db.query('INSERT INTO entregas(id,comprobante_id,tipo) VALUES($1,$2,$3) RETURNING id', [
      randomUUID(),
      id,
      type,
    ]);
  async function get(id, db = database) {
    const rows = await db.query('SELECT * FROM comprobantes WHERE id=$1', [id]);
    if (!rows.length) throw new AppError(404, 'NO_ENCONTRADO', 'Comprobante no encontrado.');
    return rows[0];
  }
  return {
    get,
    async receive(payload, actor = 'BOLETOS') {
      // FLUJO 04/18: guardar una sola vez por eventoId y compraId.
      // TERMINA RECEPCION: controller devuelve HTTP 202; el worker retoma en FLUJO 05.
      const { eventoId, ...businessData } = payload;
      const hash = digest(canonicalJson(businessData));
      return database.transaction(async (tx) => {
        const inserted = await tx.query(
          `INSERT INTO comprobantes(id,evento_id,origen,compra_id,payload,payload_hash)
          VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT DO NOTHING RETURNING *`,
          [randomUUID(), eventoId, payload.origen, payload.compraId, JSON.stringify(payload), hash],
        );
        if (inserted.length) {
          await audit(tx, inserted[0].id, 'COMPRA_RECIBIDA', actor);
          return { record: inserted[0], duplicate: false };
        }
        const existing = await tx.query(
          'SELECT * FROM comprobantes WHERE evento_id=$1 OR (origen=$2 AND compra_id=$3)',
          [eventoId, payload.origen, payload.compraId],
        );
        if (
          existing.length !== 1 ||
          existing[0].payload_hash !== hash ||
          existing[0].compra_id !== payload.compraId
        ) {
          throw new AppError(
            409,
            'CONFLICTO_IDEMPOTENCIA',
            'El evento o la compra ya existe con datos diferentes.',
          );
        }
        return { record: existing[0], duplicate: true };
      });
    },
    // CONSULTAS: list/detail no avanzan el flujo; solo presentan el estado actual.
    async list(filters) {
      const values = [];
      const clauses = [];
      const add = (expression, value) => {
        values.push(value);
        clauses.push(expression.replace('?', `$${values.length}`));
      };
      if (filters.fecha)
        add("(creado_en AT TIME ZONE 'America/Lima')::date = ?::date", filters.fecha);
      if (filters.estado) add('estado = ?', filters.estado);
      if (filters.modalidad) add("payload->>'modalidad' = ?", filters.modalidad);
      if (filters.tipo) add("payload->>'tipoComprobante' = ?", filters.tipo);
      if (filters.buscar) {
        values.push(`%${filters.buscar.replace(/[\\%_]/g, '\\$&')}%`);
        const bind = `$${values.length}`;
        clauses.push(
          `(compra_id ILIKE ${bind} OR payload->'comprador'->>'nombre' ILIKE ${bind} OR payload->'comprador'->>'numeroDocumento' ILIKE ${bind})`,
        );
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const totals = await database.query(
        `SELECT count(*)::int AS total,
        count(*) FILTER(WHERE estado='PENDIENTE')::int AS pendientes,
        count(*) FILTER(WHERE estado='PROCESANDO')::int AS procesando,
        count(*) FILTER(WHERE estado='PROCESADO')::int AS procesados,
        count(*) FILTER(WHERE estado='REQUIERE_ATENCION')::int AS incidencias
        FROM comprobantes ${where}`,
        values,
      );
      const rows = await database.query(
        `SELECT c.*,
        (SELECT e.estado FROM entregas e WHERE e.comprobante_id=c.id AND e.tipo='CORREO' ORDER BY e.creado_en DESC,e.id DESC LIMIT 1) AS estado_correo
        FROM comprobantes c ${where} ORDER BY creado_en DESC,id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, filters.limite, (filters.pagina - 1) * filters.limite],
      );
      return { rows, summary: totals[0], page: filters.pagina, limit: filters.limite };
    },
    async detail(id) {
      const record = await get(id);
      const [documents, deliveries, history] = await Promise.all([
        database.query(
          'SELECT id,tipo,sha256,bytes FROM documentos WHERE comprobante_id=$1 ORDER BY tipo',
          [id],
        ),
        database.query(
          'SELECT id,tipo,estado,intentos,ultimo_error,creado_en,actualizado_en FROM entregas WHERE comprobante_id=$1 ORDER BY creado_en DESC,id DESC',
          [id],
        ),
        database.query(
          'SELECT accion,actor,detalle,creado_en FROM auditoria WHERE comprobante_id=$1 ORDER BY creado_en DESC,id DESC LIMIT 50',
          [id],
        ),
      ]);
      return { record, documents, deliveries, history };
    },
    async claim(limit, leaseSeconds) {
      // FLUJO 05/18: reservar compras pendientes sin que dos workers tomen la misma.
      // CONTINUA EN FLUJO 06: procesamiento.service.process().
      const token = randomUUID();
      return database.transaction((tx) =>
        tx.query(
          `WITH candidates AS (
        SELECT id FROM comprobantes
        WHERE (estado='PENDIENTE' AND proximo_intento <= now())
           OR (estado='PROCESANDO' AND reserva_hasta < now())
        ORDER BY proximo_intento,creado_en,id FOR UPDATE SKIP LOCKED LIMIT $1
      ) UPDATE comprobantes c SET estado='PROCESANDO',intentos=c.intentos+1,
        reserva_hasta=now()+($2::int * interval '1 second'),reserva_token=$3,actualizado_en=now()
        FROM candidates WHERE c.id=candidates.id RETURNING c.*`,
          [limit, leaseSeconds, token],
        ),
      );
    },
    async saveEmission(record, result) {
      // FLUJO 12/18 (ACEPTADO): persistir CDR 0 antes de generar archivos.
      // CONTINUA EN FLUJO 13: startDocuments().
      const confirmed = validateEmissionResult(result, record.id);
      return database.transaction(async (tx) => {
        const updated = await tx.query(
          `UPDATE comprobantes SET resultado_emision=$3::jsonb,estado_fiscal=$4,
           serie=$5,numero=$6,estado_documentos='PENDIENTES',actualizado_en=now()
           WHERE id=$1 AND reserva_token=$2 AND estado='PROCESANDO'
             AND resultado_emision IS NULL RETURNING *`,
          [
            record.id,
            record.reserva_token,
            JSON.stringify(confirmed),
            confirmed.estadoFiscal,
            confirmed.serie,
            confirmed.numero,
          ],
        );
        if (!updated.length) return null;
        await audit(
          tx,
          record.id,
          'EMISION_SUNAT_CONFIRMADA',
          'WORKER',
          `${confirmed.serie}-${confirmed.numero}`,
        );
        return updated[0];
      });
    },
    async saveRejection(record, result) {
      // FLUJO 12/18 (RECHAZADO): cerrar la emision y crear callback a Boletos.
      // SALTA A FLUJO 16: no genera PDF ni correo.
      const rejected = validateEmissionResult(result, record.id, 'RECHAZADO');
      return database.transaction(async (tx) => {
        const saved = await tx.query(
          `UPDATE comprobantes SET resultado_emision=$3::jsonb,estado_fiscal=$4,
           serie=$5,numero=$6,estado='REQUIERE_ATENCION',estado_documentos='NO_HABILITADOS',
           ultimo_error=$7,reserva_hasta=NULL,reserva_token=NULL,actualizado_en=now()
           WHERE id=$1 AND reserva_token=$2 AND estado='PROCESANDO' AND resultado_emision IS NULL RETURNING id`,
          [
            record.id,
            record.reserva_token,
            JSON.stringify(rejected),
            rejected.estadoFiscal,
            rejected.serie,
            rejected.numero,
            `SUNAT ${rejected.respuestaSunat.codigo}: ${rejected.respuestaSunat.descripcion}`.slice(
              0,
              500,
            ),
          ],
        );
        if (!saved.length) return false;
        await delivery(tx, record.id, 'BOLETOS');
        await audit(
          tx,
          record.id,
          'RESPUESTA_SUNAT_NO_ACEPTADA',
          'WORKER',
          rejected.respuestaSunat.codigo,
        );
        return true;
      });
    },
    async defer(record) {
      // ESPERA CONTROLADA: libera la reserva sin consumir un intento.
      await database.query(
        `UPDATE comprobantes SET estado='PENDIENTE',intentos=GREATEST(0,intentos-1),
         proximo_intento=now()+interval '5 seconds',reserva_hasta=NULL,reserva_token=NULL
         WHERE id=$1 AND reserva_token=$2 AND estado='PROCESANDO' RETURNING id`,
        [record.id, record.reserva_token],
      );
    },
    async startDocuments(record) {
      // FLUJO 13/18: obtener permiso exclusivo para generar documentos.
      // CONTINUA EN FLUJO 14: documentos.service.generate().
      const rows = await database.query(
        `UPDATE comprobantes SET estado_documentos='GENERANDO',actualizado_en=now()
         WHERE id=$1 AND reserva_token=$2 AND estado='PROCESANDO'
           AND resultado_emision->>'estado'='COMPLETADO' RETURNING *`,
        [record.id, record.reserva_token],
      );
      return rows[0] ?? null;
    },
    async complete(record, documents, templateVersion) {
      // FLUJO 15/18: registrar PDF/XML/CDR y crear trabajos de entrega.
      // CONTINUA EN FLUJO 16: procesamiento.worker.deliver().
      return database.transaction(async (tx) => {
        const updated = await tx.query(
          `UPDATE comprobantes SET estado='PROCESADO',estado_documentos='DISPONIBLES',
          version_plantilla=$3,ultimo_error=NULL,reserva_hasta=NULL,reserva_token=NULL,actualizado_en=now()
          WHERE id=$1 AND reserva_token=$2 AND estado='PROCESANDO'
            AND resultado_emision IS NOT NULL AND estado_documentos='GENERANDO'
          RETURNING id,serie,numero`,
          [record.id, record.reserva_token, templateVersion],
        );
        if (!updated.length) return false;
        validateDocumentSet(documents, templateVersion);
        for (const document of documents) {
          await tx.query(
            `INSERT INTO documentos(id,comprobante_id,tipo,clave,sha256,bytes)
            VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(comprobante_id,tipo) DO UPDATE
            SET clave=EXCLUDED.clave,sha256=EXCLUDED.sha256,bytes=EXCLUDED.bytes RETURNING id`,
            [
              randomUUID(),
              record.id,
              document.tipo,
              document.clave,
              document.sha256,
              document.bytes,
            ],
          );
        }
        await delivery(tx, record.id, 'BOLETOS');
        await delivery(tx, record.id, 'CORREO');
        await audit(
          tx,
          record.id,
          'DOCUMENTOS_DISPONIBLES',
          'WORKER',
          `${updated[0].serie}-${updated[0].numero}`,
        );
        return true;
      });
    },
    async fail(record, { message, retry, uncertain = false, fiscalState, delaySeconds = 5 }) {
      // RUTA DE ERROR: conserva el avance y decide reintento o atencion manual.
      return database.transaction(async (tx) => {
        const updated = await tx.query(
          `UPDATE comprobantes SET estado=$3,
          estado_fiscal=CASE WHEN resultado_emision IS NOT NULL THEN estado_fiscal ELSE $4 END,
          estado_documentos=CASE WHEN resultado_emision IS NOT NULL THEN 'ERROR' ELSE estado_documentos END,
          ultimo_error=$5,
          proximo_intento=now()+($6::int * interval '1 second'),reserva_hasta=NULL,reserva_token=NULL,actualizado_en=now()
          WHERE id=$1 AND reserva_token=$2 AND estado='PROCESANDO' RETURNING id`,
          [
            record.id,
            record.reserva_token,
            retry ? 'PENDIENTE' : 'REQUIERE_ATENCION',
            fiscalState || (uncertain ? 'RESULTADO_INCIERTO' : 'PENDIENTE'),
            message.slice(0, 500),
            delaySeconds,
          ],
        );
        if (!updated.length) return;
        await audit(
          tx,
          record.id,
          retry ? 'REINTENTO_PROGRAMADO' : 'REQUIERE_ATENCION',
          'WORKER',
          message,
        );
        if (!retry) await delivery(tx, record.id, 'BOLETOS');
      });
    },
    async retry(id, actor) {
      return database.transaction(async (tx) => {
        const updated = await tx.query(
          `UPDATE comprobantes SET estado='PENDIENTE',intentos=0,
          proximo_intento=now(),ultimo_error=NULL,actualizado_en=now()
          WHERE id=$1 AND estado='REQUIERE_ATENCION'
          AND COALESCE(resultado_emision->>'estado','')<>'RECHAZADO' RETURNING *`,
          [id],
        );
        if (!updated.length) {
          await get(id, tx);
          throw new AppError(
            409,
            'ESTADO_INVALIDO',
            'Solo se pueden reintentar incidencias recuperables. Un rechazo SUNAT persistido requiere revisar los datos de origen.',
          );
        }
        await audit(tx, id, 'REINTENTO_MANUAL', actor);
        return updated[0];
      });
    },
    async resend(id, actor) {
      return database.transaction(async (tx) => {
        await tx.query('SELECT id FROM comprobantes WHERE id=$1 FOR UPDATE', [id]);
        const record = await get(id, tx);
        if (record.estado !== 'PROCESADO')
          throw new AppError(
            409,
            'ESTADO_INVALIDO',
            'El comprobante todavia no tiene documentos disponibles.',
          );
        const pending = await tx.query(
          "SELECT id FROM entregas WHERE comprobante_id=$1 AND tipo='CORREO' AND estado IN ('PENDIENTE','PROCESANDO')",
          [id],
        );
        if (pending.length)
          throw new AppError(409, 'CORREO_PENDIENTE', 'Ya hay un envio de correo pendiente.');
        const created = await delivery(tx, id, 'CORREO');
        await audit(tx, id, 'REENVIO_CORREO_SOLICITADO', actor);
        return created[0];
      });
    },
    async retryDeliveries(id, actor) {
      return database.transaction(async (tx) => {
        await get(id, tx);
        const updated = await tx.query(
          `UPDATE entregas SET estado='PENDIENTE',intentos=0,ultimo_error=NULL,
          proximo_intento=now(),actualizado_en=now() WHERE comprobante_id=$1 AND estado='REQUIERE_ATENCION' RETURNING id`,
          [id],
        );
        if (!updated.length)
          throw new AppError(
            409,
            'SIN_ENTREGAS_FALLIDAS',
            'No hay entregas fallidas para reintentar.',
          );
        await audit(tx, id, 'REINTENTO_ENTREGAS_SOLICITADO', actor);
        return { entregas: updated.length };
      });
    },
    async document(id, type) {
      const rows = await database.query(
        'SELECT * FROM documentos WHERE comprobante_id=$1 AND tipo=$2',
        [id, type],
      );
      if (!rows.length)
        throw new AppError(404, 'DOCUMENTO_NO_DISPONIBLE', 'El documento aun no esta disponible.');
      return rows[0];
    },
  };
}

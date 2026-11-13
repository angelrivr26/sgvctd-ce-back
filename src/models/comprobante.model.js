import { randomUUID } from 'node:crypto';
import { canonicalJson, digest } from '../utils/security.js';
import { AppError } from '../utils/errors.js';
import { validateEmissionResult } from '../validators/resultado-emision.validator.js';
import { applicationNow, addSeconds } from '../utils/time.js';

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
  const audit = (db, id, action, actor, detail = '') => {
    const now = applicationNow();
    return db.query(
      `INSERT INTO auditoria(comprobante_id,accion,actor,detalle,creado_en)
       VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [id, action, actor, detail.slice(0, 500), now],
    );
  };
  const delivery = (db, id, type) => {
    const now = applicationNow();
    return db.query(
      `INSERT INTO entregas(
         id,comprobante_id,tipo,proximo_intento,creado_en,actualizado_en
       ) VALUES($1,$2,$3,$4,$4,$4) RETURNING id`,
      [randomUUID(), id, type, now],
    );
  };
  async function get(id, db = database) {
    const rows = await db.query('SELECT * FROM comprobantes WHERE id=$1', [id]);
    if (!rows.length) throw new AppError(404, 'NO_ENCONTRADO', 'Comprobante no encontrado.');
    return rows[0];
  }
  return {
    get,
    async receive(payload, actor = 'BOLETOS') {
      // FASE 1/6. Fin de la recepcion HTTP.
      // LLAMADO POR: services/comprobante.service.js -> receive().
      // HACE: inserta la compra. Si eventoId o compraId ya existen con el mismo contenido, devuelve la fila anterior.
      // CONTINUA EN: el controller responde 202. El worker retoma despues en claim().
      const { eventoId, ...businessData } = payload;
      const hash = digest(canonicalJson(businessData));
      const now = applicationNow();
      return database.transaction(async (tx) => {
        const inserted = await tx.query(
          `INSERT INTO comprobantes(
             id,evento_id,origen,compra_id,payload,payload_hash,
             proximo_intento,creado_en,actualizado_en
           ) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$7,$7)
           ON CONFLICT DO NOTHING RETURNING *`,
          [
            randomUUID(),
            eventoId,
            payload.origen,
            payload.compraId,
            JSON.stringify(payload),
            hash,
            now,
          ],
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
        add(
          "((payload->>'fechaPago')::timestamptz AT TIME ZONE 'America/Lima')::date = ?::date",
          filters.fecha,
        );
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
        FROM comprobantes c ${where}
        ORDER BY (c.payload->>'fechaPago')::timestamptz DESC,c.creado_en DESC,c.id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, filters.limite, (filters.pagina - 1) * filters.limite],
      );
      return { rows, summary: totals[0], page: filters.pagina, limit: filters.limite };
    },
    async detail(id) {
      const record = await get(id);
      const [documents, deliveries, history] = await Promise.all([
        database.query(
          'SELECT id,tipo,clave,sha256,bytes FROM documentos WHERE comprobante_id=$1 ORDER BY tipo',
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
      // FASE 2/6.
      // LLAMADO POR: workers/procesamiento.worker.js -> emit().
      // HACE: toma compras PENDIENTES, o PROCESANDO con reserva vencida, y les pone un token temporal.
      // CONTINUA EN: services/procesamiento.service.js -> process().
      const token = randomUUID();
      const now = applicationNow();
      const leaseUntil = addSeconds(now, leaseSeconds);
      return database.transaction((tx) =>
        tx.query(
          `WITH candidates AS (
        SELECT id FROM comprobantes
        WHERE (estado='PENDIENTE' AND proximo_intento <= $2)
           OR (estado='PROCESANDO' AND reserva_hasta < $2)
        ORDER BY proximo_intento,creado_en,id FOR UPDATE SKIP LOCKED LIMIT $1
      ) UPDATE comprobantes c SET estado='PROCESANDO',intentos=c.intentos+1,
        reserva_hasta=$3,reserva_token=$4,actualizado_en=$2
        FROM candidates WHERE c.id=candidates.id RETURNING c.*`,
          [limit, now, leaseUntil, token],
        ),
      );
    },
    async saveEmission(record, result) {
      // FASE 3/6, rama aceptada.
      // LLAMADO POR: services/procesamiento.service.js -> confirmEmission().
      // HACE: guarda serie, numero y CDR aceptada. Todavia no crea PDF.
      // CONTINUA EN: startDocuments(), llamado por generateDocuments().
      const confirmed = validateEmissionResult(result, record.id);
      const now = applicationNow();
      return database.transaction(async (tx) => {
        const updated = await tx.query(
          `UPDATE comprobantes SET resultado_emision=$3::jsonb,estado_fiscal=$4,
           serie=$5,numero=$6,estado_documentos='PENDIENTES',actualizado_en=$7
           WHERE id=$1 AND reserva_token=$2 AND estado='PROCESANDO'
             AND resultado_emision IS NULL RETURNING *`,
          [
            record.id,
            record.reserva_token,
            JSON.stringify(confirmed),
            confirmed.estadoFiscal,
            confirmed.serie,
            confirmed.numero,
            now,
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
      // FASE 3/6, rama rechazada.
      // LLAMADO POR: services/procesamiento.service.js -> confirmEmission().
      // HACE: cierra el comprobante en REQUIERE_ATENCION y crea solo la entrega BOLETOS.
      // CONTINUA EN: salta el PDF y el correo. El worker de entregas avisa a Boletos.
      const rejected = validateEmissionResult(result, record.id, 'RECHAZADO');
      const now = applicationNow();
      return database.transaction(async (tx) => {
        const saved = await tx.query(
          `UPDATE comprobantes SET resultado_emision=$3::jsonb,estado_fiscal=$4,
           serie=$5,numero=$6,estado='REQUIERE_ATENCION',estado_documentos='NO_HABILITADOS',
           ultimo_error=$7,reserva_hasta=NULL,reserva_token=NULL,actualizado_en=$8
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
            now,
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
      // ESPERA, no es un paso nuevo.
      // LLAMADO POR: procesamiento.service.js -> confirmEmission(), cuando SUNAT esta ocupada.
      // HACE: suelta la reserva y devuelve un intento. No llama a SUNAT.
      // CONTINUA EN: el siguiente ciclo del worker vuelve a claim().
      const now = applicationNow();
      await database.query(
        `UPDATE comprobantes SET estado='PENDIENTE',intentos=GREATEST(0,intentos-1),
         proximo_intento=$3,reserva_hasta=NULL,reserva_token=NULL,actualizado_en=$4
         WHERE id=$1 AND reserva_token=$2 AND estado='PROCESANDO' RETURNING id`,
        [record.id, record.reserva_token, addSeconds(now, 5), now],
      );
    },
    async startDocuments(record) {
      // FASE 4/6.
      // LLAMADO POR: services/procesamiento.service.js -> generateDocuments().
      // HACE: marca GENERANDO solo si la emision ya quedo COMPLETADO y el token sigue vigente.
      // CONTINUA EN: services/documentos.service.js -> generate().
      const now = applicationNow();
      const rows = await database.query(
        `UPDATE comprobantes SET estado_documentos='GENERANDO',actualizado_en=$3
         WHERE id=$1 AND reserva_token=$2 AND estado='PROCESANDO'
           AND resultado_emision->>'estado'='COMPLETADO' RETURNING *`,
        [record.id, record.reserva_token, now],
      );
      return rows[0] ?? null;
    },
    async complete(record, documents, templateVersion) {
      // FASE 4/6, cierre documental.
      // LLAMADO POR: services/procesamiento.service.js -> generateDocuments().
      // HACE: deja el comprobante PROCESADO y crea dos entregas: BOLETOS y CORREO.
      // CONTINUA EN: workers/procesamiento.worker.js -> deliver().
      const now = applicationNow();
      return database.transaction(async (tx) => {
        const updated = await tx.query(
          `UPDATE comprobantes SET estado='PROCESADO',estado_documentos='DISPONIBLES',
          version_plantilla=$3,ultimo_error=NULL,reserva_hasta=NULL,reserva_token=NULL,actualizado_en=$4
          WHERE id=$1 AND reserva_token=$2 AND estado='PROCESANDO'
            AND resultado_emision IS NOT NULL AND estado_documentos='GENERANDO'
          RETURNING id,serie,numero`,
          [record.id, record.reserva_token, templateVersion, now],
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
      // RUTA DE ERROR. No borra una emision ya confirmada.
      // LLAMADO POR: procesamiento.service.js -> process() o confirmEmission().
      // HACE: programa otro intento o pasa a REQUIERE_ATENCION. Si ya no hay reintento, avisa a Boletos.
      // CONTINUA EN: un reintento vuelve a la fase 2. Sin reintento, se avisa a Boletos.
      const now = applicationNow();
      return database.transaction(async (tx) => {
        const updated = await tx.query(
          `UPDATE comprobantes SET estado=$3,
          estado_fiscal=CASE WHEN resultado_emision IS NOT NULL THEN estado_fiscal ELSE $4 END,
          estado_documentos=CASE WHEN resultado_emision IS NOT NULL THEN 'ERROR' ELSE estado_documentos END,
          ultimo_error=$5,
          proximo_intento=$6,reserva_hasta=NULL,reserva_token=NULL,actualizado_en=$7
          WHERE id=$1 AND reserva_token=$2 AND estado='PROCESANDO' RETURNING id`,
          [
            record.id,
            record.reserva_token,
            retry ? 'PENDIENTE' : 'REQUIERE_ATENCION',
            fiscalState || (uncertain ? 'RESULTADO_INCIERTO' : 'PENDIENTE'),
            message.slice(0, 500),
            addSeconds(now, delaySeconds),
            now,
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
    // FUERA DEL FLUJO AUTOMATICO. Lo llama el panel: POST /comprobantes/:id/reintentar.
    // Vuelve a PENDIENTE para que el worker retome la fase 2. No reenvia un rechazo SUNAT.
    async retry(id, actor) {
      const now = applicationNow();
      return database.transaction(async (tx) => {
        const updated = await tx.query(
          `UPDATE comprobantes SET estado='PENDIENTE',intentos=0,
          proximo_intento=$2,ultimo_error=NULL,actualizado_en=$2
          WHERE id=$1 AND estado='REQUIERE_ATENCION'
          AND COALESCE(resultado_emision->>'estado','')<>'RECHAZADO' RETURNING *`,
          [id, now],
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
      const now = applicationNow();
      return database.transaction(async (tx) => {
        await get(id, tx);
        const updated = await tx.query(
          `UPDATE entregas SET estado='PENDIENTE',intentos=0,ultimo_error=NULL,
          proximo_intento=$2,actualizado_en=$2
          WHERE comprobante_id=$1 AND estado='REQUIERE_ATENCION' RETURNING id`,
          [id, now],
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

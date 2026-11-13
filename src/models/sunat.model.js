import { applicationNow, addMilliseconds, addSeconds } from '../utils/time.js';

export function createSunatModel(database) {
  const get = async (id) =>
    (await database.query('SELECT * FROM sunat_envios WHERE comprobante_id=$1', [id]))[0] ?? null;
  return {
    get,
    async nextNumber() {
      return String(
        (await database.query("SELECT nextval('sunat_numero_seq') AS numero"))[0].numero,
      );
    },
    async prepare(id, request) {
      // FASE 2/6, persistencia previa al envio.
      // LLAMADO POR: sunat.service.js -> prepareRequest(), despues de signUblXml().
      // HACE: inserta la UBL firmada en sunat_envios con estado PREPARADO. No abre red.
      // CONTINUA EN: sunat.service.js -> sendPreparedRequest().
      const now = applicationNow();
      await database.query(
        `INSERT INTO sunat_envios(comprobante_id,ambiente,serie,numero,solicitud,creado_en)
         VALUES($1,$2,$3,$4,$5::jsonb,$6)
         ON CONFLICT(comprobante_id) DO NOTHING RETURNING comprobante_id`,
        [id, request.ambiente, request.serie, request.numero, JSON.stringify(request), now],
      );
      return get(id);
    },
    async beginSend(id, zip, timeoutMs) {
      // FASE 2/6, compuerta de envio.
      // LLAMADO POR: sunat.service.js -> transport.send(), callback onPrepared, antes del POST.
      // HACE: deja pasar un solo envio a la vez y cambia la fila a ENVIO_INICIADO.
      // CONTINUA EN: el mismo transport.send() hace el POST. Si devuelve false, no hay red.
      const now = applicationNow();
      const availableAt = addMilliseconds(now, timeoutMs + 10000);
      return database.transaction(async (tx) => {
        // Una fila de control inactiva creada con el reloj historico de BD se normaliza
        // una sola vez; no modifica comprobantes ni diarios fiscales anteriores.
        await tx.query(
          `UPDATE sunat_control SET disponible_desde=$1
           WHERE id=1 AND operacion_id IS NULL AND disponible_desde>$2 RETURNING id`,
          [now, addSeconds(now, 600)],
        );
        const gate = await tx.query(
          `UPDATE sunat_control SET operacion_id=$1,
           disponible_desde=$2
           WHERE id=1 AND disponible_desde<=$3 RETURNING id`,
          [id, availableAt, now],
        );
        if (!gate.length) return false;
        const started = await tx.query(
          `UPDATE sunat_envios SET estado='ENVIO_INICIADO',zip_base64=$2
           WHERE comprobante_id=$1 AND estado='PREPARADO' RETURNING comprobante_id`,
          [id, zip.toString('base64')],
        );
        if (!started.length)
          await tx.query(
            `UPDATE sunat_control SET disponible_desde=$2,operacion_id=NULL
             WHERE id=1 AND operacion_id=$1 RETURNING id`,
            [id, now],
          );
        return started.length === 1;
      });
    },
    async saveResponse(id, { text, httpStatus }, date) {
      // FASE 3/6, diario crudo de respuesta.
      // LLAMADO POR: sunat.service.js -> transport.send(), callback onResponse.
      // HACE: guarda el SOAP tal como llego y libera la compuerta. Todavia no decide aceptado o rechazado.
      // CONTINUA EN: parseSunatResponse() dentro del mismo send().
      await database.transaction(async (tx) => {
        const saved = await tx.query(
          `UPDATE sunat_envios SET estado='RESPONDIDO',respuesta_soap=$2,
           http_status=$3,fecha_respuesta=$4 WHERE comprobante_id=$1 AND estado='ENVIO_INICIADO'
           RETURNING comprobante_id`,
          [id, text, httpStatus, date],
        );
        if (!saved.length) throw new Error('No se pudo persistir la respuesta SUNAT.');
        await tx.query(
          `UPDATE sunat_control SET disponible_desde=$2,operacion_id=NULL
           WHERE id=1 AND operacion_id=$1 RETURNING id`,
          [id, addSeconds(date, 5)],
        );
      });
    },
    async saveTransportError(id, code) {
      // RESULTADO INCIERTO. No es un reintento.
      // LLAMADO POR: sunat.service.js -> sendPreparedRequest(), si el POST ya empezo y fallo la lectura.
      // HACE: anota el error de transporte y deja la fila en ENVIO_INICIADO.
      // CONTINUA EN: consultarResultado(), que se niega a reenviar esa operacion.
      await database.query(
        `UPDATE sunat_envios SET error_transporte=$2
         WHERE comprobante_id=$1 AND estado='ENVIO_INICIADO' RETURNING comprobante_id`,
        [
          id,
          String(code)
            .replace(/[^A-Za-z0-9_:-]/g, '')
            .slice(0, 80),
        ],
      );
    },
  };
}

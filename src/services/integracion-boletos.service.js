import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export function createIntegracionBoletosService(config, fetchImpl = fetch) {
  return {
    async notify(job, detail) {
      // FASE 6/6, aviso a Boletos.
      // LLAMADO POR: entrega.service.js -> process(), cuando el trabajo es tipo BOLETOS.
      // HACE: arma el JSON del resultado y lo envia al callback. Sin URL, lo guarda en disco.
      // CONTINUA EN: backend-externo, controllers/comprobante-integracion.controller.js.
      const payload = {
        notificacionId: job.id,
        eventoId: detail.eventoId,
        compraId: detail.compraId,
        comprobanteId: detail.id,
        estado: detail.estado,
        estadoFiscal: detail.estadoFiscal,
        estadoDocumentos: detail.estadoDocumentos,
        respuestaSunat: detail.respuestaSunat ?? null,
        serie: detail.serie,
        numero: detail.numero,
        actualizadoEn: detail.actualizadoEn,
        documentos: detail.documentos.map(({ tipo, sha256 }) => ({
          tipo,
          sha256,
          descarga: `/api/v1/integraciones/boletos/comprobantes/${detail.id}/documentos/${tipo}`,
        })),
        simulado: detail.simulado,
      };
      if (!config.callbackUrl) {
        await mkdir(config.callbackDirectory, { recursive: true });
        const path = join(config.callbackDirectory, `${job.id}.json`);
        await writeFile(`${path}.tmp`, JSON.stringify(payload, null, 2));
        await rename(`${path}.tmp`, path);
        return 'CAPTURADO_PRUEBA';
      }
      const response = await fetchImpl(config.callbackUrl, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.callbackKey,
          'idempotency-key': job.id,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('El destino no confirmo la notificacion.');
      // No conservar conexiones ni cuerpos de respuesta sin consumir.
      await response.body?.cancel();
      return 'ENVIADO';
    },
  };
}

import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

/** Buzon local de prueba. No contacta servidores SMTP ni destinatarios reales. */
export function createCorreoService(directory) {
  return {
    async send(job, detail) {
      await mkdir(directory, { recursive: true });
      const path = join(directory, `${job.id}.json`);
      const content = {
        idEntrega: job.id,
        modo: 'CAPTURADO_PRUEBA',
        destinatario: detail.comprador.correo,
        asunto: `PRUEBA - ${detail.tipoComprobante} ${detail.serie}-${detail.numero}`,
        mensaje: 'Documento simulado sin validez tributaria. No se envio correo real.',
        documentos: detail.documentos,
      };
      await writeFile(`${path}.tmp`, JSON.stringify(content, null, 2));
      await rename(`${path}.tmp`, path);
      return 'CAPTURADO_PRUEBA';
    },
  };
}

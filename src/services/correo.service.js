import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

/** Buzon local de prueba. No contacta servidores SMTP ni destinatarios reales. */
export function createCorreoService(directory) {
  return {
    async send(job, detail) {
      // FLUJO 18/18: capturar correo local. Produccion debe sustituir este adaptador por SMTP.
      await mkdir(directory, { recursive: true });
      const path = join(directory, `${job.id}.json`);
      const content = {
        idEntrega: job.id,
        modo: 'CAPTURADO_PRUEBA',
        destinatario: detail.comprador.correo,
        asunto: `${detail.tipoComprobante} ${detail.serie}-${detail.numero}`,
        mensaje: 'El adaptador de correo captura la entrega localmente; no se envio correo real.',
        documentos: detail.documentos,
      };
      await writeFile(`${path}.tmp`, JSON.stringify(content, null, 2));
      await rename(`${path}.tmp`, path);
      return 'CAPTURADO_PRUEBA';
    },
  };
}

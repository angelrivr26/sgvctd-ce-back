import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

/** Envia el comprobante por SMTP o lo captura localmente para desarrollo y pruebas. */
export function createCorreoService(config, { createTransport = nodemailer.createTransport } = {}) {
  const { mode, directory, smtp = {} } = config;
  let transporter;

  function message(detail) {
    const documentNumber = `${detail.serie}-${detail.numero}`;
    const type = detail.tipoComprobante.toLowerCase();
    const attachments = detail.documentos.map((document) => ({
      filename: `${type}-${documentNumber}.${document.tipo.toLowerCase()}`,
      content: document.contenido,
      contentType: document.tipo === 'PDF' ? 'application/pdf' : 'application/xml',
    }));
    return {
      to: detail.comprador.correo,
      subject: `${detail.tipoComprobante} electronica ${documentNumber}`,
      text: `Hola ${detail.comprador.nombre}. Adjuntamos su ${type} electronica ${documentNumber}.`,
      html: `<p>Hola ${escapeHtml(detail.comprador.nombre)}.</p><p>Adjuntamos su ${escapeHtml(type)} electronica <strong>${escapeHtml(documentNumber)}</strong>.</p>`,
      attachments,
    };
  }

  return {
    async send(job, detail) {
      // FASE 5/6, entrega de correo independiente de la emision fiscal.
      // LLAMADO POR: entrega.service.js -> process(), cuando el trabajo es tipo CORREO.
      // HACE: captura un JSON en modo capture o envia PDF/XML en modo smtp.
      // CONTINUA EN: entrega.model.js -> complete(), con el estado devuelto.
      const mail = message(detail);
      if (mode === 'capture') {
        await mkdir(directory, { recursive: true });
        const path = join(directory, `${job.id}.json`);
        const content = {
          idEntrega: job.id,
          modo: 'CAPTURADO_PRUEBA',
          destinatario: mail.to,
          asunto: mail.subject,
          mensaje: 'El adaptador de correo captura la entrega localmente; no se envio correo real.',
          documentos: detail.documentos.map((document) => ({
            tipo: document.tipo,
            bytes: document.contenido.length,
          })),
        };
        await writeFile(`${path}.tmp`, JSON.stringify(content, null, 2));
        await rename(`${path}.tmp`, path);
        return 'CAPTURADO_PRUEBA';
      }

      transporter ??= createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
      });
      await transporter.sendMail({ from: smtp.from, ...mail });
      return 'ENVIADO';
    },
  };
}

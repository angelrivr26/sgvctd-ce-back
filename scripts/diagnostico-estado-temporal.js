import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';
import { renderComprobanteHtml } from '../src/templates/comprobante.js';
import { createHtmlPdfRenderer } from '../src/services/html-pdf.service.js';

const config = loadConfig();
const database = await createDatabase(config);
try {
  const rows = await database.query(
    `SELECT c.id,c.compra_id,c.estado,c.estado_fiscal,c.estado_documentos,
      c.serie,c.numero,c.intentos,c.ultimo_error,c.actualizado_en,
      (SELECT count(*)::int FROM documentos d WHERE d.comprobante_id=c.id) AS documentos,
      (SELECT count(*)::int FROM entregas e WHERE e.comprobante_id=c.id AND e.tipo='CORREO') AS correos
     FROM comprobantes c
     WHERE c.estado='REQUIERE_ATENCION' OR c.id='c13397fa-9ea8-4d00-8690-c64c856f86b2'
     ORDER BY c.creado_en DESC LIMIT 50`,
  );
  console.log(JSON.stringify(rows, null, 2));
  const [record] = await database.query(
    "SELECT * FROM comprobantes WHERE id='a93ddc44-91d6-4aa7-8158-e84cc9cd07ac'",
  );
  try {
    const view = await renderComprobanteHtml(record, {
      issuerName: config.pdf.issuerName,
      issuerAddress: config.pdf.issuerAddress,
    });
    const pdf = await createHtmlPdfRenderer(config.pdf)(view);
    console.log(JSON.stringify({ renderPdf: 'OK', bytes: pdf.length }));
  } catch (error) {
    console.log(
      JSON.stringify({
        renderPdf: 'ERROR',
        nombre: error.name,
        codigo: error.code,
        mensaje: error.message,
        causa: error.cause?.message,
      }),
    );
  }
} finally {
  await database.close();
}

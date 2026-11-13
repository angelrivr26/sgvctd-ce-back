import { mkdir, writeFile, rename, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { digest } from '../utils/security.js';
import { AppError } from '../utils/errors.js';
import { validateEmissionResult } from '../validators/resultado-emision.validator.js';
import { renderComprobanteHtml } from '../templates/comprobante.js';
import { createHtmlPdfRenderer } from './html-pdf.service.js';

/** Genera, guarda y verifica PDF/XML/CDR despues de confirmar la emision. */
export function createDocumentosService(
  directory,
  { pdfConfig = {}, htmlRenderer = renderComprobanteHtml, pdfRenderer } = {},
) {
  const root = resolve(directory);
  const renderPdf = pdfRenderer ?? createHtmlPdfRenderer(pdfConfig);

  async function generatePdf(record) {
    validateEmissionResult(record.resultado_emision, record.id);
    const view = await htmlRenderer(record, {
      issuerName: pdfConfig.issuerName,
      issuerAddress: pdfConfig.issuerAddress,
    });
    const content = await renderPdf(view);
    const key = `${record.id}/${digest(content)}.pdf`;
    return {
      document: { tipo: 'PDF', ...(await save(key, content)) },
      templateVersion: view.version,
    };
  }

  function safePath(key) {
    const file = resolve(root, key);
    const difference = relative(root, file);
    if (!difference || difference.startsWith('..') || isAbsolute(difference))
      throw new AppError(400, 'RUTA_INVALIDA', 'Documento no valido.');
    return file;
  }

  async function save(key, content) {
    const bytes = Buffer.from(content);
    const path = safePath(key);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    return { clave: key, sha256: digest(bytes), bytes: bytes.length };
  }

  return {
    async generate(record) {
      // FASE 4/6: genera y guarda los tres documentos sin abrir conexiones de red.
      // LLAMADO POR: procesamiento.service.js -> generateDocuments().
      // HACE: toma XML y CDR ya guardados en el resultado, dibuja el PDF y escribe los tres archivos.
      // CONTINUA EN: comprobante.model.js -> complete().
      const result = validateEmissionResult(record.resultado_emision, record.id);
      const originals = result.documentos;
      const rendered = await generatePdf(record);
      const contents = [
        ...originals.map((doc) => ({
          tipo: doc.tipo,
          content: Buffer.from(doc.contenido, 'utf8'),
        })),
      ];
      const documents = [rendered.document];
      for (const document of contents) {
        // Una reserva vencida no puede sobrescribir archivos de otro contenido.
        const extension = document.tipo === 'PDF' ? 'pdf' : 'xml';
        const key = `${record.id}/${digest(document.content)}.${extension}`;
        documents.push({ tipo: document.tipo, ...(await save(key, document.content)) });
      }
      return { documents, templateVersion: rendered.templateVersion };
    },
    async read(document) {
      let content;
      try {
        content = await readFile(safePath(document.clave));
      } catch (error) {
        if (error.code === 'ENOENT')
          throw new AppError(
            503,
            'ARCHIVO_NO_DISPONIBLE',
            'El documento no esta disponible en el almacenamiento.',
          );
        throw error;
      }
      if (digest(content) !== document.sha256)
        throw new AppError(
          503,
          'INTEGRIDAD_DOCUMENTO',
          'El documento requiere verificacion de integridad.',
        );
      return content;
    },
  };
}

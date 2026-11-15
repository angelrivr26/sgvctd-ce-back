import { mkdir, writeFile, rename, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { digest } from '../utils/security.js';
import { AppError } from '../utils/errors.js';
import { validateEmissionResult } from '../validators/resultado-emision.validator.js';
import { renderComprobanteHtml } from '../templates/comprobante.js';
import { createHtmlPdfRenderer } from './html-pdf.service.js';
import { diagnosticError, diagnosticLog } from '../utils/diagnostic-log.js';

/** Genera, guarda y verifica PDF/XML/CDR despues de confirmar la emision. */
export function createDocumentosService(
  directory,
  { pdfConfig = {}, htmlRenderer = renderComprobanteHtml, pdfRenderer, logger = console } = {},
) {
  const root = resolve(directory);
  const renderPdf = pdfRenderer ?? createHtmlPdfRenderer(pdfConfig, logger);
  diagnosticLog(logger, 'info', 'documentos.almacenamiento_configurado', {
    directorioConfigurado: directory,
    directorioResuelto: root,
    directorioTrabajo: process.cwd(),
  });

  async function generatePdf(record) {
    let stage = 'validar_emision';
    try {
      validateEmissionResult(record.resultado_emision, record.id);
      stage = 'renderizar_html';
      const view = await htmlRenderer(record, {
        issuerName: pdfConfig.issuerName,
        issuerAddress: pdfConfig.issuerAddress,
      });
      diagnosticLog(logger, 'info', 'documentos.html_preparado', {
        comprobanteId: record.id,
        versionPlantilla: view.version,
      });
      stage = 'renderizar_pdf';
      const content = await renderPdf(view);
      stage = 'guardar_pdf';
      const key = `${record.id}/${digest(content)}.pdf`;
      return {
        document: { tipo: 'PDF', ...(await save(key, content, 'PDF', record.id)) },
        templateVersion: view.version,
      };
    } catch (error) {
      diagnosticLog(logger, 'error', 'documentos.pdf_error', {
        comprobanteId: record.id,
        etapa: stage,
        ...diagnosticError(error),
      });
      throw error;
    }
  }

  function safePath(key) {
    const file = resolve(root, key);
    const difference = relative(root, file);
    if (!difference || difference.startsWith('..') || isAbsolute(difference))
      throw new AppError(400, 'RUTA_INVALIDA', 'Documento no valido.');
    return file;
  }

  async function save(key, content, type, comprobanteId) {
    const bytes = Buffer.from(content);
    let path;
    let temporary;
    let stage = 'resolver_ruta';
    try {
      path = safePath(key);
      diagnosticLog(logger, 'info', 'documentos.escritura_iniciada', {
        comprobanteId,
        tipo: type,
        directorioDestino: dirname(path),
        bytes: bytes.length,
      });
      stage = 'crear_directorio';
      await mkdir(dirname(path), { recursive: true });
      temporary = `${path}.${randomUUID()}.tmp`;
      stage = 'escribir_temporal';
      await writeFile(temporary, bytes, { flag: 'wx' });
      stage = 'publicar_archivo';
      await rename(temporary, path);
      diagnosticLog(logger, 'info', 'documentos.escritura_completada', {
        comprobanteId,
        tipo: type,
        rutaDestino: path,
        bytes: bytes.length,
      });
    } catch (error) {
      diagnosticLog(logger, 'error', 'documentos.escritura_error', {
        comprobanteId,
        tipo: type,
        etapa: stage,
        directorioAlmacenamiento: root,
        ...(path ? { rutaDestino: path } : {}),
        ...diagnosticError(error),
      });
      throw error;
    } finally {
      if (temporary)
        await unlink(temporary).catch((error) => {
          if (error.code === 'ENOENT') return;
          diagnosticLog(logger, 'error', 'documentos.escritura_error', {
            comprobanteId,
            tipo: type,
            etapa: 'limpiar_temporal',
            directorioAlmacenamiento: root,
            ...diagnosticError(error),
          });
          throw error;
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
      diagnosticLog(logger, 'info', 'documentos.generacion_iniciada', {
        comprobanteId: record.id,
        directorioAlmacenamiento: root,
      });
      let stage = 'validar_emision';
      try {
        const result = validateEmissionResult(record.resultado_emision, record.id);
        const originals = result.documentos;
        stage = 'generar_pdf';
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
          stage = `guardar_${document.tipo.toLowerCase()}`;
          const extension = document.tipo === 'PDF' ? 'pdf' : 'xml';
          const key = `${record.id}/${digest(document.content)}.${extension}`;
          documents.push({
            tipo: document.tipo,
            ...(await save(key, document.content, document.tipo, record.id)),
          });
        }
        diagnosticLog(logger, 'info', 'documentos.generacion_completada', {
          comprobanteId: record.id,
          tipos: documents.map((document) => document.tipo),
          versionPlantilla: rendered.templateVersion,
        });
        return { documents, templateVersion: rendered.templateVersion };
      } catch (error) {
        diagnosticLog(logger, 'error', 'documentos.generacion_error', {
          comprobanteId: record.id,
          etapa: stage,
          directorioAlmacenamiento: root,
          ...diagnosticError(error),
        });
        throw error;
      }
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

import { mkdir, writeFile, rename, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { digest } from '../utils/security.js';
import { AppError } from '../utils/errors.js';
import { validateEmissionResult } from '../validators/resultado-emision.validator.js';
import { comprobanteTemplate } from '../templates/comprobante.js';

const printable = (value) => String(value).replace(/[^\x20-\x7e\u00a0-\u00ff]/g, '?');

/** Genera, guarda y verifica PDF/XML/CDR despues de confirmar la emision. */
export function createDocumentosService(directory, template = comprobanteTemplate) {
  const root = resolve(directory);

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

  async function renderPdf(record) {
    const view = template(record);
    const pdf = await PDFDocument.create();
    const normal = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const date = new Date(record.resultado_emision.fechaEmision);
    pdf.setCreationDate(date);
    pdf.setModificationDate(date);
    pdf.setTitle(`${view.title} ${view.reference}`);
    pdf.setSubject(`Plantilla ${view.version}`);
    let page, y;
    const newPage = () => {
      page = pdf.addPage([595.28, 841.89]);
      y = 785;
      page.drawText(view.title, {
        x: 40,
        y,
        size: 12,
        font: bold,
        color: rgb(0.65, 0.15, 0.1),
      });
      y -= 32;
    };
    const wrap = (value, font, size, width) => {
      const lines = [];
      let current = '';
      for (const char of printable(value)) {
        if (font.widthOfTextAtSize(current + char, size) > width && current) {
          const space = current.lastIndexOf(' ');
          if (space > 0) {
            lines.push(current.slice(0, space));
            current = current.slice(space + 1);
          } else {
            lines.push(current);
            current = '';
          }
        }
        current += char;
      }
      lines.push(current);
      return lines;
    };
    const line = (text, { strong = false, size = 10, width = 515 } = {}) => {
      const font = strong ? bold : normal;
      for (const piece of wrap(text, font, size, width)) {
        if (y < 75) newPage();
        page.drawText(piece, { x: 40, y, size, font });
        y -= size + 7;
      }
    };
    newPage();
    line(view.title, { strong: true, size: 16 });
    line(view.reference, { strong: true, size: 13 });
    for (const section of view.sections) {
      line('');
      line(section.title, { strong: true });
      for (const text of section.lines) line(text);
    }
    line('');
    line('DETALLE DE LA COMPRA', { strong: true });
    for (const item of view.items) {
      line(item.title, { strong: true });
      for (const text of item.lines) line(text);
      line(`Importe: ${item.amount}`, { strong: true });
      line('');
    }
    line(view.total, { strong: true, size: 14 });
    line(view.footer, { size: 9 });
    const pages = pdf.getPages();
    pages.forEach((sheet, index) =>
      sheet.drawText(`Plantilla ${view.version} | Pagina ${index + 1} de ${pages.length}`, {
        x: 40,
        y: 35,
        font: normal,
        size: 8,
      }),
    );
    return { content: Buffer.from(await pdf.save()), templateVersion: view.version };
  }

  return {
    async generate(record) {
      // FASE 4/6: genera y guarda los tres documentos sin abrir conexiones de red.
      // LLAMADO POR: procesamiento.service.js -> generateDocuments().
      // HACE: toma XML y CDR ya guardados en el resultado, dibuja el PDF y escribe los tres archivos.
      // CONTINUA EN: comprobante.model.js -> complete().
      const result = validateEmissionResult(record.resultado_emision, record.id);
      const originals = result.documentos;
      const rendered = await renderPdf(record);
      const contents = [
        ...originals.map((doc) => ({
          tipo: doc.tipo,
          content: Buffer.from(doc.contenido, 'utf8'),
        })),
        { tipo: 'PDF', content: rendered.content },
      ];
      const documents = [];
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

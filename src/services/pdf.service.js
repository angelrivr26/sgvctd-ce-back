import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { comprobanteTemplate } from '../templates/comprobante.js';

const printable = (value) => String(value).replace(/[^\x20-\x7e\u00a0-\u00ff]/g, '?');

/** Motor reemplazable. Genera bytes; no escribe archivos ni invoca al proveedor. */
export function createPdfService(template = comprobanteTemplate) {
  // FLUJO 14/18, pieza interna.
  // LLAMADO POR: documentos.service.js -> generate().
  // HACE: dibuja el PDF a partir del resultado ya aceptado.
  // CONTINUA EN: documentos.service.js guarda el archivo y vuelve a model.complete().
  return {
    async render(record, overrideTemplate = template) {
      const view = overrideTemplate(record);
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
    },
  };
}

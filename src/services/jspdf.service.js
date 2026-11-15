import { createHash } from 'node:crypto';
import { jsPDF } from 'jspdf';
import { AppError } from '../utils/errors.js';
import { diagnosticError, diagnosticLog } from '../utils/diagnostic-log.js';

const page = Object.freeze({
  width: 210,
  height: 297,
  margin: 8,
  contentWidth: 194,
  bottom: 282,
});

const lineHeight = (size) => size * 0.3528 * 1.2;

function textLines(document, value, width) {
  return document.splitTextToSize(String(value ?? ''), width);
}

function drawText(
  document,
  value,
  x,
  y,
  width,
  { size = 9, font = 'helvetica', style = 'normal', align = 'left' } = {},
) {
  document.setFont(font, style);
  document.setFontSize(size);
  const lines = textLines(document, value, width);
  const textX = align === 'right' ? x + width : align === 'center' ? x + width / 2 : x;
  document.text(lines, textX, y, { align, lineHeightFactor: 1.2 });
  return y + lines.length * lineHeight(size);
}

function drawHeader(document, view) {
  const { issuer } = view.content;
  const leftX = page.margin + 1;
  const leftWidth = 111;
  const boxX = 128;
  const boxWidth = 74;
  let leftY = 13;
  leftY = drawText(document, issuer.brand, leftX, leftY, leftWidth, {
    size: 13,
    font: 'times',
    style: 'bold',
  });
  leftY += 0.8;
  leftY = drawText(document, issuer.name, leftX, leftY, leftWidth, {
    size: 10.5,
    font: 'times',
    style: 'bold',
  });
  leftY += 0.8;
  leftY = drawText(document, issuer.address, leftX, leftY, leftWidth, { size: 9 });

  const boxHeight = Math.max(22, leftY - 9);
  document.setLineWidth(0.7);
  document.rect(boxX, 9, boxWidth, boxHeight);
  const boxCenterY = 9 + boxHeight / 2 - 5;
  drawText(document, view.title, boxX + 3, boxCenterY, boxWidth - 6, {
    size: 10.5,
    style: 'bold',
    align: 'center',
  });
  drawText(document, `RUC: ${issuer.ruc}`, boxX + 3, boxCenterY + 6, boxWidth - 6, {
    size: 10.5,
    style: 'bold',
    align: 'center',
  });
  drawText(document, view.reference, boxX + 3, boxCenterY + 12, boxWidth - 6, {
    size: 10.5,
    style: 'bold',
    align: 'center',
  });

  const bottom = Math.max(leftY + 2, 9 + boxHeight + 2);
  document.setLineWidth(0.35);
  document.line(page.margin, bottom, page.width - page.margin, bottom);
  return bottom + 4;
}

function drawCustomer(document, view, startY) {
  const { customer } = view.content;
  const labelX = page.margin + 1;
  const labelWidth = 40;
  const valueX = labelX + labelWidth;
  const valueWidth = 98;
  let y = startY;
  const field = (label, value) => {
    document.setFont('helvetica', 'normal');
    document.setFontSize(9);
    document.text(`${label}:`, labelX, y);
    const lines = textLines(document, value, valueWidth);
    document.setFont('helvetica', 'bold');
    document.text(lines, valueX, y, { lineHeightFactor: 1.2 });
    y += Math.max(5, lines.length * lineHeight(9));
  };

  field('Fecha de emisión', view.content.issueDate);
  field('Señor(es)', customer.name);
  field(customer.documentLabel, customer.document);
  field('Dirección del cliente', customer.address);
  field('Tipo de moneda', view.content.currencyName);
  field('Observación', view.content.observation);

  drawText(
    document,
    `Forma de pago: ${view.content.paymentMethod}`,
    158,
    startY,
    page.width - page.margin - 158,
    { size: 9, style: 'bold', align: 'right' },
  );
  return y + 1;
}

const itemColumns = Object.freeze([
  { label: 'Cantidad', width: 17, align: 'right' },
  { label: 'Unidad medida', width: 29, align: 'center' },
  { label: 'Descripción', width: 94, align: 'left' },
  { label: 'Valor unitario', width: 27, align: 'right' },
  { label: 'ICBPER', width: 27, align: 'right' },
]);

function drawItemsHeader(document, y) {
  let x = page.margin;
  const height = 8;
  document.setFillColor(245, 245, 245);
  document.rect(page.margin, y, page.contentWidth, height, 'F');
  document.setLineWidth(0.25);
  document.line(page.margin, y, page.width - page.margin, y);
  document.line(page.margin, y + height, page.width - page.margin, y + height);
  for (const column of itemColumns) {
    drawText(document, column.label, x + 1, y + 5.1, column.width - 2, {
      size: 8.5,
      font: 'times',
      style: 'bold',
      align: column.align,
    });
    x += column.width;
  }
  return y + height;
}

function continuationPage(document, view) {
  document.addPage('a4', 'portrait');
  drawText(document, `${view.title} ${view.reference}`, page.margin, 11, page.contentWidth, {
    size: 9,
    style: 'bold',
    align: 'right',
  });
  return drawItemsHeader(document, 15);
}

function drawItems(document, view, startY) {
  let y = drawItemsHeader(document, startY);
  for (const item of view.content.items) {
    const reference = item.references.length ? `Boletos: ${item.references.join(', ')}` : '';
    const pending = [
      ...textLines(document, item.description, itemColumns[2].width - 2).map((text) => ({
        text,
        size: 9,
      })),
      ...(reference
        ? textLines(document, reference, itemColumns[2].width - 2).map((text) => ({
            text,
            size: 8,
          }))
        : []),
    ];
    const values = [item.quantity, item.unit, null, item.unitValue, item.icbper];
    let firstSegment = true;
    while (pending.length) {
      if (y + 10 > page.bottom) y = continuationPage(document, view);
      const available = page.bottom - y - 3;
      const segment = [];
      let contentHeight = 0;
      while (pending.length) {
        const nextHeight = lineHeight(pending[0].size);
        if (segment.length && contentHeight + nextHeight > available) break;
        segment.push(pending.shift());
        contentHeight += nextHeight;
      }
      const rowHeight = Math.max(10, 3 + contentHeight);
      let x = page.margin;
      itemColumns.forEach((column, index) => {
        if (index === 2) {
          let textY = y + 4.5;
          for (const line of segment) {
            drawText(document, line.text, x + 1, textY, column.width - 2, { size: line.size });
            textY += lineHeight(line.size);
          }
        } else if (firstSegment) {
          drawText(document, values[index], x + 1, y + 4.5, column.width - 2, {
            size: 9,
            align: column.align,
          });
        }
        x += column.width;
      });
      y += rowHeight;
      document.setLineWidth(0.15);
      document.line(page.margin, y, page.width - page.margin, y);
      firstSegment = false;
      if (pending.length) y = continuationPage(document, view);
    }
  }
  return y;
}

function drawSummary(document, view, startY) {
  let y = startY + 2;
  if (y > 188) {
    document.addPage('a4', 'portrait');
    drawText(document, `${view.title} ${view.reference}`, page.margin, 11, page.contentWidth, {
      size: 9,
      style: 'bold',
      align: 'right',
    });
    y = 16;
  }

  const totalsX = 105;
  const totalsWidth = 97;
  const labelWidth = 55;
  const valueWidth = totalsWidth - labelWidth;
  const rowHeight = 5.2;
  let totalsY = y;
  view.content.totals.forEach(([label, value], index) => {
    const bold = index === view.content.totals.length - 1;
    document.setLineWidth(0.2);
    document.rect(totalsX, totalsY, labelWidth, rowHeight);
    document.rect(totalsX + labelWidth, totalsY, valueWidth, rowHeight);
    drawText(document, `${label}:`, totalsX + 1, totalsY + 3.6, labelWidth - 2, {
      size: 8.5,
      style: bold ? 'bold' : 'normal',
      align: 'right',
    });
    drawText(document, `S/ ${value}`, totalsX + labelWidth + 1, totalsY + 3.6, valueWidth - 2, {
      size: 8.5,
      style: bold ? 'bold' : 'normal',
      align: 'right',
    });
    totalsY += rowHeight;
  });

  drawText(document, 'Valor de venta de\noperaciones gratuitas', page.margin + 1, y + 18, 40, {
    size: 8.5,
    align: 'right',
  });
  document.rect(page.margin + 43, y + 13, 45, 10);
  drawText(document, `S/ ${view.content.freeOperations}`, page.margin + 45, y + 19, 41, {
    size: 9,
  });
  const wordsBottom = drawText(
    document,
    `SON: ${view.content.amountInWords}`,
    page.margin + 1,
    y + 34,
    88,
    { size: 9.5, font: 'times', style: 'bold' },
  );

  const footerY = Math.max(totalsY, wordsBottom) + 18;
  document.setLineWidth(0.6);
  document.line(page.margin, footerY, page.width - page.margin, footerY);
  drawText(document, view.content.footer, page.margin + 2, footerY + 5, page.contentWidth - 4, {
    size: 8,
    style: 'italic',
    align: 'center',
  });
}

function addPageNumbers(document) {
  const pages = document.getNumberOfPages();
  for (let current = 1; current <= pages; current += 1) {
    document.setPage(current);
    drawText(document, `Página ${current} de ${pages}`, page.margin, 291, page.contentWidth, {
      size: 7.5,
      align: 'right',
    });
  }
}

function configureMetadata(document, view) {
  const issuedAt = new Date(view.issuedAt);
  document.setCreationDate(issuedAt);
  document.setDocumentProperties({
    title: `${view.title} ${view.reference}`,
    author: view.issuer,
    subject: `Plantilla ${view.version}`,
    creator: 'Sistema de Comprobantes SERNANP',
  });
  const fileId = createHash('sha256')
    .update(`${view.version}|${view.reference}|${view.issuedAt}`)
    .digest('hex')
    .slice(0, 32)
    .toUpperCase();
  document.setFileId(fileId);
}

/** Genera un A4 directamente en Node.js, sin DOM, navegador ni llamadas de red. */
export function createJsPdfRenderer(_config = {}, logger = console) {
  return async function render(view) {
    let stage = 'crear_documento';
    try {
      if (!view?.content) throw new Error('La vista PDF no contiene datos de presentacion.');
      const document = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
        putOnlyUsedFonts: true,
      });
      configureMetadata(document, view);
      stage = 'dibujar_cabecera';
      let y = drawHeader(document, view);
      stage = 'dibujar_comprador';
      y = drawCustomer(document, view, y);
      stage = 'dibujar_detalle';
      y = drawItems(document, view, y);
      stage = 'dibujar_totales';
      drawSummary(document, view, y);
      addPageNumbers(document);
      stage = 'serializar_pdf';
      const content = Buffer.from(document.output('arraybuffer'));
      if (!content.subarray(0, 5).equals(Buffer.from('%PDF-')))
        throw new Error('jsPDF no produjo un archivo PDF valido.');
      diagnosticLog(logger, 'info', 'documentos.render_pdf_completado', {
        motor: 'jspdf',
        versionPlantilla: view.version,
        paginas: document.getNumberOfPages(),
        bytes: content.length,
      });
      return content;
    } catch (error) {
      diagnosticLog(logger, 'error', 'documentos.render_pdf_error', {
        motor: 'jspdf',
        etapa: stage,
        ...diagnosticError(error),
      });
      if (error instanceof AppError) throw error;
      throw new AppError(
        503,
        'ERROR_RENDER_PDF',
        `No se pudo generar la representacion PDF: ${error.message}`,
      );
    }
  };
}

import { readFile } from 'node:fs/promises';

const templateUrls = Object.freeze({
  FACTURA: new URL('./pdf/factura.html', import.meta.url),
  BOLETA: new URL('./pdf/boleta.html', import.meta.url),
});
const stylesUrl = new URL('./pdf/comprobante.css', import.meta.url);
const templateCache = new Map();

const readCached = (url) => {
  const key = url.href;
  if (!templateCache.has(key)) templateCache.set(key, readFile(url, 'utf8'));
  return templateCache.get(key);
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const toCents = (value) => BigInt(String(value).replace('.', ''));
const money = (value) => {
  const cents = typeof value === 'bigint' ? value : toCents(value);
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};

const units = [
  '',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISEIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDOS',
  'VEINTITRES',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISEIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];
const tens = [
  '',
  '',
  '',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];
const hundreds = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

function lessThanThousand(value) {
  if (value === 0) return '';
  if (value === 100) return 'CIEN';
  const hundred = Math.trunc(value / 100);
  const remainder = value % 100;
  const parts = hundred ? [hundreds[hundred]] : [];
  if (remainder < 30) {
    if (remainder) parts.push(units[remainder]);
  } else {
    const ten = Math.trunc(remainder / 10);
    const unit = remainder % 10;
    parts.push(unit ? `${tens[ten]} Y ${units[unit]}` : tens[ten]);
  }
  return parts.join(' ');
}

function integerInWords(value) {
  if (value === 0) return 'CERO';
  const millions = Math.trunc(value / 1_000_000);
  const thousands = Math.trunc((value % 1_000_000) / 1000);
  const remainder = value % 1000;
  const parts = [];
  if (millions) {
    parts.push(millions === 1 ? 'UN MILLON' : `${apocopate(lessThanThousand(millions))} MILLONES`);
  }
  if (thousands)
    parts.push(thousands === 1 ? 'MIL' : `${apocopate(lessThanThousand(thousands))} MIL`);
  if (remainder) parts.push(lessThanThousand(remainder));
  return parts.join(' ');
}

const apocopate = (value) =>
  value
    .replace(/VEINTIUNO$/, 'VEINTIUN')
    .replace(/ Y UNO$/, ' Y UN')
    .replace(/UNO$/, 'UN');

export function amountInWords(value) {
  const cents = toCents(value);
  const integer = Number(cents / 100n);
  const fraction = String(cents % 100n).padStart(2, '0');
  return `${apocopate(integerInWords(integer))} Y ${fraction}/100 SOLES`;
}

export const pdfTemplateVersion = (type) => `${type === 'FACTURA' ? 'factura' : 'boleta'}-html-v2`;

const formatDate = (value) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));

function totals(data) {
  const summary = {
    gross: 0n,
    discounts: 0n,
    tax: 0n,
    taxable: 0n,
    exempt: 0n,
    unaffected: 0n,
    free: 0n,
  };
  for (const item of data.detalle) {
    const gross = BigInt(item.cantidad) * toCents(item.precioUnitario);
    const base = gross - toCents(item.descuento);
    summary.gross += gross;
    summary.discounts += toCents(item.descuento);
    summary.tax += toCents(item.impuesto);
    if (item.afectacion === 'GRAVADO') summary.taxable += base;
    if (item.afectacion === 'EXONERADO') summary.exempt += base;
    if (item.afectacion === 'INAFECTO') summary.unaffected += base;
    if (item.afectacion === 'GRATUITO') summary.free += base;
  }
  return summary;
}

function itemRows(data) {
  return data.detalle
    .map((item) => {
      const identifiers = item.boletoIds.length
        ? `<span class="item-reference">Boletos: ${escapeHtml(item.boletoIds.join(', '))}</span>`
        : '';
      return `<tr>
        <td class="number">${escapeHtml(item.cantidad.toFixed(2))}</td>
        <td class="unit">UNIDAD</td>
        <td class="description">${escapeHtml(item.descripcion)}${identifiers}</td>
        <td class="money">${escapeHtml(money(item.precioUnitario))}</td>
        <td class="money">0.00</td>
      </tr>`;
    })
    .join('\n');
}

function render(template, tokens) {
  const result = template.replace(/\{\{([A-Z_]+)\}\}/g, (match, name) => {
    if (!Object.hasOwn(tokens, name)) throw new Error(`Variable de plantilla no definida: ${name}`);
    return tokens[name];
  });
  if (/\{\{[A-Z_]+\}\}/.test(result))
    throw new Error('La plantilla PDF conserva variables sin resolver.');
  return result;
}

const presentationText = (value, fallback) => {
  const configured = typeof value === 'string' ? value.trim().replaceAll('\\n', '\n') : '';
  return configured || fallback;
};

const multilineHtml = (value) => escapeHtml(value).replaceAll('\n', '<br>');

/** Arma el HTML desde el snapshot persistido y la presentacion explicita; no consulta la red. */
export async function renderComprobanteHtml(record, presentation = {}) {
  const data = record.payload;
  const result = record.resultado_emision;
  const type = data.tipoComprobante;
  const [template, styles] = await Promise.all([
    readCached(templateUrls[type]),
    readCached(stylesUrl),
  ]);
  const summary = totals(data);
  const beta = result.respuestaSunat.ambiente === 'beta';
  const version = pdfTemplateVersion(type);
  const issuerName = presentationText(presentation.issuerName, data.emisor.razonSocial);
  const issuerAddress = presentationText(presentation.issuerAddress, data.emisor.direccion);
  const brand = issuerName.toUpperCase().includes('SERNANP') ? 'SERNANP' : issuerName;
  const valueSale = summary.gross - summary.discounts;
  const tokens = {
    STYLES: styles,
    DOCUMENT_TITLE: type === 'FACTURA' ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA',
    DOCUMENT_REFERENCE: escapeHtml(`${result.serie}-${result.numero}`),
    ISSUER_BRAND: escapeHtml(brand),
    ISSUER_NAME: escapeHtml(issuerName),
    ISSUER_RUC: escapeHtml(data.emisor.ruc),
    ISSUER_ADDRESS: multilineHtml(issuerAddress),
    ISSUE_DATE: escapeHtml(formatDate(result.fechaEmision)),
    CUSTOMER_NAME: escapeHtml(data.comprador.nombre),
    CUSTOMER_DOCUMENT_LABEL: escapeHtml(data.comprador.tipoDocumento),
    CUSTOMER_DOCUMENT: escapeHtml(data.comprador.numeroDocumento),
    CUSTOMER_ADDRESS: escapeHtml(data.comprador.direccion || 'NO INFORMADA'),
    PAYMENT_METHOD: 'CONTADO',
    CURRENCY_NAME: 'SOLES',
    OBSERVATION: `FORMA DE PAGO/CONTADO<br>COMPRA ${escapeHtml(data.compraId)} · ${escapeHtml(data.modalidad)}`,
    ITEM_ROWS: itemRows(data),
    FREE_OPERATIONS: money(summary.free),
    SUBTOTAL_SALES: money(summary.gross + summary.tax),
    ADVANCES: '0.00',
    DISCOUNTS: money(summary.discounts),
    SALE_VALUE: money(valueSale),
    ISC: '0.00',
    IGV: money(summary.tax),
    ICBPER: '0.00',
    OTHER_CHARGES: '0.00',
    OTHER_TAXES: '0.00',
    ROUNDING: '0.00',
    TOTAL: money(data.total),
    AMOUNT_IN_WORDS: escapeHtml(amountInWords(data.total)),
    FOOTER: escapeHtml(
      beta
        ? 'Esta es una representación impresa del comprobante electrónico, generada en el ambiente de pruebas SUNAT. Documento sin validez tributaria.'
        : 'Esta es una representación impresa del comprobante electrónico. Puede verificarla utilizando los servicios de SUNAT.',
    ),
  };
  return {
    html: render(template, tokens),
    version,
    title: type === 'FACTURA' ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA',
    reference: `${result.serie}-${result.numero}`,
    issuer: issuerName,
    issuedAt: result.fechaEmision,
  };
}

/** Alias conservado para consumidores internos de la plantilla anterior. */
export const comprobanteTemplate = renderComprobanteHtml;

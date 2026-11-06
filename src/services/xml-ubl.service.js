import { compraSchema, cents } from '../validators/compra.validator.js';
import { escapeXml as x } from '../utils/xml.js';
import { ProviderError } from '../utils/errors.js';

const taxes = {
  GRAVADO: { reason: '10', id: '1000', name: 'IGV', type: 'VAT' },
  EXONERADO: { reason: '20', id: '9997', name: 'EXO', type: 'VAT' },
  INAFECTO: { reason: '30', id: '9998', name: 'INA', type: 'FRE' },
};
const amount = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
const reject = (message) => {
  throw new ProviderError(message, { retryable: false });
};
const scheme = (tax) =>
  `<cac:TaxScheme><cbc:ID>${tax.id}</cbc:ID><cbc:Name>${tax.name}</cbc:Name><cbc:TaxTypeCode>${tax.type}</cbc:TaxTypeCode></cac:TaxScheme>`;
const subtotal = (line, withReason = false) =>
  `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="PEN">${amount(line.base)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="PEN">${amount(line.tax)}</cbc:TaxAmount><cac:TaxCategory>${withReason ? `<cbc:Percent>${line.percent}</cbc:Percent><cbc:TaxExemptionReasonCode>${line.scheme.reason}</cbc:TaxExemptionReasonCode>` : ''}${scheme(line.scheme)}</cac:TaxCategory></cac:TaxSubtotal>`;

/** Genera la misma UBL para beta o produccion; ambiente, series y local provienen de .env. */
export function createSunatRequest(input, config, { numero, now = new Date() }) {
  // FLUJO 08/18, construccion del XML.
  // LLAMADO POR: sunat.service.js -> prepareRequest().
  // HACE: valida impuestos y arma Invoice UBL 2.1. No usa red ni base de datos.
  // CONTINUA EN: firma-xml.service.js -> signUblXml().
  // DENTRO: 1 compra y numero, 2 lineas e impuesto, 3 serie y fecha Lima, 4 XML de cabecera y detalle.
  const payload = compraSchema.parse(input);
  if (config.environment === 'beta' && payload.emisor.ruc !== '20000000001')
    reject('SUNAT beta requiere el emisor ficticio 20000000001.');
  if (!/^[1-9]\d{0,7}$/.test(numero)) reject('Numeracion SUNAT fuera de rango.');
  const lines = payload.detalle.map((item) => {
    const affectation = item.afectacion === 'POR_DEFINIR' ? config.undefinedTax : item.afectacion;
    const taxScheme = taxes[affectation];
    if (!taxScheme)
      reject('La afectacion debe estar definida antes de enviar el comprobante a SUNAT.');
    const base = BigInt(item.cantidad) * cents(item.precioUnitario) - cents(item.descuento);
    const tax = cents(item.impuesto);
    if (base <= 0n) reject('Las gratuidades y bases cero requieren un contrato fiscal adicional.');
    if (affectation !== 'GRAVADO' && tax !== 0n)
      reject('Una linea exonerada o inafecta no puede informar impuesto distinto de cero.');
    const rate = (tax * 10000n + base / 2n) / base;
    if (
      affectation === 'GRAVADO' &&
      (rate <= 0n || rate > 10000n || (base * rate + 5000n) / 10000n !== tax)
    )
      reject('El impuesto informado no permite una tasa porcentual consistente.');
    return { item, affectation, base, tax, percent: amount(rate), scheme: taxScheme };
  });

  const serie = payload.tipoComprobante === 'FACTURA' ? config.invoiceSeries : config.receiptSeries;
  const code = payload.tipoComprobante === 'FACTURA' ? '01' : '03';
  const referencia = `${serie}-${numero}`;
  const fecha = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const hora = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const docType = { RUC: '6', DNI: '1', CE: '4', PASAPORTE: '7', OTRO: '0' }[
    payload.comprador.tipoDocumento
  ];
  const grouped = new Map();
  for (const line of lines) {
    const group = grouped.get(line.affectation) ?? { ...line, base: 0n, tax: 0n };
    group.base += line.base;
    group.tax += line.tax;
    grouped.set(line.affectation, group);
  }
  const totalTax = lines.reduce((sum, line) => sum + line.tax, 0n);
  const totalBase = lines.reduce((sum, line) => sum + line.base, 0n);
  const party = (name, documentType, number, address, issuer = false) =>
    `<cac:Party><cac:PartyIdentification><cbc:ID schemeID="${documentType}">${x(number)}</cbc:ID></cac:PartyIdentification><cac:PartyLegalEntity><cbc:RegistrationName>${x(name)}</cbc:RegistrationName>${address ? `<cac:RegistrationAddress>${issuer ? `<cbc:AddressTypeCode>${config.localCode}</cbc:AddressTypeCode>` : ''}<cac:AddressLine><cbc:Line>${x(address)}</cbc:Line></cac:AddressLine><cac:Country><cbc:IdentificationCode>PE</cbc:IdentificationCode></cac:Country></cac:RegistrationAddress>` : ''}</cac:PartyLegalEntity></cac:Party>`;
  const warning =
    config.environment === 'beta'
      ? '<cbc:Note>SOLO PRUEBA SUNAT BETA - SIN VALIDEZ TRIBUTARIA</cbc:Note>'
      : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
<cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:CustomizationID>2.0</cbc:CustomizationID>
<cbc:ID>${referencia}</cbc:ID><cbc:IssueDate>${fecha}</cbc:IssueDate><cbc:IssueTime>${hora}</cbc:IssueTime>
<cbc:InvoiceTypeCode listID="0101">${code}</cbc:InvoiceTypeCode>${warning}<cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode><cbc:LineCountNumeric>${lines.length}</cbc:LineCountNumeric>
<cac:Signature><cbc:ID>SignatureSP</cbc:ID><cac:SignatoryParty><cac:PartyIdentification><cbc:ID>${payload.emisor.ruc}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>${x(payload.emisor.razonSocial)}</cbc:Name></cac:PartyName></cac:SignatoryParty><cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#SignatureSP</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment></cac:Signature>
<cac:AccountingSupplierParty>${party(payload.emisor.razonSocial, '6', payload.emisor.ruc, payload.emisor.direccion, true)}</cac:AccountingSupplierParty>
<cac:AccountingCustomerParty>${party(payload.comprador.nombre, docType, payload.comprador.numeroDocumento, payload.comprador.direccion)}</cac:AccountingCustomerParty>
<cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Contado</cbc:PaymentMeansID></cac:PaymentTerms>
<cac:TaxTotal><cbc:TaxAmount currencyID="PEN">${amount(totalTax)}</cbc:TaxAmount>${[...grouped.values()].map((line) => subtotal(line)).join('')}</cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="PEN">${amount(totalBase)}</cbc:LineExtensionAmount><cbc:TaxInclusiveAmount currencyID="PEN">${payload.total}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="PEN">${payload.total}</cbc:PayableAmount></cac:LegalMonetaryTotal>
${lines
  .map((line, index) => {
    const { item } = line;
    const priceScaled =
      (cents(item.total) * 100000000n + BigInt(item.cantidad) / 2n) / BigInt(item.cantidad);
    const price = `${priceScaled / 10000000000n}.${String(priceScaled % 10000000000n).padStart(10, '0')}`;
    const allowance =
      cents(item.descuento) > 0n
        ? `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReasonCode>00</cbc:AllowanceChargeReasonCode><cbc:Amount currencyID="PEN">${item.descuento}</cbc:Amount><cbc:BaseAmount currencyID="PEN">${amount(BigInt(item.cantidad) * cents(item.precioUnitario))}</cbc:BaseAmount></cac:AllowanceCharge>`
        : '';
    return `<cac:InvoiceLine><cbc:ID>${index + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="NIU">${item.cantidad}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="PEN">${amount(line.base)}</cbc:LineExtensionAmount><cac:PricingReference><cac:AlternativeConditionPrice><cbc:PriceAmount currencyID="PEN">${price}</cbc:PriceAmount><cbc:PriceTypeCode>01</cbc:PriceTypeCode></cac:AlternativeConditionPrice></cac:PricingReference>${allowance}<cac:TaxTotal><cbc:TaxAmount currencyID="PEN">${item.impuesto}</cbc:TaxAmount>${subtotal(line, true)}</cac:TaxTotal><cac:Item><cbc:Description>${x(item.descripcion)}</cbc:Description><cac:SellersItemIdentification><cbc:ID>${index + 1}</cbc:ID></cac:SellersItemIdentification></cac:Item><cac:Price><cbc:PriceAmount currencyID="PEN">${item.precioUnitario}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
  })
  .join('\n')}
</Invoice>`;
  return {
    ambiente: config.environment,
    tipo: payload.tipoComprobante,
    serie,
    numero,
    referencia,
    fechaEmision: now.toISOString(),
    ruc: payload.emisor.ruc,
    nombreArchivo: `${payload.emisor.ruc}-${code}-${referencia}`,
    xml,
    perfilTributario: payload.detalle.some((item) => item.afectacion === 'POR_DEFINIR')
      ? config.undefinedTax
      : null,
  };
}

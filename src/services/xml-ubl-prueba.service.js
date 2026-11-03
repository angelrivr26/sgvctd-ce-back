import { escapeXml as x } from '../utils/xml.js';

export const betaIssuerRuc = '20000000001';

/** Fixture fiscal explicito, no establece tasas ni datos reales de SERNANP. */
export function createBetaFixture({ tipo = 'FACTURA', numero = '1', now = new Date() } = {}) {
  if (!['FACTURA', 'BOLETA'].includes(tipo) || !/^[1-9]\d{0,7}$/.test(numero))
    throw new Error('Tipo o numeracion de prueba no validos.');
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
  const code = tipo === 'FACTURA' ? '01' : '03';
  const serie = tipo === 'FACTURA' ? 'F001' : 'B001';
  const comprador = {
    tipo: tipo === 'FACTURA' ? '6' : '1',
    numero: tipo === 'FACTURA' ? '20000000002' : '00000001',
    nombre: 'COMPRADOR FICTICIO SOLO BETA',
  };
  const reference = `${serie}-${numero}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
<cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:CustomizationID>2.0</cbc:CustomizationID>
<cbc:ID>${x(reference)}</cbc:ID><cbc:IssueDate>${fecha}</cbc:IssueDate><cbc:IssueTime>${hora}</cbc:IssueTime>
<cbc:InvoiceTypeCode listID="0101">${code}</cbc:InvoiceTypeCode>
<cbc:Note languageLocaleID="1000">CIENTO DIECIOCHO CON 00/100 SOLES</cbc:Note>
<cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode><cbc:LineCountNumeric>1</cbc:LineCountNumeric>
<cac:Signature><cbc:ID>SignatureSP</cbc:ID><cac:SignatoryParty><cac:PartyIdentification><cbc:ID>${betaIssuerRuc}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>EMISOR FICTICIO SOLO SUNAT BETA</cbc:Name></cac:PartyName></cac:SignatoryParty><cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#SignatureSP</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment></cac:Signature>
<cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="6">${betaIssuerRuc}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>EMISOR FICTICIO SOLO SUNAT BETA</cbc:Name></cac:PartyName><cac:PartyLegalEntity><cbc:RegistrationName>EMISOR FICTICIO SOLO SUNAT BETA</cbc:RegistrationName><cac:RegistrationAddress><cbc:ID>150101</cbc:ID><cbc:AddressTypeCode>0000</cbc:AddressTypeCode><cbc:CityName>LIMA</cbc:CityName><cbc:CountrySubentity>LIMA</cbc:CountrySubentity><cbc:District>LIMA</cbc:District><cac:AddressLine><cbc:Line>DIRECCION FICTICIA SOLO PRUEBAS</cbc:Line></cac:AddressLine><cac:Country><cbc:IdentificationCode>PE</cbc:IdentificationCode></cac:Country></cac:RegistrationAddress></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
<cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="${comprador.tipo}">${comprador.numero}</cbc:ID></cac:PartyIdentification><cac:PartyLegalEntity><cbc:RegistrationName>${x(comprador.nombre)}</cbc:RegistrationName><cac:RegistrationAddress><cac:AddressLine><cbc:Line>DIRECCION FICTICIA</cbc:Line></cac:AddressLine><cac:Country><cbc:IdentificationCode>PE</cbc:IdentificationCode></cac:Country></cac:RegistrationAddress></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
<cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Contado</cbc:PaymentMeansID></cac:PaymentTerms>
<cac:TaxTotal><cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="PEN">100.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount><cac:TaxCategory><cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="PEN">100.00</cbc:LineExtensionAmount><cbc:TaxInclusiveAmount currencyID="PEN">118.00</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="PEN">118.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="NIU">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="PEN">100.00</cbc:LineExtensionAmount><cac:PricingReference><cac:AlternativeConditionPrice><cbc:PriceAmount currencyID="PEN">118.00</cbc:PriceAmount><cbc:PriceTypeCode>01</cbc:PriceTypeCode></cac:AlternativeConditionPrice></cac:PricingReference><cac:TaxTotal><cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="PEN">100.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount><cac:TaxCategory><cbc:Percent>18.00</cbc:Percent><cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode><cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal><cac:Item><cbc:Description>INGRESO FICTICIO SOLO PRUEBA SUNAT BETA</cbc:Description><cac:SellersItemIdentification><cbc:ID>PRUEBA-1</cbc:ID></cac:SellersItemIdentification></cac:Item><cac:Price><cbc:PriceAmount currencyID="PEN">100.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;
  return {
    tipo,
    serie,
    numero,
    referencia: reference,
    fecha,
    fechaEmision: now.toISOString(),
    ruc: betaIssuerRuc,
    nombreArchivo: `${betaIssuerRuc}-${code}-${reference}`,
    xml,
    payload: {
      tipoComprobante: tipo,
      modalidad: 'NORMAL',
      compraId: `SOLO-BETA-${reference}`,
      moneda: 'PEN',
      fechaPago: now.toISOString(),
      emisor: {
        ruc: betaIssuerRuc,
        razonSocial: 'EMISOR FICTICIO SOLO SUNAT BETA',
        direccion: 'DIRECCION FICTICIA SOLO PRUEBAS',
      },
      comprador: {
        tipoDocumento: tipo === 'FACTURA' ? 'RUC' : 'DNI',
        numeroDocumento: comprador.numero,
        nombre: comprador.nombre,
        direccion: 'DIRECCION FICTICIA',
      },
      detalle: [
        {
          cantidad: 1,
          descripcion: 'INGRESO FICTICIO SOLO PRUEBA SUNAT BETA',
          boletoIds: ['SOLO-BETA-1'],
          precioUnitario: '100.00',
          descuento: '0.00',
          impuesto: '18.00',
          afectacion: 'GRAVADO',
          total: '118.00',
        },
      ],
      total: '118.00',
    },
  };
}

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { zipSync, unzipSync } from 'fflate';
import { SignedXml } from 'xml-crypto';
import { PDFDocument } from 'pdf-lib';
import { ensureBetaCertificate } from '../scripts/lib/certificado-beta.js';
import { persistBetaResult } from '../scripts/lib/resultado-beta.js';
import { createBetaFixture } from '../src/services/xml-ubl-prueba.service.js';
import { signUblXml } from '../src/services/firma-xml.service.js';
import { createSunatBetaService, parseBetaResponse } from '../src/services/sunat-beta.service.js';
import { parseSunatConfig } from '../src/config/sunat.js';
import { parseXml, uniqueElement } from '../src/utils/xml.js';

let directory, credentials;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'sunat-beta-test-'));
  credentials = await ensureBetaCertificate(join(directory, 'certificado'));
});
after(async () => {
  const target = resolve(directory);
  if (
    target.startsWith(`${resolve(tmpdir())}\\sunat-beta-test-`) ||
    target.startsWith(`${resolve(tmpdir())}/sunat-beta-test-`)
  )
    await rm(target, { recursive: true, force: true });
});

const soap = (content) =>
  `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${content}</s:Body></s:Envelope>`;
const fixture = () => createBetaFixture({ numero: '123', now: new Date('2026-11-02T15:00:00Z') });
function cdrReply({
  code = '0',
  reference = 'F001-123',
  fileName = '20000000001-01-F001-123',
  extra = {},
  responseCode = '',
} = {}) {
  const cdr = `<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cac:DocumentResponse><cac:Response><cbc:ReferenceID>${reference}</cbc:ReferenceID><cbc:ResponseCode>${code}</cbc:ResponseCode>${responseCode}<cbc:Description>Respuesta de fixture offline</cbc:Description></cac:Response></cac:DocumentResponse></ApplicationResponse>`;
  const zip = zipSync({
    'dummy/': new Uint8Array(),
    [`R-${fileName}.xml`]: Buffer.from(cdr),
    ...extra,
  });
  return soap(
    `<sendBillResponse><applicationResponse>${Buffer.from(zip).toString('base64')}</applicationResponse></sendBillResponse>`,
  );
}

test('fixture UBL distingue factura y boleta y usa la fecha de Lima', () => {
  for (const tipo of ['FACTURA', 'BOLETA']) {
    const data = createBetaFixture({ tipo, numero: '123', now: new Date('2026-11-02T02:00:00Z') });
    const xml = parseXml(data.xml);
    assert.equal(
      xml.documentElement.namespaceURI,
      'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    );
    assert.equal(uniqueElement(xml, '*', 'IssueDate').textContent, '2026-11-01');
    assert.equal(
      uniqueElement(xml, '*', 'InvoiceTypeCode').textContent,
      tipo === 'FACTURA' ? '01' : '03',
    );
    assert.equal(data.payload.total, '118.00');
  }
  assert.throws(() => createBetaFixture({ numero: '../1' }));
});

test('la firma RSA-SHA256 se verifica y una alteracion del importe la invalida', () => {
  const signed = signUblXml(fixture().xml, credentials);
  const altered = signed.xml.replace(
    '<cbc:PayableAmount currencyID="PEN">118.00',
    '<cbc:PayableAmount currencyID="PEN">119.00',
  );
  const check = new SignedXml({
    publicCert: credentials.certificate,
    getCertFromKeyInfo: () => null,
  });
  check.loadSignature(
    uniqueElement(parseXml(altered), 'http://www.w3.org/2000/09/xmldsig#', 'Signature'),
  );
  assert.equal(check.checkSignature(altered), false);
  assert.throws(() => signUblXml(signed.xml, credentials));
  assert.ok(!signed.xml.includes('PRIVATE KEY'));
});

test('CDR codigo 0 y directorio dummy vacio se leen como aceptacion beta', () => {
  const result = parseBetaResponse(cdrReply(), 200, 'F001-123', '20000000001-01-F001-123');
  assert.equal(result.estado, 'ACEPTADO_BETA');
  assert.equal(result.codigo, '0');
  assert.equal(result.aceptado, true);
  assert.ok(result.cdrZip.length > 0);
});

test('HTTP 200 con CDR rechazada no se considera aceptacion', () => {
  const result = parseBetaResponse(
    cdrReply({ code: '2335' }),
    200,
    'F001-123',
    '20000000001-01-F001-123',
  );
  assert.equal(result.estado, 'RECHAZADO_BETA');
  assert.equal(result.aceptado, false);
});

test('SOAP Fault conserva el codigo sin fabricar una CDR', () => {
  const result = parseBetaResponse(
    soap(
      '<s:Fault><faultcode>soap:1033</faultcode><faultstring>Usuario no autorizado</faultstring></s:Fault>',
    ),
    500,
    'F001-123',
    '20000000001-01-F001-123',
  );
  assert.equal(result.estado, 'ERROR_SOAP_BETA');
  assert.equal(result.codigo, 'soap:1033');
  assert.equal(result.aceptado, false);
  assert.equal(result.cdrXml, undefined);
});

test('rechaza CDR de otro documento, otro emisor o codigo ambiguo', () => {
  for (const options of [
    { reference: 'F001-124' },
    { fileName: '20000000002-01-F001-123' },
    { responseCode: '<cbc:ResponseCode>9999</cbc:ResponseCode>' },
  ])
    assert.throws(() =>
      parseBetaResponse(cdrReply(options), 200, 'F001-123', '20000000001-01-F001-123'),
    );
});

test('rechaza XML con entidades, ZIP con rutas y respuestas sin CDR', () => {
  assert.throws(() => parseXml('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secret">]><a>&x;</a>'));
  assert.throws(() => parseXml('<a>'));
  assert.throws(() =>
    parseBetaResponse(
      cdrReply({ extra: { '../escape.xml': Buffer.from('<a/>') } }),
      200,
      'F001-123',
      '20000000001-01-F001-123',
    ),
  );
  assert.throws(() =>
    parseBetaResponse(soap('<sendBillResponse/>'), 200, 'F001-123', '20000000001-01-F001-123'),
  );
  assert.throws(() =>
    parseBetaResponse('<html>Error</html>', 503, 'F001-123', '20000000001-01-F001-123'),
  );
});

test('rechaza CDR ZIP que excede los limites de descompresion', () => {
  assert.throws(() =>
    parseBetaResponse(
      cdrReply({ extra: { 'grande.xml': new Uint8Array(2_000_001) } }),
      200,
      'F001-123',
      '20000000001-01-F001-123',
    ),
  );
});

test('transporte apunta solo a beta y envia XML firmado empaquetado y credenciales publicas', async () => {
  let sent;
  let prepared = false;
  const beta = createSunatBetaService({
    fetchImpl: async (url, options) => {
      assert.equal(prepared, true);
      sent = { url, options };
      return new Response(cdrReply(), { status: 200 });
    },
    onPrepared: async ({ zip }) => {
      assert.ok(zip.length > 0);
      prepared = true;
    },
  });
  const data = fixture();
  const signed = signUblXml(data.xml, credentials);
  const result = await beta.send({ ...data, xml: signed.xml });
  assert.equal(result.aceptado, true);
  assert.equal(sent.url, parseSunatConfig().endpoint);
  assert.equal(sent.options.redirect, 'error');
  assert.equal(sent.options.headers.SOAPAction, 'urn:sendBill');
  const request = parseXml(sent.options.body);
  assert.equal(uniqueElement(request, '*', 'Username').textContent, '20000000001MODDATOS');
  assert.equal(uniqueElement(request, '*', 'Password').textContent, 'MODDATOS');
  const zip = Buffer.from(uniqueElement(request, '*', 'contentFile').textContent, 'base64');
  const entries = unzipSync(zip);
  assert.deepEqual(Object.keys(entries), [`${data.nombreArchivo}.xml`]);
  assert.equal(Buffer.from(entries[`${data.nombreArchivo}.xml`]).toString('utf8'), signed.xml);
  await assert.rejects(beta.send({ ...data, ruc: '20111111111', xml: signed.xml }));
});

test('un timeout no provoca reenvio automatico ni aceptacion inventada', async () => {
  let calls = 0;
  const beta = createSunatBetaService({
    fetchImpl: async () => {
      calls++;
      throw new Error('Timeout');
    },
  });
  const data = fixture();
  const signed = signUblXml(data.xml, credentials);
  await assert.rejects(beta.send({ ...data, xml: signed.xml }), /Timeout/);
  assert.equal(calls, 1);
});

test('el PDF beta se guarda despues de persistir CDR aceptada y permite recuperacion local', async () => {
  const folder = join(directory, 'documentos-aceptados');
  await mkdir(folder);
  const data = fixture();
  const result = parseBetaResponse(cdrReply(), 200, data.referencia, data.nombreArchivo);
  const report = { pdfGenerado: false };
  await persistBetaResult(folder, report, data, { ...result, respuestaSoap: cdrReply() });
  const pdf = await PDFDocument.load(await readFile(join(folder, `${data.nombreArchivo}.pdf`)));
  assert.match(pdf.getSubject(), /beta-v1/);
  assert.equal(report.aceptadoBeta, true);
  const first = await readFile(join(folder, `${data.nombreArchivo}.pdf`));
  await persistBetaResult(folder, report, data, { ...result, respuestaSoap: cdrReply() });
  assert.deepEqual(await readFile(join(folder, `${data.nombreArchivo}.pdf`)), first);
});

test('una CDR rechazada se conserva sin generar PDF', async () => {
  const folder = join(directory, 'documentos-rechazados');
  await mkdir(folder);
  const data = fixture();
  const result = parseBetaResponse(
    cdrReply({ code: '2335' }),
    200,
    data.referencia,
    data.nombreArchivo,
  );
  const report = { pdfGenerado: false };
  await persistBetaResult(folder, report, data, {
    ...result,
    respuestaSoap: cdrReply({ code: '2335' }),
  });
  assert.equal(report.pdfGenerado, false);
  assert.ok(!(await readdir(folder)).some((name) => name.endsWith('.pdf')));
  assert.equal(
    JSON.parse(await readFile(join(folder, 'resultado.json'), 'utf8')).estado,
    'RECHAZADO_BETA',
  );
});

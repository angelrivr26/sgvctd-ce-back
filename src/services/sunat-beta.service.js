import { zipSync, unzipSync } from 'fflate';
import { parseXml, uniqueElement, escapeXml } from '../utils/xml.js';
import { parseSunatConfig, requireBetaConfig } from '../config/sunat.js';

const soapNamespace = 'http://schemas.xmlsoap.org/soap/envelope/';
const cbcNamespace = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const maxResponse = 4_000_000;

export async function readBoundedResponse(response) {
  const chunks = [];
  let length = 0;
  try {
    for await (const chunk of response.body ?? []) {
      length += chunk.length;
      if (length > maxResponse) throw new Error('Respuesta beta excede el limite.');
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    await response.body?.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseBetaResponse(text, httpStatus, expectedReference, expectedFileName) {
  const document = parseXml(text, maxResponse);
  if (
    document.documentElement.localName !== 'Envelope' ||
    document.documentElement.namespaceURI !== soapNamespace
  )
    throw new Error('SUNAT beta no devolvio un sobre SOAP esperado.');
  const body = uniqueElement(document, soapNamespace, 'Body');
  const faults = body.getElementsByTagNameNS(soapNamespace, 'Fault');
  if (faults.length) {
    const fault = faults[0];
    const code = fault.getElementsByTagName('faultcode')[0]?.textContent ?? 'SOAP_FAULT';
    const description =
      fault.getElementsByTagName('faultstring')[0]?.textContent ?? 'Falla SOAP sin descripcion';
    return {
      estado: 'ERROR_SOAP_BETA',
      httpStatus,
      codigo: code.slice(0, 100),
      descripcion: description.slice(0, 1000),
      aceptado: false,
    };
  }
  if (httpStatus < 200 || httpStatus >= 300)
    throw new Error(`SUNAT beta respondio HTTP ${httpStatus} sin CDR.`);
  const encoded = uniqueElement(body, '*', 'applicationResponse').textContent.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
    throw new Error('La CDR ZIP no contiene base64 valido.');
  const cdrZip = Buffer.from(encoded, 'base64');
  let totalSize = 0,
    count = 0;
  const entries = unzipSync(cdrZip, {
    filter: (file) => {
      totalSize += file.originalSize;
      count++;
      if (count > 5 || totalSize > 2_000_000) throw new Error('CDR ZIP fuera de los limites.');
      // SUNAT beta agrega un directorio dummy/ vacio. No se extraen directorios al disco.
      if (/^(?:[A-Za-z0-9_-]+\/)+$/.test(file.name) && file.originalSize === 0) return false;
      if (file.name.includes('/') || file.name.includes('\\') || file.name.includes('..'))
        throw new Error('Nombre no permitido dentro de CDR ZIP.');
      return /\.xml$/i.test(file.name);
    },
  });
  const names = Object.keys(entries);
  if (names.length !== 1) throw new Error('Se esperaba un unico XML de CDR.');
  if (!expectedFileName || names[0].toUpperCase() !== `R-${expectedFileName}.XML`.toUpperCase())
    throw new Error('El archivo CDR no corresponde al emisor y documento enviados.');
  const cdrXml = Buffer.from(entries[names[0]]).toString('utf8');
  const cdr = parseXml(cdrXml);
  if (
    cdr.documentElement.localName !== 'ApplicationResponse' ||
    cdr.documentElement.namespaceURI !==
      'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2'
  )
    throw new Error('Documento CDR no reconocido.');
  const response = uniqueElement(
    cdr,
    'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    'Response',
  );
  const reference = uniqueElement(response, cbcNamespace, 'ReferenceID').textContent.trim();
  if (reference !== expectedReference)
    throw new Error('La CDR no corresponde al comprobante enviado.');
  const code = uniqueElement(response, cbcNamespace, 'ResponseCode').textContent.trim();
  const description = uniqueElement(response, cbcNamespace, 'Description').textContent.trim();
  const observations = Array.from(cdr.getElementsByTagNameNS(cbcNamespace, 'Note'), (node) =>
    node.textContent.trim(),
  );
  return {
    estado: code === '0' ? 'ACEPTADO_BETA' : 'RECHAZADO_BETA',
    aceptado: code === '0',
    httpStatus,
    codigo: code,
    descripcion: description,
    observaciones: observations,
    referencia: reference,
    cdrZip,
    cdrXml,
  };
}

/** Recibe configuracion validada; solo beta, sin reenvios automaticos. */
export function createSunatBetaService({
  config = parseSunatConfig(),
  fetchImpl = fetch,
  onPrepared = async () => {},
} = {}) {
  const { endpoint, timeoutMs } = requireBetaConfig(config);
  return {
    async diagnose() {
      const response = await fetchImpl(`${endpoint}?wsdl`, {
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const xml = await readBoundedResponse(response);
      const document = parseXml(xml);
      if (!response.ok || document.documentElement.localName !== 'definitions')
        throw new Error(`WSDL beta no disponible: HTTP ${response.status}.`);
      return {
        estado: 'WSDL_BETA_DISPONIBLE',
        httpStatus: response.status,
        endpoint,
        wsdl: xml,
      };
    },
    async send({ nombreArchivo, xml, ruc, referencia }) {
      if (
        ruc !== '20000000001' ||
        !/^20000000001-(01-F001|03-B001)-[1-9]\d{0,7}$/.test(nombreArchivo) ||
        !nombreArchivo.endsWith(`-${referencia}`)
      )
        throw new Error('Solo se admiten los comprobantes ficticios del circuito beta.');
      const document = parseXml(xml);
      uniqueElement(document, 'http://www.w3.org/2000/09/xmldsig#', 'Signature');
      const zip = zipSync({ [`${nombreArchivo}.xml`]: new Uint8Array(Buffer.from(xml, 'utf8')) });
      const body = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${soapNamespace}" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><soapenv:Header><wsse:Security soapenv:mustUnderstand="1"><wsse:UsernameToken><wsse:Username>${ruc}MODDATOS</wsse:Username><wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">MODDATOS</wsse:Password></wsse:UsernameToken></wsse:Security></soapenv:Header><soapenv:Body><ser:sendBill><fileName>${escapeXml(nombreArchivo)}.zip</fileName><contentFile>${Buffer.from(zip).toString('base64')}</contentFile></ser:sendBill></soapenv:Body></soapenv:Envelope>`;
      await onPrepared({ nombreArchivo, zip: Buffer.from(zip) });
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: 'urn:sendBill' },
        body,
      });
      const text = await readBoundedResponse(response);
      try {
        return {
          ...parseBetaResponse(text, response.status, referencia, nombreArchivo),
          enviadoZip: Buffer.from(zip),
          respuestaSoap: text,
        };
      } catch (error) {
        error.httpStatus = response.status;
        error.respuestaSoap = text;
        throw error;
      }
    },
  };
}

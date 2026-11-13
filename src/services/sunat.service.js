import { zipSync, unzipSync } from 'fflate';
import { createSunatModel } from '../models/sunat.model.js';
import { ProviderError } from '../utils/errors.js';
import { parseXml, uniqueElement, escapeXml } from '../utils/xml.js';
import { createSunatRequest, loadSunatCertificate, signUblXml } from './sunat-documento.service.js';

const soapNamespace = 'http://schemas.xmlsoap.org/soap/envelope/';
const cbcNamespace = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const maxResponse = 4_000_000;

class SunatBusyError extends Error {}

function localPreparationError(stage, error) {
  if (error instanceof ProviderError) return error;
  const code = String(error?.code || error?.name || 'ERROR_LOCAL')
    .replace(/[^A-Za-z0-9_:-]/g, '')
    .slice(0, 80);
  return new ProviderError(`No se pudo ${stage} (${code}).`, {
    uncertain: false,
    retryable: true,
  });
}

async function readResponse(response) {
  const chunks = [];
  let length = 0;
  try {
    for await (const chunk of response.body ?? []) {
      length += chunk.length;
      if (length > maxResponse) throw new Error('La respuesta SUNAT excede el limite.');
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    await response.body?.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseSunatResponse(text, httpStatus, expectedReference, expectedFileName) {
  // FASE 3/6. No llama a SUNAT; solo lee un SOAP que ya esta en memoria o en el diario.
  // LLAMADO POR: createSunatTransport().send() y por consultarResultado() si la respuesta ya estaba guardada.
  // HACE: distingue Fault, rechazo y CDR con codigo 0. Exige que el XML corresponda al comprobante enviado.
  // CONTINUA EN: consultarResultado() arma el resultado y procesamiento.service.js decide.
  const document = parseXml(text, maxResponse);
  if (
    document.documentElement.localName !== 'Envelope' ||
    document.documentElement.namespaceURI !== soapNamespace
  )
    throw new Error('SUNAT no devolvio el sobre SOAP esperado.');
  const body = uniqueElement(document, soapNamespace, 'Body');
  const faults = body.getElementsByTagNameNS(soapNamespace, 'Fault');
  if (faults.length) {
    const fault = faults[0];
    return {
      estado: 'ERROR_SOAP',
      httpStatus,
      codigo: (fault.getElementsByTagName('faultcode')[0]?.textContent ?? 'SOAP_FAULT').slice(
        0,
        100,
      ),
      descripcion: (
        fault.getElementsByTagName('faultstring')[0]?.textContent ?? 'Falla SOAP sin descripcion'
      ).slice(0, 1000),
      aceptado: false,
    };
  }
  if (httpStatus < 200 || httpStatus >= 300)
    throw new Error(`SUNAT respondio HTTP ${httpStatus} sin CDR.`);
  const encoded = uniqueElement(body, '*', 'applicationResponse').textContent.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
    throw new Error('La CDR ZIP no contiene base64 valido.');
  const cdrZip = Buffer.from(encoded, 'base64');
  let totalSize = 0;
  let count = 0;
  const entries = unzipSync(cdrZip, {
    filter: (file) => {
      totalSize += file.originalSize;
      count++;
      if (count > 5 || totalSize > 2_000_000) throw new Error('CDR ZIP fuera de los limites.');
      if (/^(?:[A-Za-z0-9_-]+\/)+$/.test(file.name) && file.originalSize === 0) return false;
      if (file.name.includes('/') || file.name.includes('\\') || file.name.includes('..'))
        throw new Error('Nombre no permitido dentro de CDR ZIP.');
      return /\.xml$/i.test(file.name);
    },
  });
  const names = Object.keys(entries);
  if (names.length !== 1) throw new Error('Se esperaba un unico XML de CDR.');
  if (!expectedFileName || names[0].toUpperCase() !== `R-${expectedFileName}.XML`.toUpperCase())
    throw new Error('El archivo CDR no corresponde al comprobante enviado.');
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
  return {
    estado: code === '0' ? 'ACEPTADO' : 'RECHAZADO',
    aceptado: code === '0',
    httpStatus,
    codigo: code,
    descripcion: description,
    observaciones: Array.from(cdr.getElementsByTagNameNS(cbcNamespace, 'Note'), (node) =>
      node.textContent.trim(),
    ),
    referencia: reference,
    cdrXml,
  };
}

/** Transporte comun: beta y produccion usan el mismo SOAP y formato de respuesta. */
export function createSunatTransport({
  config,
  fetchImpl = fetch,
  onPrepared = async () => {},
  onResponse = async () => {},
}) {
  return {
    async diagnose() {
      const response = await fetchImpl(`${config.endpoint}?wsdl`, {
        redirect: 'error',
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      const xml = await readResponse(response);
      const document = parseXml(xml);
      if (!response.ok || document.documentElement.localName !== 'definitions')
        throw new Error(`WSDL SUNAT no disponible: HTTP ${response.status}.`);
      return { estado: 'WSDL_DISPONIBLE', ambiente: config.environment, endpoint: config.endpoint };
    },
    async send(request) {
      // FASE 2/6. Unica llamada de red sendBill de este proyecto.
      // LLAMADO POR: createSunatProvider() -> sendPreparedRequest().
      // HACE: comprime el XML, arma el SOAP, marca el envio, espera la respuesta y la guarda cruda.
      // CONTINUA EN: parseSunatResponse(). onPrepared corre antes del POST; onResponse, justo despues.
      if (
        !/^\d{11}-(01|03)-[A-Z0-9]{4}-[1-9]\d{0,7}$/.test(request.nombreArchivo) ||
        !request.nombreArchivo.endsWith(`-${request.referencia}`)
      )
        throw new Error('Nombre de comprobante SUNAT invalido.');
      const document = parseXml(request.xml);
      uniqueElement(document, 'http://www.w3.org/2000/09/xmldsig#', 'Signature');
      const zip = zipSync({
        [`${request.nombreArchivo}.xml`]: new Uint8Array(Buffer.from(request.xml, 'utf8')),
      });
      const soap = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${soapNamespace}" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><soapenv:Header><wsse:Security soapenv:mustUnderstand="1"><wsse:UsernameToken><wsse:Username>${escapeXml(config.username)}</wsse:Username><wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${escapeXml(config.password)}</wsse:Password></wsse:UsernameToken></wsse:Security></soapenv:Header><soapenv:Body><ser:sendBill><fileName>${escapeXml(request.nombreArchivo)}.zip</fileName><contentFile>${Buffer.from(zip).toString('base64')}</contentFile></ser:sendBill></soapenv:Body></soapenv:Envelope>`;
      await onPrepared({ zip: Buffer.from(zip) });
      const response = await fetchImpl(config.endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(config.timeoutMs),
        headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: 'urn:sendBill' },
        body: soap,
      });
      const text = await readResponse(response);
      await onResponse({ text, httpStatus: response.status });
      return parseSunatResponse(text, response.status, request.referencia, request.nombreArchivo);
    },
  };
}

/**
 * Proveedor SUNAT. Orden interno, siempre de arriba hacia abajo:
 * solicitarEmision()        <- procesamiento.service.js -> confirmEmission()
 *   consultarResultado()    si ya hay SOAP guardado, no vuelve a la red
 *   prepareRequest()        UBL, firma y diario local
 *   sendPreparedRequest()   transport.send()
 */
export function createSunatProvider(
  database,
  config,
  { fetchImpl = fetch, credentials = () => loadSunatCertificate(config) } = {},
) {
  const model = createSunatModel(database);

  async function consultarResultado(id) {
    // FASE 3/6.
    // LLAMADO POR: confirmEmission(), solicitarEmision() y sendPreparedRequest() despues del POST.
    // HACE: lee sunat_envios. Sin fila o en PREPARADO devuelve null. Con SOAP guardado lo interpreta.
    // CONTINUA EN: null sigue a prepareRequest(). SOAP guardado se interpreta sin usar la red.
    let row;
    try {
      row = await model.get(id);
    } catch (error) {
      throw localPreparationError('consultar el diario SUNAT', error);
    }
    if (!row || row.estado === 'PREPARADO') return null;
    if (row.estado === 'ENVIO_INICIADO')
      throw new ProviderError(
        'SUNAT: envio iniciado sin respuesta persistida. Requiere conciliacion y no se reenviara automaticamente.',
        { uncertain: true, retryable: false },
      );
    const request = row.solicitud;
    let result;
    try {
      result = parseSunatResponse(
        row.respuesta_soap,
        row.http_status,
        request.referencia,
        request.nombreArchivo,
      );
    } catch {
      throw new ProviderError(
        'La respuesta SUNAT guardada no acredita una CDR valida. Revise el diario sin reenviar.',
        { uncertain: true, retryable: false },
      );
    }
    return {
      estado: result.aceptado ? 'COMPLETADO' : 'RECHAZADO',
      estadoFiscal: result.estado,
      simulado: false,
      operacionId: id,
      serie: request.serie,
      numero: request.numero,
      fechaEmision: request.fechaEmision,
      perfilTributario: request.perfilTributario,
      respuestaSunat: {
        ambiente: row.ambiente,
        codigo: result.codigo.slice(0, 20),
        descripcion: result.descripcion.slice(0, 2000),
        fechaRespuesta: new Date(row.fecha_respuesta).toISOString(),
      },
      documentos: result.cdrXml
        ? [
            { tipo: 'XML', contenido: request.xml },
            { tipo: 'CDR', contenido: result.cdrXml },
          ]
        : [],
    };
  }

  async function prepareRequest(payload, id) {
    // FASE 2/6, preparacion local.
    // LLAMADO POR: solicitarEmision(), solo cuando consultarResultado() devolvio null.
    // HACE: si el diario ya tiene la fila, la reutiliza. Si no, numera, crea UBL, firma y guarda.
    // CONTINUA EN: sendPreparedRequest(). La red empieza recien ahi.
    let row;
    try {
      row = await model.get(id);
    } catch (error) {
      throw localPreparationError('releer el diario SUNAT', error);
    }
    if (row) return row;

    // FASE 2/6: crear UBL, firmarla y guardarla antes de usar la red.
    let numero;
    try {
      numero = await model.nextNumber();
    } catch (error) {
      throw localPreparationError('reservar la numeracion SUNAT', error);
    }
    let request;
    try {
      request = createSunatRequest(payload, config, { numero });
    } catch (error) {
      throw localPreparationError('construir el UBL', error);
    }
    let signed;
    try {
      signed = signUblXml(request.xml, await credentials());
    } catch (error) {
      throw localPreparationError('cargar el certificado o firmar el UBL', error);
    }
    try {
      return await model.prepare(id, { ...request, xml: signed.xml });
    } catch (error) {
      throw localPreparationError('guardar el diario SUNAT', error);
    }
  }

  async function sendPreparedRequest(row, id) {
    // FASE 2/6, orquestacion del POST.
    // LLAMADO POR: solicitarEmision().
    // HACE: conecta el transporte con el diario. Si otro proceso ya envia, espera. Si el POST falla despues de iniciar, no lo repite.
    // CONTINUA EN: transport.send() y, al terminar, otra vez consultarResultado().
    const sunat = createSunatTransport({
      config,
      fetchImpl,
      onPrepared: async ({ zip }) => {
        if (!(await model.beginSend(id, zip, config.timeoutMs))) throw new SunatBusyError();
      },
      onResponse: (response) => model.saveResponse(id, response, new Date().toISOString()),
    });
    try {
      await sunat.send(row.solicitud);
    } catch (error) {
      if (error instanceof SunatBusyError) {
        const updated = await model.get(id);
        if (updated.estado !== 'PREPARADO') return consultarResultado(id);
        return { estado: 'PENDIENTE', esperaCapacidad: true };
      }
      const saved = await model.get(id);
      if (saved?.estado === 'RESPONDIDO') return consultarResultado(id);
      if (saved?.estado === 'ENVIO_INICIADO') {
        await model.saveTransportError(id, error.cause?.code || error.code || error.name);
        return consultarResultado(id);
      }
      throw error;
    }
    return consultarResultado(id);
  }

  return {
    consultarResultado,
    // FASE 2/6, entrada publica del proveedor.
    // LLAMADO POR: services/procesamiento.service.js -> confirmEmission().
    // HACE: relee el diario, prepara solo si falta la solicitud y envia una sola vez.
    // CONTINUA EN: consultarResultado(), prepareRequest() y sendPreparedRequest().
    async solicitarEmision(payload, id) {
      const previous = await consultarResultado(id);
      if (previous) return previous;
      const row = await prepareRequest(payload, id);
      if (row.ambiente !== config.environment)
        throw new ProviderError(
          `La operacion pertenece a SUNAT ${row.ambiente}; restaure ese ambiente para continuar.`,
          { uncertain: true, retryable: false },
        );
      return sendPreparedRequest(row, id);
    },
  };
}

import { DOMParser } from '@xmldom/xmldom';

export const escapeXml = (value) =>
  String(value).replace(
    /[<>&"']/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char],
  );

export function parseXml(xml, maxBytes = 2_000_000) {
  if (
    typeof xml !== 'string' ||
    Buffer.byteLength(xml, 'utf8') > maxBytes ||
    /<!DOCTYPE|<!ENTITY/i.test(xml)
  )
    throw new Error('XML no permitido o fuera del limite.');
  const document = new DOMParser({
    onError: () => {
      throw new Error('XML mal formado.');
    },
  }).parseFromString(xml, 'application/xml');
  if (!document.documentElement) throw new Error('XML sin elemento raiz.');
  return document;
}

export function uniqueElement(document, namespace, name) {
  const nodes = document.getElementsByTagNameNS(namespace, name);
  if (nodes.length !== 1) throw new Error(`Respuesta XML sin elemento unico ${name}.`);
  return nodes[0];
}

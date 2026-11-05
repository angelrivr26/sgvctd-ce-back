import { SignedXml } from 'xml-crypto';
import { parseXml, uniqueElement } from '../utils/xml.js';

const ds = 'http://www.w3.org/2000/09/xmldsig#';
const c14n = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

/** Firma local; la clave privada nunca se incorpora al XML ni sale del proceso. */
export function signUblXml(xml, { privateKey, certificate }) {
  // FLUJO 08/18: firmar localmente. CONTINUA EN sunat.model.prepare().
  const document = parseXml(xml);
  if (
    document.documentElement.localName !== 'Invoice' ||
    document.getElementsByTagNameNS(ds, 'Signature').length
  )
    throw new Error('Se requiere un Invoice sin firma previa.');
  uniqueElement(
    document,
    'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    'ExtensionContent',
  );
  const signature = new SignedXml({
    privateKey,
    publicCert: certificate,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: c14n,
  });
  signature.addReference({
    xpath: '/*',
    isEmptyUri: true,
    transforms: [`${ds}enveloped-signature`, c14n],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });
  signature.computeSignature(xml, {
    prefix: 'ds',
    attrs: { Id: 'SignatureSP' },
    location: { reference: "//*[local-name()='ExtensionContent']", action: 'append' },
  });
  const signed = signature.getSignedXml();
  const signedDocument = parseXml(signed);
  const verifier = new SignedXml({ publicCert: certificate, getCertFromKeyInfo: () => null });
  verifier.loadSignature(uniqueElement(signedDocument, ds, 'Signature'));
  if (!verifier.checkSignature(signed) || verifier.getSignedReferences().length !== 1)
    throw new Error('La firma generada no supero la verificacion local.');
  return { xml: signed, digestValue: uniqueElement(signedDocument, ds, 'DigestValue').textContent };
}

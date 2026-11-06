import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';

/** Lee el certificado institucional o crea uno local exclusivamente para SUNAT beta. */
export async function loadSunatCertificate(config) {
  // FLUJO 08/18, apoyo de la firma.
  // LLAMADO POR: sunat.service.js -> prepareRequest(), mediante credentials().
  // HACE: lee la clave y el certificado. En beta puede crear un par local si no existe.
  // CONTINUA EN: firma-xml.service.js -> signUblXml().
  let privateKeyPath = config.privateKeyPath;
  let certificatePath = config.certificatePath;

  if (!privateKeyPath && !certificatePath && config.environment === 'beta') {
    await mkdir(config.certificateDirectory, { recursive: true });
    privateKeyPath = join(config.certificateDirectory, 'sunat-private.pem');
    certificatePath = join(config.certificateDirectory, 'sunat-certificate.pem');
    if (existsSync(privateKeyPath) !== existsSync(certificatePath))
      throw new Error('Certificado SUNAT incompleto. Revise la carpeta sin sobrescribir claves.');
    if (!existsSync(privateKeyPath)) {
      const openssl =
        process.env.OPENSSL_BIN ||
        (process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe')
          ? 'C:/Program Files/Git/usr/bin/openssl.exe'
          : 'openssl');
      const generated = spawnSync(
        openssl,
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-sha256',
          '-days',
          '365',
          '-keyout',
          privateKeyPath,
          '-out',
          certificatePath,
          '-subj',
          '/C=PE/O=SOLO PRUEBA SUNAT BETA/CN=EMISOR FICTICIO/serialNumber=20000000001',
        ],
        { encoding: 'utf8', timeout: 30000, windowsHide: true },
      );
      if (generated.error || generated.status !== 0)
        throw new Error(
          'No se pudo generar el certificado beta. Instale OpenSSL o configure OPENSSL_BIN.',
        );
    }
  }

  if (!privateKeyPath || !certificatePath)
    throw new Error('Faltan las rutas del certificado y la clave privada SUNAT.');
  const [privateKey, certificate] = await Promise.all([
    readFile(privateKeyPath, 'utf8'),
    readFile(certificatePath, 'utf8'),
  ]);
  const parsed = new X509Certificate(certificate);
  if (Date.parse(parsed.validTo) <= Date.now())
    throw new Error('El certificado SUNAT esta vencido.');
  if (config.environment === 'beta' && !parsed.subject.includes('SOLO PRUEBA SUNAT BETA'))
    throw new Error('Beta requiere el certificado local identificado como SOLO PRUEBA SUNAT BETA.');
  return { privateKey, certificate };
}

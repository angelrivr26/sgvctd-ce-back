import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';

/** Credenciales autofirmadas locales, exclusivas del circuito ficticio beta. */
export async function ensureBetaCertificate(directory) {
  await mkdir(directory, { recursive: true });
  const keyPath = join(directory, 'solo-beta-private.pem');
  const certificatePath = join(directory, 'solo-beta-certificate.pem');
  if (existsSync(keyPath) !== existsSync(certificatePath))
    throw new Error('Certificado beta incompleto. Revisar su carpeta sin sobrescribir claves.');
  if (!existsSync(keyPath)) {
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
        keyPath,
        '-out',
        certificatePath,
        '-subj',
        '/C=PE/O=SOLO PRUEBA SUNAT BETA/CN=EMISOR FICTICIO/serialNumber=20000000001',
      ],
      { encoding: 'utf8', timeout: 30000, windowsHide: true },
    );
    if (generated.error || generated.status !== 0)
      throw new Error(
        'No se pudo generar certificado de pruebas. Instalar OpenSSL o configurar OPENSSL_BIN.',
      );
  }
  const privateKey = await readFile(keyPath, 'utf8');
  const certificate = await readFile(certificatePath, 'utf8');
  const parsed = new X509Certificate(certificate);
  if (
    !parsed.subject.includes('SOLO PRUEBA SUNAT BETA') ||
    Date.parse(parsed.validTo) <= Date.now()
  )
    throw new Error('Se requiere un certificado vigente exclusivo de prueba beta.');
  return { privateKey, certificate };
}

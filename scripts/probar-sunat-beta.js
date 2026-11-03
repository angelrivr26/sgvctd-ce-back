import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import { ensureBetaCertificate } from './lib/certificado-beta.js';
import { createSunatBetaService } from '../src/services/sunat-beta.service.js';
import { loadSunatConfig, requireBetaConfig } from '../src/config/sunat.js';
import { createBetaFixture } from '../src/services/xml-ubl-prueba.service.js';
import { signUblXml } from '../src/services/firma-xml.service.js';
import { digest } from '../src/utils/security.js';
import { saveBetaReport, persistBetaResult } from './lib/resultado-beta.js';

const args = process.argv.slice(2);
if (
  args.some(
    (arg) => !['--diagnostico', '--enviar', '--tipo=FACTURA', '--tipo=BOLETA'].includes(arg),
  ) ||
  args.filter((arg) => arg.startsWith('--tipo=')).length > 1 ||
  (args.includes('--diagnostico') && args.includes('--enviar'))
)
  throw new Error(
    'Opciones: --diagnostico, o [--tipo=FACTURA|--tipo=BOLETA] [--enviar]. No acepta compras ni destinos externos.',
  );
// Rechazar produccion antes de generar certificados, archivos o llamadas de red.
const sunatConfig = requireBetaConfig(loadSunatConfig());
const root = resolve('.local/sunat-beta');
const directory = join(root, 'ejecuciones', randomUUID());
await mkdir(directory, { recursive: true });
const report = {
  fechaLima: new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Lima',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date()),
  ambiente: sunatConfig.environment,
  endpoint: sunatConfig.endpoint,
  estado: 'INICIADO',
  sinValidezTributaria: true,
  carpeta: directory,
};
const saveReport = () => saveBetaReport(directory, report);
const beta = createSunatBetaService({
  config: sunatConfig,
  onPrepared: ({ nombreArchivo, zip }) => writeFile(join(directory, `${nombreArchivo}.zip`), zip),
});
let started = false;
try {
  if (args.includes('--diagnostico')) {
    const result = await beta.diagnose();
    await writeFile(join(directory, 'servicio.wsdl'), result.wsdl);
    Object.assign(report, { estado: result.estado, httpStatus: result.httpStatus });
  } else {
    const fixture = createBetaFixture({
      tipo: args.includes('--tipo=BOLETA') ? 'BOLETA' : 'FACTURA',
      numero: String(randomInt(1, 100_000_000)),
    });
    const credentials = await ensureBetaCertificate(join(root, 'certificados'));
    const signed = signUblXml(fixture.xml, credentials);
    await writeFile(join(directory, `${fixture.nombreArchivo}.xml`), signed.xml);
    await writeFile(
      join(directory, 'solicitud.json'),
      `${JSON.stringify({ ...fixture, xml: undefined }, null, 2)}\n`,
    );
    Object.assign(report, {
      estado: 'PREPARADO_NO_ENVIADO',
      tipo: fixture.tipo,
      referencia: fixture.referencia,
      fechaEmision: fixture.fechaEmision,
      xmlSha256: digest(Buffer.from(signed.xml)),
      digestValue: signed.digestValue,
      firma: 'RSA-SHA256 verificada localmente',
      pdfGenerado: false,
    });
    await saveReport();
    if (args.includes('--enviar')) {
      report.estado = 'ENVIO_INICIADO';
      await saveReport();
      started = true;
      const result = await beta.send({ ...fixture, xml: signed.xml });
      await persistBetaResult(directory, report, fixture, result);
      if (!result.aceptado) process.exitCode = 1;
    }
  }
} catch (error) {
  // No reintentar automaticamente: una respuesta perdida no acredita inexistencia.
  if (report.aceptadoBeta) {
    report.estadoDocumentos = 'ERROR';
    report.error = 'Aceptacion beta guardada; fallo la generacion o escritura del PDF.';
  } else {
    report.estado = started ? 'RESULTADO_INCIERTO' : 'ERROR_LOCAL';
    report.error = error.message;
    if (error.httpStatus) report.httpStatus = error.httpStatus;
    if (error.respuestaSoap)
      await writeFile(join(directory, 'respuesta-soap.xml'), error.respuestaSoap);
  }
  process.exitCode = 1;
} finally {
  await saveReport();
  console.log(JSON.stringify(report, null, 2));
}

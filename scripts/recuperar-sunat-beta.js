import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { parseBetaResponse } from '../src/services/sunat-beta.service.js';
import { persistBetaResult, saveBetaReport } from './lib/resultado-beta.js';
import { digest } from '../src/utils/security.js';

// Recupera una respuesta guardada. Este script no tiene llamadas HTTP.
const id = z.uuid().parse(process.argv[2]);
if (process.argv.length !== 3) throw new Error('Indicar solo el UUID de la ejecucion beta.');
const directory = resolve('.local/sunat-beta/ejecuciones', id);
const report = JSON.parse(await readFile(join(directory, 'resultado.json'), 'utf8'));
try {
  const fixture = JSON.parse(await readFile(join(directory, 'solicitud.json'), 'utf8'));
  if (!/^20000000001-(01-F001|03-B001)-[1-9]\d{0,7}$/.test(fixture.nombreArchivo))
    throw new Error('Solicitud beta no reconocida.');
  const xml = await readFile(join(directory, `${fixture.nombreArchivo}.xml`));
  if (
    digest(xml) !== report.xmlSha256 ||
    fixture.referencia !== report.referencia ||
    fixture.fechaEmision !== report.fechaEmision
  )
    throw new Error('La solicitud guardada no coincide con el informe de envio.');
  const text = await readFile(join(directory, 'respuesta-soap.xml'), 'utf8');
  const result = parseBetaResponse(
    text,
    report.httpStatus,
    fixture.referencia,
    fixture.nombreArchivo,
  );
  await persistBetaResult(directory, report, fixture, { ...result, respuestaSoap: text });
  report.recuperadoSinReenvio = true;
  if (!result.aceptado) process.exitCode = 1;
} catch (error) {
  report.errorRecuperacion = error.message;
  if (report.aceptadoBeta && !report.pdfGenerado) report.estadoDocumentos = 'ERROR';
  process.exitCode = 1;
} finally {
  await saveBetaReport(directory, report);
  console.log(JSON.stringify(report, null, 2));
}

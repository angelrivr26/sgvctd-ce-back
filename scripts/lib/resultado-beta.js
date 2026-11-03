import { writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createPdfService } from '../../src/services/pdf.service.js';
import { comprobanteBetaTemplate } from '../../src/templates/comprobante-beta.js';

export async function saveBetaReport(directory, report) {
  const file = join(directory, 'resultado.json');
  await writeFile(`${file}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
  await rename(`${file}.tmp`, file);
}

export async function persistBetaResult(directory, report, fixture, result) {
  if (result.aceptado && (result.codigo !== '0' || result.referencia !== fixture.referencia))
    throw new Error('La aceptacion beta no corresponde al comprobante.');
  if (result.enviadoZip)
    await writeFile(join(directory, `${fixture.nombreArchivo}.zip`), result.enviadoZip);
  await writeFile(join(directory, 'respuesta-soap.xml'), result.respuestaSoap);
  if (result.cdrZip) await writeFile(join(directory, 'cdr.zip'), result.cdrZip);
  if (result.cdrXml) await writeFile(join(directory, 'cdr.xml'), result.cdrXml);
  delete report.error;
  delete report.estadoDocumentos;
  Object.assign(report, {
    estado: result.estado,
    httpStatus: result.httpStatus,
    codigo: result.codigo,
    descripcion: result.descripcion,
    observaciones: result.observaciones ?? [],
    aceptadoBeta: result.aceptado,
  });
  // Primero confirmar la CDR localmente; PDF recuperable desde esta respuesta.
  await saveBetaReport(directory, report);
  if (result.aceptado) {
    const rendered = await createPdfService(comprobanteBetaTemplate).render({
      payload: fixture.payload,
      resultado_emision: {
        serie: fixture.serie,
        numero: fixture.numero,
        fechaEmision: fixture.fechaEmision,
      },
    });
    await writeFile(join(directory, `${fixture.nombreArchivo}.pdf`), rendered.content);
    report.pdfGenerado = true;
    report.versionPlantilla = rendered.templateVersion;
  }
  await saveBetaReport(directory, report);
}

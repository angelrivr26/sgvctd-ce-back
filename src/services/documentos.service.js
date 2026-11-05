import { digest } from '../utils/security.js';
import { validateEmissionResult } from '../validators/resultado-emision.validator.js';

/** Genera documentos despues de persistir la confirmacion de emision. */
export function createDocumentosService({ files, pdf }) {
  return {
    async generate(record) {
      // FLUJO 14/18: validar originales SUNAT, crear PDF y guardar los tres archivos.
      // CONTINUA EN FLUJO 15: comprobante.model.complete().
      const result = validateEmissionResult(record.resultado_emision, record.id);
      const originals = result.documentos;
      const rendered = await pdf.render(record);
      const contents = [
        ...originals.map((doc) => ({
          tipo: doc.tipo,
          content: Buffer.from(doc.contenido, 'utf8'),
        })),
        { tipo: 'PDF', content: rendered.content },
      ];
      const documents = [];
      for (const document of contents) {
        // Una reserva vencida no puede sobrescribir archivos de otro contenido.
        const extension = document.tipo === 'PDF' ? 'pdf' : 'xml';
        const key = `${record.id}/${digest(document.content)}.${extension}`;
        documents.push({ tipo: document.tipo, ...(await files.save(key, document.content)) });
      }
      return { documents, templateVersion: rendered.templateVersion };
    },
  };
}

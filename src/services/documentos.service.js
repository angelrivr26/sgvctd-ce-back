import { digest } from '../utils/security.js';

/** Genera documentos despues de persistir la confirmacion de emision. */
export function createDocumentosService({ files, pdf }) {
  return {
    async generate(record) {
      const result = record.resultado_emision;
      if (
        result?.estado !== 'COMPLETADO' ||
        result.estadoFiscal !== 'SIMULADO' ||
        result.simulado !== true
      )
        throw new Error('La generacion requiere una emision simulada confirmada y persistida.');
      const originals = result.documentos;
      if (
        !Array.isArray(originals) ||
        originals.length !== 2 ||
        !['XML', 'CDR'].every(
          (type) =>
            originals.filter(
              (doc) =>
                doc.tipo === type && typeof doc.contenido === 'string' && doc.contenido.length > 0,
            ).length === 1,
        )
      )
        throw new Error('El proveedor no entrego los documentos simulados esperados.');
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

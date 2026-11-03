import { comprobantePruebaTemplate } from './comprobante-prueba.js';

export function comprobanteBetaTemplate(record) {
  const template = comprobantePruebaTemplate(record);
  return {
    ...template,
    version: 'beta-v1',
    footer: 'ACEPTADO POR SUNAT BETA. SOLO PRUEBA DE ESTRUCTURA. SIN VALIDEZ TRIBUTARIA.',
  };
}

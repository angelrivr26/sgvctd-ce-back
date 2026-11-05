import { z } from 'zod';
import { compraSchema } from '../validators/compra.validator.js';

const json = (schema) => ({ 'application/json': { schema } });
const errorResponses = {
  401: { description: 'No autorizado' },
  409: { description: 'Conflicto de idempotencia o estado' },
  422: { description: 'Datos invalidos' },
  429: { description: 'Reintentar segun Retry-After' },
};
export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Comprobantes SERNANP',
    version: '0.1.0',
    description:
      'Flujo unico SUNAT para beta o produccion. Recepcion persistente y procesamiento asincrono.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      integrationKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      session: { type: 'apiKey', in: 'cookie', name: 'comprobantes_session' },
    },
    schemas: {
      Compra: z.toJSONSchema(compraSchema, { io: 'input' }),
      EstadoDocumentos: {
        type: 'string',
        enum: ['NO_HABILITADOS', 'PENDIENTES', 'GENERANDO', 'DISPONIBLES', 'ERROR'],
        description:
          'Independiente del estado fiscal. ERROR conserva la emision confirmada para recuperar documentos.',
      },
      SeguimientoComprobante: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          estado: { enum: ['PENDIENTE', 'PROCESANDO', 'PROCESADO', 'REQUIERE_ATENCION'] },
          estadoFiscal: {
            type: 'string',
            description: 'ACEPTADO solo despues de validar y persistir la CDR codigo 0.',
          },
          respuestaSunat: {
            type: ['object', 'null'],
            description:
              'Null sin respuesta acreditada. Informa ambiente, codigo, descripcion y fecha tras persistir SOAP/CDR.',
            properties: {
              ambiente: { enum: ['beta', 'production'] },
              codigo: { type: 'string' },
              descripcion: { type: 'string' },
              fechaRespuesta: { type: 'string', format: 'date-time' },
            },
            required: ['ambiente', 'codigo', 'descripcion', 'fechaRespuesta'],
          },
          estadoDocumentos: { $ref: '#/components/schemas/EstadoDocumentos' },
          versionPlantilla: { type: ['string', 'null'] },
          fechaEmision: { type: ['string', 'null'], format: 'date-time' },
        },
        required: [
          'id',
          'estado',
          'estadoFiscal',
          'estadoDocumentos',
          'versionPlantilla',
          'fechaEmision',
        ],
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Estado del servicio y de la base de datos',
        responses: { 200: { description: 'Disponible' } },
      },
    },
    '/api/v1/integraciones/boletos/compras': {
      post: {
        summary: 'Registrar compra facturable, idempotente por evento y compra',
        security: [{ integrationKey: [] }],
        requestBody: { required: true, content: json({ $ref: '#/components/schemas/Compra' }) },
        responses: {
          202: {
            description: 'Solicitud guardada; no significa comprobante emitido',
            content: json({
              type: 'object',
              properties: {
                duplicado: { type: 'boolean' },
                comprobante: { $ref: '#/components/schemas/SeguimientoComprobante' },
              },
            }),
          },
          ...errorResponses,
        },
      },
    },
    '/api/v1/integraciones/boletos/comprobantes/{id}': {
      get: {
        summary: 'Consultar resultado por identificador',
        security: [{ integrationKey: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description:
              'Detalle del procesamiento y documentos; incluye los campos de seguimiento y el detalle de compra/documentos/entregas.',
            content: json({ $ref: '#/components/schemas/SeguimientoComprobante' }),
          },
          ...errorResponses,
        },
      },
    },
    '/api/v1/integraciones/boletos/comprobantes/{id}/documentos/{tipo}': {
      get: {
        summary: 'Descargar documento con autenticacion de integracion',
        security: [{ integrationKey: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'tipo', in: 'path', required: true, schema: { enum: ['PDF', 'XML', 'CDR'] } },
        ],
        responses: {
          200: { description: 'Archivo emitido; X-Content-SHA256 permite comprobar integridad' },
          ...errorResponses,
        },
      },
    },
  },
};

# Integracion con Boletos

## Entrada a Comprobantes

Boletos envia una compra pagada a:

```http
POST /api/v1/integraciones/boletos/compras
X-API-Key: <INTEGRATION_API_KEY>
Content-Type: application/json
```

Ejemplo minimo:

```json
{
  "eventoId": "8eb68b62-ff48-4f84-a04a-bf23e904cb10",
  "origen": "BOLETOS",
  "compraId": "COMPRA-10001",
  "estadoPago": "PAGADO",
  "modalidad": "NORMAL",
  "tipoComprobante": "BOLETA",
  "fechaPago": "2026-11-05T15:00:00-05:00",
  "moneda": "PEN",
  "emisor": {
    "ruc": "20000000001",
    "razonSocial": "EMISOR DE PRUEBA",
    "direccion": "Lima"
  },
  "comprador": {
    "tipoDocumento": "DNI",
    "numeroDocumento": "00000001",
    "nombre": "COMPRADOR DE PRUEBA",
    "correo": "pruebas@example.invalid"
  },
  "detalle": [
    {
      "boletoIds": ["B-10001"],
      "nombreAnp": "ANP DE PRUEBA",
      "descripcion": "Ingreso",
      "cantidad": 1,
      "precioUnitario": "30.00",
      "descuento": "0.00",
      "impuesto": "0.00",
      "total": "30.00",
      "afectacion": "EXONERADO"
    }
  ],
  "total": "30.00"
}
```

Para factura, el comprador debe usar RUC de 11 digitos e incluir direccion. Los importes son cadenas decimales con dos posiciones. `eventoId` y `compraId` deben ser estables en reintentos.

La respuesta `202` significa que la compra fue persistida. `duplicado: true` indica un reintento idempotente con el mismo contenido. El mismo identificador con datos distintos devuelve `409`.

## Consulta

```http
GET /api/v1/integraciones/boletos/comprobantes/{id}
X-API-Key: <INTEGRATION_API_KEY>
```

No se debe considerar emitido hasta recibir `estado=PROCESADO`, `estadoFiscal=ACEPTADO`, `estadoDocumentos=DISPONIBLES` y `respuestaSunat.codigo=0`.

## Callback a Boletos

Al terminar o requerir atencion, Comprobantes envia a `BOLETOS_CALLBACK_URL`:

```json
{
  "notificacionId": "uuid",
  "eventoId": "uuid",
  "compraId": "COMPRA-10001",
  "comprobanteId": "uuid",
  "estado": "PROCESADO",
  "estadoFiscal": "ACEPTADO",
  "estadoDocumentos": "DISPONIBLES",
  "respuestaSunat": {
    "ambiente": "beta",
    "codigo": "0",
    "descripcion": "La factura ha sido aceptada",
    "fechaRespuesta": "2026-11-05T20:00:05.000Z"
  },
  "serie": "B001",
  "numero": "123",
  "actualizadoEn": "2026-11-05T20:00:06.000Z",
  "documentos": [
    {
      "tipo": "PDF",
      "sha256": "...",
      "descarga": "/api/v1/integraciones/boletos/comprobantes/uuid/documentos/PDF"
    }
  ],
  "simulado": false
}
```

Cabeceras del callback:

- `X-API-Key: BOLETOS_CALLBACK_KEY`
- `Idempotency-Key: notificacionId`

Boletos debe aceptar repeticiones de `notificacionId`, guardar `respuestaSunat` y no modificar el estado del pago por un fallo de documentos o callback. Si `respuestaSunat` es `null`, no existe evidencia persistida de respuesta SUNAT.

## Descarga

Cada ruta de `documentos[].descarga` requiere la misma clave de integracion. La respuesta incluye `X-Content-SHA256`; Boletos puede compararlo con el hash anunciado antes de conservar o mostrar el archivo.

## Variables compartidas

| Comprobantes           | Boletos                        | Regla                   |
| ---------------------- | ------------------------------ | ----------------------- |
| `INTEGRATION_API_KEY`  | clave de salida a Comprobantes | Deben coincidir         |
| `BOLETOS_CALLBACK_URL` | endpoint receptor              | HTTPS fuera de loopback |
| `BOLETOS_CALLBACK_KEY` | clave del receptor             | Deben coincidir         |

No compartir credenciales SUNAT con Boletos. Solo este backend firma y comunica el comprobante.

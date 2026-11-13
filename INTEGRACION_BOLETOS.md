# Integracion entre Boletos y Comprobantes

## Responsabilidad de cada backend

Boletos conserva la compra y el pago. Comprobantes recibe el contrato HTTP, guarda el trabajo,
procesa la integracion fiscal de desarrollo, genera documentos y devuelve el resultado. Ningun
proyecto debe consultar directamente las tablas internas del otro.

La integracion usa rutas versionadas bajo `/api/v1` y una clave compartida en la cabecera
`X-API-Key`. El contrato tecnico completo tambien puede consultarse con el backend iniciado en
`GET /api/openapi.json`.

## Registrar una compra pagada

```http
POST /api/v1/integraciones/boletos/compras
X-API-Key: <INTEGRATION_API_KEY>
Content-Type: application/json
```

Ejemplo minimo de desarrollo:

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

El emisor, los importes, impuestos y afectaciones proceden del contrato de entrada. Comprobantes no
debe inventar tasas fiscales. Para factura, el comprador usa RUC de 11 digitos e incluye direccion.
Los importes son cadenas decimales con dos posiciones.

`eventoId` y `compraId` deben mantenerse estables en cada reintento. La respuesta `202` significa
que la solicitud fue persistida. `duplicado: true` identifica el mismo contenido recibido otra vez;
reutilizar un identificador con datos diferentes devuelve `409`.

## Consultar el resultado

```http
GET /api/v1/integraciones/boletos/comprobantes/{id}
X-API-Key: <INTEGRATION_API_KEY>
```

Boletos solo debe considerar terminado el flujo satisfactorio cuando se cumplan simultaneamente:

- `estado=PROCESADO`.
- `estadoFiscal=ACEPTADO`.
- `estadoDocumentos=DISPONIBLES`.
- `respuestaSunat.codigo=0`.

`respuestaSunat: null` significa que no existe una respuesta SUNAT persistida y validada. Un `202`,
una serie asignada o el campo de compatibilidad `simulado` no sustituyen esa evidencia.

## Callback a Boletos

Cuando el trabajo termina o requiere atencion, Comprobantes envia un `POST` a
`BOLETOS_CALLBACK_URL` con estas cabeceras:

- `X-API-Key: <BOLETOS_CALLBACK_KEY>`.
- `Idempotency-Key: <notificacionId>`.
- `Content-Type: application/json`.

Ejemplo abreviado:

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
    "descripcion": "Respuesta del ambiente beta",
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

Boletos debe aceptar repeticiones del mismo `notificacionId`. Un fallo del callback o de documentos
no debe modificar el estado del pago. Si no se configura `BOLETOS_CALLBACK_URL`, Comprobantes guarda
el payload localmente en `CALLBACK_DIRECTORY`; eso sirve para desarrollo y no equivale a una
notificacion recibida por Boletos.

El campo `simulado: false` es compatibilidad temporal del contrato actual. No acredita que el
documento sea fiscalmente valido ni que se haya habilitado produccion.

## Descargar documentos

```http
GET /api/v1/integraciones/boletos/comprobantes/{id}/documentos/{tipo}
X-API-Key: <INTEGRATION_API_KEY>
```

`tipo` puede ser `PDF`, `XML` o `CDR`. La respuesta incluye `X-Content-SHA256`; Boletos puede
compararlo con el hash anunciado en el callback antes de conservar o mostrar el archivo.

## Variables compartidas

| Comprobantes           | Boletos                          | Regla                                           |
| ---------------------- | -------------------------------- | ----------------------------------------------- |
| `INTEGRATION_API_KEY`  | Clave para llamar a Comprobantes | Deben coincidir y tener al menos 32 caracteres. |
| `BOLETOS_CALLBACK_URL` | Endpoint receptor                | Debe usar HTTPS, salvo loopback local.          |
| `BOLETOS_CALLBACK_KEY` | Clave que valida el callback     | Deben coincidir y tener al menos 32 caracteres. |

No se comparten credenciales, certificados ni claves privadas de SUNAT con Boletos. Tampoco deben
versionarse datos personales, comprobantes o documentos reales.

## Comportamiento ante fallos

- Boletos puede repetir el `POST /compras` con los mismos identificadores y contenido.
- Comprobantes usa reservas con vencimiento para recuperar workers interrumpidos.
- Una respuesta SOAP/CDR persistida se reutiliza; no se repite el envio fiscal para regenerar PDF.
- Un envio iniciado sin respuesta persistida queda para conciliacion y no se reenvia a ciegas.
- Correo y callback poseen trabajos y reintentos separados del estado fiscal.

# Contrato de integracion con Boletos

## Estado

La API de Comprobantes esta implementada. La outbox emisora y la recepcion de resultados en los backend existentes de Boletos **todavia no se han incorporado**. No acceder directamente a su BD desde Comprobantes.

## Recepcion

`POST /api/v1/integraciones/boletos/compras`, JSON y cabecera `X-API-Key` exclusiva del backend emisor. El esquema exacto esta en `openapi.json` y se genera desde el validador ejecutable.

Ejemplo de datos exclusivamente ficticios:

```json
{
  "eventoId": "4cb6dd34-af42-4bc5-82c5-eab949e935f9",
  "origen": "BOLETOS",
  "compraId": "PRUEBA-1001",
  "estadoPago": "PAGADO",
  "modalidad": "EXPRESS",
  "tipoComprobante": "FACTURA",
  "fechaPago": "2026-10-30T12:00:00-05:00",
  "moneda": "PEN",
  "emisor": {
    "ruc": "20000000001",
    "razonSocial": "EMISOR FICTICIO PARA PRUEBAS",
    "direccion": "Direccion de pruebas"
  },
  "comprador": {
    "tipoDocumento": "RUC",
    "numeroDocumento": "20000000002",
    "nombre": "EMPRESA FICTICIA",
    "direccion": "Direccion ficticia",
    "correo": "pruebas@example.invalid"
  },
  "detalle": [
    {
      "boletoIds": ["B-1", "B-2"],
      "descripcion": "Ingresos de prueba",
      "cantidad": 2,
      "precioUnitario": "30.00",
      "descuento": "0.00",
      "impuesto": "0.00",
      "total": "60.00",
      "afectacion": "POR_DEFINIR"
    }
  ],
  "total": "60.00",
  "escenarioPrueba": "EXITO"
}
```

La agrupacion de lineas es opcional: cantidad corresponde al numero de boletos referidos en esa linea. Una linea por boleto tambien es valida. Un boleto no puede aparecer en dos lineas. Los importes de descuento e impuesto son totales de linea, no tasas.

`202` significa solicitud persistida, no comprobante emitido. La respuesta contiene `comprobante.id`, `estado` y `duplicado`. Conservar el mismo eventoId y payload en reintentos. Una compra repetida con datos diferentes devuelve `409`; errores de estructura o importes devuelven `422`. Ante `429`, respetar Retry-After; ante fallos de red/503, reintentar con espera creciente.

Consultar resultado: `GET /api/v1/integraciones/boletos/comprobantes/{id}`. Descargar: `GET /api/v1/integraciones/boletos/comprobantes/{id}/documentos/{PDF|XML|CDR}`. Ambos requieren la misma autenticacion de integracion.

La descarga contiene `X-Content-SHA256`. Los enlaces son rutas del servicio Comprobantes: el backend consumidor debe resolverlas contra su base URL configurada y autenticarse. No entregar claves a un navegador ni construir URLs publicas a partir de rutas fisicas.

## Resultado hacia Boletos

Configurar URL y clave de callback en el backend de Comprobantes, no en el payload recibido. Se envia POST JSON, `X-API-Key` e `Idempotency-Key` igual a `notificacionId`.

Campos: notificacionId, eventoId, compraId, comprobanteId, estado, estadoFiscal, estadoDocumentos, serie, numero, actualizadoEn, documentos y simulado. Las rutas de documentos estan protegidas.

La consulta agrega estadoDocumentos, versionPlantilla y fechaEmision. Una emision simulada puede estar confirmada con documentos en ERROR; en ese caso no hay PDF ni correo disponible y se recuperan los mismos documentos. NO_HABILITADOS significa que falta confirmacion o hubo rechazo; DISPONIBLES indica que el conjunto fue persistido. No inferir aceptacion SUNAT de SIMULADO.

El consumidor debe guardar el resultado antes de confirmar HTTP 2xx, deduplicar por notificacionId y evitar que un resultado viejo sobrescriba uno posterior. La notificacion de reintento conserva su identificador. Como respaldo, consultar el estado desde Boletos.

## Outbox a incorporar en Boletos

1. En la misma transaccion que confirma el pago, insertar evento unico con copia del payload.
2. Registrar tanto compra normal como express y todos los medios efectivos de confirmacion del backend.
3. Un job reclama pendientes, confirma su reserva y libera la conexion antes de llamar a Comprobantes.
4. Guardar confirmacion de recepcion y comprobanteId al recibir 202. No marcar la factura como emitida.
5. Reintentar sin regenerar eventoId. Si el 202 se perdio, repetir devuelve el mismo comprobante.
6. Job de conciliacion para compras facturables sin evento y resultados pendientes.

No activar retroactividad sobre compras historicas sin una fecha de corte y una regla de migracion acordadas. La gratuidad, cancelacion, devolucion o reprogramacion no debe inferirse como una nueva factura automaticamente.

## Prueba sin modificar Boletos

Con el backend iniciado, ejecutar desde su carpeta:

```text
node scripts/enviar-compra-prueba.js
```

El script lee la clave del ambiente local y envia una factura express ficticia con tres boletos. Solo imprime identificadores y estado.

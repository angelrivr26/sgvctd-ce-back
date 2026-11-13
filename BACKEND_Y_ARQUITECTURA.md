# Backend y arquitectura actual

## Alcance

Este proyecto recibe compras pagadas desde Boletos y las procesa de forma asincrona. La entrega
actual esta orientada a desarrollo e integracion con SUNAT beta: prepara UBL 2.1, firma XML, usa
`sendBill`, interpreta la respuesta SOAP/CDR, genera los documentos y notifica el resultado.

La configuracion contiene una variante `production`, pero no acredita certificacion, autorizacion
institucional ni emision tributaria valida. Los comprobantes generados durante este desarrollo no
deben presentarse como documentos fiscales de produccion.

## Flujo de seis fases

El punto central de composicion es `src/composition.js`. Las rutas, controladores y modelos son
capas internas del mismo flujo, no procesos de negocio adicionales.

| Fase | Entrada o componente                            | Responsabilidad                                                                      |
| ---: | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
|    1 | `POST /api/v1/integraciones/boletos/compras`    | Valida el contrato, guarda la compra con idempotencia y responde `202`.              |
|    2 | `procesamiento.worker.js` y `sunat.service.js`  | Reserva el trabajo, crea y firma el UBL, registra la solicitud y ejecuta `sendBill`. |
|    3 | `sunat.service.js` y `procesamiento.service.js` | Persiste SOAP/CDR y determina aceptacion, rechazo o resultado incierto.              |
|    4 | `documentos.service.js`                         | Genera PDF y conserva PDF, XML y CDR con hash SHA-256.                               |
|    5 | `correo.service.js`                             | Captura un correo de prueba como JSON local; no usa SMTP.                            |
|    6 | `integracion-boletos.service.js`                | Envia un callback idempotente a Boletos o lo captura localmente.                     |

El `202` solo confirma que la solicitud fue validada y almacenada. No significa que SUNAT la haya
aceptado. La red y la generacion de archivos se ejecutan fuera de las transacciones de base de
datos.

## Modulos y responsabilidades

| Modulo                                        | Responsabilidad                                               |
| --------------------------------------------- | ------------------------------------------------------------- |
| `src/routes` y `src/controllers`              | HTTP, autenticacion y codigos de respuesta.                   |
| `src/validators`                              | Contrato de compra y validacion del resultado de emision.     |
| `src/models`                                  | SQL, estados, idempotencia, reservas, reintentos y auditoria. |
| `src/services/sunat.service.js`               | Diario de envios, transporte SOAP y lectura de CDR.           |
| `src/services/sunat-documento.service.js`     | UBL 2.1, certificado y firma XML.                             |
| `src/services/procesamiento.service.js`       | Coordinacion de emision y documentos.                         |
| `src/services/documentos.service.js`          | PDF/XML/CDR, almacenamiento e integridad.                     |
| `src/services/correo.service.js`              | Captura local del correo de prueba.                           |
| `src/services/integracion-boletos.service.js` | Callback HTTP o captura local para Boletos.                   |
| `src/services/entrega.service.js`             | Reintentos independientes de correo y callback.               |
| `src/workers`                                 | Reservas con vencimiento y procesamiento asincrono.           |
| `src/composition.js`                          | Conexion unica de las dependencias de la aplicacion.          |

Se mantienen separados recepcion, emision, documentos, correo y notificacion a Boletos. Esta
separacion permite reintentar una entrega o recuperar documentos sin reenviar el comprobante a
SUNAT.

## Consultas para el frontend

El panel de comprobantes conserva las operaciones necesarias para su tabla y detalle:

- `GET /api/v1/comprobantes`: listado paginado, filtros y resumen.
- `GET /api/v1/comprobantes/{id}`: compra, estado, documentos, entregas e historial.
- `GET /api/v1/comprobantes/{id}/documentos/{tipo}`: descarga PDF, XML o CDR.
- `POST /api/v1/comprobantes/{id}/reintentar`: reintento administrativo del proceso.
- `POST /api/v1/comprobantes/{id}/reenviar-correo`: nueva entrega de correo.
- `POST /api/v1/comprobantes/{id}/reintentar-entregas`: reintento de entregas pendientes.

Estas rutas requieren una sesion humana. La integracion entre backends utiliza `X-API-Key` y las
rutas separadas bajo `/api/v1/integraciones/boletos`.

## Estados y recuperacion

- `PENDIENTE`: espera un worker o un reintento.
- `PROCESANDO`: existe una reserva temporal de un worker.
- `PROCESADO`: existe respuesta aceptada y finalizaron los documentos.
- `REQUIERE_ATENCION`: hubo rechazo, resultado incierto o se agotaron los reintentos.
- `estadoDocumentos`: evoluciona de forma independiente entre `NO_HABILITADOS`, `PENDIENTES`,
  `GENERANDO`, `DISPONIBLES` y `ERROR`.

Antes de enviar se consulta `sunat_envios`. Si un POST comenzo y no quedo una respuesta persistida,
el sistema no reenvia a ciegas. Si la CDR ya existe pero falla el PDF, el siguiente intento recupera
los documentos sin repetir la llamada a SUNAT.

## Base de datos y almacenamiento

El DBA administra PostgreSQL mediante `sql/001_esquema.sql`. La aplicacion no crea tablas al
iniciar; `verifyDatabaseSchema()` solo verifica que el esquema este completo.

| Objeto          | Uso                                                   |
| --------------- | ----------------------------------------------------- |
| `comprobantes`  | Compra, estado fiscal, resultado, intentos y reserva. |
| `sunat_envios`  | Solicitud, ZIP, SOAP, CDR y ambiente del envio.       |
| `sunat_control` | Serializacion de envios SUNAT.                        |
| `documentos`    | Metadatos y hashes de PDF/XML/CDR.                    |
| `entregas`      | Correo y callback con reservas y reintentos.          |
| `auditoria`     | Acciones relevantes del proceso.                      |
| `sesiones`      | Acceso del panel humano.                              |

`DB_DRIVER=pglite` se reserva para desarrollo y pruebas internas. El despliegue compartido debe usar
PostgreSQL con un esquema propio de Comprobantes. Los documentos, correos capturados y callbacks
capturados se guardan en `.local` de manera predeterminada y no se versionan.

## Seguridad y operacion

- El proyecto exige Node.js `>=20.12 <21`.
- `X-API-Key` protege la integracion con Boletos.
- La interfaz humana usa cookie `HttpOnly`, sesion persistida y validacion de origen.
- XML, ZIP y respuestas tienen limites de tamano y validacion de contenido.
- Certificados, claves, datos locales y documentos no se versionan.
- Las descargas verifican SHA-256 antes de responder.
- `WORKER_LEASE_SECONDS` debe superar el timeout SUNAT en mas de cinco segundos.
- La especificacion vigente se expone en `GET /api/openapi.json`.

## Limitaciones actuales

- El correo se captura como JSON en `MAIL_DIRECTORY`; todavia no existe SMTP.
- Sin `BOLETOS_CALLBACK_URL`, el callback se captura en `CALLBACK_DIRECTORY`.
- El almacenamiento es local y debe sustituirse si se usan varias instancias.
- La conexion comprobada corresponde al ambiente beta; no se ha validado una emision productiva.
- RUC, credenciales, certificado, series, codigo de local y reglas tributarias de produccion deben
  ser entregados y aprobados por los responsables institucionales.
- El campo `simulado: false` se conserva por compatibilidad con Boletos; no demuestra validez fiscal
  ni habilita produccion.

## Verificacion antes de transferir

1. Instalar con Node.js 20 y conservar `package-lock.json`.
2. Solicitar al DBA la ejecucion de `sql/001_esquema.sql`.
3. Configurar secretos fuera del repositorio a partir de `.env.example`.
4. Ejecutar `npm test` cuando se disponga de la suite interna; ejecutar siempre `npm run check` y
   `npm run format:check`.
5. Usar `npm run sunat:diagnostico` solo para comprobar el WSDL; este comando no emite.
6. Realizar pruebas controladas en beta sin usar datos o credenciales reales en archivos versionados.

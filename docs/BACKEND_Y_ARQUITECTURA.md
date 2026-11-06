# Proceso backend y arquitectura

## Objetivo

El backend tiene un unico camino de emision SUNAT. Beta y produccion comparten validacion, UBL, firma, SOAP, lectura de CDR, persistencia y documentos. `SUNAT_ENV` solo cambia la configuracion del ambiente.

## Orden exacto del proceso

Los mismos numeros aparecen como comentarios `FLUJO NN/18` en los metodos. Cada uno indica `LLAMADO POR`, `HACE` y `CONTINUA EN`. El mapa completo esta al inicio de `src/services/application.service.js`.

| Paso | Metodo                                                             | Responsabilidad y continuacion                             |
| ---: | ------------------------------------------------------------------ | ---------------------------------------------------------- |
|   01 | `comprobante.routes -> POST /compras`                              | Recibe la compra y llama al controlador.                   |
|   02 | `comprobante.controller.receive()`                                 | Adapta HTTP y llama al servicio.                           |
|   03 | `comprobante.service.receive()`                                    | Valida `compraSchema` y llama al modelo.                   |
|   04 | `comprobante.model.receive()`                                      | Guarda con idempotencia y permite responder HTTP `202`.    |
|   05 | `procesamiento.worker.emit()` / `model.claim()`                    | Reserva compras pendientes.                                |
|   06 | `procesamiento.service.process()`                                  | Orquesta una compra reservada.                             |
|   07 | `sunatProvider.consultarResultado()`                               | Revisa el diario antes de cualquier envio.                 |
|   08 | `createSunatRequest()` -> `signUblXml()` -> `sunatModel.prepare()` | Crea, firma y persiste la solicitud.                       |
|   09 | `sunatTransport.send()` / `sunatModel.beginSend()`                 | Marca el inicio y ejecuta un solo `sendBill`.              |
|   10 | `sunatModel.saveResponse()` -> `parseSunatResponse()`              | Guarda SOAP y valida CDR.                                  |
|   11 | `confirmEmission()` en `procesamiento.service.js`                  | Decide entre aceptacion, rechazo o espera.                 |
|   12 | `model.saveEmission()` / `model.saveRejection()`                   | Persiste el resultado fiscal. El rechazo salta al paso 16. |
|   13 | `model.startDocuments()`                                           | Reserva exclusivamente la generacion documental.           |
|   14 | `documentos.generate()`                                            | Guarda XML/CDR y genera PDF.                               |
|   15 | `model.complete()`                                                 | Registra documentos y crea entregas.                       |
|   16 | `procesamiento.worker.deliver()` / `entregaModel.claim()`          | Reserva callbacks y correos.                               |
|   17 | `entrega.service.process()`                                        | Selecciona el destino del trabajo.                         |
|   18 | `integracion.notify()` / `correo.send()`                           | Notifica a Boletos o captura correo y cierra la entrega.   |

El callback usa `Idempotency-Key`; si no hay URL configurada se captura en `CALLBACK_DIRECTORY`. El correo actual se captura en `MAIL_DIRECTORY`; no existe envio SMTP en esta entrega.

## Mapa de responsabilidades

| Capa                              | Responsabilidad                                  |
| --------------------------------- | ------------------------------------------------ |
| `routes` / `controllers`          | HTTP, autenticacion y codigos de respuesta       |
| `validators`                      | Contratos de compra y resultado SUNAT            |
| `models`                          | SQL, estados, reservas, idempotencia y auditoria |
| `services/sunat.service.js`       | Proveedor SUNAT y transporte SOAP comun          |
| `services/xml-ubl.service.js`     | UBL 2.1 y reglas tributarias de entrada          |
| `services/firma-xml.service.js`   | Firma XML local                                  |
| `services/documentos.service.js`  | Orquestacion de PDF/XML/CDR                      |
| `workers`                         | Reserva y ejecucion asincrona                    |
| `services/application.service.js` | Unico punto donde se conectan dependencias       |

## Configuracion por ambiente

| Valor                  | Destino                    | Requisitos                                                      |
| ---------------------- | -------------------------- | --------------------------------------------------------------- |
| `SUNAT_ENV=beta`       | Servicio e-beta oficial    | MODDATOS, emisor ficticio `20000000001`, certificado local      |
| `SUNAT_ENV=production` | Servicio e-factura oficial | Credenciales, certificado/clave, series y local institucionales |

Los endpoints se encuentran una sola vez en `src/config/sunat.js`. El formato de respuesta es el mismo y se interpreta en `parseSunatResponse()`.

## Estados y recuperacion

- `PENDIENTE`: esperando worker o reintento.
- `PROCESANDO`: reservado temporalmente por un worker.
- `PROCESADO`: CDR aceptada y documentos disponibles.
- `REQUIERE_ATENCION`: rechazo, resultado incierto o reintentos agotados.
- `estado_documentos` es independiente: `NO_HABILITADOS`, `PENDIENTES`, `GENERANDO`, `DISPONIBLES` o `ERROR`.

La red nunca se ejecuta dentro de una transaccion de base de datos. Antes de reenviar se consulta `sunat_envios`. Si el POST comenzó y no existe respuesta persistida, el sistema marca resultado incierto y no reenvia a ciegas. Si la CDR ya esta guardada pero falla el PDF, el siguiente intento regenera documentos sin volver a SUNAT.

## Base de datos

El DBA administra la estructura mediante un unico script idempotente: `sql/001_esquema.sql`. La aplicacion no ejecuta DDL ni migraciones al iniciar; `verifyDatabaseSchema()` solo comprueba que existan las tablas y la secuencia requeridas.

| Objeto          | Uso                                        |
| --------------- | ------------------------------------------ |
| `comprobantes`  | Compra, estado fiscal, resultado y reserva |
| `sunat_envios`  | Solicitud, ZIP, SOAP, CDR y ambiente       |
| `sunat_control` | Serializacion de envios SUNAT              |
| `documentos`    | Metadatos y hash de PDF/XML/CDR            |
| `entregas`      | Callback y correo con reintentos           |
| `auditoria`     | Acciones relevantes                        |
| `sesiones`      | Acceso humano                              |

El script reconoce y copia el diario historico `proveedor_sunat_beta` si existe, sin eliminar la tabla original. Las instalaciones nuevas no crean tablas del simulador. Si falta algun objeto, API y worker se detienen con un mensaje para el DBA; nunca intentan crearlo.

## Seguridad y operacion

- `X-API-Key` protege la integracion de Boletos.
- La interfaz humana usa cookie `HttpOnly` y validacion de origen.
- XML, ZIP y respuestas tienen limites de tamaño; las rutas dentro de ZIP se validan.
- Certificados y claves no se versionan.
- Los documentos se validan con SHA-256 al descargarse.
- `WORKER_LEASE_SECONDS` debe superar el timeout SUNAT en mas de cinco segundos.

## Lista previa a produccion

1. Confirmar RUC, usuario SOL, certificado, series, codigo de local y reglas tributarias con el responsable contable.
2. Solicitar al DBA ejecutar y validar `sql/001_esquema.sql` sobre una copia antes de produccion.
3. Configurar PostgreSQL con esquema exclusivo `comprobantes` y permisos de ejecucion sin privilegios DDL para la aplicacion.
4. Sustituir captura de correo por SMTP y disco local por almacenamiento compartido si habrá varias instancias.
5. Configurar callback HTTPS y claves distintas por ambiente.
6. Ejecutar `npm run check`, `npm run format:check` y una prueba controlada en beta.
7. No declarar produccion validada hasta completar certificacion y observabilidad operativa.

El campo `simulado: false` permanece temporalmente en respuestas y callbacks porque `backend-externo` lo valida. No selecciona proveedor ni activa codigo ficticio.

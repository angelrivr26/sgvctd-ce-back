# Bitacora de cambios — Comprobantes electronicos

## 2026-11-05 - Comentarios de recorrido para lectura de LT

- Cada metodo del flujo 01 a 18 indica quien lo llama, que hace y en que archivo continua. El mapa vive en `application.service.js`.
- Cambio solo de comentarios. No se modifica validacion, UBL, firma, SOAP, lectura de CDR, persistencia ni callback.

## 2026-11-05 - Esquema administrado exclusivamente por DBA

- Se eliminan el ejecutor automatico `database/migrate.js`, los comandos `db:migrate` y `db:configurar-boletos`, y sus scripts. API y worker ya no crean esquemas, tablas ni historial de migraciones.
- `sql/001_esquema.sql` queda como unico script administrativo, idempotente y ejecutable directamente por el DBA sobre el esquema `comprobantes`.
- El arranque usa `verifyDatabaseSchema()` en modo lectura. Si faltan tablas o `sunat_numero_seq`, se detiene con un mensaje explicito sin intentar modificar la base.
- Validacion: 47/47 pruebas internas aprobadas, incluida ausencia/presencia del esquema DBA; sintaxis de 44 archivos y formato aprobados. No se modifico una base real.

## 2026-11-05 - Pruebas internas fuera de la entrega

- La carpeta `tests` se retira del repositorio. Las pruebas se conservan solamente en `.local/tests`, ruta excluida por `.gitignore`, y se ejecutan internamente con `.local/probar-backend.cmd`. Los patrones `tests/`, `*.test.js` y `*.spec.js` evitan agregar pruebas nuevas por accidente.
- Se elimina `npm test` del paquete entregable y los comandos de sintaxis/formato dejan de buscar pruebas locales. El codigo de produccion, migraciones y documentacion no dependen de esos archivos.

## 2026-11-05 - Flujo unico SUNAT y limpieza para transferencia

- Se elimina la seleccion entre proveedor simulado y beta. La aplicacion compone un solo proveedor SUNAT; `SUNAT_ENV=beta|production` selecciona el endpoint y los datos del ambiente con el mismo flujo UBL, firma, SOAP y CDR.
- Se retiran del runtime el simulador, endpoints de demostracion, generadores duplicados, scripts `probar-*`/`recuperar-*` y el campo artificial `escenarioPrueba` del contrato de compra. Solo queda `npm run sunat:diagnostico`, que consulta el WSDL sin emitir.
- El esquema se consolida en `sql/001_esquema.sql`. Es idempotente, conserva datos y copia el diario beta historico si existe sin eliminarlo.
- La documentacion vigente se concentra en `README.md`, `docs/BACKEND_Y_ARQUITECTURA.md` y `docs/INTEGRACION_BOLETOS.md`; OpenAPI permanece como contrato generado.
- Se conserva temporalmente `simulado: false` en GET/callback por compatibilidad con la validacion actual de `backend-externo`; no selecciona proveedor ni habilita codigo ficticio.
- Produccion requiere credenciales, certificado, series, local y validacion tributaria institucionales. Correo y almacenamiento siguen siendo locales; esta entrega no afirma certificacion ni envio productivo.
- Validacion final: 46/46 pruebas aprobadas, script SQL unico e idempotente verificado, sintaxis y formato aprobados. No se realizaron llamadas externas, envios SUNAT ni cambios sobre una base real.

## 2026-11-05 - Analisis profesional del flujo interno del backend

- Se incorpora `docs/ANALISIS_FLUJO_BACKEND_COMPROBANTES_2026-11-05.md` con el orden exacto desde el arranque, recepcion HTTP, reserva, proveedor SUNAT beta, persistencia fiscal, documentos y entregas a Boletos.
- El analisis clasifica piezas de runtime, desarrollo, simulacion y herramientas beta; identifica simplificaciones seguras y controles que deben conservarse. No modifica la conexion SUNAT beta, contratos, esquema, configuracion privada ni codigo funcional.
- Se documenta que la implementacion actual es beta y bloquea produccion, ademas de pendientes de correo real, almacenamiento compartido, migraciones controladas, reglas contables y operacion productiva.
- Primera limpieza sin cambio fiscal: `npm test` portable, mapa corto del orden real en el punto de composicion, import directo del certificado beta y retiro de su reexportador, CORS limitado a metodos existentes, mensaje documental neutral y guias de arquitectura/operacion alineadas con el proveedor beta actual.
- Validacion final: `npm test` portable aprueba 65/65 pruebas con Node.js 24.22.2; `npm run check` y `npm run format:check` aprobados. No se realizaron llamadas externas a SUNAT ni cambios de BD real.

## 2026-11-05 - Comentarios de continuidad del flujo Boletos

- La ruta de integracion, el procesamiento y la notificacion a Boletos indican los pasos 6 y 7 del recorrido y el siguiente archivo que recibe el control.
- Cambio exclusivamente documental en este proyecto; no modifica validacion, procesamiento, proveedor, documentos ni callback.
- No se ejecutan pruebas por solicitud del usuario.

## 2026-11-05 - Campo opcional nombreAnp en el detalle

- El contrato de compra acepta `detalle[].nombreAnp` con un maximo de 200 caracteres. Boletos lo obtiene de `t_anp.var_nombre` y las descripciones nuevas lo incluyen para XML/PDF.
- El campo se mantiene opcional en el receptor para aceptar snapshots creados antes del cambio; si una solicitud nueva lo envia, no puede estar vacio. No se recalculan ni migran payloads historicos.
- Se actualiza el generador de compras ficticias y las pruebas de contrato. No cambia emision, numeracion, importes, impuestos, proveedor fiscal ni esquema de BD de Comprobantes.

## 2026-11-04 - Fecha de emision del simulador independiente del reloj PostgreSQL

- Las nuevas operaciones simuladas persisten el reloj de Node.js en proveedor_simulado.fecha_emision al solicitar emision. Resultado, XML y PDF consumen esa fecha unica; no se recalcula en reintentos, consultas o reconciliacion. No se usa fechaPago como sustituto de emision.
- Migracion aditiva 005: columna nullable sin DEFAULT now(), sin backfill de registros historicos. Se conserva el resultado confirmado o comportamiento anterior para operaciones legadas; no se inventa una fecha retrospectiva ni se alteran originales ya generados.
- Sin cambios al reloj del servidor, fechas administrativas/reservas, proveedor beta, flujos de Boletos, frontend o dependencias. Los campos de auditoria de BD continuaran reflejando su reloj actual. Guia y limites en docs/FECHAS_DE_EMISION.md.
- Validacion: 65 pruebas backend aprobadas, incluidas cinco de fechas con creado_en en 2052 en BD temporal. Verifican resultado/XML/PDF, fecha de pago independiente, reloj Node predeterminado, idempotencia simultanea y recuperacion de respuesta perdida. Sintaxis de 67 archivos y formato de archivos modificados aprobados; SQL portable regenerado.
- Migracion 005 aplicada y verificada en sgvcb/comprobantes: fecha_emision nullable, sin default. Lectura posterior confirma que los tres comprobantes historicos revisados conservan su fecha y proveedor; no se modificaron sus documentos ni se insertaron compras ficticias. Backend local disponible HTTP 200 con SUNAT_BETA. No se realizaron envios externos a SUNAT ni SMTP durante esta adecuacion.

## 2026-11-04 - Proveedor SUNAT beta conectado al worker de compras

- Se habilita FISCAL_PROVIDER=sunat-beta para compras nuevas, conservando proveedor por compra y el simulador. No se modifica codigo de Boletos ni su pago, job o frontend. El contrato existente recibe la respuestaSunat real por GET/callback.
- UBL 2.1 de la compra con importes en centimos, firma y ZIP; emisor ficticio 20000000001, series beta F001/B001 y local ficticio 0000. POR_DEFINIR necesita perfil beta explicito de impuesto cero; no se decide el regimen tributario real ni se cambia el payload original. No hay adaptador productivo.
- Migraciones aditivas 003 y 004 en el esquema propio: proveedor_fiscal, diario de solicitud firmada/ZIP/SOAP y control de envio beta entre procesos. La 004 completa seleccion y diagnostico porque el servidor de desarrollo ya habia aplicado la 003 inicial. Una llamada a la vez, separacion temporal y espera sin consumir intentos; sin transaccion durante HTTP. Un envio iniciado sin respuesta no se repite, tampoco al reintentar manualmente.
- Aceptacion y respuesta persistidas antes del PDF beta-v2. Rechazos y SOAP Fault conservan codigo/descripcion, vuelven a Boletos y no generan PDF/correo. Fallas documentales recuperan la misma emision sin contactar SUNAT. SMTP sigue capturado localmente.
- En frontend Comprobantes solo se adecuan etiquetas de pruebas y estados beta, descripciones de originales y disponibilidad del reintento para rechazos persistidos; sin cambios a pantallas ni flujos de Boletos.
- Validacion externa aislada por API y worker: boleta B001-67314313 y factura F001-42209689 aceptadas con CDR 0 y PDF. Cuatro POST ficticios secuenciales: dos aceptaciones y dos SOAP Fault usados para corregir EXO (catalogo 05) y local 0000. Evidencia resumida en docs/beta-web-resultados.json; archivos completos privados en .local. Una ejecucion sandbox sin respuesta por red EACCES quedo incierta y no se reenvio esa operacion.
- Validacion final: 60 pruebas de backend y 16 de integracion de Boletos aprobadas, build Angular de produccion aprobado y cinco casos de navegador sobre BD aislada/simulador. El primer pase de navegador aprobo cuatro; el quinto tenia Origin fijo 4205 y la prueba aislada usaba 4206: se repitio con una copia temporal ajustada al puerto de pruebas y paso, sin modificar la seguridad o los tests originales. El callback de la factura realmente aceptada fue validado offline por el normalizador existente de Boletos.
- Migraciones 001-004 aplicadas en sgvcb/comprobantes; configuracion privada activada en sunat-beta, SUNAT_ENV=beta y perfil ficticio EXONERADO para POR_DEFINIR, conservando claves/callback y respaldo privado. El backend local responde HTTP 200 con proveedor SUNAT_BETA. Las compras historicas siguen simuladas; la siguiente compra de desarrollo usa beta. No se insertaron compras ficticias en sgvcb.
- No hay cambios de dependencias ni lockfiles. La conciliacion remota, QR/cadena CDR y reglas productivas siguen pendientes; beta no permite carga masiva. El reloj compartido de PostgreSQL conserva el desfase ya documentado.

## 2026-11-03 - Prueba de compra PagoEfectivo integrada

- Se detecto la configuracion deshabilitada en Boletos y se preparo la comunicacion local y claves sin mostrarlas ni versionarlas. El usuario autoriza usar emisor ficticio en desarrollo; continua FISCAL_PROVIDER=simulado y no se contacta SUNAT o SMTP.
- El contrato permite direccion de comprador omitida/vacia en BOLETA, conforme al mensaje que ya produce Boletos. FACTURA conserva direccion obligatoria. La plantilla omite la linea ausente y el tipo Angular se alinea con el contrato; no se inventa domicilio. Regenerado OpenAPI. Las reglas fiscales del futuro adaptador SUNAT quedan pendientes de Contabilidad.
- En Boletos se corrige generacion de UUID para PostgreSQL 12.15, sin gen_random_uuid() ni nuevas extensiones, y se hacen visibles los estados de arranque y codigos de fallo del job.
- La compra ya pagada del usuario se proceso por los backends en ejecucion: resultado SIMULADO persistido en Boletos, documentos DISPONIBLES, PDF descargado y verificado por SHA-256, callback ENVIADO y correo CAPTURADO_PRUEBA. Un intento; no se repitio el pago. Los datos e identificadores reales no se guardan en esta bitacora.
- Verificacion de fechas: el reloj PostgreSQL marca marzo de 2052 y la aplicacion noviembre de 2026. No se ajusto el reloj compartido; documentado para infraestructura, ya que las fechas/filtros de BD pueden resultar incorrectos.
- Validacion: 45 pruebas backend aprobadas, incluida boleta sin direccion con PDF y rechazo de factura sin direccion. Build Angular aprobado. En Boletos: 16 pruebas de integracion aprobadas tras corregir UUID (incluidas 2000 compras por lotes) y 110 regresiones de pagos aprobadas. No se cambiaron dependencias o lockfiles.

## 2026-11-03 - BD preparada para prueba desde Boletos

- Restablecida la conectividad de sgvcb, se completo la migracion de la tabla de integracion propia de Boletos y sus indices en sgvcboletos. Verificacion posterior por lectura: cero solicitudes y envio deshabilitado; sin cambios a compras ni datos ficticios en esa BD.
- Los backends locales responden en 3010 (Boletos) y 4005 (Comprobantes). La configuracion de Boletos aun no contiene URL, claves, corte ni emisor; Comprobantes tampoco tiene URL de callback configurada. No se declaro una compra integrada ni una emision real.
- Falta completar la configuracion privada y reiniciar para probar una compra. La emision web sigue simulada y el correo se captura localmente. Se actualizo la guia operativa de Boletos; no hubo cambios de codigo, dependencias ni frontend.

## 2026-11-03 - Integracion con el backend de Boletos

- Se incorpora respuestaSunat al detalle de la API y al callback. Su valor sigue siendo NULL para el proveedor simulado: no se inventa aceptacion SUNAT ni se conecta el circuito beta de consola al worker web. Se actualiza OpenAPI y la guia del contrato.
- La captura, envio y recepcion del resultado se implementan en el backend externo de Boletos, en un modulo posterior a la compra y con tabla propia. No hay cambios de frontend ni de la confirmacion de pagos. El simulador historico de PagoEfectivo se renombra conservando su comportamiento.
- Validacion: 44 pruebas de Comprobantes aprobadas; sintaxis de sus 60 archivos y formato verificados. Las 15 pruebas nuevas de Boletos cubren el circuito HTTP entre proyectos con cuatro compras, recuperacion de 202 perdido, PDF, correo capturado y callback persistido en BD temporal. Incluyen ademas lotes de 2000 compras ficticias y ausencia de ciclos superpuestos cuando falla la persistencia. No se uso SUNAT ni SMTP real.
- Limites operativos: integracion deshabilitada por defecto, requiere datos de emisor, reglas contables, claves y fecha de corte. El intento de aplicar la migracion de Boletos en sgvcb fallo por ETIMEDOUT; solo se aplico y verifico en memoria. La web mantiene correo local de pruebas, sin entrega real al cliente.
- Regresiones Boletos: 110 pruebas Jest y nueve pruebas PostgreSQL temporales de PagoEfectivo aprobadas. Suites antiguas de Express presentan SQL ausente y mocks incompletos, documentados en la guia y bitacora del backend externo; no se declaran aprobadas.

## Regla permanente

Cada cambio en `backend-comprobantes/` o `frontend-comprobantes/` debe actualizar este archivo en el mismo trabajo. Registrar fecha de Lima, alcance, motivo, validaciones reales y pendientes. No registrar credenciales ni datos personales. Esta bitacora no sustituye el historial de Git ni la auditoria operativa de la aplicacion.

## 2026-11-02 — Configuracion de ambientes SUNAT

- SUNAT_ENV, SUNAT_BETA_URL, SUNAT_PRODUCTION_URL y SUNAT_TIMEOUT_MS centralizados en config/sunat.js y documentados en .env.example. El transporte recibe configuracion y ya no contiene un endpoint fijo exportado.
- Los comandos de pruebas leen .env sin modificar process.env ni cargar la configuracion de BD. Entorno del proceso y overrides tienen prioridad sobre .env. NODE_ENV conserva una responsabilidad independiente.
- Se valida correspondencia entre ambiente y URL oficial (HTTPS, host y ruta), con :443 equivalente. El circuito beta rechaza production antes de crear archivos o realizar llamadas HTTP; configurar el endpoint productivo no habilita un adaptador aun no implementado.
- Configuracion privada .env actualizada solo con estas variables, conservando acceso, DB y proveedor web simulado; copia privada anterior guardada en .local.
- Validacion: 44 pruebas aprobadas (38 anteriores y 6 de ambientes/configuracion), sintaxis de 60 archivos y formato verificados. Diagnostico real con .env: SUNAT beta devolvio WSDL HTTP 200 a las 20:38:27 de Lima. No se enviaron comprobantes adicionales ni se contacto produccion.

## 2026-11-02 — Prueba de comunicacion con SUNAT beta

- El usuario solicita pruebas reales contra el servicio beta. Se incorpora circuito independiente por consola: XML UBL 2.1 ficticio, firma RSA-SHA256 con certificado autofirmado, WS-Security MODDATOS, sendBill y lectura de CDR. El destino se limita al endpoint beta oficial; no recibe compras reales ni modifica sgvcb.
- Servicios de XML de prueba, firma, transporte y respuesta separados; PDF de prueba condicionado a codigo CDR 0 y referencia concordante. El proveedor de la aplicacion web permanece simulado durante la validacion de este circuito.
- Dependencias exactas xml-crypto 6.4.0, @xmldom/xmldom 0.9.12 y fflate 0.8.3; lockfile actualizado. Auditoria reproducible de ambos proyectos completada: cero vulnerabilidades conocidas, evidencia en docs/auditoria-dependencias.json.
- WSDL oficial consultado con HTTP 200. Dos envios externos realizados: factura F001-87787056 a las 16:47:17 de Lima y boleta B001-75206239 a las 16:49:04, ambas con CDR codigo 0, referencia concordante, sin observaciones y PDF generado despues de guardar la respuesta. Evidencia y hashes en docs/sunat-beta-resultados.json y guia PRUEBAS_SUNAT_BETA.md.
- Recuperacion offline de ambas respuestas verificada sin reenvio. El ZIP de factura incluia directorio dummy/ vacio: se ajusto el lector y se recupero el resultado ya recibido; el snapshot se reconstruyo comprobando igualdad exacta del XML firmado por SHA-256. El ZIP del primer envio no se habia archivado; el circuito actual lo conserva antes de la llamada HTTP.
- 38 pruebas de backend aprobadas: 26 regresiones y 12 de beta sin conexion externa. Cubren firma y alteracion del importe, identidad/ambiguedad CDR, directorio dummy, ZIP con rutas/tamano excesivo, XML con entidades, SOAP Fault, rechazo con HTTP 200, transporte fijo beta, timeout sin reenvio y PDF condicionado/recuperable. Sintaxis y formato verificados al cierre.
- No se modifica .env, sgvcb ni frontend. El flujo de compras web conserva el simulador. Pendientes antes de conectarlo al worker: contrato fiscal de compras, correlativos persistentes, reconciliacion remota, boletas/resumenes y etiquetas de ambiente. Beta no valida consistencia de datos ni acredita produccion; PDF beta de prueba sin QR fiscal ni verificacion criptografica de firma de CDR.

## 2026-11-01 — Inicio desde terminales de VS Code

- Configuracion local de terminales Windows en ambos proyectos para usar el Node 24 portable existente; el frontend prioriza su Angular CLI local. Permite los comandos habituales npm run dev y ng serve -o.
- Workspace dedicado comprobantes.code-workspace para abrir ambas carpetas en una ventana, con el mismo entorno de terminal. No se cambia el Node global ni configuraciones de Boletos.
- Puerto Angular predeterminado 4205 y host localhost, coherentes con el origen autorizado y el proxy. No hay cambios de dependencias ni de BD.
- Validacion: ambos entornos resuelven Node v24.22.2; npm local 11.19.1 y Angular CLI local del frontend comprobados. Angular confirma 4205 como puerto configurado. Compilacion Angular aprobada, 26 pruebas de backend aprobadas y sintaxis de 48 archivos verificada. JSON del workspace y carpetas referidas verificados; configuraciones formateadas con Prettier. Las terminales nuevas de VS Code deben abrirse despues de cargar la carpeta/workspace; no se automatizo la interfaz de VS Code.

## 2026-11-01 — PostgreSQL temporal compartido con Boletos

### Alcance y motivo

- El usuario eligio la base sgvcb existente para comenzar sin esperar una base independiente. Se creo el esquema propio comprobantes, separado de sgvcboletos.
- DB_SCHEMA configurable, validado y aplicado en todas las conexiones del pool y dentro de la transaccion de migracion. Se rechazan esquemas reservados y sgvcboletos.
- Las seis tablas funcionales y schema_migrations quedan dentro de comprobantes. No se modificaron las tablas ni archivos de configuracion de los proyectos existentes de Boletos.
- Configuracion privada de Comprobantes actualizada a PostgreSQL con una copia local del .env anterior. Los datos de PGlite no se trasladan automaticamente.
- Comandos db:configurar-boletos, db:migrate y db:script; SQL completo regenerable en docs/crear-tablas-comprobantes.sql y guia de configuracion/traslado en docs/BASE_DATOS.md.
- Tiempos limite de conexion, consulta y espera de bloqueos configurables; se mantiene el pool acotado.

### Validacion realizada

- 19 pruebas de backend aprobadas: 16 regresiones y 3 casos nuevos de nombres de esquema, aislamiento frente a tablas homonimas y ejecucion repetida del SQL portable.
- Conexion real a sgvcb comprobada; migracion aplicada en el esquema comprobantes y siete tablas verificadas. El esquema sgvcboletos conserva sus 58 tablas.
- Migracion repetida en sgvcb sin duplicar tablas ni el historial: schema_migrations conserva una aplicacion de 001_inicial.sql. Se verificaron los nombres de las siete tablas y cinco conexiones distintas del pool, todas con current_schema()=comprobantes.
- Consulta real del modelo de comprobantes aprobada con cero compras iniciales. No se insertaron compras ficticias ni se ejecuto la suite con TRUNCATE sobre sgvcb.
- Sintaxis JavaScript y formato de los archivos modificados verificados. No hubo cambios de dependencias ni de frontend.

### Operacion y limites

- La integracion entre aplicaciones sigue siendo por API. Compartir base no habilita consultas directas a las tablas de Boletos.
- La aplicacion conserva el proveedor fiscal simulado. Este cambio no implementa SUNAT ni envio SMTP.
- Para una base independiente se cambia DATABASE_URL conservando DB_SCHEMA; si se conservaran registros existentes, primero exportar/restaurar el esquema y trasladar los documentos segun la guia. Cambiar la conexion no copia datos.
- Las pruebas destructivas siguen limitadas a bases temporales/dedicadas y nunca se ejecutan sobre sgvcb.

## 2026-10-30 — 0.1.0 — Primera implementacion local

### Alcance

- Creacion de backend Node.js/Express y frontend Angular, conservando las carpetas y convenciones de Boletos.
- Contrato versionado para compras normales/express y boleta/factura. Una compra con varios boletos produce un comprobante.
- Validacion de importes decimales, totales, datos de comprador y boletos duplicados. Datos del emisor recibidos en el mensaje.
- Recepcion exclusiva de compras declaradas PAGADO en el contrato; sin reglas fiscales inferidas.
- Recepcion persistente, idempotencia por evento y compra, reservas con vencimiento, reintentos y reconciliacion antes de emitir.
- Proveedor simulado reemplazable; documentos persistentes con SHA-256; correo y notificaciones capturados localmente.
- Consulta contable, filtros por dia de Lima, paginacion, historial, descargas y reenvio de correo.
- Acceso con cookie HttpOnly, hash scrypt, credencial independiente para Boletos y verificacion de origen en acciones humanas.
- PGlite local y PostgreSQL mediante Sequelize; migraciones versionadas. Workers separables con PostgreSQL.
- Reserva exclusiva del directorio PGlite para impedir aperturas simultaneas; recuperacion de reserva local tras interrumpir un proceso. Cierre ordenado de HTTP, workers y BD.
- Node portable oficial verificado, lockfiles y auditoria de dependencias. Override acotado de uuid para corregir GHSA-w5hq-g745-h8pq en la dependencia de Sequelize.
- Instruccion de mantener esta bitacora en AGENTS.md de ambos proyectos.
- Formato uniforme con Prettier, contrato OpenAPI generado desde el validador e informe reproducible de auditoria para ambos proyectos.

### Validacion realizada

- 16 pruebas de backend aprobadas: cuatro combinaciones, validacion de compra pagada y dinero, recepcion simultanea, reservas concurrentes, respuesta perdida, recuperacion de archivos/correo, acceso e integridad y cierre/reapertura de la BD persistente.
- 4 pruebas de navegador aprobadas con Edge: factura express con tres boletos y descarga PDF/reenvio, pantalla movil de 390 px sin desbordamiento, rechazo sin documentos y retorno al acceso tras perder la sesion.
- Compilacion Angular de produccion aprobada, con TypeScript y plantillas estrictas. Bundle inicial aproximado de 325 kB, transferencia estimada 88 kB.
- Sintaxis de JavaScript y formato de ambos proyectos verificados.
- Auditoria final de ambos proyectos: cero vulnerabilidades conocidas, incluyendo dependencias de desarrollo. Evidencia en docs/auditoria-dependencias.json, fecha de Lima 2026-10-30.
- Correccion visual encontrada por la prueba movil: etiqueta accesible posicionada dentro de la tabla para evitar desbordamiento fuera del contenedor.

### Limites de esta etapa

- Sin conector fiscal real ni SMTP. Los documentos no tienen validez tributaria.
- Los proyectos existentes de Boletos permanecen sin modificaciones. Falta incorporar alli la outbox y el consumidor del resultado, conforme al contrato documentado.
- Pendientes reglas contables, series, tratamiento de gratuidades/correcciones, identidad institucional y pruebas productivas de capacidad con PostgreSQL externo.

## 2026-11-01 — Separacion de emision y documentos

### Alcance y motivo

- Confirmacion del proveedor persistida antes del PDF. La recuperacion de documentos conserva estado fiscal, numeracion y fecha, incluso si el proveedor deja de estar disponible.
- Servicios separados para documentos simulados del proveedor, plantilla versionada, render PDF y almacenamiento. Sin cambios de dependencias ni conexion SUNAT real.
- Migracion aditiva 002 con resultado_emision, estado_documentos y version_plantilla. Compatibilidad con archivos historicos y claves nuevas por contenido para evitar sobrescrituras de reservas antiguas.
- API, callback y Angular distinguen estado fiscal y documentos. Descarga/correo habilitados solo al confirmar el conjunto de archivos.
- Documentacion de la politica de entrega, contratos y limites en docs/DOCUMENTOS_Y_EMISION.md.

### Validacion

- 26 pruebas de backend aprobadas. Incluyen confirmacion incompleta/pendiente sin PDF ni correo, agotamiento y recuperacion de documentos sin proveedor, reservas vencidas, PDF multipagina reproducible, reapertura de la base con confirmacion persistida y compatibilidad de migracion con archivos anteriores.
- 5 pruebas de navegador aprobadas con Edge, usando backend aislado en memoria. Incluyen estados separados, recuperacion documental visible sin descarga/reenvio, rechazo sin documentos, descarga PDF, correo y pantalla movil. El caso visual de falla documental usa una respuesta controlada; la falla real y su recuperacion se verifican en backend.
- Compilacion Angular de produccion aprobada; sintaxis de 48 archivos JavaScript y formato de ambos proyectos verificados.
- Migracion 002 aplicada en sgvcb/comprobantes. Consultas posteriores verificaron las tres columnas, ambas versiones de migracion, siete tablas de Comprobantes y 58 tablas conservadas en sgvcboletos. Consulta del modelo real aprobada con cero compras. No se insertaron compras ficticias en sgvcb.
- OpenAPI y SQL portable regenerados; pruebas de migracion repetida y conservacion de rutas anteriores aprobadas. No se modificaron dependencias ni lockfiles.

### Limites

- Proveedor, XML y CDR simulados; no se incorporan certificados, firma, QR fiscal ni envios reales. Plantilla JavaScript sobre pdf-lib; el motor puede sustituirse por HTML/CSS mediante su contrato.
- Sigue pendiente el dimensionamiento productivo con PostgreSQL, reglas contables y modalidad SUNAT/PSE.
# Cambio: exclusión de archivos locales de Git

- **Alcance:** se declaran `.local/` y `.tools/` como directorios locales ignorados por Git.
- **Motivo:** evitar subir datos, documentos, certificados y herramientas locales del entorno de desarrollo.
- **Validación:** se revisó que las reglas de `.gitignore` incluyan ambos directorios.
- **Limitaciones:** Git no deja de seguir archivos que ya estaban versionados; esos requieren retirarse del índice por separado. No se borró ningún archivo local.

# Cambio: endpoints SUNAT configurables

- **Alcance:** `src/config/sunat.js` lee las URL de Beta y Producción desde `SUNAT_BETA_URL` y `SUNAT_PRODUCTION_URL`; se documentan en `.env.example`.
- **Motivo:** permitir cambiar endpoints por ambiente sin editar código y mantener la misma lógica de envío.
- **Validación:** cambio limitado a la fuente de configuración de los endpoints; no se ejecutaron pruebas en esta sesión.
- **Limitaciones:** las variables deben existir en el `.env` local o en el entorno de ejecución. No se reorganizaron servicios SUNAT porque no se pudo inspeccionar sus imports.

# Corrección: variables duplicadas en configuración local

- **Alcance:** se elimina una segunda declaración local de las URL SUNAT en `.env`.
- **Motivo:** evitar ambigüedad al cargar configuración de desarrollo.
- **Validación:** se verificó contra el contenido compartido por el usuario; se conserva una declaración de cada URL.
- **Limitaciones:** no se pudo ejecutar `npm run dev` ni revisar `src/database/schema.js` porque la terminal no está disponible en esta sesión.


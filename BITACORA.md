# Bitacora de cambios — Comprobantes electronicos

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

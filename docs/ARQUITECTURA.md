# Arquitectura y decisiones

## Limite de esta entrega

Aplicacion contable de pruebas, API receptora y procesamiento simulado. No se modifica Boletos. No se habilita SUNAT, PSE real ni SMTP.

Actualizacion 2026-11-02: circuito independiente por consola con conexion real a SUNAT beta para fixtures XML UBL 2.1 firmados. No se incorpora a la API/worker web ni a la base compartida. Ver PRUEBAS_SUNAT_BETA.md; la prohibicion de produccion y la simulacion del flujo web permanecen.

## Reglas confirmadas

- Una compra normal o express puede contener uno o varios boletos; genera un comprobante.
- El comprobante puede ser boleta o factura.
- SERNANP entrega la informacion necesaria del emisor, comprador y detalle.
- Cada proyecto mantiene su BD y se comunica mediante API.
- Mantener la estructura y tecnologias de Boletos, con dependencias actualizadas.

## Dependencias

`routes -> controllers -> services -> models -> database`

Los servicios reciben dependencias en `application.service.js`. Ningun controlador crea una conexion de BD. Los adaptadores de proveedor, archivo, correo y Boletos se componen alli y pueden sustituirse individualmente.

La interfaz HTTP y los workers usan los mismos servicios. No incorporar reglas contables al controlador, componentes Angular ni al temporizador del worker.

## Modelo persistente

- `comprobantes`: solicitud original, hash canonico, confirmacion normalizada persistida, estados de emision/documentos, version de plantilla, reserva y reintentos. El resultado simulado conserva copias de XML/CDR para recuperar documentos sin consultar al proveedor.
- `proveedor_simulado`: operacion externa ficticia persistente. Permite reproducir una respuesta perdida y comprobar que la siguiente consulta recupera la misma emision.
- `documentos`: clave logica, tipo, tamano y SHA-256. Los bytes permanecen fuera de la BD.
- `entregas`: cola independiente para correo y notificacion a Boletos.
- `auditoria`: historial de operaciones relevantes, sin credenciales.
- `sesiones`: tokens de acceso humano almacenados como hash y con vencimiento.
- `schema_migrations`: cambios de estructura aplicados, sin `sync({force:true})`.

## Recepcion e idempotencia

Guardar antes de responder 202. Evento y compra tienen restricciones unicas. El hash excluye eventoId y compara los datos de negocio normalizados. Repetir la misma compra devuelve el identificador original; cambiar sus datos devuelve 409. No modificar silenciosamente datos usados para emitir.

## Trabajo y recuperacion

Las reservas se adquieren en una transaccion corta con `FOR UPDATE SKIP LOCKED`, token y vencimiento. La comunicacion externa y los archivos se ejecutan sin transaccion abierta. Al persistir el resultado se comprueba el token: un proceso con reserva reemplazada no puede confirmar el trabajo.

Antes de emitir se consulta el identificador de operacion estable. Si el proveedor real no ofrece una forma fiable de recuperar una operacion incierta, el adaptador debe detenerla para conciliacion; no simular una garantia de emision unica.

Estado de emision, documentos y entregas son independientes. Primero se persiste la confirmacion de emision; despues se preparan documentos sin transaccion abierta. Al confirmar los documentos se guardan sus metadatos y trabajos de entrega en una misma transaccion corta. Un error de PDF/disco conserva la emision y permite continuar sin proveedor. El correo no puede revertir ni repetir una emision. Consultar DOCUMENTOS_Y_EMISION.md.

Emision y entregas tienen ciclos separados. Un callback lento no bloquea el ciclo de emision. La concurrencia se limita por proceso. Con varias instancias, calcular la concurrencia total y las conexiones acumuladas; el limite por instancia no sustituye un limite global del PSE.

## Dinero y datos fiscales

El contrato recibe importes como cadenas decimales con dos posiciones. La validacion calcula centimos con BigInt y compara detalle y total; no usa punto flotante. No calcula una tasa fiscal por defecto.

El limite de 200 boletos por compra es una restriccion inicial del contrato, documentada y modificable con pruebas. La generacion web de datos ficticios permite hasta 20 por operacion.

## Frontend

Angular con `core`, `modules` y `shared`, NgModules y TypeScript estricto. Servicios HTTP separados de los componentes. Consulta y detalle son modulos/pantallas funcionales. No se guarda la clave de integracion en el cliente. El proxy local conserva el origen del navegador para la verificacion de acciones.

## Base compartida temporal — 2026-11-01

Por instruccion del usuario, PostgreSQL utiliza temporalmente la base sgvcb de Boletos. Las tablas del proyecto y schema_migrations se encuentran en el esquema comprobantes. Todas las conexiones del pool seleccionan exclusivamente ese esquema y pg_catalog; las migraciones tambien fijan el esquema dentro de la transaccion. No se incorporan relaciones ni consultas a sgvcboletos. El traslado a otra base se configura mediante DATABASE_URL, conservando DB_SCHEMA. Consultar BASE_DATOS.md para copiar los datos y archivos cuando corresponda.

## Proximas decisiones

Proveedor y modalidad fiscal, series/correlativos reales, afectaciones y gratuidades, correcciones y notas, identidad institucional, retencion de documentos y auditoria, respaldos, monitoreo y objetivos de capacidad. No bloquean la simulacion funcional; condicionan la emision real.

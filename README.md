# Comprobantes electronicos SERNANP — backend

Entrega funcional **exclusiva para pruebas**. La aplicacion web recibe una compra normal o express con uno o varios boletos y genera un comprobante simulado. Adicionalmente, el circuito por consola conecta realmente con SUNAT beta para enviar XML firmados ficticios y recibir CDR; no esta conectado al worker web ni habilita produccion o SMTP.

## Conexion de pruebas SUNAT beta

Desde la terminal del backend: `npm run sunat:beta:diagnostico`, `npm run sunat:beta:preparar -- --tipo=FACTURA` y `npm run sunat:beta:enviar -- --tipo=FACTURA` (o BOLETA). El ultimo comando realiza un unico envio externo. Se requiere OpenSSL para el certificado autofirmado de prueba. Ya se verificaron factura y boleta con CDR codigo 0 y PDF posterior. Consultar [alcance, resultados y comandos](docs/PRUEBAS_SUNAT_BETA.md). No utiliza la base sgvcb ni datos reales.

Ambiente fiscal configurado en .env con SUNAT_ENV=beta, SUNAT_BETA_URL, SUNAT_PRODUCTION_URL y SUNAT_TIMEOUT_MS; ejemplos en .env.example. config/sunat.js selecciona el destino y el servicio recibe esa configuracion. NODE_ENV es independiente. Aunque se documenta production, los comandos beta lo rechazan; el adaptador productivo aun no esta implementado.

## Tecnologias y organizacion

Node.js 24 LTS, Express 5, JavaScript ESM, Sequelize 6 para la conexion PostgreSQL y SQL parametrizado en modelos. Misma organizacion de Boletos: `routes/`, `controllers/`, `services/`, `models/`, `database/`. Los trabajos estan en `workers/`; los contratos de entrada en `validators/`.

PGlite ofrece PostgreSQL embebido persistente para pruebas locales sin un servidor adicional. **Solo admite un proceso del proyecto por directorio de datos.** PostgreSQL externo se utiliza para procesos API/worker separados y pruebas de concurrencia entre instancias.

## Inicio local en Windows

Desde VS Code se puede abrir cada carpeta de proyecto por separado, o abrir `../comprobantes.code-workspace` para tener ambas en una misma ventana. Las terminales Windows nuevas usan Node 24 portable del backend; las del frontend tambien encuentran su Angular CLI local. El runtime debe existir en `.tools/node-v24.22.2-win-x64` (preparado en esta copia; en otra instalacion ejecutar scripts/preparar-node.ps1).

Cerrar las terminales anteriores y abrir una nueva en cada proyecto. En backend ejecutar `npm run dev`; en frontend ejecutar `ng serve -o`. El frontend usa localhost:4205 por defecto; el backend mantiene el puerto de su .env (4005 en la configuracion local). Comprobar `node -v`: debe mostrar v24.22.2. La configuracion de una subcarpeta no se aplica al abrir solo la carpeta padre Boletos; en ese caso usar el workspace dedicado. No se cambia el Node global ni los proyectos anteriores.

Referencia: [entorno de terminales de VS Code](https://code.visualstudio.com/docs/terminal/profiles).

Los dos proyectos ya incluyen dependencias bloqueadas en `package-lock.json`. Esta copia del workspace tiene un Node.js 24 local en `.tools/`; no cambia el Node global.

Desde la carpeta Boletos, en dos terminales:

```powershell
.\backend-comprobantes\scripts\dev.ps1
```

```powershell
.\backend-comprobantes\scripts\dev.ps1 -Frontend
```

Abrir **http://localhost:4205**. Consultar usuario y clave generados en `.local/ACCESO_LOCAL.md` del backend. Este archivo y `.env` estan ignorados y no deben versionarse.

En una copia nueva, con Node 24 LTS disponible:

```powershell
cd backend-comprobantes
npm ci
npm run setup:local
cd ../frontend-comprobantes
npm ci
```

Alternativa portable Windows: `backend-comprobantes/scripts/preparar-node.ps1` descarga Node oficial y verifica SHA-256. Agregar la ruta devuelta a PATH solo en esa terminal. No ejecutar con el Node 20 del proyecto anterior.

## Circuito de prueba

1. Ingresar y elegir **Compra de prueba**.
2. Seleccionar normal/express, boleta/factura, cantidad y escenario.
3. La API guarda la solicitud antes de responder `202`.
4. El worker confirma con el simulador y persiste el resultado antes de preparar PDF, XML y respuesta CDR **simulados**. Una falla documental conserva esa confirmacion.
5. Consultar documentos, auditoria y entregas. Los correos estan en `.local/correos/`; los resultados a Boletos, en `.local/notificaciones/`.
6. Reenviar correo conserva la misma emision. Si ya hay confirmacion persistida, el reintento recupera documentos sin invocar al proveedor; en caso contrario consulta/reconcilia primero.

El generador usa personas, RUC y correos ficticios. No establece datos reales de SERNANP ni reglas fiscales. La afectacion `POR_DEFINIR` y los impuestos informados son datos de pruebas; deben resolverse con Contabilidad antes del conector real.

## Configuracion

Consultar `.env.example`. Por acuerdo del 2026-11-01 se utiliza temporalmente la base `sgvcb` de Boletos, con las tablas de este proyecto en el esquema propio `comprobantes`. La conexion se conserva en el `.env` de Comprobantes; los archivos de configuracion de Boletos no se modifican. Consultar [la guia de base de datos](docs/BASE_DATOS.md).

- `DB_DRIVER=pglite`: datos locales persistentes en `DATA_DIRECTORY`.
- `DB_DRIVER=postgres`: usar `DATABASE_URL`, `DB_SCHEMA=comprobantes`, `DB_POOL_MAX` y TLS verificado cuando corresponda. El esquema se selecciona en todas las conexiones del pool.
- `DB_CONNECT_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS` y `DB_LOCK_TIMEOUT_MS`: limites de conexion, consultas y espera de bloqueos.
- `WORKER_CONCURRENCY`: maximo de trabajos simultaneos de emision y, por separado, de entrega, **por proceso**.
- `WORKERS_ENABLED=false`: API sin workers; ejecutar `npm run worker` con PostgreSQL.
- `BOLETOS_CALLBACK_URL` vacio: capturar resultado. Con destino configurado, requiere HTTPS (o loopback en pruebas), clave y confirmacion HTTP satisfactoria.
- `FISCAL_PROVIDER=simulado`: unico adaptador implementado. El inicio con `NODE_ENV=production` esta bloqueado para impedir confundir esta entrega con emision fiscal real.

No mantener una transaccion abierta durante llamadas externas. Los trabajos se reservan con `FOR UPDATE SKIP LOCKED`, token de reserva y vencimiento; cada resultado verifica el token antes de persistir.

## Verificacion

```powershell
npm test
npm run check
npm run docs:api
npm run format:check
npm audit --audit-level=low
```

La suite ejecuta SQL PostgreSQL en PGlite. La validacion con PostgreSQL externo, varias instancias y la carga pico acordada es una actividad adicional pendiente antes de produccion. Las pruebas locales no certifican capacidad productiva.

Para ejecutar la misma suite con PostgreSQL, crear una BD vacia y exclusiva llamada, por ejemplo, `comprobantes_test_local`, y definir `COMPROBANTES_TEST_DATABASE_URL` antes de `npm test`. La suite rechaza nombres que no comiencen con `comprobantes_test_` y vacia sus tablas entre pruebas. Nunca apuntarla a Boletos ni a una BD con datos que se deban conservar.

## Continuidad

- [Bitacora obligatoria](BITACORA.md)
- [Arquitectura y decisiones](docs/ARQUITECTURA.md)
- [Contrato con Boletos](docs/INTEGRACION_BOLETOS.md)
- [Contrato del proveedor fiscal](docs/CONTRATO_PROVEEDOR.md)
- [Emision, PDF y recuperacion de documentos](docs/DOCUMENTOS_Y_EMISION.md)
- [Calidad y evidencias](docs/CALIDAD_ISO25010.md)
- [Dependencias y seguridad](docs/SEGURIDAD.md)
- [Operacion y recuperacion](docs/OPERACION.md)
- [Base compartida y traslado posterior](docs/BASE_DATOS.md)

Toda modificacion de cualquiera de los dos proyectos debe actualizar `BITACORA.md`. `AGENTS.md` contiene la misma instruccion para los agentes que trabajen sobre el codigo.

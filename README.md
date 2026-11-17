# Backend de comprobantes SERNANP

Backend asincrono de desarrollo para recibir compras pagadas desde Boletos, procesarlas contra
SUNAT beta, generar PDF/XML/CDR y devolver el resultado. Existe un solo flujo tecnico;
El archivo de entorno seleccionado aporta la configuracion. Esta entrega no acredita emision
productiva ni documentos fiscalmente validos.

## Preparacion

Requiere Node.js 20.12 o superior, siempre dentro de la rama 20, y OpenSSL para crear el
certificado local de beta. El entorno portátil del proyecto usa Node.js 20.20.2. La rama 20
ya no recibe mantenimiento oficial; se conserva por compatibilidad con el servidor de Boletos.
Abra una terminal nueva de VS Code antes de instalar: la configuracion del proyecto coloca el
runtime portatil primero en `PATH`. `.npmrc` y el script `preinstall` rechazan cualquier instalacion
que no se ejecute con Node.js 20; `package.json` no descarga ni sustituye el runtime del sistema.

Antes de iniciar, el DBA debe ejecutar [sql/001_esquema.sql](sql/001_esquema.sql) en la base PostgreSQL y entregar `DATABASE_URL` con acceso al esquema `comprobantes`. El backend no crea ni modifica tablas durante el arranque.

```powershell
npm install
npm run setup:local
# Completar .env con los datos de conexion y SUNAT antes de iniciar.
npm run dev
```

`npm run dev` inicia la API y, cuando `WORKERS_ENABLED=true`, tambien los workers. No ejecute al
mismo tiempo un worker local y otro desplegado sobre la misma base. `npm run worker` se usa solo en
un ambiente controlado con PostgreSQL.

Docker Compose carga `.env` por defecto. Para desarrollo use `MAIL_MODE=capture`; para envio
real configure `MAIL_MODE=smtp` y todas las variables `SMTP_*` en ese mismo archivo. Si SMTP no
responde o la configuracion esta incompleta, registra `SMTP_CONFIG_INCOMPLETA` y reintenta el
correo sin detener el inicio de sesion, la emision fiscal ni los callbacks.

Comandos de verificacion:

```powershell
npm run check
npm run format:check
npm run sunat:diagnostico
```

`sunat:diagnostico` solo consulta el WSDL del ambiente configurado; no emite un comprobante.

## Configuracion SUNAT

- Desarrollo: configure `SUNAT_URL` con la URL beta y complete el usuario, la clave de pruebas, las series y el codigo de local. Puede crear un certificado autofirmado local.
- Produccion: configure `SUNAT_URL` con la URL de produccion y complete usuario, clave, certificado, clave privada, series y codigo de local institucionales. Los certificados se comprueban al preparar la firma, antes del envio; su ausencia no impide cargar la configuracion.
- `NODE_ENV` configura la ejecucion de Node y no selecciona ni restringe la URL SUNAT. Un contenedor con `NODE_ENV=production` puede usar beta para pruebas.
- Al iniciar, la aplicación verifica en modo lectura que el DBA haya creado todas las tablas y la secuencia requeridas.

Consulte [.env.example](.env.example) para todas las variables.

`.env.example` contiene los nombres con valores vacios; no se carga al ejecutar la aplicacion.
Los valores de desarrollo se completan en `.env`. `setup:local` copia esa plantilla y genera
las claves de acceso, pero requiere completar la configuracion antes de iniciar, incluidos los
campos numericos de puertos, tiempos y concurrencia. Si `.env` ya existe, no lo sobrescribe.

La precedencia es: valores proporcionados por las pruebas, entorno del proceso y archivo seleccionado.
SUNAT requiere ambiente, URL, usuario, clave, series y codigo de local explicitos; si falta alguno,
el arranque indica el nombre de la variable. Solo los ajustes tecnicos, como el timeout, conservan
valores predeterminados. `.env` es local y no se versiona: debe provisionarse antes de iniciar cada
despliegue. Si cambia, reinicie el proceso; en Docker Compose, recree el contenedor para cargarlo.

## Archivo separado para produccion

Local usa `.env`. Produccion usa directamente `.env.production`, que debe provisionarse en
cada servidor. Complete alli la conexion PostgreSQL, origen del frontend, credenciales, series,
certificados, correo y callback con los datos de ese ambiente. Ambos archivos operativos
estan excluidos de Git. `.env.example` se conserva como plantilla vacia para desarrollo.

`.env.production` incluye `COMPROBANTES_ENV_FILE=.env.production`: Compose y los cargadores de
configuracion usan ese archivo, sin completar campos ausentes desde `.env`. Las variables ya
definidas en el entorno del servidor conservan prioridad; evite dejar alli valores de otro ambiente.

Para desplegar con Docker Compose:

```powershell
docker compose --env-file .env.production up -d --build
```

Para ejecutar directamente con Node:

```powershell
npm run start:prod
```

Tambien existen `npm run worker:prod` y `npm run sunat:diagnostico:prod`. No ejecute el worker
separado junto con el de la API sin configurar antes `WORKERS_ENABLED` y la concurrencia.
El diagnostico solo consulta WSDL; no acredita emision productiva.

Los certificados deben existir en las rutas configuradas. En Docker, monte los archivos en el
contenedor y configure alli sus rutas; `.env.production` no monta archivos ni configura persistencia
para documentos. Esos recursos deben provisionarse en el servidor antes de iniciar.

## Documentacion vigente

- [Backend y arquitectura actual](BACKEND_Y_ARQUITECTURA.md)
- [Integracion con Boletos](INTEGRACION_BOLETOS.md)
- Contrato OpenAPI disponible con el backend iniciado: `GET /api/openapi.json`
- Historial de decisiones: [BITACORA](BITACORA.md)

## Limites que el equipo de despliegue debe conocer

La rama de produccion queda configurada en el mismo flujo, pero su habilitacion requiere credenciales/certificado institucionales, series autorizadas y validacion contable de afectaciones. Este repositorio no realiza esas aprobaciones por si solo. El correo todavía se captura en `MAIL_DIRECTORY` y los documentos se guardan en disco local; antes de escalar horizontalmente deben conectarse SMTP y almacenamiento compartido. No se ha realizado un envio a SUNAT produccion desde esta entrega.

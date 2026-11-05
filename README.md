# Backend de comprobantes SERNANP

Backend asincrono para recibir compras pagadas desde Boletos, emitir el comprobante mediante SUNAT, generar PDF/XML/CDR y devolver el resultado. Existe un solo flujo fiscal; `SUNAT_ENV=beta|production` selecciona credenciales, certificado, series y endpoint sin duplicar servicios.

## Preparacion

Requiere Node.js 24 y OpenSSL para crear el certificado local de beta.

Antes de iniciar, el DBA debe ejecutar [sql/001_esquema.sql](sql/001_esquema.sql) en la base PostgreSQL y entregar `DATABASE_URL` con acceso al esquema `comprobantes`. El backend no crea ni modifica tablas durante el arranque.

```powershell
npm install
npm run setup:local
npm run dev
```

`npm run dev` inicia API y workers en el mismo proceso. `npm run worker` se usa solo con PostgreSQL cuando la API tiene `WORKERS_ENABLED=false`.

Comandos de verificacion:

```powershell
npm run check
npm run format:check
npm run sunat:diagnostico
```

`sunat:diagnostico` solo consulta el WSDL del ambiente configurado; no emite un comprobante.

## Configuracion SUNAT

- Desarrollo: `SUNAT_ENV=beta`. Usa el usuario de pruebas MODDATOS y puede crear un certificado autofirmado local.
- Produccion: `SUNAT_ENV=production`. Exige usuario, clave, certificado, clave privada, series y codigo de local institucionales.
- Las URLs oficiales estan centralizadas en `src/config/sunat.js`; no se repiten en `.env`.
- `NODE_ENV=production` exige también `SUNAT_ENV=production` para evitar un despliegue productivo apuntando a beta.
- Al iniciar, la aplicación verifica en modo lectura que el DBA haya creado todas las tablas y la secuencia requeridas.

Consulte [.env.example](.env.example) para todas las variables.

## Documentacion vigente

- [Proceso backend y arquitectura](docs/BACKEND_Y_ARQUITECTURA.md)
- [Integracion con Boletos](docs/INTEGRACION_BOLETOS.md)
- Contrato generado: [OpenAPI](docs/openapi.json)
- Historial de decisiones: [BITACORA](BITACORA.md)

## Limites que el equipo de despliegue debe conocer

La rama de produccion queda configurada en el mismo flujo, pero su habilitacion requiere credenciales/certificado institucionales, series autorizadas y validacion contable de afectaciones. Este repositorio no realiza esas aprobaciones por si solo. El correo todavía se captura en `MAIL_DIRECTORY` y los documentos se guardan en disco local; antes de escalar horizontalmente deben conectarse SMTP y almacenamiento compartido. No se ha realizado un envio a SUNAT produccion desde esta entrega.

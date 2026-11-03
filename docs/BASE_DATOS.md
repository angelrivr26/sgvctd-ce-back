# Base de datos: uso compartido temporal y traslado posterior

## Decision del 2026-11-01

El usuario selecciono **sgvcb**, la base utilizada por los .env actuales de Boletos. Comprobantes utiliza exclusivamente el esquema **comprobantes**. Boletos conserva **sgvcboletos**.

```text
sgvcb
  sgvcboletos       tablas existentes de Boletos
  comprobantes     siete tablas del proyecto nuevo
```

Compartir base no cambia el contrato de integracion: los proyectos siguen intercambiando mensajes por API. No se agregan relaciones ni consultas a las tablas de Boletos. Un esquema separa nombres y objetos; los recursos de CPU, disco, conexiones y permisos del usuario de BD siguen siendo compartidos.

Verificacion realizada: siete tablas en comprobantes, una migracion aplicada, cinco conexiones del pool apuntando a comprobantes y 58 tablas conservadas en sgvcboletos. La consulta inicial de comprobantes devuelve cero compras; no se cargaron operaciones ficticias en esta base durante la instalacion.

Actualizacion documental del mismo dia: migracion 002 aplicada y verificada en sgvcb/comprobantes. El historial conserva 001 y 002, con los nuevos campos resultado_emision, estado_documentos y version_plantilla. Se mantienen siete tablas en comprobantes y 58 en sgvcboletos; la consulta real sigue con cero compras de Comprobantes. Las pruebas funcionales se ejecutaron en bases temporales, sin insertar compras ficticias en sgvcb.

## Donde configurar

En `backend-comprobantes/.env`:

```dotenv
DB_DRIVER=postgres
DATABASE_URL=postgresql://USUARIO:CLAVE@SERVIDOR:5432/sgvcb
DB_SCHEMA=comprobantes
DB_POOL_MAX=5
DB_CONNECT_TIMEOUT_MS=5000
DB_STATEMENT_TIMEOUT_MS=30000
DB_LOCK_TIMEOUT_MS=5000
```

La URL real es privada y no debe versionarse. Los datos de acceso se pueden tomar del backend existente con `npm run db:configurar-boletos`. El script lee solo su configuracion PostgreSQL, verifica la base esperada, actualiza el .env de Comprobantes y conserva una copia privada del anterior. No cambia el .env de Boletos y no ejecuta DDL.

La aplicacion establece search_path en cada conexion del pool, sin incluir sgvcboletos ni public. Las migraciones vuelven a fijarlo dentro de la transaccion y su historial se guarda en comprobantes.schema_migrations. DB_SCHEMA rechaza nombres reservados y sgvcboletos.

## Crear o actualizar las tablas

Con Node 24 en PATH, desde backend-comprobantes:

```powershell
npm run db:migrate
```

El arranque normal tambien aplica las migraciones pendientes. El proceso crea el esquema si falta y ejecuta los archivos numerados de migrations/ una sola vez. No contiene borrado de tablas ni cambios al esquema de Boletos.

Alternativa para ejecutar desde una herramienta SQL:

```powershell
npm run db:script
```

Revisar y ejecutar `docs/crear-tablas-comprobantes.sql` conectado a la base elegida. Este script incluye transaccion, esquema, search_path, control de versiones y bloqueo de migraciones. No ejecutar `migrations/001_inicial.sql` aisladamente con un search_path desconocido.

La migracion `002_documentos_independientes.sql` agrega resultado_emision, estado_documentos y version_plantilla; conserva documentos historicos sin inventar confirmaciones. Siguen siendo siete tablas. Para modificar estructura en el futuro, agregar `003_descripcion.sql` (no reescribir migraciones ya aplicadas) y regenerar el script. Para otro esquema, `npm run db:script -- --esquema=comprobantes_qa`.

## Traslado a una base independiente

1. Detener API y workers de Comprobantes para evitar escrituras durante la copia.
2. Crear la base nueva y un usuario con los permisos necesarios.
3. Si se conservan los datos, exportar/restaurar el esquema completo con pg_dump/pg_restore, incluyendo secuencias, restricciones y schema_migrations. Verificar cantidades, relaciones y correlativos antes del cambio.
4. Cambiar DATABASE_URL a la nueva base, manteniendo DB_SCHEMA=comprobantes. Para una base vacia de pruebas, ejecutar directamente las migraciones.
5. Conservar los archivos de documentos y sus claves; trasladarlos y verificar SHA-256 si tambien cambia el servidor de almacenamiento.
6. Iniciar y validar consultas, workers, documentos e integracion. Conservar el origen hasta verificar el traslado.

Cambiar la URL selecciona otro destino; no copia datos automaticamente. Los datos ficticios existentes en PGlite local tampoco se copian a PostgreSQL.

## Pruebas

La suite de pruebas automatizadas usa una BD temporal o una base externa dedicada llamada comprobantes_test_*. Nunca ejecutar pruebas con TRUNCATE sobre sgvcb. Las nuevas pruebas de esquema crean tablas homonimas ficticias en public/sgvcboletos y verifican que las migraciones y consultas de Comprobantes las conservan.

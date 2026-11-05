-- Script unico para el DBA. Ejecutar conectado a la base de datos de Comprobantes.
CREATE SCHEMA IF NOT EXISTS comprobantes;
SET search_path TO comprobantes, pg_catalog;

CREATE TABLE IF NOT EXISTS comprobantes (
  id uuid PRIMARY KEY,
  evento_id varchar(100) NOT NULL UNIQUE,
  origen varchar(30) NOT NULL,
  compra_id varchar(64) NOT NULL,
  payload jsonb NOT NULL,
  payload_hash varchar(64) NOT NULL,
  estado varchar(30) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE','PROCESANDO','PROCESADO','REQUIERE_ATENCION')),
  estado_fiscal varchar(40) NOT NULL DEFAULT 'PENDIENTE',
  estado_documentos varchar(25) NOT NULL DEFAULT 'NO_HABILITADOS'
    CHECK (estado_documentos IN ('NO_HABILITADOS','PENDIENTES','GENERANDO','DISPONIBLES','ERROR')),
  resultado_emision jsonb,
  version_plantilla varchar(40),
  serie varchar(20),
  numero bigint,
  intentos integer NOT NULL DEFAULT 0,
  proximo_intento timestamptz NOT NULL DEFAULT now(),
  reserva_hasta timestamptz,
  reserva_token uuid,
  ultimo_error varchar(500),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(origen, compra_id)
);

-- Compatibilidad con instalaciones anteriores. No borra columnas ni tablas historicas.
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS resultado_emision jsonb;
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS estado_documentos varchar(25)
  NOT NULL DEFAULT 'NO_HABILITADOS';
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS version_plantilla varchar(40);

CREATE INDEX IF NOT EXISTS comprobantes_pendientes ON comprobantes(proximo_intento, creado_en)
  WHERE estado IN ('PENDIENTE','PROCESANDO');
CREATE INDEX IF NOT EXISTS comprobantes_fecha ON comprobantes(creado_en DESC, id DESC);

CREATE TABLE IF NOT EXISTS documentos (
  id uuid PRIMARY KEY,
  comprobante_id uuid NOT NULL REFERENCES comprobantes(id),
  tipo varchar(10) NOT NULL CHECK(tipo IN ('PDF','XML','CDR')),
  clave varchar(150) NOT NULL,
  sha256 varchar(64) NOT NULL,
  bytes bigint NOT NULL,
  UNIQUE(comprobante_id,tipo)
);

CREATE TABLE IF NOT EXISTS entregas (
  id uuid PRIMARY KEY,
  comprobante_id uuid NOT NULL REFERENCES comprobantes(id),
  tipo varchar(15) NOT NULL CHECK(tipo IN ('BOLETOS','CORREO')),
  estado varchar(30) NOT NULL DEFAULT 'PENDIENTE'
    CHECK(estado IN ('PENDIENTE','PROCESANDO','ENVIADO','CAPTURADO_PRUEBA','REQUIERE_ATENCION')),
  intentos integer NOT NULL DEFAULT 0,
  proximo_intento timestamptz NOT NULL DEFAULT now(),
  reserva_hasta timestamptz,
  reserva_token uuid,
  ultimo_error varchar(500),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entregas_pendientes ON entregas(proximo_intento,creado_en)
  WHERE estado IN ('PENDIENTE','PROCESANDO');

CREATE TABLE IF NOT EXISTS auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  comprobante_id uuid REFERENCES comprobantes(id),
  accion varchar(80) NOT NULL,
  actor varchar(100) NOT NULL,
  detalle varchar(500),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash varchar(64) PRIMARY KEY,
  usuario varchar(80) NOT NULL,
  expira_en timestamptz NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS sunat_numero_seq MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
CREATE TABLE IF NOT EXISTS sunat_envios (
  comprobante_id uuid PRIMARY KEY REFERENCES comprobantes(id),
  ambiente varchar(10) NOT NULL CHECK (ambiente IN ('beta','production')),
  serie varchar(4) NOT NULL,
  numero bigint NOT NULL CHECK (numero BETWEEN 1 AND 99999999),
  solicitud jsonb NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'PREPARADO'
    CHECK (estado IN ('PREPARADO','ENVIO_INICIADO','RESPONDIDO')),
  zip_base64 text,
  respuesta_soap text,
  http_status integer,
  fecha_respuesta timestamptz,
  error_transporte varchar(80),
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(serie,numero)
);

CREATE TABLE IF NOT EXISTS sunat_control (
  id integer PRIMARY KEY CHECK (id=1),
  operacion_id uuid,
  disponible_desde timestamptz NOT NULL DEFAULT now()
);
INSERT INTO sunat_control(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

-- Copia el diario beta anterior una sola vez cuando existe; conserva la tabla original como respaldo.
DO $migrar_sunat_beta$
BEGIN
  IF to_regclass('proveedor_sunat_beta') IS NOT NULL THEN
    EXECUTE 'INSERT INTO sunat_envios(comprobante_id,ambiente,serie,numero,solicitud,estado,zip_base64,respuesta_soap,http_status,fecha_respuesta,error_transporte,creado_en)
      SELECT comprobante_id,''beta'',serie,numero,solicitud,estado,zip_base64,respuesta_soap,http_status,fecha_respuesta,error_transporte,creado_en
      FROM proveedor_sunat_beta ON CONFLICT(comprobante_id) DO NOTHING';
  END IF;
END;
$migrar_sunat_beta$;

SELECT setval(
  'sunat_numero_seq',
  GREATEST(COALESCE((SELECT max(numero) FROM sunat_envios),0)+1,1),
  false
);

-- Documentos historicos ya terminados siguen disponibles sin inventar respuesta fiscal.
UPDATE comprobantes SET estado_documentos='DISPONIBLES',version_plantilla='historico-v1'
WHERE estado='PROCESADO' AND version_plantilla IS NULL;

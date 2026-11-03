CREATE TABLE comprobantes (
  id uuid PRIMARY KEY,
  evento_id varchar(100) NOT NULL UNIQUE,
  origen varchar(30) NOT NULL,
  compra_id varchar(64) NOT NULL,
  payload jsonb NOT NULL,
  payload_hash varchar(64) NOT NULL,
  estado varchar(30) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE','PROCESANDO','PROCESADO','REQUIERE_ATENCION')),
  estado_fiscal varchar(40) NOT NULL DEFAULT 'PENDIENTE',
  serie varchar(20), numero bigint,
  intentos integer NOT NULL DEFAULT 0,
  proximo_intento timestamptz NOT NULL DEFAULT now(),
  reserva_hasta timestamptz, reserva_token uuid,
  ultimo_error varchar(500),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(origen, compra_id)
);
CREATE INDEX comprobantes_pendientes ON comprobantes(proximo_intento, creado_en)
  WHERE estado IN ('PENDIENTE','PROCESANDO');
CREATE INDEX comprobantes_fecha ON comprobantes(creado_en DESC, id DESC);
CREATE TABLE proveedor_simulado (
  comprobante_id uuid PRIMARY KEY REFERENCES comprobantes(id),
  estado varchar(20) NOT NULL,
  disponible_en timestamptz NOT NULL,
  numero bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE documentos (
  id uuid PRIMARY KEY,
  comprobante_id uuid NOT NULL REFERENCES comprobantes(id),
  tipo varchar(10) NOT NULL CHECK(tipo IN ('PDF','XML','CDR')),
  clave varchar(150) NOT NULL,
  sha256 varchar(64) NOT NULL,
  bytes bigint NOT NULL,
  UNIQUE(comprobante_id,tipo)
);
CREATE TABLE entregas (
  id uuid PRIMARY KEY,
  comprobante_id uuid NOT NULL REFERENCES comprobantes(id),
  tipo varchar(15) NOT NULL CHECK(tipo IN ('BOLETOS','CORREO')),
  estado varchar(30) NOT NULL DEFAULT 'PENDIENTE'
    CHECK(estado IN ('PENDIENTE','PROCESANDO','ENVIADO','CAPTURADO_PRUEBA','REQUIERE_ATENCION')),
  intentos integer NOT NULL DEFAULT 0,
  proximo_intento timestamptz NOT NULL DEFAULT now(),
  reserva_hasta timestamptz, reserva_token uuid,
  ultimo_error varchar(500),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entregas_pendientes ON entregas(proximo_intento,creado_en)
  WHERE estado IN ('PENDIENTE','PROCESANDO');
CREATE TABLE auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  comprobante_id uuid REFERENCES comprobantes(id),
  accion varchar(80) NOT NULL,
  actor varchar(100) NOT NULL,
  detalle varchar(500),
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sesiones (
  token_hash varchar(64) PRIMARY KEY,
  usuario varchar(80) NOT NULL,
  expira_en timestamptz NOT NULL
);

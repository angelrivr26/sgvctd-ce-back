ALTER TABLE comprobantes
  ADD COLUMN resultado_emision jsonb,
  ADD COLUMN estado_documentos varchar(25) NOT NULL DEFAULT 'NO_HABILITADOS'
    CHECK (estado_documentos IN ('NO_HABILITADOS','PENDIENTES','GENERANDO','DISPONIBLES','ERROR')),
  ADD COLUMN version_plantilla varchar(40);

-- Conservar documentos anteriores sin inventar una respuesta fiscal historica.
UPDATE comprobantes SET estado_documentos='DISPONIBLES',version_plantilla='simulado-v1'
WHERE estado='PROCESADO';

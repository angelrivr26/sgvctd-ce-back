# Emision, PDF y recuperacion

## Politica del proyecto

Preparar y validar los datos ocurre antes de enviar al proveedor. El XML firmado se prepara antes del envio en una integracion fiscal real. Para este proyecto, el PDF destinado a descarga/correo se habilita despues de confirmar el resultado fiscal aplicable y persistirlo. Es una politica de entrega acordada, no una afirmacion de que toda modalidad SUNAT obliga a esperar para elaborar cualquier representacion.

HTTP 200, un ticket o la recepcion del proveedor no equivalen a aceptacion. El adaptador real debera interpretar la CDR/respuesta correspondiente y gestionar consultas pendientes, observaciones, rechazo y resultado incierto. La modalidad de boletas/resumenes debe definirse con SERNANP/PSE antes de implementarla.

En esta entrega solo existe confirmacion SIMULADA. No se conecta a SUNAT ni se produce XML UBL, firma, QR fiscal o CDR real.

## Secuencia persistente

1. Recibir una compra pagada e inmutable, con uno o varios boletos, antes de responder 202.
2. Consultar/reconciliar al proveedor antes de solicitar una emision cuyo resultado no se conoce.
3. Validar el resultado normalizado y guardar resultado_emision, estado_fiscal, serie, numero y fecha. Este commit precede a la generacion del PDF.
4. Preparar PDF desde la misma compra y resultado persistidos. Obtener XML/CDR del resultado del simulador, no del almacenamiento.
5. Guardar archivos por contenido. Confirmar sus metadatos, version de plantilla y estado DISPONIBLES en una transaccion corta; crear las entregas de correo y Boletos en esa misma transaccion.
6. Entregar con reintentos independientes.

Si falla el PDF o el disco, resultado_emision y la numeracion permanecen confirmados. El nuevo intento recupera documentos sin consultar ni invocar al proveedor. Si el proceso muere antes de guardar la confirmacion externa, sigue siendo necesaria la reconciliacion. No mantener transacciones durante llamadas externas ni generacion de archivos.

## Estados de documentos

| Estado         | Significado                                                        |
| -------------- | ------------------------------------------------------------------ |
| NO_HABILITADOS | Aun no hay confirmacion de emision; incluye pendientes y rechazos. |
| PENDIENTES     | Confirmacion persistida; documentos por preparar.                  |
| GENERANDO      | Trabajo reservado preparando documentos.                           |
| DISPONIBLES    | PDF/XML/CDR y metadatos confirmados.                               |
| ERROR          | Emision confirmada, pero falta recuperar documentos.               |

estado sigue indicando el estado operativo global. Por ejemplo, estado=PENDIENTE, estadoFiscal=SIMULADO y estadoDocumentos=ERROR significa que se reintentaran documentos de la misma emision. Al agotar intentos pasa a REQUIERE_ATENCION; la accion Recuperar documentos usa el mismo endpoint de reintento.

## Responsabilidades y plantilla

- proveedor-fiscal-simulado.service.js y documento-simulado.service.js: resultado y documentos ficticios del proveedor.
- resultado-emision.validator.js: contrato de confirmacion actual, exclusivo del simulador. Impide aceptar un COMPLETADO incompleto, de otra operacion o con documentos faltantes.
- procesamiento.service.js: coordinacion y recuperacion desde el punto persistido.
- documentos.service.js: coordina documentos ya confirmados y sus claves de almacenamiento.
- pdf.service.js: renderiza bytes, sin acceso a BD ni al proveedor.
- templates/comprobante-prueba.js: presentacion dinamica versionada simulado-v2.
- archivo.service.js: persistencia local y verificacion de integridad; no genera documentos.

El motor actual conserva pdf-lib, sin nuevas dependencias. La plantilla de prueba es JavaScript, no HTML. Para incorporar HTML/CSS se sustituye el servicio render(record) manteniendo su salida { content, templateVersion } y pruebas de recuperacion. No usar una captura de Angular como documento contable.

Los textos se distribuyen segun el ancho de la fuente, el detalle continua en varias paginas y la fecha procede de la emision persistida. No hay tasas inferidas ni datos fijos de compradores. El contenido queda marcado sin validez tributaria en cada pagina. La fuente Helvetica conserva la limitacion Latin-1 previa; caracteres fuera de ese repertorio se representan con ?. Antes de documentos fiscales reales, incorporar fuente Unicode y validar representacion de todos los datos permitidos.

No se crea un QR fiscal ficticio. El adaptador real debera entregar el XML firmado y el valor resumen correspondiente; no utilizar el SHA-256 de almacenamiento como DigestValue. Aplicar la especificacion vigente y probar lectura del QR generado.

## Almacenamiento y concurrencia

Las claves nuevas incluyen el hash de los bytes dentro del identificador del comprobante. Una reserva antigua no sobrescribe archivos con contenido diferente. Solo el titular de la reserva puede confirmar el resultado y publicar metadatos. Pueden quedar archivos sin referencia si se interrumpe la escritura del conjunto; no son descargables ni provocan correo. Su limpieza y la retencion deben definirse antes de produccion.

La migracion 002 es aditiva. Los documentos historicos procesados conservan sus rutas y quedan identificados como simulado-v1; no se fabrica un resultado de emision historico. Se mantienen siete tablas.

## Contrato HTTP

Las respuestas de consulta agregan estadoDocumentos, versionPlantilla y fechaEmision. Las notificaciones a Boletos agregan estadoDocumentos. No exponen resultado_emision ni contenido XML/CDR interno. Descargar usa los endpoints autenticados existentes. El reenvio de correo utiliza los mismos archivos disponibles.

## Referencias oficiales

- Servicios beta y produccion: https://orientacion.sunat.gob.pe/guias-manuales-y-servicios-web
- Respuestas y aspectos tecnicos/QR: https://www.sunat.gob.pe/legislacion/superin/2019/anexoVI-114-2019.pdf
- Guias, esquemas y reglas vigentes: https://cpe.sunat.gob.pe/guias-y-manuales

El video analizado se utilizo como referencia visual; no se copio su codigo comercial ni se auditaron sus dependencias.

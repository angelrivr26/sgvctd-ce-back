# Operacion y recuperacion de pruebas

## Estados

- PENDIENTE: trabajo guardado y programado.
- PROCESANDO: reservado por un worker hasta reserva_hasta.
- PROCESADO: simulacion terminada y documentos persistidos.
- REQUIERE_ATENCION: rechazo o limite de intentos; consultar motivo.

El resultado fiscal SIMULADO nunca representa aceptacion SUNAT. RESULTADO_INCIERTO requiere consulta antes de cualquier nueva emision. Los estados de correo y notificacion son independientes.

estadoDocumentos distingue NO_HABILITADOS, PENDIENTES, GENERANDO, DISPONIBLES y ERROR. Una confirmacion persistida con documentos en ERROR se recupera sin proveedor, conservando serie, numero y fecha. El detalle muestra Recuperar documentos al agotar intentos. Consultar DOCUMENTOS_Y_EMISION.md.

## Fallas previstas

| Falla                                      | Comportamiento                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| 202 perdido                                | Reenviar mismo evento; devuelve el registro existente                                |
| Servicio fiscal temporalmente indisponible | Espera creciente y numero limitado de intentos                                       |
| Emision recibida sin respuesta             | Consultar operacion estable, recuperar la misma emision                              |
| Worker interrumpido                        | Recuperar reserva vencida; token anterior no puede confirmar                         |
| Archivo no guardado                        | Usar confirmacion persistida y recuperar documentos sin consultar ni emitir otra vez |
| Archivo alterado o ausente                 | Bloquear descarga y reportar incidencia; no entregar bytes incorrectos               |
| Correo falla                               | Conservar comprobante; reintentar su entrega                                         |
| Callback falla                             | Reintentar el mismo notificacionId; al agotar intentos permitir recuperacion manual  |

## Acciones contables

- Reintentar procesamiento / Recuperar documentos: disponible si requiere atencion; conserva compra y operacionId. Si existe resultado_emision, no invoca al proveedor.
- Reenviar correo de prueba: crea una entrega nueva del mismo comprobante; rechaza si ya hay un correo pendiente.
- Reintentar entregas: recupera entregas agotadas conservando su identificador.

Reintentar un rechazo simulado vuelve a consultar el mismo rechazo. No ofrece editar silenciosamente un comprobante. El circuito de correccion/anulacion real queda pendiente de definicion contable.

## Persistencia y traslado

En local, conservar .local/data, .local/documentos, .local/correos y .local/notificaciones. No ejecutar dos procesos PGlite con el mismo directorio. Detener el backend antes de copiar su almacenamiento para un respaldo de pruebas.

Para mover documentos, copiar archivos manteniendo las claves relativas, verificar SHA-256 contra la tabla documentos y cambiar DOCUMENT_DIRECTORY. No borrar el origen hasta verificar el traslado. Si cambia a almacenamiento remoto, implementar el adaptador respetando el contrato de lectura/generacion/obtencion aplicable.

## PostgreSQL compartido con Boletos

La configuracion local utiliza temporalmente sgvcb y DB_SCHEMA=comprobantes. El cambio de destino no copia las compras ficticias de PGlite. Los archivos de configuracion y tablas de Boletos permanecen sin cambios. Usar db:migrate o el SQL completo generado; no ejecutar pruebas con TRUNCATE en esta base. Consultar BASE_DATOS.md para futuras migraciones de servidor/base y documentos.

## Antes de ampliar capacidad

Usar PostgreSQL externo de pruebas, API sin worker integrado y procesos worker separados. Medir latencia de BD, conexiones, profundidad y antiguedad de cola, tasa de exito y reintentos, disco y limites externos. Ajustar concurrencia y tasa global con esos datos. La limitacion HTTP inicial es 1000 solicitudes/minuto por IP y proceso, y debe revisarse junto a la outbox emisora.

Pendientes para produccion: monitoreo y alertas, retencion/limpieza de historicos, respaldos restaurables, metricas de cola, limites globales distribuidos y pruebas de failover. Esta entrega no acredita dimensionamiento productivo.

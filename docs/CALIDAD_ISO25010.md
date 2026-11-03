# Calidad del producto — matriz inicial ISO/IEC 25010

Referencia de trabajo: [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html). Confirmar la edicion exigida por el contrato. Esta matriz es una seleccion inicial de objetivos del proyecto, no una declaracion de certificacion ni una evaluacion completa del modelo.

| Objetivo                 | Criterio del proyecto                                           | Evidencia inicial                                                           | Validacion posterior                                                               |
| ------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Adecuacion funcional     | Normal/express y boleta/factura; varios boletos, un comprobante | Suite backend de cuatro combinaciones; recorrido web                        | Reglas contables y pruebas con PSE/SUNAT                                           |
| Fiabilidad               | No perder pendientes confirmados; reintentos reconocidos        | Restricciones unicas, reservas, reconciliacion y casos de respuesta perdida | Reinicio de procesos/servidor, PostgreSQL externo, respaldos                       |
| Eficiencia de desempeno  | Limitar trabajo activo y conexiones; medir cola                 | Concurrencia configurable y pool PostgreSQL                                 | Acordar compras/minuto pico, latencia, p95 y tiempo maximo en cola; ejecutar carga |
| Compatibilidad           | Intercambio versionado y validado                               | OpenAPI generado, API autenticada y prueba de callback                      | Outbox y consumidor real de Boletos                                                |
| Capacidad de interaccion | Ver estado, motivo y acciones sin ambiguedad                    | Consulta, detalle, estados de carga/vacio/error, prueba desktop/movil       | Validacion por Contabilidad y revision de accesibilidad                            |
| Seguridad                | Proteger acceso y documentos; no filtrar claves                 | Cookie HttpOnly, scrypt, origen, API key, SHA-256, auditoria npm            | Identidad institucional, roles, HTTPS y revision de seguridad                      |
| Mantenibilidad           | Cambiar proveedor y almacenamiento sin mezclar reglas           | Servicios compuestos, contratos, pruebas y documentacion                    | Revisar adaptador real y sus pruebas de contrato                                   |
| Flexibilidad             | Ajustar proveedor, capacidad y destino de archivos              | Configuracion y separacion de adaptadores; worker PostgreSQL separable      | Despliegue real y traslado verificado de documentos                                |

Los criterios numericos de capacidad y disponibilidad quedan pendientes de acuerdos del negocio. No asignar porcentajes de cobertura ni tiempos de respuesta como si fueran requisitos numericos impuestos por ISO.

La evaluacion completa debe revisar todas las caracteristicas y subcaracteristicas aplicables, justificar exclusiones y conservar resultados de pruebas, versiones, ambiente y criterios de aceptacion.

## Evidencia de la separacion de documentos — 2026-11-01

26 pruebas de backend y 5 de navegador aprobadas. Se verifica recuperacion despues de reiniciar la base con una confirmacion persistida, proveedor desconectado, fallo de PDF/disco sin segunda emision, confirmaciones pendientes/incompletas sin correo, compatibilidad con documentos anteriores y reservas vencidas. El PDF multipagina conserva fecha y bytes al regenerarse con la misma plantilla y resultado.

Los servicios de proveedor, documentos, render y almacenamiento se componen por separado. El motor actual usa pdf-lib y una plantilla JavaScript versionada; el contrato permite otro motor. Estas evidencias respaldan mantenibilidad y recuperacion en el ambiente probado. No acreditan emision SUNAT real, capacidad productiva ni certificacion ISO. Consultar DOCUMENTOS_Y_EMISION.md y BITACORA.md para alcance, validacion y limitaciones.

## Evidencia de conexion SUNAT beta — 2026-11-02

38 pruebas de backend aprobadas: 26 anteriores y 12 pruebas offline del circuito beta. Dos envios externos de fixture (factura y boleta) obtuvieron CDR codigo 0 y PDF posterior. Auditoria de ambos proyectos sin vulnerabilidades conocidas. Se conservan evidencia resumida con hashes, documentos locales y comandos reproducibles en PRUEBAS_SUNAT_BETA.md. El circuito aun es independiente del worker web y no demuestra capacidad, consistencia tributaria ni habilitacion productiva.

# Implementar el proveedor fiscal real

## Punto de sustitucion

`src/services/proveedor-fiscal.service.js` selecciona el adaptador. `application.service.js` compone las dependencias. Las reglas del procesamiento estan en `procesamiento.service.js`, no en el controlador ni en el adaptador.

El adaptador actual es simulado. Su XML no es UBL y su CDR no es una constancia SUNAT. No reutilizar esos generadores para declararlos documentos fiscales validos.

Desde 2026-11-02 existe un circuito independiente de consola con conexion real a SUNAT beta: XML UBL 2.1 firmado, sendBill y CDR. Factura y boleta de prueba obtuvieron codigo 0. Consultar PRUEBAS_SUNAT_BETA.md. Aun no es un adaptador del worker web: el contrato fiscal del payload y la reconciliacion remota deben resolverse antes de sustituir el simulador. No cambiar FISCAL_PROVIDER a un valor no implementado.

## Contrato inicial

```javascript
const provider = {
  async consultarResultado(operacionId) {
    // null: el proveedor puede afirmar que la operacion aun no existe.
    // PENDIENTE: fue recibida y sigue en tramite.
    // COMPLETADO: resultado terminal satisfactorio segun modalidad acordada.
    // RECHAZADO: resultado terminal con motivo tratable.
  },
  async solicitarEmision(payload, operacionId, intento) {
    // operacionId es estable; no usar un nuevo identificador en cada reintento.
  },
};
```

Resultado completado actual: `{ estado: 'COMPLETADO', estadoFiscal: 'SIMULADO', simulado: true, operacionId, serie: 'PRUEBA', numero, fechaEmision, documentos: [{ tipo: 'XML', contenido }, { tipo: 'CDR', contenido }] }`. El contrato ejecutable esta en resultado-emision.validator.js: valida identidad de operacion, fecha, numeracion y ambos documentos. Las respuestas incompletas no habilitan PDF ni correo.

El resultado se guarda en resultado_emision antes de preparar el PDF. A partir de ese commit, la recuperacion de documentos no llama al proveedor. Si el proceso se interrumpe antes del commit, el siguiente intento consulta/reconcilia la misma operacion.

Al integrar el proveedor real, ampliar el resultado normalizado y su validador con estados fiscales, codigo, mensaje, identificadores externos y referencias durables de documentos originales. Actualizar tambien documentos.service.js y la plantilla, que actualmente exigen simulacion. No habilitar un proveedor real modificando solo una variable de ambiente. Documentar y probar el cambio de contrato y la politica para boletas/resumenes.

Distinguir claramente recepcion del proveedor, documento generado, presentacion y resultado fiscal. La modalidad seleccionada puede requerir tickets y consultas asincronas; no mapear HTTP 200 a aceptacion fiscal.

## Documentos

El simulador prepara su XML y CDR en documento-simulado.service.js. documentos.service.js obtiene esos originales del resultado persistido y coordina el PDF; pdf.service.js utiliza templates/comprobante-prueba.js, version simulado-v2. archivo.service.js solo ofrece save(clave, bytes) y read(metadata). Consultar DOCUMENTOS_Y_EMISION.md para estados, compatibilidad e intercambio del motor por HTML/CSS.

El equipo fiscal debe obtener/validar los XML firmados y constancias aplicables. El PDF debe usar exactamente los datos fiscales persistidos. No modificar XML firmado para acomodarlo a una plantilla ni usar el hash SHA-256 del archivo como valor resumen fiscal. Conservar almacenamiento por clave logica, metadatos y verificacion de integridad, sin dependencia de un PSE particular.

## Reglas obligatorias del adaptador real

- Consultar/reconciliar antes de repetir una operacion cuyo resultado es incierto.
- Si una consulta falla, no interpretarla como inexistencia y no emitir por segunda vez.
- Establecer timeout y clasificar errores temporales, rechazos y resultados inciertos.
- Respetar limites de solicitudes del proveedor y dimensionar concurrencia global.
- Definir responsable de asignar series y correlativos, con reserva atomica. No usar MAX(numero)+1.
- Evitar exponer XML con datos personales, claves o certificados en logs.
- Mantener secretos fuera del repositorio y del frontend.

## Antes de produccion

Resolver con SERNANP/PSE: identificacion del emisor, modalidad de emision, autenticacion, certificados, estructura fiscal, afectaciones, gratuidades, redondeos, plazos, anulaciones, notas, datos requeridos y conservacion de documentos. Ejecutar pruebas del ambiente fiscal correspondiente.

Incorporar pruebas de contrato para que exito, rechazo, demora, timeout, duplicado y consulta posterior funcionen con el mismo coordinador. Probar reinicios reales con PostgreSQL y varias instancias. La habilitacion de produccion requiere una tarea explicita que retire el bloqueo actual despues de completar estas condiciones.

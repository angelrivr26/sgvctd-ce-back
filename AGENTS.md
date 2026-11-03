# Instrucciones del proyecto Comprobantes

- Mantener Node.js / Express con JavaScript ESM y las carpetas routes, controllers, services, models y database.
- Toda modificacion de backend-comprobantes o frontend-comprobantes debe registrar alcance, motivo, validacion y limitaciones en backend-comprobantes/BITACORA.md en el mismo cambio.
- No modificar los proyectos existentes de Boletos sin una tarea especifica. Integrarse mediante contratos HTTP versionados.
- El proveedor fiscal inicial es un simulador. No declarar emision SUNAT real ni documentos fiscalmente validos.
- Los datos del emisor y las reglas contables provienen del contrato de entrada; no inferir tasas fiscales.
- Mantener separados recepcion, emision, documentos, correo y notificacion a Boletos.
- Guardar trabajos antes de responder que fueron recibidos. Idempotencia, reservas con vencimiento y reintentos deben conservarse.
- No mantener transacciones de BD durante llamadas de red o generacion de archivos.
- Usar pruebas de negocio, contratos, concurrencia y recuperacion; ejecutar npm test y npm run check. Ejecutar auditoria al cambiar dependencias.
- Mantener package-lock.json. No usar npm audit fix --force ni overrides sin justificar y verificar compatibilidad.
- No almacenar credenciales, documentos ni datos reales en archivos versionados.

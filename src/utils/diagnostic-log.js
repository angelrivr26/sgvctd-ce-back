const limitedText = (value, maxLength) => String(value).slice(0, maxLength);

/** Contexto tecnico acotado: nunca incluye payloads, XML, CDR ni credenciales. */
export function diagnosticError(error) {
  return {
    error: limitedText(error?.code || error?.name || 'ERROR_LOCAL', 80),
    mensaje: limitedText(error?.message || 'Error sin mensaje.', 1000),
    ...(error?.syscall ? { syscall: limitedText(error.syscall, 80) } : {}),
    ...(error?.path ? { rutaError: limitedText(error.path, 1000) } : {}),
    ...(error?.stack ? { traza: limitedText(error.stack, 4000) } : {}),
  };
}

/** Emite una linea JSON para que Docker pueda conservar y filtrar cada etapa. */
export function diagnosticLog(logger, level, event, context = {}) {
  const output = JSON.stringify({
    fecha: new Date().toISOString(),
    nivel: level,
    evento: event,
    ...context,
  });
  const writer = logger?.[level] ?? logger?.log ?? console[level] ?? console.log;
  writer.call(logger ?? console, output);
}

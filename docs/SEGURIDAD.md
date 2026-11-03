# Dependencias y seguridad inicial

Fecha de referencia: 2026-10-30 (Lima).

## Versiones seleccionadas

- Node.js 24.22.2 LTS, copia portable local comprobada con SHASUMS256 oficial.
- Angular 22.2.4; CLI/build 22.2.5; TypeScript 6.0.3.
- Express 5.3.0, Sequelize 6.37.8, pg 8.23.1, PGlite 0.5.13.
- Versiones exactas y lockfiles separados para backend y frontend.

Se conserva la estructura de Boletos sin heredar automaticamente sus versiones anteriores. Referencias: [soporte de Node](https://nodejs.org/en/about/previous-releases), [compatibilidad Angular](https://angular.dev/reference/versions).

## Correccion aplicada

La instalacion inicial del backend detecto uuid vulnerable como dependencia de Sequelize, con dos entradas de severidad moderada (uuid y el efecto sobre Sequelize). Se aplico un override **solo a uuid dentro de Sequelize**, version 11.1.1.

El [aviso GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) identifica esa version como corregida. Se reviso que Sequelize usa v1/v4 y se agrego una prueba de compatibilidad para ambas funciones. No se aplico la degradacion automatica sugerida por npm ni audit fix --force.

Las auditorias posteriores de instalacion informaron **cero vulnerabilidades conocidas** en ambos proyectos. Esto es una observacion del registro npm en ese momento, no una garantia de ausencia de fallas futuras o de errores propios del codigo.

## Medidas iniciales

- Claves aleatorias locales, hash scrypt y credencial de integracion separada.
- Cookies HttpOnly, SameSite=Strict, expiracion y verificacion de origen para acciones humanas.
- Limites de login y solicitudes; cuerpos JSON acotados y validados.
- Consultas SQL parametrizadas, descarga autenticada y rutas construidas desde claves internas.
- Validacion de integridad de archivos y respuestas sin trazas, claves ni payloads personales.
- Sin datos reales de Boletos ni envio de correo externo por defecto.

## Mantenimiento

Ejecutar npm ci y npm audit --audit-level=low en ambos proyectos. Ante cambios de dependencias, revisar avisos, compatibilidad y lockfiles, ejecutar pruebas/build y registrar resultado en BITACORA.md. Una auditoria sin avisos no sustituye revision de codigo, configuracion ni pruebas.

Con el Node portable incluido, `npm run audit:projects` consulta ambos proyectos y actualiza `docs/auditoria-dependencias.json`. Si el registro no responde, el comando falla en lugar de registrar cero avisos.

El acceso inicial es una cuenta de operador local. La gestion de varios usuarios y perfiles institucionales se debe incorporar cuando SERNANP defina su mecanismo de identidad.

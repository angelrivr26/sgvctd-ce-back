# Pruebas reales contra SUNAT beta

## Resultado del 2026-11-02, hora de Lima

Se efectuaron dos envios reales a https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService, con datos ficticios del emisor 20000000001, credenciales publicas MODDATOS y certificado autofirmado local de prueba. No se utilizaron credenciales SOL ni certificado real de SERNANP.

| Documento | Hora Lima | Referencia    | HTTP | Codigo CDR | Resultado     |
| --------- | --------- | ------------- | ---- | ---------- | ------------- |
| Factura   | 16:47:17  | F001-87787056 | 200  | 0          | ACEPTADO_BETA |
| Boleta    | 16:49:04  | B001-75206239 | 200  | 0          | ACEPTADO_BETA |

En ambos casos se obtuvo CDR XML dentro de ZIP, referencia concordante y sin observaciones. Se genero PDF despues de guardar la aceptacion. Evidencia resumida y hashes en sunat-beta-resultados.json; los archivos completos permanecen en .local/sunat-beta/ejecuciones/.

La primera respuesta de factura incluyo una carpeta dummy/ vacia en el ZIP. Se adapto el lector y se recupero la CDR ya recibida, sin segundo envio de factura. El snapshot se reconstruyo verificando igualdad exacta del XML firmado original por SHA-256. El ZIP del primer envio no se conservo antes del fallo inicial del lector; el XML firmado, SOAP de respuesta, CDR ZIP/XML y PDF si estan disponibles. El circuito actual guarda el ZIP antes del envio.

## Alcance

La conexion beta es real. El circuito se ejecuta por consola y esta separado del proveedor simulado de la aplicacion web. No modifica FISCAL_PROVIDER, no conecta con sgvcb, no crea compras en Boletos y no envia correos. No es aun un adaptador de emision para las compras recibidas por la API.

SUNAT indica que beta comprueba estructuras XML, no consistencia de datos. No es validacion tributaria integral, habilitacion para produccion ni homologacion del sistema. Esta prohibido usar beta para pruebas de carga o envios simultaneos masivos. Solo se realizaron los dos envios indicados; las pruebas automatizadas usan respuestas locales.

El XML de prueba declara expresamente una operacion ficticia de PEN 100.00 mas PEN 18.00 de impuesto. Estos importes no establecen reglas tributarias para SERNANP. El generador no acepta datos de compras reales, otro RUC o una URL de produccion.

## Configuracion por ambiente

El archivo .env del backend contiene:

```dotenv
SUNAT_ENV=beta
SUNAT_BETA_URL=https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService
SUNAT_PRODUCTION_URL=https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService
SUNAT_TIMEOUT_MS=30000
```

config/sunat.js carga y valida esta configuracion. La precedencia es overrides de codigo, entorno del proceso, .env y valores predeterminados. No modifica process.env ni conecta con BD. El servicio recibe endpoint y timeout por inyeccion, sin leer .env directamente.

SUNAT_ENV es independiente de NODE_ENV: el primero selecciona el ambiente fiscal; el segundo controla el ambiente de la aplicacion. FISCAL_PROVIDER=simulado sigue identificando el proveedor del worker web, que aun no usa el circuito beta.

El selector conoce beta y production, pero el adaptador de pruebas solo admite beta. Cambiar SUNAT_ENV=production detiene estos comandos antes de crear documentos o realizar llamadas HTTP. La URL productiva queda documentada para el futuro adaptador; no se envian comprobantes cambiando solamente una variable. Se rechazan URLs de otro ambiente, HTTP, credenciales en URL, consultas y destinos no oficiales. :443 explicito es equivalente a HTTPS sin puerto.

## Ejecutar desde la terminal de backend-comprobantes

Usar Node 24 de la configuracion VS Code del proyecto. Para el certificado se requiere OpenSSL; esta copia dispone del instalado con Git para Windows. En otro equipo instalar OpenSSL o configurar OPENSSL_BIN con su ruta. El certificado se crea en .local, nunca se versiona ni se utiliza en produccion.

```powershell
# Solo comprueba disponibilidad y guarda WSDL; no envia comprobantes.
npm run sunat:beta:diagnostico

# Prepara XML y verifica firma localmente; sin conexion externa.
npm run sunat:beta:preparar -- --tipo=FACTURA

# Cada comando envia UN comprobante ficticio al servicio beta.
npm run sunat:beta:enviar -- --tipo=FACTURA
npm run sunat:beta:enviar -- --tipo=BOLETA

# Relee la respuesta SOAP guardada y recupera documentos SIN llamadas HTTP.
npm run sunat:beta:recuperar -- 6fcfd9dd-ee43-46fc-ba1e-8458a66fa599
```

No ejecutar los comandos de envio en bucle ni en la suite automatizada. Cada ejecucion imprime carpeta, estado, codigo y referencia. PREPARADO_NO_ENVIADO es local; ACEPTADO_BETA requiere CDR con codigo 0 y referencia coincidente. Un HTTP 200 por si solo no se acepta como exito fiscal. Un rechazo o falla SOAP se conserva sin producir PDF.

Si se pierde la respuesta, queda RESULTADO_INCIERTO y no se reenvia automaticamente. Recuperar solo relee respuestas locales existentes: no consulta un estado remoto ni resuelve un timeout sin respuesta guardada. Antes de integrar la API y sus workers se debe implementar reconciliacion remota fiable para la modalidad escogida.

## Archivos y responsabilidades

- xml-ubl-prueba.service.js: fixtures limitados de factura y boleta UBL 2.1.
- firma-xml.service.js: firma RSA-SHA256 y verificacion local contra el certificado conocido; no confia en una clave sustituida desde KeyInfo.
- config/sunat.js: seleccion y validacion centralizada de ambiente, endpoints y timeout.
- sunat-beta.service.js: transporte beta con configuracion inyectada, WS-Security UsernameToken, ZIP, sendBill y lectura de CDR.
- utils/xml.js: parser con limites, rechazo de DTD/entidades y elementos duplicados cuando se espera uno.
- scripts/lib/certificado-beta.js: certificado autofirmado exclusivo de pruebas.
- scripts/lib/resultado-beta.js: guarda respuesta antes del PDF; plantilla beta-v1, sin validez tributaria.
- recuperar-sunat-beta.js: recuperacion documental offline por UUID de ejecucion.

Se comprueban SOAP Fault, HTTP, base64, limites ZIP/XML, nombre del archivo CDR, referencia y codigo. No se extraen rutas del ZIP al disco. La firma del XML de entrada se verifica localmente; no se implementa aun validacion criptografica de la firma de la CDR ni su cadena de confianza. La comunicacion usa HTTPS verificado, sin desactivar validacion TLS ni seguir redirecciones.

## Antes de incorporar beta al flujo web

Definir el contrato fiscal real con Contabilidad/SERNANP, series y correlativos persistentes, tratamiento de boletas/resumenes, datos adicionales y reconciliacion remota. Extender el resultado normalizado y las etiquetas de la interfaz para distinguir SIMULADO, ACEPTADO_BETA y los estados de produccion. Mantener los originales firmados y el mismo punto de recuperacion previo al PDF. El PDF beta actual es una representacion de prueba, sin QR fiscal.

## Referencias primarias

- [Pautas de autenticacion beta y certificado](https://orientacion.sunat.gob.pe/12-pautas-servicio-beta)
- [Alcance y restricciones de beta UBL 2.1](https://cpe.sunat.gob.pe/noticias/servicio-beta-para-realizar-pruebas-ubl-21)
- [Manual del programador](<https://cpe.sunat.gob.pe/sites/default/files/inline-files/manual_programador%20(1).pdf>)
- [Firma XML: xml-crypto](https://github.com/node-saml/xml-crypto)
- [ZIP: fflate](https://github.com/101arrowz/fflate)

import { loadSunatConfig } from '../src/config/sunat.js';
import { createSunatTransport } from '../src/services/sunat.service.js';

const result = await createSunatTransport({ config: loadSunatConfig() }).diagnose();
console.log(`SUNAT ${result.ambiente}: WSDL disponible.`);

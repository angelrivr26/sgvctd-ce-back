import { writeFile, mkdir } from 'node:fs/promises';
import { openApiDocument } from '../src/routes/openapi.js';

await mkdir('docs', { recursive: true });
await writeFile('docs/openapi.json', `${JSON.stringify(openApiDocument, null, 2)}\n`);
console.log('Contrato generado: docs/openapi.json');

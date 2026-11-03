import { writeFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { buildMigrationSql } from '../src/database/migration-sql.js';

const { values } = parseArgs({ options: { esquema: { type: 'string', default: 'comprobantes' } } });
const sql = await buildMigrationSql(values.esquema);
await mkdir('docs', { recursive: true });
await writeFile('docs/crear-tablas-comprobantes.sql', sql);
console.log(
  `Script generado para el esquema ${values.esquema}: docs/crear-tablas-comprobantes.sql. No se ejecutaron cambios en BD.`,
);

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/utils/security.js';

try {
  await access('.env');
  console.log('La configuracion .env ya existe; no se ha sobrescrito.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const password = randomBytes(18).toString('base64url');
  const integrationKey = randomBytes(32).toString('hex');
  const template = await readFile('.env.example', 'utf8');
  const configuration = template
    .replace(/^INTEGRATION_API_KEY=$/m, `INTEGRATION_API_KEY=${integrationKey}`)
    .replace(/^ADMIN_PASSWORD_HASH=$/m, `ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
  await mkdir('.local', { recursive: true });
  await writeFile('.env', configuration, { flag: 'wx', mode: 0o600 });
  await writeFile(
    '.local/ACCESO_LOCAL.md',
    `# Acceso al ambiente local de pruebas\n\nUsuario: contador\n\nClave: ${password}\n\nFrontend: http://localhost:4205\n\nNo versionar ni compartir este archivo. La clave de integracion esta en .env y nunca debe incluirse en el frontend.\n`,
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Configuracion creada. Consulte .local/ACCESO_LOCAL.md para ingresar. No comparta ese archivo.',
  );
}

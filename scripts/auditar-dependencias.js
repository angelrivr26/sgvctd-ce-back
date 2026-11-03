import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const report = {
  fechaLima: new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Lima',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date()),
  node: process.version,
  proyectos: [],
};
for (const [name, directory] of [
  ['backend-comprobantes', backend],
  ['frontend-comprobantes', resolve(backend, '../frontend-comprobantes')],
]) {
  const result = spawnSync(
    process.execPath,
    [npmCli, 'audit', '--json', '--cache', resolve(backend, '.local/npm-cache')],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.error)
    throw new Error(`No se pudo ejecutar la auditoria de ${name}: ${result.error.code}`);
  let audit;
  try {
    audit = JSON.parse(result.stdout);
  } catch {
    throw new Error(`El registro no devolvio un informe JSON valido para ${name}.`);
  }
  if (!audit.metadata?.vulnerabilities)
    throw new Error(`Auditoria no disponible para ${name}; no se reportara como libre de avisos.`);
  report.proyectos.push({
    proyecto: name,
    vulnerabilidades: audit.metadata.vulnerabilities,
    dependencias: audit.metadata.dependencies,
    avisos: audit.vulnerabilities,
  });
  console.log(`${name}: ${audit.metadata.vulnerabilities.total} vulnerabilidades conocidas`);
}
await writeFile(
  resolve(backend, 'docs/auditoria-dependencias.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
if (report.proyectos.some((project) => project.vulnerabilidades.total > 0)) process.exitCode = 1;

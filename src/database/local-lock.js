import { open, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/** PGlite es local: impedir dos procesos sobre el mismo directorio. */
export async function acquireLocalLock(directory) {
  const path = `${directory}.comprobantes.lock`;
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(path, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify({ pid: process.pid, token }));
      } finally {
        await file.close();
      }
      return async () => {
        try {
          const current = JSON.parse(await readFile(path, 'utf8'));
          if (current.token === token) await unlink(path);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try {
        owner = JSON.parse(await readFile(path, 'utf8'));
      } catch {
        throw new Error(
          'La reserva de PGlite requiere revision; no se abrira el directorio simultaneamente.',
        );
      }
      if (!Number.isInteger(owner.pid) || owner.pid <= 0)
        throw new Error('La reserva local de PGlite no es valida.');
      let alive = true;
      try {
        process.kill(owner.pid, 0);
      } catch (probeError) {
        if (probeError.code === 'ESRCH') alive = false;
      }
      if (alive)
        throw new Error(
          'Otro proceso usa esta base PGlite. Detengalo o use PostgreSQL para varias instancias.',
        );
      await unlink(path);
    }
  }
  throw new Error('No se pudo reservar la base PGlite local.');
}

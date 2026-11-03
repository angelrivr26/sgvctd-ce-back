import { mkdir, writeFile, rename, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { digest } from '../utils/security.js';
import { AppError } from '../utils/errors.js';

/** Almacenamiento local. No conoce proveedores, plantillas ni reglas fiscales. */
export function createArchivoService(directory) {
  const root = resolve(directory);
  function safePath(key) {
    const file = resolve(root, key);
    const difference = relative(root, file);
    if (!difference || difference.startsWith('..') || isAbsolute(difference))
      throw new AppError(400, 'RUTA_INVALIDA', 'Documento no valido.');
    return file;
  }
  return {
    async save(key, content) {
      const bytes = Buffer.from(content);
      const path = safePath(key);
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, bytes, { flag: 'wx' });
        await rename(temporary, path);
      } finally {
        await unlink(temporary).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
      return { clave: key, sha256: digest(bytes), bytes: bytes.length };
    },
    async read(document) {
      let content;
      try {
        content = await readFile(safePath(document.clave));
      } catch (error) {
        if (error.code === 'ENOENT')
          throw new AppError(
            503,
            'ARCHIVO_NO_DISPONIBLE',
            'El documento no esta disponible en el almacenamiento.',
          );
        throw error;
      }
      if (digest(content) !== document.sha256)
        throw new AppError(
          503,
          'INTEGRIDAD_DOCUMENTO',
          'El documento requiere verificacion de integridad.',
        );
      return content;
    },
  };
}

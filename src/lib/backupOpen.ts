import { unzipSync } from 'fflate';
import type { AllData } from './exportAll';

/** Debe coincidir con scripts/backup.mjs. */
const PBKDF2_ITERATIONS = 310_000;
const MAGIC = 'GR1B';

export interface OpenedBackup {
  exportadoEl: string;
  colecciones: AllData;
}

/** El artifact de GitHub se baja como .zip: si viene así, saca el .gr1b de adentro. */
function extract(bytes: Uint8Array): Uint8Array {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes);
    const name = Object.keys(files).find((n) => n.endsWith('.gr1b'));
    if (!name) throw new Error('El .zip no tiene ninguna copia de seguridad (.gr1b).');
    return files[name];
  }
  return bytes;
}

/** Descifra y descomprime una copia hecha por scripts/backup.mjs. */
export async function openBackup(data: ArrayBuffer | Uint8Array, password: string): Promise<OpenedBackup> {
  const bytes = extract(data instanceof Uint8Array ? data : new Uint8Array(data));
  if (new TextDecoder().decode(bytes.slice(0, 4)) !== MAGIC || bytes[4] !== 1) {
    throw new Error('Este archivo no es una copia de seguridad de la app.');
  }
  const salt = bytes.slice(5, 21);
  const iv = bytes.slice(21, 33);
  const encrypted = bytes.slice(33);
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  let gz: ArrayBuffer;
  try {
    gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  } catch {
    throw new Error('Contraseña incorrecta (o el archivo está dañado).');
  }
  const text = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(text) as OpenedBackup;
}

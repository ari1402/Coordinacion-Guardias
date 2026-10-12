/// <reference types="node" />
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { openBackup } from './backupOpen';

// Cifra igual que scripts/backup.mjs.
function encrypt(payload: object, password: string): Uint8Array {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, 310_000, 32, 'sha256');
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(gzipSync(JSON.stringify(payload))), c.final(), c.getAuthTag()]);
  return new Uint8Array(Buffer.concat([Buffer.from('GR1B'), Buffer.from([1]), salt, iv, enc]));
}

describe('copia de seguridad', () => {
  const data = { exportadoEl: '2026-10-12T00:00:00Z', colecciones: { shifts: [{ id: 'a', date: '2026-11-01' }] } };

  it('se abre con la contraseña correcta (también dentro del .zip de GitHub)', async () => {
    const file = encrypt(data, 'clave secreta');
    expect(await openBackup(file, 'clave secreta')).toEqual(data);
    const zip = zipSync({ 'guardias-backup-2026-10-12.gr1b': file });
    expect((await openBackup(zip, 'clave secreta')).colecciones.shifts).toHaveLength(1);
  });

  it('con otra contraseña no se puede leer', async () => {
    await expect(openBackup(encrypt(data, 'clave secreta'), 'otra')).rejects.toThrow(/Contraseña incorrecta/);
  });
});

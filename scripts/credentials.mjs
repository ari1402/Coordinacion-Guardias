import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Cuenta de servicio de Firebase: desde el secret FIREBASE_SERVICE_ACCOUNT
 * (GitHub Actions) o, corriendo local, desde scripts/serviceAccountKey.json.
 */
export function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const path = join(dirname(fileURLToPath(import.meta.url)), 'serviceAccountKey.json');
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    console.error('Falta la cuenta de servicio: definí FIREBASE_SERVICE_ACCOUNT o guardá scripts/serviceAccountKey.json.');
    process.exit(1);
  }
}

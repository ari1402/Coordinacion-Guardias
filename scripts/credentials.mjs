import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Cuenta de servicio de Firebase: desde el secret FIREBASE_SERVICE_ACCOUNT
 * (GitHub Actions) o, corriendo local, desde scripts/serviceAccountKey.json.
 */
export function loadServiceAccount() {
  let sa;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.trim());
    } catch {
      fail('El secret FIREBASE_SERVICE_ACCOUNT no es un JSON válido: pegá el contenido completo del archivo, de { a }.');
    }
  } else {
    const path = join(dirname(fileURLToPath(import.meta.url)), 'serviceAccountKey.json');
    try {
      sa = JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      fail('Falta la cuenta de servicio: definí FIREBASE_SERVICE_ACCOUNT o guardá scripts/serviceAccountKey.json.');
    }
  }

  // Al copiar y pegar, los saltos de línea de la clave a veces quedan como
  // el texto "\n" (o con \r de Windows): se normalizan acá.
  const key = String(sa.private_key ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '')
    .trim();
  if (!key.startsWith('-----BEGIN PRIVATE KEY-----') || !key.endsWith('-----END PRIVATE KEY-----')) {
    fail('La clave privada del secret está incompleta o modificada: copiá el archivo JSON tal cual lo bajaste de Firebase.');
  }
  sa.private_key = `${key}\n`;
  return sa;
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

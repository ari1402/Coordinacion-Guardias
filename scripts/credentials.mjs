import { createPrivateKey } from 'node:crypto';
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

  // Al copiar y pegar (sobre todo desde un chat), la clave puede llegar con
  // "\n" literales, saltos de Windows o espacios metidos en el medio. Se
  // reconstruye el PEM con solo los caracteres base64 y se valida.
  const raw = String(sa.private_key ?? '').replace(/\\n/g, '\n');
  const m = raw.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  if (!m) fail('La clave privada del secret está incompleta: copiá el archivo JSON tal cual lo bajaste de Firebase.');
  const body = m[1].replace(/[^A-Za-z0-9+/=]/g, '');
  sa.private_key = `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  try {
    createPrivateKey(sa.private_key);
  } catch {
    fail(
      `La clave privada del secret está dañada (${body.length} caracteres útiles; una clave de Firebase tiene 1624). ` +
        'Reemplazá el secret pegando el contenido del archivo .json descargado de Firebase, abierto con un editor de texto.',
    );
  }
  return sa;
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

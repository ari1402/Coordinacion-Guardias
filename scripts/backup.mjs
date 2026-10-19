#!/usr/bin/env node
// Copia de seguridad de toda la base, cifrada (GitHub Actions, ver
// .github/workflows/backup.yml). El repositorio es público, así que el archivo
// se cifra con BACKUP_PASSWORD (AES-256-GCM, clave derivada con PBKDF2): sin
// la contraseña no se puede leer. Se abre desde la app: Admin → Exportar todo →
// "Abrir una copia de seguridad".
//
// Formato: "GR1B" | versión (1 byte) | sal (16) | iv (12) | datos gzip cifrados + tag (16)

import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadServiceAccount } from './credentials.mjs';

const PBKDF2_ITERATIONS = 310_000;
const COLLECTIONS = [
  'residents', 'shifts', 'requests', 'swaps', 'offers', 'raffles', 'acks', 'publications', 'feedback',
  'rotations', 'events', 'calendarDays', 'monthConfigs', 'scheduleDrafts', 'privateNotes', 'tasks',
  'notes', 'links', 'activity', 'meta', 'trades', 'hibaRequests', 'hibaAcks',
];

const password = process.env.BACKUP_PASSWORD;
if (!password) {
  console.log('::error::Falta el secret BACKUP_PASSWORD: sin contraseña no se hace la copia (el repo es público).');
  process.exit(1);
}

initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();

const colecciones = {};
for (const name of COLLECTIONS) {
  colecciones[name] = (await db.collection(name).get()).docs.map((d) => ({ ...d.data(), id: d.id }));
}
const now = new Date();
const payload = JSON.stringify({ exportadoEl: now.toISOString(), app: 'Guardias R1', colecciones });

const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
const cipher = createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(gzipSync(payload)), cipher.final(), cipher.getAuthTag()]);
const file = Buffer.concat([Buffer.from('GR1B'), Buffer.from([1]), salt, iv, encrypted]);

const stamp = now.toISOString().slice(0, 10);
mkdirSync('backup', { recursive: true });
writeFileSync(`backup/guardias-backup-${stamp}.gr1b`, file);
const total = Object.values(colecciones).reduce((a, l) => a + l.length, 0);
console.log(`Copia del ${stamp}: ${total} documentos, ${(file.length / 1024).toFixed(0)} KB cifrados.`);
process.exit(0);

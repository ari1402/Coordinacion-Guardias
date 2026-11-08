#!/usr/bin/env node
// Migración v8 (una sola vez, marca en meta/migrations.v8): la regla provisoria
// de Navidad 2026 (v7) se extiende al finde siguiente (sábado 26 y domingo
// 27/12): solo las de vacaciones en enero. Cada residente se reconoce por el
// hash de su mail (nada personal queda escrito en el código).

import { createHash } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadServiceAccount } from './credentials.mjs';

// sha256(mail en minúsculas)
const VAC_ENERO = ['79326a1a7af70a6e18388a2f0493ae32f7409a9049bfc38724df794f50dc92a0', 'ac8474da820c1f338dfb4fa99e25105662175612fee6df5d22533da14e66b45b', '630ceab8584c078e2b1915ea33c18fa820bf794d20de4c0bb72d04a87099ea12'];
const DAYS = ['2026-12-26', '2026-12-27'];
const NOTE = 'Navidad (finde): las de vacaciones en enero';

initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();
const marker = db.collection('meta').doc('migrations');
if ((await marker.get()).data()?.v8) {
  console.log('Migración v8 ya aplicada, nada que hacer.');
  process.exit(0);
}
const hash = (s) => createHash('sha256').update((s ?? '').trim().toLowerCase()).digest('hex');
const idByHash = new Map((await db.collection('residents').get()).docs.map((d) => [hash(d.get('email')), d.id]));
const missing = VAC_ENERO.filter((x) => !idByHash.has(x)).length;
if (missing) {
  console.log(`::warning::Migración v8: no encontré a ${missing} residente(s); no se aplicó (se reintenta en el próximo deploy).`);
  process.exit(0);
}
for (const date of DAYS) {
  await db.collection('calendarDays').doc(date).set(
    { id: date, date, onlyResidents: VAC_ENERO.map((x) => idByHash.get(x)), presetResidents: [], onlyNote: NOTE },
    { merge: true },
  );
}
await marker.set({ v8: new Date().toISOString() }, { merge: true });
console.log(`Migración v8 aplicada: regla de Navidad extendida a ${DAYS.length} días.`);
process.exit(0);

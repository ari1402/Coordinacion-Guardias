#!/usr/bin/env node
// Migración v7 (una sola vez, marca en meta/migrations.v7): regla provisoria
// de fiestas de diciembre 2026, guardada en los días del calendario
// (onlyResidents / presetResidents, ver CalendarDay). Navidad (24 y 25/12): las
// de vacaciones en enero, más una admin fija el 24. Año nuevo (31/12 y 1/1):
// la misma admin fija el 31 y las de vacaciones en febrero. Cada residente se
// reconoce por el hash de su mail (nada personal queda escrito en el código).

import { createHash } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadServiceAccount } from './credentials.mjs';

// sha256(mail en minúsculas)
const FIJA = 'c6c9e3175302a1c0cf08097f33703b21995d86a1a470371482c98a713305dbda';
const VAC_ENERO = ['79326a1a7af70a6e18388a2f0493ae32f7409a9049bfc38724df794f50dc92a0', 'ac8474da820c1f338dfb4fa99e25105662175612fee6df5d22533da14e66b45b', '630ceab8584c078e2b1915ea33c18fa820bf794d20de4c0bb72d04a87099ea12'];
const VAC_FEBRERO = ['0a5453ce306325f645f11a3bda3368ede61f98eaa3261a60f15bd97e84acb14b', '29f01f51a7b25df91c080476a859bebfe78acb993b668836ec396fd73fc38800', 'e8ba4f36f84a08c573c528a7b0407e6f5c0e479dcde183b1b4e542489d2a61c3'];

const DAYS = [
  { date: '2026-12-24', only: [FIJA, ...VAC_ENERO], preset: [FIJA], note: 'Navidad: las de vacaciones en enero + una fija' },
  { date: '2026-12-25', only: VAC_ENERO, preset: [], note: 'Navidad: las de vacaciones en enero' },
  { date: '2026-12-31', only: [FIJA, ...VAC_FEBRERO], preset: [FIJA], note: 'Año nuevo: las de vacaciones en febrero + una fija' },
  { date: '2027-01-01', only: VAC_FEBRERO, preset: [], note: 'Año nuevo: las de vacaciones en febrero' },
];

initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();
const marker = db.collection('meta').doc('migrations');
if ((await marker.get()).data()?.v7) {
  console.log('Migración v7 ya aplicada, nada que hacer.');
  process.exit(0);
}
const hash = (s) => createHash('sha256').update((s ?? '').trim().toLowerCase()).digest('hex');
const idByHash = new Map((await db.collection('residents').get()).docs.map((d) => [hash(d.get('email')), d.id]));
const all = [FIJA, ...VAC_ENERO, ...VAC_FEBRERO];
const missing = all.filter((x) => !idByHash.has(x)).length;
if (missing) {
  console.log(`::warning::Migración v7: no encontré a ${missing} residente(s); no se aplicó (se reintenta en el próximo deploy).`);
  process.exit(0);
}
const ids = (list) => list.map((x) => idByHash.get(x));
for (const d of DAYS) {
  await db.collection('calendarDays').doc(d.date).set(
    { id: d.date, date: d.date, onlyResidents: ids(d.only), presetResidents: ids(d.preset), onlyNote: d.note },
    { merge: true },
  );
}
await marker.set({ v7: new Date().toISOString() }, { merge: true });
console.log(`Migración v7 aplicada: regla de fiestas en ${DAYS.length} días.`);
process.exit(0);

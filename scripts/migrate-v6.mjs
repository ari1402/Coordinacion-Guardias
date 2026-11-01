#!/usr/bin/env node
// Migración v6 (una sola vez, marca en meta/migrations.v6): carril nuevo
// "PQI/QC" en la planilla de carriles (un mes por residente, entre junio y
// agosto 2027, donde antes decía QC). Cada residente se reconoce por el hash
// de su mail (así nada personal queda escrito en el código). Solo cambia la
// celda si todavía dice QC: si una admin ya la editó a mano, la respeta.

import { createHash } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { loadServiceAccount } from './credentials.mjs';

/** sha256(mail en minúsculas) → mes que pasa a PQI/QC. */
const PQI = new Map([
  ['c6c9e3175302a1c0cf08097f33703b21995d86a1a470371482c98a713305dbda', '2027-06'],
  ['79326a1a7af70a6e18388a2f0493ae32f7409a9049bfc38724df794f50dc92a0', '2027-08'],
  ['0a5453ce306325f645f11a3bda3368ede61f98eaa3261a60f15bd97e84acb14b', '2027-07'],
  ['29f01f51a7b25df91c080476a859bebfe78acb993b668836ec396fd73fc38800', '2027-06'],
  ['ac8474da820c1f338dfb4fa99e25105662175612fee6df5d22533da14e66b45b', '2027-08'],
  ['630ceab8584c078e2b1915ea33c18fa820bf794d20de4c0bb72d04a87099ea12', '2027-07'],
  ['e8ba4f36f84a08c573c528a7b0407e6f5c0e479dcde183b1b4e542489d2a61c3', '2027-07'],
]);

initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();
const marker = db.collection('meta').doc('migrations');
if ((await marker.get()).data()?.v6) {
  console.log('Migración v6 ya aplicada, nada que hacer.');
  process.exit(0);
}
const hash = (s) => createHash('sha256').update((s ?? '').trim().toLowerCase()).digest('hex');
let changed = 0;
let kept = 0;
for (const d of (await db.collection('residents').get()).docs) {
  const month = PQI.get(hash(d.get('email')));
  if (!month) continue;
  const ref = db.collection('rotations').doc(d.id);
  const current = (await ref.get()).data()?.months?.[month];
  if (current !== undefined && current !== 'QC') {
    kept++;
    continue;
  }
  await ref.set({ id: d.id, months: { [month]: 'PQI/QC' }, updatedAt: new Date().toISOString() }, { merge: true });
  changed++;
}
await marker.set({ v6: new Date().toISOString() }, { merge: true });
console.log(`Migración v6 aplicada: ${changed} carriles pasados a PQI/QC${kept ? `, ${kept} respetados (ya editados a mano)` : ''}.`);
process.exit(0);

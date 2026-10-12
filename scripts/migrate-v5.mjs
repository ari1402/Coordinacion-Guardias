#!/usr/bin/env node
// Migración v5 (una sola vez, marca en meta/migrations.v5): el aviso del día 10
// ("toca generar las guardias") deja de estar configurado con un mail en el
// código y pasa a ser una opción de cada residente (Admin → Residentes →
// "Aviso del día 10"). Se tilda para quien lo recibía hasta ahora, que se
// reconoce por el hash de su mail (así el mail no queda escrito en el código).

import { createHash } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadServiceAccount } from './credentials.mjs';

const RECIBIA_EL_AVISO = 'c6c9e3175302a1c0cf08097f33703b21995d86a1a470371482c98a713305dbda';

initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();
const marker = db.collection('meta').doc('migrations');
if ((await marker.get()).data()?.v5) {
  console.log('Migración v5 ya aplicada, nada que hacer.');
  process.exit(0);
}
const hash = (s) => createHash('sha256').update((s ?? '').trim().toLowerCase()).digest('hex');
for (const d of (await db.collection('residents').get()).docs) {
  if (hash(d.get('email')) !== RECIBIA_EL_AVISO) continue;
  await d.ref.update({ avisoGenerar: true });
  console.log('Aviso del día 10: tildado para 1 residente');
}
await marker.set({ v5: new Date().toISOString() }, { merge: true });
console.log('Migración v5 aplicada.');
process.exit(0);

#!/usr/bin/env node
// Corre cada 10 minutos (GitHub Actions, ver .github/workflows/notificaciones.yml)
// y manda los push que dispara la app:
//   - Se publicó (o republicó) un mes → a quienes les cambió alguna guardia:
//     que las pidan en HIBA 2 y confirmen en la app si están OK.
//   - Alguien dijo que NO está OK con sus guardias → a las admins.
// Cada aviso se manda una sola vez (queda marcado notified = true).

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadServiceAccount } from './credentials.mjs';
import { APP_URL, monthLabel, pushTo } from './push.mjs';

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.log('::error::Falta el secret FIREBASE_SERVICE_ACCOUNT.');
  process.exit(1);
}
initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();

const residents = new Map((await db.collection('residents').get()).docs.map((d) => [d.id, d.data()]));
let sent = 0;

// 1. Publicaciones nuevas
for (const pub of (await db.collection('publications').where('notified', '==', false).get()).docs) {
  const { lastAffected = [] } = pub.data();
  const month = monthLabel(pub.id);
  for (const id of lastAffected) {
    if (residents.get(id)?.active === false) continue;
    const n = await pushTo(db, id, {
      title: `📅 Se publicaron las guardias de ${month}`,
      body: 'Pedí tus guardias en HIBA 2 y confirmá en la app si estás OK con las que te tocaron.',
      url: `${APP_URL}#/`,
      tag: `publicado-${pub.id}`,
    });
    console.log(`Publicación ${pub.id} → ${residents.get(id)?.shortName ?? id}: ${n} push`);
    sent += n;
  }
  await pub.ref.update({ notified: true });
}

// 2. Pedidos de corrección (no están OK) → admins
const admins = [...residents].filter(([, r]) => r.role === 'admin' && r.active !== false).map(([id]) => id);
for (const ack of (await db.collection('acks').where('notified', '==', false).get()).docs) {
  const a = ack.data();
  if (!a.ok) {
    const who = residents.get(a.residentId)?.name ?? a.residentId;
    for (const id of admins) {
      const n = await pushTo(db, id, {
        title: `⚠️ ${who} no está OK con sus guardias de ${monthLabel(a.month)}`,
        body: a.comment || 'Pidió una corrección.',
        url: `${APP_URL}#/admin?tab=conformidad`,
        tag: `ack-${ack.id}`,
      });
      console.log(`Corrección de ${who} (${a.month}) → admin ${residents.get(id)?.shortName}: ${n} push`);
      sent += n;
    }
  }
  await ack.ref.update({ notified: true });
}

console.log(`Listo: ${sent} push enviados.`);
process.exit(0);

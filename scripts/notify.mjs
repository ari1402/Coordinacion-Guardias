#!/usr/bin/env node
// Corre cada 10 minutos (GitHub Actions, ver .github/workflows/notificaciones.yml)
// y manda los push que dispara la app:
//   - Se publicó (o republicó) un mes → a quienes les cambió alguna guardia:
//     que las pidan en HIBA 2 y confirmen en la app si están OK.
//   - Alguien dijo que NO está OK con sus guardias → a las admins.
//   - "Ofrezco mi guardia" / "Busco cambio": nueva → a todas; la tomaron → a quien la publicó.
//   - Intercambio propuesto → a quien lo recibe; aceptado o rechazado → a quien lo propuso.
//   - Pedido de cargar un mes en HIBA 2 → a quienes tienen guardias ese mes y no confirmaron.
// Cada aviso se manda una sola vez (queda marcado notified = true).
// Los logs de Actions son públicos: no se imprimen nombres, solo cantidades.

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
    console.log(`Publicación ${pub.id}: ${n} push`);
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
      console.log(`Pedido de corrección (${a.month}) → una admin: ${n} push`);
      sent += n;
    }
  }
  await ack.ref.update({ notified: true });
}

// 3. Guardias ofrecidas
const dayLabel = (iso) => {
  const wd = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${wd} ${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
};
for (const off of (await db.collection('offers').where('notifiedOpen', '==', false).get()).docs) {
  const o = off.data();
  if (o.status === 'abierta') {
    const who = residents.get(o.fromResidentId)?.shortName ?? 'Alguien';
    const busco = o.kind === 'busco';
    for (const [id, r] of residents) {
      if (id === o.fromResidentId || r.active === false) continue;
      sent += await pushTo(db, id, {
        title: busco ? `🔄 ${who} busca cambio para su guardia del ${dayLabel(o.date)}` : `🤝 ${who} ofrece su guardia del ${dayLabel(o.date)}`,
        body: busco
          ? `${o.note ? `“${o.note}”. ` : ''}Si te sirve, proponele una tuya a cambio en Cambios.`
          : o.note ? `“${o.note}”. Si la querés, tomala en Cambios.` : 'Si la querés, tomala en Cambios.',
        url: `${APP_URL}#/cambios`,
        tag: `oferta-${off.id}`,
      });
    }
    console.log(`Oferta ${o.date}: avisada`);
  }
  await off.ref.update({ notifiedOpen: true });
}
for (const off of (await db.collection('offers').where('notifiedTaken', '==', false).where('status', '==', 'tomada').get()).docs) {
  const o = off.data();
  const taker = residents.get(o.takenBy)?.shortName ?? 'Alguien';
  sent += await pushTo(db, o.fromResidentId, {
    title: `✅ ${taker} tomó tu guardia del ${dayLabel(o.date)}`,
    body: 'Ya quedó registrado el cambio. Acordate de actualizarlo en HIBA 2.',
    url: `${APP_URL}#/cambios`,
    tag: `oferta-tomada-${off.id}`,
  });
  console.log(`Oferta ${o.date} tomada: avisado`);
  await off.ref.update({ notifiedTaken: true });
}

// 4. Intercambios
for (const tr of (await db.collection('trades').where('notifiedNew', '==', false).get()).docs) {
  const t = tr.data();
  if (t.status === 'propuesto') {
    const who = residents.get(t.fromResidentId)?.shortName ?? 'Alguien';
    sent += await pushTo(db, t.toResidentId, {
      title: `🔁 ${who} te propone un intercambio`,
      body: `Te da su guardia del ${dayLabel(t.fromDate)} y se queda con tu ${dayLabel(t.toDate)}. Respondé en Cambios.`,
      url: `${APP_URL}#/cambios`,
      tag: `intercambio-${tr.id}`,
    });
    console.log(`Intercambio propuesto (${t.fromDate} ⇄ ${t.toDate}): avisado`);
  }
  await tr.ref.update({ notifiedNew: true });
}
for (const tr of (await db.collection('trades').where('notifiedResolved', '==', false).where('status', 'in', ['aceptado', 'rechazado', 'cancelado']).get()).docs) {
  const t = tr.data();
  if (t.status !== 'cancelado') {
    const who = residents.get(t.toResidentId)?.shortName ?? 'Alguien';
    const ok = t.status === 'aceptado';
    sent += await pushTo(db, t.fromResidentId, {
      title: ok ? `✅ ${who} aceptó el intercambio` : `${who} no aceptó el intercambio`,
      body: ok
        ? `Ahora hacés la del ${dayLabel(t.toDate)} y ${who} la del ${dayLabel(t.fromDate)}. Acordate de actualizarlo en HIBA 2.`
        : `Tu guardia del ${dayLabel(t.fromDate)} sigue siendo tuya.`,
      url: `${APP_URL}#/cambios`,
      tag: `intercambio-${tr.id}`,
    });
    console.log(`Intercambio ${t.status}: avisado`);
  }
  await tr.ref.update({ notifiedResolved: true });
}

// 5. Cargar las guardias en HIBA 2 → a quienes tienen guardias ese mes y no confirmaron
for (const req of (await db.collection('hibaRequests').where('notified', '==', false).get()).docs) {
  const month = req.id;
  const owners = new Set(
    (await db.collection('shifts').where('date', '>=', `${month}-01`).where('date', '<=', `${month}-31`).get()).docs
      .map((d) => d.data())
      .filter((s) => s.status !== 'cancelada')
      .map((s) => s.actualResidentId),
  );
  const done = new Set(
    (await db.collection('hibaAcks').where('month', '==', month).get()).docs.map((d) => d.data().residentId),
  );
  let n = 0;
  for (const id of owners) {
    if (done.has(id) || residents.get(id)?.active === false) continue;
    n += await pushTo(db, id, {
      title: `📋 Pedí tus guardias de ${monthLabel(month)} en HIBA 2`,
      body: 'Cuando las tengas pedidas, marcalo en el Inicio de la app (“Ya las pedí”).',
      url: `${APP_URL}#/`,
      tag: `hiba-${month}`,
    });
  }
  console.log(`HIBA 2 ${month}: ${n} push`);
  sent += n;
  await req.ref.update({ notified: true });
}

console.log(`Listo: ${sent} push enviados.`);
process.exit(0);

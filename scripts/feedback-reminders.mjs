#!/usr/bin/env node
// Corre todos los días a las 8 AM (GitHub Actions, ver
// .github/workflows/feedback-reminder.yml). A quien hizo guardia ayer y todavía
// no cargó feedback le manda un recordatorio:
//   - notificación push a cada dispositivo donde la activó (pushTokens), y
//   - un mail con botones "Dormí" / "No dormí", solo si están los secrets de Gmail.
// Las dos cosas abren la app en el formulario de esa guardia. Además pasa a
// "realizada" las guardias ya pasadas. Igual, al entrar a la app, el Inicio
// muestra el feedback pendiente.
//
// Variables de entorno (secrets del repo):
//   FIREBASE_SERVICE_ACCOUNT  JSON de la cuenta de servicio de Firebase
//   SMTP_USER / SMTP_PASS     (opcional) cuenta de Gmail + contraseña de aplicación
//   APP_URL                   (opcional) URL pública de la app
//   DRY_RUN=true              muestra a quién avisaría, sin mandar ni escribir
//   TEST_TO=mail@…            manda SOLO un aviso de prueba a esa residente
//                             (push a sus dispositivos + mail si hay Gmail)

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import nodemailer from 'nodemailer';
import { loadServiceAccount } from './credentials.mjs';

const { FIREBASE_SERVICE_ACCOUNT, SMTP_USER, SMTP_PASS } = process.env;
const TEST_TO = (process.env.TEST_TO || '').trim().toLowerCase();
const APP_URL = process.env.APP_URL || 'https://ari1402.github.io/Coordinacion-Guardias/';
const DRY_RUN = process.env.DRY_RUN === 'true';
const MAIL = Boolean(SMTP_USER && SMTP_PASS);

const todayAR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const yesterday = (() => {
  const d = new Date(`${todayAR}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();
const label = (iso) => {
  const wd = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${wd} ${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
};
const feedbackUrl = (shiftId, slept) =>
  `${APP_URL}#/feedback?shift=${encodeURIComponent(shiftId)}${slept === undefined ? '' : `&slept=${slept}`}`;

function mailHtml(name, shiftId, date) {
  const btn = (href, text, bg) =>
    `<a href="${href}" style="display:inline-block;padding:12px 22px;margin:4px;border-radius:10px;background:${bg};color:#fff;text-decoration:none;font-weight:600;font-size:16px">${text}</a>`;
  return `<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1f2033">
  <p style="font-size:16px">Hola ${name} 👋</p>
  <p style="font-size:16px">¿Cómo fue tu guardia del <b>${label(date)}</b>? Son dos preguntas, 10 segundos.</p>
  <p style="font-size:15px;margin-bottom:6px">¿Pudiste dormir?</p>
  <p>${btn(feedbackUrl(shiftId, 1), '😴 Sí, dormí', '#1a9e72')}${btn(feedbackUrl(shiftId, 0), '🥱 No dormí', '#d6435a')}</p>
  <p style="font-size:14px;color:#6b6d85">Se abre la app con tu respuesta: ahí elegís la carga de la guardia del 1 al 10 y listo.
  El detalle lo ven solo Bea y Ana.</p>
</div>`;
}

if (!FIREBASE_SERVICE_ACCOUNT) {
  console.log('::error::Falta el secret FIREBASE_SERVICE_ACCOUNT: no se puede avisar a nadie.');
  process.exit(1);
}
if (!MAIL) console.log('Sin secrets de Gmail (SMTP_USER / SMTP_PASS): solo notificaciones push.');

initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();
const messaging = getMessaging();
const transport = MAIL
  ? nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null;

// Tokens que FCM ya no reconoce (app desinstalada, permiso revocado…): se borran.
const DEAD_TOKEN = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** Manda el push a todos los dispositivos de la residente. Devuelve cuántos llegaron. */
async function push(residentId, { title, body, url, tag }) {
  const snap = await db.collection('pushTokens').where('residentId', '==', residentId).get();
  if (snap.empty) return 0;
  const tokens = snap.docs.map((d) => d.id);
  if (DRY_RUN) return tokens.length;
  const res = await messaging.sendEachForMulticast({
    tokens,
    // Solo datos: el service worker de la app (public/sw.js) arma la notificación.
    data: { title, body, url, tag },
    webpush: { headers: { Urgency: 'high', TTL: String(12 * 3600) } },
  });
  await Promise.all(
    res.responses.map(async (r, i) => {
      if (r.success) return;
      console.log(`  push falló (${snap.docs[i].get('device') ?? 'dispositivo'}): ${r.error?.code} ${r.error?.message}`);
      if (DEAD_TOKEN.has(r.error?.code)) await snap.docs[i].ref.delete();
    }),
  );
  return res.successCount;
}

async function remind(resident, shiftId, date, { test = false } = {}) {
  const firstName = (resident.name || resident.shortName || '').split(' ')[0];
  const pushed = await push(resident.id, {
    title: `${test ? '[Prueba] ' : ''}¿Cómo fue tu guardia del ${label(date)}?`,
    body: '¿Dormiste? ¿Qué tan pesada fue (1–10)? Tocá acá, son 10 segundos.',
    url: feedbackUrl(shiftId),
    tag: `feedback-${shiftId}`,
  });
  let mailed = false;
  if (transport && resident.email && !DRY_RUN) {
    await transport.sendMail({
      from: `"Guardias R1" <${SMTP_USER}>`,
      to: resident.email,
      subject: `${test ? '[Prueba] ' : ''}¿Cómo fue tu guardia del ${label(date)}?`,
      html: mailHtml(firstName, shiftId, date),
      text: `¿Cómo fue tu guardia del ${label(date)}? Contanos acá: ${feedbackUrl(shiftId)}`,
    });
    mailed = true;
  }
  console.log(
    `${DRY_RUN ? '[dry-run] ' : ''}${resident.shortName ?? resident.name} (guardia ${date}): ` +
      `${pushed} push${mailed ? ' + mail' : ''}${pushed === 0 && !mailed ? ' — sin notificaciones activadas, lo va a ver en el Inicio' : ''}`,
  );
  return { pushed, mailed };
}

if (TEST_TO) {
  const snap = await db.collection('residents').where('email', '==', TEST_TO).limit(1).get();
  if (snap.empty) {
    console.log(`::error::No hay ninguna residente con el mail ${TEST_TO}.`);
    process.exit(1);
  }
  const resident = { id: snap.docs[0].id, ...snap.docs[0].data() };
  const { pushed, mailed } = await remind(resident, 'prueba', yesterday, { test: true });
  if (pushed === 0 && !mailed) {
    console.log(`::warning::${resident.name} todavía no activó las notificaciones en ningún dispositivo (Inicio o Mi cuenta → Activar notificaciones).`);
  }
  process.exit(0);
}

const shiftsSnap = await db.collection('shifts').where('date', '<', todayAR).get();
let marked = 0;
let reminded = 0;

for (const docSnap of shiftsSnap.docs) {
  const shift = docSnap.data();
  if (shift.status === 'programada') {
    if (!DRY_RUN) await docSnap.ref.update({ status: 'realizada', updatedAt: new Date().toISOString() });
    marked++;
  }
  if (shift.date !== yesterday || shift.status === 'cancelada') continue;

  const fb = await db.collection('feedback').doc(docSnap.id).get();
  if (fb.exists) continue;
  const res = await db.collection('residents').doc(shift.actualResidentId).get();
  if (!res.exists || res.get('active') === false) continue;

  const { pushed, mailed } = await remind({ id: res.id, ...res.data() }, docSnap.id, shift.date);
  if (pushed || mailed) reminded++;
}

console.log(`Listo: ${reminded} recordatorio(s) ${DRY_RUN ? 'a mandar' : 'enviados'}, ${marked} guardia(s) pasadas a "realizada".`);
process.exit(0);

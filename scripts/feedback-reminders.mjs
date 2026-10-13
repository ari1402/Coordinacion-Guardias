#!/usr/bin/env node
// Corre todos los días a las 8 AM (GitHub Actions, ver
// .github/workflows/feedback-reminder.yml). Pasa a "realizada" las guardias ya
// pasadas (el Inicio muestra el feedback pendiente).
// Recordatorio de feedback (APAGADO, ver RECORDATORIO_FEEDBACK): a quien hizo
// guardia ayer y todavía no cargó feedback le manda un push y, si están los
// secrets de Gmail, un mail con botones "Dormí" / "No dormí".
// El día 8 de cada mes, además, avisa a todas que carguen los pedidos del mes
// siguiente, y el 10 les avisa que toca generarlas a quienes tienen tildado
// "Aviso del día 10" en Admin → Residentes.
//
// Variables de entorno (secrets del repo):
//   FIREBASE_SERVICE_ACCOUNT  JSON de la cuenta de servicio de Firebase
//   SMTP_USER / SMTP_PASS     (opcional) cuenta de Gmail + contraseña de aplicación
//   APP_URL                   (opcional) URL pública de la app
//   DRY_RUN=true              muestra a quién avisaría, sin mandar ni escribir
//   TEST_TO=mail@…            (solo corriéndolo a mano en una compu) aviso de prueba a esa residente
//   TEST_AVISADAS=true        manda SOLO un push de prueba a quienes tienen el aviso del día 10
//
// El repo es público y los logs de Actions también: acá no se imprimen nombres
// ni mails, solo cantidades.

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import { loadServiceAccount } from './credentials.mjs';
import { APP_URL, monthLabel, pushTo } from './push.mjs';

const { FIREBASE_SERVICE_ACCOUNT, SMTP_USER, SMTP_PASS } = process.env;
const TEST_TO = (process.env.TEST_TO || '').trim().toLowerCase();
const DRY_RUN = process.env.DRY_RUN === 'true';
const MAIL = Boolean(SMTP_USER && SMTP_PASS);
// Recordatorio de feedback a la mañana siguiente de cada guardia: apagado a pedido
// de las admins (el feedback se sigue cargando desde la app). true = prenderlo.
const RECORDATORIO_FEEDBACK = false;

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
  El detalle lo ven solo las admins.</p>
</div>`;
}

if (!FIREBASE_SERVICE_ACCOUNT) {
  console.log('::error::Falta el secret FIREBASE_SERVICE_ACCOUNT: no se puede avisar a nadie.');
  process.exit(1);
}
if (!MAIL) console.log('Sin secrets de Gmail (SMTP_USER / SMTP_PASS): solo notificaciones push.');

initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();
const transport = MAIL
  ? nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null;

const push = (residentId, payload) => pushTo(db, residentId, payload, { dryRun: DRY_RUN });

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
    `${DRY_RUN ? '[dry-run] ' : ''}Guardia ${date}: ` +
      `${pushed} push${mailed ? ' + mail' : ''}${pushed === 0 && !mailed ? ' — sin notificaciones activadas, lo va a ver en el Inicio' : ''}`,
  );
  return { pushed, mailed };
}

const avisadas = () => db.collection('residents').where('avisoGenerar', '==', true).get();

if (TEST_TO || process.env.TEST_AVISADAS === 'true') {
  const snap = TEST_TO ? await db.collection('residents').where('email', '==', TEST_TO).limit(1).get() : await avisadas();
  if (snap.empty) {
    console.log(TEST_TO ? '::error::No hay ninguna residente con ese mail.' : '::warning::Nadie tiene tildado "Aviso del día 10" en Admin → Residentes.');
    process.exit(TEST_TO ? 1 : 0);
  }
  for (const d of snap.docs) {
    const pushed = await push(d.id, {
      title: '[Prueba] Notificaciones de Guardias R1',
      body: 'Si ves esto, las notificaciones te llegan bien.',
      url: `${APP_URL}#/`,
      tag: 'prueba',
    });
    console.log(`Prueba: ${pushed} push.`);
    if (pushed === 0) {
      console.log('::warning::Una de las avisadas todavía no activó las notificaciones en ningún dispositivo.');
    }
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
  if (!RECORDATORIO_FEEDBACK || shift.date !== yesterday || shift.status === 'cancelada') continue;

  const fb = await db.collection('feedback').doc(docSnap.id).get();
  if (fb.exists) continue;
  const res = await db.collection('residents').doc(shift.actualResidentId).get();
  if (!res.exists || res.get('active') === false) continue;

  const { pushed, mailed } = await remind({ id: res.id, ...res.data() }, docSnap.id, shift.date);
  if (pushed || mailed) reminded++;
}

const nextMonth = (() => {
  const d = new Date(`${todayAR.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
})();

// Día 8: pedidos del mes siguiente (hay tiempo hasta el 10).
if (todayAR.slice(8) === '08') {
  const residents = await db.collection('residents').where('active', '==', true).get();
  let n = 0;
  for (const r of residents.docs) {
    n += await push(r.id, {
      title: `📝 Pedidos de ${monthLabel(nextMonth)}`,
      body: 'Cargá tus pedidos antes del 10 (ese día se generan las guardias): días que querés, que no podés o que necesitás el posguardia.',
      url: `${APP_URL}#/pedidos`,
      tag: `pedidos-${nextMonth}`,
    });
  }
  console.log(`Recordatorio de pedidos de ${nextMonth}: ${n} push.`);
}

// Día 10: generar las guardias del mes siguiente.
if (todayAR.slice(8) === '10') {
  for (const d of (await avisadas()).docs) {
    const n = await push(d.id, {
      title: `✨ Hoy toca generar las guardias de ${monthLabel(nextMonth)}`,
      body: 'Los pedidos ya están cargados. Abrí el generador.',
      url: `${APP_URL}#/admin/generador?mes=${nextMonth}`,
      tag: `generar-${nextMonth}`,
    });
    console.log(`Aviso de generar ${nextMonth}: ${n} push.`);
  }
}

console.log(
  `Listo: ${RECORDATORIO_FEEDBACK ? `${reminded} recordatorio(s) de feedback ${DRY_RUN ? 'a mandar' : 'enviados'}, ` : ''}${marked} guardia(s) pasadas a "realizada".`,
);
process.exit(0);

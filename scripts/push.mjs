// Envío de notificaciones push (FCM) a residentes, compartido por los scripts
// de recordatorios. Los tokens viven en pushTokens/{token} con su residentId.

import { getMessaging } from 'firebase-admin/messaging';

export const APP_URL = process.env.APP_URL || 'https://ari1402.github.io/Coordinacion-Guardias/';

// Tokens que FCM ya no reconoce (app desinstalada, permiso revocado…): se borran.
const DEAD_TOKEN = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Manda { title, body, url, tag } a todos los dispositivos de la residente.
 * Devuelve cuántos llegaron (con dryRun, a cuántos dispositivos se mandaría).
 */
export async function pushTo(db, residentId, { title, body, url, tag }, { dryRun = false } = {}) {
  const snap = await db.collection('pushTokens').where('residentId', '==', residentId).get();
  if (snap.empty) return 0;
  const tokens = snap.docs.map((d) => d.id);
  if (dryRun) return tokens.length;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    // Solo datos: el service worker de la app (public/sw.js) arma la notificación.
    data: { title, body, url: url ?? APP_URL, tag: tag ?? '' },
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

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' });
}

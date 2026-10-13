import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app, db } from '../firebase';

/**
 * Notificaciones push (publicaciones, pedidos, guardias ofrecidas). El token FCM de
 * cada dispositivo se guarda en pushTokens/{token} con el residentId; el
 * script de GitHub Actions los lee y manda el push. En iPhone solo funciona
 * con la app agregada a la pantalla de inicio (iOS 16.4+).
 */

const STORAGE_KEY = 'pushToken';

export type PushSupport = 'ok' | 'ios-instalar' | 'no-soportado';
export type PushState = 'activadas' | 'bloqueadas' | 'apagadas';

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function pushSupport(): Promise<PushSupport> {
  if (isIOS() && !isStandalone()) return 'ios-instalar';
  const ok = 'Notification' in window && 'serviceWorker' in navigator && (await isSupported().catch(() => false));
  return ok ? 'ok' : 'no-soportado';
}

function storedToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // sin storage: el estado se recalcula con el permiso del navegador
  }
}

export function pushState(): PushState {
  if (!('Notification' in window)) return 'apagadas';
  if (Notification.permission === 'denied') return 'bloqueadas';
  return Notification.permission === 'granted' && storedToken() ? 'activadas' : 'apagadas';
}

async function registration() {
  await navigator.serviceWorker.register('./sw.js', { scope: './' });
  return navigator.serviceWorker.ready;
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Otro';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
  return `${os} · ${browser}${isStandalone() ? ' (app)' : ''}`;
}

/** Obtiene (o renueva) el token y lo guarda a nombre de residentId. */
async function syncToken(residentId: string) {
  const token = await getToken(getMessaging(app), { serviceWorkerRegistration: await registration() });
  const previous = storedToken();
  if (previous && previous !== token) await deleteDoc(doc(db, 'pushTokens', previous)).catch(() => {});
  const now = new Date().toISOString();
  await setDoc(doc(db, 'pushTokens', token), { residentId, device: deviceLabel(), updatedAt: now });
  storeToken(token);
  return token;
}

/** Pide permiso (tiene que llamarse desde un click) y registra el dispositivo. */
export async function enablePush(residentId: string) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Las notificaciones quedaron bloqueadas. Habilitalas en la configuración del navegador para este sitio.'
        : 'No se dio permiso para las notificaciones.',
    );
  }
  return syncToken(residentId);
}

/** Borra el token de la base y da de baja la suscripción del navegador. */
export async function disablePush() {
  const token = storedToken();
  if (!token) return;
  storeToken(null);
  await deleteDoc(doc(db, 'pushTokens', token)).catch(() => {});
  try {
    const reg = await navigator.serviceWorker?.getRegistration('./');
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // sin suscripción: el token ya no está en la base, no llegan más avisos
  }
}

/**
 * Al abrir la app con las notificaciones ya activadas: renueva el token
 * (FCM los rota) y lo reasigna si en este dispositivo entró otra persona.
 */
export async function refreshPush(residentId: string) {
  if (pushState() !== 'activadas' || (await pushSupport()) !== 'ok') return;
  await syncToken(residentId).catch(() => {});
}

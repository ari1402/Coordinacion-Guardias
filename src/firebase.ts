import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

// Config de Firebase del proyecto "coordinacion-de-guardias". No es secreta:
// identifica el proyecto ante Google, pero termina igual dentro del JS que
// se descarga al navegador sin importar si viene de acá o de un .env — la
// seguridad real la dan las Firestore Security Rules + Firebase Auth
// (ver firestore.rules). Por eso va hardcodeada: así GitHub Pages puede
// construir la app sin necesitar secretos configurados en el repo.
const firebaseConfig = {
  apiKey: 'AIzaSyCiJD1kSbXIQCkgWmIaKwSanRNZVsXxGRQ',
  authDomain: 'coordinacion-de-guardias.firebaseapp.com',
  projectId: 'coordinacion-de-guardias',
  storageBucket: 'coordinacion-de-guardias.firebasestorage.app',
  messagingSenderId: '714059890160',
  appId: '1:714059890160:web:facf448ed4054693047135',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Desarrollo sin tocar la base real: VITE_EMULATORS=1 npm run dev (con
// `firebase emulators:start --only auth,firestore` corriendo).
if (import.meta.env.VITE_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

export const COLLECTIONS = {
  residents: 'residents',
  calendarDays: 'calendarDays',
  monthConfigs: 'monthConfigs',
  shifts: 'shifts',
  requests: 'requests',
  feedback: 'feedback',
  swaps: 'swaps',
} as const;

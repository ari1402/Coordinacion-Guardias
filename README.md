# Guardias R1

Webapp para coordinar las guardias de la camada de R1: calendario, pedidos de
fechas, dashboard de equidad (transparente para todo el grupo), feedback
post-guardia (privado), cambios/swaps y un generador automático de
cronograma. React + Firebase (Auth, Firestore, Hosting).

## Cómo está pensada

- **Todos los residentes** ven el calendario, el dashboard grupal (métricas de
  todos) y los pedidos de todos — esa es la transparencia que pedía el grupo.
- **Cada residente** solo puede cargar/editar su propio feedback post-guardia
  (cómo durmió, conformidad, comentario).
- **Solo Bea Bravo y Ana Alba** (rol `admin` en `residents/{uid}`) ven
  la sección Admin: el feedback de todos, la edición del calendario/feriados
  y el generador de cronograma. No hay una "contraseña" separada — el
  control de acceso real son las Firestore Security Rules (`firestore.rules`),
  que es más seguro que un password compartido en el cliente.
- No se carga información sensible de nadie (nombres, emails de trabajo y
  fechas de guardia solamente), así que el código puede vivir en un repo
  normal sin problema.

## Stack

- Vite + React 19 + TypeScript + Tailwind v4
- Firebase: Auth (email/password), Firestore, Hosting
- Recharts para los gráficos (paleta accesible, ver `src/lib/palette.ts`)

## Puesta en marcha (una sola vez)

1. **Creá un proyecto en [Firebase Console](https://console.firebase.google.com/)**
   (gratis, plan Spark alcanza de sobra para 7 personas).
2. Activá **Authentication → Email/Password** y **Firestore Database**
   (modo producción; las reglas de seguridad ya están en `firestore.rules`).
3. En **Configuración del proyecto → Tus apps**, agregá una Web app y copiá su
   config.
4. `cp .env.example .env` y pegá ahí los valores (`VITE_FIREBASE_*`).
5. `cp .firebaserc.example .firebaserc` y poné el ID de tu proyecto.
6. `npm install`

### Cargar los datos iniciales (residentes + octubre 2026)

1. Editá `scripts/residents.seed.json`: reemplazá los emails `CAMBIAR-...`
   por los reales de cada R1 (el de Ana Alba ya está puesto) y las
   `tempPassword` por contraseñas provisorias que cada una cambiará después.
2. Descargá una clave de cuenta de servicio: Firebase Console →
   Configuración del proyecto → **Cuentas de servicio** → Generar nueva clave
   privada → guardala como `scripts/serviceAccountKey.json` (ya está en
   `.gitignore`, nunca se sube a git).
3. `npm run seed` — crea los usuarios de Auth, los documentos de
   `residents`, el calendario y las guardias de octubre 2026 (tal como estaba
   en el Excel que armaron).

### Desarrollo y deploy

```bash
npm run dev        # local, con hot reload
npm run build       # typecheck + build de producción a dist/
npx firebase-tools deploy --only hosting,firestore  # publicar
```

Si es la primera vez que usás `firebase-tools` en esta máquina: `npx
firebase-tools login` antes del deploy.

## Estructura del código

```
src/
  types.ts              modelo de datos (Resident, Shift, GuardiaRequest, ShiftFeedback, Swap, ...)
  lib/
    dates.ts            feriados, preferiados, finde XL vs jueves feliz, sábado común vs finde largo
    equity.ts            contadores de equidad por residente (totales, sáb+pref, findes libres, distancia)
    generator.ts          algoritmo del generador de cronograma
    palette.ts            colores por residente / estado (accesibles, validados)
  hooks/                 suscripciones en tiempo real a Firestore + useAuth
  pages/                 una página por módulo (Calendario, Pedidos, Feedback, Admin, Generador, ...)
scripts/
  seed.mjs               carga inicial (Firebase Admin SDK)
  residents.seed.json     datos de las 7 R1 (editar antes de correr el seed)
  october-2026.seed.json  calendario + guardias de octubre 2026, extraído del Excel
firestore.rules          reglas de seguridad (quién puede leer/escribir qué)
```

## Reglas de negocio implementadas

Ver la conversación original para el detalle completo; en código:

- **Preferiado** = día no feriado inmediatamente anterior al inicio de un
  bloque de feriados consecutivos (`src/lib/dates.ts`).
- **Finde XL** = jueves cuyo lunes siguiente es feriado; si no, es **jueves
  feliz**.
- **Sábado común vs. finde largo** = según si el viernes, el propio sábado,
  el domingo o el lunes siguiente caen feriado.
- **Sábado + preferiado** se suman en un único contador de equidad
  (`sabadosYPreferiados`), tal como se pidió.
- **Findes libres**: se calculan ambas definiciones (sin guardia vie/sáb/dom,
  y la versión estricta que además excluye posguardia del jueves).
- **Distancia entre guardias**: el generador trata <= 3 días como regla dura
  (solo se permite si no queda otra opción) y prioriza >= 5 días como ideal.
- **Equidad histórica**: todos los contadores de los dashboards se calculan
  sobre el acumulado de todo lo cargado, no mes a mes — así un mes puede
  compensar al anterior, como se buscaba con el ejemplo de octubre→noviembre.
- **Quién hizo la guardia de verdad**: `Shift.actualResidentId` (puede
  diferir de `assignedResidentId` por un swap) es lo que alimenta todos los
  contadores — igual que pedía la conversación original ("quien realmente
  hizo la guardia").

## Lo que falta / próximos pasos (a propósito fuera de este alcance)

- El generador hoy devuelve **una sola propuesta** (la de menor score tras
  varios intentos aleatorios), no las 3 opciones (equidad / pedidos /
  descanso) que se charlaron. Se puede lograr llamando
  `generateSchedule()` tres veces con distintos pesos — queda documentado
  acá para no sobre-construir en esta primera versión.
- No hay una pantalla para que un admin cree residentes nuevos desde la UI
  (se hace con `npm run seed` o a mano en Firebase Console + un doc en
  `residents`) — crear usuarios de Auth desde el cliente requeriría una
  Cloud Function, y para 7 personas fijas no vale la pena todavía.
- El bundle de producción pesa ~1.2 MB (sobre todo Firebase + Recharts); si
  en algún momento se siente lento, el primer paso sería code-splitting por
  ruta con `React.lazy`.

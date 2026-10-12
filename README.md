# Guardias R1

App para coordinar las guardias de la camada de R1: cronograma, pedidos,
métricas de equidad transparentes, feedback post-guardia, cambios, sorteos y
todo lo de la camada (tareas, info AAARBA, links). React + Firebase (Auth +
Firestore), publicada en **GitHub Pages**:
https://ari1402.github.io/Coordinacion-Guardias/

## Qué hay

| Sección | Para qué |
|---|---|
| **Inicio** | Tu próxima guardia, quién está hoy/mañana, feedback pendiente, tu reparto vs. el grupo, próximos 7 días, cumpleaños, tareas, links fijados. |
| **Calendario** | Mes completo con feriados 🇦🇷, preferiados ⏳, finde XL 🌟, jueves feliz 😊, cumples 🎂 y sorteos 🎲. Exporta tus guardias a Google/Apple Calendar. Las admins editan cada guardia publicada desde el detalle del día. |
| **Métricas** | Mapa de reparto (azul = le tocó mejor que el promedio, rojo = peor), composición por día de semana, acumulado mes a mes. Filtro por mes o acumulado. |
| **Pedidos** | 🙅 sin guardia · 🙋 quiero esta guardia · 🌅 necesito el posguardia. Bloqueo / pedido fuerte / preferencia. Días sueltos o rangos (vacaciones). Visibles para todas. |
| **Mis guardias** | Feedback en 2 preguntas: ¿dormiste? + carga 1–10. |
| **Cambios** | Intercambios y deudas. Las métricas cuentan a quien realmente hizo la guardia. |
| **Sorteos** | Aleatorios con el generador criptográfico del navegador; el resultado queda guardado y no se puede volver a sortear ni borrar. |
| **Camada** | Tareas (pendiente / en curso / hecha, con responsables y fecha), Info (AAARBA, cursos, rotaciones…), Links con etiquetas y buscador. |
| **Admin** (Bea y Ana) | Reglas de cada mes, feriados oficiales, residentes y cumpleaños, feedback completo, y el **Generador**. |

### Generador

- Arma **3 opciones** (máxima equidad / respeto de pedidos / descanso) con el
  mismo criterio que valida las ediciones manuales.
- Reglas duras: bloqueos, cumpleaños y víspera, distancia mínima entre guardias,
  nunca dos guardias el mismo día. Blandas: pedidos fuertes y preferencias,
  equidad **acumulada** (totales, sábados+preferiados, feriados, findes XL,
  jueves felices, vie/dom), no repetir día de semana, máx. un sábado/preferiado,
  sábado común → con jueves.
- Editor por guardia: cambiar a mano (queda fijada 🔒 y regenerar no la toca),
  marcar una guardia para **sortear** entre quienes elijas 🎲, guardar borrador y publicar.
- **Importar desde texto**: pegá o subí un .txt con una guardia por línea
  (`1/11 Funes`, `Sábado 7: Alba`, `3/11 sin R1`…) y se carga en el editor.
- Reglas por mes (R1 por día de semana, distancias, tope, acuerdos internos):
  si un mes no tiene reglas, **hereda** las del último mes configurado.

## Puesta en marcha (lo que falta hacer una vez)

### 1. Guardar la clave de Firebase en GitHub (obligatorio)

Con ella GitHub publica las reglas de seguridad y la app en cada cambio.

1. Firebase Console → ⚙️ Configuración del proyecto → **Cuentas de servicio** →
   *Generar nueva clave privada* (o usá el JSON que ya descargaste).
2. En GitHub: repo → **Settings → Secrets and variables → Actions → New
   repository secret**. Nombre: `FIREBASE_SERVICE_ACCOUNT`. Valor: todo el
   contenido del archivo JSON.
3. **Actions → Deploy a GitHub Pages → Re-run all jobs** (o cualquier push).

Mientras no esté el secret, la publicación falla a propósito y queda online la
versión anterior.

### 2. Recordatorio de feedback a las 8 AM

`.github/workflows/feedback-reminder.yml` corre todos los días a las 8:00 (hora
Argentina): a quien hizo guardia ayer y no cargó feedback le manda una
**notificación push** que abre la app en el formulario de esa guardia. Además,
el Inicio muestra siempre el feedback pendiente.

- Cada una activa las notificaciones desde **Inicio** o **Mi cuenta → Activar
  notificaciones**, en cada dispositivo. En iPhone primero hay que agregar la
  app a la pantalla de inicio (Safari → Compartir → *Agregar a pantalla de
  inicio*) y abrirla desde ese ícono.
- En Admin → Feedback, la columna 🔔 muestra quién las tiene activadas.
- Prueba: cualquier push que cambie `feedback-reminder.yml` (por ejemplo el
  número de `# prueba:`) manda un aviso de prueba solo a `TEST_PUSH_DEFAULT`.

**Mail (opcional):** si además se cargan los secrets `SMTP_USER` (un Gmail) y
`SMTP_PASS` (una [contraseña de aplicación](https://myaccount.google.com/apppasswords)
de esa cuenta, requiere verificación en 2 pasos), también se manda un mail con
botones "Dormí / No dormí".

### 3. Feriados

Se sincronizan solos en cada publicación (año actual y siguiente: Ministerio
del Interior vía ArgentinaDatos + Día de la Sanidad). También se pueden
importar desde Admin → Reglas del mes → **Importar**, o tildar/destildar a mano
en la tabla del mes: un día destildado a mano no se vuelve a marcar.

## Desarrollo

```bash
npm install
npm run dev      # local, usa el mismo Firebase de producción
npm test         # tests del generador, fechas e importador de texto
npm run build
```

Scripts de mantenimiento (usan `FIREBASE_SERVICE_ACCOUNT` o
`scripts/serviceAccountKey.json`, que está en `.gitignore`):

- `npm run deploy:rules` — publica `firestore.rules`.
- `npm run migrate` — migración v2 (nombres, cumpleaños, esquema de marzo 2027). Corre una sola vez.
- `npm run seed` — carga inicial desde cero (residentes + octubre 2026).

## Código

```
src/lib/
  dates.ts       meses sintetizados, feriados → preferiado / finde XL / jueves feliz, reglas heredables
  generator.ts   función de costo única + búsqueda (golosa + recocido simulado), 3 perfiles
  equity.ts      contadores de equidad por persona y período
  importText.ts  intérprete del cronograma en texto
  raffles.ts     sorteos (aleatoriedad criptográfica)
  schedule.ts    borradores y publicación del cronograma
src/pages/       una página por sección
firestore.rules  quién puede leer/escribir qué (residentes dados de alta, admins, autor del feedback…)
scripts/         seed, migración, reglas, mail diario
```

La config de Firebase en `src/firebase.ts` no es secreta (viaja igual en el
JS público); la seguridad la dan las reglas + Auth.

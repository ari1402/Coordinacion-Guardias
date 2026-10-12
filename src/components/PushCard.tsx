import { useEffect, useState } from 'react';
import { disablePush, enablePush, isIOS, pushState, pushSupport, type PushState, type PushSupport } from '../lib/push';
import { btnPrimary, btnSecondary, Card } from './ui';

const DISMISS_KEY = 'pushCardDismissed';

function dismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Activar / desactivar el recordatorio push de feedback. `inicio` es la
 * versión del dashboard: solo aparece si todavía no se activó y se puede
 * cerrar; en Mi cuenta se muestra siempre.
 */
export default function PushCard({ residentId, inicio }: { residentId: string; inicio?: boolean }) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [state, setState] = useState<PushState>(pushState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(() => inicio && dismissed());

  useEffect(() => {
    pushSupport().then(setSupport);
  }, []);

  if (support === null || hidden) return null;
  if (inicio && (state === 'activadas' || support === 'no-soportado')) return null;

  async function toggle(on: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (on) await enablePush(residentId);
      else await disablePush();
    } catch (e) {
      setError((e as Error).message || 'No se pudieron activar las notificaciones.');
    } finally {
      setState(pushState());
      setBusy(false);
    }
  }

  function close() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // sin storage: se oculta solo por esta vez
    }
    setHidden(true);
  }

  return (
    <Card
      title="🔔 Notificaciones"
      subtitle="Te avisa a las 8 AM, después de cada guardia, para que cargues el feedback (dormiste + carga). Nada más."
      action={
        inicio ? (
          <button onClick={close} className="text-xs text-text-dim hover:text-text" aria-label="Ocultar">
            ✕
          </button>
        ) : undefined
      }
      className={inicio ? 'border-accent/40' : undefined}
    >
      {support === 'ios-instalar' && (
        <ol className="text-sm flex flex-col gap-1 list-decimal pl-5">
          <li>
            Abrí esta página en <b>Safari</b> y tocá el botón <b>Compartir</b> (el cuadrado con la flecha ↑).
          </li>
          <li>
            Elegí <b>“Agregar a pantalla de inicio”</b>.
          </li>
          <li>Abrí la app desde el ícono nuevo (“Guardias R1”) y volvé a esta tarjeta para activarlas.</li>
        </ol>
      )}

      {support === 'no-soportado' && (
        <p className="text-sm text-text-dim">
          Este navegador no permite notificaciones.{' '}
          {isIOS() ? 'Agregá la app a la pantalla de inicio desde Safari.' : 'Probá con Chrome, Edge o Firefox.'}
        </p>
      )}

      {support === 'ok' && (
        <div className="flex items-center gap-3 flex-wrap">
          {state === 'activadas' ? (
            <>
              <span className="text-sm text-ok font-medium">✓ Activadas en este dispositivo</span>
              <button onClick={() => toggle(false)} disabled={busy} className={btnSecondary}>
                Desactivar
              </button>
            </>
          ) : state === 'bloqueadas' ? (
            <p className="text-sm text-warn">
              Están bloqueadas para este sitio. Habilitalas desde la configuración del navegador (el candado 🔒 junto a la
              dirección) y recargá.
            </p>
          ) : (
            <button onClick={() => toggle(true)} disabled={busy} className={btnPrimary}>
              {busy ? 'Activando…' : 'Activar notificaciones'}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger mt-2">{error}</p>}
      {!inicio && support === 'ok' && (
        <p className="text-xs text-text-dim mt-3">
          Se activan por dispositivo: si usás la app en el celu y en la compu, activalas en cada uno.
        </p>
      )}
    </Card>
  );
}

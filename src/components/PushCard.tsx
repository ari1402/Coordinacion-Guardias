import { useEffect, useState } from 'react';
import { disablePush, enablePush, isIOS, pushState, pushSupport, type PushState, type PushSupport } from '../lib/push';
import { btnPrimary, btnSecondary, Card } from './ui';

const QUE_AVISA =
  'Te avisa cuando se publican las guardias, el 8 de cada mes para cargar pedidos, cuando hay que cargarlas en HIBA 2 y cuando alguien ofrece una guardia o te propone un intercambio.';

/**
 * Cartel del Inicio para que cada una active las notificaciones. No se puede
 * cerrar: desaparece solo cuando quedan activadas en este dispositivo.
 */
export function PushBanner({ residentId }: { residentId: string }) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [state, setState] = useState<PushState>(pushState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pushSupport().then(setSupport);
  }, []);

  if (support === null || support === 'no-soportado' || state === 'activadas') return null;

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      await enablePush(residentId);
    } catch (e) {
      setError((e as Error).message || 'No se pudieron activar las notificaciones.');
    } finally {
      setState(pushState());
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span>
          🔔 <b>Activá las notificaciones.</b> {QUE_AVISA}
        </span>
        {support === 'ok' && state === 'apagadas' && (
          <button onClick={activate} disabled={busy} className={btnPrimary}>
            {busy ? 'Activando…' : 'Activar'}
          </button>
        )}
      </div>
      {support === 'ios-instalar' && (
        <p className="text-text-dim">
          En iPhone, primero: Safari → botón Compartir (□↑) → <b>“Agregar a pantalla de inicio”</b>. Después abrí la app desde ese
          ícono y te aparece el botón para activarlas.
        </p>
      )}
      {support === 'ok' && state === 'bloqueadas' && (
        <p className="text-warn">
          Están bloqueadas para este sitio: habilitalas en la configuración del navegador (el candado 🔒 junto a la dirección) y
          recargá.
        </p>
      )}
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}

/** Activar / desactivar las notificaciones en este dispositivo (Mi cuenta). */
export default function PushCard({ residentId }: { residentId: string }) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [state, setState] = useState<PushState>(pushState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pushSupport().then(setSupport);
  }, []);

  if (support === null) return null;

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

  return (
    <Card title="🔔 Notificaciones" subtitle={QUE_AVISA}>
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
      {support === 'ok' && (
        <p className="text-xs text-text-dim mt-3">
          Se activan por dispositivo: si usás la app en el celu y en la compu, activalas en cada uno.
        </p>
      )}
    </Card>
  );
}

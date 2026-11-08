import { useEffect, useState } from 'react';

/**
 * Avisa cuando hay una versión nueva publicada (compara el build con
 * version.json). No recarga sola para no perder lo que no se guardó.
 */
export default function UpdateBanner() {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const check = async () => {
      try {
        const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (id && id !== __BUILD_ID__) setOutdated(true);
      } catch {
        /* sin conexión: se vuelve a probar después */
      }
    };
    check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    const t = setInterval(check, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(t);
    };
  }, []);
  if (!outdated) return null;
  return (
    <div className="mb-3 rounded-xl border border-accent bg-accent-soft px-3 py-2 text-sm flex items-center justify-between gap-2">
      <span>✨ Hay una versión nueva de la app.</span>
      <button onClick={() => location.reload()} className="shrink-0 rounded-lg bg-accent text-accent-contrast px-3 py-1.5 text-xs font-medium">
        Actualizar
      </button>
    </div>
  );
}

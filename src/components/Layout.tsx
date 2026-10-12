import clsx from 'clsx';
import { signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { auth } from '../firebase';
import { disablePush, refreshPush } from '../lib/push';

type NavItem = { to: string; label: string; icon: string; end?: boolean; short?: string; admin?: boolean };

const NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: '🏠', end: true },
  { to: '/calendario', label: 'Calendario', icon: '📅' },
  { to: '/metricas', label: 'Métricas', icon: '📊' },
  { to: '/pedidos', label: 'Pedidos', icon: '🙋' },
  { to: '/feedback', label: 'Mis guardias', icon: '🌙', short: 'Mis guardias' },
  { to: '/cambios', label: 'Cambios', icon: '🔁' },
  { to: '/sorteos', label: 'Sorteos', icon: '🎲' },
  { to: '/camada', label: 'Camada', icon: '📚' },
];

// En el celular, abajo van estas cuatro; el resto queda en "Más".
const MOBILE_TABS = NAV.filter((i) => ['/', '/calendario', '/pedidos', '/feedback'].includes(i.to));

function navCls(isActive: boolean, admin = false) {
  return clsx(
    'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm whitespace-nowrap transition-colors',
    isActive
      ? admin
        ? 'bg-warn-soft text-warn font-medium'
        : 'bg-accent-soft text-accent font-medium'
      : 'text-text-dim hover:text-text hover:bg-surface-2',
  );
}

export default function Layout() {
  const { resident, isAdmin } = useAuthContext();
  const residentId = resident?.id;
  useEffect(() => {
    if (residentId) refreshPush(residentId);
  }, [residentId]);

  // Al salir se borra el token: el dispositivo deja de recibir avisos a su nombre.
  const salir = () => disablePush().finally(() => signOut(auth));

  const items: NavItem[] = [...NAV, ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: '🛠️', admin: true }] : [])];
  const moreItems = items.filter((i) => !MOBILE_TABS.includes(i));
  const [more, setMore] = useState(false);
  const { pathname } = useLocation();
  const matches = (i: NavItem) => (i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`));
  const inMore = moreItems.some(matches) || pathname === '/cuenta' || pathname === '/guia';

  return (
    <div className="min-h-screen bg-bg text-text md:flex">
      <aside className="hidden md:flex md:flex-col w-56 shrink-0 border-r border-border bg-surface sticky top-0 h-screen p-4">
        <div className="flex items-center gap-2 px-2 mb-6">
          <span className="h-7 w-7 rounded-lg bg-accent text-accent-contrast grid place-items-center text-sm font-bold">R1</span>
          <span className="font-semibold">Guardias</span>
        </div>
        <nav className="flex flex-col gap-1">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => navCls(isActive, !!i.admin)}>
              <span>{i.icon}</span>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t border-border flex flex-col gap-1 text-sm">
          <span className="px-3 font-medium">{resident?.name}</span>
          <NavLink to="/guia" className={({ isActive }) => navCls(isActive)}>
            <span>❓</span>Guía
          </NavLink>
          <NavLink to="/cuenta" className={({ isActive }) => navCls(isActive)}>
            <span>🔑</span>Mi cuenta
          </NavLink>
          <button onClick={salir} className={clsx(navCls(false), 'hover:text-danger')}>
            <span>↩</span>Salir
          </button>
        </div>
      </aside>

      <header className="md:hidden sticky top-0 z-20 bg-surface/95 backdrop-blur border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between px-4 h-12">
          <span className="flex items-center gap-2 font-semibold">
            <span className="h-7 w-7 rounded-lg bg-accent text-accent-contrast grid place-items-center text-xs font-bold">R1</span>
            Guardias
          </span>
          <NavLink to="/cuenta" className="h-9 w-9 grid place-items-center rounded-full bg-surface-2 text-sm font-semibold" aria-label="Mi cuenta">
            {resident?.name?.[0] ?? '·'}
          </NavLink>
        </div>
      </header>

      <main className="flex-1 min-w-0 px-4 sm:px-6 pt-4 md:py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>

      {/* Celular: barra de abajo con lo más usado + "Más" para el resto. */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-surface/95 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {MOBILE_TABS.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              onClick={() => setMore(false)}
              className={({ isActive }) =>
                clsx('flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive && !more ? 'text-accent font-semibold' : 'text-text-dim')
              }
            >
              <span className="text-xl leading-none">{i.icon}</span>
              {i.short ?? i.label}
            </NavLink>
          ))}
          <button
            onClick={() => setMore((m) => !m)}
            className={clsx('flex flex-col items-center gap-0.5 py-2 text-[11px]', more || inMore ? 'text-accent font-semibold' : 'text-text-dim')}
          >
            <span className="text-xl leading-none">☰</span>
            Más
          </button>
        </div>
      </nav>

      {more && (
        <div className="md:hidden fixed inset-0 z-10 bg-black/40" onClick={() => setMore(false)}>
          <div
            className="absolute inset-x-0 bottom-0 bg-surface rounded-t-2xl border-t border-border p-3 pb-[calc(5rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.end}
                  onClick={() => setMore(false)}
                  className={({ isActive }) =>
                    clsx(
                      'flex flex-col items-center gap-1 rounded-xl py-3 text-sm',
                      isActive ? ('admin' in i ? 'bg-warn-soft text-warn font-medium' : 'bg-accent-soft text-accent font-medium') : 'bg-surface-2',
                    )
                  }
                >
                  <span className="text-2xl leading-none">{i.icon}</span>
                  {i.label}
                </NavLink>
              ))}
              <NavLink to="/guia" onClick={() => setMore(false)} className="flex flex-col items-center gap-1 rounded-xl py-3 text-sm bg-surface-2">
                <span className="text-2xl leading-none">❓</span>
                Guía
              </NavLink>
              <NavLink to="/cuenta" onClick={() => setMore(false)} className="flex flex-col items-center gap-1 rounded-xl py-3 text-sm bg-surface-2">
                <span className="text-2xl leading-none">🔑</span>
                Mi cuenta
              </NavLink>
              <button onClick={salir} className="flex flex-col items-center gap-1 rounded-xl py-3 text-sm bg-surface-2 text-danger">
                <span className="text-2xl leading-none">↩</span>
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

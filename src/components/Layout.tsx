import clsx from 'clsx';
import { signOut } from 'firebase/auth';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { auth } from '../firebase';

const NAV = [
  { to: '/', label: 'Inicio', icon: '🏠', end: true },
  { to: '/calendario', label: 'Calendario', icon: '📅' },
  { to: '/metricas', label: 'Métricas', icon: '📊' },
  { to: '/pedidos', label: 'Pedidos', icon: '🙋' },
  { to: '/feedback', label: 'Mis guardias', icon: '🌙' },
  { to: '/cambios', label: 'Cambios', icon: '🔁' },
  { to: '/sorteos', label: 'Sorteos', icon: '🎲' },
  { to: '/camada', label: 'Camada', icon: '📚' },
];

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
  const items = [...NAV, ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: '🛠️', end: false, admin: true }] : [])];

  return (
    <div className="min-h-screen bg-bg text-text md:flex">
      <aside className="hidden md:flex md:flex-col w-56 shrink-0 border-r border-border bg-surface sticky top-0 h-screen p-4">
        <div className="flex items-center gap-2 px-2 mb-6">
          <span className="h-7 w-7 rounded-lg bg-accent text-accent-contrast grid place-items-center text-sm font-bold">R1</span>
          <span className="font-semibold">Guardias</span>
        </div>
        <nav className="flex flex-col gap-1">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => navCls(isActive, 'admin' in i)}>
              <span>{i.icon}</span>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t border-border flex flex-col gap-1 text-sm">
          <span className="px-3 font-medium">{resident?.name}</span>
          <NavLink to="/cuenta" className={({ isActive }) => navCls(isActive)}>
            <span>🔑</span>Mi cuenta
          </NavLink>
          <button onClick={() => signOut(auth)} className={clsx(navCls(false), 'hover:text-danger')}>
            <span>↩</span>Salir
          </button>
        </div>
      </aside>

      <header className="md:hidden sticky top-0 z-20 bg-surface border-b border-border">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="flex items-center gap-2 font-semibold">
            <span className="h-6 w-6 rounded-md bg-accent text-accent-contrast grid place-items-center text-[11px] font-bold">R1</span>
            Guardias
          </span>
          <span className="flex gap-3 text-sm text-text-dim">
            <NavLink to="/cuenta">🔑</NavLink>
            <button onClick={() => signOut(auth)}>Salir</button>
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => navCls(isActive, 'admin' in i)}>
              <span>{i.icon}</span>
              {i.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}

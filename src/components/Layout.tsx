import { signOut } from 'firebase/auth';
import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { auth } from '../firebase';
import { useAuthContext } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Mi dashboard' },
  { to: '/grupo', label: 'Dashboard grupal' },
  { to: '/calendario', label: 'Calendario' },
  { to: '/pedidos', label: 'Pedidos' },
  { to: '/feedback', label: 'Mis guardias' },
  { to: '/cambios', label: 'Cambios' },
];

export default function Layout() {
  const { resident, isAdmin } = useAuthContext();

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text">
      <header className="border-b border-border bg-surface sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" />
            <span className="font-semibold">Guardias R1</span>
          </div>
          <nav className="flex-1 flex items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-accent-soft text-accent font-medium'
                      : 'text-text-dim hover:text-text hover:bg-surface-2',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  clsx(
                    'px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-warn-soft text-warn font-medium'
                      : 'text-warn hover:bg-warn-soft',
                  )
                }
              >
                Admin
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-text-dim hidden sm:inline">{resident?.shortName}</span>
            <NavLink to="/cuenta" className="text-text-dim hover:text-accent transition-colors">
              Mi cuenta
            </NavLink>
            <button
              onClick={() => signOut(auth)}
              className="text-text-dim hover:text-danger transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

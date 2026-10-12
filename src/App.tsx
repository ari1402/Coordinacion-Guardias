import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuthContext } from './context/AuthContext';
import Login from './pages/Login';
import MiDashboard from './pages/MiDashboard';
import DashboardGrupal from './pages/DashboardGrupal';
import Calendario from './pages/Calendario';
import Pedidos from './pages/Pedidos';
import Feedback from './pages/Feedback';
import Cambios from './pages/Cambios';
import Admin from './pages/Admin';
import Generador from './pages/Generador';

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center text-text-dim text-sm">
      Cargando…
    </div>
  );
}

function PendingSetup() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 text-center">
      <div>
        <h1 className="text-lg font-semibold mb-2">Tu cuenta todavía no tiene perfil</h1>
        <p className="text-text-dim text-sm max-w-sm">
          Pedile a Bea o a Ana que te creen el documento en la colección{' '}
          <code className="bg-surface-2 px-1 rounded">residents</code> con tu uid.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const { loading, user, resident, isAdmin } = useAuthContext();

  if (loading) return <FullScreenLoader />;
  if (!user) return <Login />;
  if (!resident) return <PendingSetup />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<MiDashboard />} />
        <Route path="/grupo" element={<DashboardGrupal />} />
        <Route path="/calendario" element={<Calendario />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/cambios" element={<Cambios />} />
        {isAdmin && <Route path="/admin" element={<Admin />} />}
        {isAdmin && <Route path="/admin/generador" element={<Generador />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

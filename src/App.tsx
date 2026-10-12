import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuthContext } from './context/AuthContext';
import Admin from './pages/Admin';
import Calendario from './pages/Calendario';
import Camada from './pages/Camada';
import CambiarPassword from './pages/CambiarPassword';
import Cambios from './pages/Cambios';
import Feedback from './pages/Feedback';
import Guia from './pages/Guia';
import Generador from './pages/Generador';
import Inicio from './pages/Inicio';
import Login from './pages/Login';
import Metricas from './pages/Metricas';
import Pedidos from './pages/Pedidos';
import Sorteos from './pages/Sorteos';

function FullScreenLoader() {
  return <div className="min-h-screen flex items-center justify-center text-text-dim text-sm">Cargando…</div>;
}

function PendingSetup() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 text-center">
      <div>
        <h1 className="text-lg font-semibold mb-2">Tu cuenta todavía no tiene perfil</h1>
        <p className="text-text-dim text-sm max-w-sm">
          Pedile a una de las admins que te dé de alta en Admin → Residentes.
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
        <Route path="/" element={<Inicio />} />
        <Route path="/calendario" element={<Calendario />} />
        <Route path="/metricas" element={<Metricas />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/cambios" element={<Cambios />} />
        <Route path="/sorteos" element={<Sorteos />} />
        <Route path="/camada" element={<Camada />} />
        <Route path="/cuenta" element={<CambiarPassword />} />
        <Route path="/guia" element={<Guia />} />
        {isAdmin && <Route path="/admin" element={<Admin />} />}
        {isAdmin && <Route path="/admin/generador" element={<Generador />} />}
        <Route path="/grupo" element={<Navigate to="/metricas" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

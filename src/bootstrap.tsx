import { StrictMode } from 'react';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';

// Separado de main.tsx a propósito: así Firebase + Recharts quedan en un
// chunk lazy en vez del bundle inicial (ver main.tsx).
//
// Usa HashRouter (URLs tipo /#/calendario) en vez de BrowserRouter: la app
// se publica en GitHub Pages, que no tiene forma de redirigir rutas propias
// de la SPA (/calendario, /admin) de vuelta a index.html — con hash routing
// esas rutas nunca llegan al servidor, así que no hace falta configurar nada ahí.
export default function Bootstrap() {
  return (
    <StrictMode>
      <ErrorBoundary>
        <HashRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </HashRouter>
      </ErrorBoundary>
    </StrictMode>
  );
}

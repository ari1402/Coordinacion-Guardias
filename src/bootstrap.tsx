import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';

// Separado de main.tsx a propósito: este módulo (y todo lo que importa,
// incluido src/firebase.ts) solo se carga si la config de Firebase está
// presente — ver main.tsx. Así, si falta el .env, nunca llegamos a invocar
// getAuth()/getFirestore() con una config inválida (eso revienta de forma
// sincrónica al importar el módulo, antes de que exista árbol de React para
// que un ErrorBoundary lo atrape).
export default function Bootstrap() {
  return (
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>
  );
}

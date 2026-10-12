import { createRoot } from 'react-dom/client';
import './index.css';

const REQUIRED_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

const missing = REQUIRED_ENV.filter((key) => !import.meta.env[key]);

const root = createRoot(document.getElementById('root')!);

if (missing.length > 0) {
  root.render(
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Falta configurar Firebase</h1>
        <p style={{ fontSize: 14, color: '#6b6d85', marginBottom: 12 }}>
          No están definidas estas variables de entorno: {missing.join(', ')}. Copiá{' '}
          <code>.env.example</code> a <code>.env</code> y completalo con la config de tu proyecto
          de Firebase (Console → Configuración del proyecto → Tus apps).
        </p>
      </div>
    </div>,
  );
} else {
  import('./bootstrap').then(({ default: Bootstrap }) => root.render(<Bootstrap />));
}

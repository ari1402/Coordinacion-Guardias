import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { auth } from '../firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResetMessage(null);
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError('Email o contraseña incorrectos.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError('Escribí tu email arriba y después tocá "Olvidé mi contraseña".');
      return;
    }
    setError(null);
    setResetMessage(null);
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetMessage('Te mandamos un email para elegir tu contraseña. Revisá spam si no lo ves.');
    } catch {
      setResetMessage('Si ese email tiene una cuenta creada, te va a llegar el link para elegir contraseña.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl shadow-sm p-8">
        <h1 className="text-xl font-semibold text-text mb-1">Guardias R1</h1>
        <p className="text-sm text-text-dim mb-6">
          Ingresá con el email que te asignaron para ver tu dashboard y los pedidos del grupo.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-text-dim">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-text outline-none focus:border-accent"
              placeholder="nombre@residencia.org"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-dim">
            Contraseña
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-text outline-none focus:border-accent"
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          {resetMessage && <p className="text-sm text-ok">{resetMessage}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-lg bg-accent text-accent-contrast py-2 font-medium disabled:opacity-60"
          >
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={submitting}
            className="text-sm text-text-dim underline disabled:opacity-60"
          >
            Olvidé mi contraseña / es la primera vez que entro
          </button>
        </form>
      </div>
    </div>
  );
}

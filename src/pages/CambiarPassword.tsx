import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { useState } from 'react';
import PushCard from '../components/PushCard';
import { useAuthContext } from '../context/AuthContext';
import { auth } from '../firebase';

export default function CambiarPassword() {
  const { resident } = useAuthContext();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 6) {
      setError('La contraseña nueva tiene que tener al menos 6 caracteres.');
      return;
    }
    if (next !== confirm) {
      setError('Las dos contraseñas nuevas no coinciden.');
      return;
    }
    const user = auth.currentUser;
    if (!user?.email) return;
    setSubmitting(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      setDone(true);
    } catch {
      setError('Tu contraseña actual no es correcta.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-sm flex flex-col gap-6">
        {resident && <PushCard residentId={resident.id} />}
        <div>
          <h1 className="text-lg font-semibold mb-2">Listo</h1>
          <p className="text-sm text-ok">Tu contraseña se cambió. La próxima vez usás la nueva.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-sm flex flex-col gap-6">
      {resident && <PushCard residentId={resident.id} />}
      <div>
        <h1 className="text-lg font-semibold mb-1">Cambiar contraseña</h1>
        <p className="text-sm text-text-dim mb-4">Si entraste con una contraseña temporal, cambiala acá por la tuya.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-text-dim">
            Contraseña actual (la temporal que te pasaron)
            <input
              type="password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-text outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-dim">
            Contraseña nueva
            <input
              type="password"
              required
              minLength={6}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-text outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-dim">
            Repetir contraseña nueva
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-text outline-none focus:border-accent"
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 self-start rounded-lg bg-accent text-accent-contrast px-4 py-2 font-medium disabled:opacity-60"
          >
            {submitting ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}

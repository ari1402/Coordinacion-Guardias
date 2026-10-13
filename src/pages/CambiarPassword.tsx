import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import PushCard from '../components/PushCard';
import { useAuthContext } from '../context/AuthContext';
import { auth, db } from '../firebase';

const MIN_LENGTH = 8;
const inputCls = 'rounded-lg border border-border bg-surface-2 px-3 py-2 text-text outline-none focus:border-accent';

function PasswordForm({ forced = false, onDone }: { forced?: boolean; onDone: () => void }) {
  const { resident } = useAuthContext();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_LENGTH) {
      setError(`La contraseña nueva tiene que tener al menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (next === current) {
      setError('La contraseña nueva tiene que ser distinta de la actual.');
      return;
    }
    if (next !== confirm) {
      setError('Las dos contraseñas nuevas no coinciden.');
      return;
    }
    const user = auth.currentUser;
    if (!user?.email || !resident) return;
    setSubmitting(true);
    try {
      try {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      } catch {
        setError('Tu contraseña actual no es correcta.');
        return;
      }
      await updatePassword(user, next);
      await updateDoc(doc(db, 'residents', resident.id), { passwordChangedAt: new Date().toISOString() });
      onDone();
    } catch (err) {
      setError(`No se pudo cambiar: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="rounded-lg border-2 border-danger bg-danger-soft px-3 py-2 text-sm font-bold uppercase text-danger">
        ⚠️ No uses la misma contraseña que la del hospital
      </p>
      <label className="flex flex-col gap-1 text-sm text-text-dim">
        {forced ? 'Contraseña actual (la temporal que te pasaron)' : 'Contraseña actual'}
        <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-dim">
        Contraseña nueva (mínimo {MIN_LENGTH} caracteres)
        <input
          type="password"
          required
          minLength={MIN_LENGTH}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-dim">
        Repetir contraseña nueva
        <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
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
  );
}

/**
 * Pantalla obligatoria al entrar mientras no se haya cambiado la contraseña
 * temporal (residents/{id}.passwordChangedAt vacío). No deja usar la app hasta
 * cambiarla; al guardarla desaparece sola.
 */
export function CambioObligatorio() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold mb-1">🔑 Cambiá tu contraseña</h1>
          <p className="text-sm text-text-dim">
            Antes de seguir, reemplazá la contraseña temporal por una tuya. Es una sola vez: después entrás con la nueva.
          </p>
        </div>
        <PasswordForm forced onDone={() => {}} />
        <button onClick={() => signOut(auth)} className="self-start text-xs text-text-dim underline">
          Salir
        </button>
      </div>
    </div>
  );
}

export default function CambiarPassword() {
  const { resident } = useAuthContext();
  const [done, setDone] = useState(false);

  return (
    <div className="max-w-sm flex flex-col gap-6">
      {resident && <PushCard residentId={resident.id} />}
      {done ? (
        <div>
          <h1 className="text-lg font-semibold mb-2">Listo</h1>
          <p className="text-sm text-ok">Tu contraseña se cambió. La próxima vez usás la nueva.</p>
        </div>
      ) : (
        <div>
          <h1 className="text-lg font-semibold mb-1">Cambiar contraseña</h1>
          <p className="text-sm text-text-dim mb-4">Cambiá tu contraseña cuando quieras.</p>
          <PasswordForm onDone={() => setDone(true)} />
        </div>
      )}
    </div>
  );
}

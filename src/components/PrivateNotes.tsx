import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../firebase';
import { usePrivateNotes } from '../hooks/data';
import { monthLabel } from '../lib/dates';
import { Card, btnSecondary, inputCls } from './ui';

/** Editor de las notas privadas del mes (solo las ve quien las escribe). */
export function PrivateNotesEditor({ month }: { month: string }) {
  const { resident: me } = useAuthContext();
  const note = usePrivateNotes(me?.id).find((n) => n.month === month);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => setText(note?.text ?? ''), [note?.text, month]);
  if (!me) return null;
  const id = `${month}_${me.id}`;

  async function save() {
    if (text.trim()) {
      await setDoc(doc(db, 'privateNotes', id), { id, month, ownerId: me!.id, text: text.trim(), updatedAt: new Date().toISOString() });
    } else if (note) {
      await deleteDoc(doc(db, 'privateNotes', id));
    }
    setStatus('Guardado ✓');
    setTimeout(() => setStatus(null), 2000);
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      🔒 Notas y acuerdos del mes
      <span className="text-xs text-text-dim">Solo las ves vos (ni el grupo ni la otra admin). Se guardan aparte de las reglas.</span>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className={inputCls}
        placeholder="Ej.: martes 3 sin R1; Pérez compensa sáb/preferiado de octubre…"
      />
      <span className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={text.trim() === (note?.text ?? '')} className={btnSecondary}>
          Guardar notas
        </button>
        {status && <span className="text-xs text-ok">{status}</span>}
      </span>
    </label>
  );
}

/** Muestra tus notas privadas del mes (si tenés). */
export function PrivateNotesCard({ month, className }: { month: string; className?: string }) {
  const { resident: me } = useAuthContext();
  const note = usePrivateNotes(me?.id).find((n) => n.month === month);
  if (!note) return null;
  return (
    <Card title={`🔒 Tus notas de ${monthLabel(month)}`} subtitle="Solo las ves vos." className={className}>
      <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{note.text}</p>
    </Card>
  );
}

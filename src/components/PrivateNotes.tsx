import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../firebase';
import { usePrivateNotes } from '../hooks/data';
import { monthLabel } from '../lib/dates';
import { Card, inputCls } from './ui';

/**
 * Editor de las notas privadas del mes (solo las ve quien las escribe). Se
 * guardan solas: un momento después de dejar de escribir y al salir del campo.
 */
export function PrivateNotesEditor({ month }: { month: string }) {
  const { resident: me } = useAuthContext();
  const note = usePrivateNotes(me?.id).find((n) => n.month === month);
  const stored = note?.text ?? '';
  const [text, setText] = useState(stored);
  const [status, setStatus] = useState<string | null>(null);
  const editing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si cambia lo guardado (otro dispositivo) y no estás escribiendo, se actualiza.
  useEffect(() => {
    if (!editing.current) setText(stored);
  }, [stored]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  if (!me) return null;
  const id = `${month}_${me.id}`;

  async function save(value: string) {
    if (timer.current) clearTimeout(timer.current);
    if (value.trim() === stored) {
      editing.current = false;
      return;
    }
    setStatus('Guardando…');
    try {
      if (value.trim()) {
        await setDoc(doc(db, 'privateNotes', id), { id, month, ownerId: me!.id, text: value.trim(), updatedAt: new Date().toISOString() });
      } else if (note) {
        await deleteDoc(doc(db, 'privateNotes', id));
      }
      setStatus('Guardado ✓');
      setTimeout(() => setStatus(null), 2000);
    } catch (e) {
      setStatus(`No se pudo guardar: ${(e as Error).message}`);
    } finally {
      editing.current = false;
    }
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-text-dim">
        Solo las ves vos (ni el grupo ni la otra admin). Se guardan solas mientras escribís.
      </span>
      <textarea
        value={text}
        onChange={(e) => {
          editing.current = true;
          setText(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          const value = e.target.value;
          timer.current = setTimeout(() => save(value), 1200);
        }}
        onBlur={() => save(text)}
        rows={4}
        className={inputCls}
        placeholder="Ej.: martes 3 sin R1; Pérez compensa sáb/preferiado de octubre…"
      />
      <span className="text-xs text-ok min-h-[1rem]">{status}</span>
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

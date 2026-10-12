import clsx from 'clsx';
import { doc, writeBatch } from 'firebase/firestore';
import { useState } from 'react';
import { db } from '../firebase';
import { logActivity } from '../lib/activity';
import { shortDateLabel } from '../lib/dates';
import type { Shift } from '../types';
import { btnPrimary, inputCls } from './ui';

/**
 * Dos preguntas: ¿dormiste? y carga de 1 a 10 (+ comentario opcional). El
 * feedback queda privado (autor + admins); "dormiste" se copia a la guardia
 * para que el conteo de noches sin dormir sea visible para el grupo.
 */
export default function FeedbackForm({
  shift,
  residentId,
  onDone,
  compact,
  initialSlept,
}: {
  shift: Shift;
  residentId: string;
  onDone?: () => void;
  compact?: boolean;
  initialSlept?: boolean;
}) {
  const [slept, setSlept] = useState<boolean | null>(initialSlept ?? null);
  const [carga, setCarga] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (slept === null || carga === null) return;
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      batch.set(doc(db, 'feedback', shift.id), {
        shiftId: shift.id,
        residentId,
        date: shift.date,
        slept,
        carga,
        ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
        createdAt: now,
      });
      batch.update(doc(db, 'shifts', shift.id), { slept, updatedAt: now });
      logActivity({ entity: 'feedback', summary: `Cargó el feedback de su guardia del ${shortDateLabel(shift.date)}` }, batch);
      await batch.commit();
      onDone?.();
    } catch (e) {
      setError(`No se pudo guardar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-text-dim w-28">¿Dormiste?</span>
        {[
          { v: true, label: '😴 Sí' },
          { v: false, label: '🥱 No' },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => setSlept(o.v)}
            className={clsx(
              'flex-1 sm:flex-none px-3 py-2 sm:py-1.5 rounded-lg text-sm border transition-colors',
              slept === o.v
                ? o.v
                  ? 'border-ok bg-ok-soft text-ok'
                  : 'border-danger bg-danger-soft text-danger'
                : 'border-border text-text-dim hover:bg-surface-2',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-text-dim w-28">Carga (1–10)</span>
        <div className="grid grid-cols-5 sm:flex gap-1.5 sm:gap-1 w-full sm:w-auto">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCarga(n)}
              className={clsx(
                'h-10 sm:h-8 sm:w-8 rounded-lg text-sm border tabular-nums transition-colors',
                carga === n ? 'border-accent bg-accent text-accent-contrast' : 'border-border text-text-dim hover:bg-surface-2',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      {!compact && (
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={2}
          placeholder="Comentario opcional (solo lo ven Bea y Ana)"
          className={clsx(inputCls, 'resize-none')}
        />
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <button onClick={submit} disabled={saving || slept === null || carga === null} className={clsx(btnPrimary, 'w-full sm:w-auto sm:self-start')}>
        {saving ? 'Guardando…' : 'Enviar'}
      </button>
    </div>
  );
}

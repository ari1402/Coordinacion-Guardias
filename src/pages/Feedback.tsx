import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../firebase';
import { useAllShifts, useFeedback } from '../hooks/data';
import Badge from '../components/Badge';

function FeedbackForm({ shiftId, date, residentId }: { shiftId: string; date: string; residentId: string }) {
  const [slept, setSlept] = useState<boolean | null>(null);
  const [hoursSlept, setHoursSlept] = useState('');
  const [conformidad, setConformidad] = useState(4);
  const [comentario, setComentario] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (slept === null) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'feedback'), {
        shiftId,
        residentId,
        date,
        slept,
        hoursSlept: slept && hoursSlept ? Number(hoursSlept) : null,
        conformidad,
        comentario: comentario.trim() || null,
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <p className="text-sm text-ok">¡Gracias por cargar el feedback!</p>;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 pt-3 border-t border-border">
      <div className="flex items-center gap-3">
        <span className="text-sm text-text-dim">¿Dormiste?</span>
        <button
          type="button"
          onClick={() => setSlept(true)}
          className={`px-3 py-1 rounded-lg text-sm border ${slept === true ? 'border-ok bg-ok-soft text-ok' : 'border-border text-text-dim'}`}
        >
          Sí
        </button>
        <button
          type="button"
          onClick={() => setSlept(false)}
          className={`px-3 py-1 rounded-lg text-sm border ${slept === false ? 'border-danger bg-danger-soft text-danger' : 'border-border text-text-dim'}`}
        >
          No
        </button>
        {slept && (
          <input
            type="number"
            min={0}
            max={12}
            step={0.5}
            value={hoursSlept}
            onChange={(e) => setHoursSlept(e.target.value)}
            placeholder="hs"
            className="w-20 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm"
          />
        )}
      </div>
      <label className="flex flex-col gap-1 text-sm text-text-dim">
        Conformidad con el cronograma de esa guardia: {conformidad}/5
        <input
          type="range"
          min={1}
          max={5}
          value={conformidad}
          onChange={(e) => setConformidad(Number(e.target.value))}
        />
      </label>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        rows={2}
        placeholder="Comentario (opcional, solo lo ven Bea y Ana)"
        className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent resize-none"
      />
      <button
        type="submit"
        disabled={submitting || slept === null}
        className="self-start rounded-lg bg-accent text-accent-contrast px-4 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        {submitting ? 'Guardando…' : 'Guardar feedback'}
      </button>
    </form>
  );
}

export default function Feedback() {
  const { resident } = useAuthContext();
  const { shifts, loading: loadingShifts } = useAllShifts();
  const { feedback, loading: loadingFeedback } = useFeedback(resident?.id);

  const myShifts = useMemo(
    () =>
      shifts
        .filter((s) => s.actualResidentId === resident?.id && s.status !== 'cancelada')
        .sort((a, b) => b.date.localeCompare(a.date)),
    [shifts, resident],
  );
  const feedbackByShift = useMemo(() => new Map(feedback.map((f) => [f.shiftId, f])), [feedback]);
  const sinDormir = feedback.filter((f) => !f.slept).length;

  const loading = loadingShifts || loadingFeedback || !resident;
  if (loading) return <p className="text-text-dim text-sm">Cargando…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Mis guardias</h1>
        <p className="text-sm text-text-dim">
          Cargá cómo te fue en cada guardia. Solo lo ven Bea Bravo y Ana Alba.
        </p>
      </div>

      <div className="flex gap-3">
        <Badge tone="critical">Guardias sin dormir registradas: {sinDormir}</Badge>
        <Badge tone="neutral">Feedback cargado: {feedback.length}/{myShifts.length}</Badge>
      </div>

      <ul className="flex flex-col gap-3">
        {myShifts.map((s) => {
          const fb = feedbackByShift.get(s.id);
          return (
            <li key={s.id} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{s.date}</span>
                {fb && (
                  <div className="flex gap-1.5">
                    <Badge tone={fb.slept ? 'good' : 'critical'}>{fb.slept ? 'Dormiste' : 'No dormiste'}</Badge>
                    <Badge tone="neutral">Conformidad {fb.conformidad}/5</Badge>
                  </div>
                )}
              </div>
              {fb?.comentario && <p className="text-sm text-text-dim mt-1">“{fb.comentario}”</p>}
              {!fb && <FeedbackForm shiftId={s.id} date={s.date} residentId={resident!.id} />}
            </li>
          );
        })}
        {myShifts.length === 0 && (
          <p className="text-text-dim text-sm">Todavía no tenés guardias registradas.</p>
        )}
      </ul>
    </div>
  );
}

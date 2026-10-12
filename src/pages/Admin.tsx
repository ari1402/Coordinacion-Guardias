import { doc, setDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { db } from '../firebase';
import { useCalendarMonth, useFeedback, useResidents, useResidentsById } from '../hooks/data';
import { monthLabel, useMonth } from '../hooks/useMonth';
import { DEFAULT_WEEKDAY_REQUIREMENTS, isoWeekday, resolveCalendarDays } from '../lib/dates';
import { WEEKDAY_KEYS, WEEKDAY_LABELS } from '../types';
import Badge from '../components/Badge';

function FeedbackSummary() {
  const { residents } = useResidents();
  const { feedback, loading } = useFeedback(); // sin filtro: pasa por la rule de admin
  const residentsById = useResidentsById(residents);

  const byResident = useMemo(() => {
    const map = new Map<string, typeof feedback>();
    for (const f of feedback) {
      if (!map.has(f.residentId)) map.set(f.residentId, []);
      map.get(f.residentId)!.push(f);
    }
    return map;
  }, [feedback]);

  if (loading) return <p className="text-text-dim text-sm">Cargando feedback…</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {residents.map((r) => {
          const entries = byResident.get(r.id) ?? [];
          const sinDormir = entries.filter((e) => !e.slept).length;
          const avgConf = entries.length
            ? entries.reduce((a, e) => a + e.conformidad, 0) / entries.length
            : null;
          return (
            <div key={r.id} className="bg-surface border border-border rounded-xl p-3">
              <p className="font-medium text-sm mb-1">{r.shortName}</p>
              <div className="flex gap-1.5 flex-wrap text-xs">
                <Badge tone="neutral">{entries.length} feedbacks</Badge>
                <Badge tone={sinDormir > 0 ? 'critical' : 'good'}>{sinDormir} sin dormir</Badge>
                {avgConf !== null && <Badge tone="info">conformidad {avgConf.toFixed(1)}/5</Badge>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="bg-surface border border-border rounded-xl divide-y divide-border">
        {feedback.map((f) => (
          <div key={f.id} className="p-3 text-sm flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{residentsById.get(f.residentId)?.shortName}</span>
              <span className="text-text-dim">{f.date}</span>
              <Badge tone={f.slept ? 'good' : 'critical'}>{f.slept ? 'Dormiste' : 'No dormiste'}</Badge>
              <Badge tone="neutral">Conformidad {f.conformidad}/5</Badge>
            </div>
            {f.comentario && <p className="text-text-dim">“{f.comentario}”</p>}
          </div>
        ))}
        {feedback.length === 0 && <p className="p-3 text-sm text-text-dim">Sin feedback todavía.</p>}
      </div>
    </div>
  );
}

function CalendarEditor() {
  const { monthKey, next, prev } = useMonth();
  const { days, monthConfigs, loading } = useCalendarMonth(monthKey);
  const resolved = useMemo(() => resolveCalendarDays(days, monthConfigs), [days, monthConfigs]);
  const cfg = monthConfigs.find((c) => c.id === monthKey);
  const weekdayReqs = cfg?.weekdayRequirements ?? DEFAULT_WEEKDAY_REQUIREMENTS;

  async function saveDay(dateISO: string, patch: { isHoliday?: boolean; holidayName?: string; requiredR1Override?: number | null }) {
    await setDoc(doc(db, 'calendarDays', dateISO), { id: dateISO, date: dateISO, ...patch }, { merge: true });
  }

  async function saveWeekdayReq(key: string, value: number) {
    await setDoc(
      doc(db, 'monthConfigs', monthKey),
      { id: monthKey, weekdayRequirements: { ...weekdayReqs, [key]: value } },
      { merge: true },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium capitalize">{monthLabel(monthKey)}</h3>
        <div className="flex gap-2">
          <button onClick={prev} className="px-2 py-1 rounded-lg border border-border text-sm">←</button>
          <button onClick={next} className="px-2 py-1 rounded-lg border border-border text-sm">→</button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-3">
        <p className="text-sm font-medium mb-2">R1 requeridos por día de semana (default del mes)</p>
        <div className="flex gap-2 flex-wrap">
          {WEEKDAY_KEYS.map((key, i) => (
            <label key={key} className="flex flex-col items-center gap-1 text-xs text-text-dim">
              {WEEKDAY_LABELS[i as 0 | 1 | 2 | 3 | 4 | 5 | 6]}
              <input
                type="number"
                min={0}
                value={weekdayReqs[key]}
                onChange={(e) => saveWeekdayReq(key, Number(e.target.value))}
                className="w-14 rounded-lg border border-border bg-surface-2 px-2 py-1 text-center"
              />
            </label>
          ))}
        </div>
      </div>

      {loading && <p className="text-text-dim text-sm">Cargando…</p>}
      {!loading && (
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-dim">
                <th className="px-3 py-2">Día</th>
                <th className="px-3 py-2">Feriado</th>
                <th className="px-3 py-2">Nombre feriado</th>
                <th className="px-3 py-2">R1 override</th>
                <th className="px-3 py-2">Etiquetas</th>
              </tr>
            </thead>
            <tbody>
              {resolved.map((day) => {
                const raw = days.find((d) => d.id === day.id);
                return (
                  <tr key={day.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">{day.date}</td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={day.isHoliday}
                        onChange={(e) => saveDay(day.id, { isHoliday: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        defaultValue={raw?.holidayName ?? ''}
                        onBlur={(e) => saveDay(day.id, { holidayName: e.target.value || undefined })}
                        className="w-32 rounded border border-border bg-surface-2 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        defaultValue={raw?.requiredR1Override ?? ''}
                        placeholder={String(weekdayReqs[WEEKDAY_KEYS[isoWeekday(day.date)]])}
                        onBlur={(e) =>
                          saveDay(day.id, {
                            requiredR1Override: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        className="w-16 rounded border border-border bg-surface-2 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-text-dim">{day.tags.join(', ') || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState<'feedback' | 'calendario'>('feedback');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold">Admin</h1>
          <p className="text-sm text-text-dim">Solo Bea Bravo y Ana Alba ven esta sección.</p>
        </div>
        <Link to="/admin/generador" className="rounded-lg bg-accent text-accent-contrast px-4 py-2 text-sm font-medium">
          Generador de cronograma →
        </Link>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('feedback')}
          className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'feedback' ? 'bg-accent-soft text-accent' : 'text-text-dim'}`}
        >
          Feedback
        </button>
        <button
          onClick={() => setTab('calendario')}
          className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'calendario' ? 'bg-accent-soft text-accent' : 'text-text-dim'}`}
        >
          Calendario
        </button>
      </div>

      {tab === 'feedback' ? <FeedbackSummary /> : <CalendarEditor />}

      <p className="text-xs text-text-dim">
        Para crear cuentas nuevas: creá el usuario en Firebase Authentication (Console) y después un
        documento en <code className="bg-surface-2 px-1 rounded">residents/&#123;uid&#125;</code> con su
        nombre, email y rol (el color del calendario/gráficos se asigna solo).
      </p>
    </div>
  );
}

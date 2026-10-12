import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore';
import { useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../firebase';
import { useEvents } from '../hooks/data';
import { logActivity } from '../lib/activity';
import { addDaysISO, isoWeekday, shortDateLabel, todayISO } from '../lib/dates';
import type { CamadaEvent } from '../types';
import { NOTE_CATEGORIES, WEEKDAY_LABELS } from '../types';
import Badge from './Badge';
import { Card, Empty, btnPrimary, inputCls } from './ui';

/** Fechas entre `from` y `to` (inclusive); con `weekly`, solo las del mismo día de semana que `from`. */
export function expandDates(from: string, to: string, weekly: boolean): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDaysISO(d, weekly ? 7 : 1)) out.push(d);
  return out;
}

/** Próximas fechas de eventos (desde hoy), ordenadas. */
export function upcomingEventDates(events: CamadaEvent[], from: string, max: number) {
  return events
    .flatMap((e) => e.dates.filter((d) => d >= from).map((date) => ({ date, event: e })))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, max);
}

export function eventEmoji(e: CamadaEvent) {
  return e.category === 'AAARBA' || e.category === 'Cursos y clases' ? '🎓' : '📆';
}

function rangeLabel(e: CamadaEvent) {
  const first = e.dates[0];
  const last = e.dates[e.dates.length - 1];
  if (e.dates.length === 1) return shortDateLabel(first);
  const weekly = e.dates.every((d) => isoWeekday(d) === isoWeekday(first));
  return weekly
    ? `${WEEKDAY_LABELS[isoWeekday(first) as 0].toLowerCase()}s del ${shortDateLabel(first)} al ${shortDateLabel(last)} (${e.dates.length})`
    : `${shortDateLabel(first)} al ${shortDateLabel(last)}`;
}

export default function EventsPanel() {
  const { resident: me, isAdmin } = useAuthContext();
  const { events } = useEvents();
  const today = todayISO();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>('AAARBA');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState('');
  const [weekly, setWeekly] = useState(true);
  const [notes, setNotes] = useState('');
  const dates = to && to >= from ? expandDates(from, to, weekly) : [from];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !me) return;
    await addDoc(collection(db, 'events'), {
      title: title.trim(),
      category,
      dates,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      createdBy: me.id,
      createdAt: new Date().toISOString(),
    });
    await logActivity({ entity: 'evento', summary: `Agregó el evento "${title.trim()}" (${dates.length} fecha(s))` });
    setTitle('');
    setNotes('');
    setTo('');
  }

  async function remove(ev: CamadaEvent) {
    if (!confirm(`¿Borrar "${ev.title}"?`)) return;
    await deleteDoc(doc(db, 'events', ev.id));
    await logActivity({ entity: 'evento', summary: `Borró el evento "${ev.title}"` });
  }

  const sorted = [...events].sort((a, b) => (a.dates[0] ?? '').localeCompare(b.dates[0] ?? ''));
  const current = sorted.filter((e) => (e.dates.at(-1) ?? '') >= today);
  const past = sorted.filter((e) => (e.dates.at(-1) ?? '') < today);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Nuevo evento" subtitle="Clases, cursos, ateneos… Se ven en el calendario y en el Inicio." className="h-fit">
        <form onSubmit={add} className="flex flex-col gap-2.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (p. ej. Clases AAARBA)" className={inputCls} required />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {NOTE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-text-dim flex flex-col gap-1">
              Desde
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} required />
            </label>
            <label className="text-xs text-text-dim flex flex-col gap-1">
              Hasta (opcional)
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </label>
          </div>
          {to && (
            <label className="flex items-center gap-2 text-sm text-text-dim">
              <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
              Solo los {WEEKDAY_LABELS[isoWeekday(from) as 0].toLowerCase()}
            </label>
          )}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notas (horario, lugar…)" className={inputCls} />
          <p className="text-xs text-text-dim">
            {dates.length} fecha(s): {dates.slice(0, 6).map(shortDateLabel).join(', ')}
            {dates.length > 6 ? '…' : ''}
          </p>
          <button className={btnPrimary}>Agregar</button>
        </form>
      </Card>
      <div className="lg:col-span-2 flex flex-col gap-3">
        {current.length === 0 && <Empty>No hay eventos próximos.</Empty>}
        {[...current, ...past].map((ev) => {
          const next = ev.dates.find((d) => d >= today);
          return (
            <Card key={ev.id} className={next ? undefined : 'opacity-60'}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {eventEmoji(ev)} {ev.title} {ev.category && <Badge>{ev.category}</Badge>}
                  </p>
                  <p className="text-sm text-text-dim mt-0.5">{rangeLabel(ev)}</p>
                  {next && <p className="text-sm mt-1">Próxima: <b className="capitalize">{shortDateLabel(next)}</b></p>}
                  {ev.notes && <p className="text-sm mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{ev.notes}</p>}
                </div>
                {(isAdmin || ev.createdBy === me?.id) && (
                  <button onClick={() => remove(ev)} className="text-xs text-danger underline shrink-0">
                    borrar
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

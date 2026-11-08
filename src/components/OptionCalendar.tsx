import clsx from 'clsx';
import { useState } from 'react';
import { monthLabel } from '../lib/dates';
import { TAG_EMOJI, dayBgClass } from '../lib/labels';
import type { Resident, ResolvedDay } from '../types';
import { Dot, Modal } from './ui';

const WD = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Pop-up con el calendario del mes de una opción del generador (o del editor):
 * quién está cada día, con una persona resaltada si se elige.
 */
export default function OptionCalendarModal({
  open,
  onClose,
  title,
  monthKey,
  days,
  slots,
  residents,
  color,
  initialPerson,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  monthKey: string;
  days: ResolvedDay[];
  slots: { date: string; slotIndex: number; residentId: string | null }[];
  residents: Resident[];
  color: (id: string) => string;
  initialPerson?: string | null;
}) {
  const [person, setPerson] = useState<string | null>(initialPerson ?? null);
  const byDate = new Map<string, string[]>();
  for (const s of slots) if (s.residentId) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s.residentId]);
  const name = (id: string) => residents.find((r) => r.id === id)?.shortName ?? '?';
  const lead = days[0]?.weekday ?? 0;
  const count = person ? slots.filter((s) => s.residentId === person).length : 0;

  return (
    <Modal open={open} onClose={onClose} title={`${title} — ${monthLabel(monthKey)}`} wide>
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          onClick={() => setPerson(null)}
          className={clsx('px-2.5 py-1 rounded-full text-xs border', !person ? 'bg-accent-soft border-accent text-accent' : 'border-border text-text-dim')}
        >
          Todas
        </button>
        {residents.map((r) => (
          <button
            key={r.id}
            onClick={() => setPerson(r.id)}
            className={clsx(
              'px-2.5 py-1 rounded-full text-xs border flex items-center gap-1.5',
              person === r.id ? 'bg-accent-soft border-accent text-accent' : 'border-border text-text-dim',
            )}
          >
            <Dot color={color(r.id)} />
            {r.shortName}
          </button>
        ))}
      </div>
      {person && (
        <p className="text-sm mb-2">
          <b>{name(person)}</b>: {count} guardia{count === 1 ? '' : 's'} este mes.
        </p>
      )}
      <div className="grid grid-cols-7 gap-1 text-[10px] sm:text-xs">
        {WD.map((w) => (
          <div key={w} className="text-center text-text-dim font-medium py-1">
            {w}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`v${i}`} />
        ))}
        {days.map((d) => {
          const who = byDate.get(d.date) ?? [];
          const mine = !!person && who.includes(person);
          return (
            <div
              key={d.date}
              className={clsx(
                'rounded-lg border p-0.5 sm:p-1 min-h-[3.75rem] flex flex-col gap-0.5 min-w-0',
                dayBgClass(d),
                mine ? 'border-accent ring-2 ring-accent' : 'border-border',
                person && !mine && 'opacity-50',
              )}
              title={d.holidayName ?? undefined}
            >
              <span className="flex items-center justify-between">
                <span className="font-semibold">{Number(d.date.slice(8))}</span>
                <span>{d.tags.map((t) => TAG_EMOJI[t]).filter(Boolean).slice(0, 1).join('')}</span>
              </span>
              {d.requiredR1 === 0 && who.length === 0 ? (
                <span className="text-text-dim">—</span>
              ) : (
                who.map((id, i) => (
                  <span
                    key={`${id}${i}`}
                    className={clsx('flex items-center gap-0.5 sm:gap-1 min-w-0', person === id && 'font-bold')}
                  >
                    <Dot color={color(id)} />
                    <span className="truncate tracking-tight sm:tracking-normal">{name(id)}</span>
                  </span>
                ))
              )}
              {d.requiredR1 > who.length && who.length > 0 && <span className="text-danger">falta {d.requiredR1 - who.length}</span>}
              {d.requiredR1 > 0 && who.length === 0 && <span className="text-danger">sin asignar</span>}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

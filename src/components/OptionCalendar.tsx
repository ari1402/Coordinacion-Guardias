import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { monthLabel, shortDateLabel } from '../lib/dates';
import { TAG_EMOJI, dayBgClass } from '../lib/labels';
import type { Resident, ResolvedDay } from '../types';
import { PrevDayCell, PrevMonthLabel, prevTailDates, type PrevAssignment } from './PrevDays';
import { Dot, Modal, inputCls } from './ui';

const WD = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export interface DayMarks {
  blocked: Set<string>;
  off: Set<string>;
  on: Set<string>;
}

/**
 * Pop-up con el calendario del mes de una opción del generador (o del editor):
 * quién está cada día, con una persona resaltada si se elige. Si viene
 * `onChange`, tocando un día se puede cambiar quién lo hace.
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
  prevAssignments = [],
  onChange,
  editNote,
  issueBySlot,
  dayMarks,
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
  prevAssignments?: PrevAssignment[];
  onChange?: (date: string, slotIndex: number, residentId: string | null) => void;
  /** Aclaración para el que edita (p. ej. "al cambiar, esta opción pasa al editor"). */
  editNote?: string;
  issueBySlot?: Map<string, 'hard' | 'soft'>;
  dayMarks?: Map<string, DayMarks>;
}) {
  const [person, setPerson] = useState<string | null>(initialPerson ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected]);

  const byDate = new Map<string, { slotIndex: number; residentId: string | null }[]>();
  for (const s of slots) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s].sort((a, b) => a.slotIndex - b.slotIndex));
  const name = (id: string) => residents.find((r) => r.id === id)?.shortName ?? '?';
  const count = person ? slots.filter((s) => s.residentId === person).length : 0;
  const issue = (date: string) => {
    const sev = (byDate.get(date) ?? []).map((s) => issueBySlot?.get(`${date}_${s.slotIndex}`));
    return sev.includes('hard') ? 'hard' : sev.includes('soft') ? 'soft' : null;
  };
  const selDay = days.find((d) => d.date === selected);

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
      {onChange && <p className="text-xs text-text-dim mb-2">Tocá un día para cambiar quién lo hace. {editNote}</p>}
      <div className="grid grid-cols-7 gap-1 text-[10px] sm:text-xs">
        {WD.map((w) => (
          <div key={w} className="text-center text-text-dim font-medium py-1">
            {w}
          </div>
        ))}
        <PrevMonthLabel monthKey={monthKey} />
        {prevTailDates(monthKey).map((d) => (
          <PrevDayCell
            key={d}
            date={d}
            people={prevAssignments.filter((a) => a.date === d).map((a) => a.residentId)}
            name={name}
            color={color}
          />
        ))}
        {days.map((d) => {
          const who = (byDate.get(d.date) ?? []).map((s) => s.residentId).filter((x): x is string => !!x);
          const mine = !!person && who.includes(person);
          const sev = issue(d.date);
          const Tag = onChange ? 'button' : 'div';
          return (
            <Tag
              key={d.date}
              {...(onChange ? { onClick: () => setSelected(d.date === selected ? null : d.date), type: 'button' as const } : {})}
              className={clsx(
                'rounded-lg border p-0.5 sm:p-1 min-h-[3.75rem] flex flex-col gap-0.5 min-w-0 text-left',
                dayBgClass(d),
                selected === d.date
                  ? 'border-accent ring-2 ring-accent'
                  : mine
                    ? 'border-accent ring-2 ring-accent'
                    : sev === 'hard'
                      ? 'border-danger ring-1 ring-danger'
                      : sev === 'soft'
                        ? 'border-warn'
                        : 'border-border',
                person && !mine && selected !== d.date && 'opacity-50',
              )}
              title={d.holidayName ?? undefined}
            >
              <span className="flex items-center justify-between w-full">
                <span className="font-semibold">{Number(d.date.slice(8))}</span>
                <span>{d.tags.map((t) => TAG_EMOJI[t]).filter(Boolean).slice(0, 1).join('')}</span>
              </span>
              {d.requiredR1 === 0 && who.length === 0 ? (
                <span className="text-text-dim">—</span>
              ) : (
                who.map((id, i) => (
                  <span key={`${id}${i}`} className={clsx('flex items-center gap-0.5 sm:gap-1 min-w-0', person === id && 'font-bold')}>
                    <Dot color={color(id)} />
                    <span className="truncate tracking-tight sm:tracking-normal">{name(id)}</span>
                  </span>
                ))
              )}
              {d.requiredR1 > who.length && who.length > 0 && <span className="text-danger">falta {d.requiredR1 - who.length}</span>}
              {d.requiredR1 > 0 && who.length === 0 && <span className="text-danger">sin asignar</span>}
            </Tag>
          );
        })}
      </div>

      {onChange && selDay && (
        <div ref={editorRef} className="mt-3 rounded-xl border border-accent/40 bg-accent-soft p-3 flex flex-col gap-2">
          <p className="text-sm font-medium capitalize">{shortDateLabel(selDay.date)}</p>
          {(byDate.get(selDay.date) ?? []).length === 0 && <p className="text-sm text-text-dim">Ese día no lleva R1.</p>}
          {(byDate.get(selDay.date) ?? []).map((s) => {
            const marks = dayMarks?.get(selDay.date);
            return (
              <select
                key={s.slotIndex}
                value={s.residentId ?? ''}
                onChange={(e) => onChange(selDay.date, s.slotIndex, e.target.value || null)}
                className={inputCls}
              >
                <option value="">— libre —</option>
                {residents.map((r) => {
                  const mark = marks?.blocked.has(r.id) ? ' ⛔' : marks?.off.has(r.id) ? ' 🙅' : marks?.on.has(r.id) ? ' 🙋' : '';
                  return (
                    <option key={r.id} value={r.id}>
                      {r.shortName}
                      {mark}
                    </option>
                  );
                })}
              </select>
            );
          })}
          <p className="text-xs text-text-dim">⛔ no puede · 🙅 pidió no estar · 🙋 pidió estar. El cambio queda fijado (🔒) en el editor.</p>
        </div>
      )}
    </Modal>
  );
}

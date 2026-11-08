import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { monthLabel, shortDateLabel } from '../lib/dates';
import { TAG_EMOJI, dayBgClass } from '../lib/labels';
import type { Suggestion } from '../lib/generator';
import type { DraftSlot, Resident, ResolvedDay } from '../types';
import { NextDaysCells, NextMonthLabel, PrevDayCell, PrevMonthLabel, prevTailDates, type PrevAssignment } from './PrevDays';
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
  nextAssignments = [],
  onChange,
  editNote,
  issueBySlot,
  dayMarks,
  onSuggest,
  onApply,
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
  nextAssignments?: PrevAssignment[];
  onChange?: (date: string, slotIndex: number, residentId: string | null) => void;
  /** Aclaración para el que edita (p. ej. "al cambiar, esta opción pasa al editor"). */
  editNote?: string;
  issueBySlot?: Map<string, 'hard' | 'soft'>;
  dayMarks?: Map<string, DayMarks>;
  /** Mejores formas de sacar a quien está en ese lugar (reemplazo o intercambio). */
  onSuggest?: (date: string, slotIndex: number) => Suggestion[];
  onApply?: (slots: DraftSlot[]) => void;
}) {
  const [person, setPerson] = useState<string | null>(initialPerson ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const [suggestFor, setSuggestFor] = useState<{ key: string; list: Suggestion[] } | null>(null);
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
        <NextMonthLabel monthKey={monthKey} />
        <NextDaysCells monthKey={monthKey} assignments={nextAssignments} name={name} color={color} />
      </div>

      {onChange && selDay && (
        <div ref={editorRef} className="mt-3 rounded-xl border border-accent/40 bg-accent-soft p-3 flex flex-col gap-2">
          <p className="text-sm font-medium capitalize">{shortDateLabel(selDay.date)}</p>
          {(byDate.get(selDay.date) ?? []).length === 0 && <p className="text-sm text-text-dim">Ese día no lleva R1.</p>}
          {(byDate.get(selDay.date) ?? []).map((s) => {
            const marks = dayMarks?.get(selDay.date);
            const key = `${selDay.date}_${s.slotIndex}`;
            return (
              <div key={s.slotIndex} className="flex flex-col gap-1.5">
              <div className="flex gap-2 items-center">
              <select
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
              {onSuggest && s.residentId && (
                <button
                  type="button"
                  onClick={() => setSuggestFor(suggestFor?.key === key ? null : { key, list: onSuggest(selDay.date, s.slotIndex) })}
                  className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs hover:bg-surface-2"
                >
                  🔄 Buscar reemplazo
                </button>
              )}
              </div>
              {suggestFor?.key === key && (
                <SuggestionList
                  list={suggestFor.list}
                  name={name}
                  onApply={(slots) => {
                    onApply?.(slots);
                    setSuggestFor(null);
                  }}
                />
              )}
              </div>
            );
          })}
          <p className="text-xs text-text-dim">⛔ no puede · 🙅 pidió no estar · 🙋 pidió estar. El cambio queda fijado (🔒) en el editor.</p>
        </div>
      )}
    </Modal>
  );
}

function SuggestionList({ list, name, onApply }: { list: Suggestion[]; name: (id: string) => string; onApply: (slots: DraftSlot[]) => void }) {
  if (list.length === 0) return <p className="text-xs text-text-dim">No encontré alternativas.</p>;
  const n = (id: string | null) => (id ? name(id) : 'nadie');
  return (
    <ol className="flex flex-col gap-1.5">
      {list.map((sug, i) => {
        const [a, b] = sug.changes;
        return (
          <li key={i} className="rounded-lg bg-surface border border-border p-2 text-xs flex flex-col gap-1">
            <span className="text-sm">
              {sug.kind === 'reemplazo' ? (
                <>
                  Poner a <b>{n(a.to)}</b> en lugar de {n(a.from)}
                </>
              ) : (
                <>
                  Intercambiar: <b>{n(a.from)}</b> pasa al <span className="capitalize">{shortDateLabel(b.date)}</span> y <b>{n(b.from)}</b> al{' '}
                  <span className="capitalize">{shortDateLabel(a.date)}</span>
                </>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              {sug.newIssues.length === 0 ? (
                <span className="text-ok">✅ sin problemas nuevos</span>
              ) : (
                <span className="text-warn">⚠️ {sug.newIssues.length} problema{sug.newIssues.length === 1 ? '' : 's'} nuevo{sug.newIssues.length === 1 ? '' : 's'}</span>
              )}
              {sug.costDelta < 0 && <span className="text-ok">· mejora el reparto</span>}
              <button type="button" onClick={() => onApply(sug.slots)} className="ml-auto rounded-md bg-accent text-accent-contrast px-2.5 py-1 font-medium">
                Aplicar
              </button>
            </span>
            {sug.newIssues.length > 0 && (
              <ul className="text-text-dim list-disc pl-4">
                {sug.newIssues.slice(0, 3).map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

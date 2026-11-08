import { addDaysISO, isoWeekday, monthLabel, shiftMonthKey } from '../lib/dates';
import { Dot } from './ui';

const WD = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Últimos días del mes anterior para mostrar antes del día 1 en una grilla
 * semanal: la semana completa anterior más los días de la primera semana que
 * son del mes anterior (así se ve con qué viene cada una).
 */
export function prevTailDates(monthKey: string): string[] {
  const first = `${monthKey}-01`;
  const count = isoWeekday(first) + 7;
  return Array.from({ length: count }, (_, i) => addDaysISO(first, i - count));
}

export interface PrevAssignment {
  date: string;
  residentId: string;
}

/** Celda de solo lectura de un día del mes anterior (atenuada). */
export function PrevDayCell({
  date,
  people,
  name,
  color,
  className = 'min-h-[3.75rem]',
}: {
  date: string;
  people: string[];
  name: (id: string) => string;
  color: (id: string) => string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-dashed border-border bg-surface-2/60 p-0.5 sm:p-1 flex flex-col gap-0.5 min-w-0 opacity-70 ${className}`}
      title="Mes anterior (solo para ver)"
    >
      <span className="text-[10px] sm:text-xs text-text-dim">
        {Number(date.slice(8))}/{Number(date.slice(5, 7))}
      </span>
      {people.map((id, i) => (
        <span key={`${id}${i}`} className="flex items-center gap-0.5 sm:gap-1 min-w-0 text-[10px] sm:text-xs">
          <Dot color={color(id)} />
          <span className="truncate">{name(id)}</span>
        </span>
      ))}
    </div>
  );
}

/** Línea que separa el mes anterior en una grilla de 7 columnas. */
export function PrevMonthLabel({ monthKey }: { monthKey: string }) {
  return (
    <div className="col-span-7 text-[11px] text-text-dim pt-1">
      ↩ Últimos días de {monthLabel(shiftMonthKey(monthKey, -1)).split(' ')[0].toLowerCase()} (solo para ver)
    </div>
  );
}

/** Lista compacta (para vistas que no son grilla): los últimos 7 días del mes anterior. */
export function PrevDaysStrip({
  monthKey,
  assignments,
  name,
  color,
}: {
  monthKey: string;
  assignments: PrevAssignment[];
  name: (id: string) => string;
  color: (id: string) => string;
}) {
  const first = `${monthKey}-01`;
  const dates = Array.from({ length: 7 }, (_, i) => addDaysISO(first, i - 7));
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-2/60 px-3 py-2 mb-3">
      <p className="text-xs text-text-dim mb-1.5">
        ↩ Últimos días de {monthLabel(shiftMonthKey(monthKey, -1)).split(' ')[0].toLowerCase()} (solo para ver)
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {dates.map((d) => {
          const people = assignments.filter((a) => a.date === d).map((a) => a.residentId);
          return (
            <span key={d} className="flex items-center gap-1">
              <span className="text-text-dim">
                {WD[isoWeekday(d)]} {Number(d.slice(8))}:
              </span>
              {people.length === 0 ? (
                <span className="text-text-dim">—</span>
              ) : (
                people.map((id, i) => (
                  <span key={`${id}${i}`} className="flex items-center gap-1">
                    <Dot color={color(id)} />
                    {name(id)}
                  </span>
                ))
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

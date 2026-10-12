import type { DayTag, DraftSlot, ResolvedDay, Weekday } from '../types';
import { addDaysISO, diffDays, hasTag, isSabadoOrPreferiado, weekendBlock } from './dates';
import type { PriorCounts } from './generator';

export interface PersonShift {
  date: string;
  weekday: Weekday;
  tags: DayTag[];
  /** Días desde la guardia anterior (la primera del mes cuenta desde el mes anterior). */
  gapBefore: number | null;
  locked?: boolean;
  raffle?: boolean;
}

export interface PersonBreakdown {
  residentId: string;
  shifts: PersonShift[];
  count: number;
  byWeekday: number[];
  sabPref: number;
  feriados: number;
  xl: number;
  juevesFelices: number;
  findeTotal: number;
  findesLibres: number;
  findesLibres100: number;
  /** Findes largos libres (sin contar el finde XL) y cuántos findes largos tiene el mes. */
  findesLargosLibres: number;
  findesLargosDelMes: number;
  findesDelMes: number;
  minGap: number | null;
  avgGap: number | null;
  cumTotal: number;
  cumSabPref: number;
}

/** Detalle mes a mes de cada persona para un borrador u opción del generador. */
export function buildBreakdown(
  days: ResolvedDay[],
  slots: DraftSlot[],
  residentIds: string[],
  prior: Record<string, PriorCounts> = {},
): Record<string, PersonBreakdown> {
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const saturdays = days.filter((d) => d.weekday === 5);
  const holidays = new Set(days.filter((d) => d.isHoliday).map((d) => d.date));
  const blocks = saturdays.map((sat) => weekendBlock(sat.date, (d) => holidays.has(d)));

  return Object.fromEntries(
    residentIds.map((id) => {
      const mine = slots
        .filter((s) => s.residentId === id)
        .sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex);
      const dates = new Set(mine.map((s) => s.date));
      let prev = prior[id]?.lastShiftDate ?? null;
      const gaps: number[] = [];
      const shifts: PersonShift[] = mine.map((s) => {
        const day = dayByDate.get(s.date)!;
        const gapBefore = prev ? diffDays(prev, s.date) : null;
        if (gapBefore !== null) gaps.push(gapBefore);
        prev = s.date;
        return { date: s.date, weekday: day.weekday, tags: day.tags, gapBefore, locked: s.locked, raffle: !!s.raffleId };
      });
      const list = shifts.map((s) => dayByDate.get(s.date)!);
      const libres = blocks.filter((b) => [b.eve, ...b.days].every((d) => !dates.has(d)));
      const largosLibres = libres.filter((b) => b.long && !dates.has(addDaysISO(b.eve, -1)));
      const sabPref = list.filter(isSabadoOrPreferiado).length;
      return [
        id,
        {
          residentId: id,
          shifts,
          count: shifts.length,
          byWeekday: [0, 1, 2, 3, 4, 5, 6].map((w) => list.filter((d) => d.weekday === w).length),
          sabPref,
          feriados: list.filter((d) => d.isHoliday).length,
          xl: list.filter((d) => hasTag(d, 'finde_xl')).length,
          juevesFelices: list.filter((d) => hasTag(d, 'jueves_feliz')).length,
          findeTotal: list.filter((d) => d.weekday >= 4).length,
          findesLibres: libres.length,
          findesLibres100: libres.filter((b) => !dates.has(addDaysISO(b.eve, -1))).length,
          findesLargosLibres: largosLibres.length,
          findesLargosDelMes: blocks.filter((b) => b.long).length,
          findesDelMes: saturdays.length,
          minGap: gaps.length ? Math.min(...gaps) : null,
          avgGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
          cumTotal: (prior[id]?.total ?? 0) + shifts.length,
          cumSabPref: (prior[id]?.sabPref ?? 0) + sabPref,
        },
      ];
    }),
  );
}

import type { DayTag, DraftSlot, ResolvedDay, Weekday } from '../types';
import { addDaysISO, diffDays, hasTag, isBusinessDay, isSabadoOrPreferiado, isSpecialHolidayBlock, isoWeekday, weekendBlock, weekendFreeness } from './dates';
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
  /** Feriados acumulados (antes del mes + este mes). */
  cumFeriados: number;
  /** Findes libres acumulados (antes del mes + este mes). */
  cumFindesLibres: number;
}

/** Detalle mes a mes de cada persona para un borrador u opción del generador. */
export function buildBreakdown(
  days: ResolvedDay[],
  slots: DraftSlot[],
  residentIds: string[],
  prior: Record<string, PriorCounts> = {},
  {
    outside = {},
    away = new Set(),
    holidays: extraHolidays = new Set(),
  }: {
    /** Guardias de cada una fuera de este mes (para los findes que cruzan de mes). */
    outside?: Record<string, string[]>;
    /** Quienes están de vacaciones este mes: sus findes no cuentan como libres. */
    away?: Set<string>;
    /** Todos los feriados (también los de otros meses), para los findes que cruzan de mes. */
    holidays?: Set<string>;
  } = {},
): Record<string, PersonBreakdown> {
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const saturdays = days.filter((d) => d.weekday === 5);
  const holidays = new Set([...extraHolidays, ...days.filter((d) => d.isHoliday).map((d) => d.date)]);
  const isHoliday = (d: string) => holidays.has(d);
  // Navidad y Año Nuevo no cuentan (ni como libres ni en el total).
  const blocks = saturdays.map((sat) => weekendBlock(sat.date, isHoliday)).filter((b) => !isSpecialHolidayBlock(b));
  // Finde que viene del mes anterior (p. ej. sáb 31/10 + dom 1/11): también lo
  // decide este mes, así que se cuenta acá.
  const first = days[0]?.date;
  let boundary: ReturnType<typeof weekendBlock> | null = null;
  if (first && !isBusinessDay(first, isHoliday)) {
    const start = weekendBlock(first, isHoliday);
    if (start.days[0] < first && !blocks.some((b) => b.days.includes(first)) && !isSpecialHolidayBlock(start)) {
      blocks.unshift(start);
      boundary = start;
    }
  }

  return Object.fromEntries(
    residentIds.map((id) => {
      const mine = slots
        .filter((s) => s.residentId === id)
        .sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex);
      const dates = new Set([...mine.map((s) => s.date), ...(outside[id] ?? [])]);
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
      const libres = away.has(id) ? [] : blocks.filter((b) => weekendFreeness(b, (d) => dates.has(d)).free);
      // El acumulado previo ya contó el finde que cruza de mes como libre si en el
      // mes anterior no trabajó esos días: no se cuenta dos veces.
      const out = new Set(outside[id] ?? []);
      const boundaryInPrior = !!boundary && weekendFreeness(boundary, (d) => d < first! && out.has(d)).free;
      const largosLibres = libres.filter((b) => b.long && weekendFreeness(b, (d) => dates.has(d)).full && !dates.has(addDaysISO(b.eve, -1)));
      const sabPref = list.filter(isSabadoOrPreferiado).length;
      const feriados = list.filter((d) => d.isHoliday).length;
      return [
        id,
        {
          residentId: id,
          shifts,
          count: shifts.length,
          byWeekday: [0, 1, 2, 3, 4, 5, 6].map((w) => list.filter((d) => d.weekday === w).length),
          sabPref,
          feriados,
          xl: list.filter((d) => hasTag(d, 'finde_xl')).length,
          juevesFelices: list.filter((d) => hasTag(d, 'jueves_feliz')).length,
          findeTotal: list.filter((d) => d.weekday >= 4).length,
          findesLibres: libres.length,
          findesLibres100: libres.filter((b) => {
            const full = weekendFreeness(b, (d) => dates.has(d)).full;
            const sat = b.days.find((d) => isoWeekday(d) === 5) ?? b.days[0];
            return !dates.has(addDaysISO(full ? b.eve : addDaysISO(sat, -1), -1));
          }).length,
          findesLargosLibres: largosLibres.length,
          findesLargosDelMes: blocks.filter((b) => b.long).length,
          findesDelMes: blocks.length,
          minGap: gaps.length ? Math.min(...gaps) : null,
          avgGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
          cumTotal: (prior[id]?.total ?? 0) + shifts.length,
          cumSabPref: (prior[id]?.sabPref ?? 0) + sabPref,
          cumFeriados: (prior[id]?.feriado ?? 0) + feriados,
          cumFindesLibres:
            Math.max(0, (prior[id]?.findesLibres ?? 0) - (boundaryInPrior && prior[id]?.findesLibres ? 1 : 0)) + libres.length,
        },
      ];
    }),
  );
}

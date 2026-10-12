import type { CalendarDay, EquityCounters, MonthConfig, ResolvedDay, Shift } from '../types';
import { addDaysISO, gapsBetween, hasTag, monthKey, monthsBetween, resolveMonths } from './dates';

/**
 * Contadores de equidad de un residente. Usa siempre `actualResidentId`
 * (quien realmente hizo la guardia), así un cambio se refleja en el
 * histórico. `days` define el período: solo se cuentan fines de semana
 * libres de esos días, y deben incluir los días de todas las guardias.
 * `away` = meses en que no hace guardias (vacaciones): sus findes no cuentan
 * como "findes libres".
 */
export function computeEquityCounters(
  residentId: string,
  shifts: Shift[],
  days: ResolvedDay[],
  away?: Set<string>,
): EquityCounters {
  const dayById = new Map(days.map((d) => [d.id, d]));
  const mine = shifts
    .filter((s) => s.actualResidentId === residentId && s.status !== 'cancelada')
    .sort((a, b) => a.date.localeCompare(b.date));
  const occupied = new Set(mine.map((s) => s.date));

  const c: EquityCounters = {
    residentId,
    totalGuardias: mine.length,
    lunAMie: 0,
    jueves: 0,
    viernes: 0,
    sabados: 0,
    sabadosFindeLargo: 0,
    sabadosSinCompensar: 0,
    domingos: 0,
    preferiados: 0,
    sabadosYPreferiados: 0,
    feriados: 0,
    findesXL: 0,
    juevesFelices: 0,
    findeTotal: 0,
    findesLibresA: 0,
    findesLibresB: 0,
    distanciaMinima: null,
    distanciaPromedio: null,
    sinDormir: 0,
    conReporteSueno: 0,
  };

  for (const s of mine) {
    if (s.slept === false) c.sinDormir++;
    if (s.slept !== undefined) c.conReporteSueno++;
    const day = dayById.get(s.date);
    if (!day) continue;
    if (day.weekday <= 2) c.lunAMie++;
    if (day.weekday === 3) c.jueves++;
    if (day.weekday === 4) c.viernes++;
    if (day.weekday === 5) c.sabados++;
    if (hasTag(day, 'sabado_finde_largo')) c.sabadosFindeLargo++;
    if (day.weekday === 6) c.domingos++;
    if (day.weekday >= 4) c.findeTotal++;
    if (hasTag(day, 'preferiado')) c.preferiados++;
    if (day.isHoliday) c.feriados++;
    if (hasTag(day, 'finde_xl')) c.findesXL++;
    if (hasTag(day, 'jueves_feliz')) c.juevesFelices++;
  }
  c.sabadosYPreferiados = c.sabados + c.preferiados;

  // El sábado se compensa con un jueves feliz (o finde XL) del mismo mes.
  const perMonth = new Map<string, { sab: number; jue: number }>();
  for (const s of mine) {
    const day = dayById.get(s.date);
    if (!day) continue;
    const m = perMonth.get(monthKey(s.date)) ?? { sab: 0, jue: 0 };
    if (day.weekday === 5) m.sab++;
    if (hasTag(day, 'jueves_feliz') || hasTag(day, 'finde_xl')) m.jue++;
    perMonth.set(monthKey(s.date), m);
  }
  for (const m of perMonth.values()) c.sabadosSinCompensar += Math.max(0, m.sab - m.jue);

  for (const day of days) {
    if (day.weekday !== 5) continue; // un finde se evalúa una vez, en su sábado
    if (away?.has(monthKey(day.date))) continue;
    const free = [-1, 0, 1].every((d) => !occupied.has(addDaysISO(day.date, d)));
    if (free) {
      c.findesLibresA++;
      if (!occupied.has(addDaysISO(day.date, -2))) c.findesLibresB++;
    }
  }

  const gaps = gapsBetween(mine.map((s) => s.date));
  if (gaps.length) {
    c.distanciaMinima = Math.min(...gaps);
    c.distanciaPromedio = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }
  return c;
}

export function computeAllEquityCounters(
  residentIds: string[],
  shifts: Shift[],
  days: ResolvedDay[],
  away?: Record<string, Set<string>>,
): Record<string, EquityCounters> {
  return Object.fromEntries(residentIds.map((id) => [id, computeEquityCounters(id, shifts, days, away?.[id])]));
}

/** Meses (ordenados) que tienen al menos una guardia cargada. */
export function monthsWithShifts(shifts: Shift[]): string[] {
  return [...new Set(shifts.map((s) => monthKey(s.date)))].sort();
}

/**
 * Días resueltos de todos los meses con guardias (o de los meses pedidos),
 * para alimentar computeEquityCounters sobre el acumulado.
 */
export function resolvePeriod(
  shifts: Shift[],
  storedDays: CalendarDay[],
  configs: MonthConfig[],
  months?: string[],
): ResolvedDay[] {
  const keys = months ?? monthsWithShifts(shifts);
  if (keys.length === 0) return [];
  const all = months ? keys : monthsBetween(keys[0], keys[keys.length - 1]);
  return resolveMonths(all, storedDays, configs);
}

export interface Comparison {
  value: number;
  mean: number;
  delta: number;
}

export function compareToGroup(
  counters: Record<string, EquityCounters>,
  residentId: string,
  key: keyof EquityCounters,
): Comparison {
  const values = Object.values(counters).map((c) => Number(c[key] ?? 0));
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const value = Number(counters[residentId]?.[key] ?? 0);
  return { value, mean, delta: value - mean };
}

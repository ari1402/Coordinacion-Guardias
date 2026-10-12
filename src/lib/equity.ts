import type { EquityCounters, ResolvedDay, Shift } from '../types';
import { addDaysISO, gapsBetween, hasTag } from './dates';

/**
 * Calcula los contadores de equidad de un residente para un conjunto de
 * guardias + calendario ya resuelto. Usa siempre `actualResidentId` (quien
 * realmente hizo la guardia), no la asignación original — así un swap
 * posterior se refleja en el histórico (ver types.ts, sección Shift).
 */
export function computeEquityCounters(
  residentId: string,
  shifts: Shift[],
  resolvedDays: ResolvedDay[],
): EquityCounters {
  const dayById = new Map(resolvedDays.map((d) => [d.id, d]));
  const mine = shifts
    .filter((s) => s.actualResidentId === residentId && s.status !== 'cancelada')
    .sort((a, b) => a.date.localeCompare(b.date));

  const occupied = new Set(mine.map((s) => s.date));
  const dayOf = (s: Shift) => dayById.get(s.date);

  let sabados = 0;
  let preferiados = 0;
  let feriados = 0;
  let findesXL = 0;
  let juevesFelices = 0;
  let viernes = 0;
  let domingos = 0;

  for (const s of mine) {
    const day = dayOf(s);
    if (!day) continue;
    if (day.weekday === 5) sabados++;
    if (hasTag(day, 'preferiado')) preferiados++;
    if (day.isHoliday) feriados++;
    if (hasTag(day, 'finde_xl')) findesXL++;
    if (hasTag(day, 'jueves_feliz')) juevesFelices++;
    if (day.weekday === 4) viernes++;
    if (day.weekday === 6) domingos++;
  }

  let findesLibresA = 0;
  let findesLibresB = 0;
  for (const day of resolvedDays) {
    if (day.weekday !== 5) continue; // solo evaluamos una vez por finde, en el sábado
    const friday = addDaysISO(day.date, -1);
    const sunday = addDaysISO(day.date, 1);
    const thursday = addDaysISO(day.date, -2);
    const freeA = !occupied.has(friday) && !occupied.has(day.date) && !occupied.has(sunday);
    if (freeA) {
      findesLibresA++;
      if (!occupied.has(thursday)) findesLibresB++;
    }
  }

  const gaps = gapsBetween(mine.map((s) => s.date));

  return {
    residentId,
    totalGuardias: mine.length,
    sabados,
    preferiados,
    sabadosYPreferiados: sabados + preferiados,
    feriados,
    findesXL,
    juevesFelices,
    viernes,
    domingos,
    findesLibresA,
    findesLibresB,
    distanciaMinima: gaps.length ? Math.min(...gaps) : null,
    distanciaPromedio: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
  };
}

export function computeAllEquityCounters(
  residentIds: string[],
  shifts: Shift[],
  resolvedDays: ResolvedDay[],
): Record<string, EquityCounters> {
  return Object.fromEntries(
    residentIds.map((id) => [id, computeEquityCounters(id, shifts, resolvedDays)]),
  );
}

import type {
  CalendarDay,
  DayTag,
  MonthConfig,
  ResolvedDay,
  Weekday,
  WeekdayKey,
  WeekdayRequirements,
} from '../types';
import { WEEKDAY_KEYS } from '../types';

export const DEFAULT_WEEKDAY_REQUIREMENTS: WeekdayRequirements = {
  mon: 1,
  tue: 1,
  wed: 1,
  thu: 1,
  fri: 1,
  sat: 1,
  sun: 1,
};

/** 0 = lunes ... 6 = domingo (a diferencia de Date#getDay, que arranca en domingo). */
export function isoWeekday(dateISO: string): Weekday {
  const jsDay = new Date(`${dateISO}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return ((jsDay + 6) % 7) as Weekday;
}

export function weekdayKey(dateISO: string): WeekdayKey {
  return WEEKDAY_KEYS[isoWeekday(dateISO)];
}

export function addDaysISO(dateISO: string, delta: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

export function monthKey(dateISO: string): string {
  return dateISO.slice(0, 7); // "YYYY-MM"
}

export function requiredR1For(
  dateISO: string,
  day: CalendarDay | undefined,
  monthConfigs: Record<string, MonthConfig>,
): number {
  if (day?.requiredR1Override !== undefined) return day.requiredR1Override;
  const cfg = monthConfigs[monthKey(dateISO)];
  const weekdayReqs = cfg?.weekdayRequirements ?? DEFAULT_WEEKDAY_REQUIREMENTS;
  return weekdayReqs[weekdayKey(dateISO)];
}

/**
 * Resuelve un rango de días de calendario a ResolvedDay[] con todas las
 * etiquetas derivadas (feriado, preferiado, finde XL, jueves feliz, sin
 * cobertura, sábado común/finde largo). Necesita el mapa completo de
 * CalendarDay (al menos +1/-1 día de margen) porque varias etiquetas miran
 * al día siguiente o anterior.
 */
export function resolveCalendarDays(
  days: CalendarDay[],
  monthConfigs: MonthConfig[] = [],
): ResolvedDay[] {
  const byId = new Map(days.map((d) => [d.id, d]));
  const cfgByMonth = Object.fromEntries(monthConfigs.map((c) => [c.id, c]));
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  const holidayAt = (dateISO: string) => byId.get(dateISO)?.isHoliday ?? false;

  return sorted.map((day) => {
    const weekday = isoWeekday(day.date);
    const requiredR1 = requiredR1For(day.date, day, cfgByMonth);
    const tags: DayTag[] = [];

    if (day.isHoliday) tags.push('feriado');
    if (requiredR1 === 0) tags.push('sin_cobertura');
    if (weekday === 5 || weekday === 6) tags.push('finde');

    // Preferiado: día no feriado inmediatamente anterior al inicio de un
    // bloque de feriados consecutivos (el día siguiente es feriado y hoy no).
    const nextDay = addDaysISO(day.date, 1);
    if (!day.isHoliday && holidayAt(nextDay)) tags.push('preferiado');

    // Jueves: "finde XL" si el lunes siguiente (jueves+4) es feriado;
    // si no, es un "jueves feliz" común.
    if (weekday === 3) {
      const nextMonday = addDaysISO(day.date, 4);
      if (holidayAt(nextMonday)) {
        tags.push('finde_xl');
      } else {
        tags.push('jueves_feliz');
      }
    }

    // Sábado: "finde largo" si algún día entre el viernes y el lunes
    // siguientes (inclusive) es feriado.
    if (weekday === 5) {
      const friday = day.date;
      const sunday = addDaysISO(day.date, 1);
      const monday = addDaysISO(day.date, 2);
      const isLongWeekend = holidayAt(friday) || holidayAt(sunday) || holidayAt(monday);
      tags.push(isLongWeekend ? 'sabado_finde_largo' : 'sabado_comun');
    }

    return {
      id: day.id,
      date: day.date,
      weekday,
      requiredR1,
      isHoliday: day.isHoliday,
      holidayName: day.holidayName,
      tags,
      notes: day.notes,
    };
  });
}

export function hasTag(day: ResolvedDay, tag: DayTag): boolean {
  return day.tags.includes(tag);
}

/** Distancias (en días) entre guardias consecutivas de una misma persona, ordenadas. */
export function gapsBetween(datesISO: string[]): number[] {
  const sorted = [...datesISO].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(diffDays(sorted[i - 1], sorted[i]));
  }
  return gaps;
}

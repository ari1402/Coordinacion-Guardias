import type {
  CalendarDay,
  DayTag,
  MonthConfig,
  MonthRules,
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

export const DEFAULT_RULES: MonthRules = {
  minGapHard: 3,
  minGapIdeal: 5,
  maxPerPerson: 0,
  avoidSameWeekday: true,
  avoidDoubleSatPref: true,
  sabadoComunConJueves: true,
  juevesLibraFinde: true,
};

const TZ = 'America/Argentina/Buenos_Aires';

/** Fecha de hoy en Argentina, "YYYY-MM-DD" (no la de UTC). */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
}

/** 0 = lunes ... 6 = domingo (a diferencia de Date#getDay, que arranca en domingo). */
export function isoWeekday(dateISO: string): Weekday {
  const jsDay = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
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
  return dateISO.slice(0, 7);
}

export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function monthDates(key: string): string[] {
  const [y, m] = key.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${key}-${String(i + 1).padStart(2, '0')}`);
}

/** Lista de meses entre dos claves "YYYY-MM", inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = shiftMonthKey(k, 1)) out.push(k);
  return out;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "jue 15/10" */
export function shortDateLabel(dateISO: string): string {
  const wd = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'][isoWeekday(dateISO)];
  return `${wd} ${Number(dateISO.slice(8, 10))}/${Number(dateISO.slice(5, 7))}`;
}

export interface EffectiveMonthConfig {
  weekdayRequirements: WeekdayRequirements;
  rules: MonthRules;
  notes: string;
  /** Mes del que se heredó la config, o null si el mes tiene la suya propia. */
  inheritedFrom: string | null;
  hasOwnConfig: boolean;
}

/**
 * Config efectiva de un mes: la propia si existe; si no, la del mes anterior
 * más cercano que tenga. Las reglas se heredan aparte (de la config más
 * cercana que tenga reglas), así un mes que solo cambia los R1 por día no
 * pierde las reglas. Las notas no se heredan (son del mes puntual).
 */
export function effectiveMonthConfig(key: string, configs: MonthConfig[]): EffectiveMonthConfig {
  const own = configs.find((c) => c.id === key);
  const previous = [...configs].filter((c) => c.id <= key).sort((a, b) => b.id.localeCompare(a.id));
  const source = own ?? previous[0];
  const rulesSource = previous.find((c) => c.rules && Object.keys(c.rules).length > 0);
  return {
    weekdayRequirements: source?.weekdayRequirements ?? DEFAULT_WEEKDAY_REQUIREMENTS,
    rules: { ...DEFAULT_RULES, ...(rulesSource?.rules ?? {}) },
    notes: own?.notes ?? '',
    inheritedFrom: own ? null : (source?.id ?? null),
    hasOwnConfig: !!own,
  };
}

function resolveDay(
  dateISO: string,
  stored: CalendarDay | undefined,
  weekdayReqs: WeekdayRequirements,
  holidayAt: (d: string) => boolean,
): ResolvedDay {
  const weekday = isoWeekday(dateISO);
  const override = stored?.requiredR1Override;
  const totalSlots =
    override !== undefined && override !== null ? override : weekdayReqs[WEEKDAY_KEYS[weekday]];
  const disabledSlots = (stored?.disabledSlots ?? []).filter((i) => i < totalSlots).sort((a, b) => a - b);
  const requiredR1 = totalSlots - disabledSlots.length;
  const isHoliday = stored?.isHoliday ?? false;
  const tags: DayTag[] = [];

  if (isHoliday) tags.push('feriado');
  if (requiredR1 === 0) tags.push('sin_cobertura');
  if (disabledSlots.length) tags.push('r_mayores');
  if (weekday === 5 || weekday === 6) tags.push('finde');

  // Preferiado: día no feriado inmediatamente anterior al inicio de un
  // bloque de feriados (el día siguiente es feriado y hoy no).
  if (!isHoliday && holidayAt(addDaysISO(dateISO, 1))) tags.push('preferiado');

  // Jueves: "finde XL" si el lunes siguiente es feriado; si no, "jueves feliz".
  if (weekday === 3) tags.push(holidayAt(addDaysISO(dateISO, 4)) ? 'finde_xl' : 'jueves_feliz');

  // Sábado de finde largo: el viernes, sábado, domingo o lunes es feriado.
  if (weekday === 5) {
    const long = [-1, 0, 1, 2].some((d) => holidayAt(addDaysISO(dateISO, d)));
    tags.push(long ? 'sabado_finde_largo' : 'sabado_comun');
  }

  return {
    id: dateISO,
    date: dateISO,
    weekday,
    requiredR1,
    ...(disabledSlots.length ? { disabledSlots, disabledNote: stored?.disabledNote ?? undefined } : {}),
    isHoliday,
    holidayName: stored?.holidayName,
    tags,
    notes: stored?.notes,
  };
}

/**
 * Todos los días de un mes resueltos, existan o no docs en calendarDays:
 * el mes se sintetiza y los docs guardados solo aportan overrides. Los
 * feriados se buscan en todos los docs (no solo los del mes), así un
 * preferiado el 31 que depende de un feriado el 1 del mes siguiente funciona.
 */
export function resolveMonth(
  key: string,
  storedDays: CalendarDay[],
  configs: MonthConfig[],
): ResolvedDay[] {
  const byId = new Map(storedDays.map((d) => [d.id, d]));
  const holidayAt = (d: string) => byId.get(d)?.isHoliday ?? false;
  const { weekdayRequirements } = effectiveMonthConfig(key, configs);
  return monthDates(key).map((date) => resolveDay(date, byId.get(date), weekdayRequirements, holidayAt));
}

export function resolveMonths(
  keys: string[],
  storedDays: CalendarDay[],
  configs: MonthConfig[],
): ResolvedDay[] {
  return keys.flatMap((k) => resolveMonth(k, storedDays, configs));
}

export function hasTag(day: ResolvedDay, tag: DayTag): boolean {
  return day.tags.includes(tag);
}

export function isSabadoOrPreferiado(day: ResolvedDay): boolean {
  return day.weekday === 5 || hasTag(day, 'preferiado');
}

export function isBusinessDay(dateISO: string, isHoliday: (d: string) => boolean): boolean {
  return isoWeekday(dateISO) <= 4 && !isHoliday(dateISO);
}

/**
 * Si `dateISO` cae en el "finde liberado" de una guardia de jueves (el
 * viernes de posguardia y los días no hábiles que siguen, hasta el primer
 * día hábil), devuelve ese jueves; si no, null.
 */
export function protectingThursday(dateISO: string, isHoliday: (d: string) => boolean): string | null {
  const prev = addDaysISO(dateISO, -1);
  if (isoWeekday(dateISO) === 4 && isoWeekday(prev) === 3) return prev;
  if (isBusinessDay(dateISO, isHoliday)) return null;
  let d = prev;
  for (let i = 0; i < 10 && !isBusinessDay(d, isHoliday); i++) d = addDaysISO(d, -1);
  if (isoWeekday(d) === 3) return d;
  if (isoWeekday(d) === 4 && isoWeekday(addDaysISO(d, -1)) === 3) return addDaysISO(d, -1);
  return null;
}

/** Distancias (en días) entre fechas consecutivas, ordenadas. */
export function gapsBetween(datesISO: string[]): number[] {
  const sorted = [...datesISO].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(diffDays(sorted[i - 1], sorted[i]));
  return gaps;
}

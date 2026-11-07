import type { Rotation } from '../types';
import { addDaysISO, isoWeekday, monthLabel } from './dates';
import { NO_SHIFT_ROTATIONS } from './rotations';

/**
 * Navidad y Año nuevo, cada uno con el finde que le sigue: Navidad va del 24/12
 * al primer domingo desde el 26/12; Año nuevo, del 31/12 al primer domingo
 * desde el 2/1. Los cubren quienes tienen vacaciones en enero (Navidad) y en
 * febrero (Año nuevo), según los carriles.
 */
export interface FiestaBlock {
  key: 'navidad' | 'anio_nuevo';
  label: string;
  dates: string[];
  /** Mes ("YYYY-MM") cuyas vacaciones definen quiénes cubren el bloque. */
  groupMonth: string;
}

function untilSunday(from: string, start: string): string[] {
  let end = from;
  while (isoWeekday(end) !== 6) end = addDaysISO(end, 1);
  const out: string[] = [];
  for (let d = start; d <= end; d = addDaysISO(d, 1)) out.push(d);
  return out;
}

/** Los dos bloques de las fiestas de fin de `year` (Navidad de ese año y el Año nuevo siguiente). */
export function fiestaBlocks(year: number): FiestaBlock[] {
  return [
    { key: 'navidad', label: 'Navidad', dates: untilSunday(`${year}-12-26`, `${year}-12-24`), groupMonth: `${year + 1}-01` },
    { key: 'anio_nuevo', label: 'Año nuevo', dates: untilSunday(`${year + 1}-01-02`, `${year}-12-31`), groupMonth: `${year + 1}-02` },
  ];
}

export interface FiestaAssignment {
  block: FiestaBlock;
  /** Días del bloque que caen en el mes que se genera. */
  dates: string[];
  /** Quiénes lo cubren (vacaciones en groupMonth). */
  coverers: string[];
}

/**
 * Para el mes `monthKey`, los bloques de fiestas que caen en él y quiénes los
 * cubren. Si nadie tiene vacaciones en el mes del grupo (carriles sin cargar),
 * ese bloque no se restringe.
 */
export function fiestasForMonth(monthKey: string, rotations: Rotation[], residentIds: string[]): FiestaAssignment[] {
  const year = Number(monthKey.slice(0, 4));
  return [...fiestaBlocks(year - 1), ...fiestaBlocks(year)]
    .map((block) => ({
      block,
      dates: block.dates.filter((d) => d.startsWith(monthKey)),
      coverers: residentIds.filter((id) =>
        NO_SHIFT_ROTATIONS.has(rotations.find((r) => r.id === id)?.months[block.groupMonth] ?? ''),
      ),
    }))
    .filter((f) => f.dates.length > 0 && f.coverers.length > 0);
}

/** Días no disponibles para quienes no cubren cada bloque (para el generador). */
export function fiestaUnavailable(fiestas: FiestaAssignment[], residentIds: string[]) {
  return fiestas.flatMap((f) =>
    residentIds
      .filter((id) => !f.coverers.includes(id))
      .map((residentId) => ({
        residentId,
        dates: f.dates,
        reason: `fiesta:${f.block.label} la cubren las de vacaciones en ${monthLabel(f.block.groupMonth).split(' ')[0].toLowerCase()}`,
      })),
  );
}

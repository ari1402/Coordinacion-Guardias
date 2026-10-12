import type { Rotation } from '../types';

/** Carriles conocidos, en el orden en que se ofrecen en el editor. */
export const ROTATION_CODES = ['QC', 'UCA', 'PREQUI INT', 'A EXT', 'OYT', 'Vacaciones'] as const;

/** Carriles en los que no se hacen guardias (el generador no asigna ese mes). */
export const NO_SHIFT_ROTATIONS = new Set(['Vacaciones']);

// Mismos colores que la planilla de carriles.
const STYLES: Record<string, { bg: string; fg: string }> = {
  QC: { bg: '#e5484d', fg: '#ffffff' },
  UCA: { bg: '#f5a524', fg: '#1f2033' },
  'PREQUI INT': { bg: '#26262b', fg: '#ffffff' },
  'A EXT': { bg: '#3e7bd6', fg: '#ffffff' },
  OYT: { bg: '#5c4a1e', fg: '#ffffff' },
  Vacaciones: { bg: '#fde047', fg: '#1f2033' },
};

export function rotationStyle(code: string | undefined): { background: string; color: string } {
  const s = (code && STYLES[code]) || { bg: 'var(--surface-2)', fg: 'var(--text-dim)' };
  return { background: s.bg, color: s.fg };
}

export function rotationOf(rotations: Rotation[], residentId: string, month: string): string | undefined {
  return rotations.find((r) => r.id === residentId)?.months[month];
}

/** Por residente, los meses ("YYYY-MM") en los que no hace guardias (vacaciones). */
export function awayMonths(rotations: Rotation[]): Record<string, Set<string>> {
  return Object.fromEntries(
    rotations.map((r) => [
      r.id,
      new Set(Object.entries(r.months).filter(([, code]) => NO_SHIFT_ROTATIONS.has(code)).map(([m]) => m)),
    ]),
  );
}

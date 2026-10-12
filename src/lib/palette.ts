// Paleta categórica validada (8 series, orden fijo) + paleta de estado fija.
// Ver skill dataviz / references/palette.md. Los valores viven como CSS vars
// en src/index.css (con su variante dark) — acá solo fijamos el ORDEN, que es
// lo que garantiza la separación CVD entre series adyacentes.
export const SERIES_VARS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
] as const;

/** Color estable por residente: mismo orden (alfabético por id) en toda la app. */
export function colorForResident(residentIndex: number): string {
  return SERIES_VARS[residentIndex % SERIES_VARS.length];
}

export function buildResidentColorMap(residentIds: string[]): Record<string, string> {
  const sorted = [...residentIds].sort();
  return Object.fromEntries(sorted.map((id, i) => [id, colorForResident(i)]));
}

export const STATUS_COLORS = {
  good: 'var(--status-good)',
  warning: 'var(--status-warning)',
  serious: 'var(--status-serious)',
  critical: 'var(--status-critical)',
} as const;

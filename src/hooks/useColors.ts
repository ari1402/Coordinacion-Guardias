import { useMemo } from 'react';
import { buildResidentColorMap } from '../lib/palette';
import type { Resident } from '../types';

/** Color estable por residente (mismo en toda la app). */
export function useColors(residents: Resident[]): (id: string | null | undefined) => string {
  const map = useMemo(() => buildResidentColorMap(residents.map((r) => r.id)), [residents]);
  return (id) => (id ? (map[id] ?? 'var(--text-dim)') : 'var(--text-dim)');
}

import { describe, expect, it } from 'vitest';
import type { Resident } from '../types';
import { parseScheduleText } from './importText';

const residents: Resident[] = [
  ['alba', 'Ana Alba', 'Alba'],
  ['bravo', 'Bea Bravo', 'Bravo'],
  ['gil', 'Gabi Sánchez Gil', 'Gil'],
  ['duarte', 'Dana Duarte', 'Duarte'],
  ['funes', 'Fede Funes', 'Funes'],
].map(([id, name, shortName]) => ({ id, name, shortName, email: '', role: 'resident', active: true }));

describe('importar desde texto', () => {
  it('entiende los formatos habituales', () => {
    const text = [
      '1/11 Funes',
      '2026-11-02 Duarte',
      'Sábado 7: Alba',
      'Jue 12 - Bea y Vale',
      '13 de noviembre Sánchez Gil',
      '3/11 sin R1',
      '',
    ].join('\n');
    const lines = parseScheduleText(text, '2026-11', residents);
    expect(lines.map((l) => [l.date, l.residentIds, l.error, !!l.empty])).toEqual([
      ['2026-11-01', ['funes'], undefined, false],
      ['2026-11-02', ['duarte'], undefined, false],
      ['2026-11-07', ['alba'], undefined, false],
      ['2026-11-12', ['bravo', 'duarte'], undefined, false],
      ['2026-11-13', ['gil'], undefined, false],
      ['2026-11-03', [], undefined, true],
    ]);
  });

  it('marca lo que no entiende', () => {
    const [a, b] = parseScheduleText('5/11 Fulana\nFunes', '2026-11', residents);
    expect(a.error).toMatch(/No reconocí/);
    expect(b.error).toMatch(/fecha/);
  });

  it('enero después de noviembre es del año siguiente', () => {
    const [a] = parseScheduleText('2/1 Gil', '2026-12', residents);
    expect(a.date).toBe('2027-01-02');
  });
});

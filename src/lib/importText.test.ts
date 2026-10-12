import { describe, expect, it } from 'vitest';
import type { Resident } from '../types';
import { parseScheduleText } from './importText';

const residents: Resident[] = [
  ['perez', 'Ana Pérez', 'Pérez'],
  ['gomez', 'Martina Gómez', 'Gómez'],
  ['lsm', 'Lucía Sosa De Marco', 'LSM'],
  ['ruiz', 'Valentina Ruiz', 'Ruiz'],
  ['diaz', 'Juan Díaz', 'Díaz'],
  ['mora', 'Juana Mora', 'Mora'],
].map(([id, name, shortName]) => ({ id, name, shortName, email: '', role: 'resident', active: true }));

describe('importar desde texto', () => {
  it('entiende los formatos habituales', () => {
    const text = [
      '1/11 Díaz',
      '2026-11-02 Ruiz',
      'Sábado 7: Pérez',
      'Jue 12 - Marti y Vale',
      '13 de noviembre Sosa De Marco',
      '3/11 sin R1',
      '14/11 Lu',
      '',
    ].join('\n');
    const lines = parseScheduleText(text, '2026-11', residents);
    expect(lines.map((l) => [l.date, l.residentIds, l.error, !!l.empty])).toEqual([
      ['2026-11-01', ['diaz'], undefined, false],
      ['2026-11-02', ['ruiz'], undefined, false],
      ['2026-11-07', ['perez'], undefined, false],
      ['2026-11-12', ['gomez', 'ruiz'], undefined, false],
      ['2026-11-13', ['lsm'], undefined, false],
      ['2026-11-03', [], undefined, true],
      ['2026-11-14', [], 'No reconocí a nadie en la línea', false],
    ]);
  });

  it('marca lo que no entiende', () => {
    const [a, b] = parseScheduleText('5/11 Fulana\nDíaz', '2026-11', residents);
    expect(a.error).toMatch(/No reconocí/);
    expect(b.error).toMatch(/fecha/);
  });

  it('apodos: "Juani" es Juan, salvo que también haya una Juana (ahí es ambiguo y no se usa)', () => {
    const sinJuana = residents.filter((r) => r.id !== 'mora');
    expect(parseScheduleText('5/11 Juani', '2026-11', sinJuana)[0].residentIds).toEqual(['diaz']);
    expect(parseScheduleText('5/11 Juani', '2026-11', residents)[0].residentIds).toEqual([]);
  });

  it('enero después de noviembre es del año siguiente', () => {
    const [a] = parseScheduleText('2/1 LSM', '2026-12', residents);
    expect(a.date).toBe('2027-01-02');
  });
});

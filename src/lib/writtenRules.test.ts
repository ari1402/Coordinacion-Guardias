import { describe, expect, it } from 'vitest';
import type { CalendarDay, MonthConfig, Resident } from '../types';
import { DEFAULT_RULES, resolveMonth } from './dates';
import { generateOptions } from './generator';
import { applyWrittenRules, parseWrittenRules } from './writtenRules';

const residents: Resident[] = ['Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Sosa', 'Sánchez Di Mare', 'De Luca'].map((shortName, i) => ({
  id: `r${i}`,
  name: `Nombre${i} ${shortName}`,
  shortName,
  email: `r${i}@x.org`,
  role: 'resident',
  active: true,
}));
const configs: MonthConfig[] = [{ id: '2026-12', weekdayRequirements: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1, sun: 1 } }];
const holidays: CalendarDay[] = [{ id: '2026-12-08', date: '2026-12-08', isHoliday: true }];
const days = resolveMonth('2026-12', holidays, configs);
const parse = (t: string) => parseWrittenRules(t, '2026-12', residents, days);

describe('reglas escritas', () => {
  it('entiende fijar, no, rangos, días de semana, feriados y solo', () => {
    const p = parse(
      '🔒 Pérez jueves 3.\nsin gomez el 5\nRuiz no del 20 al 22\nSDM no jueves\nDe Luca no feriados\nsolo Díaz y Sosa el 25\nPérez 3/1\nhola',
    );
    expect(p.rules.map((r) => [r.kind, r.residentIds, r.dates.length])).toEqual([
      ['fijar', ['r0'], 1],
      ['bloquear', ['r1'], 1],
      ['bloquear', ['r2'], 3],
      ['bloquear', ['r5'], 5],
      ['bloquear', ['r6'], 1],
      ['solo', ['r3', 'r4'], 1],
    ]);
    expect(p.rules[0].dates).toEqual(['2026-12-03']);
    expect(p.rules[0].warnings).toEqual([]);
    expect(p.unknown.map((u) => u.line)).toEqual(['Pérez 3/1', 'hola']);
  });

  it('avisa si el día de semana no coincide', () => {
    expect(parse('Pérez viernes 3').rules[0].warnings[0]).toMatch(/es jue/);
  });

  it('el generador las cumple', () => {
    const w = applyWrittenRules(days, parse('Pérez jueves 3\nGómez no del 1 al 15'));
    const [opt] = generateOptions({
      days: w.days,
      residents,
      requests: [],
      rules: DEFAULT_RULES,
      unavailable: w.unavailable,
    });
    expect(opt.slots.find((s) => s.date === '2026-12-03')!.residentId).toBe('r0');
    expect(opt.slots.filter((s) => s.date <= '2026-12-15' && s.residentId === 'r1')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import seed from '../../scripts/r1-requerimientos.seed.json';
import type { CalendarDay, MonthConfig, WeekdayRequirements } from '../types';
import { resolveMonth } from './dates';
import { buildSlots } from './generator';

// Misma lógica que scripts/migrate-v3.mjs: config por mes solo cuando cambia
// el patrón + overrides de los días puntuales. Tiene que dar exactamente los
// puestos R1 Central de la planilla.
describe('R1 requeridos de la planilla', () => {
  const meses = seed.meses as Record<string, { weekdayRequirements: WeekdayRequirements; overrides: Record<string, number>; total: number }>;
  const configs: MonthConfig[] = [{ id: '2026-10', weekdayRequirements: { mon: 1, tue: 0, wed: 1, thu: 1, fri: 1, sat: 1, sun: 1 } }];
  const days: CalendarDay[] = [];
  let prev = configs[0].weekdayRequirements;
  for (const [mk, spec] of Object.entries(meses).sort()) {
    if (JSON.stringify(spec.weekdayRequirements) !== JSON.stringify(prev)) configs.push({ id: mk, weekdayRequirements: spec.weekdayRequirements });
    prev = spec.weekdayRequirements;
    for (const [date, n] of Object.entries(spec.overrides)) days.push({ id: date, date, isHoliday: false, requiredR1Override: n });
  }

  it.each(Object.keys(meses))('%s', (mk) => {
    expect(buildSlots(resolveMonth(mk, days, configs))).toHaveLength(meses[mk].total);
  });

  it('solo hace falta config propia cuando cambia el esquema', () => {
    expect(configs.map((c) => c.id)).toEqual(['2026-10', '2026-11', '2027-03']);
  });
});

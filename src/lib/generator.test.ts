import { describe, expect, it } from 'vitest';
import type { CalendarDay, GuardiaRequest, MonthConfig, Resident } from '../types';
import { DEFAULT_RULES, addDaysISO, effectiveMonthConfig, hasTag, protectingThursday, resolveMonth } from './dates';
import { evaluateDraft, generateOptions, priorFromCounters, slotKey } from './generator';
import { secureShuffle } from './random';
import { upcomingBirthdays } from './birthdays';
import { computeEquityCounters } from './equity';

const residents: Resident[] = [
  ['alba', 'Alba', '01-01'],
  ['costa', 'Costa', undefined],
  ['duarte', 'Duarte', '01-01'],
  ['bravo', 'Bravo', '01-01'],
  ['espina', 'Espina', '01-01'],
  ['funes', 'Funes', '01-01'],
  ['gil', 'Gil', '01-01'],
].map(([id, shortName, birthday]) => ({
  id: id!,
  name: shortName!,
  shortName: shortName!,
  email: `${id}@x.org`,
  role: 'resident',
  active: true,
  birthday,
}));

const holidays: CalendarDay[] = [
  { id: '2026-10-12', date: '2026-10-12', isHoliday: true },
  { id: '2026-11-09', date: '2026-11-09', isHoliday: true },
  { id: '2026-11-10', date: '2026-11-10', isHoliday: true },
  { id: '2026-11-23', date: '2026-11-23', isHoliday: true },
  { id: '2026-11-03', date: '2026-11-03', isHoliday: false, requiredR1Override: 0 },
];

const configs: MonthConfig[] = [
  { id: '2026-10', weekdayRequirements: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1, sun: 1 } },
  { id: '2027-03', weekdayRequirements: { mon: 0, tue: 2, wed: 0, thu: 2, fri: 2, sat: 2, sun: 2 } },
];

function req(partial: Partial<GuardiaRequest>): GuardiaRequest {
  return {
    id: Math.random().toString(36),
    residentId: 'alba',
    type: 'pedido_fuerte',
    dates: [],
    reason: '',
    status: 'pendiente',
    createdAt: '',
    ...partial,
  };
}

describe('calendario', () => {
  it('arma un mes completo aunque no haya días cargados', () => {
    const nov = resolveMonth('2026-11', holidays, configs);
    expect(nov).toHaveLength(30);
    expect(nov.find((d) => d.date === '2026-11-03')!.requiredR1).toBe(0);
  });

  it('reproduce las etiquetas de octubre: finde XL el 8, preferiado el 11', () => {
    const oct = resolveMonth('2026-10', holidays, configs);
    expect(hasTag(oct.find((d) => d.date === '2026-10-08')!, 'finde_xl')).toBe(true);
    expect(hasTag(oct.find((d) => d.date === '2026-10-11')!, 'preferiado')).toBe(true);
    expect(hasTag(oct.find((d) => d.date === '2026-10-15')!, 'jueves_feliz')).toBe(true);
  });

  it('el preferiado de un bloque es el día anterior al inicio (8/11, no el 9)', () => {
    const nov = resolveMonth('2026-11', holidays, configs);
    expect(hasTag(nov.find((d) => d.date === '2026-11-08')!, 'preferiado')).toBe(true);
    expect(hasTag(nov.find((d) => d.date === '2026-11-09')!, 'preferiado')).toBe(false);
    expect(hasTag(nov.find((d) => d.date === '2026-11-05')!, 'finde_xl')).toBe(true);
  });

  it('las reglas se heredan del último mes configurado', () => {
    expect(effectiveMonthConfig('2027-05', configs).weekdayRequirements.tue).toBe(2);
    expect(effectiveMonthConfig('2027-05', configs).inheritedFrom).toBe('2027-03');
    expect(effectiveMonthConfig('2026-12', configs).weekdayRequirements.tue).toBe(1);
  });
});

describe('generador', () => {
  const nov = resolveMonth('2026-11', holidays, configs);
  const base = { days: nov, residents, requests: [], rules: DEFAULT_RULES };

  it('cubre todo noviembre sin problemas duros y parejo', () => {
    const [opt] = generateOptions(base, { seed: 1, profiles: ['equidad'] });
    expect(opt.slots).toHaveLength(29);
    expect(opt.slots.every((s) => s.residentId)).toBe(true);
    expect(opt.evaluation.summary.hardCount).toBe(0);
    expect(opt.evaluation.summary.maxDiff).toBeLessThanOrEqual(1);
    expect(opt.evaluation.summary.minGap).toBeGreaterThanOrEqual(4);
  });

  it('no pone guardia el cumpleaños ni el día anterior', () => {
    const res = residents.map((r) => (r.id === 'costa' ? { ...r, birthday: '11-14' } : r));
    const [opt] = generateOptions({ ...base, residents: res }, { seed: 2, profiles: ['equidad'] });
    const costa = opt.slots.filter((s) => s.residentId === 'costa').map((s) => s.date);
    expect(costa).not.toContain('2026-11-13');
    expect(costa).not.toContain('2026-11-14');
  });

  it('no asigna a quien está de vacaciones por carril', () => {
    const unavailable = ['funes', 'espina', 'bravo'].map((residentId) => ({
      residentId,
      dates: nov.map((d) => d.date),
      reason: 'Vacaciones',
    }));
    const [opt] = generateOptions({ ...base, unavailable }, { seed: 5, profiles: ['equidad'] });
    const used = new Set(opt.slots.map((s) => s.residentId));
    for (const id of ['funes', 'espina', 'bravo']) expect(used.has(id)).toBe(false);
    expect(opt.slots.every((s) => s.residentId)).toBe(true);
    expect(opt.evaluation.issues.filter((i) => i.code === 'no_disponible')).toHaveLength(0);
  });

  it('una guardia deshabilitada (la toma un R mayor) no se asigna ni falta', () => {
    const stored: CalendarDay[] = [
      ...holidays,
      { id: '2026-11-05', date: '2026-11-05', isHoliday: false, disabledSlots: [0], disabledNote: 'R2' },
      { id: '2026-11-06', date: '2026-11-06', isHoliday: false, requiredR1Override: 2, disabledSlots: [0] },
    ];
    const days = resolveMonth('2026-11', stored, configs);
    const d5 = days.find((d) => d.date === '2026-11-05')!;
    expect(d5.requiredR1).toBe(0);
    expect(hasTag(d5, 'r_mayores')).toBe(true);
    const [opt] = generateOptions({ ...base, days }, { seed: 6, profiles: ['equidad'] });
    expect(opt.slots.some((s) => s.date === '2026-11-05')).toBe(false);
    expect(opt.slots.filter((s) => s.date === '2026-11-06').map((s) => s.slotIndex)).toEqual([1]);
    expect(opt.evaluation.summary.uncovered).toBe(0);
  });

  it('quien tiene sábado en el mes tiene un jueves feliz (o finde XL)', () => {
    const sats = nov.filter((d) => d.weekday === 5);
    expect(sats.filter((d) => hasTag(d, 'sabado_finde_largo')).map((d) => d.date)).toEqual(['2026-11-07', '2026-11-21']);
    for (const seed of [41, 42, 43]) {
      const [opt] = generateOptions(base, { seed, profiles: ['equidad'] });
      const at = (d: string) => opt.slots.find((s) => s.date === d)?.residentId;
      const good = new Set(nov.filter((d) => hasTag(d, 'jueves_feliz') || hasTag(d, 'finde_xl')).map((d) => at(d.date)));
      for (const sat of sats) expect(good.has(at(sat.date))).toBe(true);
      expect(opt.evaluation.issues.filter((i) => i.code === 'sabado_sin_jueves')).toHaveLength(0);
    }
  });

  it('el finde XL va por turnos: primero quien todavía no tuvo, aunque otra tenga más carga', () => {
    // (entre quienes empatan en el turno, el orden es al azar)
    const xlDays = ['2026-11-05', '2026-11-19'];
    const prior = Object.fromEntries(
      residents.map((r) => [
        r.id,
        { ...priorFromCounters(undefined), total: 8, sabPref: 2, feriado: 1, findeTotal: 3, xl: 1, jueves: 1, lastShiftDate: '2026-10-20' },
      ]),
    );
    // Costa e Duarte todavía no tuvieron XL; Funes viene con mucha carga pero ya tuvo.
    prior.costa = { ...prior.costa, xl: 0 };
    prior.duarte = { ...prior.duarte, xl: 0 };
    prior.funes = { ...prior.funes, total: 11, sabPref: 4, feriado: 2 };
    for (const seed of [21, 22]) {
      const [opt] = generateOptions({ ...base, prior }, { seed, profiles: ['equidad'] });
      const got = xlDays.map((d) => opt.slots.find((s) => s.date === d)?.residentId).sort();
      expect(got).toEqual(['costa', 'duarte']);
      expect(opt.evaluation.issues.some((i) => i.code === 'finde_xl_turno')).toBe(false);
    }
    // Si Costa no puede ese finde, el turno pasa: no se le "fuerza" el XL.
    const requests = [req({ residentId: 'costa', type: 'bloqueo', dates: ['2026-11-05', '2026-11-19'] })];
    const [opt] = generateOptions({ ...base, prior, requests }, { seed: 23, profiles: ['equidad'] });
    expect(xlDays.map((d) => opt.slots.find((s) => s.date === d)?.residentId)).toContain('duarte');
    expect(opt.evaluation.summary.hardCount).toBe(0);
    // Un pedido de quien ya tuvo XL igual se respeta.
    const pedido = [req({ residentId: 'gil', type: 'pedido_fuerte', intent: 'on', dates: ['2026-11-19'] })];
    const [opt2] = generateOptions({ ...base, prior, requests: pedido }, { seed: 24, profiles: ['equidad'] });
    expect(opt2.slots.find((s) => s.date === '2026-11-19')?.residentId).toBe('gil');
    expect(opt2.slots.find((s) => s.date === '2026-11-05')?.residentId).toMatch(/costa|duarte/);
  });

  it('respeta bloqueos y cumple pedidos fuertes de "quiero esta guardia"', () => {
    const requests = [
      req({ residentId: 'bravo', type: 'bloqueo', dates: ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-14', '2026-11-15'] }),
      req({ residentId: 'espina', type: 'pedido_fuerte', intent: 'on', dates: ['2026-11-05'] }),
      req({ residentId: 'alba', type: 'pedido_fuerte', intent: 'on', dates: ['2026-11-07', '2026-11-21'] }),
    ];
    const [opt] = generateOptions({ ...base, requests }, { seed: 3, profiles: ['pedidos'] });
    const at = (d: string) => opt.slots.find((s) => s.date === d)?.residentId;
    for (const d of requests[0].dates) expect(at(d)).not.toBe('bravo');
    expect(at('2026-11-05')).toBe('espina');
    expect([at('2026-11-07'), at('2026-11-21')]).toContain('alba');
    expect(opt.evaluation.summary.strongOk).toBe(opt.evaluation.summary.strongTotal);
  });

  it('"necesito el posguardia del 13" le asigna la guardia del 12', () => {
    const requests = [req({ residentId: 'funes', type: 'pedido_fuerte', intent: 'posguardia', dates: ['2026-11-13'] })];
    const [opt] = generateOptions({ ...base, requests }, { seed: 8, profiles: ['pedidos'] });
    expect(opt.slots.find((s) => s.date === '2026-11-12')!.residentId).toBe('funes');
    expect(opt.evaluation.requests[0].satisfied).toBe(true);
  });

  it('respeta guardias fijadas a mano y deja los slots a sortear libres', () => {
    const fixed = [
      { date: '2026-11-01', slotIndex: 0, residentId: 'gil', locked: true },
      { date: '2026-11-24', slotIndex: 0, residentId: null, raffleId: 'r1' },
    ];
    const [opt] = generateOptions({ ...base, fixed }, { seed: 4, profiles: ['equidad'] });
    expect(opt.slots.find((s) => s.date === '2026-11-01')!.residentId).toBe('gil');
    const raffle = opt.slots.find((s) => s.date === '2026-11-24')!;
    expect(raffle.residentId).toBeNull();
    expect(raffle.raffleId).toBe('r1');
    expect(opt.evaluation.summary.uncovered).toBe(0);
  });

  it('con 2 R1 por guardia (esquema de marzo) nunca pone a la misma persona dos veces el mismo día', () => {
    const march = resolveMonth('2027-03', [], configs);
    const [opt] = generateOptions({ ...base, days: march }, { seed: 5, profiles: ['equidad'] });
    const byDate = new Map<string, string[]>();
    for (const s of opt.slots) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s.residentId!]);
    for (const ids of byDate.values()) expect(new Set(ids).size).toBe(ids.length);
    expect(opt.evaluation.summary.uncovered).toBe(0);
  });

  it('la validación de un borrador marca una edición manual con poca distancia', () => {
    const [opt] = generateOptions(base, { seed: 6, profiles: ['equidad'] });
    const draft = opt.slots.map((s) => ({ ...s }));
    draft.find((s) => s.date === '2026-11-01')!.residentId = 'alba';
    draft.find((s) => s.date === '2026-11-02')!.residentId = 'alba';
    const ev = evaluateDraft(base, draft);
    expect(ev.issues.some((i) => i.code === 'distancia' && i.slotKey === slotKey('2026-11-02', 0))).toBe(true);
  });

  it('genera las 3 opciones en un tiempo razonable', () => {
    const t = performance.now();
    const opts = generateOptions(base, { seed: 7 });
    expect(opts.map((o) => o.profile)).toEqual(['equidad', 'pedidos', 'descanso']);
    expect(performance.now() - t).toBeLessThan(8000);
  });
});

describe('jueves → finde libre hasta el primer día hábil', () => {
  const isHoliday = (d: string) => holidays.some((h) => h.date === d && h.isHoliday);

  it('jueves común: libera vie, sáb y dom; el lunes vuelve', () => {
    for (const d of ['2026-10-16', '2026-10-17', '2026-10-18']) expect(protectingThursday(d, isHoliday)).toBe('2026-10-15');
    expect(protectingThursday('2026-10-19', isHoliday)).toBeNull();
  });

  it('finde XL: si el lunes es feriado, vuelve el martes', () => {
    for (const d of ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']) expect(protectingThursday(d, isHoliday)).toBe('2026-10-08');
    expect(protectingThursday('2026-10-13', isHoliday)).toBeNull();
  });

  it('el generador nunca pone guardia en el finde liberado de su jueves', () => {
    const oct = resolveMonth('2026-10', holidays, configs);
    const [opt] = generateOptions({ days: oct, residents, requests: [], rules: DEFAULT_RULES }, { seed: 9, profiles: ['equidad'] });
    expect(opt.evaluation.summary.hardCount).toBe(0);
    const at = new Map(opt.slots.map((s) => [s.date, s.residentId]));
    for (const s of opt.slots.filter((x) => oct.find((d) => d.date === x.date)!.weekday === 3)) {
      for (let i = 1; i <= 4; i++) {
        const d = addDaysISO(s.date, i);
        if (protectingThursday(d, isHoliday) === s.date) expect(at.get(d)).not.toBe(s.residentId);
      }
    }
  });

  it('marca si se viola a mano', () => {
    const nov = resolveMonth('2026-11', holidays, configs);
    const input = { days: nov, residents, requests: [], rules: DEFAULT_RULES };
    const [opt] = generateOptions(input, { seed: 10, profiles: ['equidad'] });
    const draft = opt.slots.map((s) => ({ ...s }));
    draft.find((s) => s.date === '2026-11-12')!.residentId = 'gil';
    draft.find((s) => s.date === '2026-11-15')!.residentId = 'gil';
    expect(evaluateDraft(input, draft).issues.some((i) => i.code === 'finde_post_jueves')).toBe(true);
  });
});

describe('utilidades', () => {
  it('secureShuffle devuelve una permutación', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect([...secureShuffle(items)].sort()).toEqual(items);
  });

  it('próximos cumpleaños ordenados y cruzando de año', () => {
    const next = upcomingBirthdays(residents, '2026-10-12', 3);
    expect(next.map((n) => n.resident.id)).toEqual(['espina', 'funes', 'alba']);
    expect(next[0].date).toBe('2027-01-11');
  });
});

describe('métricas de findes', () => {
  it('cuenta sábados sin jueves y separa findes libres comunes y largos', () => {
    const nov = resolveMonth('2026-11', holidays, configs);
    const shift = (date: string) => ({ id: `${date}_0`, date, slotIndex: 0, assignedResidentId: 'x', actualResidentId: 'x', status: 'programada' as const, createdAt: '' });
    // Findes de noviembre: 1/11 (dom), 7–10 (largo: lun 9 y mar 10 feriados), 14–15, 21–23 (largo), 28–29.
    // Guardias: sáb 14 (común), jue 12 (jueves feliz), lun 23 (feriado del finde largo del 21).
    const c = computeEquityCounters('x', ['2026-11-12', '2026-11-14', '2026-11-23'].map(shift), nov);
    expect(c.sabados).toBe(1);
    expect(c.sabadosSinCompensar).toBe(0);
    expect(c.findesLibresLargos).toBe(1); // 6–10 libre; 20–23 no (guardia el lunes 23)
    expect(c.findesLibresComunes).toBe(1); // 27–29 libre; 13–15 no
    expect(c.guardiasFindeLargo).toBe(1);
    const sinJueves = computeEquityCounters('x', ['2026-11-14', '2026-11-28'].map(shift), nov);
    expect(sinJueves.sabadosSinCompensar).toBe(2);
  });
});

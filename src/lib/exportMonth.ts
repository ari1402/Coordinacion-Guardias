import type { CamadaEvent, Resident, ResolvedDay, Rotation, Shift } from '../types';
import { WEEKDAY_LABELS, WEEKDAY_SHORT } from '../types';
import { buildBreakdown } from './breakdown';
import { priorFromCounters } from './generator';
import { addDaysISO, hasTag, monthLabel, shortDateLabel } from './dates';
import { TAG_LABEL } from './labels';
import type { Cell, Sheet } from './xlsx';

export interface MonthExportInput {
  monthKey: string;
  days: ResolvedDay[];
  shifts: Shift[];
  residents: Resident[];
  rotations?: Rotation[];
  events?: CamadaEvent[];
}

const valid = (s: Shift) => s.status !== 'cancelada';

function dayType(d: ResolvedDay): string {
  const parts: string[] = [];
  if (d.isHoliday) parts.push(d.holidayName ? `Feriado (${d.holidayName})` : 'Feriado');
  for (const t of ['preferiado', 'finde_xl', 'jueves_feliz', 'sabado_finde_largo'] as const) if (hasTag(d, t)) parts.push(TAG_LABEL[t]!);
  return parts.join(' · ');
}

/** Hojas del Excel de un mes: calendario, resumen por persona, lista por persona y lista por día. */
export function monthSheets({ monthKey, days, shifts, residents, rotations = [], events = [] }: MonthExportInput): Sheet[] {
  const label = monthLabel(monthKey);
  const name = (id: string) => residents.find((r) => r.id === id)?.shortName ?? '?';
  const monthShifts = shifts
    .filter((s) => s.date.startsWith(monthKey) && valid(s))
    .sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex);
  const byDate = new Map<string, Shift[]>();
  for (const s of monthShifts) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const eventsOn = (date: string) => events.filter((e) => e.dates.includes(date)).map((e) => e.title);
  const people = residents.filter((r) => r.active || monthShifts.some((s) => s.actualResidentId === r.id));

  // ---------- Calendario
  const cal: Cell[][] = [
    [{ v: `Guardias R1 — ${label}`, s: 'title' }],
    [0, 1, 2, 3, 4, 5, 6].map((w) => ({ v: WEEKDAY_LABELS[w as 0], s: 'header' as const })),
  ];
  const heights: Record<number, number> = { 0: 24, 1: 20 };
  let week: Cell[] = Array.from({ length: days[0]?.weekday ?? 0 }, () => ({ v: '', s: 'calVacio' as const }));
  const flush = () => {
    while (week.length < 7) week.push({ v: '', s: 'calVacio' });
    heights[cal.length] = 78;
    cal.push(week);
    week = [];
  };
  for (const d of days) {
    const lines = [`${Number(d.date.slice(8))}${d.isHoliday ? ` · ${d.holidayName || 'Feriado'}` : ''}`];
    const list = byDate.get(d.date) ?? [];
    if (d.requiredR1 === 0 && !list.length) lines.push(d.disabledSlots?.length ? `🚫 ${d.disabledNote || 'Otra persona'}` : 'Sin R1');
    for (const s of list) lines.push(name(s.actualResidentId));
    if (d.requiredR1 > list.length && list.length) lines.push(`(falta ${d.requiredR1 - list.length})`);
    if (d.disabledSlots?.length && list.length) lines.push(`🚫 ${d.disabledNote || 'Otra persona'}`);
    for (const e of eventsOn(d.date)) lines.push(`🎓 ${e}`);
    const style = d.isHoliday ? 'calFeriado' : d.requiredR1 === 0 ? 'calVacio' : d.weekday >= 4 ? 'calFinde' : 'cal';
    week.push({ v: lines.join('\n'), s: style });
    if (week.length === 7) flush();
  }
  if (week.length) flush();

  // ---------- Resumen por persona
  const slots = monthShifts.map((s) => ({ date: s.date, slotIndex: s.slotIndex, residentId: s.actualResidentId }));
  const before = shifts.filter((s) => s.date < `${monthKey}-01` && valid(s));
  const lastBefore = (id: string) =>
    before
      .filter((s) => s.actualResidentId === id)
      .map((s) => s.date)
      .sort()
      .at(-1);
  const breakdown = buildBreakdown(
    days,
    slots,
    people.map((r) => r.id),
    Object.fromEntries(
      people.map((r) => [
        r.id,
        {
          ...priorFromCounters(undefined),
          total: before.filter((s) => s.actualResidentId === r.id).length,
          sabPref: 0,
          feriado: 0,
          viernes: 0,
          domingo: 0,
          findeTotal: 0,
          xl: 0,
          jueves: 0,
          lastShiftDate: lastBefore(r.id),
        },
      ]),
    ),
    Object.fromEntries(
      people.map((r) => [r.id, shifts.filter((s) => valid(s) && !s.date.startsWith(monthKey) && s.actualResidentId === r.id).map((s) => s.date)]),
    ),
  );
  const rotation = (id: string) => rotations.find((r) => r.id === id)?.months[monthKey] ?? '';
  const summaryHeader = [
    'Residente', 'Carril', 'Guardias del mes', 'Fechas', 'Lun–Mié', 'Jue', 'Vie', 'Sáb', 'Dom',
    'Sáb + preferiados', 'Feriados', 'Findes libres en el mes', 'Findes largos libres', 'Findes XL', 'Separación mínima (días)', 'Total acumulado',
  ];
  const summary: Cell[][] = [
    [{ v: `Resumen por persona — ${label}`, s: 'title' }],
    summaryHeader.map((h) => ({ v: h, s: 'header' as const })),
    ...people.map((r): Cell[] => {
      const b = breakdown[r.id];
      return [
        { v: r.name, s: 'bold' },
        rotation(r.id),
        b.count,
        b.shifts.map((s) => shortDateLabel(s.date)).join(', '),
        b.byWeekday[0] + b.byWeekday[1] + b.byWeekday[2],
        b.byWeekday[3],
        b.byWeekday[4],
        b.byWeekday[5],
        b.byWeekday[6],
        b.sabPref,
        b.feriados,
        b.findesLibres,
        b.findesLargosDelMes ? b.findesLargosLibres : '—',
        b.xl,
        b.minGap ?? '—',
        b.cumTotal,
      ];
    }),
    [{ v: 'Total', s: 'total' }, { v: '', s: 'total' }, { v: monthShifts.length, s: 'total' }],
  ];

  // ---------- Lista por persona (una fila por guardia)
  const detail: Cell[][] = [
    [{ v: `Guardias de cada una — ${label}`, s: 'title' }],
    ['Residente', 'Fecha', 'Día', 'Tipo de día', 'Días desde la anterior'].map((h) => ({ v: h, s: 'header' as const })),
  ];
  for (const r of people) {
    const b = breakdown[r.id];
    for (const s of b.shifts) {
      const d = days.find((x) => x.date === s.date)!;
      detail.push([r.name, s.date.split('-').reverse().join('/'), WEEKDAY_LABELS[s.weekday], dayType(d), s.gapBefore ?? '—']);
    }
    detail.push([
      { v: `Total ${r.shortName}`, s: 'total' },
      { v: `${b.count} guardia(s)`, s: 'total' },
      { v: `${b.findeTotal} de finde`, s: 'total' },
      { v: `${b.sabPref} sáb/preferiado · ${b.feriados} feriado(s)`, s: 'total' },
      { v: b.minGap === null ? '' : `mín. ${b.minGap}`, s: 'total' },
    ]);
  }

  // ---------- Lista por día
  const perDay: Cell[][] = [
    [{ v: `Guardias por día — ${label}`, s: 'title' }],
    ['Fecha', 'Día', 'R1 de guardia', 'R1 requeridos', 'Tipo de día', 'Notas'].map((h) => ({ v: h, s: 'header' as const })),
    ...days.map((d): Cell[] => [
      d.date.split('-').reverse().join('/'),
      WEEKDAY_SHORT[d.weekday],
      (byDate.get(d.date) ?? []).map((s) => name(s.actualResidentId)).join(' + ') || '—',
      d.requiredR1,
      dayType(d),
      [d.notes, d.disabledSlots?.length ? `🚫 ${d.disabledNote || 'la toma otra persona'}` : '', ...eventsOn(d.date).map((e) => `🎓 ${e}`)]
        .filter(Boolean)
        .join(' · '),
    ]),
  ];

  return [
    { name: 'Calendario', rows: cal, cols: Array(7).fill(18), merges: ['A1:G1'], heights },
    { name: 'Por persona', rows: summary, cols: [22, 11, 10, 48, 8, 6, 6, 6, 6, 10, 9, 10, 11, 8, 12, 10], merges: ['A1:F1'], freezeRows: 2, heights: { 1: 32 } },
    { name: 'Lista por persona', rows: detail, cols: [22, 12, 11, 34, 12], merges: ['A1:E1'], freezeRows: 2 },
    { name: 'Por día', rows: perDay, cols: [12, 6, 26, 10, 30, 40], merges: ['A1:F1'], freezeRows: 2 },
  ];
}

/** .ics con las guardias de todas: "Guardia R1: Alba", para importar al calendario. */
export function groupIcs(shifts: Shift[], nameOf: (id: string) => string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const events = shifts.filter(valid).map((s) =>
    [
      'BEGIN:VEVENT',
      `UID:guardia-grupo-${s.id}@guardias-r1`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${s.date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${addDaysISO(s.date, 1).replace(/-/g, '')}`,
      `SUMMARY:Guardia R1: ${nameOf(s.actualResidentId)}`,
      'END:VEVENT',
    ].join('\r\n'),
  );
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Guardias R1//ES', 'X-WR-CALNAME:Guardias R1', ...events, 'END:VCALENDAR'].join('\r\n');
}

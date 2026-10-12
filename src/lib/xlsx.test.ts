import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { MonthConfig, Resident, Shift } from '../types';
import { resolveMonth } from './dates';
import { monthSheets } from './exportMonth';
import { buildXlsx, colName } from './xlsx';

const residents: Resident[] = ['Alba', 'Bravo', 'Costa'].map((n, i) => ({
  id: `r${i}`, name: n, shortName: n, email: '', role: 'resident', active: true,
}));
const configs: MonthConfig[] = [{ id: '2026-11', weekdayRequirements: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1, sun: 1 } }];
const days = resolveMonth('2026-11', [{ id: '2026-11-23', date: '2026-11-23', isHoliday: true, holidayName: 'Soberanía' }], configs);
const shifts: Shift[] = days.map((d, i) => ({
  id: `${d.date}_0`, date: d.date, slotIndex: 0, assignedResidentId: `r${i % 3}`, actualResidentId: `r${i % 3}`, status: 'programada', createdAt: '',
}));

describe('xlsx', () => {
  it('nombra columnas como Excel', () => {
    expect([0, 25, 26, 27, 701].map(colName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ']);
  });

  it('arma un libro válido con el mes', () => {
    const sheets = monthSheets({ monthKey: '2026-11', days, shifts, residents });
    const files = unzipSync(buildXlsx(sheets));
    expect(Object.keys(files)).toContain('xl/worksheets/sheet4.xml');
    const cal = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(cal).toContain('23 · Soberanía');
    const resumen = sheets[1].rows;
    // 30 guardias repartidas entre 3: 10 cada una
    expect(resumen.slice(2, 5).map((r) => r[2])).toEqual([10, 10, 10]);
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="Por persona"');
  });
});

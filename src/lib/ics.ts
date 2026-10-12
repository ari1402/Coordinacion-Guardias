import type { Shift } from '../types';
import { addDaysISO } from './dates';

/** Archivo .ics con las guardias como eventos de día completo (Google/Apple/Outlook). */
export function shiftsToIcs(shifts: Shift[], title: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const events = shifts.map((s) =>
    [
      'BEGIN:VEVENT',
      `UID:guardia-${s.id}@guardias-r1`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${s.date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${addDaysISO(s.date, 1).replace(/-/g, '')}`,
      `SUMMARY:${title}`,
      'END:VEVENT',
    ].join('\r\n'),
  );
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Guardias R1//ES', ...events, 'END:VCALENDAR'].join('\r\n');
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

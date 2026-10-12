import type { Resident } from '../types';
import { addDaysISO, diffDays } from './dates';

/** El cumpleaños o el día anterior (esa guardia termina la mañana del cumple). */
export function isBirthdayBlocked(dateISO: string, resident: Pick<Resident, 'birthday'>): boolean {
  if (!resident.birthday) return false;
  return dateISO.slice(5) === resident.birthday || addDaysISO(dateISO, 1).slice(5) === resident.birthday;
}

export function isBirthday(dateISO: string, resident: Pick<Resident, 'birthday'>): boolean {
  return !!resident.birthday && dateISO.slice(5) === resident.birthday;
}

export interface UpcomingBirthday {
  resident: Resident;
  date: string;
  daysUntil: number;
}

export function upcomingBirthdays(residents: Resident[], today: string, limit = 3): UpcomingBirthday[] {
  const year = Number(today.slice(0, 4));
  return residents
    .filter((r) => r.birthday && r.active)
    .map((r) => {
      let date = `${year}-${r.birthday}`;
      if (date < today) date = `${year + 1}-${r.birthday}`;
      return { resident: r, date, daysUntil: diffDays(today, date) };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, limit);
}

import { useState } from 'react';
import { monthKey, shiftMonthKey, todayISO } from '../lib/dates';

export function currentMonthKey(): string {
  return monthKey(todayISO());
}

export function useMonth(initial = currentMonthKey()) {
  const [key, setKey] = useState(initial);
  return {
    monthKey: key,
    next: () => setKey((m) => shiftMonthKey(m, 1)),
    prev: () => setKey((m) => shiftMonthKey(m, -1)),
    setMonthKey: setKey,
  };
}

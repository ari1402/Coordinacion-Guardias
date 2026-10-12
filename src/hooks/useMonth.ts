import { useState } from 'react';

export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function useMonth(initial = currentMonthKey()) {
  const [monthKey, setMonthKey] = useState(initial);
  return {
    monthKey,
    next: () => setMonthKey((m) => shiftMonthKey(m, 1)),
    prev: () => setMonthKey((m) => shiftMonthKey(m, -1)),
    setMonthKey,
  };
}

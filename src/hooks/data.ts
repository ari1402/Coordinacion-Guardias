import { orderBy, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { useCollection } from './useCollection';
import type {
  CalendarDay,
  GuardiaRequest,
  MonthConfig,
  Resident,
  Shift,
  ShiftFeedback,
  Swap,
} from '../types';

export function useResidents() {
  const { data, loading, error } = useCollection<Resident>('residents', [orderBy('name')]);
  return { residents: data, loading, error };
}

export function useCalendarMonth(monthKey: string) {
  const days = useCollection<CalendarDay>('calendarDays', [
    where('id', '>=', `${monthKey}-00`),
    where('id', '<=', `${monthKey}-99`),
  ], [monthKey]);
  const configs = useCollection<MonthConfig>('monthConfigs', []);
  return {
    days: days.data,
    monthConfigs: configs.data,
    loading: days.loading || configs.loading,
    error: days.error ?? configs.error,
  };
}

export function useShiftsMonth(monthKey: string) {
  const { data, loading, error } = useCollection<Shift>(
    'shifts',
    [where('date', '>=', `${monthKey}-00`), where('date', '<=', `${monthKey}-99`)],
    [monthKey],
  );
  return { shifts: data, loading, error };
}

export function useAllCalendarDays() {
  const days = useCollection<CalendarDay>('calendarDays', [orderBy('id')]);
  const configs = useCollection<MonthConfig>('monthConfigs', []);
  return {
    days: days.data,
    monthConfigs: configs.data,
    loading: days.loading || configs.loading,
    error: days.error ?? configs.error,
  };
}

export function useAllShifts() {
  const { data, loading, error } = useCollection<Shift>('shifts', [orderBy('date')]);
  return { shifts: data, loading, error };
}

export function useRequests() {
  const { data, loading, error } = useCollection<GuardiaRequest>('requests', [
    orderBy('createdAt', 'desc'),
  ]);
  return { requests: data, loading, error };
}

/**
 * Feedback: para residentes hay que filtrar por `residentId` en la propia
 * query (las Firestore rules exigen que el filtro esté en la consulta, no
 * solo verificado doc por doc) — los admins pueden omitirlo y ven todo.
 */
export function useFeedback(residentId?: string) {
  const constraints = residentId
    ? [where('residentId', '==', residentId), orderBy('createdAt', 'desc')]
    : [orderBy('createdAt', 'desc')];
  const { data, loading, error } = useCollection<ShiftFeedback>('feedback', constraints, [
    residentId,
  ]);
  return { feedback: data, loading, error };
}

export function useSwaps() {
  const { data, loading, error } = useCollection<Swap>('swaps', [orderBy('date', 'desc')]);
  return { swaps: data, loading, error };
}

export function useResidentsById(residents: Resident[]) {
  return useMemo(() => new Map(residents.map((r) => [r.id, r])), [residents]);
}

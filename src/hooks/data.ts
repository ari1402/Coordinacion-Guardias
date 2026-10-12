import { orderBy, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { useCollection } from './useCollection';
import type {
  CalendarDay,
  CamadaTask,
  GuardiaRequest,
  InfoNote,
  LinkItem,
  MonthConfig,
  Raffle,
  Resident,
  ScheduleDraft,
  Shift,
  ShiftFeedback,
  Swap,
} from '../types';

export function useResidents() {
  const { data, loading, error } = useCollection<Resident>('residents', [orderBy('name')]);
  return { residents: data, loading, error };
}

export function useResidentsById(residents: Resident[]) {
  return useMemo(() => new Map(residents.map((r) => [r.id, r])), [residents]);
}

/** Overrides de días + configs de mes. Son pocas docs: se traen enteras. */
export function useCalendarData() {
  const days = useCollection<CalendarDay>('calendarDays', []);
  const configs = useCollection<MonthConfig>('monthConfigs', []);
  return {
    storedDays: days.data,
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
  const { data, loading, error } = useCollection<GuardiaRequest>('requests', [orderBy('createdAt', 'desc')]);
  return { requests: data, loading, error };
}

/**
 * Para residentes hay que filtrar por residentId en la query misma (las
 * rules exigen que el filtro esté en la consulta); los admins lo omiten.
 */
export function useFeedback(residentId?: string) {
  // Filtrado se ordena en el cliente: así no hace falta un índice compuesto.
  const constraints = residentId ? [where('residentId', '==', residentId)] : [orderBy('createdAt', 'desc')];
  const { data, loading, error } = useCollection<ShiftFeedback>('feedback', constraints, [residentId]);
  const sorted = useMemo(() => [...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data]);
  return { feedback: sorted, loading, error };
}

export function useSwaps() {
  const { data, loading, error } = useCollection<Swap>('swaps', [orderBy('date', 'desc')]);
  return { swaps: data, loading, error };
}

export function useLinks() {
  const { data, loading, error } = useCollection<LinkItem>('links', [orderBy('createdAt', 'desc')]);
  return { links: data, loading, error };
}

export function useTasks() {
  const { data, loading, error } = useCollection<CamadaTask>('tasks', [orderBy('createdAt', 'desc')]);
  return { tasks: data, loading, error };
}

export function useNotes() {
  const { data, loading, error } = useCollection<InfoNote>('notes', [orderBy('createdAt', 'desc')]);
  return { notes: data, loading, error };
}

export function useRaffles() {
  const { data, loading, error } = useCollection<Raffle>('raffles', [orderBy('createdAt', 'desc')]);
  return { raffles: data, loading, error };
}

export function useDrafts(enabled: boolean) {
  const { data, loading, error } = useCollection<ScheduleDraft>(enabled ? 'scheduleDrafts' : '', []);
  return { drafts: enabled ? data : [], loading: enabled && loading, error };
}

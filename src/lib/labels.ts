import type { DayTag, ResolvedDay } from '../types';

export const TAG_LABEL: Partial<Record<DayTag, string>> = {
  feriado: 'Feriado',
  preferiado: 'Preferiado',
  finde_xl: 'Finde XL',
  jueves_feliz: 'Jueves feliz',
  sin_cobertura: 'Sin R1',
  sabado_finde_largo: 'Sáb. finde largo',
  sabado_comun: 'Sábado común',
};

export const TAG_EMOJI: Partial<Record<DayTag, string>> = {
  feriado: '🇦🇷',
  preferiado: '⏳',
  finde_xl: '🌟',
  jueves_feliz: '😊',
};

export function dayBgClass(day: ResolvedDay): string {
  if (day.tags.includes('sin_cobertura')) return 'bg-day-sin';
  if (day.tags.includes('feriado')) return 'bg-day-feriado';
  if (day.tags.includes('preferiado')) return 'bg-day-preferiado';
  if (day.tags.includes('finde_xl')) return 'bg-day-xl';
  if (day.tags.includes('jueves_feliz')) return 'bg-day-feliz';
  if (day.tags.includes('finde')) return 'bg-day-finde';
  return 'bg-surface';
}

export const LEGEND: { cls: string; label: string }[] = [
  { cls: 'bg-day-feriado', label: '🇦🇷 Feriado' },
  { cls: 'bg-day-preferiado', label: '⏳ Preferiado' },
  { cls: 'bg-day-xl', label: '🌟 Finde XL' },
  { cls: 'bg-day-feliz', label: '😊 Jueves feliz' },
  { cls: 'bg-day-finde', label: 'Fin de semana' },
  { cls: 'bg-day-sin', label: 'Sin R1' },
];

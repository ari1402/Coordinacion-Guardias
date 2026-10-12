import { useMemo, useState } from 'react';
import { useCalendarMonth, useResidents, useResidentsById, useShiftsMonth } from '../hooks/data';
import { monthLabel, useMonth } from '../hooks/useMonth';
import { resolveCalendarDays } from '../lib/dates';
import { buildResidentColorMap } from '../lib/palette';
import type { ResolvedDay } from '../types';
import Badge from '../components/Badge';

const WEEKDAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const TAG_BG: Record<string, string> = {
  feriado: 'bg-day-feriado',
  preferiado: 'bg-day-preferiado',
  finde_xl: 'bg-day-xl',
  jueves_feliz: 'bg-day-feliz',
  sin_cobertura: 'bg-day-sin',
  finde: 'bg-day-finde',
};

const TAG_LABEL: Record<string, string> = {
  feriado: 'Feriado',
  preferiado: 'Preferiado',
  finde_xl: 'Finde XL',
  jueves_feliz: 'Jueves feliz',
  sin_cobertura: 'Sin cobertura',
  sabado_finde_largo: 'Finde largo',
  sabado_comun: 'Sábado',
};

function dayBg(day: ResolvedDay): string {
  if (day.tags.includes('sin_cobertura')) return TAG_BG.sin_cobertura;
  if (day.tags.includes('feriado')) return TAG_BG.feriado;
  if (day.tags.includes('preferiado')) return TAG_BG.preferiado;
  if (day.tags.includes('finde_xl')) return TAG_BG.finde_xl;
  if (day.tags.includes('jueves_feliz')) return TAG_BG.jueves_feliz;
  if (day.tags.includes('finde')) return TAG_BG.finde;
  return 'bg-surface';
}

export default function Calendario() {
  const { monthKey, next, prev } = useMonth();
  const { days: rawDays, monthConfigs, loading: loadingDays } = useCalendarMonth(monthKey);
  const { shifts, loading: loadingShifts } = useShiftsMonth(monthKey);
  const { residents, loading: loadingResidents } = useResidents();
  const residentsById = useResidentsById(residents);
  const colorMap = useMemo(() => buildResidentColorMap(residents.map((r) => r.id)), [residents]);
  const [selected, setSelected] = useState<string | null>(null);

  const resolvedDays = useMemo(
    () => resolveCalendarDays(rawDays, monthConfigs),
    [rawDays, monthConfigs],
  );
  const dayById = useMemo(() => new Map(resolvedDays.map((d) => [d.id, d])), [resolvedDays]);

  const grid = useMemo(() => {
    if (resolvedDays.length === 0) return [];
    const first = resolvedDays[0];
    const leading = first.weekday; // huecos antes del día 1
    const cells: (ResolvedDay | null)[] = Array(leading).fill(null);
    cells.push(...resolvedDays);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [resolvedDays]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, typeof shifts>();
    for (const s of shifts) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    return map;
  }, [shifts]);

  const loading = loadingDays || loadingShifts || loadingResidents;
  const selectedDay = selected ? dayById.get(selected) : null;
  const selectedShifts = selected ? shiftsByDate.get(selected) ?? [] : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold capitalize">{monthLabel(monthKey)}</h1>
        <div className="flex gap-2">
          <button onClick={prev} className="px-3 py-1 rounded-lg border border-border hover:bg-surface-2 text-sm">
            ← Anterior
          </button>
          <button onClick={next} className="px-3 py-1 rounded-lg border border-border hover:bg-surface-2 text-sm">
            Siguiente →
          </button>
        </div>
      </div>

      {loading && <p className="text-text-dim text-sm">Cargando calendario…</p>}
      {!loading && resolvedDays.length === 0 && (
        <p className="text-text-dim text-sm">
          Todavía no hay datos de calendario cargados para este mes.
        </p>
      )}

      {resolvedDays.length > 0 && (
        <div className="grid grid-cols-7 gap-1.5 text-sm">
          {WEEKDAY_HEADERS.map((h) => (
            <div key={h} className="text-center text-xs text-text-dim font-medium py-1">
              {h}
            </div>
          ))}
          {grid.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />;
            const dayShifts = shiftsByDate.get(day.id) ?? [];
            return (
              <button
                key={day.id}
                onClick={() => setSelected(day.id)}
                className={`${dayBg(day)} border border-border rounded-lg p-1.5 text-left flex flex-col gap-1 min-h-[72px] hover:ring-2 hover:ring-accent transition-shadow`}
              >
                <span className="text-xs font-medium text-text-dim">
                  {Number(day.date.slice(8, 10))}
                  {day.isHoliday && ' 🇦🇷'}
                </span>
                <div className="flex flex-wrap gap-1">
                  {dayShifts.length === 0 && day.requiredR1 > 0 && (
                    <span className="text-[10px] text-danger">sin asignar</span>
                  )}
                  {dayShifts.map((s) => {
                    const r = residentsById.get(s.actualResidentId);
                    return (
                      <span
                        key={s.id}
                        className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium"
                        style={{ background: colorMap[s.actualResidentId] }}
                      >
                        {r?.shortName ?? '?'}
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-text-dim">
        {Object.entries(TAG_LABEL).map(([tag, label]) => (
          <span key={tag} className={`${TAG_BG[tag] ?? ''} px-2 py-1 rounded-md border border-border`}>
            {label}
          </span>
        ))}
      </div>

      {selectedDay && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-20"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-surface border border-border rounded-xl p-5 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">{selectedDay.date}</h2>
              <button onClick={() => setSelected(null)} className="text-text-dim">
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selectedDay.holidayName && <Badge tone="critical">{selectedDay.holidayName}</Badge>}
              {selectedDay.tags
                .filter((t) => TAG_LABEL[t])
                .map((t) => (
                  <Badge key={t} tone="neutral">
                    {TAG_LABEL[t]}
                  </Badge>
                ))}
            </div>
            <p className="text-sm text-text-dim mb-2">
              R1 requeridos: {selectedDay.requiredR1}
            </p>
            <ul className="flex flex-col gap-1.5">
              {selectedShifts.map((s) => {
                const r = residentsById.get(s.actualResidentId);
                const original = residentsById.get(s.assignedResidentId);
                return (
                  <li key={s.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: colorMap[s.actualResidentId] }}
                      />
                      {r?.name ?? s.actualResidentId}
                    </span>
                    {s.assignedResidentId !== s.actualResidentId && (
                      <span className="text-xs text-text-dim">
                        (swap, era de {original?.shortName})
                      </span>
                    )}
                  </li>
                );
              })}
              {selectedShifts.length === 0 && (
                <li className="text-sm text-danger">No hay guardia asignada.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

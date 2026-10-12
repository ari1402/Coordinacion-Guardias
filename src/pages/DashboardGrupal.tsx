import { useMemo } from 'react';
import { useAllCalendarDays, useAllShifts, useResidents } from '../hooks/data';
import { resolveCalendarDays } from '../lib/dates';
import { computeAllEquityCounters } from '../lib/equity';
import { buildResidentColorMap } from '../lib/palette';
import EquityBarChart from '../components/EquityBarChart';
import type { EquityCounters } from '../types';

const COLUMNS: { key: keyof EquityCounters; label: string }[] = [
  { key: 'totalGuardias', label: 'Total' },
  { key: 'sabados', label: 'Sábados' },
  { key: 'preferiados', label: 'Preferiados' },
  { key: 'sabadosYPreferiados', label: 'Sáb+Pref' },
  { key: 'feriados', label: 'Feriados' },
  { key: 'findesXL', label: 'Finde XL' },
  { key: 'juevesFelices', label: 'Jueves felices' },
  { key: 'viernes', label: 'Viernes' },
  { key: 'domingos', label: 'Domingos' },
  { key: 'findesLibresA', label: 'Findes libres' },
  { key: 'findesLibresB', label: 'Findes 100% libres' },
];

export default function DashboardGrupal() {
  const { residents, loading: loadingResidents } = useResidents();
  const { shifts, loading: loadingShifts } = useAllShifts();
  const { days, monthConfigs, loading: loadingDays } = useAllCalendarDays();

  const resolvedDays = useMemo(() => resolveCalendarDays(days, monthConfigs), [days, monthConfigs]);
  const colorMap = useMemo(() => buildResidentColorMap(residents.map((r) => r.id)), [residents]);
  const counters = useMemo(
    () => computeAllEquityCounters(residents.map((r) => r.id), shifts, resolvedDays),
    [residents, shifts, resolvedDays],
  );

  const loading = loadingResidents || loadingShifts || loadingDays;

  const totalsData = residents.map((r) => ({
    id: r.id,
    label: r.shortName,
    value: counters[r.id]?.totalGuardias ?? 0,
    color: colorMap[r.id],
  }));
  const sabPrefData = residents.map((r) => ({
    id: r.id,
    label: r.shortName,
    value: counters[r.id]?.sabadosYPreferiados ?? 0,
    color: colorMap[r.id],
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Dashboard grupal</h1>
        <p className="text-sm text-text-dim">
          Métricas acumuladas de todos, para transparencia total en la gestión de guardias.
        </p>
      </div>

      {loading && <p className="text-text-dim text-sm">Cargando…</p>}

      {!loading && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-surface border border-border rounded-xl p-4">
              <h2 className="text-sm font-medium mb-2">Guardias totales</h2>
              <EquityBarChart data={totalsData} />
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <h2 className="text-sm font-medium mb-2">Sábados + preferiados</h2>
              <EquityBarChart data={sabPrefData} />
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-border text-left text-text-dim">
                  <th className="px-3 py-2 font-medium">R1</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="px-3 py-2 font-medium text-right whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Dist. mín.</th>
                </tr>
              </thead>
              <tbody>
                {residents.map((r) => {
                  const c = counters[r.id];
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorMap[r.id] }} />
                        {r.shortName}
                      </td>
                      {COLUMNS.map((col) => (
                        <td key={col.key} className="px-3 py-2 text-right tabular-nums">
                          {c ? String(c[col.key]) : 0}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums">
                        {c?.distanciaMinima ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

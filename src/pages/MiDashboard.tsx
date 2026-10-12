import { useMemo } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { useAllCalendarDays, useAllShifts, useResidents } from '../hooks/data';
import { resolveCalendarDays } from '../lib/dates';
import { computeAllEquityCounters } from '../lib/equity';
import { buildResidentColorMap } from '../lib/palette';
import StatTile from '../components/StatTile';
import EquityBarChart from '../components/EquityBarChart';

export default function MiDashboard() {
  const { resident } = useAuthContext();
  const { residents } = useResidents();
  const { shifts, loading: loadingShifts } = useAllShifts();
  const { days, monthConfigs, loading: loadingDays } = useAllCalendarDays();

  const resolvedDays = useMemo(() => resolveCalendarDays(days, monthConfigs), [days, monthConfigs]);
  const colorMap = useMemo(() => buildResidentColorMap(residents.map((r) => r.id)), [residents]);
  const counters = useMemo(
    () => computeAllEquityCounters(residents.map((r) => r.id), shifts, resolvedDays),
    [residents, shifts, resolvedDays],
  );

  const loading = loadingShifts || loadingDays || !resident;
  if (loading) return <p className="text-text-dim text-sm">Cargando…</p>;

  const mine = counters[resident!.id];
  if (!mine) return <p className="text-text-dim text-sm">Todavía no tenés guardias cargadas.</p>;

  const totalsData = residents.map((r) => ({
    id: r.id,
    label: r.shortName,
    value: counters[r.id]?.totalGuardias ?? 0,
    color: colorMap[r.id],
    highlight: r.id === resident!.id,
  }));
  const sabPrefData = residents.map((r) => ({
    id: r.id,
    label: r.shortName,
    value: counters[r.id]?.sabadosYPreferiados ?? 0,
    color: colorMap[r.id],
    highlight: r.id === resident!.id,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Hola, {resident!.shortName}</h1>
        <p className="text-sm text-text-dim">Tu panel personal — acumulado histórico.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <StatTile label="Guardias totales" value={mine.totalGuardias} accent={colorMap[resident!.id]} />
        <StatTile label="Sábados + preferiados" value={mine.sabadosYPreferiados} />
        <StatTile label="Feriados" value={mine.feriados} />
        <StatTile label="Findes XL" value={mine.findesXL} />
        <StatTile label="Jueves felices" value={mine.juevesFelices} />
        <StatTile label="Viernes" value={mine.viernes} />
        <StatTile label="Domingos" value={mine.domingos} />
        <StatTile
          label="Findes libres"
          value={mine.findesLibresA}
          hint={`${mine.findesLibresB} sin posguardia jueves`}
        />
        <StatTile
          label="Distancia mínima"
          value={mine.distanciaMinima ?? '—'}
          hint={
            mine.distanciaPromedio !== null ? `promedio ${mine.distanciaPromedio.toFixed(1)} días` : undefined
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-surface border border-border rounded-xl p-4">
          <h2 className="text-sm font-medium mb-2">Guardias totales por persona</h2>
          <EquityBarChart data={totalsData} />
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <h2 className="text-sm font-medium mb-2">Sábados + preferiados por persona</h2>
          <EquityBarChart data={sabPrefData} />
        </div>
      </div>
      <p className="text-xs text-text-dim">
        Las barras resaltadas son las tuyas. Para ver el detalle de todos, entrá a{' '}
        <span className="font-medium">Dashboard grupal</span>.
      </p>
    </div>
  );
}

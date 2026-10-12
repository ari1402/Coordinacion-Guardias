import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Dot, PageHeader } from '../components/ui';
import { useAllShifts, useCalendarData, useRequests, useResidents, useRotations } from '../hooks/data';
import { awayMonths } from '../lib/rotations';
import { useColors } from '../hooks/useColors';
import { monthLabel, resolveMonths } from '../lib/dates';
import { computeAllEquityCounters, monthsWithShifts, resolvePeriod } from '../lib/equity';
import { SERIES_VARS } from '../lib/palette';
import type { EquityCounters } from '../types';

type Sense = 'burden' | 'benefit' | 'neutral';
const COLUMNS: { key: keyof EquityCounters; label: string; sense: Sense; title: string }[] = [
  { key: 'totalGuardias', label: 'Total', sense: 'burden', title: 'Guardias totales' },
  { key: 'lunAMie', label: 'Lun–Mié', sense: 'neutral', title: 'Guardias de lunes a miércoles' },
  { key: 'viernes', label: 'Vie', sense: 'burden', title: 'Viernes' },
  { key: 'sabados', label: 'Sáb', sense: 'burden', title: 'Sábados' },
  { key: 'domingos', label: 'Dom', sense: 'burden', title: 'Domingos' },
  { key: 'sabadosYPreferiados', label: 'Sáb+Pref', sense: 'burden', title: 'Sábados + preferiados (cuentan igual)' },
  { key: 'feriados', label: 'Feriados', sense: 'burden', title: 'Guardias en feriado' },
  { key: 'findesXL', label: 'Finde XL', sense: 'benefit', title: 'Jueves antes de lunes feriado' },
  { key: 'juevesFelices', label: 'J. feliz', sense: 'benefit', title: 'Jueves comunes' },
  { key: 'findesLibresA', label: 'Findes libres', sense: 'benefit', title: 'Findes sin guardia vie/sáb/dom' },
  { key: 'findesLibresB', label: 'Libres 100%', sense: 'benefit', title: 'Además sin posguardia del jueves' },
  { key: 'distanciaMinima', label: 'Dist. mín', sense: 'benefit', title: 'Menor cantidad de días entre dos guardias' },
  { key: 'distanciaPromedio', label: 'Dist. prom', sense: 'benefit', title: 'Promedio de días entre guardias' },
  { key: 'sinDormir', label: 'Sin dormir', sense: 'burden', title: 'Guardias reportadas sin dormir' },
];

function cellStyle(value: number | null, mean: number, maxAbs: number, sense: Sense) {
  if (value === null || sense === 'neutral') return undefined;
  const d = value - mean;
  if (Math.abs(d) < 0.5) return undefined;
  const favorable = sense === 'benefit' ? d > 0 : d < 0;
  const pct = Math.round(12 + 28 * Math.min(1, Math.abs(d) / Math.max(1, maxAbs)));
  return { background: `color-mix(in srgb, ${favorable ? 'var(--series-1)' : 'var(--series-8)'} ${pct}%, transparent)` };
}

const STACK = [
  { key: 'lunAMie', label: 'Lun–Mié' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
  { key: 'sabados', label: 'Sábado' },
  { key: 'domingos', label: 'Domingo' },
] as const;

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
};

export default function Metricas() {
  const { residents } = useResidents();
  const { rotations } = useRotations();
  const active = useMemo(() => residents.filter((r) => r.active), [residents]);
  const color = useColors(residents);
  const { shifts, loading } = useAllShifts();
  const { storedDays, monthConfigs } = useCalendarData();
  const { requests } = useRequests();
  const [period, setPeriod] = useState<string>('all');

  const valid = useMemo(() => shifts.filter((s) => s.status !== 'cancelada'), [shifts]);
  const months = useMemo(() => monthsWithShifts(valid), [valid]);
  const periodShifts = period === 'all' ? valid : valid.filter((s) => s.date.startsWith(period));
  const days = useMemo(
    () => (period === 'all' ? resolvePeriod(valid, storedDays, monthConfigs) : resolveMonths([period], storedDays, monthConfigs)),
    [period, valid, storedDays, monthConfigs],
  );
  const counters = useMemo(
    () => computeAllEquityCounters(active.map((r) => r.id), periodShifts, days, awayMonths(rotations)),
    [active, periodShifts, days, rotations],
  );

  const stats = COLUMNS.map((c) => {
    const vals = active.map((r) => counters[r.id]?.[c.key]).filter((v): v is number => typeof v === 'number');
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const maxAbs = Math.max(0, ...vals.map((v) => Math.abs(v - mean)));
    return { mean, maxAbs };
  });

  const totals = active.map((r) => counters[r.id]?.totalGuardias ?? 0);
  const sinDormir = active.reduce((a, r) => a + (counters[r.id]?.sinDormir ?? 0), 0);
  const reportes = active.reduce((a, r) => a + (counters[r.id]?.conReporteSueno ?? 0), 0);
  const periodRequests = requests.filter((r) => period === 'all' || r.dates.some((d) => d.startsWith(period)));
  const resolved = periodRequests.filter((r) => r.status !== 'pendiente');
  const accepted = resolved.filter((r) => r.status === 'aceptado' || r.status === 'parcial');

  const stackData = active.map((r) => ({
    name: r.shortName,
    ...Object.fromEntries(STACK.map((s) => [s.key, counters[r.id]?.[s.key] ?? 0])),
  }));

  const cumulative = useMemo(
    () =>
      months.map((m) => ({
        month: monthLabel(m).split(' ')[0].slice(0, 3),
        ...Object.fromEntries(
          active.map((r) => [r.shortName, valid.filter((s) => s.date.slice(0, 7) <= m && s.actualResidentId === r.id).length]),
        ),
      })),
    [months, valid, active],
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Métricas del grupo"
        subtitle="Transparencia total: cómo se viene repartiendo todo, con datos concretos (sin puntajes)."
        actions={
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="bg-surface border border-border rounded-xl px-3 py-2 text-sm">
            <option value="all">Acumulado ({months.length} mes{months.length === 1 ? '' : 'es'})</option>
            {[...months].reverse().map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        }
      />

      {loading ? (
        <p className="text-sm text-text-dim">Cargando…</p>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi label="Guardias en el período" value={periodShifts.length} />
            <Kpi
              label="Por persona"
              value={totals.length ? `${Math.min(...totals)}–${Math.max(...totals)}` : '—'}
              hint={totals.length && Math.max(...totals) - Math.min(...totals) <= 1 ? 'diferencia ≤ 1 ✓' : 'diferencia > 1'}
            />
            <Kpi label="Noches sin dormir" value={sinDormir} hint={`sobre ${reportes} guardia(s) con reporte`} />
            <Kpi
              label="Pedidos aceptados"
              value={resolved.length ? `${accepted.length}/${resolved.length}` : '—'}
              hint={`${periodRequests.length - resolved.length} pendiente(s)`}
            />
          </div>

          <Card
            title="Mapa de reparto"
            subtitle="Cada celda se compara con el promedio del grupo: azul = le tocó mejor que el promedio, rojo = le tocó peor. Más intenso = más lejos del promedio."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[880px] border-separate border-spacing-0.5">
                <thead>
                  <tr className="text-xs text-text-dim">
                    <th className="text-left font-medium p-1.5">R1</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="font-medium p-1.5 text-right whitespace-nowrap" title={c.title}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.map((r) => (
                    <tr key={r.id}>
                      <td className="p-1.5 whitespace-nowrap">
                        <span className="flex items-center gap-2 font-medium">
                          <Dot color={color(r.id)} />
                          {r.shortName}
                        </span>
                      </td>
                      {COLUMNS.map((c, i) => {
                        const raw = counters[r.id]?.[c.key];
                        const v = typeof raw === 'number' ? raw : null;
                        return (
                          <td
                            key={c.key}
                            className="p-1.5 text-right tabular-nums rounded-md"
                            style={cellStyle(v, stats[i].mean, stats[i].maxAbs, c.sense)}
                            title={v === null ? '' : `${c.title}: ${Number.isInteger(v) ? v : v.toFixed(1)} · promedio ${stats[i].mean.toFixed(1)}`}
                          >
                            {v === null ? '—' : Number.isInteger(v) ? v : v.toFixed(1)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="text-text-dim text-xs">
                    <td className="p-1.5">Promedio</td>
                    {stats.map((s, i) => (
                      <td key={COLUMNS[i].key} className="p-1.5 text-right tabular-nums">
                        {s.mean.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="¿Qué días le tocan a cada una?" subtitle="Composición de las guardias por día de la semana">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stackData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }} barCategoryGap={12}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--chart-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--chart-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={(item) => STACK.findIndex((s) => s.label === item.value)} />
                  {STACK.map((s, i) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      stackId="a"
                      fill={SERIES_VARS[i]}
                      stroke="var(--surface)"
                      strokeWidth={1}
                      radius={i === STACK.length - 1 ? [4, 4, 0, 0] : 0}
                      maxBarSize={40}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Guardias acumuladas mes a mes" subtitle="Si las líneas se separan, alguien viene cargando más">
              {cumulative.length < 2 ? (
                <p className="text-sm text-text-dim py-10 text-center">Aparece cuando haya al menos 2 meses cargados.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={cumulative} margin={{ top: 4, right: 12, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--chart-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--chart-muted)' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {active.map((r) => (
                      <Line key={r.id} type="monotone" dataKey={r.shortName} stroke={color(r.id)} strokeWidth={2} dot={{ r: 3 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-surface border border-border rounded-2xl px-4 py-3">
      <p className="text-xs text-text-dim">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {hint && <p className="text-xs text-text-dim mt-0.5">{hint}</p>}
    </div>
  );
}

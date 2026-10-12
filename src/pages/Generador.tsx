import { doc, writeBatch } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { useAllCalendarDays, useAllShifts, useRequests, useResidents, useResidentsById } from '../hooks/data';
import { monthLabel, useMonth } from '../hooks/useMonth';
import { resolveCalendarDays } from '../lib/dates';
import { computeAllEquityCounters } from '../lib/equity';
import { generateSchedule, type GeneratorResult } from '../lib/generator';
import Badge from '../components/Badge';

const VIOLATION_LABEL: Record<string, string> = {
  sin_cobertura: 'Sin cobertura',
  distancia_corta: 'Distancia corta',
  pedido_fuerte_no_cumplido: 'Pedido fuerte no cumplido',
  sabado_y_preferiado_mismo_mes: 'Sábado + preferiado el mismo mes',
};

export default function Generador() {
  const { monthKey, next, prev } = useMonth();
  const { days, monthConfigs, loading: loadingDays } = useAllCalendarDays();
  const { residents, loading: loadingResidents } = useResidents();
  const residentsById = useResidentsById(residents);
  const { requests, loading: loadingRequests } = useRequests();
  const { shifts: allShifts, loading: loadingShifts } = useAllShifts();

  const [result, setResult] = useState<GeneratorResult | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const resolvedAllDays = useMemo(() => resolveCalendarDays(days, monthConfigs), [days, monthConfigs]);
  const resolvedDays = useMemo(
    () => resolvedAllDays.filter((d) => d.id.startsWith(monthKey)),
    [resolvedAllDays, monthKey],
  );

  const priorData = useMemo(() => {
    const priorShifts = allShifts.filter((s) => s.date < `${monthKey}-00`);
    const priorCounters = computeAllEquityCounters(residents.map((r) => r.id), priorShifts, resolvedAllDays);
    const priorLastShiftDate: Record<string, string> = {};
    for (const r of residents) {
      const mine = priorShifts.filter((s) => s.actualResidentId === r.id).sort((a, b) => b.date.localeCompare(a.date));
      if (mine[0]) priorLastShiftDate[r.id] = mine[0].date;
    }
    return { priorCounters, priorLastShiftDate };
  }, [allShifts, monthKey, residents, resolvedAllDays]);

  const monthRequests = useMemo(
    () => requests.filter((r) => r.dates.some((d) => d.startsWith(monthKey))),
    [requests, monthKey],
  );

  const loading = loadingDays || loadingResidents || loadingRequests || loadingShifts;

  function run() {
    const res = generateSchedule({
      days: resolvedDays,
      residents,
      requests: monthRequests,
      priorCounters: priorData.priorCounters,
      priorLastShiftDate: priorData.priorLastShiftDate,
    });
    setResult(res);
    setPublished(false);
  }

  async function publish() {
    if (!result) return;
    setPublishing(true);
    try {
      const batch = writeBatch(db);
      for (const a of result.assignments) {
        if (!a.residentId) continue;
        const id = `${a.date}_${a.slotIndex}`;
        batch.set(doc(db, 'shifts', id), {
          id,
          date: a.date,
          slotIndex: a.slotIndex,
          assignedResidentId: a.residentId,
          actualResidentId: a.residentId,
          status: 'programada',
          createdAt: new Date().toISOString(),
        });
      }
      await batch.commit();
      setPublished(true);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold">Generador de cronograma</h1>
          <p className="text-sm text-text-dim">
            Propuesta automática respetando bloqueos, pedidos, distancia mínima y equidad acumulada.
          </p>
        </div>
        <Link to="/admin" className="text-sm text-text-dim underline">
          ← volver a Admin
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={prev} className="px-3 py-1 rounded-lg border border-border text-sm">← Anterior</button>
        <span className="font-medium capitalize">{monthLabel(monthKey)}</span>
        <button onClick={next} className="px-3 py-1 rounded-lg border border-border text-sm">Siguiente →</button>
        <button
          onClick={run}
          disabled={loading}
          className="ml-auto rounded-lg bg-accent text-accent-contrast px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Generar propuesta
        </button>
      </div>

      {loading && <p className="text-text-dim text-sm">Cargando datos…</p>}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {residents.map((r) => (
              <Badge key={r.id} tone="neutral">
                {r.shortName}: {result.totals[r.id] ?? 0} guardias este mes
              </Badge>
            ))}
            <Badge tone={result.violations.length === 0 ? 'good' : 'warning'}>
              score {result.score.toFixed(1)} · {result.violations.length} avisos
            </Badge>
          </div>

          <div className="bg-surface border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-dim">
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Slot</th>
                  <th className="px-3 py-2">Asignado</th>
                </tr>
              </thead>
              <tbody>
                {result.assignments.map((a) => (
                  <tr key={`${a.date}_${a.slotIndex}`} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">{a.date}</td>
                    <td className="px-3 py-2">{a.slotIndex}</td>
                    <td className="px-3 py-2">
                      {a.residentId ? residentsById.get(a.residentId)?.name ?? a.residentId : (
                        <span className="text-danger">sin cobertura</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.violations.length > 0 && (
            <div className="bg-warn-soft border border-warn/30 rounded-xl p-4">
              <h2 className="text-sm font-medium text-warn mb-2">Avisos</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {result.violations.map((v, i) => (
                  <li key={i}>
                    <Badge tone="warning">{VIOLATION_LABEL[v.type] ?? v.type}</Badge>{' '}
                    <span className="text-text-dim">{v.date} — {v.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={publish}
            disabled={publishing || published}
            className="self-start rounded-lg bg-ok-soft text-ok px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {published ? 'Publicado ✓' : publishing ? 'Publicando…' : 'Publicar este cronograma'}
          </button>
          <p className="text-xs text-text-dim">
            Publicar sobreescribe las guardias existentes de {monthLabel(monthKey)} con esta propuesta.
          </p>
        </div>
      )}
    </div>
  );
}

import clsx from 'clsx';
import type { PersonBreakdown } from '../lib/breakdown';
import { shortDateLabel } from '../lib/dates';
import { TAG_EMOJI } from '../lib/labels';
import type { Resident } from '../types';
import { Dot } from './ui';

const WD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function gapTone(gap: number, hard: number, ideal: number) {
  if (gap <= hard) return 'bg-danger-soft text-danger';
  if (gap < ideal) return 'bg-warn-soft text-warn';
  return 'bg-surface-2 text-text-dim';
}

export default function PersonBreakdownGrid({
  data,
  residents,
  color,
  minGapHard,
  minGapIdeal,
  onShowCalendar,
}: {
  data: Record<string, PersonBreakdown>;
  residents: Resident[];
  color: (id: string) => string;
  minGapHard: number;
  minGapIdeal: number;
  /** Si viene, cada tarjeta tiene un botón para ver el calendario del mes con esa persona resaltada. */
  onShowCalendar?: (residentId: string) => void;
}) {
  const shown = residents.map((r) => data[r.id]).filter(Boolean);
  const meanLibres = shown.reduce((a, b) => a + b.cumFindesLibres, 0) / (shown.length || 1);
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {residents.map((r) => {
        const b = data[r.id];
        if (!b) return null;
        return (
          <div key={r.id} className="border border-border rounded-xl p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium text-sm">
                <Dot color={color(r.id)} />
                {r.shortName}
              </span>
              <span className="flex items-center gap-2 text-xs text-text-dim">
                <span>
                  <b className="text-text">{b.count}</b> este mes · {b.cumTotal} acumuladas
                </span>
                {onShowCalendar && (
                  <button
                    onClick={() => onShowCalendar(r.id)}
                    className="rounded-md border border-border px-1.5 py-0.5 hover:bg-surface-2"
                    title="Ver sus guardias en el calendario del mes"
                    aria-label={`Ver las guardias de ${r.shortName} en el calendario`}
                  >
                    📅
                  </button>
                )}
              </span>
            </div>

            <ol className="flex flex-col gap-1">
              {b.shifts.length === 0 && <li className="text-xs text-text-dim">Sin guardias asignadas.</li>}
              {b.shifts.map((s, i) => (
                <li key={`${s.date}${i}`} className="flex items-center justify-between text-sm">
                  <span className="capitalize">
                    {shortDateLabel(s.date)}{' '}
                    <span className="text-xs">{s.tags.map((t) => TAG_EMOJI[t]).filter(Boolean).join('')}</span>
                    {s.locked && <span className="text-[10px] ml-1" title="Fijada">🔒</span>}
                  </span>
                  {s.gapBefore !== null && (
                    <span
                      className={clsx('text-[11px] px-1.5 py-0.5 rounded-md tabular-nums', gapTone(s.gapBefore, minGapHard, minGapIdeal))}
                      title={i === 0 ? 'Días desde su última guardia del mes anterior' : 'Días desde la guardia anterior'}
                    >
                      {i === 0 ? '↩ ' : '+'}
                      {s.gapBefore} d
                    </span>
                  )}
                </li>
              ))}
            </ol>

            <div className="grid grid-cols-7 gap-1" title="Guardias por día de la semana">
              {b.byWeekday.map((n, i) => (
                <div
                  key={i}
                  className={clsx(
                    'rounded-md text-center py-1 text-[11px]',
                    n === 0 ? 'bg-surface-2 text-text-dim' : n > 1 ? 'bg-warn-soft text-warn font-semibold' : 'bg-accent-soft text-accent font-semibold',
                  )}
                >
                  <div>{WD[i]}</div>
                  <div className="tabular-nums">{n || '·'}</div>
                </div>
              ))}
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-text-dim" title="Libre = sin guardia desde el viernes (o la noche antes del feriado) hasta el último día no hábil">
                Findes libres
              </dt>
              <dd className="text-right tabular-nums">
                {b.findesLibres} de {b.findesDelMes} <span className="text-text-dim">(acum. {b.cumFindesLibres})</span>{' '}
                <DeltaBadge delta={b.cumFindesLibres - meanLibres} />
              </dd>
              {b.findesLargosDelMes > 0 && (
                <>
                  <dt className="text-text-dim">Findes largos libres este mes</dt>
                  <dd className="text-right tabular-nums">
                    {b.findesLargosLibres}
                    {b.xl > 0 && <span className="text-text-dim"> (+{b.xl} XL)</span>}
                  </dd>
                </>
              )}
              <dt className="text-text-dim">Sáb + preferiado</dt>
              <dd className="text-right tabular-nums">
                {b.sabPref} <span className="text-text-dim">(acum. {b.cumSabPref})</span>
              </dd>
              <dt className="text-text-dim">Guardias vie/sáb/dom</dt>
              <dd className="text-right tabular-nums">{b.findeTotal}</dd>
              <dt className="text-text-dim">Feriados</dt>
              <dd className="text-right tabular-nums">
                {b.feriados} <span className="text-text-dim">(acum. {b.cumFeriados})</span>
              </dd>
              <dt className="text-text-dim">Jueves feliz · XL</dt>
              <dd className="text-right tabular-nums">
                {b.juevesFelices} · {b.xl}
              </dd>
              <dt className="text-text-dim">Separación mín · prom</dt>
              <dd className="text-right tabular-nums">
                {b.minGap ?? '—'} · {b.avgGap?.toFixed(1) ?? '—'} d
              </dd>
            </dl>
          </div>
        );
      })}
    </div>
  );
}

/** Diferencia con el promedio del grupo (más findes libres = mejor). */
function DeltaBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.5) return <span className="text-[11px] text-text-dim">(en el promedio)</span>;
  return (
    <span className={clsx('text-[11px] px-1.5 py-0.5 rounded-md', delta > 0 ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')}>
      {delta > 0 ? '+' : ''}
      {delta.toFixed(1).replace('.', ',')} vs prom.
    </span>
  );
}

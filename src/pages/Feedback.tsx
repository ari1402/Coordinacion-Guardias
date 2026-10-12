import clsx from 'clsx';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Badge from '../components/Badge';
import FeedbackForm from '../components/FeedbackForm';
import { Card, Empty, PageHeader } from '../components/ui';
import { useAuthContext } from '../context/AuthContext';
import { useAllShifts, useFeedback } from '../hooks/data';
import { diffDays, shortDateLabel, todayISO } from '../lib/dates';

export default function Feedback() {
  const { resident: me } = useAuthContext();
  const { shifts, loading } = useAllShifts();
  const { feedback } = useFeedback(me?.id);
  const [params] = useSearchParams();
  const focus = params.get('shift');
  const sleptParam = params.get('slept');
  const initialSlept = sleptParam === '1' ? true : sleptParam === '0' ? false : undefined;
  const today = todayISO();

  const mine = useMemo(
    () => shifts.filter((s) => s.actualResidentId === me?.id && s.status !== 'cancelada'),
    [shifts, me],
  );
  const byShift = new Map(feedback.map((f) => [f.shiftId, f]));
  const past = mine.filter((s) => s.date < today).reverse();
  const pending = past.filter((s) => !byShift.has(s.id)).sort((a, b) => Number(b.id === focus) - Number(a.id === focus));
  const done = past.filter((s) => byShift.has(s.id));
  const upcoming = mine.filter((s) => s.date >= today);
  const sinDormir = feedback.filter((f) => !f.slept).length;
  const cargas = feedback.map((f) => f.carga).filter((c): c is number => typeof c === 'number');
  const avgCarga = cargas.length ? cargas.reduce((a, b) => a + b, 0) / cargas.length : null;

  if (loading || !me) return <Empty>Cargando…</Empty>;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Mis guardias"
        subtitle="Contá cómo te fue: ¿dormiste? y carga del 1 al 10. El detalle lo ven solo Bea y Ana; las noches sin dormir se cuentan en las métricas del grupo."
      />
      <div className="flex gap-2 flex-wrap">
        <Badge tone={pending.length ? 'warning' : 'good'}>{pending.length} sin feedback</Badge>
        <Badge tone="critical">{sinDormir} sin dormir</Badge>
        {avgCarga !== null && <Badge tone="info">carga promedio {avgCarga.toFixed(1)}/10</Badge>}
        <Badge>{upcoming.length} por venir</Badge>
      </div>

      {pending.length > 0 && (
        <div className="flex flex-col gap-3">
          {pending.map((s) => (
            <Card
              key={s.id}
              title={<span className="capitalize">{shortDateLabel(s.date)}</span>}
              subtitle={`hace ${diffDays(s.date, today)} día(s)`}
              className={clsx(focus === s.id && 'ring-2 ring-accent')}
            >
              <FeedbackForm shift={s} residentId={me.id} initialSlept={focus === s.id ? initialSlept : undefined} />
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Próximas">
          {upcoming.length === 0 ? (
            <Empty>No tenés guardias publicadas por delante.</Empty>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {upcoming.map((s) => (
                <li key={s.id} className="capitalize">
                  {shortDateLabel(s.date)} <span className="text-text-dim normal-case">· en {diffDays(today, s.date)} días</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Ya contadas">
          {done.length === 0 ? (
            <Empty>Todavía no cargaste feedback.</Empty>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {done.map((s) => {
                const f = byShift.get(s.id)!;
                return (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="capitalize">{shortDateLabel(s.date)}</span>
                    <span className="flex gap-1.5">
                      <Badge tone={f.slept ? 'good' : 'critical'}>{f.slept ? 'durmió' : 'no durmió'}</Badge>
                      {f.carga !== undefined && <Badge tone="info">carga {f.carga}</Badge>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

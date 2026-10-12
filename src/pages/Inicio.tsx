import clsx from 'clsx';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../components/Badge';
import { MyRotationStrip, rotationMonths } from '../components/Carriles';
import { AckAlerts, MonthAckCard, pendingAcks } from '../components/Conformidad';
import { eventEmoji, upcomingEventDates } from '../components/Eventos';
import FeedbackForm from '../components/FeedbackForm';
import PushCard from '../components/PushCard';
import RangeBar from '../components/RangeBar';
import { Card, Dot, Empty, ResidentChip } from '../components/ui';
import { useAuthContext } from '../context/AuthContext';
import {
  useAcks,
  useAllShifts,
  useCalendarData,
  useEvents,
  useFeedback,
  useLinks,
  useRaffles,
  useRequests,
  useResidents,
  useResidentsById,
  useRotations,
  usePublications,
  useTasks,
} from '../hooks/data';
import { useColors } from '../hooks/useColors';
import { upcomingBirthdays } from '../lib/birthdays';
import { addDaysISO, diffDays, gapsBetween, monthKey, monthLabel, resolveMonth, shiftMonthKey, shortDateLabel, todayISO } from '../lib/dates';
import { computeAllEquityCounters, resolvePeriod } from '../lib/equity';
import { TAG_EMOJI, TAG_LABEL } from '../lib/labels';
import { winners } from '../lib/raffles';
import { awayMonths } from '../lib/rotations';
import type { EquityCounters, ResolvedDay } from '../types';
import { requesterName } from '../types';

const SNAPSHOT: { key: keyof EquityCounters; label: string; benefit?: boolean; hint: string }[] = [
  { key: 'totalGuardias', label: 'Guardias totales', hint: 'todas las guardias hechas o publicadas' },
  { key: 'sabadosYPreferiados', label: 'Sábados + preferiados', hint: 'las que cortan el finde' },
  { key: 'sabadosSinCompensar', label: 'Sábados sin jueves', hint: 'sin jueves feliz o XL ese mes' },
  { key: 'findeTotal', label: 'Vie + sáb + dom', hint: 'guardias de fin de semana' },
  { key: 'feriados', label: 'Feriados', hint: 'guardias en feriado' },
  { key: 'findesXL', label: 'Findes XL', benefit: true, hint: 'jueves antes de lunes feriado' },
  { key: 'juevesFelices', label: 'Jueves felices', benefit: true, hint: 'jueves comunes' },
  { key: 'findesLibresComunes', label: 'Findes comunes libres', benefit: true, hint: 'sin guardia vie a la noche, sáb y dom' },
  { key: 'findesLibresLargos', label: 'Findes largos libres', benefit: true, hint: 'libre desde la noche anterior hasta el feriado' },
];

function daysUntilLabel(n: number) {
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  return `en ${n} días`;
}

export default function Inicio() {
  const { resident: me, isAdmin } = useAuthContext();
  const { residents } = useResidents();
  const byId = useResidentsById(residents);
  const color = useColors(residents);
  const { shifts, loading } = useAllShifts();
  const { storedDays, monthConfigs } = useCalendarData();
  const { feedback } = useFeedback(me?.id);
  const { requests } = useRequests();
  const { tasks } = useTasks();
  const { links } = useLinks();
  const { raffles } = useRaffles();
  const { rotations } = useRotations();
  const { events } = useEvents();
  const publications = usePublications();
  const acks = useAcks(isAdmin ? undefined : me?.id);
  const today = todayISO();

  const active = useMemo(() => residents.filter((r) => r.active), [residents]);
  const valid = useMemo(() => shifts.filter((s) => s.status !== 'cancelada'), [shifts]);
  const mine = useMemo(() => valid.filter((s) => s.actualResidentId === me?.id), [valid, me]);
  const nextShift = mine.find((s) => s.date >= today);
  const done = new Set(feedback.map((f) => f.shiftId));
  const pending = mine.filter((s) => s.date < today && diffDays(s.date, today) <= 30 && !done.has(s.id));

  const periodDays = useMemo(() => resolvePeriod(valid, storedDays, monthConfigs), [valid, storedDays, monthConfigs]);
  const dayById = useMemo(() => {
    const m = new Map(periodDays.map((d) => [d.id, d]));
    for (const d of resolveMonth(monthKey(today), storedDays, monthConfigs)) m.set(d.id, d);
    for (const d of resolveMonth(monthKey(addDaysISO(today, 7)), storedDays, monthConfigs)) m.set(d.id, d);
    return m;
  }, [periodDays, today, storedDays, monthConfigs]);
  const counters = useMemo(
    () =>
      computeAllEquityCounters(active.map((r) => r.id), valid, periodDays, {
        away: awayMonths(rotations),
        holidays: new Set(storedDays.filter((d) => d.isHoliday).map((d) => d.date)),
      }),
    [active, valid, periodDays, rotations, storedDays],
  );

  const week = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i));
  const thisMonth = mine.filter((s) => s.date.startsWith(monthKey(today)));
  const monthGaps = gapsBetween(thisMonth.map((s) => s.date));
  const birthdays = upcomingBirthdays(residents, today, 3);
  const openTasks = tasks
    .filter((t) => t.status !== 'hecha')
    .sort((a, b) => Number(b.assigneeIds.includes(me?.id ?? '')) - Number(a.assigneeIds.includes(me?.id ?? '')))
    .slice(0, 5);
  const pinned = links.filter((l) => l.pinned).slice(0, 8);
  const pendingRequests = requests.filter((r) => r.status === 'pendiente').slice(0, 4);
  const recentRaffles = raffles.filter((r) => !r.ignored).slice(0, 3);
  const nextMonth = shiftMonthKey(monthKey(today), 1);
  const dayOfMonth = Number(today.slice(8));
  // El aviso de pedidos dura 48 h (días 8 y 9): el 10 se generan las guardias.
  const askPedidos =
    (dayOfMonth === 8 || dayOfMonth === 9) &&
    !requests.some((r) => r.residentId === me?.id && r.dates.some((d) => d.startsWith(nextMonth)));
  const toGenerate = isAdmin && dayOfMonth >= 10 && !shifts.some((s) => s.date.startsWith(nextMonth));
  const upcomingEvents = upcomingEventDates(events, today, 4);

  if (loading || !me) return <p className="text-sm text-text-dim">Cargando…</p>;

  const nextDay: ResolvedDay | undefined = nextShift ? dayById.get(nextShift.date) : undefined;
  const firstName = me.name.split(' ')[0];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-text-dim capitalize">
          {new Date(`${today}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {firstName} 👋</h1>
      </div>

      {isAdmin && <AckAlerts acks={acks} byId={byId} meId={me.id} />}
      {pendingAcks(publications, acks, me.id).map((p) => (
        <MonthAckCard key={p.id} publication={p} me={me} shifts={shifts} />
      ))}
      {askPedidos && (
        <Link
          to="/pedidos"
          className="rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm flex items-center justify-between gap-3 hover:brightness-95"
        >
          <span>
            📝 Todavía no cargaste tus pedidos de <b>{monthLabel(nextMonth)}</b> (días que querés, que no podés o que
            necesitás el posguardia). El 10 se generan las guardias.
          </span>
          <span className="text-accent font-medium whitespace-nowrap">Cargar →</span>
        </Link>
      )}
      {toGenerate && (
        <Link
          to={`/admin/generador?mes=${nextMonth}`}
          className="rounded-2xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm flex items-center justify-between gap-3 hover:brightness-95"
        >
          <span>
            ✨ Toca generar las guardias de <b>{monthLabel(nextMonth)}</b>.
          </span>
          <span className="text-warn font-medium whitespace-nowrap">Ir al generador →</span>
        </Link>
      )}

      {pending.length > 0 && (
        <Card
          title={`¿Cómo te fue en la guardia del ${shortDateLabel(pending[pending.length - 1].date)}?`}
          subtitle="Dos preguntas, 10 segundos. Sirve para mejorar el reparto (lo detallado solo lo ven Bea y Ana)."
          action={
            pending.length > 1 ? (
              <Link to="/feedback" className="text-xs text-accent underline">
                +{pending.length - 1} pendiente(s)
              </Link>
            ) : undefined
          }
          className="border-accent/40"
        >
          <FeedbackForm key={pending[pending.length - 1].id} shift={pending[pending.length - 1]} residentId={me.id} compact />
        </Card>
      )}

      <div className="contents lg:grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-2xl p-5 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--accent), #8f7ee6)' }}>
          <p className="text-sm opacity-80">Tu próxima guardia</p>
          {nextShift ? (
            <>
              <p className="text-3xl font-semibold mt-1 capitalize">{shortDateLabel(nextShift.date)}</p>
              <p className="text-sm mt-1 opacity-90">
                {daysUntilLabel(diffDays(today, nextShift.date))}
                {nextDay?.tags
                  .filter((t) => TAG_LABEL[t] && t !== 'sabado_comun')
                  .map((t) => ` · ${TAG_EMOJI[t] ?? ''} ${TAG_LABEL[t]}`)
                  .join('')}
              </p>
            </>
          ) : (
            <p className="text-xl font-semibold mt-1">No tenés guardias publicadas por delante 🎉</p>
          )}
          <div className="flex gap-6 mt-5 text-sm flex-wrap">
            {[today, addDaysISO(today, 1)].map((d, i) => (
              <div key={d}>
                <p className="opacity-75">{i === 0 ? 'Hoy de guardia' : 'Mañana'}</p>
                <p className="font-medium">
                  {valid.filter((s) => s.date === d).map((s) => byId.get(s.actualResidentId)?.shortName).join(' + ') || '—'}
                </p>
              </div>
            ))}
            <div>
              <p className="opacity-75">Tus guardias este mes</p>
              <p className="font-medium">
                {thisMonth.length}
                {monthGaps.length > 0 && <span className="opacity-75"> · separadas {monthGaps.join(', ')} días</span>}
              </p>
            </div>
          </div>
        </section>

        <Card title="🎂 Próximos cumpleaños" className="order-last lg:order-none">
          {birthdays.length === 0 ? (
            <Empty>Cargá los cumpleaños en Admin → Residentes.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {birthdays.map((b) => (
                <li key={b.resident.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Dot color={color(b.resident.id)} />
                    {b.resident.name}
                  </span>
                  <span className="text-text-dim">
                    {Number(b.date.slice(8))}/{Number(b.date.slice(5, 7))} · {daysUntilLabel(b.daysUntil)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-text-dim mt-3">Nadie hace guardia el día de su cumple ni el anterior.</p>
        </Card>
      </div>

      <PushCard residentId={me.id} inicio />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="🗺️ Tu carril"
          action={
            <Link to="/camada?tab=carriles" className="text-xs text-accent underline">
              Toda la camada
            </Link>
          }
          className="lg:col-span-2"
        >
          <MyRotationStrip rotation={rotations.find((r) => r.id === me.id)} months={rotationMonths(rotations)} />
        </Card>
        <Card
          title="📆 Próximos eventos"
          action={
            <Link to="/camada?tab=eventos" className="text-xs text-accent underline">
              Ver todos
            </Link>
          }
        >
          {upcomingEvents.length === 0 ? (
            <Empty>Nada agendado.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcomingEvents.map(({ date, event }) => (
                <li key={`${event.id}${date}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    {eventEmoji(event)} {event.title}
                  </span>
                  <span className="text-text-dim whitespace-nowrap capitalize">
                    {shortDateLabel(date)} · {daysUntilLabel(diffDays(today, date))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Próximos 7 días">
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {week.map((d) => {
            const list = valid.filter((s) => s.date === d);
            const day = dayById.get(d);
            return (
              <div key={d} className={clsx('rounded-xl p-2 flex flex-col items-center gap-1', d === today ? 'bg-accent-soft' : 'bg-surface-2')}>
                <span className="text-[11px] text-text-dim capitalize">{shortDateLabel(d).split(' ')[0]}</span>
                <span className="text-sm font-semibold">
                  {Number(d.slice(8))}
                  {day?.tags.map((t) => TAG_EMOJI[t]).filter(Boolean).join('')}
                </span>
                <div className="flex flex-col gap-0.5 items-center">
                  {list.length === 0 && <span className="text-[10px] text-text-dim">—</span>}
                  {list.map((s) => (
                    <ResidentChip key={s.id} size="xs" name={byId.get(s.actualResidentId)?.shortName ?? '?'} color={color(s.actualResidentId)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Tu reparto vs. el grupo"
          subtitle="Acumulado. La línea va del que menos al que más tiene; la marca gris es el promedio y el punto sos vos."
          action={
            <Link to="/metricas" className="text-xs text-accent underline">
              Ver todo
            </Link>
          }
          className="lg:col-span-2"
        >
          <ul className="flex flex-col gap-3">
            {SNAPSHOT.map((m) => {
              const values = active.map((r) => Number(counters[r.id]?.[m.key] ?? 0));
              const value = Number(counters[me.id]?.[m.key] ?? 0);
              const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
              const delta = value - mean;
              const favorable = m.benefit ? delta >= 0 : delta <= 0;
              const flat = Math.abs(delta) < 0.5;
              return (
                <li key={m.key} className="grid grid-cols-[1fr_auto] sm:grid-cols-[11rem_1fr_7.5rem] items-center gap-x-3 gap-y-1">
                  <div>
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-[11px] text-text-dim">{m.hint}</p>
                  </div>
                  <div className="order-3 sm:order-none col-span-2 sm:col-span-1">
                    <RangeBar min={Math.min(...values)} max={Math.max(...values)} mean={mean} value={value} color={color(me.id)} />
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-semibold tabular-nums">{value}</span>{' '}
                    {flat ? (
                      <Badge>en el promedio</Badge>
                    ) : (
                      <Badge tone={favorable ? 'good' : 'warning'}>
                        {delta > 0 ? '+' : ''}
                        {delta.toFixed(1)}
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-text-dim mt-3">
            Verde = te tocó igual o mejor que el promedio · ámbar = te tocó más carga (o menos beneficio) que el
            promedio. El generador usa esto para compensar los meses siguientes.
          </p>
        </Card>

        <Card title="Tus guardias del mes" action={<Link to="/calendario" className="text-xs text-accent underline">Calendario</Link>}>
          {thisMonth.length === 0 ? (
            <Empty>No tenés guardias este mes.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {thisMonth.map((s) => {
                const day = dayById.get(s.date);
                return (
                  <li key={s.id} className={clsx('flex items-center justify-between text-sm', s.date < today && 'text-text-dim')}>
                    <span className="capitalize">{shortDateLabel(s.date)}</span>
                    <span className="flex gap-1 items-center">
                      {day?.tags.map((t) => TAG_EMOJI[t]).filter(Boolean).join('')}
                      {s.date < today && (done.has(s.id) ? <Badge tone="good">✓</Badge> : <Badge tone="warning">feedback</Badge>)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="✅ Tareas de la camada" action={<Link to="/camada" className="text-xs text-accent underline">Ver todas</Link>}>
          {openTasks.length === 0 ? (
            <Empty>No hay tareas pendientes.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {openTasks.map((t) => (
                <li key={t.id} className="text-sm flex items-start justify-between gap-2">
                  <span>
                    {t.assigneeIds.includes(me.id) && <span title="Te toca">👉 </span>}
                    {t.title}
                  </span>
                  {t.dueDate && <span className="text-xs text-text-dim whitespace-nowrap">{shortDateLabel(t.dueDate)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="🔗 Links fijados" action={<Link to="/camada?tab=links" className="text-xs text-accent underline">Todos los links</Link>}>
          {pinned.length === 0 ? (
            <Empty>Fijá links importantes desde Camada → Links.</Empty>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pinned.map((l) => (
                <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className="text-sm px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-accent-soft hover:text-accent transition-colors">
                  {l.title} ↗
                </a>
              ))}
            </div>
          )}
        </Card>

        <Card title="📣 Movimiento del grupo">
          <ul className="flex flex-col gap-2 text-sm">
            {pendingRequests.map((r) => (
              <li key={r.id}>
                <Link to="/pedidos" className="hover:underline">
                  <span className="font-medium">{requesterName(r, byId)}</span>{' '}
                  <span className="text-text-dim">pidió {r.dates.slice(0, 2).map(shortDateLabel).join(', ')}{r.dates.length > 2 ? '…' : ''}</span>
                </Link>
              </li>
            ))}
            {recentRaffles.map((r) => (
              <li key={r.id}>
                <Link to="/sorteos" className="hover:underline">
                  🎲 {r.title}:{' '}
                  <span className="text-text-dim">
                    {r.status === 'sorteado' ? `ganó ${winners(r).map((id) => byId.get(id)?.shortName).join(', ')}` : 'pendiente'}
                  </span>
                </Link>
              </li>
            ))}
            {pendingRequests.length === 0 && recentRaffles.length === 0 && <Empty>Nada nuevo por ahora.</Empty>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

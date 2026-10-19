import { useMemo, useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { useAllShifts, useCalendarData, useResidents, useResidentsById, useTrades } from '../hooks/data';
import { effectiveMonthConfig, monthKey, shortDateLabel, todayISO } from '../lib/dates';
import { offerDeadline, offerOpen } from '../lib/offers';
import { acceptTrade, answerTrade, proposeTrade, tradeConflict, tradeStillValid } from '../lib/trades';
import type { Trade } from '../types';
import { Card, Empty, btnPrimary, btnSecondary, inputCls } from './ui';

const dm = (iso: string) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;

/** Intercambio directo: "te doy mi guardia del 5 por tu guardia del 12". */
export default function TradesPanel() {
  const { resident: me } = useAuthContext();
  const { residents } = useResidents();
  const byId = useResidentsById(residents);
  const { shifts } = useAllShifts();
  const { monthConfigs } = useCalendarData();
  const trades = useTrades();
  const today = todayISO();
  const [mineId, setMineId] = useState('');
  const [theirsId, setTheirsId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = useMemo(() => shifts.filter((s) => s.status !== 'cancelada'), [shifts]);
  const shiftById = useMemo(() => new Map(valid.map((s) => [s.id, s])), [valid]);
  if (!me) return null;

  const name = (id: string) => byId.get(id)?.shortName ?? '?';
  const minGap = (date: string) => effectiveMonthConfig(monthKey(date), monthConfigs).rules.minGapHard;
  const shiftsOf = (id: string) => valid.filter((s) => s.actualResidentId === id);
  const tradeable = (id: string) => shiftsOf(id).filter((s) => s.date > today && offerOpen(s.date, today));
  const mine = tradeable(me.id);
  const others = valid
    .filter((s) => s.actualResidentId !== me.id && s.date > today && offerOpen(s.date, today) && byId.get(s.actualResidentId)?.active)
    .sort((a, b) => a.date.localeCompare(b.date));

  const incoming = trades.filter((t) => t.status === 'propuesto' && t.toResidentId === me.id);
  const outgoing = trades.filter((t) => t.status === 'propuesto' && t.fromResidentId === me.id);
  const recent = trades.filter((t) => t.status === 'aceptado').slice(0, 5);

  // Si yo me quedo con la guardia de `t.fromDate` y entrego `t.toShiftId`.
  const myProblem = (t: Trade) => tradeConflict(me, t.fromDate, t.toShiftId, shiftsOf(me.id), minGap(t.fromDate));

  const chosenMine = mine.find((s) => s.id === mineId);
  const chosenTheirs = others.find((s) => s.id === theirsId);
  const other = chosenTheirs ? byId.get(chosenTheirs.actualResidentId) : undefined;
  const formProblem =
    chosenMine && chosenTheirs && other
      ? (tradeConflict(me, chosenTheirs.date, chosenMine.id, shiftsOf(me.id), minGap(chosenTheirs.date)) ??
        tradeConflict(other, chosenMine.date, chosenTheirs.id, shiftsOf(other.id), minGap(chosenMine.date)))
      : null;
  const alreadyProposed =
    chosenMine && chosenTheirs && outgoing.some((t) => t.fromShiftId === chosenMine.id && t.toShiftId === chosenTheirs.id);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(`No se pudo: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function accept(t: Trade) {
    if (
      !confirm(
        `¿Aceptás el intercambio con ${name(t.fromResidentId)}?\n\nVos hacés la del ${shortDateLabel(t.fromDate)} y ${name(t.fromResidentId)} hace tu ${shortDateLabel(t.toDate)}. Sin deuda. Acordate de actualizarlo en HIBA 2.`,
      )
    )
      return;
    run(() => acceptTrade(t, me!, name));
  }

  return (
    <Card
      title="🔁 Intercambios"
      subtitle="Te doy mi guardia y me quedo con la tuya: si la otra acepta, las dos guardias se intercambian solas y no queda deuda. Se puede hasta el día 20 del mes anterior a cada guardia."
    >
      <div className="flex flex-col gap-4">
        {incoming.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Te proponen</p>
            {incoming.map((t) => {
              const ok = tradeStillValid(t, shiftById, today);
              const problem = ok ? myProblem(t) : null;
              return (
                <div key={t.id} className="rounded-xl border border-accent/40 bg-accent-soft p-3 flex flex-col gap-2">
                  <p className="text-sm">
                    <b>{name(t.fromResidentId)}</b> te da su guardia del <b className="capitalize">{shortDateLabel(t.fromDate)}</b> y se queda
                    con tu <b className="capitalize">{shortDateLabel(t.toDate)}</b>.
                  </p>
                  {t.note && <p className="text-sm text-text-dim [overflow-wrap:anywhere]">“{t.note}”</p>}
                  {!ok && <p className="text-xs text-warn">Ya no se puede: cambió alguna de las dos guardias o pasó el plazo.</p>}
                  {problem && <p className="text-xs text-warn">{problem}</p>}
                  <div className="flex gap-2 flex-wrap">
                    {ok && (
                      <button onClick={() => accept(t)} disabled={busy || !!problem} className={btnPrimary}>
                        👍 Acepto
                      </button>
                    )}
                    <button onClick={() => run(() => answerTrade(t, 'rechazado', name))} disabled={busy} className={btnSecondary}>
                      {ok ? 'No, gracias' : 'Descartar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {outgoing.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Tus propuestas (esperando respuesta)</p>
            {outgoing.map((t) => (
              <p key={t.id} className="text-sm flex items-center justify-between gap-2 flex-wrap">
                <span>
                  A <b>{name(t.toResidentId)}</b>: tu <span className="capitalize">{shortDateLabel(t.fromDate)}</span> por su{' '}
                  <span className="capitalize">{shortDateLabel(t.toDate)}</span>
                  {!tradeStillValid(t, shiftById, today) && <span className="text-xs text-warn"> · ya no es válida</span>}
                </span>
                <button onClick={() => run(() => answerTrade(t, 'cancelado', name))} disabled={busy} className="text-xs text-text-dim underline">
                  retirar
                </button>
              </p>
            ))}
          </div>
        )}

        <div className="rounded-xl bg-surface-2 p-3 flex flex-col gap-2">
          <p className="text-sm font-medium">Proponer un intercambio</p>
          {mine.length === 0 ? (
            <p className="text-xs text-text-dim">No tenés guardias para intercambiar ahora (se pueden las del mes siguiente, hasta el 20).</p>
          ) : others.length === 0 ? (
            <p className="text-xs text-text-dim">No hay guardias de otras para intercambiar dentro del plazo.</p>
          ) : (
            <>
              <select value={mineId} onChange={(e) => setMineId(e.target.value)} className={inputCls}>
                <option value="">Doy mi guardia del…</option>
                {mine.map((s) => (
                  <option key={s.id} value={s.id}>
                    {shortDateLabel(s.date)} (hasta el {dm(offerDeadline(s.date))})
                  </option>
                ))}
              </select>
              <select value={theirsId} onChange={(e) => setTheirsId(e.target.value)} className={inputCls}>
                <option value="">…y me quedo con la de…</option>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {shortDateLabel(s.date)} · {name(s.actualResidentId)}
                  </option>
                ))}
              </select>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mensaje (opcional)" className={inputCls} />
              {formProblem && <p className="text-xs text-warn">{formProblem}</p>}
              {alreadyProposed && <p className="text-xs text-text-dim">Ya le propusiste ese intercambio.</p>}
              <button
                onClick={() =>
                  run(async () => {
                    if (!chosenMine || !chosenTheirs) return;
                    await proposeTrade(me, chosenMine, chosenTheirs, note, name);
                    setMineId('');
                    setTheirsId('');
                    setNote('');
                  })
                }
                disabled={busy || !chosenMine || !chosenTheirs || !!formProblem || !!alreadyProposed}
                className={btnSecondary + ' self-start'}
              >
                🔁 Proponer intercambio
              </button>
              <p className="text-xs text-text-dim">Le llega una notificación; si acepta, se intercambian solas.</p>
            </>
          )}
        </div>

        {incoming.length === 0 && outgoing.length === 0 && recent.length === 0 && <Empty>No hay intercambios todavía.</Empty>}
        {recent.length > 0 && (
          <div>
            <p className="text-xs text-text-dim mb-1">Últimos intercambios</p>
            <ul className="text-sm flex flex-col gap-1">
              {recent.map((t) => (
                <li key={t.id}>
                  {name(t.fromResidentId)} ({dm(t.fromDate)}) ⇄ {name(t.toResidentId)} ({dm(t.toDate)})
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Card>
  );
}

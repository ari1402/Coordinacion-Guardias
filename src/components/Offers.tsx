import { useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { useAllShifts, useCalendarData, useOffers, useResidents, useResidentsById } from '../hooks/data';
import { effectiveMonthConfig, monthKey, shortDateLabel, todayISO } from '../lib/dates';
import { cancelOffer, cannotTake, createOffer, offerDeadline, offerOpen, takeOffer } from '../lib/offers';
import type { GuardiaOffer } from '../types';
import Badge from './Badge';
import { Card, Empty, btnPrimary, btnSecondary, inputCls } from './ui';

const dm = (iso: string) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;

/** "Ofrezco mi guardia": ofrecer, tomar y retirar guardias (hasta el 20 del mes anterior). */
export default function OffersPanel() {
  const { resident: me, isAdmin } = useAuthContext();
  const { residents } = useResidents();
  const byId = useResidentsById(residents);
  const { shifts } = useAllShifts();
  const { monthConfigs } = useCalendarData();
  const offers = useOffers();
  const today = todayISO();
  const [shiftId, setShiftId] = useState('');
  const [note, setNote] = useState('');
  const [debt, setDebt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;

  const name = (id: string) => byId.get(id)?.shortName ?? '?';
  const open = offers.filter((o) => o.status === 'abierta' && offerOpen(o.date, today));
  const offeredIds = new Set(open.map((o) => o.shiftId));
  const mine = shifts.filter((s) => s.actualResidentId === me.id && s.status !== 'cancelada');
  const offerable = mine.filter((s) => s.date > today && offerOpen(s.date, today) && !offeredIds.has(s.id));
  const recent = offers
    .filter((o) => o.status === 'tomada')
    .sort((a, b) => (b.takenAt ?? '').localeCompare(a.takenAt ?? ''))
    .slice(0, 5);

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

  function take(o: GuardiaOffer) {
    if (!confirm(`¿Tomás la guardia del ${shortDateLabel(o.date)} de ${name(o.fromResidentId)}?\n\nQueda como cambio confirmado${o.generatesDebt ? ' (con deuda: se la devolvés más adelante)' : ''}. Acordate de actualizarlo en HIBA 2.`))
      return;
    run(() => takeOffer(o, me!, name));
  }

  return (
    <Card
      title="🤝 Guardias ofrecidas"
      subtitle="Ofrecé una guardia que querés ceder y otra la toma con un toque: queda registrado como cambio. Se puede hasta el día 20 del mes anterior a la guardia (después hay que tenerlas cargadas en HIBA 2)."
    >
      <div className="flex flex-col gap-4">
        {open.length === 0 ? (
          <Empty>No hay guardias ofrecidas ahora.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((o) => {
              const reason = cannotTake(
                o,
                me,
                mine,
                effectiveMonthConfig(monthKey(o.date), monthConfigs).rules.minGapHard,
              );
              const own = o.fromResidentId === me.id;
              return (
                <li key={o.id} className="rounded-xl border border-border p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm">
                      <b className="capitalize">{shortDateLabel(o.date)}</b> · la ofrece <b>{name(o.fromResidentId)}</b>
                      {o.generatesDebt ? <Badge>con devolución</Badge> : <Badge tone="good">sin devolución</Badge>}
                    </p>
                    {o.note && <p className="text-sm text-text-dim mt-0.5">“{o.note}”</p>}
                    <p className="text-xs text-text-dim mt-0.5">Se puede tomar hasta el {dm(offerDeadline(o.date))}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!own &&
                      (reason ? (
                        <span className="text-xs text-text-dim">{reason}</span>
                      ) : (
                        <button onClick={() => take(o)} disabled={busy} className={btnPrimary}>
                          La tomo
                        </button>
                      ))}
                    {(own || isAdmin) && (
                      <button onClick={() => run(() => cancelOffer(o, me.id))} disabled={busy} className="text-xs text-text-dim underline">
                        retirar
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="rounded-xl bg-surface-2 p-3 flex flex-col gap-2">
          <p className="text-sm font-medium">Ofrecer una guardia mía</p>
          {offerable.length === 0 ? (
            <p className="text-xs text-text-dim">
              No tenés guardias para ofrecer ahora (se pueden ofrecer las del mes siguiente, hasta el 20).
            </p>
          ) : (
            <>
              <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className={inputCls}>
                <option value="">Elegí la guardia…</option>
                {offerable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {shortDateLabel(s.date)} (hasta el {dm(offerDeadline(s.date))})
                  </option>
                ))}
              </select>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo o aclaración (opcional)" className={inputCls} />
              <label className="flex items-center gap-2 text-sm text-text-dim">
                <input type="checkbox" checked={debt} onChange={(e) => setDebt(e.target.checked)} />
                Quiero que me la devuelvan (queda como deuda)
              </label>
              <button
                onClick={() =>
                  run(async () => {
                    const s = offerable.find((x) => x.id === shiftId);
                    if (!s) return;
                    await createOffer(s, me, note, debt);
                    setShiftId('');
                    setNote('');
                  })
                }
                disabled={busy || !shiftId}
                className={btnSecondary + ' self-start'}
              >
                🤝 Ofrecer
              </button>
              <p className="text-xs text-text-dim">Le avisa a todas con una notificación.</p>
            </>
          )}
        </div>

        {recent.length > 0 && (
          <div>
            <p className="text-xs text-text-dim mb-1">Últimas tomadas</p>
            <ul className="text-sm flex flex-col gap-1">
              {recent.map((o) => (
                <li key={o.id}>
                  <span className="capitalize">{shortDateLabel(o.date)}</span>: {name(o.fromResidentId)} → <b>{name(o.takenBy ?? '')}</b>
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

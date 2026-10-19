import { useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { useAllShifts, useCalendarData, useOffers, useResidents, useResidentsById, useTrades } from '../hooks/data';
import { effectiveMonthConfig, monthKey, shortDateLabel, todayISO } from '../lib/dates';
import { cancelOffer, cannotTake, createOffer, offerDeadline, offerOpen, takeOffer } from '../lib/offers';
import { proposeTrade, tradeConflict } from '../lib/trades';
import type { GuardiaOffer, OfferKind, Resident, Shift } from '../types';
import Badge from './Badge';
import { Card, Empty, btnPrimary, btnSecondary, inputCls } from './ui';

const dm = (iso: string) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;

/**
 * "Ofrezco mi guardia" y "Busco cambio": publicar una guardia propia para que
 * otra la tome, o para que te propongan una de las suyas a cambio (hasta el 20
 * del mes anterior).
 */
export default function OffersPanel() {
  const { resident: me, isAdmin } = useAuthContext();
  const { residents } = useResidents();
  const byId = useResidentsById(residents);
  const { shifts } = useAllShifts();
  const { monthConfigs } = useCalendarData();
  const offers = useOffers();
  const trades = useTrades();
  const today = todayISO();
  const [shiftId, setShiftId] = useState('');
  const [kind, setKind] = useState<OfferKind>('ofrezco');
  const [note, setNote] = useState('');
  const [debt, setDebt] = useState(true);
  const [proposeFor, setProposeFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;

  const name = (id: string) => byId.get(id)?.shortName ?? '?';
  const minGap = (date: string) => effectiveMonthConfig(monthKey(date), monthConfigs).rules.minGapHard;
  const open = offers.filter((o) => o.status === 'abierta' && offerOpen(o.date, today));
  const offeredIds = new Set(open.map((o) => o.shiftId));
  const valid = shifts.filter((s) => s.status !== 'cancelada');
  const shiftsOf = (id: string) => valid.filter((s) => s.actualResidentId === id);
  const mine = shiftsOf(me.id);
  const offerable = mine.filter((s) => s.date > today && offerOpen(s.date, today) && !offeredIds.has(s.id));
  const recent = offers
    .filter((o) => o.status === 'tomada' || o.status === 'resuelta')
    .sort((a, b) => (b.takenAt ?? b.resolvedAt ?? '').localeCompare(a.takenAt ?? a.resolvedAt ?? ''))
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
      title="🤝 Guardias ofrecidas y búsquedas de cambio"
      subtitle="Ofrecé una guardia para que otra la tome, o buscá cambio para que te propongan una de las suyas a cambio. Se puede hasta el día 20 del mes anterior a la guardia (después hay que tenerlas cargadas en HIBA 2)."
    >
      <div className="flex flex-col gap-4">
        {open.length === 0 ? (
          <Empty>No hay guardias ofrecidas ni búsquedas de cambio ahora.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((o) => {
              const busco = o.kind === 'busco';
              const reason = cannotTake(o, me, mine, minGap(o.date));
              const own = o.fromResidentId === me.id;
              const proposals = trades.filter((t) => t.offerId === o.id && t.status === 'propuesto');
              const myProposal = proposals.find((t) => t.fromResidentId === me.id);
              return (
                <li key={o.id} className="rounded-xl border border-border p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm">
                        <b className="capitalize">{shortDateLabel(o.date)}</b> ·{' '}
                        {busco ? (
                          <>
                            <b>{name(o.fromResidentId)}</b> busca cambio <Badge tone="info">🔄 busca cambio</Badge>
                          </>
                        ) : (
                          <>
                            la ofrece <b>{name(o.fromResidentId)}</b>
                            {o.generatesDebt ? <Badge>con devolución</Badge> : <Badge tone="good">sin devolución</Badge>}
                          </>
                        )}
                      </p>
                      {o.note && <p className="text-sm text-text-dim mt-0.5 [overflow-wrap:anywhere]">“{o.note}”</p>}
                      <p className="text-xs text-text-dim mt-0.5">
                        Hasta el {dm(offerDeadline(o.date))}
                        {busco && proposals.length > 0 && ` · ${proposals.length} propuesta${proposals.length === 1 ? '' : 's'} de intercambio`}
                        {busco && own && proposals.length > 0 && ' (respondelas en Intercambios, más abajo)'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {!own && busco && !myProposal && (
                        <button onClick={() => setProposeFor(proposeFor === o.id ? null : o.id)} disabled={busy} className={btnPrimary}>
                          🔁 Te doy una mía
                        </button>
                      )}
                      {!own && myProposal && <span className="text-xs text-text-dim">Ya le propusiste tu {shortDateLabel(myProposal.fromDate)}</span>}
                      {!own &&
                        (reason ? (
                          <span className="text-xs text-text-dim">{busco ? `Sin cambio no: ${reason.toLowerCase()}` : reason}</span>
                        ) : (
                          <button onClick={() => take(o)} disabled={busy} className={busco ? btnSecondary : btnPrimary}>
                            {busco ? 'La tomo sin cambio' : 'La tomo'}
                          </button>
                        ))}
                      {(own || isAdmin) && (
                        <button onClick={() => run(() => cancelOffer(o, me.id))} disabled={busy} className="text-xs text-text-dim underline">
                          retirar
                        </button>
                      )}
                    </div>
                  </div>
                  {proposeFor === o.id && (
                    <ProposeForOffer
                      offer={o}
                      me={me}
                      owner={byId.get(o.fromResidentId)}
                      mine={mine}
                      ownerShifts={shiftsOf(o.fromResidentId)}
                      minGap={minGap}
                      today={today}
                      busy={busy}
                      onPropose={(s, n) =>
                        run(async () => {
                          await proposeTrade(me, s, valid.find((x) => x.id === o.shiftId)!, n, name, o.id);
                          setProposeFor(null);
                        })
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="rounded-xl bg-surface-2 p-3 flex flex-col gap-2">
          <p className="text-sm font-medium">Publicar una guardia mía</p>
          {offerable.length === 0 ? (
            <p className="text-xs text-text-dim">
              No tenés guardias para publicar ahora (se pueden las del mes siguiente, hasta el 20).
            </p>
          ) : (
            <>
              <div className="flex gap-2 flex-wrap">
                {(
                  [
                    ['ofrezco', '🤝 La ofrezco', 'que alguien la tome'],
                    ['busco', '🔄 Busco cambio', 'que me propongan otra a cambio'],
                  ] as const
                ).map(([k, label, hint]) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`rounded-lg border px-3 py-1.5 text-sm text-left ${kind === k ? 'border-accent bg-accent-soft' : 'border-border'}`}
                  >
                    <b>{label}</b> <span className="text-xs text-text-dim">({hint})</span>
                  </button>
                ))}
              </div>
              <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className={inputCls}>
                <option value="">Elegí la guardia…</option>
                {offerable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {shortDateLabel(s.date)} (hasta el {dm(offerDeadline(s.date))})
                  </option>
                ))}
              </select>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={kind === 'busco' ? '¿Qué días te sirven a cambio? (opcional)' : 'Motivo o aclaración (opcional)'}
                className={inputCls}
              />
              <label className="flex items-center gap-2 text-sm text-text-dim">
                <input type="checkbox" checked={debt} onChange={(e) => setDebt(e.target.checked)} />
                {kind === 'busco' ? 'Si alguien la toma sin cambio, que me la devuelva (deuda)' : 'Quiero que me la devuelvan (queda como deuda)'}
              </label>
              <button
                onClick={() =>
                  run(async () => {
                    const s = offerable.find((x) => x.id === shiftId);
                    if (!s) return;
                    await createOffer(s, me, note, debt, kind);
                    setShiftId('');
                    setNote('');
                  })
                }
                disabled={busy || !shiftId}
                className={btnSecondary + ' self-start'}
              >
                {kind === 'busco' ? '🔄 Buscar cambio' : '🤝 Ofrecer'}
              </button>
              <p className="text-xs text-text-dim">Le avisa a todas con una notificación.</p>
            </>
          )}
        </div>

        {recent.length > 0 && (
          <div>
            <p className="text-xs text-text-dim mb-1">Últimas resueltas</p>
            <ul className="text-sm flex flex-col gap-1">
              {recent.map((o) => (
                <li key={o.id}>
                  <span className="capitalize">{shortDateLabel(o.date)}</span>:{' '}
                  {o.status === 'resuelta' ? (
                    <>
                      {name(o.fromResidentId)} la cambió por intercambio 🔁
                    </>
                  ) : (
                    <>
                      {name(o.fromResidentId)} → <b>{name(o.takenBy ?? '')}</b>
                    </>
                  )}
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

/** Elegir una guardia propia para ofrecerla a cambio de la que busca cambio. */
function ProposeForOffer({
  offer,
  me,
  owner,
  mine,
  ownerShifts,
  minGap,
  today,
  busy,
  onPropose,
}: {
  offer: GuardiaOffer;
  me: Resident;
  owner?: Resident;
  mine: Shift[];
  ownerShifts: Shift[];
  minGap: (date: string) => number;
  today: string;
  busy: boolean;
  onPropose: (mine: Shift, note: string) => void;
}) {
  const [pick, setPick] = useState('');
  const [note, setNote] = useState('');
  const candidates = mine.filter((s) => s.date > today && offerOpen(s.date, today) && s.date !== offer.date);
  const chosen = candidates.find((s) => s.id === pick);
  const problem =
    chosen &&
    (tradeConflict(me, offer.date, chosen.id, mine, minGap(offer.date)) ??
      (owner ? tradeConflict(owner, chosen.date, offer.shiftId, ownerShifts, minGap(chosen.date)) : null));
  if (candidates.length === 0) return <p className="text-xs text-text-dim">No tenés guardias para ofrecer a cambio (del mes siguiente, hasta el 20).</p>;
  return (
    <div className="rounded-lg bg-surface-2 p-2.5 flex flex-col gap-2">
      <select value={pick} onChange={(e) => setPick(e.target.value)} className={inputCls}>
        <option value="">¿Cuál de tus guardias le das a cambio?</option>
        {candidates.map((s) => (
          <option key={s.id} value={s.id}>
            {shortDateLabel(s.date)}
          </option>
        ))}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mensaje (opcional)" className={inputCls} />
      {problem && <p className="text-xs text-warn">{problem}</p>}
      <button onClick={() => chosen && onPropose(chosen, note)} disabled={busy || !chosen || !!problem} className={btnPrimary + ' self-start'}>
        Proponer intercambio
      </button>
      <p className="text-xs text-text-dim">Le llega un aviso; si acepta, las dos guardias se intercambian solas (sin deuda).</p>
    </div>
  );
}

import {
  addDoc,
  collection,
  doc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../firebase';
import { useAllShifts, useResidents, useResidentsById, useSwaps } from '../hooks/data';
import { isoWeekday, shortDateLabel } from '../lib/dates';
import { logActivity } from '../lib/activity';
import Badge from '../components/Badge';
import OffersPanel from '../components/Offers';
import { PageHeader } from '../components/ui';

function pesoDia(weekday: number): { label: string; tone: 'good' | 'neutral' | 'warning' } {
  if (weekday === 3) return { label: 'Buena (jueves)', tone: 'good' };
  if (weekday === 4 || weekday === 5 || weekday === 6) return { label: 'Pesada (vie/sáb/dom)', tone: 'warning' };
  return { label: 'Normal', tone: 'neutral' };
}

export default function Cambios() {
  const { resident, isAdmin } = useAuthContext();
  const { shifts } = useAllShifts();
  const { residents } = useResidents();
  const residentsById = useResidentsById(residents);
  const { swaps, loading } = useSwaps();

  const [shiftId, setShiftId] = useState('');
  const [toResidentId, setToResidentId] = useState('');
  const [reason, setReason] = useState('');
  const [generatesDebt, setGeneratesDebt] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Cada una registra cambios de sus propias guardias (las admins, de cualquiera).
  const shiftOptions = useMemo(
    () =>
      shifts
        .filter((s) => isAdmin || s.actualResidentId === resident?.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [shifts, isAdmin, resident],
  );
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const shift = shiftById.get(shiftId);
    if (!shift || !toResidentId || !resident) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'swaps'), {
        date: shift.date,
        fromResidentId: shift.actualResidentId,
        toResidentId,
        reason: reason.trim() || null,
        status: 'solicitado',
        generatesDebt,
        debtSettled: false,
        createdBy: resident.id,
        createdAt: new Date().toISOString(),
        shiftId,
      });
      await logActivity({
        entity: 'cambio',
        summary: `Registró un cambio: guardia del ${shortDateLabel(shift.date)} de ${residentsById.get(shift.actualResidentId)?.shortName} → ${residentsById.get(toResidentId)?.shortName}`,
        changes: [generatesDebt ? 'Genera deuda' : 'Sin deuda', ...(reason.trim() ? [`Motivo: ${reason.trim()}`] : [])],
      });
      setShiftId('');
      setToResidentId('');
      setReason('');
    } finally {
      setSubmitting(false);
    }
  }

  const swapText = (swapId: string) => {
    const s = swaps.find((x) => x.id === swapId);
    if (!s) return '';
    return `guardia del ${shortDateLabel(s.date)}: ${residentsById.get(s.fromResidentId)?.shortName} → ${residentsById.get(s.toResidentId)?.shortName}`;
  };

  async function confirmSwap(swapId: string, targetShiftId: string, newResidentId: string) {
    const batch = writeBatch(db);
    batch.update(doc(db, 'swaps', swapId), { status: 'confirmado' });
    batch.update(doc(db, 'shifts', targetShiftId), {
      actualResidentId: newResidentId,
      swapId,
      updatedAt: new Date().toISOString(),
    });
    logActivity({ entity: 'cambio', summary: `Confirmó el cambio (${swapText(swapId)})` }, batch);
    await batch.commit();
  }

  async function rejectSwap(swapId: string) {
    await updateDoc(doc(db, 'swaps', swapId), { status: 'rechazado' });
    await logActivity({ entity: 'cambio', summary: `Rechazó el cambio (${swapText(swapId)})` });
  }

  async function settleDebt(swapId: string) {
    await updateDoc(doc(db, 'swaps', swapId), { debtSettled: true });
    await logActivity({ entity: 'cambio', summary: `Marcó saldada la deuda (${swapText(swapId)})` });
  }

  const pendingDebts = swaps.filter((s) => s.generatesDebt && !s.debtSettled && s.status === 'confirmado');

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Cambios de guardia"
        subtitle="Registrá un intercambio. Si no hay contraprestación inmediata, queda como deuda pendiente. Las métricas cuentan a quien realmente hizo la guardia."
      />

      <OffersPanel />

      {resident && (
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
          <h2 className="text-sm font-medium">Nuevo cambio</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              required
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="">Guardia a ceder…</option>
              {shiftOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.date} — actualmente {residentsById.get(s.actualResidentId)?.shortName}
                </option>
              ))}
            </select>
            <select
              value={toResidentId}
              onChange={(e) => setToResidentId(e.target.value)}
              required
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="">La va a hacer…</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (opcional)"
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-text-dim">
            <input type="checkbox" checked={generatesDebt} onChange={(e) => setGeneratesDebt(e.target.checked)} />
            No hay contraprestación inmediata (genera deuda)
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="self-start rounded-lg bg-accent text-accent-contrast px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Registrar cambio'}
          </button>
        </form>
      )}

      {pendingDebts.length > 0 && (
        <div className="bg-warn-soft border border-warn/30 rounded-xl p-4">
          <h2 className="text-sm font-medium text-warn mb-2">Deudas pendientes</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {pendingDebts.map((s) => {
              const from = residentsById.get(s.fromResidentId);
              const to = residentsById.get(s.toResidentId);
              return (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span>
                    {from?.shortName} le debe una guardia a {to?.shortName} ({s.date})
                  </span>
                  {(isAdmin || resident?.id === s.fromResidentId || resident?.id === s.toResidentId) && (
                    <button onClick={() => settleDebt(s.id)} className="text-xs underline text-text-dim">
                      Marcar saldada
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {loading && <p className="text-text-dim text-sm">Cargando…</p>}

      <ul className="flex flex-col gap-2">
        {swaps.map((s) => {
          const from = residentsById.get(s.fromResidentId);
          const to = residentsById.get(s.toResidentId);
          const weekday = isoWeekday(s.date);
          const peso = pesoDia(weekday);
          return (
            <li key={s.id} className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{s.date}</span>
                <span className="text-sm text-text-dim">
                  {from?.shortName} → {to?.shortName}
                </span>
                <Badge tone={peso.tone}>{peso.label}</Badge>
                <Badge tone={s.status === 'confirmado' ? 'good' : s.status === 'rechazado' ? 'critical' : 'warning'}>
                  {s.status}
                </Badge>
                {s.generatesDebt && <Badge tone="neutral">{s.debtSettled ? 'deuda saldada' : 'genera deuda'}</Badge>}
              </div>
              {s.status === 'solicitado' && (isAdmin || resident?.id === s.toResidentId) && (
                <div className="flex gap-2">
                  <button
                    onClick={() => confirmSwap(s.id, s.shiftId, s.toResidentId)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-ok-soft text-ok font-medium"
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => rejectSwap(s.id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-danger-soft text-danger font-medium"
                  >
                    Rechazar
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {!loading && swaps.length === 0 && <p className="text-text-dim text-sm">Todavía no hay cambios registrados.</p>}
      </ul>
    </div>
  );
}

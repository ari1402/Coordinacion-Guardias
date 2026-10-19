import { doc, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../firebase';
import { useAllShifts, useHibaAcks, useHibaRequests, useResidents } from '../hooks/data';
import { logActivity } from '../lib/activity';
import { monthKey, monthLabel, shiftMonthKey, shortDateLabel, todayISO } from '../lib/dates';
import type { HibaAck, HibaRequest, Resident, Shift } from '../types';
import Badge from './Badge';
import { Card, btnPrimary, inputCls } from './ui';

const mineIn = (shifts: Shift[], month: string, residentId: string) =>
  shifts
    .filter((s) => s.date.startsWith(month) && s.actualResidentId === residentId && s.status !== 'cancelada')
    .sort((a, b) => a.date.localeCompare(b.date));

/** Meses en los que las admins pidieron cargar en HIBA 2 y `residentId` todavía no confirmó. */
export function pendingHiba(requests: HibaRequest[], acks: HibaAck[], shifts: Shift[], residentId: string): string[] {
  const current = monthKey(todayISO());
  return requests
    .map((r) => r.id)
    .filter((m) => m >= current && !acks.some((a) => a.id === `${m}_${residentId}`) && mineIn(shifts, m, residentId).length > 0)
    .sort();
}

/** Inicio: "Cargá tus guardias de noviembre en HIBA 2" → "Ya las pedí". */
export function HibaCard({ month, me, shifts }: { month: string; me: Resident; shifts: Shift[] }) {
  const [busy, setBusy] = useState(false);
  const mine = mineIn(shifts, month, me.id);

  async function done() {
    setBusy(true);
    try {
      const id = `${month}_${me.id}`;
      const ack: HibaAck = { id, month, residentId: me.id, at: new Date().toISOString() };
      await setDoc(doc(db, 'hibaAcks', id), ack);
      await logActivity({ entity: 'conformidad', summary: `Confirmó que pidió sus guardias de ${monthLabel(month)} en HIBA 2` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={`📋 Pedí tus guardias de ${monthLabel(month)} en HIBA 2`} subtitle="Cuando las tengas pedidas, marcalo acá." className="border-accent/40">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {mine.map((s) => (
          <span key={s.id} className="text-sm px-2.5 py-1 rounded-lg bg-surface-2 capitalize">
            {shortDateLabel(s.date)}
          </span>
        ))}
      </div>
      <button onClick={done} disabled={busy} className={btnPrimary}>
        ✅ Ya las pedí
      </button>
    </Card>
  );
}

/** Admin → Conformidad: pedir la carga en HIBA 2 y ver quién ya confirmó. */
export function HibaAdmin() {
  const { resident: me } = useAuthContext();
  const { residents } = useResidents();
  const { shifts } = useAllShifts();
  const requests = useHibaRequests();
  const acks = useHibaAcks();
  const current = monthKey(todayISO());
  const months = [...new Set(shifts.map((s) => s.date.slice(0, 7)))].filter((m) => m >= current).sort();
  const next = shiftMonthKey(current, 1);
  const [month, setMonth] = useState(months.includes(next) ? next : (months[0] ?? next));
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const request = requests.find((r) => r.id === month);
  const withShifts = residents.filter((r) => r.active && mineIn(shifts, month, r.id).length > 0);
  const ackOf = (id: string) => acks.find((a) => a.id === `${month}_${id}`);
  const missing = withShifts.filter((r) => !ackOf(r.id));

  async function ask() {
    const again = !!request;
    if (!confirm(again ? `¿Volver a avisarles a las ${missing.length} que todavía no confirmaron?` : `¿Pedir que carguen las guardias de ${monthLabel(month)} en HIBA 2? Les llega un push y les aparece en el Inicio.`))
      return;
    setBusy(true);
    try {
      const r: HibaRequest = { id: month, requestedAt: new Date().toISOString(), requestedBy: me!.id, notified: false };
      await setDoc(doc(db, 'hibaRequests', month), r);
      await logActivity({
        entity: 'conformidad',
        summary: again ? `Volvió a avisar que carguen las guardias de ${monthLabel(month)} en HIBA 2` : `Pidió que carguen las guardias de ${monthLabel(month)} en HIBA 2`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="📋 Carga en HIBA 2"
      subtitle="Cuando haya que cargar las guardias de un mes, tocá el botón: les llega un push a quienes tienen guardias ese mes y en el Inicio les aparece para marcar “Ya las pedí”."
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap items-center">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls + ' w-auto'}>
            {(months.length ? months : [next]).map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button onClick={ask} disabled={busy || withShifts.length === 0 || (!!request && missing.length === 0)} className={btnPrimary}>
            {request ? `📣 Volver a avisar a las que faltan (${missing.length})` : '📣 Pedir que las carguen'}
          </button>
        </div>
        {withShifts.length === 0 ? (
          <p className="text-sm text-text-dim">Todavía no hay guardias cargadas en {monthLabel(month)}.</p>
        ) : (
          <>
            {request && (
              <p className="text-xs text-text-dim">
                Último aviso: {new Date(request.requestedAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                {request.notified ? '' : ' (el push sale en los próximos minutos)'}
              </p>
            )}
            <ul className="grid gap-2 sm:grid-cols-2">
              {withShifts.map((r) => {
                const ack = ackOf(r.id);
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm rounded-xl bg-surface-2 px-3 py-2">
                    <span className="font-medium">{r.shortName}</span>
                    {ack ? (
                      <Badge tone="good">✅ ya las pidió · {new Date(ack.at).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })}</Badge>
                    ) : (
                      <Badge tone={request ? 'warning' : 'neutral'}>{request ? 'pendiente' : 'sin pedir todavía'}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

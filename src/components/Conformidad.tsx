import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { logActivity } from '../lib/activity';
import { monthKey, monthLabel, shortDateLabel, todayISO } from '../lib/dates';
import type { MonthAck, Publication, Resident, Shift } from '../types';
import { Card, btnPrimary, btnSecondary, inputCls } from './ui';

export const HIBA_REMINDER = 'Acordate de pedir tus guardias en HIBA 2.';

/** Meses publicados en los que `residentId` todavía tiene que confirmar sus guardias. */
export function pendingAcks(publications: Publication[], acks: MonthAck[], residentId: string): Publication[] {
  const current = monthKey(todayISO());
  return publications
    .filter((p) => p.id >= current && p.pending?.[residentId])
    .filter((p) => {
      const ack = acks.find((a) => a.id === `${p.id}_${residentId}`);
      return !ack || ack.at < p.pending[residentId];
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** "¿Estás OK con tus guardias de noviembre?" Si dice que no, se avisa a las admins. */
export function MonthAckCard({ publication, me, shifts }: { publication: Publication; me: Resident; shifts: Shift[] }) {
  const month = publication.id;
  const mine = shifts.filter((s) => s.date.startsWith(month) && s.actualResidentId === me.id && s.status !== 'cancelada');
  const [mode, setMode] = useState<'ask' | 'no'>('ask');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  async function answer(ok: boolean) {
    if (!ok && !comment.trim()) return;
    setBusy(true);
    try {
      const id = `${month}_${me.id}`;
      const ack: MonthAck = {
        id,
        month,
        residentId: me.id,
        ok,
        at: new Date().toISOString(),
        notified: false,
        ...(ok ? {} : { comment: comment.trim() }),
      };
      await setDoc(doc(db, 'acks', id), ack);
      await logActivity({
        entity: 'conformidad',
        summary: ok ? `Confirmó que está OK con sus guardias de ${monthLabel(month)}` : `Pidió una corrección en sus guardias de ${monthLabel(month)}`,
        changes: ok ? [] : [comment.trim()],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={`📅 Se publicaron tus guardias de ${monthLabel(month)}`}
      subtitle={HIBA_REMINDER}
      className="border-accent/40"
    >
      <div className="flex flex-wrap gap-1.5 mb-3">
        {mine.length === 0 ? (
          <span className="text-sm text-text-dim">No tenés guardias asignadas ese mes.</span>
        ) : (
          mine.map((s) => (
            <span key={s.id} className="text-sm px-2.5 py-1 rounded-lg bg-surface-2 capitalize">
              {shortDateLabel(s.date)}
            </span>
          ))
        )}
      </div>
      {mode === 'ask' ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium mr-1">¿Estás OK con las que te tocaron?</span>
          <button onClick={() => answer(true)} disabled={busy} className={btnPrimary}>
            👍 Sí, todo OK
          </button>
          <button onClick={() => setMode('no')} disabled={busy} className={btnSecondary}>
            👎 No, necesito un cambio
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            autoFocus
            placeholder="¿Qué necesitás cambiar? (p. ej. el 14 tengo un casamiento, me sirve el 21)"
            className={inputCls}
          />
          <div className="flex gap-2">
            <button onClick={() => answer(false)} disabled={busy || !comment.trim()} className={btnPrimary}>
              Avisar a Bea y Ana
            </button>
            <button onClick={() => setMode('ask')} className={btnSecondary}>
              Volver
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Para admins: quienes dijeron que no están OK y todavía no se resolvió. */
export function AckAlerts({ acks, byId, meId }: { acks: MonthAck[]; byId: Map<string, Resident>; meId: string }) {
  const open = acks.filter((a) => !a.ok && !a.resolvedAt).sort((a, b) => b.at.localeCompare(a.at));
  if (open.length === 0) return null;
  async function resolve(a: MonthAck) {
    await updateDoc(doc(db, 'acks', a.id), { resolvedAt: new Date().toISOString(), resolvedBy: meId });
    await logActivity({
      entity: 'conformidad',
      summary: `Marcó resuelto el pedido de corrección de ${byId.get(a.residentId)?.shortName} (${monthLabel(a.month)})`,
    });
  }
  return (
    <Card title="⚠️ Pedidos de corrección de guardias" subtitle="Dijeron que no están OK con lo que les tocó." className="border-warn/50">
      <ul className="flex flex-col gap-3">
        {open.map((a) => (
          <li key={a.id} className="text-sm flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p>
                <b>{byId.get(a.residentId)?.name}</b> <span className="text-text-dim">· {monthLabel(a.month)}</span>
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">“{a.comment}”</p>
            </div>
            <div className="flex gap-3 items-center">
              <Link to={`/admin/generador?mes=${a.month}`} className="text-xs text-accent underline">
                Abrir generador
              </Link>
              <button onClick={() => resolve(a)} className="text-xs text-text-dim underline">
                Marcar resuelto
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

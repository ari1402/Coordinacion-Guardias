import { collection, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Resident, Shift, Trade } from '../types';
import { logActivity } from './activity';
import { isBirthdayBlocked } from './birthdays';
import { diffDays, shortDateLabel, todayISO } from './dates';
import { offerOpen } from './offers';

/**
 * Por qué `who` no puede quedarse con la guardia del `date` si a cambio entrega
 * la `giving` (o null si puede): cumpleaños o guardias demasiado pegadas.
 */
export function tradeConflict(
  who: Resident,
  date: string,
  giving: string,
  theirShifts: Shift[],
  minGapHard: number,
): string | null {
  if (isBirthdayBlocked(date, who)) return `${who.shortName}: es su cumple o la víspera`;
  const close = theirShifts.find(
    (s) => s.id !== giving && s.status !== 'cancelada' && Math.abs(diffDays(s.date, date)) <= minGapHard,
  );
  if (!close) return null;
  return close.date === date
    ? `${who.shortName} ya tiene guardia ese día`
    : `A ${who.shortName} le queda pegada a su guardia del ${shortDateLabel(close.date)}`;
}

/** ¿El intercambio sigue en pie? (las dos guardias en manos de cada una y dentro del plazo). */
export function tradeStillValid(t: Trade, shiftById: Map<string, Shift>, today = todayISO()): boolean {
  return (
    shiftById.get(t.fromShiftId)?.actualResidentId === t.fromResidentId &&
    shiftById.get(t.toShiftId)?.actualResidentId === t.toResidentId &&
    offerOpen(t.fromDate, today) &&
    offerOpen(t.toDate, today)
  );
}

export async function proposeTrade(
  me: Resident,
  mine: Shift,
  theirs: Shift,
  note: string,
  nameOf: (id: string) => string,
  offerId?: string,
) {
  const ref = doc(collection(db, 'trades'));
  const trade: Trade = {
    id: ref.id,
    fromResidentId: me.id,
    fromShiftId: mine.id,
    fromDate: mine.date,
    toResidentId: theirs.actualResidentId,
    toShiftId: theirs.id,
    toDate: theirs.date,
    ...(note.trim() ? { note: note.trim() } : {}),
    ...(offerId ? { offerId } : {}),
    status: 'propuesto',
    createdAt: new Date().toISOString(),
    notifiedNew: false,
    notifiedResolved: false,
  };
  await setDoc(ref, trade);
  await logActivity({
    entity: 'cambio',
    summary: `Le propuso un intercambio a ${nameOf(theirs.actualResidentId)}`,
    changes: [`Da su guardia del ${shortDateLabel(mine.date)} por la del ${shortDateLabel(theirs.date)}`],
  });
}

/** Aceptar: las dos guardias cambian de dueña a la vez (dos cambios confirmados, sin deuda). */
export async function acceptTrade(t: Trade, me: Resident, nameOf: (id: string) => string) {
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(doc(db, 'trades', t.id), { status: 'aceptado', respondedAt: now });
  const legs = [
    { shiftId: t.fromShiftId, date: t.fromDate, from: t.fromResidentId, to: t.toResidentId },
    { shiftId: t.toShiftId, date: t.toDate, from: t.toResidentId, to: t.fromResidentId },
  ];
  for (const leg of legs) {
    const swapRef = doc(collection(db, 'swaps'));
    batch.set(swapRef, {
      shiftId: leg.shiftId,
      date: leg.date,
      fromResidentId: leg.from,
      toResidentId: leg.to,
      reason: 'Intercambio',
      status: 'confirmado',
      generatesDebt: false,
      debtSettled: false,
      tradeId: t.id,
      createdBy: me.id,
      createdAt: now,
    });
    batch.update(doc(db, 'shifts', leg.shiftId), { actualResidentId: leg.to, swapId: swapRef.id, updatedAt: now });
  }
  if (t.offerId) batch.update(doc(db, 'offers', t.offerId), { status: 'resuelta', resolvedAt: now, tradeId: t.id });
  logActivity(
    {
      entity: 'cambio',
      summary: `Aceptó el intercambio con ${nameOf(t.fromResidentId)}`,
      changes: [
        `${nameOf(t.fromResidentId)} → ${shortDateLabel(t.toDate)}`,
        `${nameOf(t.toResidentId)} → ${shortDateLabel(t.fromDate)}`,
      ],
    },
    batch,
  );
  await batch.commit();
}

export async function answerTrade(t: Trade, status: 'rechazado' | 'cancelado', nameOf: (id: string) => string) {
  await updateDoc(doc(db, 'trades', t.id), { status, respondedAt: new Date().toISOString() });
  await logActivity({
    entity: 'cambio',
    summary:
      status === 'rechazado'
        ? `No aceptó el intercambio que le propuso ${nameOf(t.fromResidentId)}`
        : `Retiró la propuesta de intercambio a ${nameOf(t.toResidentId)}`,
  });
}

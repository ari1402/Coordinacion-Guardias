import { collection, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { GuardiaOffer, Resident, Shift } from '../types';
import { logActivity } from './activity';
import { diffDays, shortDateLabel, shiftMonthKey, todayISO } from './dates';
import { isBirthdayBlocked } from './birthdays';

/** Último día para ofrecer/tomar una guardia: el 20 del mes anterior (después van a HIBA 2). */
export function offerDeadline(date: string): string {
  return `${shiftMonthKey(date.slice(0, 7), -1)}-20`;
}

export function offerOpen(date: string, today = todayISO()): boolean {
  return today <= offerDeadline(date);
}

export async function createOffer(shift: Shift, me: Resident, note: string, generatesDebt: boolean) {
  const ref = doc(collection(db, 'offers'));
  const offer: Omit<GuardiaOffer, 'id'> & { id: string } = {
    id: ref.id,
    shiftId: shift.id,
    date: shift.date,
    fromResidentId: me.id,
    ...(note.trim() ? { note: note.trim() } : {}),
    generatesDebt,
    status: 'abierta',
    createdAt: new Date().toISOString(),
    notifiedOpen: false,
    notifiedTaken: false,
  };
  await setDoc(ref, offer);
  await logActivity({ entity: 'cambio', summary: `Ofreció su guardia del ${shortDateLabel(shift.date)}`, changes: note.trim() ? [note.trim()] : [] });
}

/** Tomar una guardia ofrecida: queda como cambio confirmado y la guardia pasa a quien la toma. */
export async function takeOffer(offer: GuardiaOffer, me: Resident, nameOf: (id: string) => string) {
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  const swapRef = doc(collection(db, 'swaps'));
  batch.set(swapRef, {
    shiftId: offer.shiftId,
    date: offer.date,
    fromResidentId: offer.fromResidentId,
    toResidentId: me.id,
    reason: offer.note ? `Guardia ofrecida: ${offer.note}` : 'Guardia ofrecida',
    status: 'confirmado',
    generatesDebt: offer.generatesDebt,
    debtSettled: false,
    offerId: offer.id,
    createdBy: me.id,
    createdAt: now,
  });
  batch.update(doc(db, 'shifts', offer.shiftId), { actualResidentId: me.id, swapId: swapRef.id, updatedAt: now });
  batch.update(doc(db, 'offers', offer.id), { status: 'tomada', takenBy: me.id, takenAt: now, swapId: swapRef.id });
  logActivity(
    {
      entity: 'cambio',
      summary: `Tomó la guardia del ${shortDateLabel(offer.date)} que ofrecía ${nameOf(offer.fromResidentId)}`,
      changes: [`${nameOf(offer.fromResidentId)} → ${me.shortName}`, offer.generatesDebt ? 'Genera deuda' : 'Sin deuda'],
    },
    batch,
  );
  await batch.commit();
}

export async function cancelOffer(offer: GuardiaOffer, userId: string) {
  await updateDoc(doc(db, 'offers', offer.id), { status: 'cancelada', cancelledAt: new Date().toISOString(), cancelledBy: userId });
  await logActivity({ entity: 'cambio', summary: `Retiró la oferta de la guardia del ${shortDateLabel(offer.date)}` });
}

/** Por qué alguien no puede tomar esa guardia (o null si puede). */
export function cannotTake(offer: GuardiaOffer, me: Resident, myShifts: Shift[], minGapHard: number): string | null {
  if (offer.fromResidentId === me.id) return 'Es tuya';
  if (isBirthdayBlocked(offer.date, me)) return 'Es tu cumple o la víspera';
  const close = myShifts.find((s) => s.status !== 'cancelada' && Math.abs(diffDays(s.date, offer.date)) <= minGapHard);
  if (close) {
    return close.date === offer.date
      ? 'Ya tenés guardia ese día'
      : `Te queda pegada a tu guardia del ${shortDateLabel(close.date)}`;
  }
  return null;
}


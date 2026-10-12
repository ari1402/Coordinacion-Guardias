import { arrayRemove, arrayUnion, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { ResolvedDay, Shift } from '../types';
import { logActivity } from './activity';
import { shortDateLabel } from './dates';

export const DEFAULT_DISABLED_NOTE = 'La toma un residente mayor';

/**
 * Deshabilita un lugar de R1 de un día (lo toma otra persona, p. ej. un
 * residente mayor). Si ya había una guardia publicada en ese lugar, se borra.
 * El lugar deja de existir para el generador y no cuenta como faltante.
 */
export async function disableSlot(day: ResolvedDay, slotIndex: number, note: string, shift?: Shift, nameOf?: (id: string) => string) {
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'calendarDays', day.date),
    { id: day.date, date: day.date, isHoliday: day.isHoliday, disabledSlots: arrayUnion(slotIndex), disabledNote: note },
    { merge: true },
  );
  if (shift) batch.delete(doc(db, 'shifts', shift.id));
  logActivity(
    {
      entity: 'guardias',
      summary: `Deshabilitó una guardia R1 del ${shortDateLabel(day.date)}`,
      changes: [note, ...(shift ? [`${nameOf?.(shift.actualResidentId) ?? shift.actualResidentId} → —`] : [])],
    },
    batch,
  );
  await batch.commit();
}

/** Vuelve a habilitar el lugar: queda libre para asignar a un R1. */
export async function enableSlot(day: ResolvedDay, slotIndex: number) {
  const remaining = (day.disabledSlots ?? []).filter((i) => i !== slotIndex);
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'calendarDays', day.date),
    { disabledSlots: arrayRemove(slotIndex), ...(remaining.length ? {} : { disabledNote: null }) },
    { merge: true },
  );
  logActivity({ entity: 'guardias', summary: `Volvió a habilitar una guardia R1 del ${shortDateLabel(day.date)}` }, batch);
  await batch.commit();
}

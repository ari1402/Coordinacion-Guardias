import { addDoc, collection, doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Raffle } from '../types';
import { logActivity } from './activity';
import { shortDateLabel } from './dates';
import { secureShuffle } from './random';

export async function createRaffle(data: Omit<Raffle, 'id' | 'status' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'raffles'), {
    ...stripUndefined(data),
    status: 'pendiente',
    createdAt: new Date().toISOString(),
  });
  await logActivity({
    entity: 'sorteo',
    summary: `Creó el sorteo "${data.title}"${data.linkedSlot ? ` (guardia del ${shortDateLabel(data.linkedSlot.date)})` : ''}`,
  });
  return ref.id;
}

/**
 * Sortea con aleatoriedad criptográfica y guarda el orden completo. Las rules
 * solo permiten pasar de 'pendiente' a 'sorteado' una vez, con un orden que
 * contenga a todos los participantes: no se puede volver a sortear.
 * Si el sorteo es de una guardia ya publicada, también la asigna.
 */
export async function drawRaffle(
  raffle: Raffle,
  userId: string,
  nameOf: (id: string) => string = (id) => id,
): Promise<string[]> {
  const order = secureShuffle(raffle.participantIds);
  const batch = writeBatch(db);
  batch.update(doc(db, 'raffles', raffle.id), {
    status: 'sorteado',
    order,
    drawnBy: userId,
    drawnAt: new Date().toISOString(),
  });
  if (raffle.linkedSlot) {
    const shiftId = `${raffle.linkedSlot.date}_${raffle.linkedSlot.slotIndex}`;
    const existing = await getDoc(doc(db, 'shifts', shiftId));
    if (existing.exists()) {
      batch.update(doc(db, 'shifts', shiftId), {
        assignedResidentId: order[0],
        actualResidentId: order[0],
        raffleId: raffle.id,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  logActivity(
    {
      entity: 'sorteo',
      summary: `Sorteó "${raffle.title}": ${order.slice(0, raffle.winnersCount).map(nameOf).join(', ')}`,
      changes: [`Orden completo: ${order.map(nameOf).join(' → ')}`],
    },
    batch,
  );
  await batch.commit();
  return order;
}

export function winners(raffle: Raffle): string[] {
  return raffle.order?.slice(0, raffle.winnersCount) ?? [];
}

/** Firestore no acepta campos undefined. */
export function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** Ignorar (o volver a tener en cuenta) un sorteo: no se borra, queda registrado. */
export async function setRaffleIgnored(raffle: Raffle, ignored: boolean, userId: string) {
  await updateDoc(doc(db, 'raffles', raffle.id), {
    ignored,
    ignoredBy: userId,
    ignoredAt: new Date().toISOString(),
  });
  await logActivity({
    entity: 'sorteo',
    summary: ignored ? `Ignoró el sorteo "${raffle.title}"` : `Volvió a tener en cuenta el sorteo "${raffle.title}"`,
  });
}

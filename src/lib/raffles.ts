import { addDoc, collection, doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Raffle } from '../types';
import { secureShuffle } from './random';

export async function createRaffle(data: Omit<Raffle, 'id' | 'status' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'raffles'), {
    ...stripUndefined(data),
    status: 'pendiente',
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

/**
 * Sortea con aleatoriedad criptográfica y guarda el orden completo. Las rules
 * solo permiten pasar de 'pendiente' a 'sorteado' una vez, con un orden que
 * contenga a todos los participantes: no se puede volver a sortear.
 * Si el sorteo es de una guardia ya publicada, también la asigna.
 */
export async function drawRaffle(raffle: Raffle, userId: string): Promise<string[]> {
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

import { deleteDoc, doc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { DraftSlot, Raffle, Shift } from '../types';
import { logActivity } from './activity';
import { monthLabel, shortDateLabel, todayISO } from './dates';
import { slotKey } from './generator';
import { stripUndefined, winners } from './raffles';

type SlotRef = { date: string; slotIndex: number };

/** Adapta un borrador a los slots vigentes del mes (si cambió la cobertura, agrega/quita slots). */
export function mergeTemplate(template: SlotRef[], existing: DraftSlot[]): DraftSlot[] {
  const byKey = new Map(existing.map((s) => [slotKey(s.date, s.slotIndex), s]));
  return template.map((t) => byKey.get(slotKey(t.date, t.slotIndex)) ?? { ...t, residentId: null, locked: false });
}

export function draftFromShifts(template: SlotRef[], shifts: Shift[]): DraftSlot[] {
  const byKey = new Map(shifts.map((s) => [slotKey(s.date, s.slotIndex), s]));
  return template.map((t) => {
    const s = byKey.get(slotKey(t.date, t.slotIndex));
    return { ...t, residentId: s?.assignedResidentId ?? null, locked: false, ...(s?.raffleId ? { raffleId: s.raffleId } : {}) };
  });
}

/** Si un slot está en sorteo y ya se sorteó, el ganador queda fijo en el slot. */
export function applyRaffleWinners(draft: DraftSlot[], raffles: Raffle[]): DraftSlot[] {
  const byId = new Map(raffles.map((r) => [r.id, r]));
  return draft.map((s) => {
    if (!s.raffleId) return s;
    const r = byId.get(s.raffleId);
    if (r?.status === 'sorteado') return { ...s, residentId: winners(r)[0] ?? null, locked: true };
    return { ...s, residentId: null, locked: false };
  });
}

export async function saveDraft(month: string, slots: DraftSlot[], userId: string) {
  await setDoc(doc(db, 'scheduleDrafts', month), {
    id: month,
    slots: slots.map((s) => stripUndefined({ ...s, locked: !!s.locked })),
    updatedBy: userId,
    updatedAt: new Date().toISOString(),
  });
  await logActivity({ entity: 'guardias', summary: `Guardó un borrador de ${monthLabel(month)}` });
}

export async function deleteDraft(month: string) {
  await deleteDoc(doc(db, 'scheduleDrafts', month));
}

export interface PublishPlan {
  upserts: Shift[];
  deletes: string[];
  changed: number;
  /** "jue 5/11: Alba → Bravo" por cada guardia que cambia (para el historial). */
  changes: string[];
  /** Residentes a quienes les cambia alguna guardia (tienen que volver a confirmar). */
  affected: string[];
}

/**
 * Qué cambia al publicar. Si una guardia ya publicada sigue asignada a la
 * misma persona, se conserva tal cual (incluido un cambio posterior y el
 * dato de sueño); si cambia de persona, se reasigna completa.
 */
export function planPublish(
  month: string,
  draft: DraftSlot[],
  existing: Shift[],
  nameOf: (id: string) => string = (id) => id,
): PublishPlan {
  const now = new Date().toISOString();
  const today = todayISO();
  const existingByKey = new Map(existing.filter((s) => s.date.startsWith(month)).map((s) => [s.id, s]));
  const upserts: Shift[] = [];
  const keep = new Set<string>();
  const changes: string[] = [];
  const affected = new Set<string>();
  let changed = 0;
  const label = (date: string, slotIndex: number) => `${shortDateLabel(date)}${slotIndex ? ` (R1 #${slotIndex + 1})` : ''}`;

  for (const slot of draft) {
    if (!slot.residentId) continue;
    const id = slotKey(slot.date, slot.slotIndex);
    keep.add(id);
    const prev = existingByKey.get(id);
    if (prev && prev.assignedResidentId === slot.residentId) continue;
    changed++;
    affected.add(slot.residentId);
    if (prev) affected.add(prev.assignedResidentId);
    changes.push(`${label(slot.date, slot.slotIndex)}: ${prev ? nameOf(prev.assignedResidentId) : '—'} → ${nameOf(slot.residentId)}`);
    upserts.push(
      stripUndefined({
        id,
        date: slot.date,
        slotIndex: slot.slotIndex,
        assignedResidentId: slot.residentId,
        actualResidentId: slot.residentId,
        status: slot.date < today ? 'realizada' : 'programada',
        raffleId: slot.raffleId,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      }) as Shift,
    );
  }
  const deletes = [...existingByKey.keys()].filter((id) => !keep.has(id));
  for (const id of deletes) {
    const s = existingByKey.get(id)!;
    affected.add(s.assignedResidentId);
    changes.push(`${label(s.date, s.slotIndex)}: ${nameOf(s.assignedResidentId)} → —`);
  }
  return { upserts, deletes, changed: changed + deletes.length, changes, affected: [...affected] };
}

/**
 * Publica y registra la publicación: a quienes les cambió algo se les pide
 * que confirmen sus guardias, y el script de notificaciones les avisa por push.
 */
export async function publish(plan: PublishPlan, month: string, userId: string) {
  const batch = writeBatch(db);
  for (const s of plan.upserts) batch.set(doc(db, 'shifts', s.id), s);
  for (const id of plan.deletes) batch.delete(doc(db, 'shifts', id));
  if (plan.affected.length) {
    const now = new Date().toISOString();
    batch.set(
      doc(db, 'publications', month),
      {
        id: month,
        publishedAt: now,
        publishedBy: userId,
        lastAffected: plan.affected,
        notified: false,
        pending: Object.fromEntries(plan.affected.map((id) => [id, now])),
      },
      { merge: true },
    );
  }
  logActivity({ entity: 'guardias', summary: `Publicó ${monthLabel(month)} (${plan.changed} cambio(s))`, changes: plan.changes }, batch);
  await batch.commit();
}

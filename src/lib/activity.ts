import { collection, doc, setDoc, type WriteBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type ActivityEntity =
  | 'guardias'
  | 'pedido'
  | 'cambio'
  | 'sorteo'
  | 'reglas'
  | 'calendario'
  | 'residente'
  | 'tarea'
  | 'nota'
  | 'link'
  | 'feedback'
  | 'carril'
  | 'evento'
  | 'conformidad';

export interface ActivityEntry {
  id: string;
  at: string;
  by: string;
  entity: ActivityEntity;
  summary: string;
  /** Detalle legible de lo que cambió: "antes → después" por campo o por guardia. */
  changes?: string[];
}

/**
 * Registra una acción en el historial (solo agregar: las rules no permiten
 * editar ni borrar entradas). Si se pasa un batch, queda en la misma
 * escritura que el cambio; si no, se escribe aparte y un error del log
 * nunca rompe la acción del usuario.
 */
export function logActivity(
  entry: { entity: ActivityEntity; summary: string; changes?: string[] },
  batch?: WriteBatch,
): Promise<void> {
  const by = auth.currentUser?.uid;
  if (!by) return Promise.resolve();
  const ref = doc(collection(db, 'activity'));
  const data = {
    id: ref.id,
    at: new Date().toISOString(),
    by,
    entity: entry.entity,
    summary: entry.summary,
    ...(entry.changes?.length ? { changes: entry.changes.slice(0, 80) } : {}),
  };
  if (batch) {
    batch.set(ref, data);
    return Promise.resolve();
  }
  return setDoc(ref, data).catch((e) => console.warn('No se pudo registrar en el historial', e));
}

/** "campo: antes → después" para los campos que cambiaron. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>,
): string[] {
  const show = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : String(v));
  return Object.keys(labels)
    .filter((k) => show(before[k]) !== show(after[k]))
    .map((k) => `${labels[k]}: ${show(before[k])} → ${show(after[k])}`);
}

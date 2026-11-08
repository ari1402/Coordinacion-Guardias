import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../firebase';
import { shortDateLabel } from '../lib/dates';
import { parseWrittenRules, type WrittenRule } from '../lib/writtenRules';
import type { DraftSlot, Resident, ResolvedDay } from '../types';
import { Card, inputCls } from './ui';

/** Fechas en las que lo que está en el editor no cumple la regla. */
function unmet(rule: WrittenRule, draft: DraftSlot[]): string[] {
  const on = (date: string) => draft.filter((s) => s.date === date && s.residentId).map((s) => s.residentId!);
  return rule.dates.filter((d) => {
    const who = on(d);
    if (rule.kind === 'fijar') return rule.residentIds.some((id) => !who.includes(id));
    if (rule.kind === 'bloquear') return rule.residentIds.some((id) => who.includes(id));
    return who.some((id) => !rule.residentIds.includes(id));
  });
}

/**
 * Reglas escritas del mes que lee el generador (una por línea). Las ven y
 * editan las dos admins. Se guardan solas y abajo se ve cómo se entendió cada
 * línea y si lo que está en el editor la cumple.
 */
export default function WrittenRulesCard({
  monthKey,
  stored,
  legacy,
  userId,
  residents,
  days,
  draft,
  hasDraft,
}: {
  monthKey: string;
  stored: string;
  /** Las primeras se guardaron con id = mes: al guardar se pasan a mes_uid. */
  legacy: boolean;
  userId: string;
  residents: Resident[];
  days: ResolvedDay[];
  draft: DraftSlot[];
  hasDraft: boolean;
}) {
  const [text, setText] = useState(stored);
  const [status, setStatus] = useState<string | null>(null);
  const editing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editing.current) setText(stored);
  }, [stored]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const parsed = useMemo(() => parseWrittenRules(text, monthKey, residents, days), [text, monthKey, residents, days]);

  async function save(value: string) {
    if (timer.current) clearTimeout(timer.current);
    if (value.trim() === stored.trim() && !legacy) {
      editing.current = false;
      return;
    }
    setStatus('Guardando…');
    try {
      const id = `${monthKey}_${userId}`;
      if (value.trim()) {
        await setDoc(doc(db, 'genRules', id), { id, month: monthKey, text: value.trim(), updatedBy: userId, updatedAt: new Date().toISOString() });
      } else {
        await deleteDoc(doc(db, 'genRules', id));
      }
      if (legacy) await deleteDoc(doc(db, 'genRules', monthKey));
      setStatus('Guardado ✓ — ya lo toma el generador');
      setTimeout(() => setStatus(null), 2500);
    } catch (e) {
      setStatus(`No se pudo guardar: ${(e as Error).message}`);
    } finally {
      editing.current = false;
    }
  }

  return (
    <Card
      title="✍️ Mis reglas escritas"
      subtitle="Una por línea. El generador las cumple sí o sí cuando generás vos. Solo las ves vos."
    >
      <textarea
        value={text}
        onChange={(e) => {
          editing.current = true;
          setText(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          const value = e.target.value;
          timer.current = setTimeout(() => save(value), 1200);
        }}
        onBlur={() => save(text)}
        rows={4}
        className={`${inputCls} w-full`}
        placeholder={'Pérez jueves 3\nGómez no del 20 al 27\nRuiz no jueves\nsolo Díaz y Sosa el 25'}
      />
      <p className="text-xs text-ok min-h-[1rem] mt-1">{status}</p>

      {(parsed.rules.length > 0 || parsed.unknown.length > 0) && (
        <ul className="mt-1 flex flex-col gap-1.5 text-sm">
          {parsed.rules.map((r, i) => {
            const bad = hasDraft ? unmet(r, draft) : [];
            return (
              <li key={i} className="rounded-lg bg-surface-2 px-2.5 py-1.5 flex flex-col gap-0.5">
                <span>{r.summary}</span>
                {r.warnings.map((w) => (
                  <span key={w} className="text-xs text-warn">
                    ⚠️ {w}
                  </span>
                ))}
                {hasDraft &&
                  (bad.length ? (
                    <span className="text-xs text-danger">
                      ❌ En el editor no se cumple: {bad.map(shortDateLabel).join(', ')} (generá de nuevo o cambialo a mano)
                    </span>
                  ) : (
                    <span className="text-xs text-ok">✅ El editor la cumple</span>
                  ))}
              </li>
            );
          })}
          {parsed.unknown.map((u, i) => (
            <li key={`u${i}`} className="rounded-lg bg-warn-soft px-2.5 py-1.5 flex flex-col gap-0.5">
              <span>
                ❓ <i>{u.line}</i>
              </span>
              <span className="text-xs text-text-dim">No la entendí ({u.why}), así que no se aplica.</span>
            </li>
          ))}
        </ul>
      )}
      <details className="mt-2 text-xs text-text-dim">
        <summary className="cursor-pointer">Cómo escribirlas</summary>
        <ul className="list-disc pl-4 mt-1 flex flex-col gap-0.5">
          <li>
            <b>Que vaya sí o sí:</b> “Pérez jueves 3”, “Pérez 3 y 17”, “Pérez 3/12”
          </li>
          <li>
            <b>Que no esté:</b> “Pérez no 5”, “sin Pérez el 5”, “Pérez no jueves” (todos los jueves), “Gómez no del 20 al 27”, “Pérez no
            feriados”
          </li>
          <li>
            <b>Solo algunas:</b> “solo Díaz y Sosa el 25”
          </li>
          <li>Podés poner varias personas en una línea. Lo que no se entiende aparece con ❓ y no se aplica.</li>
        </ul>
      </details>
    </Card>
  );
}

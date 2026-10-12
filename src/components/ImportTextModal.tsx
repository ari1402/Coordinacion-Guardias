import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { monthLabel, shortDateLabel } from '../lib/dates';
import { parseScheduleText } from '../lib/importText';
import type { DraftSlot, Resident } from '../types';
import { Modal, btnPrimary, inputCls } from './ui';

const EXAMPLE = `1/11 Funes
2/11 Duarte
3/11 sin R1
Jueves 5: Espina
Sábado 7 - Alba
…`;

/**
 * Pegar (o subir un .txt) un cronograma armado afuera — por ejemplo en un
 * chat — y cargarlo en el editor del generador para revisarlo y publicarlo.
 */
export default function ImportTextModal({
  open,
  onClose,
  monthKey,
  residents,
  draft,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  monthKey: string;
  residents: Resident[];
  draft: DraftSlot[];
  onApply: (slots: DraftSlot[], warnings: string[]) => void;
}) {
  const [text, setText] = useState('');
  const [replaceAll, setReplaceAll] = useState(true);
  const byId = new Map(residents.map((r) => [r.id, r]));
  const lines = useMemo(() => parseScheduleText(text, monthKey, residents), [text, monthKey, residents]);
  const inMonth = lines.filter((l) => l.date?.startsWith(monthKey) && !l.error);
  const outside = lines.filter((l) => l.date && !l.date.startsWith(monthKey) && !l.error);
  const errors = lines.filter((l) => l.error);

  function apply() {
    const warnings: string[] = [];
    const byDate = new Map<string, string[]>();
    for (const l of inMonth) byDate.set(l.date!, [...(byDate.get(l.date!) ?? []), ...l.residentIds]);
    const slotsPerDate = new Map<string, number>();
    for (const s of draft) slotsPerDate.set(s.date, (slotsPerDate.get(s.date) ?? 0) + 1);
    for (const [date, ids] of byDate) {
      const n = slotsPerDate.get(date) ?? 0;
      if (ids.length > n) warnings.push(`${shortDateLabel(date)}: el texto trae ${ids.length} R1 pero el día tiene ${n} lugar(es) configurado(s). Ajustalo en Reglas del mes.`);
    }
    const next = draft.map((s) => {
      if (s.raffleId) return s;
      const ids = byDate.get(s.date);
      if (!ids) return replaceAll ? { ...s, residentId: null, locked: false } : s;
      const id = ids[s.slotIndex] ?? null;
      return { ...s, residentId: id, locked: !!id };
    });
    onApply(next, warnings);
    setText('');
    onClose();
  }

  async function loadFile(file: File) {
    setText(await file.text());
  }

  return (
    <Modal open={open} onClose={onClose} title={`📋 Importar ${monthLabel(monthKey)} desde texto`} wide>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-dim">
          Una guardia por línea: fecha + nombre(s). Sirven fechas como <code>1/11</code>, <code>2026-11-01</code>,{' '}
          <code>Sábado 7</code> o <code>7 de noviembre</code>, y nombres cortos, apellidos o apodos (Bea, Vale…).
          Para un día sin R1 escribí <code>sin R1</code>.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          placeholder={EXAMPLE}
          className={clsx(inputCls, 'font-mono text-xs resize-y')}
        />
        <div className="flex items-center gap-3 flex-wrap text-sm">
          <label className="text-text-dim">
            o subí un archivo:{' '}
            <input type="file" accept=".txt,.csv,text/plain" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} className="text-xs" />
          </label>
          <label className="flex items-center gap-2 text-text-dim">
            <input type="checkbox" checked={replaceAll} onChange={(e) => setReplaceAll(e.target.checked)} />
            Vaciar los días que no aparecen en el texto
          </label>
        </div>

        {lines.length > 0 && (
          <>
            <p className="text-sm">
              <span className="text-ok font-medium">{inMonth.length} línea(s) entendidas</span>
              {errors.length > 0 && <span className="text-danger"> · {errors.length} con problemas</span>}
              {outside.length > 0 && <span className="text-warn"> · {outside.length} de otro mes (se ignoran)</span>}
            </p>
            <div className="max-h-56 overflow-y-auto border border-border rounded-xl">
              <table className="w-full text-xs">
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.line} className={clsx('border-b border-border last:border-0', l.error && 'bg-danger-soft')}>
                      <td className="p-1.5 text-text-dim w-8">{l.line}</td>
                      <td className="p-1.5 font-mono truncate max-w-[12rem]">{l.raw}</td>
                      <td className="p-1.5 whitespace-nowrap">{l.date ? shortDateLabel(l.date) : ''}</td>
                      <td className="p-1.5">
                        {l.error ?? (l.empty ? 'sin R1' : l.residentIds.map((id) => byId.get(id)?.shortName).join(' + '))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <button onClick={apply} disabled={inMonth.length === 0} className={btnPrimary}>
          Cargar en el editor ({inMonth.length})
        </button>
        <p className="text-xs text-text-dim">
          Se carga como borrador: después revisás los problemas que marque el editor y tocás Publicar.
        </p>
      </div>
    </Modal>
  );
}


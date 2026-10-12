import clsx from 'clsx';
import { doc, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { db } from '../firebase';
import { logActivity } from '../lib/activity';
import { monthKey, monthLabel, monthsBetween, shiftMonthKey, todayISO } from '../lib/dates';
import { NO_SHIFT_ROTATIONS, ROTATION_CODES, rotationStyle } from '../lib/rotations';
import type { Resident, Rotation } from '../types';

const shortMonth = (key: string) => monthLabel(key).split(' ')[0].slice(0, 3);

/** Meses a mostrar: los que tienen algún carril cargado, o un año desde el mes actual. */
export function rotationMonths(rotations: Rotation[]): string[] {
  const keys = rotations.flatMap((r) => Object.keys(r.months)).sort();
  if (keys.length === 0) {
    const now = monthKey(todayISO());
    return monthsBetween(now, shiftMonthKey(now, 11));
  }
  return monthsBetween(keys[0], keys[keys.length - 1]);
}

function Chip({ code, current }: { code?: string; current?: boolean }) {
  return (
    <span
      className={clsx(
        'block rounded-md px-1 py-1 text-[11px] font-medium text-center whitespace-nowrap',
        current && 'ring-2 ring-offset-1 ring-accent ring-offset-surface',
      )}
      style={rotationStyle(code)}
    >
      {code ?? '—'}
    </span>
  );
}

/** Tu carril, mes a mes, con el actual resaltado. */
export function MyRotationStrip({ rotation, months }: { rotation?: Rotation; months: string[] }) {
  const now = monthKey(todayISO());
  if (!rotation) return <p className="text-sm text-text-dim">Todavía no hay carriles cargados.</p>;
  const current = rotation.months[now];
  const next = rotation.months[shiftMonthKey(now, 1)];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        Este mes: <b>{current ?? '—'}</b>
        {next && (
          <span className="text-text-dim">
            {' '}
            · {monthLabel(shiftMonthKey(now, 1)).split(' ')[0]}: <b className="text-text">{next}</b>
          </span>
        )}
        {current && NO_SHIFT_ROTATIONS.has(current) && <span className="text-text-dim"> · sin guardias 🏖️</span>}
      </p>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="grid gap-1 min-w-[640px]" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
          {months.map((m) => (
            <span key={m} className={clsx('text-[10px] text-center capitalize', m === now ? 'text-accent font-semibold' : 'text-text-dim')}>
              {shortMonth(m)}
            </span>
          ))}
          {months.map((m) => (
            <Chip key={m} code={rotation.months[m]} current={m === now} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Tabla de carriles de toda la camada. Las admins la editan tocando cada celda. */
export function RotationTable({
  residents,
  rotations,
  months,
  editable,
}: {
  residents: Resident[];
  rotations: Rotation[];
  months: string[];
  editable?: boolean;
}) {
  const now = monthKey(todayISO());
  const [extra, setExtra] = useState(0);
  const shown = [...months, ...Array.from({ length: extra }, (_, i) => shiftMonthKey(months[months.length - 1], i + 1))];
  const byId = new Map(rotations.map((r) => [r.id, r]));

  async function set(res: Resident, month: string, code: string) {
    const before = byId.get(res.id)?.months[month];
    const months = { ...(byId.get(res.id)?.months ?? {}) };
    if (code) months[month] = code;
    else delete months[month];
    await setDoc(doc(db, 'rotations', res.id), { id: res.id, months, updatedAt: new Date().toISOString() });
    await logActivity({
      entity: 'carril',
      summary: `Cambió el carril de ${res.shortName} en ${monthLabel(month)}`,
      changes: [`${before ?? '—'} → ${code || '—'}`],
    });
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="text-sm border-separate border-spacing-1 min-w-[720px] w-full">
        <thead>
          <tr>
            <th />
            {shown.map((m) => (
              <th key={m} className={clsx('text-[11px] font-medium capitalize', m === now ? 'text-accent' : 'text-text-dim')}>
                {shortMonth(m)} {m.slice(2, 4)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {residents.map((res) => (
            <tr key={res.id}>
              <td className="pr-2 whitespace-nowrap font-medium">{res.shortName}</td>
              {shown.map((m) => {
                const code = byId.get(res.id)?.months[m];
                return (
                  <td key={m}>
                    {editable ? (
                      <select
                        value={code ?? ''}
                        onChange={(e) => set(res, m, e.target.value)}
                        className="w-full rounded-md px-1 py-1 text-[11px] font-medium text-center appearance-none cursor-pointer"
                        style={rotationStyle(code)}
                        aria-label={`Carril de ${res.shortName} en ${monthLabel(m)}`}
                      >
                        <option value="">—</option>
                        {ROTATION_CODES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Chip code={code} current={m === now} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {editable && (
        <button onClick={() => setExtra((n) => n + 1)} className="text-xs text-text-dim underline mt-2">
          + agregar un mes
        </button>
      )}
    </div>
  );
}

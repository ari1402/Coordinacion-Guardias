import clsx from 'clsx';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import Badge from '../components/Badge';
import RequestTypeBadge from '../components/RequestTypeBadge';
import { Card, Dot, Modal, MonthNav, PageHeader, ResidentChip, btnSecondary } from '../components/ui';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../firebase';
import { useAllShifts, useCalendarData, useRaffles, useRequests, useResidents, useResidentsById } from '../hooks/data';
import { useColors } from '../hooks/useColors';
import { useMonth } from '../hooks/useMonth';
import { isBirthday } from '../lib/birthdays';
import { effectiveMonthConfig, resolveMonth, shortDateLabel, todayISO } from '../lib/dates';
import { logActivity } from '../lib/activity';
import { downloadFile, shiftsToIcs } from '../lib/ics';
import { LEGEND, TAG_EMOJI, TAG_LABEL, dayBgClass } from '../lib/labels';
import type { GuardiaRequest, Resident, ResolvedDay, Shift, ShiftStatus } from '../types';
import { WEEKDAY_SHORT, requestIntent, requestShiftDates } from '../types';

export default function Calendario() {
  const { resident: me, isAdmin } = useAuthContext();
  const { monthKey, next, prev } = useMonth();
  const { storedDays, monthConfigs, loading: lc } = useCalendarData();
  const { shifts, loading: ls } = useAllShifts();
  const { residents } = useResidents();
  const { requests } = useRequests();
  const { raffles } = useRaffles();
  const byId = useResidentsById(residents);
  const color = useColors(residents);
  const [selected, setSelected] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);

  const days = useMemo(() => resolveMonth(monthKey, storedDays, monthConfigs), [monthKey, storedDays, monthConfigs]);
  const cfg = useMemo(() => effectiveMonthConfig(monthKey, monthConfigs), [monthKey, monthConfigs]);
  const today = todayISO();
  const shiftsByDate = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts) if (s.date.startsWith(monthKey)) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    for (const list of m.values()) list.sort((a, b) => a.slotIndex - b.slotIndex);
    return m;
  }, [shifts, monthKey]);
  const pendingRaffleDates = useMemo(
    () => new Set(raffles.filter((r) => r.status === 'pendiente' && r.linkedSlot).map((r) => r.linkedSlot!.date)),
    [raffles],
  );
  const myMonthShifts = shifts.filter((s) => s.actualResidentId === me?.id && s.date.startsWith(monthKey));
  const selectedDay = selected ? days.find((d) => d.date === selected) : undefined;

  return (
    <div>
      <PageHeader
        title="Calendario"
        subtitle={`${myMonthShifts.length} guardia(s) tuya(s) este mes`}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-text-dim">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              Resaltar las mías
            </label>
            <button
              className={btnSecondary}
              onClick={() =>
                downloadFile(
                  'mis-guardias.ics',
                  shiftsToIcs(
                    shifts.filter((s) => s.actualResidentId === me?.id && s.status !== 'cancelada'),
                    'Guardia',
                  ),
                  'text/calendar',
                )
              }
              title="Descarga tus guardias para importarlas en Google Calendar / Apple / Outlook"
            >
              📅 Exportar mis guardias
            </button>
            <MonthNav monthKey={monthKey} prev={prev} next={next} />
          </>
        }
      />

      {cfg.notes && (
        <Card title="📌 Reglas y acuerdos del mes" className="mb-4">
          <p className="text-sm whitespace-pre-wrap">{cfg.notes}</p>
        </Card>
      )}

      {lc || ls ? (
        <p className="text-sm text-text-dim">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="text-center text-xs text-text-dim font-medium py-1">
                {WEEKDAY_SHORT[i as 0]}
              </div>
            ))}
            {Array.from({ length: days[0]?.weekday ?? 0 }, (_, i) => (
              <div key={`e${i}`} />
            ))}
            {days.map((day) => {
              const list = shiftsByDate.get(day.date) ?? [];
              const bdays = residents.filter((r) => isBirthday(day.date, r));
              const mine = list.some((s) => s.actualResidentId === me?.id);
              const missing = day.requiredR1 - list.length;
              return (
                <button
                  key={day.id}
                  onClick={() => setSelected(day.date)}
                  className={clsx(
                    'border rounded-xl p-1 sm:p-1.5 text-left flex flex-col gap-1 min-h-[64px] sm:min-h-[84px] transition-all hover:ring-2 hover:ring-accent/60',
                    dayBgClass(day),
                    day.date === today ? 'border-accent ring-2 ring-accent' : 'border-border',
                    onlyMine && !mine && 'opacity-40',
                  )}
                >
                  <span className="flex items-center justify-between text-xs">
                    <span className={clsx('font-semibold', day.date === today && 'text-accent')}>
                      {Number(day.date.slice(8))}
                    </span>
                    <span>{day.tags.map((t) => TAG_EMOJI[t]).filter(Boolean).join('')}</span>
                  </span>
                  <span className="flex flex-wrap gap-0.5">
                    {list.map((s) => (
                      <ResidentChip
                        key={s.id}
                        size="xs"
                        name={byId.get(s.actualResidentId)?.shortName ?? '?'}
                        color={color(s.actualResidentId)}
                      />
                    ))}
                    {pendingRaffleDates.has(day.date) && <span className="text-[10px]">🎲</span>}
                    {missing > 0 && list.length > 0 && <span className="text-[10px] text-danger">+{missing}</span>}
                  </span>
                  {bdays.length > 0 && <span className="text-[10px] truncate">🎂 {bdays.map((b) => b.shortName).join(', ')}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3 text-xs text-text-dim">
            {LEGEND.map((l) => (
              <span key={l.label} className={clsx(l.cls, 'px-2 py-1 rounded-md border border-border')}>
                {l.label}
              </span>
            ))}
            <span className="px-2 py-1">🎂 cumpleaños · 🎲 sorteo pendiente</span>
          </div>
        </>
      )}

      {selectedDay && (
        <DayModal
          day={selectedDay}
          shifts={shiftsByDate.get(selectedDay.date) ?? []}
          onClose={() => setSelected(null)}
          isAdmin={isAdmin}
          residents={residents}
          byId={byId}
          color={color}
          requests={requests.filter((r) => requestShiftDates(r).includes(selectedDay.date))}
        />
      )}
    </div>
  );
}

function DayModal({
  day,
  shifts,
  onClose,
  isAdmin,
  residents,
  byId,
  color,
  requests,
}: {
  day: ResolvedDay;
  shifts: Shift[];
  onClose: () => void;
  isAdmin: boolean;
  residents: Resident[];
  byId: Map<string, Resident>;
  color: (id: string) => string;
  requests: GuardiaRequest[];
}) {
  const [busy, setBusy] = useState(false);
  const bdays = residents.filter((r) => isBirthday(day.date, r));
  const now = () => new Date().toISOString();

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(`No se pudo guardar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const name = (id: string) => byId.get(id)?.shortName ?? id;
  const where = `${shortDateLabel(day.date)}`;

  const assign = (s: Shift, residentId: string) =>
    run(async () => {
      await updateDoc(doc(db, 'shifts', s.id), { assignedResidentId: residentId, actualResidentId: residentId, updatedAt: now() });
      await logActivity({
        entity: 'guardias',
        summary: `Editó a mano la guardia del ${where}`,
        changes: [`${name(s.actualResidentId)} → ${name(residentId)}`],
      });
    });
  const setStatus = (s: Shift, status: ShiftStatus) =>
    run(async () => {
      await updateDoc(doc(db, 'shifts', s.id), { status, updatedAt: now() });
      await logActivity({
        entity: 'guardias',
        summary: `Cambió el estado de la guardia del ${where} (${name(s.actualResidentId)})`,
        changes: [`Estado: ${s.status} → ${status}`],
      });
    });
  const remove = (s: Shift) => {
    if (!confirm('¿Borrar esta guardia del cronograma publicado?')) return;
    run(async () => {
      await deleteDoc(doc(db, 'shifts', s.id));
      await logActivity({ entity: 'guardias', summary: `Borró la guardia del ${where}`, changes: [`${name(s.actualResidentId)} → —`] });
    });
  };
  const add = () => {
    const slotIndex = shifts.length ? Math.max(...shifts.map((s) => s.slotIndex)) + 1 : 0;
    const id = `${day.date}_${slotIndex}`;
    const first = residents.find((r) => r.active)!;
    return run(async () => {
      await setDoc(doc(db, 'shifts', id), {
        id,
        date: day.date,
        slotIndex,
        assignedResidentId: first.id,
        actualResidentId: first.id,
        status: day.date < todayISO() ? 'realizada' : 'programada',
        createdAt: now(),
      });
      await logActivity({ entity: 'guardias', summary: `Agregó un R1 a la guardia del ${where}`, changes: [`— → ${name(first.id)}`] });
    });
  };

  return (
    <Modal open onClose={onClose} title={shortDateLabel(day.date)}>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {day.holidayName && <Badge tone="critical">🇦🇷 {day.holidayName}</Badge>}
        {day.tags
          .filter((t) => TAG_LABEL[t] && t !== 'feriado')
          .map((t) => (
            <Badge key={t}>{TAG_LABEL[t]}</Badge>
          ))}
        <Badge tone="info">R1 requeridos: {day.requiredR1}</Badge>
      </div>
      {day.notes && <p className="text-sm bg-surface-2 rounded-lg p-2 mb-3">{day.notes}</p>}
      {bdays.length > 0 && <p className="text-sm mb-3">🎂 Cumple {bdays.map((b) => b.name).join(' y ')}</p>}

      <h3 className="text-xs font-medium text-text-dim uppercase tracking-wide mb-2">De guardia</h3>
      <ul className="flex flex-col gap-2 mb-4">
        {shifts.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm flex-wrap">
            <Dot color={color(s.actualResidentId)} />
            {isAdmin ? (
              <select
                value={s.actualResidentId}
                disabled={busy}
                onChange={(e) => assign(s, e.target.value)}
                className="bg-surface-2 border border-border rounded-lg px-2 py-1 text-sm"
              >
                {residents.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-medium">{byId.get(s.actualResidentId)?.name}</span>
            )}
            {s.assignedResidentId !== s.actualResidentId && (
              <span className="text-xs text-text-dim">(cambio: era de {byId.get(s.assignedResidentId)?.shortName})</span>
            )}
            {s.slept === false && <Badge tone="critical">no durmió</Badge>}
            {isAdmin && (
              <>
                <select
                  value={s.status}
                  disabled={busy}
                  onChange={(e) => setStatus(s, e.target.value as ShiftStatus)}
                  className="bg-surface-2 border border-border rounded-lg px-2 py-1 text-xs"
                >
                  <option value="programada">programada</option>
                  <option value="realizada">realizada</option>
                  <option value="cancelada">cancelada</option>
                </select>
                <button onClick={() => remove(s)} disabled={busy} className="text-xs text-danger underline">
                  borrar
                </button>
              </>
            )}
          </li>
        ))}
        {shifts.length === 0 && <li className="text-sm text-text-dim">Nadie asignado.</li>}
      </ul>
      {isAdmin && (
        <button onClick={add} disabled={busy} className={clsx(btnSecondary, 'mb-4')}>
          + Agregar R1 a este día
        </button>
      )}

      {requests.length > 0 && (
        <>
          <h3 className="text-xs font-medium text-text-dim uppercase tracking-wide mb-2">Pedidos para este día</h3>
          <ul className="flex flex-col gap-1.5">
            {requests.map((r) => (
              <li key={r.id} className="text-sm flex items-center gap-2 flex-wrap">
                <RequestTypeBadge type={r.type} />
                <span className="font-medium">{byId.get(r.residentId)?.shortName}</span>
                <span className="text-text-dim">
                  {requestIntent(r) === 'off' ? 'no puede/no quiere' : requestIntent(r) === 'on' ? 'quiere esta guardia' : 'la quiere para tener el posguardia'}
                </span>
                {r.status !== 'pendiente' && <Badge>{r.status}</Badge>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

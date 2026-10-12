import clsx from 'clsx';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import Badge from '../components/Badge';
import RequestTypeBadge from '../components/RequestTypeBadge';
import { Card, Dot, Empty, PageHeader, Segmented, btnPrimary, btnSecondary, inputCls } from '../components/ui';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../firebase';
import { useRequests, useResidents, useResidentsById } from '../hooks/data';
import { useColors } from '../hooks/useColors';
import { addDaysISO, diffDays, monthKey, monthLabel, shortDateLabel, todayISO } from '../lib/dates';
import type { GuardiaRequest, RequestIntent, RequestStatus, RequestType } from '../types';
import { REQUEST_TYPE_LABEL, REQUEST_TYPE_PRIORITY, requestIntent, requestShiftDates } from '../types';
import type { Resident } from '../types';
import { logActivity } from '../lib/activity';

const STATUS_TONE: Record<RequestStatus, 'warning' | 'good' | 'critical' | 'neutral'> = {
  pendiente: 'warning',
  aceptado: 'good',
  rechazado: 'critical',
  parcial: 'neutral',
};

function intentLabel(intent: RequestIntent) {
  return intent === 'off' ? 'sin guardia' : intent === 'on' ? 'quiere la guardia' : 'necesita el posguardia';
}

function NewRequest({
  me,
  isAdmin,
  residents,
}: {
  me: Resident;
  isAdmin: boolean;
  residents: Resident[];
}) {
  const [forId, setForId] = useState(me.id);
  const [intent, setIntent] = useState<RequestIntent>('off');
  const [type, setType] = useState<RequestType>('pedido_fuerte');
  const [mode, setMode] = useState<'dias' | 'rango'>('dias');
  const [day, setDay] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dates, setDates] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const effectiveType: RequestType = intent !== 'off' && type === 'bloqueo' ? 'pedido_fuerte' : type;
  const rangeDates = useMemo(() => {
    if (!from || !to || to < from || diffDays(from, to) > 92) return [];
    return Array.from({ length: diffDays(from, to) + 1 }, (_, i) => addDaysISO(from, i));
  }, [from, to]);
  const finalDates = mode === 'rango' ? rangeDates : dates;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (finalDates.length === 0) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'requests'), {
        residentId: forId,
        type: effectiveType,
        intent,
        dates: finalDates,
        reason: reason.trim(),
        status: 'pendiente',
        createdBy: me.id,
        createdAt: new Date().toISOString(),
      });
      const who = residents.find((r) => r.id === forId)?.shortName ?? '';
      await logActivity({
        entity: 'pedido',
        summary:
          forId === me.id
            ? `Pidió ${intentLabel(intent)}: ${datesSummary(finalDates)}`
            : `Cargó un pedido para ${who} (${intentLabel(intent)}): ${datesSummary(finalDates)}`,
        changes: [`Tipo: ${REQUEST_TYPE_LABEL[effectiveType]}`, ...(reason.trim() ? [`Motivo: ${reason.trim()}`] : [])],
      });
      setForId(me.id);
      setDates([]);
      setFrom('');
      setTo('');
      setReason('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Nuevo pedido">
      <form onSubmit={submit} className="flex flex-col gap-3">
        {isAdmin && (
          <label className="text-sm text-text-dim flex items-center gap-2">
            Para
            <select value={forId} onChange={(e) => setForId(e.target.value)} className="bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-sm text-text">
              {residents.filter((r) => r.active).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id === me.id ? `${r.shortName} (yo)` : r.shortName}
                </option>
              ))}
            </select>
          </label>
        )}
        <Segmented<RequestIntent>
          value={intent}
          onChange={setIntent}
          options={[
            { value: 'off', label: '🙅 Sin guardia' },
            { value: 'on', label: '🙋 Quiero esta guardia' },
            { value: 'posguardia', label: '🌅 Necesito el posguardia' },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          {(intent === 'off' ? (['bloqueo', 'pedido_fuerte', 'preferencia'] as RequestType[]) : (['pedido_fuerte', 'preferencia'] as RequestType[])).map(
            (t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={clsx('rounded-lg border p-1', effectiveType === t ? 'border-accent ring-1 ring-accent' : 'border-border')}
              >
                <RequestTypeBadge type={t} />
              </button>
            ),
          )}
        </div>
        <p className="text-xs text-text-dim">
          {effectiveType === 'bloqueo'
            ? 'Imposible: el generador nunca te va a poner ese día.'
            : effectiveType === 'pedido_fuerte'
              ? 'Muy importante: se respeta salvo que sea imposible.'
              : 'Sería mejor, pero se puede sacrificar por equidad.'}
          {intent === 'off' && ' Para días en los que no podés o no querés estar de guardia.'}
          {intent === 'on' && ' Si ponés varias fechas, alcanza con que te toque una (ej. "sábado 7 o 21").'}
          {intent === 'posguardia' && ' Elegí el día que necesitás libre después de la guardia: te ponemos de guardia el día anterior.'}
        </p>
        <Segmented<'dias' | 'rango'>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'dias', label: 'Días sueltos' },
            { value: 'rango', label: 'Rango (vacaciones, congreso…)' },
          ]}
        />
        {mode === 'dias' ? (
          <>
            <div className="flex gap-2">
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={inputCls} />
              <button
                type="button"
                onClick={() => {
                  if (day && !dates.includes(day)) setDates([...dates, day].sort());
                  setDay('');
                }}
                className={btnSecondary}
              >
                Agregar
              </button>
            </div>
            {dates.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {dates.map((d) => (
                  <button key={d} type="button" onClick={() => setDates(dates.filter((x) => x !== d))} className="text-xs bg-surface-2 border border-border rounded-full px-2.5 py-1">
                    {shortDateLabel(d)} ✕
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex gap-2 items-center">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            <span className="text-text-dim text-sm">a</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </div>
        )}
        {mode === 'rango' && rangeDates.length > 0 && <p className="text-xs text-text-dim">{rangeDates.length} días</p>}
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Motivo (lo ve todo el grupo)" className={clsx(inputCls, 'resize-none')} />
        <button disabled={saving || finalDates.length === 0} className={clsx(btnPrimary, 'self-start')}>
          {saving ? 'Enviando…' : 'Enviar pedido'}
        </button>
      </form>
    </Card>
  );
}

function datesSummary(dates: string[]) {
  const sorted = [...dates].sort();
  const contiguous = sorted.every((d, i) => i === 0 || diffDays(sorted[i - 1], d) === 1);
  if (sorted.length > 2 && contiguous) return `${shortDateLabel(sorted[0])} → ${shortDateLabel(sorted[sorted.length - 1])}`;
  return sorted.map(shortDateLabel).join(' · ');
}

export default function Pedidos() {
  const { resident: me, isAdmin } = useAuthContext();
  const { requests, loading } = useRequests();
  const { residents } = useResidents();
  const byId = useResidentsById(residents);
  const color = useColors(residents);
  const [month, setMonth] = useState<string>('proximos');
  const [person, setPerson] = useState<string>('todas');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const today = todayISO();

  const months = useMemo(() => [...new Set(requests.flatMap((r) => r.dates.map(monthKey)))].sort(), [requests]);
  const visible = requests
    .filter((r) => (month === 'proximos' ? r.dates.some((d) => d >= today) : month === 'todos' ? true : r.dates.some((d) => d.startsWith(month))))
    .filter((r) => person === 'todas' || r.residentId === person)
    .sort((a, b) => REQUEST_TYPE_PRIORITY[a.type] - REQUEST_TYPE_PRIORITY[b.type] || [...a.dates].sort()[0].localeCompare([...b.dates].sort()[0]));

  async function resolve(r: GuardiaRequest, status: RequestStatus) {
    await updateDoc(doc(db, 'requests', r.id), {
      status,
      resolutionNote: notes[r.id] ?? '',
      resolvedBy: me!.id,
      resolvedAt: new Date().toISOString(),
    });
    await logActivity({
      entity: 'pedido',
      summary: `Marcó como ${status} el pedido de ${byId.get(r.residentId)?.shortName} (${datesSummary(r.dates)})`,
      changes: [`Estado: ${r.status} → ${status}`, ...(notes[r.id] ? [`Nota: ${notes[r.id]}`] : [])],
    });
  }

  async function remove(r: GuardiaRequest) {
    if (!confirm('¿Borrar este pedido?')) return;
    await deleteDoc(doc(db, 'requests', r.id));
    await logActivity({
      entity: 'pedido',
      summary: `Borró el pedido de ${byId.get(r.residentId)?.shortName} (${datesSummary(r.dates)})`,
      changes: [`Era: ${intentLabel(requestIntent(r))}, ${REQUEST_TYPE_LABEL[r.type]}, estado ${r.status}`],
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Pedidos" subtitle="Visibles para todo el grupo y ordenados por necesidad: bloqueo → pedido fuerte → preferencia." />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">{me && <NewRequest me={me} isAdmin={isAdmin} residents={residents} />}</div>
        <div className="lg:col-span-3 flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap">
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="bg-surface border border-border rounded-xl px-3 py-2 text-sm">
              <option value="proximos">Próximos</option>
              <option value="todos">Todos</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <select value={person} onChange={(e) => setPerson(e.target.value)} className="bg-surface border border-border rounded-xl px-3 py-2 text-sm">
              <option value="todas">Todas las personas</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.shortName}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <Empty>Cargando…</Empty>
          ) : visible.length === 0 ? (
            <Empty>No hay pedidos con estos filtros.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((r) => {
                const intent = requestIntent(r);
                const mine = r.residentId === me?.id;
                return (
                  <li key={r.id} className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Dot color={color(r.residentId)} />
                      <span className="font-medium text-sm">{byId.get(r.residentId)?.shortName}</span>
                      <span className="text-sm">
                        {intent === 'off' ? '🙅 sin guardia' : intent === 'on' ? '🙋 quiere la guardia' : '🌅 necesita el posguardia'}
                      </span>
                      <RequestTypeBadge type={r.type} />
                      <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    </div>
                    <p className="text-sm font-medium">
                      {datesSummary(r.dates)}
                      {intent === 'posguardia' && (
                        <span className="text-text-dim font-normal"> (guardia el día anterior: {datesSummary(requestShiftDates(r))})</span>
                      )}
                    </p>
                    {r.reason && <p className="text-sm text-text-dim">{r.reason}</p>}
                    {r.createdBy && r.createdBy !== r.residentId && (
                      <p className="text-xs text-text-dim">Cargado por {byId.get(r.createdBy)?.shortName}</p>
                    )}
                    {r.resolutionNote && <p className="text-xs text-text-dim">Resolución: {r.resolutionNote}</p>}
                    <div className="flex flex-wrap gap-2 items-center">
                      {isAdmin && (
                        <>
                          <input
                            value={notes[r.id] ?? ''}
                            onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                            placeholder="Nota (opcional)"
                            className="flex-1 min-w-[140px] rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs"
                          />
                          <button onClick={() => resolve(r, 'aceptado')} className="text-xs px-2.5 py-1.5 rounded-lg bg-ok-soft text-ok font-medium">
                            Aceptar
                          </button>
                          <button onClick={() => resolve(r, 'parcial')} className="text-xs px-2.5 py-1.5 rounded-lg bg-surface-2 text-text-dim font-medium">
                            Parcial
                          </button>
                          <button onClick={() => resolve(r, 'rechazado')} className="text-xs px-2.5 py-1.5 rounded-lg bg-danger-soft text-danger font-medium">
                            Rechazar
                          </button>
                        </>
                      )}
                      {(isAdmin || (mine && r.status === 'pendiente')) && (
                        <button onClick={() => remove(r)} className="text-xs text-danger underline ml-auto">
                          borrar
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../firebase';
import { useRequests, useResidents, useResidentsById } from '../hooks/data';
import { REQUEST_TYPE_PRIORITY } from '../types';
import type { RequestStatus, RequestType } from '../types';
import Badge from '../components/Badge';
import RequestTypeBadge from '../components/RequestTypeBadge';

const STATUS_TONE: Record<RequestStatus, 'warning' | 'good' | 'critical' | 'neutral'> = {
  pendiente: 'warning',
  aceptado: 'good',
  rechazado: 'critical',
  parcial: 'neutral',
};

const STATUS_LABEL: Record<RequestStatus, string> = {
  pendiente: 'Pendiente',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  parcial: 'Parcial',
};

function NewRequestForm({ residentId }: { residentId: string }) {
  const [type, setType] = useState<RequestType>('preferencia');
  const [dateInput, setDateInput] = useState('');
  const [dates, setDates] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function addDate() {
    if (dateInput && !dates.includes(dateInput)) {
      setDates([...dates, dateInput].sort());
      setDateInput('');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (dates.length === 0 || !reason.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'requests'), {
        residentId,
        type,
        dates,
        reason: reason.trim(),
        status: 'pendiente',
        createdAt: serverTimestamp(),
      });
      setDates([]);
      setReason('');
      setType('preferencia');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <h2 className="text-sm font-medium">Nuevo pedido</h2>
      <div className="flex gap-2">
        {(['bloqueo', 'pedido_fuerte', 'preferencia'] as RequestType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`px-3 py-1.5 rounded-lg border text-sm ${
              type === t ? 'border-accent bg-accent-soft text-accent' : 'border-border text-text-dim'
            }`}
          >
            <RequestTypeBadge type={t} />
          </button>
        ))}
      </div>
      <div className="flex gap-2 items-end">
        <label className="flex flex-col gap-1 text-sm text-text-dim flex-1">
          Fecha
          <input
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-text outline-none focus:border-accent"
          />
        </label>
        <button
          type="button"
          onClick={addDate}
          className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2"
        >
          Agregar
        </button>
      </div>
      {dates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {dates.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDates(dates.filter((x) => x !== d))}
              className="text-xs bg-surface-2 border border-border rounded-full px-2 py-1"
              title="Quitar"
            >
              {d} ✕
            </button>
          ))}
        </div>
      )}
      <label className="flex flex-col gap-1 text-sm text-text-dim">
        Motivo
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          required
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-text outline-none focus:border-accent resize-none"
          placeholder="Contá brevemente por qué"
        />
      </label>
      <button
        type="submit"
        disabled={submitting || dates.length === 0}
        className="self-start rounded-lg bg-accent text-accent-contrast px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {submitting ? 'Enviando…' : 'Enviar pedido'}
      </button>
    </form>
  );
}

export default function Pedidos() {
  const { resident, isAdmin } = useAuthContext();
  const { requests, loading } = useRequests();
  const { residents } = useResidents();
  const residentsById = useResidentsById(residents);
  const [resolvingNote, setResolvingNote] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...requests].sort((a, b) => {
        const pa = REQUEST_TYPE_PRIORITY[a.type];
        const pb = REQUEST_TYPE_PRIORITY[b.type];
        if (pa !== pb) return pa - pb;
        return a.dates[0]?.localeCompare(b.dates[0] ?? '') ?? 0;
      }),
    [requests],
  );

  async function resolve(id: string, status: RequestStatus) {
    await updateDoc(doc(db, 'requests', id), {
      status,
      resolutionNote: resolvingId === id ? resolvingNote : '',
      resolvedBy: resident?.id,
      resolvedAt: serverTimestamp(),
    });
    setResolvingId(null);
    setResolvingNote('');
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Pedidos</h1>
        <p className="text-sm text-text-dim">
          Visibles para todo el grupo, ordenados por prioridad (bloqueo → pedido fuerte → preferencia).
        </p>
      </div>

      {resident && <NewRequestForm residentId={resident.id} />}

      {loading && <p className="text-text-dim text-sm">Cargando pedidos…</p>}

      <ul className="flex flex-col gap-2">
        {sorted.map((req) => {
          const r = residentsById.get(req.residentId);
          return (
            <li key={req.id} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <RequestTypeBadge type={req.type} />
                  <span className="font-medium text-sm">{r?.name ?? req.residentId}</span>
                  <Badge tone={STATUS_TONE[req.status]}>{STATUS_LABEL[req.status]}</Badge>
                </div>
                <span className="text-xs text-text-dim">{req.dates.join(' · ')}</span>
              </div>
              <p className="text-sm">{req.reason}</p>
              {req.resolutionNote && (
                <p className="text-xs text-text-dim">Resolución: {req.resolutionNote}</p>
              )}
              {isAdmin && req.status === 'pendiente' && (
                <div className="flex flex-col gap-2 pt-2 border-t border-border">
                  <input
                    value={resolvingId === req.id ? resolvingNote : ''}
                    onChange={(e) => {
                      setResolvingId(req.id);
                      setResolvingNote(e.target.value);
                    }}
                    placeholder="Nota de resolución (opcional)"
                    className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolve(req.id, 'aceptado')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-ok-soft text-ok font-medium"
                    >
                      Aceptar
                    </button>
                    <button
                      onClick={() => resolve(req.id, 'parcial')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 text-text-dim font-medium"
                    >
                      Parcial
                    </button>
                    <button
                      onClick={() => resolve(req.id, 'rechazado')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-danger-soft text-danger font-medium"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {!loading && sorted.length === 0 && (
          <p className="text-text-dim text-sm">Todavía no hay pedidos.</p>
        )}
      </ul>
    </div>
  );
}

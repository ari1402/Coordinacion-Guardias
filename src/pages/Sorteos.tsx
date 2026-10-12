import clsx from 'clsx';
import { deleteDoc, doc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import Badge from '../components/Badge';
import { Card, Empty, PageHeader, ResidentChip, btnPrimary, btnSecondary, inputBase, inputCls } from '../components/ui';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../firebase';
import { useRaffles, useResidents, useResidentsById } from '../hooks/data';
import { useColors } from '../hooks/useColors';
import { shortDateLabel } from '../lib/dates';
import { logActivity } from '../lib/activity';
import { createRaffle, drawRaffle, winners } from '../lib/raffles';
import type { Raffle } from '../types';

export default function Sorteos() {
  const { resident: me, isAdmin } = useAuthContext();
  const { residents } = useResidents();
  const active = residents.filter((r) => r.active);
  const byId = useResidentsById(residents);
  const color = useColors(residents);
  const { raffles, loading } = useRaffles();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [participants, setParticipants] = useState<string[] | null>(null);
  const [winnersCount, setWinnersCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const chosen = participants ?? active.map((r) => r.id);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || chosen.length < 2) return;
    setSaving(true);
    try {
      await createRaffle({
        title: title.trim(),
        description: description.trim() || undefined,
        participantIds: chosen,
        winnersCount: Math.min(winnersCount, chosen.length),
        createdBy: me!.id,
      });
      setTitle('');
      setDescription('');
      setParticipants(null);
      setWinnersCount(1);
    } finally {
      setSaving(false);
    }
  }

  const pending = raffles.filter((r) => r.status === 'pendiente');
  const done = raffles.filter((r) => r.status === 'sorteado');

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Sorteos"
        subtitle="Completamente aleatorios y a la vista de todas: el resultado queda guardado con fecha y quién lo corrió, y no se puede volver a sortear."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Nuevo sorteo" className="lg:col-span-2">
          <form onSubmit={create} className="flex flex-col gap-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qué se sortea (ej. guardia del 24/12)" className={inputCls} required />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalle (opcional)" rows={2} className={clsx(inputCls, 'resize-none')} />
            <div>
              <p className="text-sm text-text-dim mb-2">Entre quiénes</p>
              <div className="flex flex-wrap gap-2">
                {active.map((r) => {
                  const on = chosen.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setParticipants(on ? chosen.filter((x) => x !== r.id) : [...chosen, r.id])}
                      className={clsx('px-3 py-1.5 rounded-full border text-sm transition-colors', on ? 'bg-accent-soft border-accent text-accent' : 'border-border text-text-dim')}
                    >
                      {r.shortName}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="text-sm text-text-dim flex items-center gap-2">
              Cantidad de ganadoras
              <input
                type="number"
                min={1}
                max={Math.max(1, chosen.length - 1)}
                value={winnersCount}
                onChange={(e) => setWinnersCount(Math.max(1, Number(e.target.value)))}
                className={clsx(inputBase, 'w-20')}
              />
            </label>
            <button disabled={saving || chosen.length < 2 || !title.trim()} className={btnPrimary}>
              Crear sorteo
            </button>
            <p className="text-xs text-text-dim">
              Para sortear una guardia puntual del cronograma, marcala con 🎲 en el Generador: el ganador queda
              asignado solo.
            </p>
          </form>
        </Card>

        <div className="lg:col-span-3 flex flex-col gap-4">
          <Card title={`Pendientes (${pending.length})`}>
            {loading ? (
              <Empty>Cargando…</Empty>
            ) : pending.length === 0 ? (
              <Empty>No hay sorteos pendientes.</Empty>
            ) : (
              <ul className="flex flex-col gap-3">
                {pending.map((r) => (
                  <PendingRaffle
                    key={r.id}
                    raffle={r}
                    byId={byId}
                    color={color}
                    canDraw={isAdmin || (!r.linkedSlot && r.createdBy === me?.id)}
                    canDelete={isAdmin || r.createdBy === me?.id}
                    userId={me!.id}
                  />
                ))}
              </ul>
            )}
          </Card>

          <Card title="Resultados">
            {done.length === 0 ? (
              <Empty>Todavía no hay resultados.</Empty>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {done.map((r) => (
                  <li key={r.id} className="py-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-medium">{r.title}</span>
                      <span className="text-xs text-text-dim">
                        {r.drawnAt && new Date(r.drawnAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} · lo corrió{' '}
                        {byId.get(r.drawnBy ?? '')?.shortName}
                      </span>
                    </div>
                    {r.description && <p className="text-sm text-text-dim">{r.description}</p>}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm">🏆</span>
                      {winners(r).map((id) => (
                        <ResidentChip key={id} name={byId.get(id)?.shortName ?? '?'} color={color(id)} />
                      ))}
                      <span className="text-xs text-text-dim ml-2">
                        Orden completo: {r.order?.map((id) => byId.get(id)?.shortName).join(' → ')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function PendingRaffle({
  raffle,
  byId,
  color,
  canDraw,
  canDelete,
  userId,
}: {
  raffle: Raffle;
  byId: Map<string, { shortName: string }>;
  color: (id: string) => string;
  canDraw: boolean;
  canDelete: boolean;
  userId: string;
}) {
  const [rolling, setRolling] = useState(false);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => setShown((n) => (n + 1) % raffle.participantIds.length), 90);
    return () => clearInterval(t);
  }, [rolling, raffle.participantIds.length]);

  async function draw() {
    setRolling(true);
    try {
      await Promise.all([
        drawRaffle(raffle, userId, (id) => byId.get(id)?.shortName ?? id),
        new Promise((r) => setTimeout(r, 1600)),
      ]);
    } catch (e) {
      alert(`No se pudo sortear: ${(e as Error).message}`);
    } finally {
      setRolling(false);
    }
  }

  return (
    <li className="rounded-xl border border-border p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-medium">{raffle.title}</span>
        <span className="flex gap-1.5">
          {raffle.linkedSlot && <Badge tone="accent">guardia {shortDateLabel(raffle.linkedSlot.date)}</Badge>}
          <Badge>{raffle.winnersCount} ganadora{raffle.winnersCount > 1 ? 's' : ''}</Badge>
        </span>
      </div>
      {raffle.description && <p className="text-sm text-text-dim">{raffle.description}</p>}
      <div className="flex flex-wrap gap-1.5">
        {raffle.participantIds.map((id, i) => (
          <span key={id} className={clsx('transition-transform', rolling && i === shown && 'scale-125')}>
            <ResidentChip name={byId.get(id)?.shortName ?? '?'} color={rolling && i !== shown ? 'var(--text-dim)' : color(id)} />
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        {canDraw ? (
          <button onClick={draw} disabled={rolling} className={btnPrimary}>
            {rolling ? 'Sorteando…' : '🎲 Sortear'}
          </button>
        ) : (
          <span className="text-xs text-text-dim">
            {raffle.linkedSlot ? 'Lo sortean Bea o Ana (es una guardia del cronograma).' : 'Lo sortea quien lo creó.'}
          </span>
        )}
        {canDelete && !rolling && (
          <button
            onClick={async () => {
              if (!confirm('¿Borrar este sorteo?')) return;
              await deleteDoc(doc(db, 'raffles', raffle.id));
              await logActivity({ entity: 'sorteo', summary: `Borró el sorteo pendiente "${raffle.title}"` });
            }}
            className={btnSecondary}
          >
            Borrar
          </button>
        )}
      </div>
    </li>
  );
}

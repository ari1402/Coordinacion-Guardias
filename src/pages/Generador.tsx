import clsx from 'clsx';
import { deleteDoc, doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Badge from '../components/Badge';
import ImportTextModal from '../components/ImportTextModal';
import PersonBreakdownGrid from '../components/PersonBreakdown';
import { Card, Dot, Modal, MonthNav, PageHeader, Segmented, btnPrimary, btnSecondary, inputCls } from '../components/ui';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../firebase';
import {
  useAllShifts,
  useCalendarData,
  useDrafts,
  useRaffles,
  useRequests,
  useResidents,
  usePrivateNotes,
  useResidentsById,
  useRotations,
} from '../hooks/data';
import { useColors } from '../hooks/useColors';
import { currentMonthKey, useMonth } from '../hooks/useMonth';
import { isBirthday, isBirthdayBlocked } from '../lib/birthdays';
import {
  effectiveMonthConfig,
  monthLabel,
  resolveMonth,
  shiftMonthKey,
  shortDateLabel,
} from '../lib/dates';
import { computeAllEquityCounters, resolvePeriod } from '../lib/equity';
import {
  buildSlots,
  evaluateDraft,
  generateOptions,
  priorFromCounters,
  slotKey,
  xlPriority,
  type GeneratedOption,
  type Issue,
  type ScheduleInput,
} from '../lib/generator';
import { logActivity } from '../lib/activity';
import { buildBreakdown } from '../lib/breakdown';
import { DEFAULT_DISABLED_NOTE, disableSlot, enableSlot } from '../lib/disableSlot';
import { awayMonths } from '../lib/rotations';
import { TAG_EMOJI, dayBgClass } from '../lib/labels';
import { createRaffle, drawRaffle, winners } from '../lib/raffles';
import {
  applyRaffleWinners,
  deleteDraft,
  draftFromShifts,
  mergeTemplate,
  planPublish,
  publish,
  saveDraft,
} from '../lib/schedule';
import type { DraftSlot, Raffle, ResolvedDay } from '../types';
import { EXTERNAL_REQUESTER, WEEKDAY_KEYS, WEEKDAY_SHORT, requestIntent, requesterName, requestShiftDates } from '../types';

export default function Generador() {
  const { resident: me } = useAuthContext();
  const [params] = useSearchParams();
  const { monthKey, next, prev } = useMonth(params.get('mes') ?? shiftMonthKey(currentMonthKey(), 1));
  const { residents } = useResidents();
  const active = useMemo(() => residents.filter((r) => r.active), [residents]);
  const byId = useResidentsById(residents);
  const color = useColors(residents);
  const nameOf = (id: string) => byId.get(id)?.shortName ?? id;
  const { storedDays, monthConfigs, loading: lc } = useCalendarData();
  const { shifts, loading: ls } = useAllShifts();
  const { requests } = useRequests();
  const { raffles } = useRaffles();
  const { drafts, loading: ld } = useDrafts(true);
  const { rotations } = useRotations();

  const [edits, setEdits] = useState<Record<string, DraftSlot[]>>({});
  const [options, setOptions] = useState<{ month: string; list: GeneratedOption[] } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [raffleSlot, setRaffleSlot] = useState<DraftSlot | null>(null);
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [detailView, setDetailView] = useState<string>('editor');

  const days = useMemo(() => resolveMonth(monthKey, storedDays, monthConfigs), [monthKey, storedDays, monthConfigs]);
  const cfg = useMemo(() => effectiveMonthConfig(monthKey, monthConfigs), [monthKey, monthConfigs]);
  const template = useMemo(() => buildSlots(days), [days]);
  const monthShifts = useMemo(() => shifts.filter((s) => s.date.startsWith(monthKey)), [shifts, monthKey]);
  const savedDraft = drafts.find((d) => d.id === monthKey);

  const prior = useMemo(() => {
    const before = shifts.filter((s) => s.date < `${monthKey}-01`);
    const counters = computeAllEquityCounters(
      active.map((r) => r.id),
      before,
      resolvePeriod(before, storedDays, monthConfigs),
    );
    return Object.fromEntries(
      active.map((r) => {
        const last = before.filter((s) => s.actualResidentId === r.id).at(-1)?.date;
        return [r.id, priorFromCounters(counters[r.id], last)];
      }),
    );
  }, [shifts, monthKey, active, storedDays, monthConfigs]);

  const monthRequests = useMemo(
    () => requests.filter((r) => [...r.dates, ...requestShiftDates(r)].some((d) => d.startsWith(monthKey))),
    [requests, monthKey],
  );

  // Quien tiene Vacaciones en su carril ese mes no hace guardias.
  const onVacation = useMemo(() => {
    const away = awayMonths(rotations);
    return active.filter((r) => away[r.id]?.has(monthKey));
  }, [rotations, active, monthKey]);

  const input: ScheduleInput = useMemo(
    () => ({
      days,
      residents: active,
      requests: monthRequests,
      rules: cfg.rules,
      prior,
      holidayDates: storedDays.filter((d) => d.isHoliday).map((d) => d.date),
      unavailable: onVacation.map((r) => ({ residentId: r.id, dates: days.map((d) => d.date), reason: 'Vacaciones' })),
    }),
    [days, active, monthRequests, cfg.rules, prior, storedDays, onVacation],
  );

  const source: 'borrador' | 'publicado' | 'vacío' = savedDraft ? 'borrador' : monthShifts.length ? 'publicado' : 'vacío';
  const baseDraft = useMemo(() => {
    if (savedDraft) return mergeTemplate(template, savedDraft.slots);
    if (monthShifts.length) return draftFromShifts(template, monthShifts);
    return mergeTemplate(template, []);
  }, [savedDraft, monthShifts, template]);
  const dirty = !!edits[monthKey];
  const draft = useMemo(
    () => applyRaffleWinners(mergeTemplate(template, edits[monthKey] ?? baseDraft), raffles),
    [template, edits, monthKey, baseDraft, raffles],
  );
  const setDraft = (d: DraftSlot[]) => setEdits((e) => ({ ...e, [monthKey]: d }));
  const clearEdits = () =>
    setEdits((e) => {
      const copy = { ...e };
      delete copy[monthKey];
      return copy;
    });

  const evaluation = useMemo(() => evaluateDraft(input, draft), [input, draft]);
  const isEmpty = draft.every((s) => !s.residentId && !s.raffleId);
  const issueBySlot = useMemo(() => {
    const m = new Map<string, Issue['severity']>();
    if (isEmpty) return m;
    for (const i of evaluation.issues) {
      if (!i.slotKey) continue;
      if (m.get(i.slotKey) !== 'hard') m.set(i.slotKey, i.severity);
    }
    return m;
  }, [evaluation, isEmpty]);

  const loading = lc || ls || ld;
  const monthOptions = options?.month === monthKey ? options.list : null;
  const detailSlots = monthOptions?.find((o) => o.profile === detailView)?.slots ?? draft;
  const breakdown = useMemo(
    () => buildBreakdown(days, detailSlots, active.map((r) => r.id), prior),
    [days, detailSlots, active, prior],
  );

  function runGenerator() {
    setGenerating(true);
    setTimeout(() => {
      const fixed = draft.filter((s) => s.locked || s.raffleId);
      setOptions({ month: monthKey, list: generateOptions({ ...input, fixed }) });
      setGenerating(false);
    }, 30);
  }

  function updateSlot(key: string, patch: Partial<DraftSlot>) {
    setDraft(draft.map((s) => (slotKey(s.date, s.slotIndex) === key ? { ...s, ...patch } : s)));
  }

  async function withBusy(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      alert(`No se pudo completar: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const onSave = () =>
    withBusy('Guardando…', async () => {
      await saveDraft(monthKey, draft, me!.id);
      clearEdits();
    });

  const onPublish = () =>
    withBusy('Publicando…', async () => {
      const plan = planPublish(monthKey, draft, shifts, nameOf);
      const hard = evaluation.summary.hardCount;
      const msg =
        `Vas a publicar ${monthLabel(monthKey)}: ${plan.changed} guardia(s) cambian.` +
        (hard ? `\n\nOjo: hay ${hard} problema(s) duro(s) sin resolver.` : '') +
        (evaluation.summary.raffles ? `\n\nHay ${evaluation.summary.raffles} guardia(s) en sorteo pendiente: quedan sin asignar hasta que se sorteen.` : '') +
        '\n\n¿Seguimos?';
      if (!confirm(msg)) return;
      await publish(plan, monthKey, me!.id);
      if (savedDraft) await deleteDraft(monthKey);
      clearEdits();
    });

  const slotsByDate = useMemo(() => {
    const m = new Map<string, DraftSlot[]>();
    for (const s of draft) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return m;
  }, [draft]);

  const dayInfo = useMemo(() => {
    const info = new Map<string, { blocked: Set<string>; off: Set<string>; on: Set<string>; ext: string[]; bdays: string[] }>();
    for (const d of days) {
      const blocked = new Set<string>();
      const off = new Set<string>();
      const on = new Set<string>();
      const ext: string[] = [];
      for (const r of monthRequests) {
        if (r.status === 'rechazado' || !requestShiftDates(r).includes(d.date)) continue;
        if (r.residentId === EXTERNAL_REQUESTER) {
          if (requestIntent(r) !== 'off') ext.push(r.externalName || 'Otra persona');
          continue;
        }
        if (r.type === 'bloqueo') blocked.add(r.residentId);
        else if (requestIntent(r) === 'off') off.add(r.residentId);
        else on.add(r.residentId);
      }
      for (const res of active) if (isBirthdayBlocked(d.date, res)) blocked.add(res.id);
      for (const res of onVacation) blocked.add(res.id);
      info.set(d.date, {
        blocked,
        off,
        on,
        ext,
        bdays: active.filter((r) => isBirthday(d.date, r)).map((r) => r.shortName),
      });
    }
    return info;
  }, [days, monthRequests, active, onVacation]);

  const leading = days[0]?.weekday ?? 0;
  const xlRanking = useMemo(() => {
    const xlDays = days.filter((d) => d.tags.includes('finde_xl') && d.requiredR1 > 0);
    if (!xlDays.length) return null;
    const away = new Set(onVacation.map((r) => r.id));
    const ids = active.map((r) => r.id).filter((id) => !away.has(id));
    const order = xlPriority(prior, ids);
    const slotsXl = xlDays.reduce((a, d) => a + d.requiredR1, 0);
    return { days: xlDays.map((d) => shortDateLabel(d.date)).join(', '), order: order.slice(0, Math.max(3, slotsXl + 1)) };
  }, [days, active, onVacation, prior]);

  return (
    <div>
      <PageHeader
        title="Generador de cronograma"
        subtitle="Generá opciones automáticas, editá cada guardia a mano, fijá las que no se tocan y marcá las que se sortean."
        actions={
          <>
            <MonthNav monthKey={monthKey} prev={prev} next={next} />
            <Link to="/admin" className={btnSecondary}>
              ← Admin
            </Link>
          </>
        }
      />

      {loading ? (
        <p className="text-text-dim text-sm">Cargando datos…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <RulesCard monthKey={monthKey} cfg={cfg} days={days} />
            <Card title="Pedidos del mes" subtitle={`${monthRequests.length} pedido(s) — los rechazados no se tienen en cuenta`}>
              {monthRequests.length === 0 ? (
                <p className="text-sm text-text-dim">No hay pedidos para este mes.</p>
              ) : (
                <ul className="text-sm flex flex-col gap-1 max-h-40 overflow-y-auto">
                  {monthRequests.map((r) => (
                    <li key={r.id} className={clsx('flex gap-2', r.status === 'rechazado' && 'line-through opacity-50')}>
                      <span>{r.type === 'bloqueo' ? '⛔' : requestIntent(r) === 'off' ? '🙅' : requestIntent(r) === 'on' ? '🙋' : '🌅'}</span>
                      <span className="font-medium">{requesterName(r, byId)}</span>
                      <span className="text-text-dim truncate">
                        {requestShiftDates(r).filter((d) => d.startsWith(monthKey)).map(shortDateLabel).join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Estado" subtitle={stateText(source, dirty)}>
              <div className="flex flex-wrap gap-2">
                <button onClick={runGenerator} disabled={generating || !!busy} className={btnPrimary}>
                  {generating ? 'Generando…' : '✨ Generar 3 opciones'}
                </button>
                <button onClick={onSave} disabled={!!busy || !dirty} className={btnSecondary}>
                  Guardar borrador
                </button>
                <button onClick={onPublish} disabled={!!busy} className={btnSecondary}>
                  Publicar
                </button>
                <button onClick={() => setImportOpen(true)} disabled={!!busy} className={btnSecondary}>
                  📋 Importar desde texto
                </button>
              </div>
              {importWarnings.length > 0 && (
                <ul className="mt-3 text-xs text-warn flex flex-col gap-1">
                  {importWarnings.map((w) => (
                    <li key={w}>⚠ {w}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-3 mt-3">
                {dirty && (
                  <button onClick={clearEdits} className="text-xs text-text-dim underline">
                    Descartar cambios sin guardar
                  </button>
                )}
                {monthShifts.length > 0 && (
                  <button onClick={() => setDraft(draftFromShifts(template, monthShifts))} className="text-xs text-text-dim underline">
                    Cargar lo publicado
                  </button>
                )}
                <button
                  onClick={() => setDraft(draft.map((s) => (s.locked || s.raffleId ? s : { ...s, residentId: null })))}
                  className="text-xs text-text-dim underline"
                >
                  Vaciar lo no fijado
                </button>
              </div>
              {busy && <p className="text-xs text-text-dim mt-2">{busy}</p>}
            </Card>
          </div>

          {monthOptions && (
            <div className="grid gap-4 md:grid-cols-3">
              {monthOptions.map((o) => (
                <OptionCard
                  key={o.profile}
                  option={o}
                  onUse={() => {
                    setDraft(o.slots);
                    setDetailView('editor');
                  }}
                  onDetail={() => {
                    setDetailView(o.profile);
                    document.getElementById('detalle-personas')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                />
              ))}
            </div>
          )}

          <Card
            title={`Editor — ${monthLabel(monthKey)}`}
            subtitle="Cambiar una guardia a mano la fija (🔒) para que regenerar no la toque. 🚫 = la toma otra persona (p. ej. residente mayor). ⛔ no puede · 🙅 pidió no estar · 🙋 pidió estar (o necesita el posguardia) · 🎂 cumple."
          >
            {xlRanking && (
              <p className="text-sm bg-accent-soft rounded-lg px-3 py-2 mb-3">
                🌟 Findes XL del mes: <b>{xlRanking.days}</b>. Van por turnos: primero quien todavía no tuvo (o tuvo
                menos); entre ellas, quien termina el mes con más carga (guardias, sábados/preferiados, feriados, findes,
                noches sin dormir). Los jueves felices, a quien tiene sábado en el mes. Los pedidos mandan.
                Finde XL, les toca a:{' '}
                {xlRanking.order.map((x, i) => (
                  <span key={x.residentId}>
                    {i > 0 && ' · '}
                    <b>{nameOf(x.residentId)}</b>
                    <span className="text-text-dim">
                      {' '}
                      ({x.xl === 0 ? 'ningún XL' : `${x.xl} XL`}, carga {x.burden >= 0 ? '+' : ''}
                      {x.burden.toFixed(1)})
                    </span>
                  </span>
                ))}
                .
              </p>
            )}
            {onVacation.length > 0 && (
              <p className="text-sm bg-warn-soft text-warn rounded-lg px-3 py-2 mb-3">
                🏖️ De vacaciones este mes (según los carriles): <b>{onVacation.map((r) => r.shortName).join(', ')}</b>. El
                generador no les asigna guardias
                {cfg.rules.maxPerPerson > 0 && <> — revisá el tope de {cfg.rules.maxPerPerson} por persona en las reglas del mes</>}.
              </p>
            )}
            <div className="md:overflow-x-auto md:-mx-1 md:px-1">
              {/* Celular: lista de días; compu: grilla semanal. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-1.5 md:min-w-[880px]">
                {WEEKDAY_KEYS.map((_, i) => (
                  <div key={i} className="hidden md:block text-center text-xs text-text-dim font-medium py-1">
                    {WEEKDAY_SHORT[i as 0]}
                  </div>
                ))}
                {Array.from({ length: leading }, (_, i) => (
                  <div key={`e${i}`} className="hidden md:block" />
                ))}
                {days.map((day) => (
                  <DayCell
                    key={day.id}
                    day={day}
                    slots={slotsByDate.get(day.date) ?? []}
                    info={dayInfo.get(day.date)!}
                    residents={active}
                    byId={byId}
                    color={color}
                    issueBySlot={issueBySlot}
                    raffles={raffles}
                    onChange={(key, residentId) => updateSlot(key, { residentId, locked: true })}
                    onToggleLock={(key, locked) => updateSlot(key, { locked })}
                    onRaffle={setRaffleSlot}
                    onDraw={(r) => withBusy('Sorteando…', async () => void (await drawRaffle(r, me!.id, nameOf)))}
                    onDisable={(slotIndex) => {
                      const note = prompt('Esta guardia no la hace un R1. ¿Quién la toma?', DEFAULT_DISABLED_NOTE);
                      if (note !== null) withBusy('Guardando…', () => disableSlot(day, slotIndex, note.trim() || DEFAULT_DISABLED_NOTE));
                    }}
                    onEnable={(slotIndex) => withBusy('Guardando…', () => enableSlot(day, slotIndex))}
                  />
                ))}
              </div>
            </div>
          </Card>

          <div id="detalle-personas" />
          <Card
            title="Detalle por persona"
            subtitle="Fechas con su día, días entre guardias (↩ = desde la última del mes anterior), reparto por día de semana y findes libres."
            action={
              monthOptions ? (
                <Segmented
                  value={monthOptions.some((o) => o.profile === detailView) ? detailView : 'editor'}
                  onChange={setDetailView}
                  options={[
                    { value: 'editor', label: 'Editor' },
                    ...monthOptions.map((o) => ({ value: o.profile, label: o.label.replace('Máximo ', '').replace('Máxima ', '') })),
                  ]}
                />
              ) : undefined
            }
          >
            <PersonBreakdownGrid
              data={breakdown}
              residents={active}
              color={color}
              minGapHard={cfg.rules.minGapHard}
              minGapIdeal={cfg.rules.minGapIdeal}
            />
          </Card>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card title="Cómo queda el reparto" subtitle="Mes + acumulado histórico (lo que ya pasó cuenta para compensar)" className="lg:col-span-3">
              <StatsTable evaluation={evaluation} residents={active} color={color} />
            </Card>
            <Card
              title="Problemas a revisar"
              subtitle={`${evaluation.summary.hardCount} duro(s) · ${evaluation.summary.softCount} a revisar`}
              className="lg:col-span-2"
            >
              {isEmpty ? (
                <p className="text-sm text-text-dim">
                  Todavía no hay nada asignado. Tocá ✨ Generar 3 opciones, importá desde texto o completá el editor a mano.
                </p>
              ) : (
                <IssuesList issues={evaluation.issues} showAll={showAllIssues} onShowAll={() => setShowAllIssues(true)} />
              )}
              {evaluation.requests.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border">
                  <p className="text-xs font-medium text-text-dim mb-1.5">Pedidos</p>
                  <ul className="text-sm flex flex-col gap-1">
                    {evaluation.requests.map((o) => (
                      <li key={o.request.id} className="flex gap-2">
                        <span>{o.satisfied ? '✅' : '❌'}</span>
                        <span>
                          {byId.get(o.request.residentId)?.shortName}:{' '}
                          {requestIntent(o.request) === 'off' ? 'no estar ' : 'estar '}
                          {requestShiftDates(o.request).filter((d) => d.startsWith(monthKey)).map(shortDateLabel).join(' / ')}
                          {requestIntent(o.request) === 'posguardia' && ' (por posguardia)'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      <ImportTextModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        monthKey={monthKey}
        residents={active}
        draft={draft}
        onApply={(slots, warnings) => {
          setDraft(slots);
          setImportWarnings(warnings);
        }}
      />

      <RaffleSlotModal
        slot={raffleSlot}
        onClose={() => setRaffleSlot(null)}
        residents={active}
        blocked={raffleSlot ? (dayInfo.get(raffleSlot.date)?.blocked ?? new Set()) : new Set()}
        onCreate={(participants, title) =>
          withBusy('Creando sorteo…', async () => {
            const slot = raffleSlot!;
            const id = await createRaffle({
              title,
              description: `Guardia del ${shortDateLabel(slot.date)}${slot.slotIndex ? ` (R1 #${slot.slotIndex + 1})` : ''}`,
              participantIds: participants,
              winnersCount: 1,
              linkedSlot: { date: slot.date, slotIndex: slot.slotIndex },
              createdBy: me!.id,
            });
            const key = slotKey(slot.date, slot.slotIndex);
            const next = draft.map((s) =>
              slotKey(s.date, s.slotIndex) === key ? { ...s, raffleId: id, residentId: null, locked: false } : s,
            );
            await saveDraft(monthKey, next, me!.id);
            clearEdits();
            setRaffleSlot(null);
          })
        }
        onRemove={(slot) =>
          withBusy('Quitando sorteo…', async () => {
            const r = raffles.find((x) => x.id === slot.raffleId);
            if (r?.status === 'pendiente') {
              await deleteDoc(doc(db, 'raffles', r.id));
              await logActivity({ entity: 'sorteo', summary: `Quitó el sorteo de la guardia del ${shortDateLabel(slot.date)}` });
            }
            const key = slotKey(slot.date, slot.slotIndex);
            const next = draft.map((s) => {
              if (slotKey(s.date, s.slotIndex) !== key) return s;
              const { raffleId: _omit, ...rest } = s;
              void _omit;
              return { ...rest, residentId: null, locked: false };
            });
            await saveDraft(monthKey, next, me!.id);
            clearEdits();
            setRaffleSlot(null);
          })
        }
      />
    </div>
  );
}

function stateText(source: 'borrador' | 'publicado' | 'vacío', dirty: boolean) {
  const base =
    source === 'borrador'
      ? 'Hay un borrador guardado (no publicado).'
      : source === 'publicado'
        ? 'Mostrando el cronograma publicado.'
        : 'Todavía no hay nada armado para este mes.';
  return dirty ? `${base} Tenés cambios sin guardar.` : base;
}

function RulesCard({
  monthKey,
  cfg,
  days,
}: {
  monthKey: string;
  cfg: ReturnType<typeof effectiveMonthConfig>;
  days: ResolvedDay[];
}) {
  const { resident: me } = useAuthContext();
  const privateNote = usePrivateNotes(me?.id).find((n) => n.month === monthKey)?.text;
  const r = cfg.rules;
  const holidays = days.filter((d) => d.isHoliday);
  const special = days.filter((d) => d.notes || d.tags.includes('sin_cobertura'));
  return (
    <Card
      title="Reglas del mes"
      subtitle={cfg.inheritedFrom ? `Heredadas de ${monthLabel(cfg.inheritedFrom)}` : cfg.hasOwnConfig ? 'Propias de este mes' : 'Valores por defecto'}
      action={
        <Link to={`/admin?tab=reglas&mes=${monthKey}`} className="text-xs text-accent underline">
          Editar
        </Link>
      }
    >
      <div className="text-sm flex flex-col gap-1.5">
        <p>
          <span className="text-text-dim">R1 por día: </span>
          {WEEKDAY_KEYS.map((k, i) => `${WEEKDAY_SHORT[i as 0]} ${cfg.weekdayRequirements[k]}`).join(' · ')}
        </p>
        <p>
          <span className="text-text-dim">Distancia: </span>≤{r.minGapHard} días prohibido · ideal ≥{r.minGapIdeal}
          {r.maxPerPerson > 0 && <> · tope {r.maxPerPerson}/persona</>}
        </p>
        <p className="text-text-dim text-xs">
          {[
            r.avoidSameWeekday && 'no repetir día de semana',
            r.avoidDoubleSatPref && 'máx. 1 sáb/preferiado',
            r.sabadoComunConJueves && 'sábado → jueves feliz',
            r.juevesLibraFinde && 'jueves → finde libre hasta el día hábil',
            'sin guardia el cumple ni el día anterior',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {holidays.length > 0 && (
          <p>
            <span className="text-text-dim">Feriados: </span>
            {holidays.map((h) => `${Number(h.date.slice(8))}${h.holidayName ? ` (${h.holidayName})` : ''}`).join(', ')}
          </p>
        )}
        {special.length > 0 && (
          <p>
            <span className="text-text-dim">Días especiales: </span>
            {special.map((d) => `${Number(d.date.slice(8))}${d.notes ? `: ${d.notes}` : ' sin R1'}`).join(' · ')}
          </p>
        )}
        {cfg.notes && <p className="whitespace-pre-wrap bg-surface-2 rounded-lg p-2 text-xs">{cfg.notes}</p>}
        {privateNote && <p className="whitespace-pre-wrap bg-accent-soft rounded-lg p-2 text-xs">🔒 {privateNote}</p>}
      </div>
    </Card>
  );
}

function OptionCard({ option, onUse, onDetail }: { option: GeneratedOption; onUse: () => void; onDetail: () => void }) {
  const s = option.evaluation.summary;
  return (
    <Card title={option.label} subtitle={option.description}>
      <dl className="text-sm grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-text-dim">Dif. máx. en el mes</dt>
        <dd className="text-right tabular-nums">{s.maxDiff}</dd>
        <dt className="text-text-dim">Pedidos fuertes</dt>
        <dd className="text-right tabular-nums">{s.strongTotal ? `${s.strongOk}/${s.strongTotal}` : '—'}</dd>
        <dt className="text-text-dim">Preferencias</dt>
        <dd className="text-right tabular-nums">{s.softTotal ? `${s.softOk}/${s.softTotal}` : '—'}</dd>
        <dt className="text-text-dim">Distancia mín · prom.</dt>
        <dd className="text-right tabular-nums">
          {s.minGap ?? '—'} · {s.avgGap?.toFixed(1) ?? '—'}
        </dd>
        <dt className="text-text-dim">Problemas</dt>
        <dd className="text-right">
          {s.hardCount > 0 ? <Badge tone="critical">{s.hardCount} duros</Badge> : <Badge tone="good">0 duros</Badge>}{' '}
          <span className="text-text-dim text-xs">{s.softCount} a revisar</span>
        </dd>
      </dl>
      <button onClick={onUse} className={clsx(btnPrimary, 'w-full mt-4')}>
        Usar esta opción
      </button>
      <button onClick={onDetail} className="w-full mt-2 text-xs text-accent underline">
        Ver detalle por persona
      </button>
    </Card>
  );
}

function DayCell({
  day,
  slots,
  info,
  residents,
  byId,
  color,
  issueBySlot,
  raffles,
  onChange,
  onToggleLock,
  onRaffle,
  onDraw,
  onDisable,
  onEnable,
}: {
  day: ResolvedDay;
  slots: DraftSlot[];
  info: { blocked: Set<string>; off: Set<string>; on: Set<string>; ext: string[]; bdays: string[] };
  residents: { id: string; shortName: string }[];
  byId: Map<string, { shortName: string }>;
  color: (id: string | null) => string;
  issueBySlot: Map<string, 'hard' | 'soft'>;
  raffles: Raffle[];
  onChange: (key: string, residentId: string | null) => void;
  onToggleLock: (key: string, locked: boolean) => void;
  onRaffle: (slot: DraftSlot) => void;
  onDraw: (r: Raffle) => void;
  onDisable: (slotIndex: number) => void;
  onEnable: (slotIndex: number) => void;
}) {
  const names = (ids: Set<string>) => [...ids].map((id) => byId.get(id)?.shortName).filter(Boolean).join(', ');
  const emojis = day.tags.map((t) => TAG_EMOJI[t]).filter(Boolean).join('');
  return (
    <div className={clsx('border border-border rounded-xl p-2 md:p-1.5 flex flex-col gap-1 md:min-h-[96px]', dayBgClass(day))}>
      <div className="flex items-center justify-between text-sm md:text-xs">
        <span className="font-semibold">
          <span className="md:hidden capitalize font-normal text-text-dim">{WEEKDAY_SHORT[day.weekday]} </span>
          {Number(day.date.slice(8))}
        </span>
        <span title={day.holidayName ?? ''}>{emojis}</span>
      </div>
      {info.bdays.length > 0 && <p className="text-[10px]">🎂 {info.bdays.join(', ')}</p>}
      {slots.map((s) => {
        const key = slotKey(s.date, s.slotIndex);
        const issue = issueBySlot.get(key);
        const raffle = s.raffleId ? raffles.find((r) => r.id === s.raffleId) : undefined;
        if (s.raffleId) {
          return (
            <div key={key} className="rounded-lg border border-accent/40 bg-accent-soft px-1.5 py-1 text-[11px] flex flex-col gap-0.5">
              <span className="text-accent font-medium">🎲 Sorteo</span>
              {raffle?.status === 'sorteado' ? (
                <span className="font-medium">Ganó {byId.get(winners(raffle)[0] ?? '')?.shortName}</span>
              ) : (
                <div className="flex gap-1.5">
                  {raffle && (
                    <button onClick={() => onDraw(raffle)} className="underline text-accent">
                      Sortear
                    </button>
                  )}
                  <button onClick={() => onRaffle(s)} className="underline text-text-dim">
                    Editar
                  </button>
                </div>
              )}
            </div>
          );
        }
        return (
          <div
            key={key}
            className={clsx(
              'rounded-lg border bg-surface flex items-center gap-1 pl-1',
              issue === 'hard' ? 'border-danger ring-1 ring-danger' : issue === 'soft' ? 'border-warn' : 'border-border',
            )}
          >
            <Dot color={color(s.residentId)} />
            <select
              value={s.residentId ?? ''}
              onChange={(e) => onChange(key, e.target.value || null)}
              className="flex-1 min-w-0 bg-transparent text-sm md:text-[11px] py-1.5 md:py-1 outline-none"
              aria-label={`Guardia ${s.date}`}
            >
              <option value="">— libre —</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.shortName}
                  {info.blocked.has(r.id) ? ' ⛔' : info.off.has(r.id) ? ' 🙅' : info.on.has(r.id) ? ' 🙋' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => onToggleLock(key, !s.locked)}
              className={clsx('text-base md:text-[11px] px-1 md:px-0.5', s.locked ? 'opacity-100' : 'opacity-30 hover:opacity-70')}
              title={s.locked ? 'Fijada: regenerar no la cambia' : 'Fijar'}
            >
              🔒
            </button>
            <button onClick={() => onRaffle(s)} className="text-base md:text-[11px] px-1 md:px-0 opacity-30 hover:opacity-80" title="Sortear esta guardia">
              🎲
            </button>
            <button
              onClick={() => onDisable(s.slotIndex)}
              className="text-base md:text-[11px] px-1 md:pl-0 opacity-30 hover:opacity-80"
              title="Deshabilitar: la toma otra persona (residente mayor)"
            >
              🚫
            </button>
          </div>
        );
      })}
      {(day.disabledSlots ?? []).map((i) => (
        <div key={`d${i}`} className="rounded-lg border border-dashed border-border px-1.5 py-1 text-[10px] text-text-dim flex items-center justify-between gap-1">
          <span className="truncate" title={day.disabledNote ?? ''}>
            🚫 {day.disabledNote || 'Otra persona'}
          </span>
          <button onClick={() => onEnable(i)} className="underline shrink-0" title="Volver a habilitar para R1">
            ↺
          </button>
        </div>
      ))}
      {(info.blocked.size > 0 || info.off.size > 0 || info.on.size > 0 || info.ext.length > 0) && (
        <div className="text-[10px] text-text-dim leading-tight mt-auto">
          {info.ext.length > 0 && <p title="Pedido de alguien de afuera: si se acepta, deshabilitá la guardia (🚫)">🧑‍⚕️ {info.ext.join(', ')} la pide</p>}
          {info.blocked.size > 0 && <p>⛔ {names(info.blocked)}</p>}
          {info.off.size > 0 && <p>🙅 {names(info.off)}</p>}
          {info.on.size > 0 && <p>🙋 {names(info.on)}</p>}
        </div>
      )}
    </div>
  );
}

function StatsTable({
  evaluation,
  residents,
  color,
}: {
  evaluation: ReturnType<typeof evaluateDraft>;
  residents: { id: string; shortName: string }[];
  color: (id: string) => string;
}) {
  const cols: { label: string; get: (s: (typeof evaluation.stats)[string]) => string | number; title?: string }[] = [
    { label: 'Mes', get: (s) => s.count },
    { label: 'Sáb+Pref', get: (s) => s.sabPref },
    { label: 'Vie', get: (s) => s.viernes },
    { label: 'Dom', get: (s) => s.domingos },
    { label: 'Fer', get: (s) => s.feriados },
    { label: 'XL', get: (s) => s.xl },
    { label: 'J. feliz', get: (s) => s.juevesFelices },
    { label: 'Dist. mín', get: (s) => s.minGap ?? '—' },
    { label: 'Acum.', get: (s) => s.cumTotal, title: 'Total acumulado contando este mes' },
    { label: 'Acum. S+P', get: (s) => s.cumSabPref, title: 'Sábados + preferiados acumulados' },
    { label: 'Disp.', get: (s) => s.availableSlots, title: 'Guardias del mes en las que puede estar' },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[620px]">
        <thead>
          <tr className="text-text-dim text-xs border-b border-border">
            <th className="text-left font-medium py-1.5">R1</th>
            {cols.map((c) => (
              <th key={c.label} className="text-right font-medium py-1.5 px-1" title={c.title}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {residents.map((r) => {
            const s = evaluation.stats[r.id];
            if (!s) return null;
            return (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="py-1.5">
                  <span className="flex items-center gap-1.5">
                    <Dot color={color(r.id)} />
                    {r.shortName}
                  </span>
                </td>
                {cols.map((c) => (
                  <td key={c.label} className="text-right tabular-nums px-1">
                    {c.get(s)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IssuesList({ issues, showAll, onShowAll }: { issues: Issue[]; showAll: boolean; onShowAll: () => void }) {
  if (issues.length === 0) return <p className="text-sm text-ok">✓ Sin problemas: cumple todas las reglas.</p>;
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'hard' ? -1 : 1));
  const shown = showAll ? sorted : sorted.slice(0, 8);
  return (
    <ul className="text-sm flex flex-col gap-1.5">
      {shown.map((i, n) => (
        <li key={n} className="flex gap-2">
          <span>{i.severity === 'hard' ? '🔴' : '🟡'}</span>
          <span>{i.message}</span>
        </li>
      ))}
      {!showAll && sorted.length > shown.length && (
        <li>
          <button onClick={onShowAll} className="text-xs text-accent underline">
            Ver los {sorted.length} problemas
          </button>
        </li>
      )}
    </ul>
  );
}

function RaffleSlotModal({
  slot,
  onClose,
  residents,
  blocked,
  onCreate,
  onRemove,
}: {
  slot: DraftSlot | null;
  onClose: () => void;
  residents: { id: string; shortName: string }[];
  blocked: Set<string>;
  onCreate: (participants: string[], title: string) => void;
  onRemove: (slot: DraftSlot) => void;
}) {
  const [selected, setSelected] = useState<string[] | null>(null);
  const [title, setTitle] = useState('');
  if (!slot) return null;
  const defaults = residents.filter((r) => !blocked.has(r.id)).map((r) => r.id);
  const chosen = selected ?? defaults;
  const close = () => {
    setSelected(null);
    setTitle('');
    onClose();
  };
  return (
    <Modal open onClose={close} title={`🎲 Sortear la guardia del ${shortDateLabel(slot.date)}`}>
      {slot.raffleId ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-dim">Esta guardia ya está marcada para sorteo (pendiente).</p>
          <button
            onClick={() => {
              onRemove(slot);
              close();
            }}
            className={btnSecondary}
          >
            Quitar el sorteo
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="text-sm text-text-dim flex flex-col gap-1">
            Nombre del sorteo
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Guardia ${shortDateLabel(slot.date)}`}
              className={inputCls}
            />
          </label>
          <p className="text-sm text-text-dim">Entre quiénes se sortea (⛔ = no puede ese día):</p>
          <div className="flex flex-wrap gap-2">
            {residents.map((r) => {
              const on = chosen.includes(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => setSelected(on ? chosen.filter((x) => x !== r.id) : [...chosen, r.id])}
                  className={clsx(
                    'px-3 py-1.5 rounded-full border text-sm',
                    on ? 'bg-accent-soft border-accent text-accent' : 'border-border text-text-dim',
                  )}
                >
                  {r.shortName}
                  {blocked.has(r.id) ? ' ⛔' : ''}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-text-dim">
            Queda guardado como sorteo pendiente: se puede sortear desde acá o desde la sección Sorteos. El
            resultado es definitivo y lo ve todo el grupo.
          </p>
          <button
            disabled={chosen.length < 2}
            onClick={() => {
              onCreate(chosen, title.trim() || `Guardia ${shortDateLabel(slot.date)}`);
              setSelected(null);
              setTitle('');
            }}
            className={btnPrimary}
          >
            Marcar para sorteo
          </button>
        </div>
      )}
    </Modal>
  );
}

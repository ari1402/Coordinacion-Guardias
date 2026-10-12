import clsx from 'clsx';
import { deleteDoc, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Badge from '../components/Badge';
import { Card, Dot, Empty, Modal, MonthNav, PageHeader, Segmented, btnPrimary, btnSecondary, inputBase, inputCls } from '../components/ui';
import { downloadAllJson, downloadAllXlsx, fetchAll } from '../lib/exportAll';
import { db } from '../firebase';
import { useAcks, useActivity, useCalendarData, useFeedback, usePublications, usePushTokens, useResidents, useResidentsById } from '../hooks/data';
import { AckAlerts } from '../components/Conformidad';
import { PrivateNotesEditor } from '../components/PrivateNotes';
import { useAuthContext } from '../context/AuthContext';
import { useColors } from '../hooks/useColors';
import { currentMonthKey } from '../hooks/useMonth';
import { effectiveMonthConfig, isoWeekday, monthLabel, resolveMonth, shiftMonthKey, shortDateLabel } from '../lib/dates';
import { diffFields, logActivity, type ActivityEntity } from '../lib/activity';
import { fetchOfficialHolidays } from '../lib/holidays';
import { TAG_EMOJI } from '../lib/labels';
import type { CalendarDay, MonthConfig, MonthRules, Resident, Role, WeekdayRequirements } from '../types';
import { WEEKDAY_KEYS, WEEKDAY_LABELS } from '../types';

type Tab = 'reglas' | 'residentes' | 'conformidad' | 'feedback' | 'historial';

const RULE_LABELS: Record<string, string> = {
  mon: 'R1 lunes',
  tue: 'R1 martes',
  wed: 'R1 miércoles',
  thu: 'R1 jueves',
  fri: 'R1 viernes',
  sat: 'R1 sábado',
  sun: 'R1 domingo',
  minGapHard: 'Distancia prohibida',
  minGapIdeal: 'Distancia ideal',
  maxPerPerson: 'Tope por persona',
  avoidSameWeekday: 'No repetir día de semana',
  avoidDoubleSatPref: 'Máx. un sáb/preferiado',
  sabadoComunConJueves: 'Sábado → jueves feliz',
  juevesLibraFinde: 'Jueves libera el finde',
  notes: 'Acuerdos del mes',
};

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'reglas';
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Admin"
        subtitle="Solo Bea Bravo y Ana Alba ven esta sección."
        actions={
          <>
            <Segmented<Tab>
              value={tab}
              onChange={(t) => setParams({ tab: t })}
              options={[
                { value: 'reglas', label: '📐 Reglas del mes' },
                { value: 'residentes', label: '👥 Residentes' },
                { value: 'conformidad', label: '👍 Conformidad' },
                { value: 'feedback', label: '💬 Feedback' },
                { value: 'historial', label: '🕓 Historial' },
              ]}
            />
            <ExportAllButton />
            <Link to="/admin/generador" className={btnPrimary}>
              ✨ Generador
            </Link>
          </>
        }
      />
      {tab === 'reglas' && <Reglas initialMonth={params.get('mes') ?? shiftMonthKey(currentMonthKey(), 1)} />}
      {tab === 'residentes' && <Residentes />}
      {tab === 'conformidad' && <Conformidad />}
      {tab === 'feedback' && <FeedbackAdmin />}
      {tab === 'historial' && <Historial />}
    </div>
  );
}

// ---------------------------------------------------------------- Reglas

function Reglas({ initialMonth }: { initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const { storedDays, monthConfigs, loading } = useCalendarData();
  if (loading) return <Empty>Cargando…</Empty>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <MonthNav monthKey={month} prev={() => setMonth(shiftMonthKey(month, -1))} next={() => setMonth(shiftMonthKey(month, 1))} />
        <Link to="/admin/generador" className="text-sm text-accent underline">
          Ir a generar {monthLabel(month)} →
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <RulesForm key={`${month}-${monthConfigs.find((c) => c.id === month) ? 'own' : 'inh'}`} month={month} configs={monthConfigs} />
          <HolidayImport defaultYear={Number(month.slice(0, 4))} />
        </div>
        <DaysEditor month={month} storedDays={storedDays} configs={monthConfigs} />
      </div>
    </div>
  );
}

function RulesForm({ month, configs }: { month: string; configs: MonthConfig[] }) {
  const eff = effectiveMonthConfig(month, configs);
  const [reqs, setReqs] = useState<WeekdayRequirements>(eff.weekdayRequirements);
  const [rules, setRules] = useState<MonthRules>(eff.rules);
  const [notes, setNotes] = useState(eff.notes);
  const [saved, setSaved] = useState(false);

  async function save() {
    await setDoc(doc(db, 'monthConfigs', month), { id: month, weekdayRequirements: reqs, rules, notes });
    const before = { ...eff.weekdayRequirements, ...eff.rules, notes: eff.notes } as Record<string, unknown>;
    const after = { ...reqs, ...rules, notes } as Record<string, unknown>;
    await logActivity({
      entity: 'reglas',
      summary: `Guardó las reglas de ${monthLabel(month)}`,
      changes: diffFields(before, after, RULE_LABELS),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const num = (k: keyof MonthRules, label: string, hint: string) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>
        {label}
        <span className="block text-xs text-text-dim">{hint}</span>
      </span>
      <input
        type="number"
        min={0}
        value={rules[k] as number}
        onChange={(e) => setRules({ ...rules, [k]: Number(e.target.value) })}
        className="w-20 shrink-0 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-center text-text outline-none focus:border-accent"
      />
    </label>
  );
  const toggle = (k: keyof MonthRules, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={rules[k] as boolean} onChange={(e) => setRules({ ...rules, [k]: e.target.checked })} />
      {label}
    </label>
  );

  return (
    <Card
      title={`Reglas de ${monthLabel(month)}`}
      subtitle={
        eff.hasOwnConfig
          ? 'Este mes tiene reglas propias. Los meses siguientes sin reglas las heredan.'
          : eff.inheritedFrom
            ? `Ahora hereda de ${monthLabel(eff.inheritedFrom)}. Si guardás, quedan propias de este mes (y las heredan los siguientes).`
            : 'Valores por defecto.'
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium mb-2">R1 por guardia según el día</p>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAY_KEYS.map((k, i) => (
              <label key={k} className="flex flex-col items-center gap-1 text-xs text-text-dim">
                {WEEKDAY_LABELS[i as 0].slice(0, 3)}
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={reqs[k]}
                  onChange={(e) => setReqs({ ...reqs, [k]: Number(e.target.value) })}
                  className="w-full rounded-lg border border-border bg-surface-2 px-1 py-1.5 text-center text-sm text-text"
                />
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {num('minGapHard', 'Distancia prohibida', 'guardias separadas por ≤ N días no se permiten')}
          {num('minGapIdeal', 'Distancia ideal', 'a partir de N días está bien')}
          {num('maxPerPerson', 'Tope por persona', '0 = sin tope')}
          {toggle('avoidSameWeekday', 'Evitar repetir el mismo día de la semana')}
          {toggle('avoidDoubleSatPref', 'Máximo un sábado/preferiado por persona')}
          {toggle('sabadoComunConJueves', 'Quien tenga un sábado, que tenga un jueves feliz')}
          {toggle('juevesLibraFinde', 'Guardia de jueves → ese finde libre hasta el primer día hábil')}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Acuerdos del mes para el grupo
          <span className="text-xs text-text-dim">Los ve todo el grupo en el calendario. Para algo solo tuyo, usá las notas privadas de abajo.</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={clsx(inputCls, 'resize-y')} placeholder="Ej.: martes 3 sin R1; Gil compensa sáb/preferiado de octubre…" />
        </label>
        <div className="flex gap-2 items-center">
          <button onClick={save} className={btnPrimary}>
            Guardar reglas
          </button>
          {eff.hasOwnConfig && (
            <button
              onClick={async () => {
                if (!confirm('¿Borrar las reglas propias? El mes vuelve a heredar del anterior.')) return;
                await deleteDoc(doc(db, 'monthConfigs', month));
                await logActivity({ entity: 'reglas', summary: `${monthLabel(month)} volvió a heredar las reglas del mes anterior` });
              }}
              className={btnSecondary}
            >
              Volver a heredar
            </button>
          )}
          {saved && <span className="text-sm text-ok">Guardado ✓</span>}
        </div>
        <div className="border-t border-border pt-4">
          <PrivateNotesEditor month={month} />
        </div>
      </div>
    </Card>
  );
}

function HolidayImport({ defaultYear }: { defaultYear: number }) {
  const [year, setYear] = useState(defaultYear);
  const [puentes, setPuentes] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setStatus(null);
    try {
      const list = await fetchOfficialHolidays(year, puentes);
      const batch = writeBatch(db);
      for (const h of list) {
        batch.set(
          doc(db, 'calendarDays', h.date),
          {
            id: h.date,
            date: h.date,
            isHoliday: true,
            holidayName: h.name,
            holidaySource: h.kind === 'sanidad' || h.kind === 'local' ? h.kind : 'oficial',
          },
          { merge: true },
        );
      }
      logActivity({ entity: 'calendario', summary: `Importó ${list.length} feriados de ${year}` }, batch);
      await batch.commit();
      setStatus(`✓ ${list.length} feriados de ${year} cargados (incluye Sanidad, 24/12 y 31/12).`);
    } catch (e) {
      setStatus(`No se pudo traer la lista oficial (${(e as Error).message}). Podés cargar los feriados a mano en la tabla.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="🇦🇷 Feriados oficiales" subtitle="Calendario del Ministerio del Interior (vía ArgentinaDatos) + los del hospital: Sanidad (21/9), 24/12 y 31/12. Se sincronizan solos en cada publicación; acá se pueden forzar.">
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2 items-center">
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-accent" />
          <button onClick={run} disabled={busy} className={btnPrimary}>
            {busy ? 'Importando…' : 'Importar'}
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-dim">
          <input type="checkbox" checked={puentes} onChange={(e) => setPuentes(e.target.checked)} />
          Incluir días no laborables con fines turísticos (puentes)
        </label>
        {status && <p className="text-sm">{status}</p>}
        <p className="text-xs text-text-dim">Se puede volver a importar sin duplicar. Lo que no aplique al hospital se destilda en la tabla.</p>
      </div>
    </Card>
  );
}

function DaysEditor({ month, storedDays, configs }: { month: string; storedDays: CalendarDay[]; configs: MonthConfig[] }) {
  const days = useMemo(() => resolveMonth(month, storedDays, configs), [month, storedDays, configs]);
  const byId = new Map(storedDays.map((d) => [d.id, d]));
  const eff = effectiveMonthConfig(month, configs);

  const save = async (date: string, patch: Partial<CalendarDay>) => {
    const before = byId.get(date) ?? {};
    await setDoc(doc(db, 'calendarDays', date), { id: date, date, isHoliday: byId.get(date)?.isHoliday ?? false, ...patch }, { merge: true });
    await logActivity({
      entity: 'calendario',
      summary: `Editó el ${shortDateLabel(date)}`,
      changes: diffFields(before as Record<string, unknown>, { ...before, ...patch } as Record<string, unknown>, {
        isHoliday: 'Feriado',
        holidayName: 'Nombre',
        requiredR1Override: 'R1',
        notes: 'Nota',
      }),
    });
  };

  return (
    <Card title={`Días de ${monthLabel(month)}`} subtitle="Feriados, cobertura especial (ej. martes sin R1) y notas por día." className="lg:col-span-3">
      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-left text-xs text-text-dim border-b border-border">
              <th className="py-2 pr-2 font-medium">Día</th>
              <th className="py-2 pr-2 font-medium">Feriado</th>
              <th className="py-2 pr-2 font-medium">Nombre</th>
              <th className="py-2 pr-2 font-medium" title="Vacío = lo que dice la regla del día de semana">R1</th>
              <th className="py-2 font-medium">Nota</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const raw = byId.get(d.date);
              const def = eff.weekdayRequirements[WEEKDAY_KEYS[isoWeekday(d.date)]];
              return (
                <tr key={d.date} className={clsx('border-b border-border last:border-0', d.weekday >= 5 && 'bg-surface-2/50')}>
                  <td className="py-1.5 pr-2 whitespace-nowrap capitalize">
                    {shortDateLabel(d.date)} <span>{d.tags.map((t) => TAG_EMOJI[t]).filter(Boolean).join('')}</span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input type="checkbox" checked={d.isHoliday} onChange={(e) => save(d.date, { isHoliday: e.target.checked, holidaySource: 'manual' })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      key={`n${raw?.holidayName}`}
                      defaultValue={raw?.holidayName ?? ''}
                      onBlur={(e) => e.target.value !== (raw?.holidayName ?? '') && save(d.date, { holidayName: e.target.value })}
                      className="w-36 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      key={`r${raw?.requiredR1Override}`}
                      type="number"
                      min={0}
                      max={5}
                      defaultValue={raw?.requiredR1Override ?? ''}
                      placeholder={String(def)}
                      onBlur={(e) => save(d.date, { requiredR1Override: e.target.value === '' ? null : Number(e.target.value) })}
                      className="w-14 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-center"
                    />
                  </td>
                  <td className="py-1.5">
                    <input
                      key={`o${raw?.notes}`}
                      defaultValue={raw?.notes ?? ''}
                      onBlur={(e) => e.target.value !== (raw?.notes ?? '') && save(d.date, { notes: e.target.value })}
                      className="w-full min-w-[120px] rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Residentes

function Residentes() {
  const { residents, loading } = useResidents();
  const color = useColors(residents);
  if (loading) return <Empty>Cargando…</Empty>;
  return (
    <Card title="Residentes" subtitle="El cumpleaños bloquea la guardia de ese día y la del día anterior. Para sumar a alguien nuevo: crear el usuario en Firebase Authentication y su doc en residents/{uid}.">
      <ul className="flex flex-col divide-y divide-border">
        {residents.map((r) => (
          <ResidentRow key={r.id} resident={r} color={color(r.id)} />
        ))}
      </ul>
    </Card>
  );
}

function ResidentRow({ resident, color }: { resident: Resident; color: string }) {
  const [name, setName] = useState(resident.name);
  const [shortName, setShortName] = useState(resident.shortName);
  const [bday, setBday] = useState(resident.birthday ? `${resident.birthday.slice(3)}/${resident.birthday.slice(0, 2)}` : '');
  const [role, setRole] = useState<Role>(resident.role);
  const [active, setActive] = useState(resident.active);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    let birthday: string | null = null;
    if (bday.trim()) {
      const m = bday.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
      if (!m || Number(m[1]) > 31 || Number(m[2]) > 12) {
        setError('Cumple en formato DD/MM');
        return;
      }
      birthday = `${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    await updateDoc(doc(db, 'residents', resident.id), { name, shortName, role, active, birthday });
    await logActivity({
      entity: 'residente',
      summary: `Editó el perfil de ${resident.shortName}`,
      changes: diffFields(resident as unknown as Record<string, unknown>, { name, shortName, role, active, birthday }, {
        name: 'Nombre',
        shortName: 'Corto',
        role: 'Rol',
        active: 'Activa',
        birthday: 'Cumple (MM-DD)',
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <li className="py-3 flex flex-wrap items-end gap-2">
      <span className="self-center">
        <Dot color={color} />
      </span>
      <label className="text-xs text-text-dim flex flex-col gap-1">
        Nombre
        <input value={name} onChange={(e) => setName(e.target.value)} className={clsx(inputBase, 'w-48')} />
      </label>
      <label className="text-xs text-text-dim flex flex-col gap-1">
        Corto
        <input value={shortName} onChange={(e) => setShortName(e.target.value)} className={clsx(inputBase, 'w-28')} />
      </label>
      <label className="text-xs text-text-dim flex flex-col gap-1">
        Cumple (DD/MM)
        <input value={bday} onChange={(e) => setBday(e.target.value)} placeholder="14/02" className={clsx(inputBase, 'w-24')} />
      </label>
      <label className="text-xs text-text-dim flex flex-col gap-1">
        Rol
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={clsx(inputBase, 'w-28')}>
          <option value="resident">residente</option>
          <option value="admin">admin</option>
        </select>
      </label>
      <label className="text-xs text-text-dim flex items-center gap-1.5 pb-2.5">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> activa
      </label>
      <button onClick={save} className={btnSecondary}>
        Guardar
      </button>
      <span className="text-xs text-text-dim pb-2.5">{resident.email}</span>
      {saved && <span className="text-sm text-ok pb-2">✓</span>}
      {error && <span className="text-sm text-danger pb-2">{error}</span>}
    </li>
  );
}

// ---------------------------------------------------------------- Feedback

function FeedbackAdmin() {
  const { residents } = useResidents();
  const byId = useResidentsById(residents);
  const color = useColors(residents);
  const { feedback, loading } = useFeedback();
  const pushTokens = usePushTokens(true);

  const perWeekday = WEEKDAY_KEYS.map((_, wd) => {
    const list = feedback.filter((f) => isoWeekday(f.date) === wd && typeof f.carga === 'number');
    return {
      wd,
      n: list.length,
      avg: list.length ? list.reduce((a, f) => a + (f.carga ?? 0), 0) / list.length : null,
      noSleep: feedback.filter((f) => isoWeekday(f.date) === wd && !f.slept).length,
    };
  });
  const maxAvg = Math.max(1, ...perWeekday.map((w) => w.avg ?? 0));

  if (loading) return <Empty>Cargando…</Empty>;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Por residente" subtitle="🔔 = tiene el recordatorio push activado en algún dispositivo">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-dim border-b border-border">
                <th className="text-left font-medium py-1.5">R1</th>
                <th className="text-right font-medium">Respuestas</th>
                <th className="text-right font-medium">Sin dormir</th>
                <th className="text-right font-medium">Carga prom.</th>
                <th className="text-right font-medium">🔔</th>
              </tr>
            </thead>
            <tbody>
              {residents.map((r) => {
                const list = feedback.filter((f) => f.residentId === r.id);
                const c = list.map((f) => f.carga).filter((x): x is number => typeof x === 'number');
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <Dot color={color(r.id)} />
                        {r.shortName}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{list.length}</td>
                    <td className="text-right tabular-nums">{list.filter((f) => !f.slept).length}</td>
                    <td className="text-right tabular-nums">{c.length ? (c.reduce((a, b) => a + b, 0) / c.length).toFixed(1) : '—'}</td>
                    <td className="text-right" title={pushTokens.filter((t) => t.residentId === r.id).map((t) => t.device).join(', ')}>
                      {pushTokens.some((t) => t.residentId === r.id) ? '✓' : <span className="text-text-dim">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Card title="¿Qué días son más pesados?" subtitle="Carga promedio reportada (1–10) por día de la semana">
          <ul className="flex flex-col gap-2">
            {perWeekday.map((w) => (
              <li key={w.wd} className="grid grid-cols-[5.5rem_1fr_6rem] items-center gap-2 text-sm">
                <span>{WEEKDAY_LABELS[w.wd as 0]}</span>
                <div className="h-3 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${((w.avg ?? 0) / maxAvg) * 100}%`, background: 'var(--series-1)' }} />
                </div>
                <span className="text-right text-xs text-text-dim tabular-nums">
                  {w.avg !== null ? `${w.avg.toFixed(1)} · n=${w.n}` : 'sin datos'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Todas las respuestas">
        {feedback.length === 0 ? (
          <Empty>Sin feedback todavía.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {feedback.map((f) => (
              <li key={f.id} className="py-2.5 text-sm flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{byId.get(f.residentId)?.shortName}</span>
                  <span className="text-text-dim capitalize">{shortDateLabel(f.date)}</span>
                  <Badge tone={f.slept ? 'good' : 'critical'}>{f.slept ? 'durmió' : 'no durmió'}</Badge>
                  {f.carga !== undefined && <Badge tone="info">carga {f.carga}/10</Badge>}
                </div>
                {f.comentario && <p className="text-text-dim">“{f.comentario}”</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Exportar todo

function ExportAllButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'xlsx' | 'json') {
    setBusy(kind);
    setError(null);
    try {
      const data = await fetchAll();
      if (kind === 'xlsx') downloadAllXlsx(data);
      else downloadAllJson(data);
      await logActivity({ entity: 'residente', summary: `Exportó todos los datos de la app (${kind === 'xlsx' ? 'Excel' : 'copia de seguridad'})` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={btnSecondary}>
        💾 Exportar todo
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Exportar todos los datos">
          <div className="flex flex-col gap-2">
            <button onClick={() => run('xlsx')} disabled={!!busy} className="text-left rounded-xl border border-border p-3 hover:bg-surface-2">
              <span className="block text-sm font-medium">📊 Excel con todo</span>
              <span className="block text-xs text-text-dim mt-0.5">
                Resumen acumulado por persona + una hoja por cada cosa (guardias, pedidos, cambios, sorteos, feedback, carriles,
                historial…), con nombres en vez de códigos.
              </span>
            </button>
            <button onClick={() => run('json')} disabled={!!busy} className="text-left rounded-xl border border-border p-3 hover:bg-surface-2">
              <span className="block text-sm font-medium">🗄️ Copia de seguridad (.json)</span>
              <span className="block text-xs text-text-dim mt-0.5">Todo tal cual está en la base, para guardar o restaurar.</span>
            </button>
            {busy && <p className="text-xs text-text-dim">Preparando…</p>}
            {error && <p className="text-sm text-danger">No se pudo exportar: {error}</p>}
            <p className="text-xs text-text-dim mt-1">Incluye el feedback privado: guardalo en un lugar seguro.</p>
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Conformidad

function Conformidad() {
  const { resident: me } = useAuthContext();
  const { residents } = useResidents();
  const byId = useResidentsById(residents);
  const publications = usePublications();
  const acks = useAcks();
  const pubs = [...publications].sort((a, b) => b.id.localeCompare(a.id));

  return (
    <div className="flex flex-col gap-4">
      {me && <AckAlerts acks={acks} byId={byId} meId={me.id} />}
      <Card
        title="¿Están OK con sus guardias?"
        subtitle="Al publicar (o republicar) un mes, a quienes les cambió algo les llega un push y en el Inicio les aparece la pregunta. Si alguien dice que no, les llega un push a las admins."
      >
        {pubs.length === 0 ? (
          <Empty>Todavía no se publicó ningún mes con el generador.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-text-dim border-b border-border">
                  <th className="text-left font-medium py-1.5">R1</th>
                  {pubs.map((p) => (
                    <th key={p.id} className="text-left font-medium capitalize px-2">
                      {monthLabel(p.id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {residents
                  .filter((r) => r.active)
                  .map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0 align-top">
                      <td className="py-1.5 whitespace-nowrap">{r.shortName}</td>
                      {pubs.map((p) => {
                        const since = p.pending?.[r.id];
                        const ack = acks.find((a) => a.id === `${p.id}_${r.id}`);
                        const current = ack && since && ack.at >= since;
                        return (
                          <td key={p.id} className="px-2 py-1.5">
                            {!since ? (
                              <span className="text-text-dim">—</span>
                            ) : !current ? (
                              <Badge tone="warning">sin responder</Badge>
                            ) : ack.ok ? (
                              <Badge tone="good">👍 OK</Badge>
                            ) : (
                              <span className="flex flex-col gap-0.5">
                                <Badge tone={ack.resolvedAt ? 'neutral' : 'critical'}>{ack.resolvedAt ? 'resuelto' : '👎 pidió cambio'}</Badge>
                                <span className="text-xs text-text-dim max-w-[16rem]">“{ack.comment}”</span>
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Historial

const ENTITY_LABEL: Record<ActivityEntity, string> = {
  guardias: '📅 Guardias',
  pedido: '🙋 Pedidos',
  cambio: '🔁 Cambios',
  sorteo: '🎲 Sorteos',
  reglas: '📐 Reglas',
  calendario: '🇦🇷 Calendario',
  residente: '👥 Residentes',
  tarea: '✅ Tareas',
  nota: '📚 Notas',
  link: '🔗 Links',
  feedback: '🌙 Feedback',
  carril: '🗺️ Carriles',
  evento: '📆 Eventos',
  conformidad: '👍 Conformidad',
};

function Historial() {
  const [max, setMax] = useState(400);
  const { activity, loading, error } = useActivity(max);
  const { residents } = useResidents();
  const byId = useResidentsById(residents);
  const color = useColors(residents);
  const [person, setPerson] = useState('todas');
  const [entity, setEntity] = useState<'todas' | ActivityEntity>('todas');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();
  const visible = activity
    .filter((a) => person === 'todas' || a.by === person)
    .filter((a) => entity === 'todas' || a.entity === entity)
    .filter((a) => !q || [a.summary, ...(a.changes ?? [])].join(' ').toLowerCase().includes(q));

  const byDay = new Map<string, typeof visible>();
  for (const a of visible) {
    const day = new Date(a.at).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    byDay.set(day, [...(byDay.get(day) ?? []), a]);
  }

  return (
    <Card
      title="Historial de cambios"
      subtitle="Todo lo que se hace en la app: quién, qué, cuándo y el antes → después. No se puede editar ni borrar."
    >
      <div className="flex gap-2 flex-wrap mb-4">
        <select value={person} onChange={(e) => setPerson(e.target.value)} className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm">
          <option value="todas">Todas las personas</option>
          {residents.map((r) => (
            <option key={r.id} value={r.id}>
              {r.shortName}
            </option>
          ))}
        </select>
        <select value={entity} onChange={(e) => setEntity(e.target.value as ActivityEntity | 'todas')} className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm">
          <option value="todas">Todo tipo de cambio</option>
          {(Object.keys(ENTITY_LABEL) as ActivityEntity[]).map((k) => (
            <option key={k} value={k}>
              {ENTITY_LABEL[k]}
            </option>
          ))}
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 Buscar (fecha, nombre…)" className={clsx(inputBase, 'flex-1 min-w-[180px]')} />
      </div>

      {error && <p className="text-sm text-danger">No se pudo cargar el historial: {error}</p>}
      {loading ? (
        <Empty>Cargando…</Empty>
      ) : visible.length === 0 ? (
        <Empty>No hay cambios registrados con estos filtros. El historial empieza a partir de esta versión de la app.</Empty>
      ) : (
        <div className="flex flex-col gap-5">
          {[...byDay.entries()].map(([day, items]) => (
            <div key={day}>
              <p className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-2">{day}</p>
              <ul className="flex flex-col divide-y divide-border border border-border rounded-xl">
                {items.map((a) => {
                  const expanded = open.has(a.id);
                  const changes = a.changes ?? [];
                  return (
                    <li key={a.id} className="px-3 py-2.5 text-sm flex flex-col gap-1">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-xs text-text-dim tabular-nums w-11 shrink-0 pt-0.5">
                          {new Date(a.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="flex items-center gap-1.5 font-medium shrink-0">
                          <Dot color={color(a.by)} />
                          {byId.get(a.by)?.shortName ?? '¿?'}
                        </span>
                        <span className="flex-1 min-w-[200px]">{a.summary}</span>
                        <Badge>{ENTITY_LABEL[a.entity] ?? a.entity}</Badge>
                      </div>
                      {changes.length > 0 && (
                        <ul className="ml-[3.25rem] text-xs text-text-dim flex flex-col gap-0.5">
                          {(expanded ? changes : changes.slice(0, 3)).map((c, i) => (
                            <li key={i} className="font-mono">
                              {c}
                            </li>
                          ))}
                          {changes.length > 3 && (
                            <li>
                              <button
                                onClick={() => {
                                  const next = new Set(open);
                                  if (expanded) next.delete(a.id);
                                  else next.add(a.id);
                                  setOpen(next);
                                }}
                                className="text-accent underline"
                              >
                                {expanded ? 'ver menos' : `ver los ${changes.length} cambios`}
                              </button>
                            </li>
                          )}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {activity.length >= max && (
            <button onClick={() => setMax(max + 400)} className={clsx(btnSecondary, 'self-center')}>
              Cargar más
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

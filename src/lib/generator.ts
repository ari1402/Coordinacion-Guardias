import type {
  DraftSlot,
  EquityCounters,
  GuardiaRequest,
  MonthRules,
  Resident,
  ResolvedDay,
} from '../types';
import { requestIntent, requestShiftDates } from '../types';
import { isBirthdayBlocked } from './birthdays';
import { diffDays, hasTag, isoWeekday, isSabadoOrPreferiado, protectingThursday, shortDateLabel } from './dates';

// ---------------------------------------------------------------------------
// Perfiles: misma función de costo, distintos pesos. Así el generador puede
// ofrecer "máxima equidad / máximo respeto de pedidos / máximo descanso".
// ---------------------------------------------------------------------------

export type ProfileId = 'equidad' | 'pedidos' | 'descanso';

interface Weights {
  total: number;
  sabPref: number;
  largo: number;
  feriado: number;
  viernes: number;
  domingo: number;
  findeTotal: number;
  xl: number;
  jueves: number;
  gapNear: number;
  gapSoft: number;
  sameWd: number;
  doubleSatPref: number;
  satThu: number;
  offStrong: number;
  offSoft: number;
  onStrong: number;
  onSoft: number;
  /** Premio por darle el jueves feliz a quien arrastra sábados sin compensar. */
  felizComp: number;
}

const BASE: Weights = {
  total: 40,
  sabPref: 30,
  largo: 30,
  feriado: 20,
  viernes: 8,
  domingo: 8,
  findeTotal: 10,
  xl: 15,
  jueves: 8,
  gapNear: 60,
  gapSoft: 8,
  sameWd: 25,
  doubleSatPref: 120,
  satThu: 150,
  offStrong: 400,
  offSoft: 80,
  onStrong: 400,
  onSoft: 80,
  felizComp: 30,
};

export const PROFILES: Record<ProfileId, { label: string; description: string; weights: Weights }> = {
  equidad: {
    label: 'Máxima equidad',
    description: 'Prioriza repartir parejo con el acumulado: totales, sábados/preferiados, feriados y findes.',
    weights: { ...BASE, total: 80, sabPref: 60, largo: 60, feriado: 40, xl: 30, findeTotal: 20, felizComp: 40, satThu: 200 },
  },
  pedidos: {
    label: 'Máximo respeto de pedidos',
    description: 'Prioriza cumplir pedidos fuertes y preferencias, aunque la equidad del mes quede algo menos pareja.',
    weights: { ...BASE, offStrong: 3000, offSoft: 600, onStrong: 3000, onSoft: 600 },
  },
  descanso: {
    label: 'Máximo descanso',
    description: 'Prioriza separar las guardias de cada una (más días entre guardias) y no repetir día de semana.',
    weights: { ...BASE, gapNear: 500, gapSoft: 70, sameWd: 60 },
  },
};

const UNCOVERED = 1_000_000;
const INELIGIBLE = 2_000_000; // peor que dejar sin cubrir: nunca se asigna solo
const DOUBLE_SAME_DAY = 2_000_000;
const GAP_HARD_PER_DAY = 20_000;
const OVER_MAX = 5_000;
const SPREAD = 3_000;
const POST_THURSDAY = 50_000;
/**
 * Finde XL por turnos: dárselo a alguien que ya tuvo más que otra disponible
 * (que no pidió no estar). Pesa más que cualquier premio por carga; solo lo
 * saltea un pedido de esa persona para ese día.
 */
const XL_ROTATION = 1_500;
/** Feriados por turnos: nadie repite feriado hasta que todas hayan hecho uno. */
const FERIADO_ROTATION = 1_500;

const TURNS = [
  { pool: 'xlPool', cat: 'xl', weight: XL_ROTATION, code: 'finde_xl_turno', label: 'finde XL' },
  { pool: 'feriadoPool', cat: 'feriado', weight: FERIADO_ROTATION, code: 'feriado_turno', label: 'feriado' },
] as const;

const CATS = ['total', 'sabPref', 'largo', 'feriado', 'viernes', 'domingo', 'findeTotal', 'xl', 'jueves'] as const;
type Cat = (typeof CATS)[number];

/** Acumulado previo al mes que se genera (para que un mes compense al anterior). */
export type PriorCounts = Record<Cat, number> & {
  lastShiftDate?: string;
  sinDormir?: number;
  sabSinComp?: number;
  /** Findes libres acumulados (comunes + largos) antes del mes. */
  findesLibres?: number;
};

export function priorFromCounters(c: EquityCounters | undefined, lastShiftDate?: string): PriorCounts {
  return {
    total: c?.totalGuardias ?? 0,
    sabPref: c?.sabadosYPreferiados ?? 0,
    largo: c?.guardiasFindeLargo ?? 0,
    feriado: c?.feriados ?? 0,
    viernes: c?.viernes ?? 0,
    domingo: c?.domingos ?? 0,
    findeTotal: c?.findeTotal ?? 0,
    xl: c?.findesXL ?? 0,
    jueves: c?.juevesFelices ?? 0,
    sinDormir: c?.sinDormir ?? 0,
    sabSinComp: c?.sabadosSinCompensar ?? 0,
    findesLibres: c?.findesLibresA ?? 0,
    lastShiftDate,
  };
}

export interface ScheduleInput {
  days: ResolvedDay[];
  residents: Resident[];
  requests: GuardiaRequest[];
  rules: MonthRules;
  prior?: Record<string, PriorCounts>;
  /** Slots fijados a mano (locked) o reservados para sorteo (raffleId sin residente). */
  fixed?: DraftSlot[];
  /** Feriados (de cualquier mes) para saber cuál es el próximo día hábil. */
  holidayDates?: string[];
  /** Días en que alguien no puede por otra causa (p. ej. vacaciones por carril). */
  unavailable?: { residentId: string; dates: string[]; reason: string }[];
}

export type IssueCode =
  | 'sin_cubrir'
  | 'no_disponible'
  | 'doble'
  | 'distancia'
  | 'distancia_justa'
  | 'tope'
  | 'desparejo'
  | 'mismo_dia_semana'
  | 'doble_sab_pref'
  | 'sabado_sin_jueves'
  | 'pedido_off'
  | 'pedido_on'
  | 'finde_post_jueves'
  | 'finde_xl_turno'
  | 'feriado_turno';

export interface Issue {
  severity: 'hard' | 'soft';
  code: IssueCode;
  message: string;
  slotKey?: string;
  residentId?: string;
}

export interface ResidentMonthStats {
  residentId: string;
  count: number;
  sabPref: number;
  viernes: number;
  domingos: number;
  feriados: number;
  xl: number;
  juevesFelices: number;
  minGap: number | null;
  avgGap: number | null;
  cumTotal: number;
  cumSabPref: number;
  availableSlots: number;
}

export interface RequestOutcome {
  request: GuardiaRequest;
  satisfied: boolean;
}

export interface Evaluation {
  cost: number;
  issues: Issue[];
  stats: Record<string, ResidentMonthStats>;
  requests: RequestOutcome[];
  summary: {
    slots: number;
    uncovered: number;
    raffles: number;
    maxDiff: number;
    minGap: number | null;
    avgGap: number | null;
    strongOk: number;
    strongTotal: number;
    softOk: number;
    softTotal: number;
    hardCount: number;
    softCount: number;
  };
}

export function slotKey(date: string, slotIndex: number): string {
  return `${date}_${slotIndex}`;
}

/** Todos los slots del mes según los R1 requeridos de cada día. */
export function buildSlots(days: ResolvedDay[]): { date: string; slotIndex: number }[] {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((d) => {
      const disabled = new Set(d.disabledSlots ?? []);
      return Array.from({ length: d.requiredR1 + disabled.size }, (_, i) => i)
        .filter((i) => !disabled.has(i))
        .map((slotIndex) => ({ date: d.date, slotIndex }));
    });
}

// ---------------------------------------------------------------------------
// Problema compilado: todo lo que no depende de la asignación se precalcula
// una sola vez, así evaluar una asignación es barato (se hace miles de veces).
// ---------------------------------------------------------------------------

interface SlotMeta {
  key: string;
  date: string;
  slotIndex: number;
  dayNum: number;
  weekday: number;
  sabPref: boolean;
  /** Cae en un finde largo (incluida la noche anterior). */
  largo: boolean;
  feriado: boolean;
  viernes: boolean;
  domingo: boolean;
  finde: boolean;
  xl: boolean;
  juevesFeliz: boolean;
  jueves: boolean;
  fixed: number; // índice de residente o -1
  raffle: boolean;
  /** dayNum del jueves cuyo finde liberado incluye este día, o null. */
  protector: number | null;
  protectorDate: string | null;
}

interface OffEntry {
  r: number;
  strong: boolean;
  req: GuardiaRequest;
}

interface OnEntry {
  r: number;
  strong: boolean;
  slots: number[];
  req: GuardiaRequest;
}

interface Problem {
  rules: MonthRules;
  resIds: string[];
  names: string[];
  slots: SlotMeta[];
  eligible: boolean[][];
  reason: (string | null)[][];
  prior: PriorCounts[];
  priorLast: (number | null)[];
  priorLastThu: (number | null)[];
  offAt: OffEntry[][];
  onReqs: OnEntry[];
  bloqueos: GuardiaRequest[];
  spreadEligible: boolean[];
  availableSlots: number[];
  /** Por slot de finde XL / feriado: quiénes podrían hacerlo (pueden y no pidieron no estar). */
  xlPool: (number[] | null)[];
  feriadoPool: (number[] | null)[];
  /** Por slot: quiénes lo pidieron (quiero esta guardia / posguardia). */
  onBySlot: Set<number>[];
  /** Preferencia al azar para el finde XL entre quienes empatan en el turno. */
  xlLottery?: number[];
}

function compile(input: ScheduleInput): Problem {
  const rules = input.rules;
  const residents = input.residents.filter((r) => r.active);
  const resIds = residents.map((r) => r.id);
  const resIdx = new Map(resIds.map((id, i) => [id, i]));
  const days = [...input.days].sort((a, b) => a.date.localeCompare(b.date));
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const base = days[0]?.date ?? '2000-01-01';
  const fixedByKey = new Map((input.fixed ?? []).map((f) => [slotKey(f.date, f.slotIndex), f]));
  const holidays = new Set([...(input.holidayDates ?? []), ...days.filter((d) => d.isHoliday).map((d) => d.date)]);
  const isHoliday = (d: string) => holidays.has(d);

  const slots: SlotMeta[] = buildSlots(days).map(({ date, slotIndex }) => {
    const d = dayByDate.get(date)!;
    const key = slotKey(date, slotIndex);
    const f = fixedByKey.get(key);
    const fixedIdx = f?.residentId && (f.locked || f.raffleId) ? (resIdx.get(f.residentId) ?? -1) : -1;
    return {
      key,
      date,
      slotIndex,
      dayNum: diffDays(base, date),
      weekday: d.weekday,
      sabPref: isSabadoOrPreferiado(d),
      largo: hasTag(d, 'finde_largo'),
      feriado: d.isHoliday,
      viernes: d.weekday === 4,
      domingo: d.weekday === 6,
      finde: d.weekday >= 4,
      xl: hasTag(d, 'finde_xl'),
      juevesFeliz: hasTag(d, 'jueves_feliz'),
      jueves: d.weekday === 3,
      fixed: fixedIdx,
      raffle: !!f?.raffleId && !f.residentId,
      ...(() => {
        const thu = rules.juevesLibraFinde ? protectingThursday(date, isHoliday) : null;
        return { protector: thu ? diffDays(base, thu) : null, protectorDate: thu };
      })(),
    };
  });

  const active = input.requests.filter((r) => r.status !== 'rechazado' && resIdx.has(r.residentId));
  const bloqueos = active.filter((r) => r.type === 'bloqueo');
  const blockedReason = new Map<string, string>(); // "r|date" -> motivo
  for (const req of bloqueos) {
    for (const date of req.dates) blockedReason.set(`${resIdx.get(req.residentId)}|${date}`, req.reason);
  }
  for (const u of input.unavailable ?? []) {
    const r = resIdx.get(u.residentId);
    if (r !== undefined) for (const date of u.dates) blockedReason.set(`${r}|${date}`, u.reason);
  }

  const eligible = slots.map((s) =>
    residents.map((res, r) => !blockedReason.has(`${r}|${s.date}`) && !isBirthdayBlocked(s.date, res)),
  );
  const reason = slots.map((s) =>
    residents.map((res, r) => {
      const b = blockedReason.get(`${r}|${s.date}`);
      if (b !== undefined) return b === 'Vacaciones' ? 'vacaciones' : `bloqueo (${b || 'sin motivo'})`;
      if (isBirthdayBlocked(s.date, res)) return 'cumpleaños o víspera';
      return null;
    }),
  );

  const offAt: OffEntry[][] = slots.map(() => []);
  const onReqs: OnEntry[] = [];
  for (const req of active) {
    if (req.type === 'bloqueo') continue;
    const r = resIdx.get(req.residentId)!;
    const strong = req.type === 'pedido_fuerte';
    const shiftDates = requestShiftDates(req);
    const dates = new Set(shiftDates);
    const slotIdxs = slots.map((s, i) => (dates.has(s.date) ? i : -1)).filter((i) => i >= 0);
    if (requestIntent(req) === 'off') {
      for (const i of slotIdxs) offAt[i].push({ r, strong, req });
    } else if (shiftDates.some((d) => dayByDate.has(d))) {
      onReqs.push({ r, strong, slots: slotIdxs, req });
    }
  }

  const availableSlots = residents.map((_, r) => slots.filter((_, i) => eligible[i][r]).length);
  const spreadEligible = availableSlots.map((n) => slots.length === 0 || n / slots.length >= 0.6);

  const prior = resIds.map((id) => input.prior?.[id] ?? priorFromCounters(undefined));
  const priorLast = prior.map((p) => (p.lastShiftDate ? diffDays(base, p.lastShiftDate) : null));
  const priorLastThu = prior.map((p) =>
    p.lastShiftDate && isoWeekday(p.lastShiftDate) === 3 ? diffDays(base, p.lastShiftDate) : null,
  );

  const onBySlot = slots.map(() => new Set<number>());
  for (const req of onReqs) for (const i of req.slots) onBySlot[i].add(req.r);
  const pool = (i: number) => residents.map((_, r) => r).filter((r) => eligible[i][r] && !offAt[i].some((e) => e.r === r));
  const xlPool = slots.map((sl, i) => (sl.xl ? pool(i) : null));
  const feriadoPool = slots.map((sl, i) => (sl.feriado ? pool(i) : null));

  return {
    xlPool,
    feriadoPool,
    onBySlot,
    rules,
    resIds,
    names: residents.map((r) => r.shortName),
    slots,
    eligible,
    reason,
    prior,
    priorLast,
    priorLastThu,
    offAt,
    onReqs,
    bloqueos,
    spreadEligible,
    availableSlots,
  };
}

interface Collector {
  issues: Issue[];
  gapStats: { min: number | null; sum: number; n: number }[];
  monthCounts: Record<Cat, number>[];
  onOutcomes: Map<GuardiaRequest, boolean>;
  offViolated: Set<GuardiaRequest>;
}

/**
 * Costo de una asignación (menor = mejor). Si se pasa `out`, además junta
 * los problemas en lenguaje claro: es la misma lógica para generar y para
 * validar una edición manual, así nunca se contradicen.
 */
function run(p: Problem, assign: Int16Array, W: Weights, out: Collector | null): number {
  const nR = p.resIds.length;
  const { minGapHard, minGapIdeal } = p.rules;
  const month = Array.from({ length: nR }, () => ({
    total: 0, sabPref: 0, largo: 0, feriado: 0, viernes: 0, domingo: 0, findeTotal: 0, xl: 0, jueves: 0,
  }));
  const juevesBueno = new Uint8Array(nR); // jueves feliz o finde XL
  const sabado = new Uint8Array(nR);
  const wd = new Uint16Array(nR * 7);
  const last = [...p.priorLast];
  const lastThu = [...p.priorLastThu];
  let cost = 0;

  const name = (r: number) => p.names[r];

  for (let s = 0; s < p.slots.length; s++) {
    const m = p.slots[s];
    const r = assign[s];
    if (r < 0) {
      if (!m.raffle) {
        cost += UNCOVERED;
        out?.issues.push({
          severity: 'hard',
          code: 'sin_cubrir',
          slotKey: m.key,
          message: `${shortDateLabel(m.date)}: guardia sin cubrir.`,
        });
      }
      continue;
    }
    if (!p.eligible[s][r]) {
      cost += INELIGIBLE;
      out?.issues.push({
        severity: 'hard',
        code: 'no_disponible',
        slotKey: m.key,
        residentId: p.resIds[r],
        message: `${shortDateLabel(m.date)}: ${name(r)} no puede (${p.reason[s][r]}).`,
      });
    }
    // Finde XL y feriados por turnos: primero quien todavía no tuvo (o tuvo
    // menos) entre quienes pueden y no pidieron no estar. Un pedido lo saltea.
    for (const t of TURNS) {
      const pool = p[t.pool][s];
      if (!pool || p.onBySlot[s].has(r)) continue;
      const had = (x: number) => p.prior[x][t.cat] + month[x][t.cat];
      const min = Math.min(...pool.map(had));
      if (had(r) <= min) continue;
      cost += t.weight * (had(r) - min);
      const waiting = pool.filter((x) => had(x) === min).map(name);
      out?.issues.push({
        severity: 'soft',
        code: t.code,
        slotKey: m.key,
        residentId: p.resIds[r],
        message: `${shortDateLabel(m.date)}: ${t.label} para ${name(r)}, que ya tuvo ${had(r)}; todavía esperan ${waiting.join(', ')}.`,
      });
    }

    const c = month[r];
    c.total++;
    if (m.sabPref) c.sabPref++;
    if (m.largo) c.largo++;
    if (m.feriado) c.feriado++;
    if (m.viernes) c.viernes++;
    if (m.domingo) c.domingo++;
    if (m.finde) c.findeTotal++;
    if (m.xl) c.xl++;
    if (m.juevesFeliz) c.jueves++;
    if (m.juevesFeliz || m.xl) juevesBueno[r] = 1;
    if (m.weekday === 5) sabado[r] = 1;
    wd[r * 7 + m.weekday]++;

    const prev = last[r];
    if (prev !== null) {
      const g = m.dayNum - prev;
      if (g === 0) {
        cost += DOUBLE_SAME_DAY;
        out?.issues.push({
          severity: 'hard',
          code: 'doble',
          slotKey: m.key,
          residentId: p.resIds[r],
          message: `${shortDateLabel(m.date)}: ${name(r)} tiene dos guardias el mismo día.`,
        });
      } else {
        if (g <= minGapHard) {
          cost += GAP_HARD_PER_DAY * (minGapHard + 1 - g);
          out?.issues.push({
            severity: 'hard',
            code: 'distancia',
            slotKey: m.key,
            residentId: p.resIds[r],
            message: `${shortDateLabel(m.date)}: ${name(r)} queda con solo ${g} día(s) desde su guardia anterior.`,
          });
        } else if (g === minGapHard + 1) {
          cost += W.gapNear;
          out?.issues.push({
            severity: 'soft',
            code: 'distancia_justa',
            slotKey: m.key,
            residentId: p.resIds[r],
            message: `${shortDateLabel(m.date)}: ${name(r)} queda con ${g} días desde la anterior (justo).`,
          });
        }
        if (g < minGapIdeal) cost += W.gapSoft * (minGapIdeal - g);
        if (out) {
          const gs = out.gapStats[r];
          gs.min = gs.min === null ? g : Math.min(gs.min, g);
          gs.sum += g;
          gs.n++;
        }
      }
    }
    last[r] = m.dayNum;

    if (m.protector !== null && lastThu[r] === m.protector) {
      cost += POST_THURSDAY;
      out?.issues.push({
        severity: 'hard',
        code: 'finde_post_jueves',
        slotKey: m.key,
        residentId: p.resIds[r],
        message: `${shortDateLabel(m.date)}: ${name(r)} hizo guardia el ${shortDateLabel(m.protectorDate!)} y tiene libre hasta el primer día hábil.`,
      });
    }
    if (m.jueves) lastThu[r] = m.dayNum;

    for (const e of p.offAt[s]) {
      if (e.r !== r) continue;
      cost += e.strong ? W.offStrong : W.offSoft;
      if (out) {
        out.offViolated.add(e.req);
        out.issues.push({
          severity: 'soft',
          code: 'pedido_off',
          slotKey: m.key,
          residentId: p.resIds[r],
          message: `${shortDateLabel(m.date)}: ${name(r)} había pedido no estar (${e.strong ? 'pedido fuerte' : 'preferencia'}).`,
        });
      }
    }
  }

  // Tope por persona
  if (p.rules.maxPerPerson > 0) {
    for (let r = 0; r < nR; r++) {
      const extra = month[r].total - p.rules.maxPerPerson;
      if (extra > 0) {
        cost += OVER_MAX * extra;
        out?.issues.push({
          severity: 'soft',
          code: 'tope',
          residentId: p.resIds[r],
          message: `${name(r)} supera el tope del mes (${month[r].total} > ${p.rules.maxPerPerson}).`,
        });
      }
    }
  }

  // Diferencia de cantidad dentro del mes (ideal: máximo 1 entre quienes están disponibles)
  const spreadVals = month.filter((_, r) => p.spreadEligible[r]).map((c) => c.total);
  if (spreadVals.length > 1) {
    const excess = Math.max(...spreadVals) - Math.min(...spreadVals) - 1;
    if (excess > 0) {
      cost += SPREAD * excess * excess;
      out?.issues.push({
        severity: 'soft',
        code: 'desparejo',
        message: `La diferencia de guardias en el mes es de ${excess + 1} entre quien más y quien menos tiene.`,
      });
    }
  }

  // Equidad acumulada por categoría (varianza de previo + mes)
  for (const cat of CATS) {
    let mean = 0;
    for (let r = 0; r < nR; r++) mean += p.prior[r][cat] + month[r][cat];
    mean /= nR || 1;
    let v = 0;
    for (let r = 0; r < nR; r++) v += (p.prior[r][cat] + month[r][cat] - mean) ** 2;
    cost += W[cat] * v;
  }

  // Los jueves felices que sobren (además de compensar los sábados del mes,
  // ver abajo) van primero a quien arrastra sábados sin compensar de antes.
  const owed = p.prior.map((x) => x.sabSinComp ?? 0);
  const owedMean = owed.reduce((a, b) => a + b, 0) / (nR || 1);
  for (let r = 0; r < nR; r++) {
    const satDebt = Math.max(-2.5, Math.min(2.5, owed[r] - owedMean));
    cost -= W.felizComp * month[r].jueves * satDebt;
  }
  // Finde XL: entre quienes les toca el turno, al azar (sorteo propio de cada corrida).
  if (p.xlLottery) for (let r = 0; r < nR; r++) cost -= p.xlLottery[r] * month[r].xl;

  for (let r = 0; r < nR; r++) {
    if (p.rules.avoidSameWeekday) {
      for (let d = 0; d < 7; d++) {
        const rep = wd[r * 7 + d] - 1;
        if (rep > 0) {
          cost += W.sameWd * rep;
          out?.issues.push({
            severity: 'soft',
            code: 'mismo_dia_semana',
            residentId: p.resIds[r],
            message: `${name(r)} repite ${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][d]} en el mes.`,
          });
        }
      }
    }
    if (p.rules.avoidDoubleSatPref && month[r].sabPref > 1) {
      cost += W.doubleSatPref * (month[r].sabPref - 1);
      out?.issues.push({
        severity: 'soft',
        code: 'doble_sab_pref',
        residentId: p.resIds[r],
        message: `${name(r)} tiene ${month[r].sabPref} sábados/preferiados en el mes.`,
      });
    }
    // El jueves feliz compensa el sábado: quien tiene sábado en el mes, que
    // tenga un jueves feliz (o un finde XL).
    if (p.rules.sabadoComunConJueves && sabado[r] && !juevesBueno[r]) {
      cost += W.satThu;
      out?.issues.push({
        severity: 'soft',
        code: 'sabado_sin_jueves',
        residentId: p.resIds[r],
        message: `${name(r)} tiene sábado pero ningún jueves feliz.`,
      });
    }
  }

  for (const req of p.onReqs) {
    const ok = req.slots.some((s) => assign[s] === req.r);
    if (!ok) cost += req.strong ? W.onStrong : W.onSoft;
    if (out) {
      out.onOutcomes.set(req.req, ok);
      if (!ok) {
        out.issues.push({
          severity: 'soft',
          code: 'pedido_on',
          residentId: p.resIds[req.r],
          message: requestIntent(req.req) === 'posguardia'
            ? `${name(req.r)} necesitaba el posguardia del ${req.req.dates.map(shortDateLabel).join(' o ')} y no quedó.`
            : `${name(req.r)} pidió ${req.req.dates.map(shortDateLabel).join(' o ')} y no quedó asignada.`,
        });
      }
    }
  }

  if (out) for (let r = 0; r < nR; r++) out.monthCounts[r] = month[r];
  return cost;
}

function evaluateAssignment(p: Problem, assign: Int16Array, W: Weights, requests: GuardiaRequest[]): Evaluation {
  const nR = p.resIds.length;
  const out: Collector = {
    issues: [],
    gapStats: Array.from({ length: nR }, () => ({ min: null, sum: 0, n: 0 })),
    monthCounts: [],
    onOutcomes: new Map(),
    offViolated: new Set(),
  };
  const cost = run(p, assign, W, out);

  const stats: Record<string, ResidentMonthStats> = {};
  p.resIds.forEach((id, r) => {
    const m = out.monthCounts[r];
    const g = out.gapStats[r];
    stats[id] = {
      residentId: id,
      count: m.total,
      sabPref: m.sabPref,
      viernes: m.viernes,
      domingos: m.domingo,
      feriados: m.feriado,
      xl: m.xl,
      juevesFelices: m.jueves,
      minGap: g.min,
      avgGap: g.n ? g.sum / g.n : null,
      cumTotal: p.prior[r].total + m.total,
      cumSabPref: p.prior[r].sabPref + m.sabPref,
      availableSlots: p.availableSlots[r],
    };
  });

  const relevant = requests.filter((r) => r.type !== 'bloqueo' && r.status !== 'rechazado');
  const outcomes: RequestOutcome[] = relevant
    .filter((r) => p.resIds.includes(r.residentId))
    .map((request) => ({
      request,
      satisfied:
        requestIntent(request) === 'off' ? !out.offViolated.has(request) : (out.onOutcomes.get(request) ?? true),
    }));

  const counts = p.resIds.map((_, r) => out.monthCounts[r].total).filter((_, r) => p.spreadEligible[r]);
  const allGaps = out.gapStats.filter((g) => g.n > 0);
  const strong = outcomes.filter((o) => o.request.type === 'pedido_fuerte');
  const soft = outcomes.filter((o) => o.request.type === 'preferencia');

  return {
    cost,
    issues: out.issues,
    stats,
    requests: outcomes,
    summary: {
      slots: p.slots.length,
      uncovered: out.issues.filter((i) => i.code === 'sin_cubrir').length,
      raffles: p.slots.filter((s) => s.raffle).length,
      maxDiff: counts.length ? Math.max(...counts) - Math.min(...counts) : 0,
      minGap: allGaps.length ? Math.min(...allGaps.map((g) => g.min!)) : null,
      avgGap: allGaps.length
        ? allGaps.reduce((a, g) => a + g.sum, 0) / allGaps.reduce((a, g) => a + g.n, 0)
        : null,
      strongOk: strong.filter((o) => o.satisfied).length,
      strongTotal: strong.length,
      softOk: soft.filter((o) => o.satisfied).length,
      softTotal: soft.length,
      hardCount: out.issues.filter((i) => i.severity === 'hard').length,
      softCount: out.issues.filter((i) => i.severity === 'soft').length,
    },
  };
}

// ---------------------------------------------------------------------------
// Búsqueda: construcción golosa + recocido simulado, con varios reinicios.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initialAssign(p: Problem): Int16Array {
  const a = new Int16Array(p.slots.length).fill(-1);
  p.slots.forEach((s, i) => {
    if (s.fixed >= 0) a[i] = s.fixed;
  });
  return a;
}

function isFree(p: Problem, s: number) {
  return p.slots[s].fixed < 0 && !p.slots[s].raffle;
}

function construct(p: Problem, W: Weights, rng: () => number): Int16Array {
  const a = initialAssign(p);
  // Primero los pedidos fuertes de "quiero esa guardia": así la búsqueda
  // arranca cumpliéndolos y no queda trabada en una solución que los pierde.
  for (const req of p.onReqs) {
    if (!req.strong) continue;
    const s = req.slots.find((i) => isFree(p, i) && a[i] < 0 && p.eligible[i][req.r]);
    if (s !== undefined) a[s] = req.r;
  }
  for (let s = 0; s < p.slots.length; s++) {
    if (a[s] >= 0 || !isFree(p, s)) continue;
    let best = -1;
    let bestCost = Infinity;
    for (let r = 0; r < p.resIds.length; r++) {
      if (!p.eligible[s][r]) continue;
      a[s] = r;
      const c = run(p, a, W, null) + rng() * 5;
      if (c < bestCost) {
        bestCost = c;
        best = r;
      }
    }
    a[s] = best;
  }
  return a;
}

function anneal(p: Problem, W: Weights, start: Int16Array, rng: () => number, iters: number): Int16Array {
  const free = p.slots.map((_, i) => i).filter((i) => isFree(p, i));
  const cur = start.slice();
  let curCost = run(p, cur, W, null);
  let best = cur.slice();
  let bestCost = curCost;
  if (free.length === 0) return best;
  const T0 = 300;
  const T1 = 0.5;

  for (let i = 0; i < iters; i++) {
    const T = T0 * Math.pow(T1 / T0, i / iters);
    if (rng() < 0.5) {
      const s = free[Math.floor(rng() * free.length)];
      const options: number[] = [];
      for (let r = 0; r < p.resIds.length; r++) if (r !== cur[s] && p.eligible[s][r]) options.push(r);
      if (!options.length) continue;
      const old = cur[s];
      cur[s] = options[Math.floor(rng() * options.length)];
      const c = run(p, cur, W, null);
      if (c <= curCost || rng() < Math.exp((curCost - c) / T)) curCost = c;
      else cur[s] = old;
    } else {
      const s1 = free[Math.floor(rng() * free.length)];
      const s2 = free[Math.floor(rng() * free.length)];
      const r1 = cur[s1];
      const r2 = cur[s2];
      if (s1 === s2 || r1 === r2) continue;
      if ((r2 >= 0 && !p.eligible[s1][r2]) || (r1 >= 0 && !p.eligible[s2][r1])) continue;
      cur[s1] = r2;
      cur[s2] = r1;
      const c = run(p, cur, W, null);
      if (c <= curCost || rng() < Math.exp((curCost - c) / T)) curCost = c;
      else {
        cur[s1] = r1;
        cur[s2] = r2;
      }
    }
    if (curCost < bestCost) {
      bestCost = curCost;
      best = cur.slice();
    }
  }
  return best;
}

function toDraft(p: Problem, assign: Int16Array, input: ScheduleInput): DraftSlot[] {
  const fixedByKey = new Map((input.fixed ?? []).map((f) => [slotKey(f.date, f.slotIndex), f]));
  return p.slots.map((s, i) => {
    const f = fixedByKey.get(s.key);
    return {
      date: s.date,
      slotIndex: s.slotIndex,
      residentId: assign[i] >= 0 ? p.resIds[assign[i]] : null,
      locked: f?.locked ?? false,
      ...(f?.raffleId ? { raffleId: f.raffleId } : {}),
    };
  });
}

export interface GeneratedOption {
  profile: ProfileId;
  label: string;
  description: string;
  slots: DraftSlot[];
  evaluation: Evaluation;
}

export interface GenerateOptions {
  seed?: number;
  iterations?: number;
  restarts?: number;
  profiles?: ProfileId[];
}

export function generateOptions(input: ScheduleInput, opts: GenerateOptions = {}): GeneratedOption[] {
  const p = compile(input);
  const iterations = opts.iterations ?? 6000;
  const restarts = opts.restarts ?? 3;
  const profiles = opts.profiles ?? (['equidad', 'pedidos', 'descanso'] as ProfileId[]);
  const rng = mulberry32(opts.seed ?? Date.now() % 2_147_483_647);

  return profiles.map((profile) => {
    const W = PROFILES[profile].weights;
    // Cada opción sortea su orden para el finde XL (solo desempata dentro del turno).
    p.xlLottery = p.resIds.map(() => rng() * 120);
    let best: Int16Array | null = null;
    let bestCost = Infinity;
    for (let k = 0; k < restarts; k++) {
      const result = anneal(p, W, construct(p, W, rng), rng, iterations);
      const c = run(p, result, W, null);
      if (c < bestCost) {
        bestCost = c;
        best = result;
      }
    }
    const assign = best ?? initialAssign(p);
    return {
      profile,
      label: PROFILES[profile].label,
      description: PROFILES[profile].description,
      slots: toDraft(p, assign, input),
      evaluation: evaluateAssignment(p, assign, W, input.requests),
    };
  });
}

/** Evalúa un borrador editado a mano (con los pesos de equidad). */
export function evaluateDraft(input: ScheduleInput, draft: DraftSlot[]): Evaluation {
  const p = compile({ ...input, fixed: draft.filter((d) => d.raffleId && !d.residentId) });
  const byKey = new Map(draft.map((d) => [slotKey(d.date, d.slotIndex), d.residentId]));
  const idx = new Map(p.resIds.map((id, i) => [id, i]));
  const assign = new Int16Array(p.slots.length);
  p.slots.forEach((s, i) => {
    const id = byKey.get(s.key);
    assign[i] = id ? (idx.get(id) ?? -1) : -1;
  });
  return evaluateAssignment(p, assign, PROFILES.equidad.weights, input.requests);
}

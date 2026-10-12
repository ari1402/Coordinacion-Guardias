import type { EquityCounters, GuardiaRequest, Resident, ResolvedDay } from '../types';
import { diffDays, hasTag } from './dates';

export interface GeneratorOptions {
  minGapHard: number; // <= este valor se considera "distancia corta" (default 3)
  minGapIdeal: number; // a partir de este valor se considera ideal (default 5)
  attempts: number; // reintentos aleatorios para buscar el mejor resultado
}

const DEFAULT_OPTIONS: GeneratorOptions = {
  minGapHard: 3,
  minGapIdeal: 5,
  attempts: 80,
};

export interface GeneratorInput {
  days: ResolvedDay[]; // mes a generar, ordenado o no (se ordena internamente)
  residents: Resident[]; // solo activos
  requests: GuardiaRequest[]; // pedidos vigentes para ese mes (de cualquier estado)
  /** Contadores históricos acumulados previos (para arrastrar equidad entre meses). */
  priorCounters?: Record<string, EquityCounters>;
  /** Fecha de la última guardia real de cada residente antes de este mes (para la regla de distancia). */
  priorLastShiftDate?: Record<string, string>;
  options?: Partial<GeneratorOptions>;
}

export interface GeneratorSlot {
  date: string;
  slotIndex: number;
  residentId: string | null;
}

export type ViolationType =
  | 'sin_cobertura'
  | 'distancia_corta'
  | 'pedido_fuerte_no_cumplido'
  | 'sabado_y_preferiado_mismo_mes';

export interface GeneratorViolation {
  type: ViolationType;
  date: string;
  residentId?: string;
  detail: string;
}

export interface GeneratorResult {
  assignments: GeneratorSlot[];
  violations: GeneratorViolation[];
  totals: Record<string, number>; // guardias totales por residente, solo de este mes
  score: number; // menor = mejor
}

const W_TOTAL = 6;
const W_SAB_PREF = 5;
const W_FERIADO = 4;
const BONUS_STRONG = 40;
const BONUS_SOFT = 12;
const PENALTY_SHORT_GAP_PER_DAY = 25;
const PENALTY_DOUBLE_SAB_PREF = 18;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isSabadoOrPreferiado(day: ResolvedDay): boolean {
  return day.weekday === 5 || hasTag(day, 'preferiado');
}

function runAttempt(input: Required<Pick<GeneratorInput, 'days' | 'residents' | 'requests'>> & {
  priorCounters: Record<string, EquityCounters>;
  priorLastShiftDate: Record<string, string>;
  options: GeneratorOptions;
  rng: () => number;
}): GeneratorResult {
  const { days, residents, requests, priorCounters, priorLastShiftDate, options, rng } = input;
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));

  const blocked = new Map<string, Set<string>>(); // date -> resident ids bloqueados
  const strong = new Map<string, Set<string>>();
  const soft = new Map<string, Set<string>>();
  for (const r of requests) {
    for (const date of r.dates) {
      const target =
        r.type === 'bloqueo' ? blocked : r.type === 'pedido_fuerte' ? strong : soft;
      if (!target.has(date)) target.set(date, new Set());
      target.get(date)!.add(r.residentId);
    }
  }

  const lastShiftDate: Record<string, string | undefined> = { ...priorLastShiftDate };
  const totals: Record<string, number> = {};
  const sabPrefCount: Record<string, number> = {};
  const feriadoCount: Record<string, number> = {};
  const hadSabOrPrefThisMonth = new Set<string>();
  for (const r of residents) {
    totals[r.id] = 0;
    sabPrefCount[r.id] = priorCounters[r.id]?.sabadosYPreferiados ?? 0;
    feriadoCount[r.id] = priorCounters[r.id]?.feriados ?? 0;
  }

  const assignments: GeneratorSlot[] = [];
  const violations: GeneratorViolation[] = [];
  const strongSatisfied = new Set<string>(); // "date|residentId"

  for (const day of sortedDays) {
    for (let slot = 0; slot < day.requiredR1; slot++) {
      const blockedHere = blocked.get(day.date) ?? new Set();
      const strongHere = strong.get(day.date) ?? new Set();
      const softHere = soft.get(day.date) ?? new Set();

      let candidates = residents.filter((r) => !blockedHere.has(r.id));

      // Regla dura de distancia: si hay candidatos que la cumplen, se excluyen
      // los que no; si nadie la cumple, se permite con penalización (excepción).
      const withGap = candidates.map((r) => {
        const last = lastShiftDate[r.id];
        const gap = last ? diffDays(last, day.date) : Infinity;
        return { r, gap };
      });
      const respectHard = withGap.filter((x) => x.gap > options.minGapHard);
      const pool = respectHard.length > 0 ? respectHard : withGap;

      if (pool.length === 0) {
        assignments.push({ date: day.date, slotIndex: slot, residentId: null });
        violations.push({
          type: 'sin_cobertura',
          date: day.date,
          detail: 'No hay residentes disponibles (todos bloqueados) para este turno.',
        });
        continue;
      }

      const sabPref = isSabadoOrPreferiado(day);

      let best: { r: Resident; gap: number } | null = null;
      let bestScore = Infinity;
      for (const cand of pool) {
        let score = totals[cand.r.id] * W_TOTAL;
        if (sabPref) score += sabPrefCount[cand.r.id] * W_SAB_PREF;
        if (day.isHoliday) score += feriadoCount[cand.r.id] * W_FERIADO;
        if (strongHere.has(cand.r.id)) score -= BONUS_STRONG;
        if (softHere.has(cand.r.id)) score -= BONUS_SOFT;
        if (sabPref && hadSabOrPrefThisMonth.has(cand.r.id)) score += PENALTY_DOUBLE_SAB_PREF;
        if (cand.gap !== Infinity && cand.gap <= options.minGapHard) {
          score += PENALTY_SHORT_GAP_PER_DAY * (options.minGapHard + 1 - cand.gap);
        } else if (cand.gap !== Infinity && cand.gap < options.minGapIdeal) {
          score += (options.minGapIdeal - cand.gap) * 2;
        }
        score += rng() * 3; // jitter para desempatar / diversificar intentos
        if (score < bestScore) {
          bestScore = score;
          best = cand;
        }
      }

      const chosen = best!.r;
      assignments.push({ date: day.date, slotIndex: slot, residentId: chosen.id });
      totals[chosen.id]++;
      if (sabPref) {
        sabPrefCount[chosen.id]++;
        if (hadSabOrPrefThisMonth.has(chosen.id)) {
          violations.push({
            type: 'sabado_y_preferiado_mismo_mes',
            date: day.date,
            residentId: chosen.id,
            detail: `${chosen.shortName} ya tenía un sábado/preferiado este mes.`,
          });
        }
        hadSabOrPrefThisMonth.add(chosen.id);
      }
      if (day.isHoliday) feriadoCount[chosen.id]++;
      if (best!.gap !== Infinity && best!.gap <= options.minGapHard) {
        violations.push({
          type: 'distancia_corta',
          date: day.date,
          residentId: chosen.id,
          detail: `Solo ${best!.gap} día(s) desde la guardia anterior de ${chosen.shortName}.`,
        });
      }
      if (strongHere.has(chosen.id)) strongSatisfied.add(`${day.date}|${chosen.id}`);
      lastShiftDate[chosen.id] = day.date;
    }
  }

  for (const [date, ids] of strong) {
    for (const residentId of ids) {
      if (!strongSatisfied.has(`${date}|${residentId}`)) {
        const r = residents.find((x) => x.id === residentId);
        violations.push({
          type: 'pedido_fuerte_no_cumplido',
          date,
          residentId,
          detail: `No se pudo asignar a ${r?.shortName ?? residentId} el ${date} como pedía.`,
        });
      }
    }
  }

  const values = Object.values(totals);
  const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length || 1);

  const violationWeight: Record<ViolationType, number> = {
    sin_cobertura: 500,
    distancia_corta: 40,
    pedido_fuerte_no_cumplido: 60,
    sabado_y_preferiado_mismo_mes: 15,
  };
  const violationScore = violations.reduce((acc, v) => acc + violationWeight[v.type], 0);

  return {
    assignments,
    violations,
    totals,
    score: variance * 20 + violationScore,
  };
}

/**
 * Genera una propuesta de cronograma para `input.days` respetando bloqueos
 * (duro), intentando cumplir pedidos fuertes y preferencias (blando), la
 * regla de distancia mínima entre guardias y la equidad acumulada (incluido
 * el arrastre de meses anteriores vía `priorCounters`). Corre varios
 * intentos con jitter aleatorio y devuelve el de menor `score`.
 *
 * Nota: hoy devuelve una sola propuesta con su lista de violaciones/avisos.
 * El roadmap habla de 3 opciones (equidad / pedidos / descanso); se puede
 * lograr llamando esta función 3 veces con pesos distintos — queda para
 * una iteración futura, documentada en README.
 */
export function generateSchedule(input: GeneratorInput): GeneratorResult {
  const options: GeneratorOptions = { ...DEFAULT_OPTIONS, ...input.options };
  const activeResidents = input.residents.filter((r) => r.active);

  let bestResult: GeneratorResult | null = null;
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    const rng = mulberry32(attempt * 7919 + 13);
    const result = runAttempt({
      days: input.days,
      residents: activeResidents,
      requests: input.requests,
      priorCounters: input.priorCounters ?? {},
      priorLastShiftDate: input.priorLastShiftDate ?? {},
      options,
      rng,
    });
    if (!bestResult || result.score < bestResult.score) {
      bestResult = result;
    }
  }

  return bestResult!;
}

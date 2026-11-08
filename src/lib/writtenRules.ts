import { shortDateLabel } from './dates';
import type { Resident, ResolvedDay } from '../types';

/**
 * Reglas escritas a mano para el generador, una por línea. Ejemplos:
 *   Pérez jueves 3            → Pérez va sí o sí el 3
 *   Pérez 3 y 17              → va el 3 y el 17
 *   Pérez no 5                → no puede el 5 (también "sin", "nunca")
 *   Pérez no jueves           → no puede ningún jueves del mes
 *   Gómez no del 20 al 27   → no puede del 20 al 27
 *   Pérez no feriados         → ningún feriado del mes
 *   solo Díaz y Ruiz el 25 → ese día solo pueden ellas
 * Lo que no se entiende se muestra aparte y no se aplica.
 */
export type WrittenRuleKind = 'fijar' | 'bloquear' | 'solo';

export interface WrittenRule {
  kind: WrittenRuleKind;
  line: string;
  residentIds: string[];
  dates: string[];
  summary: string;
  warnings: string[];
}

export interface ParsedWrittenRules {
  rules: WrittenRule[];
  unknown: { line: string; why: string }[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const WEEKDAYS: [RegExp, number][] = [
  [/\blunes\b/, 0],
  [/\bmartes\b/, 1],
  [/\bmiercoles\b/, 2],
  [/\bjueves\b/, 3],
  [/\bviernes\b/, 4],
  [/\bsabados?\b/, 5],
  [/\bdomingos?\b/, 6],
];
const STOP = new Set(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'solo', 'todos', 'todas', 'feriado', 'feriados', 'nunca']);
const WD_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

function residentMatchers(residents: Resident[]) {
  const phrases = new Map<string, Set<string>>();
  const add = (p: string, id: string) => {
    const k = norm(p).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (k.length < 3 || STOP.has(k)) return;
    phrases.set(k, (phrases.get(k) ?? new Set()).add(id));
  };
  for (const r of residents) {
    add(r.shortName, r.id);
    add(r.name, r.id);
    for (const w of `${r.name} ${r.shortName}`.split(/\s+/)) if (norm(w).length >= 4) add(w, r.id);
    const words = r.shortName.split(/\s+/).filter(Boolean);
    if (words.length >= 2) add(words.map((w) => w[0]).join(''), r.id); // "SDM"
  }
  // Solo las que identifican a una sola persona; las más largas primero.
  return [...phrases.entries()]
    .filter(([, ids]) => ids.size === 1)
    .map(([p, ids]) => ({ re: new RegExp(`(^|[^a-z0-9])${p.replace(/ /g, '\\s+')}(?=$|[^a-z0-9])`, 'g'), id: [...ids][0], len: p.length }))
    .sort((a, b) => b.len - a.len);
}

export function parseWrittenRules(text: string, monthKey: string, residents: Resident[], days: ResolvedDay[]): ParsedWrittenRules {
  const out: ParsedWrittenRules = { rules: [], unknown: [] };
  const matchers = residentMatchers(residents);
  const monthNum = Number(monthKey.slice(5, 7));
  const dayByNum = new Map(days.map((d) => [Number(d.date.slice(8)), d]));
  const short = (id: string) => residents.find((r) => r.id === id)?.shortName ?? '?';
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);

  for (const raw of text.split(/\n|;/)) {
    const line = raw.trim().replace(/^[-•*·🔒📝✍️\s]+/u, '');
    if (!line) continue;
    let s = ` ${norm(line).replace(/[.,:!¡?¿()"']/g, ' ')} `;

    const ids: string[] = [];
    for (const m of matchers) {
      if (m.re.test(s)) {
        if (!ids.includes(m.id)) ids.push(m.id);
        s = s.replace(m.re, '$1 ');
      }
      m.re.lastIndex = 0;
    }

    const warnings: string[] = [];
    const nums = new Set<number>();
    // 3/12 o 3-12
    s = s.replace(/\b(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*\d{2,4})?\b/g, (_, d, m) => {
      if (Number(m) === monthNum) nums.add(Number(d));
      else warnings.push(`${d}/${m} no es de este mes: lo ignoro`);
      return ' ';
    });
    // del 20 al 27
    s = s.replace(/\b(\d{1,2})\s+(?:al|hasta(?:\s+el)?)\s+(?:el\s+)?(\d{1,2})\b/g, (_, a, b) => {
      for (let i = Number(a); i <= Number(b); i++) nums.add(i);
      return ' ';
    });
    s = s.replace(/\b(\d{1,2})\b/g, (_, d) => {
      nums.add(Number(d));
      return ' ';
    });

    const wds = WEEKDAYS.filter(([re]) => re.test(s)).map(([, w]) => w);
    const feriados = /\bferiados?\b/.test(s);
    const negative = /\b(no|sin|nunca|ningun|ninguna|bloquear|bloqueo|bloqueada|libre)\b/.test(s);
    const only = /\b(solo|solamente|unicamente)\b/.test(s);

    let dates: string[] = [];
    if (nums.size) {
      for (const n of [...nums].sort((a, b) => a - b)) {
        const d = dayByNum.get(n);
        if (!d) {
          warnings.push(`el ${n} no existe en este mes`);
          continue;
        }
        if (wds.length && !wds.includes(d.weekday)) warnings.push(`ojo: el ${n} es ${WD_SHORT[d.weekday]}, no ${wds.map((w) => WD_SHORT[w]).join('/')}`);
        dates.push(d.date);
      }
    } else if (wds.length || feriados) {
      dates = days.filter((d) => wds.includes(d.weekday) || (feriados && d.isHoliday)).map((d) => d.date);
    }

    if (!ids.length) {
      out.unknown.push({ line, why: 'no reconozco a ninguna residente' });
      continue;
    }
    if (!dates.length) {
      out.unknown.push({ line, why: warnings[0] ?? 'no encuentro qué día(s)' });
      continue;
    }

    const who = list(ids.map(short));
    const when = dates.length > 6 ? `${dates.length} días (${dates.slice(0, 3).map(shortDateLabel).join(', ')}…)` : list(dates.map(shortDateLabel));
    const kind: WrittenRuleKind = only ? 'solo' : negative ? 'bloquear' : 'fijar';
    const summary =
      kind === 'solo'
        ? `👥 Solo ${who} pueden: ${when}`
        : kind === 'bloquear'
          ? `⛔ ${who} no: ${when}`
          : `📌 ${who} ${ids.length > 1 ? 'van' : 'va'} sí o sí: ${when}`;
    out.rules.push({ kind, line, residentIds: ids, dates, summary, warnings });
  }

  // Avisos de choques: más fijadas que lugares, o fijada y bloqueada el mismo día.
  const presetCount = new Map<string, number>();
  for (const r of out.rules) if (r.kind === 'fijar') for (const d of r.dates) presetCount.set(d, (presetCount.get(d) ?? 0) + r.residentIds.length);
  for (const r of out.rules) {
    for (const d of r.dates) {
      const day = days.find((x) => x.date === d)!;
      if (r.kind === 'fijar' && (presetCount.get(d) ?? 0) + (day.presetResidents?.length ?? 0) > day.requiredR1) {
        r.warnings.push(`el ${Number(d.slice(8))} hay más fijadas que lugares (${day.requiredR1})`);
      }
      if (r.kind === 'fijar') {
        const clash = out.rules.find((o) => o.kind === 'bloquear' && o.dates.includes(d) && o.residentIds.some((id) => r.residentIds.includes(id)));
        if (clash) r.warnings.push(`el ${Number(d.slice(8))} también figura como "no": gana el "no"`);
      }
    }
    r.warnings = [...new Set(r.warnings)];
  }
  return out;
}

/**
 * Aplica las reglas a los días y devuelve qué bloquear: las fijadas van a
 * `presetResidents`, "solo" restringe `onlyResidents` y "no" va como no
 * disponible (con el motivo "regla escrita").
 */
export function applyWrittenRules(days: ResolvedDay[], parsed: ParsedWrittenRules) {
  const blocked = new Map<string, Set<string>>(); // residentId -> fechas
  for (const r of parsed.rules) {
    if (r.kind !== 'bloquear') continue;
    for (const id of r.residentIds) for (const d of r.dates) (blocked.get(id) ?? blocked.set(id, new Set()).get(id)!).add(d);
  }
  const isBlocked = (id: string, d: string) => !!blocked.get(id)?.has(d);

  const out = days.map((day) => {
    let next = day;
    for (const r of parsed.rules) {
      if (!r.dates.includes(day.date)) continue;
      if (r.kind === 'fijar') {
        const add = r.residentIds.filter((id) => !isBlocked(id, day.date) && !(next.presetResidents ?? []).includes(id));
        if (add.length) next = { ...next, presetResidents: [...(next.presetResidents ?? []), ...add].slice(0, Math.max(day.requiredR1, 0)) };
      } else if (r.kind === 'solo') {
        const only = next.onlyResidents?.length ? next.onlyResidents.filter((id) => r.residentIds.includes(id)) : r.residentIds;
        next = { ...next, onlyResidents: only, onlyNote: next.onlyNote ?? 'regla escrita' };
      }
    }
    return next;
  });
  const unavailable = [...blocked.entries()].map(([residentId, dates]) => ({ residentId, dates: [...dates], reason: 'regla:regla escrita' }));
  return { days: out, unavailable };
}

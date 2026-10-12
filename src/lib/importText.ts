import type { Resident } from '../types';

export interface ParsedLine {
  line: number;
  raw: string;
  date?: string;
  residentIds: string[];
  empty?: boolean; // "sin R1"
  error?: string;
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12,
};

const WEEKDAYS = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|lun|mar|mie|jue|vie|sab|dom)\b\.?/g;

// Palabras que no pueden ser apodos (días, meses y conectores).
const RESERVED = new Set([
  'lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom', 'ene', 'feb', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'sept',
  'oct', 'nov', 'dic', 'sin', 'con', 'del', 'las', 'los', 'una', 'uno',
]);

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9/\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliasesFor(r: Resident): string[] {
  const full = norm(r.name);
  const out = new Set<string>([norm(r.shortName), full, full.split(' ').slice(1).join(' ')]);
  for (const w of norm(r.name).split(' ')) if (w.length >= 3 && !['de', 'del', 'di', 'la'].includes(w)) out.add(w);
  // Apodos del nombre de pila: el principio del nombre y su diminutivo con "i"
  // (Valentina → vale, Florencia → flor, Martina → marti, Juan → juani).
  const first = full.split(' ')[0] ?? '';
  for (let n = 3; n <= first.length; n++) {
    const p = first.slice(0, n);
    if (n < first.length) out.add(p);
    if (n >= 3) out.add(`${p}i`);
  }
  return [...out].filter((a) => a && !RESERVED.has(a));
}

/**
 * Interpreta un cronograma escrito a mano o pegado de un chat. Una guardia
 * por línea: "1/11 Pérez", "2026-11-07 Gómez", "Sábado 7: Pérez, Gómez",
 * "3/11 sin R1". Si la línea no trae mes, se usa `monthKey`. Reconoce nombres
 * cortos, apellidos y apodos del nombre de pila (Vale, Flor, Juani…).
 */
export function parseScheduleText(text: string, monthKey: string, residents: Resident[]): ParsedLine[] {
  const [defYear, defMonth] = monthKey.split('-').map(Number);
  const aliases = residents
    .flatMap((r) => aliasesFor(r).map((a) => ({ alias: a, id: r.id })))
    .sort((a, b) => b.alias.length - a.alias.length);
  // Un apodo que le sirve a más de una persona es ambiguo: no se usa.
  const owners = new Map<string, Set<string>>();
  for (const { alias, id } of aliases) owners.set(alias, (owners.get(alias) ?? new Set()).add(id));
  const unique = aliases.filter(({ alias }) => owners.get(alias)!.size === 1);

  const out: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    let s = norm(raw);
    if (!s || /^(fecha|dia)\b/.test(s) && !/\d/.test(s)) return;
    const res: ParsedLine = { line: i + 1, raw: raw.trim(), residentIds: [] };

    let y = defYear;
    let m = defMonth;
    let d: number | null = null;
    let match: RegExpMatchArray | null;
    if ((match = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) {
      [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    } else if ((match = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
      d = Number(match[1]);
      m = Number(match[2]);
      if (match[3]) y = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
      else if (m < defMonth - 6) y = defYear + 1;
    } else if ((match = s.match(/\b(\d{1,2})(?:\s+de)?\s+([a-z]+)\b/)) && MONTHS[match[2]]) {
      d = Number(match[1]);
      m = MONTHS[match[2]];
      if (m < defMonth - 6) y = defYear + 1;
    } else if ((match = s.match(/\b(\d{1,2})\b/))) {
      d = Number(match[1]);
    }
    if (match) s = s.replace(match[0], ' ');
    s = s.replace(WEEKDAYS, ' ');

    const valid = d !== null && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (!valid) {
      out.push({ ...res, error: 'No encontré una fecha válida' });
      return;
    }
    res.date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    if (/\b(sin r1|sin cobertura|nadie|sin guardia)\b/.test(s)) {
      out.push({ ...res, empty: true });
      return;
    }
    let rest = ` ${s} `;
    for (const { alias, id } of unique) {
      const re = new RegExp(`(^|\\s)${alias.replace(/[-/]/g, '\\$&')}(?=\\s|$)`);
      if (re.test(rest)) {
        if (!res.residentIds.includes(id)) res.residentIds.push(id);
        rest = rest.replace(re, ' ');
      }
    }
    const leftover = rest.replace(/\b(y|e|de|di|del|la|guardia|r1|con)\b/g, ' ').replace(/[^a-z]/g, ' ').trim();
    if (res.residentIds.length === 0) res.error = 'No reconocí a nadie en la línea';
    else if (leftover) res.error = `No reconocí: "${leftover}"`;
    out.push(res);
  });
  return out;
}

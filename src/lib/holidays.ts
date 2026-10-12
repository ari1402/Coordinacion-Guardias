// Feriados oficiales de Argentina. ArgentinaDatos publica el calendario del
// Ministerio del Interior (inamovibles, trasladables ya trasladados, y días
// no laborables con fines turísticos = "puente") como JSON. CABA no tiene
// feriados propios aparte de los nacionales.
const SOURCE = 'https://api.argentinadatos.com/v1/feriados';

export interface OfficialHoliday {
  date: string;
  name: string;
  kind: 'inamovible' | 'trasladable' | 'puente' | 'sanidad' | 'local';
}

interface ApiHoliday {
  fecha: string;
  tipo: string;
  nombre: string;
}

/**
 * Días que para el hospital son feriado todos los años y no figuran en el
 * calendario nacional (mismo listado en scripts/sync-holidays.mjs).
 */
export const LOCAL_HOLIDAYS: { md: string; name: string; kind: 'sanidad' | 'local' }[] = [
  { md: '09-21', name: 'Día de la Sanidad', kind: 'sanidad' },
  { md: '12-24', name: 'Nochebuena', kind: 'local' },
  { md: '12-31', name: 'Fin de año', kind: 'local' },
];

export function localHolidays(year: number): OfficialHoliday[] {
  return LOCAL_HOLIDAYS.map((h) => ({ date: `${year}-${h.md}`, name: h.name, kind: h.kind }));
}

export async function fetchOfficialHolidays(year: number, includePuentes: boolean): Promise<OfficialHoliday[]> {
  const res = await fetch(`${SOURCE}/${year}`);
  if (!res.ok) throw new Error(`La fuente de feriados respondió ${res.status}`);
  const data = (await res.json()) as ApiHoliday[];
  const official: OfficialHoliday[] = data
    .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.fecha))
    .filter((h) => includePuentes || h.tipo !== 'puente')
    .map((h) => ({
      date: h.fecha,
      name: h.tipo === 'puente' ? `${h.nombre} (no laborable)` : h.nombre,
      kind: h.tipo === 'puente' ? 'puente' : h.tipo === 'trasladable' ? 'trasladable' : 'inamovible',
    }));
  return [...official, ...localHolidays(year)].sort((a, b) => a.date.localeCompare(b.date));
}

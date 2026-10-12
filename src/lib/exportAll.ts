import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { CalendarDay, MonthConfig, Resident, Rotation, Shift } from '../types';
import { todayISO } from './dates';
import { computeAllEquityCounters, resolvePeriod } from './equity';
import { awayMonths } from './rotations';
import { downloadBlob, downloadXlsx, type Cell, type Sheet } from './xlsx';

/** Colecciones que se exportan, con el nombre de su hoja en el Excel. */
const COLLECTIONS: [string, string][] = [
  ['residents', 'Residentes'],
  ['shifts', 'Guardias'],
  ['requests', 'Pedidos'],
  ['swaps', 'Cambios'],
  ['raffles', 'Sorteos'],
  ['acks', 'Conformidad'],
  ['publications', 'Publicaciones'],
  ['feedback', 'Feedback'],
  ['rotations', 'Carriles'],
  ['events', 'Eventos'],
  ['calendarDays', 'Días especiales'],
  ['monthConfigs', 'Config de meses'],
  ['scheduleDrafts', 'Borradores'],
  ['tasks', 'Tareas'],
  ['notes', 'Notas'],
  ['links', 'Links'],
  ['activity', 'Historial'],
];

type Doc = Record<string, unknown> & { id: string };
export type AllData = Record<string, Doc[]>;

/** Lee todo (solo admins tienen permiso para todas las colecciones). */
export async function fetchAll(): Promise<AllData> {
  const entries = await Promise.all(
    COLLECTIONS.map(async ([name]) => {
      const snap = await getDocs(collection(db, name));
      return [name, snap.docs.map((d) => ({ ...d.data(), id: d.id }))] as const;
    }),
  );
  return Object.fromEntries(entries);
}

const ID_KEYS = /(^by$|ResidentId$|^residentId$|^createdBy$|^resolvedBy$|^drawnBy$|^updatedBy$|^publishedBy$)/;
const SORT_KEYS = ['date', 'at', 'createdAt', 'id'];

function sheetFor(title: string, docs: Doc[], nameOf: (id: string) => string | undefined): Sheet {
  const keys = ['id', ...new Set(docs.flatMap((d) => Object.keys(d)).filter((k) => k !== 'id'))];
  const sortKey = SORT_KEYS.find((k) => keys.includes(k)) ?? 'id';
  const sorted = [...docs].sort((a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? '')));
  const show = (key: string, v: unknown): Cell => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' && ID_KEYS.test(key)) return nameOf(v) ?? v;
    if (Array.isArray(v) && /Ids$/.test(key)) return v.map((x) => nameOf(String(x)) ?? x).join(', ');
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 'sí' : 'no';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };
  return {
    name: title,
    rows: [keys.map((k) => ({ v: k, s: 'header' as const })), ...sorted.map((d) => keys.map((k) => show(k, d[k])))],
    cols: keys.map((k) => (k === 'id' ? 24 : /summary|body|comment|reason|notes|changes|months|slots|pending/i.test(k) ? 40 : 16)),
    freezeRows: 1,
  };
}

/** Resumen acumulado por persona (lo mismo que se ve en Métricas). */
function summarySheet(data: AllData): Sheet {
  const residents = data.residents as unknown as Resident[];
  const shifts = (data.shifts as unknown as Shift[]).filter((s) => s.status !== 'cancelada');
  const days = resolvePeriod(shifts, data.calendarDays as unknown as CalendarDay[], data.monthConfigs as unknown as MonthConfig[]);
  const counters = computeAllEquityCounters(
    residents.map((r) => r.id),
    shifts,
    days,
    awayMonths(data.rotations as unknown as Rotation[]),
  );
  const header = [
    'Residente', 'Guardias', 'Lun–Mié', 'Jue', 'Vie', 'Sáb', 'Sáb finde largo', 'Sáb sin jueves', 'Dom', 'Sáb + pref.', 'Feriados',
    'Findes XL', 'Jueves felices', 'Findes libres', 'Sin dormir', 'Separación mín.', 'Separación prom.',
  ];
  return {
    name: 'Resumen',
    rows: [
      [{ v: `Guardias R1 — acumulado al ${todayISO().split('-').reverse().join('/')}`, s: 'title' }],
      header.map((h) => ({ v: h, s: 'header' as const })),
      ...residents.map((r): Cell[] => {
        const c = counters[r.id];
        return [
          { v: r.name, s: 'bold' },
          c.totalGuardias, c.lunAMie, c.jueves, c.viernes, c.sabados, c.sabadosFindeLargo, c.sabadosSinCompensar, c.domingos, c.sabadosYPreferiados, c.feriados,
          c.findesXL, c.juevesFelices, c.findesLibresA, c.sinDormir, c.distanciaMinima ?? '—',
          c.distanciaPromedio === null ? '—' : Math.round(c.distanciaPromedio * 10) / 10,
        ];
      }),
    ],
    cols: [22, ...Array(16).fill(10)],
    merges: ['A1:H1'],
    freezeRows: 2,
    heights: { 1: 30 },
  };
}

export function downloadAllXlsx(data: AllData) {
  const residents = data.residents ?? [];
  const nameOf = (id: string) => residents.find((r) => r.id === id)?.shortName as string | undefined;
  downloadXlsx(`guardias-r1-todo-${todayISO()}.xlsx`, [
    summarySheet(data),
    ...COLLECTIONS.map(([key, title]) => sheetFor(title, data[key] ?? [], nameOf)),
  ]);
}

/** Copia de seguridad completa, tal cual está en la base (ids incluidos). */
export function downloadAllJson(data: AllData) {
  const payload = { exportadoEl: new Date().toISOString(), app: 'Guardias R1', colecciones: data };
  downloadBlob(`guardias-r1-backup-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

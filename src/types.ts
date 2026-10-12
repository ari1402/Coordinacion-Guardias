// Modelo de dominio para la coordinación de guardias de R1.
// Los documentos de Firestore siguen exactamente estas formas (ver src/firebase.ts
// y firestore.rules para las colecciones correspondientes).

export type Role = 'resident' | 'admin';

export interface Resident {
  id: string; // = uid de Firebase Auth
  name: string; // "Ana Alba"
  shortName: string; // "Alba"
  email: string;
  role: Role;
  active: boolean;
  createdAt?: string;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = lunes ... 6 = domingo

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: 'Lunes',
  1: 'Martes',
  2: 'Miércoles',
  3: 'Jueves',
  4: 'Viernes',
  5: 'Sábado',
  6: 'Domingo',
};

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export type WeekdayRequirements = Record<WeekdayKey, number>;

/** Config de requerimiento de R1 por día de semana para un mes dado (editable). */
export interface MonthConfig {
  id: string; // "YYYY-MM"
  weekdayRequirements: WeekdayRequirements;
  label?: string;
}

/**
 * Un día del calendario. Las "características" (preferiado, finde XL, jueves
 * feliz, sin cobertura) se derivan en runtime a partir de isHoliday +
 * requiredR1 + los días vecinos — ver src/lib/dates.ts — para que el feriado
 * sea la única fuente de verdad y no haya que mantener dos lugares en sync.
 */
export interface CalendarDay {
  id: string; // "YYYY-MM-DD"
  date: string; // ISO date, igual a id
  isHoliday: boolean;
  holidayName?: string;
  /** Si está definido, pisa el default de WeekdayRequirements para este día puntual. */
  requiredR1Override?: number;
  notes?: string;
}

export type DayTag =
  | 'feriado'
  | 'preferiado'
  | 'finde_xl'
  | 'jueves_feliz'
  | 'sin_cobertura'
  | 'finde'
  | 'sabado_comun'
  | 'sabado_finde_largo';

/** Día del calendario ya resuelto con sus etiquetas derivadas, listo para UI/algoritmo. */
export interface ResolvedDay {
  id: string;
  date: string;
  weekday: Weekday;
  requiredR1: number;
  isHoliday: boolean;
  holidayName?: string;
  tags: DayTag[];
  notes?: string;
}

export type ShiftStatus = 'programada' | 'realizada' | 'cancelada';

/**
 * Una guardia concreta: una fecha + slot (para cuando requiredR1 > 1).
 * assignedResidentId es la asignación "oficial" publicada; actualResidentId
 * es quien realmente la hizo (por default igual, diverge si hubo swap).
 */
export interface Shift {
  id: string;
  date: string; // "YYYY-MM-DD"
  slotIndex: number; // 0, 1, ... por si hay más de un R1 ese día
  assignedResidentId: string;
  actualResidentId: string;
  status: ShiftStatus;
  swapId?: string;
  createdAt: string;
  updatedAt?: string;
}

export type RequestType = 'bloqueo' | 'pedido_fuerte' | 'preferencia';
export type RequestStatus = 'pendiente' | 'aceptado' | 'rechazado' | 'parcial';

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  bloqueo: 'Bloqueo (imposible)',
  pedido_fuerte: 'Pedido fuerte',
  preferencia: 'Preferencia',
};

export const REQUEST_TYPE_PRIORITY: Record<RequestType, number> = {
  bloqueo: 0,
  pedido_fuerte: 1,
  preferencia: 2,
};

/** Pedido de un residente sobre una o más fechas. Visible para todos (transparencia). */
export interface GuardiaRequest {
  id: string;
  residentId: string;
  type: RequestType;
  dates: string[]; // fechas puntuales "YYYY-MM-DD"
  reason: string;
  status: RequestStatus;
  resolutionNote?: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

/**
 * Feedback post-guardia. Colección sensible: solo el autor y los admins
 * (Bea Bravo / Ana Alba) pueden leerla — ver firestore.rules.
 */
export interface ShiftFeedback {
  id: string;
  shiftId: string;
  residentId: string;
  date: string;
  slept: boolean;
  hoursSlept?: number;
  conformidad: 1 | 2 | 3 | 4 | 5; // conformidad con el cronograma de esa guardia
  comentario?: string;
  createdAt: string;
}

export type SwapStatus = 'solicitado' | 'confirmado' | 'rechazado';

/** Intercambio de guardias. Si no hay contraprestación inmediata, genera deuda. */
export interface Swap {
  id: string;
  shiftId: string;
  date: string;
  fromResidentId: string; // quien tenía la guardia originalmente
  toResidentId: string; // quien finalmente la hace
  reason?: string;
  status: SwapStatus;
  generatesDebt: boolean;
  debtSettled?: boolean;
  createdBy: string;
  createdAt: string;
}

/** Contadores de equidad acumulados para un residente en un período. */
export interface EquityCounters {
  residentId: string;
  totalGuardias: number;
  sabados: number;
  preferiados: number;
  sabadosYPreferiados: number;
  feriados: number;
  findesXL: number;
  juevesFelices: number;
  viernes: number;
  domingos: number;
  findesLibresA: number; // sin guardia vie/sáb/dom
  findesLibresB: number; // estricto: tampoco posguardia del jueves
  distanciaMinima: number | null;
  distanciaPromedio: number | null;
}

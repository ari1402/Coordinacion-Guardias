// Modelo de dominio para la coordinación de guardias de R1.
// Los documentos de Firestore siguen exactamente estas formas (ver
// firestore.rules para quién puede leer/escribir cada colección).
// Todas las fechas de auditoría (createdAt, etc.) son strings ISO.

export type Role = 'resident' | 'admin';

export interface Resident {
  id: string; // = uid de Firebase Auth
  name: string; // "Ana Alba"
  shortName: string; // "Alba"
  email: string;
  role: Role;
  active: boolean;
  /** "MM-DD". No se asigna guardia ese día ni el anterior. */
  birthday?: string;
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

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: 'Lun',
  1: 'Mar',
  2: 'Mié',
  3: 'Jue',
  4: 'Vie',
  5: 'Sáb',
  6: 'Dom',
};

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export type WeekdayRequirements = Record<WeekdayKey, number>;

/** Reglas internas del mes que usa el generador. */
export interface MonthRules {
  /** Distancia (días) que se considera prohibida: gap <= minGapHard. */
  minGapHard: number;
  /** Distancia a partir de la cual se considera ideal. */
  minGapIdeal: number;
  /** Tope de guardias por persona en el mes (0 = sin tope). */
  maxPerPerson: number;
  /** Evitar que alguien repita el mismo día de la semana en el mes. */
  avoidSameWeekday: boolean;
  /** Evitar sábado + preferiado (o dos de esa categoría) a la misma persona en el mes. */
  avoidDoubleSatPref: boolean;
  /** Quien tenga sábado común, que en lo posible tenga también un jueves. */
  sabadoComunConJueves: boolean;
  /**
   * Quien hace guardia un jueves tiene libre el posguardia y todo ese finde:
   * no vuelve a tener guardia hasta el primer día hábil siguiente.
   */
  juevesLibraFinde: boolean;
}

/**
 * Config del mes. Si un mes no tiene doc, se hereda la del mes anterior más
 * cercano que tenga (ver effectiveMonthConfig en lib/dates.ts), así un cambio
 * de esquema (p. ej. "desde marzo 2 R1 mar/jue/vie/sáb/dom") se carga una vez.
 */
export interface MonthConfig {
  id: string; // "YYYY-MM"
  weekdayRequirements: WeekdayRequirements;
  rules?: Partial<MonthRules>;
  /** Reglas/acuerdos internos del mes en texto libre (visibles para todos). */
  notes?: string;
}

/**
 * Overrides puntuales de un día. Solo existen docs para los días que tienen
 * algo distinto (feriado, cobertura especial, nota): el resto del mes se
 * sintetiza (ver buildMonthDays en lib/dates.ts).
 */
export interface CalendarDay {
  id: string; // "YYYY-MM-DD"
  date: string;
  isHoliday: boolean;
  holidayName?: string;
  /** De dónde salió el feriado: importado oficial, sanidad o cargado a mano. */
  holidaySource?: 'oficial' | 'sanidad' | 'local' | 'manual';
  /** Si está definido, pisa el R1 requerido por día de semana. */
  requiredR1Override?: number | null;
  /**
   * Lugares (índice de slot) que ese día toma otra persona, p. ej. residentes
   * mayores: no se asignan a R1 y no cuentan como faltantes.
   */
  disabledSlots?: number[];
  disabledNote?: string | null;
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
  | 'sabado_finde_largo'
  | 'r_mayores';

/** Día ya resuelto con sus etiquetas derivadas, listo para UI/algoritmo. */
export interface ResolvedDay {
  id: string;
  date: string;
  weekday: Weekday;
  /** R1 que hay que asignar (ya descontados los lugares deshabilitados). */
  requiredR1: number;
  /** Índices de slot deshabilitados (los toma otra persona). */
  disabledSlots?: number[];
  disabledNote?: string;
  isHoliday: boolean;
  holidayName?: string;
  tags: DayTag[];
  notes?: string;
}

export type ShiftStatus = 'programada' | 'realizada' | 'cancelada';

/**
 * Una guardia: fecha + slot (slotIndex > 0 cuando hay más de un R1).
 * assignedResidentId = asignación publicada; actualResidentId = quien
 * realmente la hizo (diverge si hubo cambio). Todas las métricas usan actual.
 */
export interface Shift {
  id: string; // "YYYY-MM-DD_slot"
  date: string;
  slotIndex: number;
  assignedResidentId: string;
  actualResidentId: string;
  status: ShiftStatus;
  swapId?: string;
  raffleId?: string;
  /** Lo carga quien hizo la guardia en su feedback. Es público (métrica de visibilidad). */
  slept?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type RequestType = 'bloqueo' | 'pedido_fuerte' | 'preferencia';
/**
 * off = no puedo / no quiero estar de guardia; on = quiero esa guardia;
 * posguardia = necesito el posguardia de esa fecha (= guardia el día anterior).
 */
export type RequestIntent = 'off' | 'on' | 'posguardia';
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

/**
 * Pedido de un residente sobre una o más fechas. Visible para todos.
 * intent 'on' con varias fechas = "alguna de estas" (p. ej. sábado 7 o 21).
 * intent 'off' con varias fechas = "ninguna de estas" (p. ej. vacaciones).
 */
export interface GuardiaRequest {
  id: string;
  residentId: string;
  type: RequestType;
  intent?: RequestIntent; // docs viejos no lo tienen: ver requestIntent()
  dates: string[];
  reason: string;
  status: RequestStatus;
  /** Quién lo cargó (una admin puede cargarlo en nombre de otra persona). */
  createdBy?: string;
  /**
   * Pedido de alguien de afuera de la camada (p. ej. un residente mayor que
   * pide una guardia): residentId = EXTERNAL_REQUESTER y acá va el nombre.
   */
  externalName?: string;
  resolutionNote?: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export const EXTERNAL_REQUESTER = 'externo';

/** Nombre de quien hace el pedido (residente de la camada o persona de afuera). */
export function requesterName(r: GuardiaRequest, byId: Map<string, { shortName: string }>): string {
  return r.externalName || byId.get(r.residentId)?.shortName || '?';
}

export function requestIntent(r: GuardiaRequest): RequestIntent {
  if (r.type === 'bloqueo') return 'off';
  return r.intent ?? 'on';
}

function minusOneDay(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Fechas de guardia a las que se refiere el pedido (posguardia del 10 = guardia el 9). */
export function requestShiftDates(r: GuardiaRequest): string[] {
  return requestIntent(r) === 'posguardia' ? r.dates.map(minusOneDay) : r.dates;
}

/** "Quiere estar de guardia" (directo o para tener el posguardia). */
export function wantsShift(r: GuardiaRequest): boolean {
  return requestIntent(r) !== 'off';
}

/**
 * Feedback post-guardia. Privado: solo el autor y los admins lo leen.
 * El dato "dormiste" además se copia a Shift.slept para que sea visible.
 */
export interface ShiftFeedback {
  id: string;
  shiftId: string;
  residentId: string;
  date: string;
  slept: boolean;
  /** Carga de la guardia, 1 (tranquila) a 10 (durísima). */
  carga?: number;
  comentario?: string;
  createdAt: string;
}

export type SwapStatus = 'solicitado' | 'confirmado' | 'rechazado';

export interface Swap {
  id: string;
  shiftId: string;
  date: string;
  fromResidentId: string;
  toResidentId: string;
  reason?: string;
  status: SwapStatus;
  generatesDebt: boolean;
  debtSettled?: boolean;
  createdBy: string;
  createdAt: string;
}

export interface LinkItem {
  id: string;
  title: string;
  url: string;
  tags: string[];
  description?: string;
  pinned?: boolean;
  createdBy: string;
  createdAt: string;
}

export type TaskStatus = 'pendiente' | 'en_curso' | 'hecha';

export interface CamadaTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assigneeIds: string[];
  dueDate?: string;
  category?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export const NOTE_CATEGORIES = ['AAARBA', 'Cursos y clases', 'Rotaciones', 'Administrativo', 'Otro'] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export interface InfoNote {
  id: string;
  title: string;
  body: string;
  category: NoteCategory;
  pinned?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

/** Carril (rotación) de cada R1 por mes. Doc id = residentId. */
export interface Rotation {
  id: string;
  /** "YYYY-MM" -> código del carril (QC, UCA, Vacaciones…). */
  months: Record<string, string>;
  updatedAt?: string;
}

/** Evento de la camada (p. ej. clases de AAARBA): se ve en el calendario y en Inicio. */
export interface CamadaEvent {
  id: string;
  title: string;
  dates: string[];
  category?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

/**
 * Publicación de un mes. `pending` marca, por residente, desde cuándo tiene
 * que confirmar sus guardias (se actualiza cuando una republicación le cambia
 * alguna). `notified` lo pone en true el script que manda el push.
 */
export interface Publication {
  id: string; // "YYYY-MM"
  publishedAt: string;
  publishedBy: string;
  pending: Record<string, string>;
  lastAffected: string[];
  notified: boolean;
}

/** "¿Estás OK con tus guardias del mes?" Doc id = "YYYY-MM_residentId". */
export interface MonthAck {
  id: string;
  month: string;
  residentId: string;
  ok: boolean;
  comment?: string;
  at: string;
  /** El script ya avisó a las admins (solo aplica a ok = false). */
  notified: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}

export type RaffleStatus = 'pendiente' | 'sorteado';

export interface Raffle {
  id: string;
  title: string;
  description?: string;
  participantIds: string[];
  winnersCount: number;
  status: RaffleStatus;
  /** Orden completo resultante del sorteo; los primeros winnersCount ganan. */
  order?: string[];
  drawnBy?: string;
  drawnAt?: string;
  /** Si el sorteo es por una guardia puntual del generador. */
  linkedSlot?: { date: string; slotIndex: number };
  createdBy: string;
  createdAt: string;
}

/** Un slot del editor del generador. */
export interface DraftSlot {
  date: string;
  slotIndex: number;
  residentId: string | null;
  locked?: boolean;
  raffleId?: string;
}

/** Borrador de cronograma de un mes (solo admins). */
export interface ScheduleDraft {
  id: string; // "YYYY-MM"
  slots: DraftSlot[];
  updatedBy: string;
  updatedAt: string;
}

/** Contadores de equidad de un residente en un período. */
export interface EquityCounters {
  residentId: string;
  totalGuardias: number;
  lunAMie: number;
  jueves: number;
  viernes: number;
  sabados: number;
  domingos: number;
  preferiados: number;
  sabadosYPreferiados: number;
  feriados: number;
  findesXL: number;
  juevesFelices: number;
  findeTotal: number; // vie + sáb + dom
  findesLibresA: number; // sin guardia vie/sáb/dom
  findesLibresB: number; // además sin posguardia del jueves
  distanciaMinima: number | null;
  distanciaPromedio: number | null;
  sinDormir: number; // guardias reportadas sin dormir
  conReporteSueno: number; // guardias con dato de sueño cargado
}

// Tipos de dominio del gestor de personal (misma lógica que la versión de escritorio).

/**
 * Turno: «M» = mañana, «T» = tarde, o la sigla de un turno personalizado
 * definido en Ajustes (letra, número o carácter especial).
 */
export type Turno = string;

/**
 * Tipo de turno (base M/T o personalizado). `desde`/`hasta` son la hora de
 * inicio y fin (HH:MM) «por hora»; también los tienen Mañana y Tarde por
 * defecto y son editables en Ajustes (se usan en la vista Avanzada del
 * calendario para saber qué franjas de 30 min cubre cada turno).
 */
export interface TipoTurno {
  id: number;
  /** Nombre legible, p. ej. «Noche». */
  nombre: string;
  /** Sigla mostrada en el calendario: 1 carácter (letra, número o especial). */
  sigla: string;
  /** Color de fondo en el calendario (hex #RRGGBB). */
  color: string;
  /** Hora de inicio (HH:MM) opcional. */
  desde?: string;
  /** Hora de fin (HH:MM) opcional. */
  hasta?: string;
  /** Si participa también en la rotación automática (además de M y T). */
  automatico: boolean;
}

/** Cierre de la empresa por un período concreto (p. ej. vacaciones). */
export interface PeriodoCierre {
  inicio: Fecha;
  fin: Fecha;
}

/**
 * Turnos base «Mañana» y «Tarde». Viven en `tiposTurno` como cualquier otro
 * (ids negativos para distinguirlos de los personalizados), así que también se
 * pueden borrar desde Ajustes. Si se borran se deja de programar ese turno.
 * `desde`/`hasta` es el horario por defecto, editable en Ajustes, que la vista
 * Avanzada del calendario usa para pintar sus franjas de 30 minutos.
 */
export const TIPOS_TURNO_BASE: TipoTurno[] = [
  { id: -1, nombre: "Mañana", sigla: "M", color: "#F6C453", desde: "06:00", hasta: "14:00", automatico: true },
  { id: -2, nombre: "Tarde", sigla: "T", color: "#AECDF5", desde: "14:00", hasta: "22:00", automatico: true }
];

/** True si el turno es uno de los fijos (Mañana/Tarde) y no un personalizado. */
export function esTurnoBase(t: TipoTurno): boolean {
  return t.id < 0;
}

/** Color de texto legible (claro u oscuro) sobre un fondo hex. */
export function tintaSobre(fondo: string): string {
  const h = fondo.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#20242f" : "#ffffff";
}

/**
 * Origen de una asignación en el calendario.
 *  * `auto`: generada automáticamente por el planificador;
 *  * `empresa`: fijada a mano por la empresa (se muestra en rojo);
 *  * `intercambio`: fijada a mano por un cambio entre empleados (marrón).
 */
export type Origen = "auto" | "empresa" | "intercambio";

/** Fecha en formato ISO local (YYYY-MM-DD). */
export type Fecha = string;

export interface Empleado {
  id: number;
  nombre: string;
  apellidos: string;
  dni: string;
  nss: string;
  /** Teléfono de contacto. */
  telefono: string;
  /** Cuenta bancaria / IBAN. */
  iban: string;
  /** Fecha de nacimiento (ISO) o null si no consta. */
  nacimiento: Fecha | null;
  /** Color hex #RRGGBB usado en calendario, avatares y PDF. */
  color: string;
  diasVacacionesAnuales: number;
  /** Jornada contratada en horas semanales. */
  jornadaHoras: number;
  /** Salario bruto mensual en euros (null = sin especificar). */
  salarioBruto: number | null;
  /** Tipo de contrato, p. ej. «Indefinido». */
  tipoContrato: string;
  /** Fecha de alta (ISO). */
  alta: Fecha;
  /** Fecha de baja (ISO) o null si sigue activo. */
  baja: Fecha | null;
  /** Comentario asociado a la fecha de baja. */
  motivoBaja: string;
  /** Notas / observaciones internas. */
  notas: string;
}

export type TipoAusencia = "vacaciones" | "baja" | "asuntos" | "sinjustificar";

export interface Ausencia {
  id: number;
  empleadoId: number;
  inicio: Fecha;
  fin: Fecha;
  tipo: TipoAusencia;
  /** Comentario libre al registrar (justificante, motivo, observaciones…). */
  comentario?: string;
}

/**
 * Apunte de tiempo recuperable (horas extra hechas o pendientes de compensar).
 * `minutos` lleva signo: negativo = ha hecho horas extra; positivo = debe horas.
 */
export interface TiempoRecuperable {
  id: number;
  empleadoId: number;
  fecha: Fecha;
  minutos: number;
  /** Comentario libre al registrar (motivo, proyecto, justificante…). */
  comentario?: string;
}

export interface Asignacion {
  fecha: Fecha;
  turno: Turno;
  empleadoId: number;
  origen: Origen;
  /** Comentario libre al fijar el turno a mano (motivo, observaciones…). */
  comentario?: string;
}

/**
 * Tramo de la capa de planificación por horas de la vista Avanzada del
 * calendario: un empleado trabaja un día de `desde` a `hasta` (HH:MM, ambos
 * incluidos en franjas de 30 minutos). Es una capa aparte del calendario Simple
 * automático de M/T: no la regenera el planificador.
 */
export interface PlanAvanzado {
  id: number;
  empleadoId: number;
  /** Día planificado (ISO). */
  fecha: Fecha;
  /** Hora de inicio (HH:MM). */
  desde: string;
  /** Hora de fin (HH:MM). */
  hasta: string;
}

export interface Hueco {
  fecha: Fecha;
  turno: Turno;
  motivo: string;
}

/** Resultado del planificador para una quincena. */
export interface PlanResultado {
  auto: Asignacion[];
  huecos: Hueco[];
  sem1: Record<number, Turno>;
  sem2: Record<number, Turno>;
}

/** Nombre completo de un empleado. */
export function nombreCompleto(e: Empleado): string {
  return `${e.nombre} ${e.apellidos}`.trim();
}

/** Iniciales para el avatar. */
export function iniciales(e: Empleado): string {
  const n = (e.nombre || "").trim();
  const a = (e.apellidos || "").trim();
  const s = (n[0] || "") + (a[0] || "");
  return s ? s.toUpperCase() : "?";
}

/** Tipos de contrato habituales; el primero es el valor por defecto. */
export const TIPOS_CONTRATO = [
  "Indefinido",
  "Temporal",
  "Fijo discontinuo",
  "En prácticas",
  "De formación",
  "Relevo",
  "Otro"
] as const;

export const CONTRATO_POR_DEFECTO: string = TIPOS_CONTRATO[0];

/** Empleado con todos los campos rellenados a valores por defecto. */
export function plantillaEmpleado(parcial: Partial<Empleado> = {}): Empleado {
  return {
    id: 0,
    nombre: "",
    apellidos: "",
    dni: "",
    nss: "",
    telefono: "",
    iban: "",
    nacimiento: null,
    color: "#E91E63",
    diasVacacionesAnuales: 30,
    jornadaHoras: 40,
    salarioBruto: null,
    tipoContrato: CONTRATO_POR_DEFECTO,
    alta: "2000-01-01",
    baja: null,
    motivoBaja: "",
    notas: "",
    ...parcial
  };
}

export const TIPOS_AUSENCIA: {
  id: TipoAusencia;
  nombre: string;
  fondo: string;
  tinta: string;
  sigla: string;
}[] = [
  { id: "vacaciones", nombre: "Vacaciones", fondo: "#E3E4E8", tinta: "#5A6170", sigla: "V" },
  { id: "baja", nombre: "Baja médica", fondo: "#FBE4E6", tinta: "#C03948", sigla: "B" },
  { id: "asuntos", nombre: "Asuntos propios", fondo: "#FBEED9", tinta: "#B4710A", sigla: "A" },
  { id: "sinjustificar", nombre: "Sin justificar", fondo: "#EFE9FB", tinta: "#7A5CD0", sigla: "SJ" }
];

export function tipoInfo(t: TipoAusencia) {
  return TIPOS_AUSENCIA.find((x) => x.id === t) ?? TIPOS_AUSENCIA[0];
}

export function tipoNombre(t: TipoAusencia): string {
  return tipoInfo(t).nombre;
}

/** Cambio concreto de un campo de la ficha: valor anterior (tachado) → nuevo. */
export interface HistorialCambio {
  /** Nombre legible del campo, p. ej. «salario bruto» (solo si hay antes → después). */
  campo?: string;
  /** Valor anterior formateado para mostrar (tachado), p. ej. «1500». */
  antes?: string;
  /** Valor nuevo formateado para mostrar, p. ej. «1600». */
  despues?: string;
  /** Texto suelto (sin antes/después), p. ej. «Baja registrada el 30/06/2026». */
  nota?: string;
}

/** Entrada del historial de acciones de un empleado (ficha, ausencias, tiempo…). */
export interface HistorialItem {
  id: number;
  empleadoId: number;
  /** Marca de tiempo ISO (UTC) del momento en que ocurrió. */
  cuando: string;
  tipo: "perfil" | "ausencia" | "tiempo";
  /** Descripción breve en español, p. ej. «Añadido: Vacaciones · 04/09/2026 → 08/09/2026». */
  texto: string;
  /** Cambios de ficha estructurados (solo entradas de tipo «perfil»). */
  cambios?: HistorialCambio[];
}

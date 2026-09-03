// Tipos de dominio del gestor de personal (misma lógica que la versión de escritorio).

/** Turno: M = mañana, T = tarde. */
export type Turno = "M" | "T";

/** Origen de una asignación en el calendario. */
export type Origen = "auto" | "manual";

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
  /** Fecha de baja (ISO) o null si sigue activa. */
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

/** Nombre completo de una empleada. */
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

/** Empleada con todos los campos rellenados a valores por defecto. */
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

/** Entrada del historial de acciones de una empleada (ficha, ausencias, tiempo…). */
export interface HistorialItem {
  id: number;
  empleadoId: number;
  /** Marca de tiempo ISO (UTC) del momento en que ocurrió. */
  cuando: string;
  tipo: "perfil" | "ausencia" | "tiempo";
  /** Descripción breve en español, p. ej. «Añadida Vacaciones · 04/09/2026 → 08/09/2026». */
  texto: string;
}

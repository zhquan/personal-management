import type { Fecha } from "./types";

// Utilidades de fechas sin huso horario: se trabaja con cadenas YYYY-MM-DD.

function parse(f: Fecha): { y: number; m: number; d: number } {
  const [y, m, d] = f.split("-").map(Number);
  return { y, m, d };
}

export function fmt(iso: Fecha): string {
  const { y, m, d } = parse(iso);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export function fmtCorto(iso: Fecha): string {
  const { d, m } = parse(iso);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** Parsea «dd/mm/aaaa» (también admite «d/m/aaaa») a Fecha ISO, o null si no es válida. */
export function parseFechaES(texto: string): Fecha | null {
  const t = texto.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const d = Number(m[1]);
  const mes = Number(m[2]);
  const y = Number(m[3]);
  if (y < 1000 || mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  // Comprueba que el día exista de verdad (31/02, 29/02 en año no bisiesto…).
  const dt = new Date(y, mes - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mes - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function hoy(): Fecha {
  return toISO(new Date());
}

/** Formatea una marca de tiempo ISO (UTC) como «dd/mm/aaaa · hh:mm» en hora local. */
export function fmtFechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function toISO(date: Date): Fecha {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function toDate(iso: Fecha): Date {
  const { y, m, d } = parse(iso);
  return new Date(y, m - 1, d);
}

/** Número de día absoluto (sin TZ) tomando el mediodía UTC. */
export function dayNumber(iso: Fecha): number {
  const { y, m, d } = parse(iso);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function addDays(iso: Fecha, n: number): Fecha {
  const t = new Date(Date.UTC(parse(iso).y, parse(iso).m - 1, parse(iso).d + n));
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function compare(a: Fecha, b: Fecha): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ---------------------------------------------------------------- Quincenas
// Cada quincena son 14 días naturales alineados con semanas ISO (lunes a domingo).
// El lunes de referencia es 06/01/2020.

const EPOCH_LUNES = dayNumber("2020-01-06");
export const DIAS_QUINCENA = 14;

export function indiceQuincena(iso: Fecha): number {
  return Math.floor((dayNumber(iso) - EPOCH_LUNES) / DIAS_QUINCENA);
}

export function inicioDeIndice(idx: number): Fecha {
  return addDays("2020-01-06", idx * DIAS_QUINCENA);
}

export function inicioQuincena(iso: Fecha): Fecha {
  return inicioDeIndice(indiceQuincena(iso));
}

/** Lunes de la semana ISO que contiene la fecha. */
export function inicioSemana(iso: Fecha): Fecha {
  const d = new Date(Date.UTC(parse(iso).y, parse(iso).m - 1, parse(iso).d));
  const desplazamiento = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -desplazamiento);
}

/** Semana ISO del año para una fecha (1-53). */
export function semanaISO(iso: Fecha): number {
  const { y, m, d } = parse(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Jueves de la semana en curso: la semana ISO pertenece al año del jueves.
  const diaSem = (dt.getUTCDay() + 6) % 7; // 0 = lunes
  const jueves = new Date(Date.UTC(y, m - 1, d - diaSem + 3));
  const yJ = jueves.getUTCFullYear();
  const inicioAnio = new Date(Date.UTC(yJ, 0, 4));
  const inicioDia = (inicioAnio.getUTCDay() + 6) % 7;
  const lunesAnio = new Date(Date.UTC(yJ, 0, 4 - inicioDia));
  const diff = Math.round((jueves.getTime() - lunesAnio.getTime()) / 86400000);
  return Math.floor(diff / 7) + 1;
}

/** Primer día del mes. */
export function inicioMes(iso: Fecha): Fecha {
  const { y, m } = parse(iso);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Desplaza un mes (1 = enero). Devuelve el mismo día si existe o el último del mes. */
export function mesVecino(anio: number, mes: number, delta: number): { anio: number; mes: number } {
  const total = anio * 12 + (mes - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { anio: y, mes: m };
}

/** Los 14 días de la quincena que empieza en `inicio`. */
export function diasQuincena(inicio: Fecha): Fecha[] {
  const out: Fecha[] = [];
  for (let i = 0; i < DIAS_QUINCENA; i++) out.push(addDays(inicio, i));
  return out;
}

// ------------------------------------------------------------------ Español
const DIA_NOMBRES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIA_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

function capitalizar(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export function nombreDia(iso: Fecha): string {
  const dow = new Date(Date.UTC(parse(iso).y, parse(iso).m - 1, parse(iso).d)).getUTCDay();
  return DIA_NOMBRES[dow];
}

export function nombreDiaCorto(iso: Fecha): string {
  const dow = new Date(Date.UTC(parse(iso).y, parse(iso).m - 1, parse(iso).d)).getUTCDay();
  return DIA_CORTOS[dow];
}

export function nombreMes(mes: number): string {
  return MESES[mes - 1];
}

export function nombreMesCapitalizado(mes: number): string {
  return capitalizar(nombreMes(mes));
}

export function fechaAmigable(iso: Fecha): string {
  const { d, m, y } = parse(iso);
  return `${d} ${nombreMes(m)} ${y}`;
}

// ----------------------------------------------------------------- Antigüedad
// Desplaza una fecha local `meses` añadiendo el menor número de días posible
// (si el día 31 cae en un mes de 30 días, se clampa al último día).
function sumarMesesClamp(d: Date, meses: number): Date {
  const idx = d.getMonth() + meses;
  const y = d.getFullYear() + Math.floor(idx / 12);
  const m = ((idx % 12) + 12) % 12;
  const ultimo = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), ultimo));
}

/** Años, meses y días transcurridos entre dos fechas ISO (hasta − desde). */
export function transcurrido(
  desde: Fecha,
  hasta: Fecha
): { anios: number; meses: number; dias: number } | null {
  if (!desde || !hasta || dayNumber(hasta) < dayNumber(desde)) return null;
  const a = toDate(desde);
  const [ay, am] = desde.split("-").map(Number);
  const [by, bm] = hasta.split("-").map(Number);
  let mesesTot = (by - ay) * 12 + (bm - am);
  let ref = sumarMesesClamp(a, mesesTot);
  if (dayNumber(toISO(ref)) > dayNumber(hasta)) {
    mesesTot -= 1;
    ref = sumarMesesClamp(a, mesesTot);
  }
  const dias = dayNumber(hasta) - dayNumber(toISO(ref));
  return { anios: Math.floor(mesesTot / 12), meses: mesesTot % 12, dias };
}

/** Antigüedad como texto, p. ej. «1 año, 2 meses, 0 días». */
export function transcurridoTexto(desde: Fecha, hasta: Fecha): string {
  const t = transcurrido(desde, hasta);
  if (!t) return "—";
  const parte = (n: number, sing: string, plur: string) => `${n} ${n === 1 ? sing : plur}`;
  return `${parte(t.anios, "año", "años")}, ${parte(t.meses, "mes", "meses")}, ${parte(t.dias, "día", "días")}`;
}

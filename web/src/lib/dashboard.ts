import type { Empleado, Fecha } from "./types";
import { addDays, compare, hoy as hoyActual } from "./dates";

// Métricas del Dashboard. Todas son funciones puras sobre la lista de empleados
// y un filtro (estado + rango de fechas), para poder probarlas con datos fijos.

export type FiltroEstadoDashboard = "activos" | "noactivos" | "todos";

export interface FiltrosDashboard {
  estado: FiltroEstadoDashboard;
  desde: Fecha;
  hasta: Fecha;
}

export const OPCIONES_ESTADO_DASHBOARD: { id: FiltroEstadoDashboard; etiqueta: string }[] = [
  { id: "activos", etiqueta: "Activos" },
  { id: "noactivos", etiqueta: "No activos" },
  { id: "todos", etiqueta: "Todos" }
];

/** Rango por defecto: el último año natural (desde hace 364 días hasta hoy). */
export function rangoPorDefecto(hoy: Fecha = hoyActual()): { desde: Fecha; hasta: Fecha } {
  return { desde: addDays(hoy, -364), hasta: hoy };
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Un mes de la línea de tiempo: etiqueta «sep 26» y sus fechas de inicio/fin. */
export interface PuntoMes {
  etiqueta: string;
  inicio: Fecha;
  fin: Fecha;
}

/** Los meses (completos) que tocan el rango [desde, hasta], en orden. */
export function mesesEntre(desde: Fecha, hasta: Fecha): PuntoMes[] {
  if (!desde || !hasta || compare(desde, hasta) > 0) return [];
  const ini = { y: Number(desde.slice(0, 4)), m: Number(desde.slice(5, 7)) };
  const fin = { y: Number(hasta.slice(0, 4)), m: Number(hasta.slice(5, 7)) };
  const puntos: PuntoMes[] = [];
  let y = ini.y;
  let m = ini.m;
  while (y < fin.y || (y === fin.y && m <= fin.m)) {
    const inicio = `${y}-${String(m).padStart(2, "0")}-01`;
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    puntos.push({
      etiqueta: `${MESES_CORTOS[m - 1]} ${String(y).slice(2)}`,
      inicio,
      fin: `${y}-${String(m).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`
    });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return puntos;
}

/** ¿El empleado cumple el filtro de estado? (activos = sin fecha de baja). */
export function segunEstado(e: Empleado, estado: FiltroEstadoDashboard): boolean {
  if (estado === "activos") return !e.baja;
  if (estado === "noactivos") return !!e.baja;
  return true;
}

/** ¿El empleado está en plantilla al final del día `fecha`? */
export function activoEn(e: Empleado, fecha: Fecha): boolean {
  return compare(e.alta, fecha) <= 0 && (!e.baja || compare(e.baja, fecha) > 0);
}

export interface SerieMes {
  etiquetas: string[];
  altas: number[];
  bajas: number[];
  /** Plantilla (empleados trabajando) a fin de cada mes. */
  actual: number[];
}

/** Altas y bajas ocurridas en cada mes del rango + plantilla a fin de mes. */
export function serieAltasBajasActual(
  empleados: Empleado[],
  filtros: FiltrosDashboard
): SerieMes {
  const puntos = mesesEntre(filtros.desde, filtros.hasta);
  const lista = empleados.filter((e) => segunEstado(e, filtros.estado));
  const altas = puntos.map((p) => lista.filter((e) => e.alta >= p.inicio && e.alta <= p.fin).length);
  const bajas = puntos.map(
    (p) => lista.filter((e) => e.baja && e.baja >= p.inicio && e.baja <= p.fin).length
  );
  const actual = puntos.map((p) => lista.filter((e) => activoEn(e, p.fin)).length);
  return { etiquetas: puntos.map((p) => p.etiqueta), altas, bajas, actual };
}

export interface SerieValor {
  etiquetas: string[];
  /** null = sin datos ese mes (nadie en plantilla o sin el dato). */
  valores: (number | null)[];
}

/** Salario bruto medio de quien está en plantilla a fin de cada mes. */
export function serieSalarioMedio(empleados: Empleado[], filtros: FiltrosDashboard): SerieValor {
  const puntos = mesesEntre(filtros.desde, filtros.hasta);
  const lista = empleados.filter((e) => segunEstado(e, filtros.estado));
  const valores = puntos.map((p) => {
    const activos = lista.filter(
      (e) => activoEn(e, p.fin) && typeof e.salarioBruto === "number" && e.salarioBruto > 0
    );
    if (!activos.length) return null;
    const suma = activos.reduce((s, e) => s + (e.salarioBruto ?? 0), 0);
    return Math.round(suma / activos.length);
  });
  return { etiquetas: puntos.map((p) => p.etiqueta), valores };
}

/** Meses completos entre dos fechas (0 si `desde` es posterior a `hasta`). */
function mesesEntreFechas(desde: Fecha, hasta: Fecha): number {
  if (compare(desde, hasta) > 0) return 0;
  const a = desde.split("-").map(Number);
  const b = hasta.split("-").map(Number);
  let meses = (b[0] - a[0]) * 12 + (b[1] - a[1]);
  if (b[2] < a[2]) meses--;
  return Math.max(0, meses);
}

/** Antigüedad media (en meses) de quien está en plantilla a fin de cada mes. */
export function serieDuracionMedia(empleados: Empleado[], filtros: FiltrosDashboard): SerieValor {
  const puntos = mesesEntre(filtros.desde, filtros.hasta);
  const lista = empleados.filter((e) => segunEstado(e, filtros.estado));
  const valores = puntos.map((p) => {
    const activos = lista.filter((e) => activoEn(e, p.fin));
    if (!activos.length) return null;
    const meses = activos.reduce((s, e) => {
      const ref = e.baja && compare(e.baja, p.fin) <= 0 ? e.baja : p.fin;
      return s + mesesEntreFechas(e.alta, ref);
    }, 0);
    return Math.round((meses / activos.length) * 10) / 10;
  });
  return { etiquetas: puntos.map((p) => p.etiqueta), valores };
}

/** Edad cumplida de una persona en `hasta` (años). */
export function aniosEntre(desde: Fecha, hasta: Fecha): number {
  const a = desde.split("-").map(Number);
  const b = hasta.split("-").map(Number);
  let edad = b[0] - a[0];
  if (b[1] < a[1] || (b[1] === a[1] && b[2] < a[2])) edad--;
  return Math.max(0, edad);
}

export interface EdadEmpleado {
  edad: number;
  nombre: string;
}

/**
 * Edad (a fecha de hoy, o del fin del rango si este es anterior) de los empleados
 * que cumplen el filtro de estado y trabajaron en algún momento dentro del rango.
 * Se omiten los que no tienen fecha de nacimiento.
 */
export function edadesEmpleados(
  empleados: Empleado[],
  filtros: FiltrosDashboard,
  hoy: Fecha = hoyActual()
): EdadEmpleado[] {
  const ref = compare(filtros.hasta, hoy) <= 0 ? filtros.hasta : hoy;
  const out: EdadEmpleado[] = [];
  for (const e of empleados) {
    if (!segunEstado(e, filtros.estado)) continue;
    if (!e.nacimiento) continue;
    // ¿Trabajó en algún momento dentro del rango?
    if (compare(e.alta, filtros.hasta) > 0) continue;
    if (e.baja && compare(e.baja, filtros.desde) < 0) continue;
    out.push({ edad: aniosEntre(e.nacimiento, ref), nombre: `${e.nombre} ${e.apellidos}`.trim() });
  }
  return out;
}

export interface RangoEdad {
  /** Etiqueta, p. ej. «25–30». */
  etiqueta: string;
  valor: number;
}

/**
 * Agrupa edades en rangos de 5 años (p. ej. 20–25, 25–30…). Los límites son
 * [inicio, fin): una persona de 25 años cae en «25–30». Los rangos van del
 * múltiplo de 5 inferior a la edad mínima al superior de la máxima (si la edad
 * tope es justo un múltiplo de 5 se añade el rango siguiente para que no quede
 * fuera). Sin edades devuelve [].
 */
export function rangosEdad(edades: EdadEmpleado[]): RangoEdad[] {
  if (!edades.length) return [];
  const minEdad = Math.min(...edades.map((x) => x.edad));
  const maxEdad = Math.max(...edades.map((x) => x.edad));
  const min = Math.floor(minEdad / 5) * 5;
  let max = Math.ceil(maxEdad / 5) * 5;
  if (max <= maxEdad) max += 5;
  const rangos: RangoEdad[] = [];
  for (let ini = min; ini < max; ini += 5) {
    rangos.push({
      etiqueta: `${ini}–${ini + 5}`,
      valor: edades.filter((x) => x.edad >= ini && x.edad < ini + 5).length
    });
  }
  return rangos;
}
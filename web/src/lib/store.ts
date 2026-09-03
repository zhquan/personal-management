import { reactive } from "vue";
import type { Asignacion, Ausencia, Empleado, Fecha, HistorialItem, Hueco, TiempoRecuperable, Turno } from "./types";
import { plantillaEmpleado, tipoNombre } from "./types";
import { addDays, compare, fmt, hoy, inicioQuincena, indiceQuincena } from "./dates";
import { formatearTiempo } from "./tiempo";
import { planificar } from "./scheduler";

// ------------------------------------------------------------------ Estado
const CLAVE = "gestor-personal-v2";
const VERSION_DATOS = 3; // v3: historial de acciones por empleada

interface AppData {
  version?: number;
  empleados: Empleado[];
  ausencias: Ausencia[];
  /** Apuntes de tiempo recuperable (minutos con signo). */
  tiempos: TiempoRecuperable[];
  asignaciones: Asignacion[];
  /** Días de descanso fijados a mano: `${empleadoId}|${fecha}`. */
  descansos: string[];
  /** Historial de acciones por empleada (más reciente primero). */
  historial: HistorialItem[];
}

const vacio = (): AppData => ({
  version: VERSION_DATOS,
  empleados: [],
  ausencias: [],
  tiempos: [],
  asignaciones: [],
  descansos: [],
  historial: []
});

function cargar(): AppData {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return vacio();
    const d = JSON.parse(raw) as AppData;
    if (!d || !Array.isArray(d.empleados)) return vacio();
    // Rellena con valores por defecto los campos nuevos (datos guardados antes de que existieran).
    d.empleados = d.empleados.map((e) => ({ ...plantillaEmpleado(), ...e }));
    // Migración v1 → v2: el planificador ya no usa disponibilidad por turnos y el
    // cómputo de días de vacaciones por defecto pasa de 22 a 30.
    if ((d.version ?? 1) < VERSION_DATOS) {
      d.version = VERSION_DATOS;
      d.tiempos = Array.isArray(d.tiempos) ? d.tiempos : [];
      for (const e of d.empleados) {
        if (e.diasVacacionesAnuales === 22) e.diasVacacionesAnuales = 30;
        delete (e as unknown as Record<string, unknown>).dispManana;
        delete (e as unknown as Record<string, unknown>).dispTarde;
      }
    }
    // Las asignaciones automáticas son deterministas y se regeneran al navegar:
    // solo se persisten las manuales (descansos aparte). Así el almacenamiento y
    // cada guardado no crecen con todo el historial de quincenas generadas.
    d.asignaciones = (Array.isArray(d.asignaciones) ? d.asignaciones : [])
      .filter((a) => a.origen === "manual");
    // Comentario opcional en ausencias y tiempo recuperable.
    if (Array.isArray(d.ausencias)) {
      d.ausencias = d.ausencias.map((a) => ({ comentario: "", ...a }));
    }
    if (Array.isArray(d.tiempos)) {
      d.tiempos = d.tiempos.map((t) => ({ comentario: "", ...t }));
    }
    // Migración v2 → v3: historial de acciones. Para los datos ya guardados se
    // anota al menos el alta de cada empleada como primera entrada.
    if (!Array.isArray(d.historial)) {
      d.historial = [];
      for (const e of d.empleados) {
        if (!e.alta) continue;
        d.historial.push({
          id: d.historial.length + 1,
          empleadoId: e.id,
          cuando: `${e.alta}T10:00:00.000Z`,
          tipo: "perfil",
          texto: `Empleada dada de alta el ${fmt(e.alta)}`
        });
      }
    }
    return d;
  } catch {
    return vacio();
  }
}

function guardar() {
  try {
    const datos = {
      ...state,
      // No se persisten las automáticas: se regeneran al inicio y al navegar.
      asignaciones: state.asignaciones.filter((a) => a.origen === "manual")
    };
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    /* sin almacenamiento disponible */
  }
}

export const state: AppData = reactive(cargar());

/** Huecos de cobertura de la última generación por quincena (clave: lunes ISO). */
export const huecosPorQuincena = reactive(new Map<string, Hueco[]>());

function siguienteId(lista: { id: number }[]): number {
  return lista.reduce((mx, x) => Math.max(mx, x.id), 0) + 1;
}

// ----------------------------------------------------------------- Historial
/** Añade una acción al historial de una empleada y persiste (máx. 150 por empleada). */
function registrarHistorial(empleadoId: number, tipo: HistorialItem["tipo"], texto: string) {
  state.historial.push({
    id: siguienteId(state.historial),
    empleadoId,
    cuando: new Date().toISOString(),
    tipo,
    texto
  });
  const porEmp = state.historial.filter((h) => h.empleadoId === empleadoId);
  if (porEmp.length > 150) {
    const recortar = new Set(porEmp.slice(0, porEmp.length - 150).map((h) => h.id));
    state.historial = state.historial.filter((h) => !recortar.has(h.id));
  }
  guardar();
}

/** Acciones de una empleada, de la más reciente a la más antigua. */
export function historialDeEmpleado(id: number): HistorialItem[] {
  return state.historial
    .filter((h) => h.empleadoId === id)
    .sort((a, b) => (a.cuando === b.cuando ? b.id - a.id : a.cuando < b.cuando ? 1 : -1));
}

const NOMBRES_CAMPO_PERFIL: Record<string, string> = {
  nombre: "nombre",
  apellidos: "apellidos",
  dni: "DNI/NIE",
  telefono: "teléfono",
  iban: "IBAN",
  nacimiento: "fecha de nacimiento",
  color: "color identificativo",
  diasVacacionesAnuales: "días de vacaciones",
  jornadaHoras: "jornada (horas)",
  salarioBruto: "salario bruto",
  tipoContrato: "tipo de contrato",
  notas: "notas internas"
};

/** Texto resumen de los cambios de ficha (vacío si nada cambió). */
function resumenCambiosPerfil(antes: Empleado, nuevo: Empleado): string {
  const partes: string[] = [];
  if (!antes.baja && nuevo.baja) {
    partes.push(`Baja registrada el ${fmt(nuevo.baja)}`);
  } else if (antes.baja && !nuevo.baja) {
    partes.push("Fecha de baja eliminada (vuelve a estar activa)");
  } else if (antes.baja && nuevo.baja && antes.baja !== nuevo.baja) {
    partes.push(`Fecha de baja cambiada a ${fmt(nuevo.baja)}`);
  }
  const motivoCambiado =
    (antes.motivoBaja ?? "") !== (nuevo.motivoBaja ?? "") && antes.baja === nuevo.baja;
  if (motivoCambiado) partes.push("Comentario de la baja actualizado");

  const cambiados: string[] = [];
  for (const [k, etiqueta] of Object.entries(NOMBRES_CAMPO_PERFIL)) {
    if ((antes as unknown as Record<string, unknown>)[k] !== (nuevo as unknown as Record<string, unknown>)[k]) {
      cambiados.push(etiqueta);
    }
  }
  if (antes.alta !== nuevo.alta) {
    cambiados.push(`fecha de alta (${fmt(antes.alta)} → ${fmt(nuevo.alta)})`);
  }
  if (cambiados.length) partes.push(`Perfil actualizado: ${cambiados.join(", ")}`);
  return partes.join(" · ");
}

function resumenAusencia(a: Ausencia): string {
  return `${tipoNombre(a.tipo)} · ${fmt(a.inicio)} → ${fmt(a.fin)}`;
}

// ------------------------------------------------------- Datos de ejemplo
export const PALETA = ["#E91E63", "#9C27B0", "#3F51B5", "#2196F3", "#009688", "#4CAF50", "#FF9800", "#F4511E", "#8D6E63", "#607D8B", "#5D4037", "#C2185B"];

function enMes(dia: number, mes: number): Fecha {
  const y = hoy().slice(0, 4);
  return `${y}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function sembrar() {
  const datos: Empleado[] = [
    plantillaEmpleado({ id: 1, nombre: "María", apellidos: "García López", dni: "12345678A", nss: "123456789012", telefono: "612 345 001", iban: "ES12 0000 0000 0000 0000 0001", nacimiento: "1985-03-14", color: "#E91E63", jornadaHoras: 40, salarioBruto: 1650, tipoContrato: "Indefinido", alta: addDays(hoy(), -2400) }),
    plantillaEmpleado({ id: 2, nombre: "Lucía", apellidos: "Fernández Ruiz", dni: "87654321B", nss: "987654321098", telefono: "622 345 002", iban: "ES22 0000 0000 0000 0000 0002", nacimiento: "1992-07-02", color: "#3F51B5", jornadaHoras: 20, salarioBruto: 875, tipoContrato: "Indefinido", alta: addDays(hoy(), -800) }),
    plantillaEmpleado({ id: 3, nombre: "Carmen", apellidos: "Martínez Sánchez", dni: "23456789C", nss: "234567890123", telefono: "633 345 003", iban: "ES32 0000 0000 0000 0000 0003", nacimiento: "1988-11-20", color: "#00897B", jornadaHoras: 40, salarioBruto: 1600, tipoContrato: "Indefinido", alta: addDays(hoy(), -1500) }),
    plantillaEmpleado({ id: 4, nombre: "Sofía", apellidos: "Jiménez Pérez", dni: "34567890D", nss: "345678901234", telefono: "644 345 004", iban: "ES42 0000 0000 0000 0000 0004", nacimiento: "1995-01-30", color: "#F4511E", jornadaHoras: 40, salarioBruto: 1500, tipoContrato: "Temporal", alta: addDays(hoy(), -430), notas: "Prefiere los turnos de tarde cuando es posible." }),
    plantillaEmpleado({ id: 5, nombre: "Andrea", apellidos: "Moreno Díaz", dni: "45678901E", nss: "456789012345", telefono: "655 345 005", iban: "ES52 0000 0000 0000 0000 0005", nacimiento: "1990-05-08", color: "#7B1FA2", jornadaHoras: 40, salarioBruto: 1550, tipoContrato: "Indefinido", alta: addDays(hoy(), -1200) }),
    plantillaEmpleado({ id: 6, nombre: "Nuria", apellidos: "Ortega Gil", dni: "56789012F", nss: "567890123456", telefono: "666 345 006", iban: "ES62 0000 0000 0000 0000 0006", nacimiento: "1998-09-17", color: "#00695C", jornadaHoras: 40, salarioBruto: 1400, tipoContrato: "En prácticas", alta: addDays(hoy(), -95), notas: "Periodo de prueba de 6 meses." }),
    plantillaEmpleado({ id: 7, nombre: "Paula", apellidos: "Serrano Vega", dni: "67890123G", nss: "678901234567", telefono: "677 345 007", iban: "ES72 0000 0000 0000 0000 0007", nacimiento: "1993-12-25", color: "#C2185B", jornadaHoras: 25, salarioBruto: 1050, tipoContrato: "Indefinido", alta: addDays(hoy(), -700) })
  ];
  // Ausencias de ejemplo situadas en el mes en curso para que se vean en el calendario mensual.
  const mes = Number(hoy().slice(5, 7));
  const ausencias: Ausencia[] = [
    { id: 1, empleadoId: 1, inicio: enMes(4, mes), fin: enMes(8, mes), tipo: "vacaciones", comentario: "Viaje familiar, avisado con antelación." },
    { id: 2, empleadoId: 4, inicio: enMes(13, mes), fin: enMes(15, mes), tipo: "asuntos", comentario: "Asuntos propios" },
    { id: 3, empleadoId: 7, inicio: enMes(21, mes), fin: enMes(23, mes), tipo: "sinjustificar" }
  ];
  // Tiempo recuperable de ejemplo: María hizo 2 h 30 extra; Sofía debe 1 hora.
  const tiempos: TiempoRecuperable[] = [
    { id: 1, empleadoId: 1, fecha: enMes(2, mes), minutos: -150, comentario: "Cubrió el turno de Nuria." },
    { id: 2, empleadoId: 4, fecha: enMes(9, mes), minutos: 60 }
  ];
  // Historial de ejemplo para que la vista no arranque vacía.
  const ahora = Date.now();
  const hace = (ms: number) => new Date(ahora - ms).toISOString();
  const historial: HistorialItem[] = [
    { id: 1, empleadoId: 1, cuando: hace(2400 * 864e5), tipo: "perfil", texto: `Empleada dada de alta el ${fmt(datos[0].alta)}` },
    { id: 2, empleadoId: 1, cuando: hace(3 * 3600e3), tipo: "ausencia", texto: `Añadida ${resumenAusencia(ausencias[0])}` },
    { id: 3, empleadoId: 1, cuando: hace(2 * 3600e3), tipo: "tiempo", texto: `Añadido apunte de tiempo recuperable: ${formatearTiempo(tiempos[0].minutos)} (${fmt(tiempos[0].fecha)})` },
    { id: 4, empleadoId: 4, cuando: hace(430 * 864e5), tipo: "perfil", texto: `Empleada dada de alta el ${fmt(datos[3].alta)}` },
    { id: 5, empleadoId: 4, cuando: hace(5 * 3600e3), tipo: "ausencia", texto: `Añadida ${resumenAusencia(ausencias[1])}` },
    { id: 6, empleadoId: 4, cuando: hace(3600e3), tipo: "tiempo", texto: `Añadido apunte de tiempo recuperable: ${formatearTiempo(tiempos[1].minutos)} (${fmt(tiempos[1].fecha)})` },
    { id: 7, empleadoId: 7, cuando: hace(4 * 3600e3), tipo: "ausencia", texto: `Añadida ${resumenAusencia(ausencias[2])}` },
    { id: 8, empleadoId: 2, cuando: hace(800 * 864e5), tipo: "perfil", texto: `Empleada dada de alta el ${fmt(datos[1].alta)}` },
    { id: 9, empleadoId: 3, cuando: hace(1500 * 864e5), tipo: "perfil", texto: `Empleada dada de alta el ${fmt(datos[2].alta)}` },
    { id: 10, empleadoId: 5, cuando: hace(1200 * 864e5), tipo: "perfil", texto: `Empleada dada de alta el ${fmt(datos[4].alta)}` },
    { id: 11, empleadoId: 6, cuando: hace(95 * 864e5), tipo: "perfil", texto: `Empleada dada de alta el ${fmt(datos[5].alta)}` },
    { id: 12, empleadoId: 7, cuando: hace(700 * 864e5), tipo: "perfil", texto: `Empleada dada de alta el ${fmt(datos[6].alta)}` }
  ];
  state.empleados = datos;
  state.ausencias = ausencias;
  state.tiempos = tiempos;
  state.asignaciones = [];
  state.descansos = [];
  state.historial = historial;
}

// Carga inicial: si no hay datos, siembra y genera quincena anterior y actual.
export function iniciar() {
  if (state.empleados.length === 0) {
    sembrar();
  }
  regenerarFortnight(inicioQuincena(hoy()), true);
  regenerarFortnight(inicioQuincena(addDays(hoy(), -14)), true);
  guardar();
  // Copias programadas: se comprueban al arrancar y, si la app sigue abierta, cada hora.
  if (typeof window !== "undefined") {
    comprobarCopiaProgramada();
    setInterval(comprobarCopiaProgramada, 3600e3);
  }
}

// ------------------------------------------------------------------ CRUD básico
export function guardarEmpleado(e: Empleado): Empleado {
  if (!e.id) {
    e.id = siguienteId(state.empleados);
    state.empleados.push(e);
    registrarHistorial(e.id, "perfil", `Empleada dada de alta el ${fmt(e.alta)}`);
  } else {
    const i = state.empleados.findIndex((x) => x.id === e.id);
    if (i >= 0) {
      const anterior = state.empleados[i];
      state.empleados[i] = e;
      const texto = resumenCambiosPerfil(anterior, e);
      if (texto) registrarHistorial(e.id, "perfil", texto);
    }
  }
  guardar();
  return e;
}

export function eliminarEmpleado(id: number) {
  state.empleados = state.empleados.filter((e) => e.id !== id);
  state.ausencias = state.ausencias.filter((a) => a.empleadoId !== id);
  state.tiempos = state.tiempos.filter((t) => t.empleadoId !== id);
  state.asignaciones = state.asignaciones.filter((a) => a.empleadoId !== id);
  state.descansos = state.descansos.filter((d) => !d.startsWith(`${id}|`));
  state.historial = state.historial.filter((h) => h.empleadoId !== id);
  guardar();
}

export function empleadosOrdenados(): Empleado[] {
  return [...state.empleados].sort((a, b) =>
    a.apellidos.localeCompare(b.apellidos, "es") || a.nombre.localeCompare(b.nombre, "es") || a.id - b.id);
}

export function buscarEmpleado(id: number): Empleado | undefined {
  return state.empleados.find((e) => e.id === id);
}

export function guardarAusencia(a: Ausencia): Ausencia {
  if (!a.id) {
    a.id = siguienteId(state.ausencias);
    state.ausencias.push(a);
    registrarHistorial(a.empleadoId, "ausencia", `Añadida ${resumenAusencia(a)}`);
  } else {
    const i = state.ausencias.findIndex((x) => x.id === a.id);
    if (i >= 0) {
      const anterior = state.ausencias[i];
      state.ausencias[i] = a;
      const partes: string[] = [];
      if (anterior.inicio !== a.inicio || anterior.fin !== a.fin || anterior.tipo !== a.tipo) {
        partes.push(resumenAusencia(a));
      }
      if ((anterior.comentario ?? "") !== (a.comentario ?? "")) partes.push("comentario actualizado");
      if (partes.length) registrarHistorial(a.empleadoId, "ausencia", `Modificada ${partes.join(" · ")}`);
    }
  }
  guardar();
  return a;
}

export function eliminarAusencia(id: number) {
  const a = state.ausencias.find((x) => x.id === id);
  state.ausencias = state.ausencias.filter((x) => x.id !== id);
  if (a) registrarHistorial(a.empleadoId, "ausencia", `Eliminada ${resumenAusencia(a)}`);
  guardar();
}

// ------------------------------------------------------------- Tiempo recuperable
export function guardarTiempo(t: TiempoRecuperable): TiempoRecuperable {
  if (!t.id) {
    t.id = siguienteId(state.tiempos);
    state.tiempos.push(t);
    registrarHistorial(t.empleadoId, "tiempo", `Añadido apunte de tiempo recuperable: ${formatearTiempo(t.minutos)} (${fmt(t.fecha)})`);
  } else {
    const i = state.tiempos.findIndex((x) => x.id === t.id);
    if (i >= 0) {
      const anterior = state.tiempos[i];
      state.tiempos[i] = t;
      const partes: string[] = [];
      if (anterior.fecha !== t.fecha || anterior.minutos !== t.minutos) {
        partes.push(`${formatearTiempo(t.minutos)} · ${fmt(t.fecha)}`);
      }
      if ((anterior.comentario ?? "") !== (t.comentario ?? "")) partes.push("comentario actualizado");
      if (partes.length) {
        registrarHistorial(t.empleadoId, "tiempo", `Apunte de tiempo recuperable ajustado: ${partes.join(" · ")}`);
      }
    }
  }
  guardar();
  return t;
}

export function eliminarTiempo(id: number) {
  const t = state.tiempos.find((x) => x.id === id);
  state.tiempos = state.tiempos.filter((x) => x.id !== id);
  if (t) registrarHistorial(t.empleadoId, "tiempo", `Eliminado apunte de tiempo recuperable: ${formatearTiempo(t.minutos)} (${fmt(t.fecha)})`);
  guardar();
}

export function tiemposDeEmpleado(id: number): TiempoRecuperable[] {
  return state.tiempos.filter((t) => t.empleadoId === id);
}

/** Apuntes de tiempo recuperable de un día concreto. */
export function tiemposEnDia(fecha: Fecha): TiempoRecuperable[] {
  return state.tiempos.filter((t) => t.fecha === fecha);
}

/** Apuntes de tiempo recuperable dentro de un mes (1-12). */
export function tiemposDelMes(anio: number, mes: number): TiempoRecuperable[] {
  const ini = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const fin = `${anio}-${String(mes).padStart(2, "0")}-31`;
  return state.tiempos
    .filter((t) => compare(t.fecha, ini) >= 0 && compare(t.fecha, fin) <= 0)
    .sort((a, b) => compare(a.fecha, b.fecha) || a.empleadoId - b.empleadoId);
}

/** Saldo (minutos con signo) acumulado por una empleada. */
export function saldoTiempoDe(empleadoId: number): number {
  let saldo = 0;
  for (const t of state.tiempos) {
    if (t.empleadoId === empleadoId) saldo += t.minutos;
  }
  return saldo;
}

/** Mapa de saldo por empleada (para listar sin repetir recorridos). */
export function saldoTiemposPorEmpleado(): Map<number, number> {
  const saldo = new Map<number, number>();
  for (const t of state.tiempos) {
    saldo.set(t.empleadoId, (saldo.get(t.empleadoId) ?? 0) + t.minutos);
  }
  return saldo;
}

export function ausenciasDeEmpleado(id: number): Ausencia[] {
  return state.ausencias.filter((a) => a.empleadoId === id);
}

export function vacacionesUsadasAnio(empleadoId: number, anio = Number(hoy().slice(0, 4))): number {
  const iniAnio = `${anio}-01-01`;
  const finAnio = `${anio}-12-31`;
  let usado = 0;
  for (const a of state.ausencias) {
    if (a.empleadoId !== empleadoId || a.tipo !== "vacaciones") continue;
    const iniD = compare(a.inicio, iniAnio) < 0 ? iniAnio : a.inicio;
    const finD = compare(a.fin, finAnio) > 0 ? finAnio : a.fin;
    if (compare(iniD, finD) <= 0) usado += diasEntre(iniD, finD);
  }
  return usado;
}

export function diasEntre(ini: Fecha, fin: Fecha): number {
  const d1 = new Date(`${ini}T12:00:00`).getTime();
  const d2 = new Date(`${fin}T12:00:00`).getTime();
  return Math.round((d2 - d1) / 86400000) + 1;
}

function diasDelAnio(anio: number): number {
  return new Date(anio, 2, 0).getDate() === 29 ? 366 : 365;
}

/**
 * Días de vacaciones que corresponden a una empleada en `anio`.
 *
 * Si el alta es anterior al año y sigue activa (o causa baja al terminar el año)
 * devuelve sus días anuales completos (p. ej. 30). Si el alta cae dentro del año,
 * o causa baja a mitad de año, prorratea por días exactos desde el alta (o desde el
 * 1 de enero, y hasta la baja o el 31 de diciembre) y redondea al día entero más
 * cercano: alta el 1 de noviembre → 5 días; al llegar el 1 de enero del año
 * siguiente vuelve a corresponder el año completo.
 */
export function vacacionesDisponiblesAnio(
  e: Pick<Empleado, "alta" | "baja" | "diasVacacionesAnuales">,
  anio = Number(hoy().slice(0, 4))
): number {
  const iniAnio = `${anio}-01-01`;
  const finAnio = `${anio}-12-31`;
  // Causó baja en un año anterior: ese año ya no trabaja aquí.
  if (e.baja && compare(e.baja, iniAnio) < 0) return 0;
  const inicio = compare(e.alta, iniAnio) <= 0 ? iniAnio : e.alta;
  const fin = e.baja && compare(e.baja, finAnio) <= 0 ? e.baja : finAnio;
  if (compare(inicio, fin) > 0) return 0;
  // Año completo trabajado (alta antes del 1 de enero y sin baja durante el año).
  if (compare(e.alta, iniAnio) <= 0 && (!e.baja || compare(e.baja, finAnio) >= 0)) {
    return e.diasVacacionesAnuales;
  }
  const trabajados = diasEntre(inicio, fin); // inclusive
  return Math.round((e.diasVacacionesAnuales * trabajados) / diasDelAnio(anio));
}

// ---------------------------------------------------------- Exportar/importar
/** Copia serializable de todos los datos (sin automáticas: se regeneran al importar). */
export function exportarDatos(): AppData {
  return JSON.parse(
    JSON.stringify({
      version: VERSION_DATOS,
      empleados: state.empleados,
      ausencias: state.ausencias,
      tiempos: state.tiempos,
      asignaciones: state.asignaciones.filter((a) => a.origen === "manual"),
      descansos: state.descansos,
      historial: state.historial
    })
  ) as AppData;
}

export interface ResultadoImport {
  ok: boolean;
  mensaje: string;
  empleados?: number;
}

/** Valida un archivo JSON externo y sustituye los datos actuales si es válido. */
export function importarDatos(raw: unknown): ResultadoImport {
  if (!raw || typeof raw !== "object") {
    return { ok: false, mensaje: "El archivo no contiene datos válidos." };
  }
  const d = raw as Partial<AppData>;
  if (!Array.isArray(d.empleados)) {
    return { ok: false, mensaje: "No se encontró la lista de empleadas: este archivo no es una copia de Gestor de Personal." };
  }
  const empleados: Empleado[] = d.empleados.map((e) => ({ ...plantillaEmpleado(), ...(e as Partial<Empleado>) }));
  state.empleados = empleados;
  state.ausencias = Array.isArray(d.ausencias) ? (d.ausencias as Ausencia[]).map((a) => ({ comentario: "", ...a })) : [];
  state.tiempos = Array.isArray(d.tiempos) ? (d.tiempos as TiempoRecuperable[]).map((t) => ({ comentario: "", ...t })) : [];
  state.descansos = Array.isArray(d.descansos) ? d.descansos.filter((x) => typeof x === "string") : [];
  state.asignaciones = Array.isArray(d.asignaciones)
    ? (d.asignaciones as Asignacion[]).filter((a) => a && typeof a === "object" && a.origen === "manual")
    : [];
  state.historial = Array.isArray(d.historial) ? (d.historial as HistorialItem[]) : [];
  state.version = VERSION_DATOS;
  guardar();
  huecosPorQuincena.clear();
  regenerarAlrededor();
  return {
    ok: true,
    mensaje: `Se importaron los datos: ${state.empleados.length} empleadas, ${state.ausencias.length} ausencias, ${state.tiempos.length} apuntes de tiempo.`,
    empleados: state.empleados.length
  };
}

// ---------------------------------------------------------- Copias de seguridad
const CLAVE_COPIAS = "gestor-personal-copias";
const CLAVE_PLAN = "gestor-personal-plan-copia";

const PERIODO_MS: Record<PlanCopia["frecuencia"], number> = {
  dia: 24 * 3600e3,
  semana: 7 * 24 * 3600e3,
  mes: 30 * 24 * 3600e3
};

const memFallback = new Map<string, string>();
function leerClave(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return memFallback.get(clave) ?? null;
  }
}
function escribirClave(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    memFallback.set(clave, valor);
  }
}

export interface PlanCopia {
  activo: boolean;
  frecuencia: "dia" | "semana" | "mes";
  /** Nº máximo de copias que se conservan (rotación). */
  maxCopias: number;
  /** Fecha ISO de la última copia creada. */
  ultima: string | null;
}

export interface CopiaGuardada {
  id: number;
  creado: string;
  resumen: { empleados: number; ausencias: number; tiempos: number; historial: number };
  datos: AppData;
}

function planPorDefecto(): PlanCopia {
  return { activo: false, frecuencia: "dia", maxCopias: 5, ultima: null };
}

export function leerPlanCopia(): PlanCopia {
  try {
    const raw = leerClave(CLAVE_PLAN);
    if (!raw) return planPorDefecto();
    const p = { ...planPorDefecto(), ...(JSON.parse(raw) as Partial<PlanCopia>) };
    if (p.maxCopias < 1) p.maxCopias = 1;
    if (p.maxCopias > 30) p.maxCopias = 30;
    return p;
  } catch {
    return planPorDefecto();
  }
}

export function guardarPlanCopia(p: PlanCopia): PlanCopia {
  const sano = { ...p, maxCopias: Math.min(30, Math.max(1, Math.round(p.maxCopias) || 1)) };
  escribirClave(CLAVE_PLAN, JSON.stringify(sano));
  return sano;
}

export function copiasGuardadas(): CopiaGuardada[] {
  try {
    const raw = leerClave(CLAVE_COPIAS);
    if (!raw) return [];
    const lista = JSON.parse(raw) as CopiaGuardada[];
    return Array.isArray(lista) ? lista.sort((a, b) => (a.creado === b.creado ? b.id - a.id : a.creado < b.creado ? 1 : -1)) : [];
  } catch {
    return [];
  }
}

/** Crea una copia de seguridad completa y rota según el plan configurado. */
export function crearCopia(): CopiaGuardada {
  const copia: CopiaGuardada = {
    id: Date.now(),
    creado: new Date().toISOString(),
    resumen: {
      empleados: state.empleados.length,
      ausencias: state.ausencias.length,
      tiempos: state.tiempos.length,
      historial: state.historial.length
    },
    datos: exportarDatos()
  };
  const lista = copiasGuardadas();
  lista.unshift(copia);
  const plan = leerPlanCopia();
  escribirClave(CLAVE_COPIAS, JSON.stringify(lista.slice(0, Math.max(1, plan.maxCopias))));
  guardarPlanCopia({ ...plan, ultima: copia.creado });
  return copia;
}

export function eliminarCopia(id: number) {
  escribirClave(CLAVE_COPIAS, JSON.stringify(copiasGuardadas().filter((c) => c.id !== id)));
}

export function restaurarCopia(id: number): ResultadoImport {
  const copia = copiasGuardadas().find((c) => c.id === id);
  if (!copia) return { ok: false, mensaje: "No se encontró esa copia de seguridad." };
  return importarDatos(copia.datos);
}

/** ¿Toca crear una copia automática según el plan? */
export function ejecutarCopiaSiToca(): boolean {
  const plan = leerPlanCopia();
  if (!plan.activo) return false;
  const ahora = Date.now();
  if (plan.ultima && ahora - Date.parse(plan.ultima) < PERIODO_MS[plan.frecuencia]) return false;
  crearCopia();
  return true;
}

function comprobarCopiaProgramada() {
  try {
    ejecutarCopiaSiToca();
  } catch {
    /* sin almacenamiento disponible */
  }
}

// ------------------------------------------------------------------ Calendario
function enRango(fecha: Fecha, ini: Fecha, finExcl: Fecha): boolean {
  return compare(fecha, ini) >= 0 && compare(fecha, finExcl) < 0;
}

/** Turno dominante de cada empleada en la semana anterior a `lunes`. */
function turnoDominanteSemanaAnterior(lunes: Fecha): Map<number, Turno> {
  const ini = addDays(lunes, -7);
  const mapa = new Map<number, Turno>();
  const porEmp = new Map<number, Asignacion[]>();
  for (const a of state.asignaciones) {
    if (enRango(a.fecha, ini, lunes)) {
      const l = porEmp.get(a.empleadoId) ?? [];
      l.push(a);
      porEmp.set(a.empleadoId, l);
    }
  }
  for (const [id, lista] of porEmp) {
    const conteo: Record<Turno, number> = { M: 0, T: 0 };
    for (const a of lista) conteo[a.turno]++;
    mapa.set(id, conteo.T > conteo.M ? "T" : "M");
  }
  return mapa;
}

/**
 * Regenera la parte automática de la quincena respetando lo manual y los
 * descansos. Devuelve los huecos de cobertura.
 */
export function regenerarFortnight(inicio: Fecha, silencioso = false): Hueco[] {
  const fin = addDays(inicio, 14);
  const manuales = state.asignaciones.filter(
    (a) => a.origen === "manual" && enRango(a.fecha, inicio, fin));
  const descansos = new Set<string>();
  for (const d of state.descansos) {
    const fecha = d.slice(d.indexOf("|") + 1);
    if (enRango(fecha, inicio, fin)) descansos.add(d);
  }
  const previa = turnoDominanteSemanaAnterior(inicio);
  const plan = planificar({
    inicio,
    empleados: state.empleados,
    ausencias: state.ausencias,
    manuales,
    previa,
    descansos
  });

  // Si el resultado no cambia (p. ej. al navegar a una quincena ya generada o
  // regenerar sin tocar nada), no se toca el estado: evita re-renders y escrituras.
  const clave = (a: Asignacion) => `${a.fecha}|${a.empleadoId}|${a.turno}`;
  const autoActuales = state.asignaciones
    .filter((a) => a.origen === "auto" && enRango(a.fecha, inicio, fin))
    .map(clave)
    .sort();
  const autoNuevas = plan.auto.map(clave).sort();
  const huecosPrevios = huecosPorQuincena.get(inicio);
  const mismosHuecos = !!huecosPrevios && JSON.stringify(huecosPrevios) === JSON.stringify(plan.huecos);
  if (
    autoActuales.length === autoNuevas.length &&
    mismosHuecos &&
    autoActuales.every((k, i) => k === autoNuevas[i])
  ) {
    return plan.huecos;
  }

  // Sustituye solo las automáticas del período (las manuales se conservan).
  // Además se mantiene en memoria solo una ventana de quincenas alrededor de la
  // activa: navegar decenas de semanas no debe hacer crecer el estado (ni las
  // recomputaciones de la tabla) con todo el historial de automáticas.
  const ventanaIni = addDays(inicio, -28);
  const ventanaFin = addDays(inicio, 28);
  const restantes = state.asignaciones.filter((a) => {
    if (enRango(a.fecha, inicio, fin)) return false; // se reconstruye abajo
    if (a.origen === "manual") return true;
    // automáticas: solo las cercanas (para alternancia previa y navegación ±)
    return compare(a.fecha, ventanaIni) >= 0 && compare(a.fecha, ventanaFin) <= 0;
  });
  state.asignaciones = [...restantes, ...manuales, ...plan.auto];
  guardar();
  huecosPorQuincena.set(inicio, plan.huecos);
  void silencioso;
  return plan.huecos;
}

/** Asignaciones (manuales y automáticas) de la quincena. */
export function asignacionesQuincena(inicio: Fecha): Asignacion[] {
  return state.asignaciones.filter((a) => enRango(a.fecha, inicio, addDays(inicio, 14)));
}

/** Ausencias que afectan a un día. */
export function ausenciasEnDia(fecha: Fecha): Ausencia[] {
  return state.ausencias.filter((a) => compare(a.inicio, fecha) <= 0 && compare(a.fin, fecha) >= 0);
}

/** Ausencia de una empleada concreta en una fecha. */
export function ausenciaDeEmpleado(fecha: Fecha, empleadoId: number): Ausencia | undefined {
  return state.ausencias.find(
    (a) => a.empleadoId === empleadoId && compare(a.inicio, fecha) <= 0 && compare(a.fin, fecha) >= 0);
}

export function tieneDescanso(fecha: Fecha, empleadoId: number): boolean {
  return state.descansos.includes(`${empleadoId}|${fecha}`);
}

export function asignacionDe(fecha: Fecha, empleadoId: number): Asignacion | undefined {
  return state.asignaciones.find((a) => a.fecha === fecha && a.empleadoId === empleadoId);
}

/**
 * Edita el día de una empleada:
 *  * turno "M"|"T": fija ese turno (manual);
 *  * turno null: descanso (sin asignación ese día).
 */
export function editarDia(inicio: Fecha, fecha: Fecha, empleadoId: number, turno: Turno | null) {
  state.asignaciones = state.asignaciones.filter(
    (a) => !(a.fecha === fecha && a.empleadoId === empleadoId));
  state.descansos = state.descansos.filter((d) => d !== `${empleadoId}|${fecha}`);
  if (turno) {
    state.asignaciones.push({ fecha, turno, empleadoId, origen: "manual" });
  } else {
    state.descansos.push(`${empleadoId}|${fecha}`);
  }
  guardar();
  regenerarFortnight(inicio);
}

/** Devuelve la celda a control automático (quita manual y descanso). */
export function restaurarAuto(inicio: Fecha, fecha: Fecha, empleadoId: number) {
  state.asignaciones = state.asignaciones.filter(
    (a) => !(a.fecha === fecha && a.empleadoId === empleadoId));
  state.descansos = state.descansos.filter((d) => d !== `${empleadoId}|${fecha}`);
  guardar();
  regenerarFortnight(inicio);
}

/** Índice de la quincena siguiente/anterior para navegación. */
export function quincenaVecina(inicio: Fecha, delta: number): Fecha {
  return inicioDeQuincenaPorIndice(indiceQuincena(inicio) + delta);
}

function inicioDeQuincenaPorIndice(idx: number): Fecha {
  return addDays("2020-01-06", idx * 14);
}

/** Regenera la quincena actual y la anterior (tras cambios de plantilla/ausencias). */
export function regenerarAlrededor(): Hueco[] {
  const actual = inicioQuincena(hoy());
  const huecos: Hueco[] = [];
  for (const ini of [addDays(actual, -14), actual, addDays(actual, 14)]) {
    huecos.push(...regenerarFortnight(ini));
  }
  return huecos;
}

export { inicioQuincena };

import { reactive } from "vue";
import type { Asignacion, Ausencia, Empleado, Fecha, HistorialCambio, HistorialItem, Hueco, Origen, PeriodoCierre, PlanAvanzado, TiempoRecuperable, TipoTurno, Turno } from "./types";
import { plantillaEmpleado, TIPOS_TURNO_BASE, tipoNombre } from "./types";
import { addDays, compare, diasQuincena, diaSemanaISO, fmt, hoy, inicioDeIndice, inicioQuincena as inicioQuincenaBase, indiceQuincena } from "./dates";
import { formatearTiempo } from "./tiempo";
import { planificar } from "./scheduler";
import { generarFranjas, minutosAFormato, minutosDe, normalizarHora, MINUTOS_FRANJA } from "./horario";
import type { Franja } from "./horario";

// ------------------------------------------------------------------ Estado
const CLAVE = "gestor-personal-v2";
const VERSION_DATOS = 9; // v9: inicio y fin configurables de la semana laboral del Calendario de turnos

/** Rango horario por defecto de la vista Avanzada (franjas de 30 min). */
const RANGO_VISTA_POR_DEFECTO = { desde: "06:00", hasta: "22:00" } as const;

interface AppData {
  version?: number;
  empleados: Empleado[];
  ausencias: Ausencia[];
  /** Apuntes de tiempo recuperable (minutos con signo). */
  tiempos: TiempoRecuperable[];
  asignaciones: Asignacion[];
  /** Días de descanso fijados a mano: `${empleadoId}|${fecha}`. */
  descansos: string[];
  /** Historial de acciones por empleado (más reciente primero). */
  historial: HistorialItem[];
  /** Días de la semana en que la empresa cierra (1 = lunes … 7 = domingo). */
  diasCierre: number[];
  /** ¿Los días de cierre semanal cuentan como días de vacaciones? (Sí = naturales, No = laborables). */
  diasCierreCuentanVacaciones: boolean;
  /** Día (1 = lunes … 7 = domingo) en que empieza la semana laboral del Calendario de turnos. */
  inicioSemanaLaboral: number;
  /** Día (1 = lunes … 7 = domingo) en que termina la semana laboral del Calendario de turnos. */
  finSemanaLaboral: number;
  /** Períodos de cierre (p. ej. vacaciones de la empresa): rangos de fechas. */
  periodosCierre: PeriodoCierre[];
  /** Tipos de turno (Mañana/Tarde incluidos; si se borran, dejan de programarse). */
  tiposTurno: TipoTurno[];
  /** Hora de inicio (HH:MM) de las franjas de la vista Avanzada del calendario. */
  desdeVistaAvanzada: string;
  /** Hora de fin (HH:MM) de las franjas de la vista Avanzada del calendario. */
  hastaVistaAvanzada: string;
  /** Duración (en minutos) de cada franja de la vista Avanzada (p. ej. 30 = 00:30). */
  duracionFranjaVistaAvanzada: number;
  /** Planificación por horas de la vista Avanzada: tramos empleado + desde/hasta por día. */
  planAvanzada: PlanAvanzado[];
  /** La vista Avanzada del calendario está activada (visible y configurable). */
  vistaAvanzadaActivada: boolean;
  /** Semanas mostradas en el Calendario de turnos: 1 o 2. */
  semanasCalendario: 1 | 2;
  /** Columnas ocultadas en la tabla de Plantilla (claves de vista). */
  columnasOcultasPlantilla: string[];
}

const vacio = (): AppData => ({
  version: VERSION_DATOS,
  empleados: [],
  ausencias: [],
  tiempos: [],
  asignaciones: [],
  descansos: [],
  historial: [],
  diasCierre: [],
  diasCierreCuentanVacaciones: true,
  inicioSemanaLaboral: 1,
  finSemanaLaboral: 7,
  periodosCierre: [],
  tiposTurno: [...TIPOS_TURNO_BASE],
  desdeVistaAvanzada: RANGO_VISTA_POR_DEFECTO.desde,
  hastaVistaAvanzada: RANGO_VISTA_POR_DEFECTO.hasta,
  duracionFranjaVistaAvanzada: MINUTOS_FRANJA,
  planAvanzada: [],
  vistaAvanzadaActivada: true,
  semanasCalendario: 2,
  columnasOcultasPlantilla: []
});

/** Valida y normaliza un tramo de planificación de la vista Avanzada (o lo descarta). */
function normalizarPlanAvanzado(lista: unknown): PlanAvanzado[] {
  if (!Array.isArray(lista)) return [];
  const out: PlanAvanzado[] = [];
  for (const item of lista as Partial<PlanAvanzado>[]) {
    if (!item || typeof item !== "object") continue;
    const desde = normalizarHora(item.desde ?? "");
    const hasta = normalizarHora(item.hasta ?? "");
    if (
      typeof item.empleadoId !== "number" ||
      typeof item.fecha !== "string" ||
      !desde || !hasta || desde >= hasta
    ) continue;
    out.push({
      id: typeof item.id === "number" ? item.id : Date.now() + out.length,
      empleadoId: item.empleadoId,
      fecha: item.fecha,
      desde,
      hasta
    });
  }
  return out;
}

/** ¿Es un día de la semana válido (1 = lunes … 7 = domingo)? */
function esDiaSemana(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 7;
}

/** Devuelve la lista de tipos garantizando que Mañana y Tarde estén al principio. */
function conTurnosBase(lista: TipoTurno[]): TipoTurno[] {
  const personalizados = lista.filter((t) => t.id > 0);
  const base = TIPOS_TURNO_BASE.filter(
    (b) => !personalizados.some((t) => t.sigla === b.sigla));
  return [...base, ...personalizados];
}

function cargar(): AppData {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return vacio();
    const d = JSON.parse(raw) as AppData;
    if (!d || !Array.isArray(d.empleados)) return vacio();
    // Rellena con valores por defecto los campos nuevos (datos guardados antes de que existieran).
    d.empleados = d.empleados.map((e) => ({ ...plantillaEmpleado(), ...e }));
    // Ajustes (v4): cierre de la empresa y tipos de turno personalizados.
    d.diasCierre = Array.isArray(d.diasCierre)
      ? (d.diasCierre as unknown[]).filter((x): x is number => typeof x === "number" && x >= 1 && x <= 7)
      : [];
    // Los días de cierre semanal cuentan como vacaciones salvo que se desactive.
    d.diasCierreCuentanVacaciones = d.diasCierreCuentanVacaciones !== false;
    // Inicio y fin de la semana laboral (v9): por defecto lunes a domingo.
    d.inicioSemanaLaboral = esDiaSemana(d.inicioSemanaLaboral) ? d.inicioSemanaLaboral : 1;
    d.finSemanaLaboral = esDiaSemana(d.finSemanaLaboral) ? d.finSemanaLaboral : 7;
    // Semanas del Calendario de turnos (v10): 1 o 2.
    d.semanasCalendario = d.semanasCalendario === 1 ? 1 : 2;
    // Columnas ocultas de la tabla de Plantilla: claves de vista válidas.
    d.columnasOcultasPlantilla = Array.isArray(d.columnasOcultasPlantilla)
      ? d.columnasOcultasPlantilla.filter((x) => typeof x === "string")
      : [];
    d.periodosCierre = Array.isArray(d.periodosCierre)
      ? (d.periodosCierre as PeriodoCierre[]).filter(
          (p) => p && typeof p.inicio === "string" && typeof p.fin === "string" && p.inicio <= p.fin)
      : [];
    d.tiposTurno = Array.isArray(d.tiposTurno)
      ? (d.tiposTurno as Partial<TipoTurno>[]).map((t) => ({
          automatico: false,
          desde: undefined,
          hasta: undefined,
          ...t
        }) as TipoTurno)
      : [];
    // Migración v4 → v5: Mañana y Tarde pasan a ser entradas de tiposTurno y se
    // pueden borrar. En los datos anteriores a v5 no existían ahí: se añaden.
    // (Desde v5 se respeta la lista tal cual: si se borraron, siguen borrados.)
    if ((d.version ?? 1) < 5) {
      d.tiposTurno = conTurnosBase(d.tiposTurno);
    }
    // Migración v5 → v6: Mañana y Tarde ganan horario (desde/hasta) para la vista
    // Avanzada; si no lo tenían guardado se rellena con el por defecto.
    if ((d.version ?? 1) < 6) {
      for (const b of TIPOS_TURNO_BASE) {
        const t = d.tiposTurno.find((x) => x.id < 0 && x.sigla === b.sigla);
        if (t && (!t.desde || !t.hasta)) {
          if (!t.desde) t.desde = b.desde;
          if (!t.hasta) t.hasta = b.hasta;
        }
      }
    }
    // Rango de la vista Avanzada (v6): horas configurables de las franjas de 30 min.
    d.desdeVistaAvanzada = normalizarHora(d.desdeVistaAvanzada) ?? RANGO_VISTA_POR_DEFECTO.desde;
    d.hastaVistaAvanzada = normalizarHora(d.hastaVistaAvanzada) ?? RANGO_VISTA_POR_DEFECTO.hasta;
    if (d.desdeVistaAvanzada >= d.hastaVistaAvanzada) {
      d.desdeVistaAvanzada = RANGO_VISTA_POR_DEFECTO.desde;
      d.hastaVistaAvanzada = RANGO_VISTA_POR_DEFECTO.hasta;
    }
    // Duración de cada franja de la vista Avanzada (p. ej. 00:30 = 30 min).
    const dur = typeof d.duracionFranjaVistaAvanzada === "number" && Number.isFinite(d.duracionFranjaVistaAvanzada)
      ? Math.round(d.duracionFranjaVistaAvanzada)
      : MINUTOS_FRANJA;
    d.duracionFranjaVistaAvanzada =
      dur >= 10 && dur <= 240 ? dur : MINUTOS_FRANJA;
    // Capa de planificación por horas de la vista Avanzada (v7).
    d.planAvanzada = normalizarPlanAvanzado(d.planAvanzada);
    // La vista Avanzada está activada salvo que se desactivara expresamente.
    d.vistaAvanzadaActivada = d.vistaAvanzadaActivada !== false;
    // Migración v1 → v2: el planificador ya no usa disponibilidad por turnos y el
    // cómputo de días de vacaciones por defecto pasa de 22 a 30. (Solo afecta a
    // datos de la v1; las versiones nuevas ya guardan los días configurados.)
    if ((d.version ?? 1) < 2) {
      d.tiempos = Array.isArray(d.tiempos) ? d.tiempos : [];
      for (const e of d.empleados) {
        if (e.diasVacacionesAnuales === 22) e.diasVacacionesAnuales = 30;
        delete (e as unknown as Record<string, unknown>).dispManana;
        delete (e as unknown as Record<string, unknown>).dispTarde;
      }
    }
    // A partir de la v3 el historial ya se guarda; la v2 no lo tenía.
    if ((d.version ?? 1) < VERSION_DATOS) {
      d.version = VERSION_DATOS;
    }
    // Las asignaciones automáticas son deterministas y se regeneran al navegar:
    // solo se persisten las fijadas a mano (descansos aparte). Así el almacenamiento
    // y cada guardado no crecen con todo el historial de quincenas generadas.
    // Las antiguas «manual» pasan a considerarse cambios hechos por la empresa.
    d.asignaciones = (Array.isArray(d.asignaciones) ? d.asignaciones : [])
      .filter((a) => a && typeof a === "object" && (a as { origen?: string }).origen !== "auto")
      .map((a) => ({
        comentario: "",
        ...a,
        // Datos antiguos guardaban «manual»: ahora se consideran cambios de la empresa.
        origen: (a as { origen?: string }).origen === "manual" ? "empresa" : a.origen
      }));
    // Comentario opcional en ausencias y tiempo recuperable.
    if (Array.isArray(d.ausencias)) {
      d.ausencias = d.ausencias.map((a) => ({ comentario: "", ...a }));
    }
    if (Array.isArray(d.tiempos)) {
      d.tiempos = d.tiempos.map((t) => ({ comentario: "", ...t }));
    }
    // Migración v2 → v3: historial de acciones. Para los datos ya guardados se
    // anota al menos el alta de cada empleado como primera entrada.
    if (!Array.isArray(d.historial)) {
      d.historial = [];
      for (const e of d.empleados) {
        if (!e.alta) continue;
        d.historial.push({
          id: d.historial.length + 1,
          empleadoId: e.id,
          cuando: `${e.alta}T10:00:00.000Z`,
          tipo: "perfil",
          texto: `Empleado dado de alta el ${fmt(e.alta)}`
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
      asignaciones: state.asignaciones.filter((a) => a.origen !== "auto")
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
/** Añade una acción al historial de un empleado y persiste (máx. 150 por empleado). */
function registrarHistorial(
  empleadoId: number,
  tipo: HistorialItem["tipo"],
  texto: string,
  cambios?: HistorialCambio[]
) {
  state.historial.push({
    id: siguienteId(state.historial),
    empleadoId,
    cuando: new Date().toISOString(),
    tipo,
    texto,
    cambios: cambios && cambios.length ? cambios : undefined
  });
  const porEmp = state.historial.filter((h) => h.empleadoId === empleadoId);
  if (porEmp.length > 150) {
    const recortar = new Set(porEmp.slice(0, porEmp.length - 150).map((h) => h.id));
    state.historial = state.historial.filter((h) => !recortar.has(h.id));
  }
  guardar();
}

/** Acciones de un empleado, de la más reciente a la más antigua. */
export function historialDeEmpleado(id: number): HistorialItem[] {
  return state.historial
    .filter((h) => h.empleadoId === id)
    .sort((a, b) => (a.cuando === b.cuando ? b.id - a.id : a.cuando < b.cuando ? 1 : -1));
}

const NOMBRES_CAMPO_PERFIL: Record<string, string> = {
  nombre: "nombre",
  apellidos: "apellidos",
  dni: "DNI/NIE",
  nss: "nº Seguridad Social",
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

/** Valor legible de un campo de ficha para mostrarlo en el historial. */
function valorCampoPerfil(e: Empleado, clave: string): string {
  const v = (e as unknown as Record<string, unknown>)[clave];
  const vacio = v == null || v === "";
  switch (clave) {
    case "nacimiento":
      return vacio ? "—" : fmt(v as string);
    case "jornadaHoras":
      return vacio ? "—" : `${v} h`;
    case "salarioBruto":
      return vacio ? "—" : String(v);
    case "notas": {
      const t = String(v ?? "").trim();
      return t ? (t.length > 70 ? `${t.slice(0, 70)}…` : t) : "—";
    }
    default:
      return vacio ? "—" : String(v);
  }
}

/** Texto y cambios estructurados de una edición de ficha (vacíos si nada cambió). */
function resumenCambiosPerfil(antes: Empleado, nuevo: Empleado): {
  texto: string;
  cambios: HistorialCambio[];
} {
  const cambios: HistorialCambio[] = [];
  if (!antes.baja && nuevo.baja) {
    cambios.push({ nota: `Baja registrada el ${fmt(nuevo.baja)}` });
  } else if (antes.baja && !nuevo.baja) {
    cambios.push({ nota: "Fecha de baja eliminada (vuelve a estar activo)" });
  } else if (antes.baja && nuevo.baja && antes.baja !== nuevo.baja) {
    cambios.push({ nota: `Fecha de baja cambiada a ${fmt(nuevo.baja)}` });
  }
  const motivoCambiado =
    (antes.motivoBaja ?? "") !== (nuevo.motivoBaja ?? "") && antes.baja === nuevo.baja;
  if (motivoCambiado) cambios.push({ nota: "Comentario de la baja actualizado" });

  for (const [k, etiqueta] of Object.entries(NOMBRES_CAMPO_PERFIL)) {
    if ((antes as unknown as Record<string, unknown>)[k] !== (nuevo as unknown as Record<string, unknown>)[k]) {
      cambios.push({
        campo: etiqueta,
        antes: valorCampoPerfil(antes, k),
        despues: valorCampoPerfil(nuevo, k)
      });
    }
  }
  if (antes.alta !== nuevo.alta) {
    cambios.push({ campo: "fecha de alta", antes: fmt(antes.alta), despues: fmt(nuevo.alta) });
  }

  const partes: string[] = cambios.map((c) =>
    c.nota ? c.nota : `${c.campo} ${c.antes} → ${c.despues}`);
  return { texto: partes.join(" · "), cambios };
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
    { id: 1, empleadoId: 1, cuando: hace(2400 * 864e5), tipo: "perfil", texto: `Empleado dado de alta el ${fmt(datos[0].alta)}` },
    { id: 2, empleadoId: 1, cuando: hace(3 * 3600e3), tipo: "ausencia", texto: `Añadido: ${resumenAusencia(ausencias[0])}` },
    { id: 3, empleadoId: 1, cuando: hace(2 * 3600e3), tipo: "tiempo", texto: `Añadido apunte de tiempo recuperable: ${formatearTiempo(tiempos[0].minutos)} (${fmt(tiempos[0].fecha)})` },
    { id: 4, empleadoId: 4, cuando: hace(430 * 864e5), tipo: "perfil", texto: `Empleado dado de alta el ${fmt(datos[3].alta)}` },
    { id: 5, empleadoId: 4, cuando: hace(5 * 3600e3), tipo: "ausencia", texto: `Añadido: ${resumenAusencia(ausencias[1])}` },
    { id: 6, empleadoId: 4, cuando: hace(3600e3), tipo: "tiempo", texto: `Añadido apunte de tiempo recuperable: ${formatearTiempo(tiempos[1].minutos)} (${fmt(tiempos[1].fecha)})` },
    { id: 7, empleadoId: 7, cuando: hace(4 * 3600e3), tipo: "ausencia", texto: `Añadido: ${resumenAusencia(ausencias[2])}` },
    { id: 8, empleadoId: 2, cuando: hace(800 * 864e5), tipo: "perfil", texto: `Empleado dado de alta el ${fmt(datos[1].alta)}` },
    { id: 9, empleadoId: 3, cuando: hace(1500 * 864e5), tipo: "perfil", texto: `Empleado dado de alta el ${fmt(datos[2].alta)}` },
    { id: 10, empleadoId: 5, cuando: hace(1200 * 864e5), tipo: "perfil", texto: `Empleado dado de alta el ${fmt(datos[4].alta)}` },
    { id: 11, empleadoId: 6, cuando: hace(95 * 864e5), tipo: "perfil", texto: `Empleado dado de alta el ${fmt(datos[5].alta)}` },
    { id: 12, empleadoId: 7, cuando: hace(700 * 864e5), tipo: "perfil", texto: `Empleado dado de alta el ${fmt(datos[6].alta)}` }
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
    registrarHistorial(e.id, "perfil", `Empleado dado de alta el ${fmt(e.alta)}`);
  } else {
    const i = state.empleados.findIndex((x) => x.id === e.id);
    if (i >= 0) {
      const anterior = state.empleados[i];
      state.empleados[i] = e;
      const resumen = resumenCambiosPerfil(anterior, e);
      if (resumen.texto) registrarHistorial(e.id, "perfil", resumen.texto, resumen.cambios);
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
  state.planAvanzada = state.planAvanzada.filter((p) => p.empleadoId !== id);
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
    registrarHistorial(a.empleadoId, "ausencia", `Añadido: ${resumenAusencia(a)}`);
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
      if (partes.length) registrarHistorial(a.empleadoId, "ausencia", `Modificado: ${partes.join(" · ")}`);
    }
  }
  guardar();
  return a;
}

export function eliminarAusencia(id: number) {
  const a = state.ausencias.find((x) => x.id === id);
  state.ausencias = state.ausencias.filter((x) => x.id !== id);
  if (a) registrarHistorial(a.empleadoId, "ausencia", `Eliminado: ${resumenAusencia(a)}`);
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

/** Saldo (minutos con signo) acumulado por un empleado. */
export function saldoTiempoDe(empleadoId: number): number {
  let saldo = 0;
  for (const t of state.tiempos) {
    if (t.empleadoId === empleadoId) saldo += t.minutos;
  }
  return saldo;
}

/** Mapa de saldo por empleado (para listar sin repetir recorridos). */
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
    if (compare(iniD, finD) <= 0) {
      // Si los días de cierre semanal NO cuentan como vacaciones, se descuentan
      // del cómputo (días laborables); si cuentan, se cuentan todos (naturales).
      const { naturales, laborables } = contarDiasVacaciones(iniD, finD);
      usado += state.diasCierreCuentanVacaciones ? naturales : laborables;
    }
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
 * Días de vacaciones que corresponden a un empleado en `anio`.
 *
 * Si el alta es anterior al año y sigue activo (o causa baja al terminar el año)
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
      asignaciones: state.asignaciones.filter((a) => a.origen !== "auto"),
      descansos: state.descansos,
      historial: state.historial,
      diasCierre: state.diasCierre,
      diasCierreCuentanVacaciones: state.diasCierreCuentanVacaciones,
      inicioSemanaLaboral: state.inicioSemanaLaboral,
      finSemanaLaboral: state.finSemanaLaboral,
      periodosCierre: state.periodosCierre,
      tiposTurno: state.tiposTurno,
      desdeVistaAvanzada: state.desdeVistaAvanzada,
      hastaVistaAvanzada: state.hastaVistaAvanzada,
      duracionFranjaVistaAvanzada: state.duracionFranjaVistaAvanzada,
      planAvanzada: state.planAvanzada,
      vistaAvanzadaActivada: state.vistaAvanzadaActivada,
      semanasCalendario: state.semanasCalendario,
      columnasOcultasPlantilla: state.columnasOcultasPlantilla
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
    return { ok: false, mensaje: "No se encontró la lista de empleados: este archivo no es una copia de Gestor de Personal." };
  }
  const empleados: Empleado[] = d.empleados.map((e) => ({ ...plantillaEmpleado(), ...(e as Partial<Empleado>) }));
  state.empleados = empleados;
  state.ausencias = Array.isArray(d.ausencias) ? (d.ausencias as Ausencia[]).map((a) => ({ comentario: "", ...a })) : [];
  state.tiempos = Array.isArray(d.tiempos) ? (d.tiempos as TiempoRecuperable[]).map((t) => ({ comentario: "", ...t })) : [];
  state.descansos = Array.isArray(d.descansos) ? d.descansos.filter((x) => typeof x === "string") : [];
  state.planAvanzada = normalizarPlanAvanzado(d.planAvanzada);
  state.vistaAvanzadaActivada = d.vistaAvanzadaActivada !== false;
  state.columnasOcultasPlantilla = Array.isArray(d.columnasOcultasPlantilla)
    ? d.columnasOcultasPlantilla.filter((x) => typeof x === "string")
    : [];
  state.asignaciones = Array.isArray(d.asignaciones)
    ? (d.asignaciones as Asignacion[])
        .filter((a) => a && typeof a === "object" && (a as { origen?: string }).origen !== "auto")
        .map((a) => {
          // Datos antiguos guardaban «manual»: ahora se consideran cambios de la empresa.
          const origen = (a as { origen?: string }).origen;
          return { comentario: "", ...a, origen: origen === "manual" ? "empresa" : a.origen };
        })
    : [];
  state.historial = Array.isArray(d.historial) ? (d.historial as HistorialItem[]) : [];
  state.diasCierre = Array.isArray(d.diasCierre)
    ? (d.diasCierre as unknown[]).filter((x): x is number => typeof x === "number" && x >= 1 && x <= 7)
    : [];
  state.diasCierreCuentanVacaciones = d.diasCierreCuentanVacaciones !== false;
  state.inicioSemanaLaboral = esDiaSemana(d.inicioSemanaLaboral) ? d.inicioSemanaLaboral : 1;
  state.finSemanaLaboral = esDiaSemana(d.finSemanaLaboral) ? d.finSemanaLaboral : 7;
  state.periodosCierre = Array.isArray(d.periodosCierre)
    ? (d.periodosCierre as PeriodoCierre[]).filter(
        (p) => p && typeof p.inicio === "string" && typeof p.fin === "string" && p.inicio <= p.fin)
    : [];
  const tiposImportados = Array.isArray(d.tiposTurno)
    ? (d.tiposTurno as Partial<TipoTurno>[]).map((t) => ({
        automatico: false,
        desde: undefined,
        hasta: undefined,
        ...t
      }) as TipoTurno)
    : [];
  // Datos anteriores a v5 no guardaban Mañana/Tarde en tiposTurno: se añaden.
  state.tiposTurno = ((d.version ?? 1) < 5) ? conTurnosBase(tiposImportados) : tiposImportados;
  // Datos anteriores a v6: se rellena el horario por defecto de Mañana y Tarde.
  if ((d.version ?? 1) < 6) {
    for (const b of TIPOS_TURNO_BASE) {
      const t = state.tiposTurno.find((x) => x.id < 0 && x.sigla === b.sigla);
      if (t && (!t.desde || !t.hasta)) {
        if (!t.desde) t.desde = b.desde;
        if (!t.hasta) t.hasta = b.hasta;
      }
    }
  }
  state.desdeVistaAvanzada = normalizarHora(d.desdeVistaAvanzada ?? "") ?? RANGO_VISTA_POR_DEFECTO.desde;
  state.hastaVistaAvanzada = normalizarHora(d.hastaVistaAvanzada ?? "") ?? RANGO_VISTA_POR_DEFECTO.hasta;
  if (state.desdeVistaAvanzada >= state.hastaVistaAvanzada) {
    state.desdeVistaAvanzada = RANGO_VISTA_POR_DEFECTO.desde;
    state.hastaVistaAvanzada = RANGO_VISTA_POR_DEFECTO.hasta;
  }
  const durImportada = typeof d.duracionFranjaVistaAvanzada === "number" && Number.isFinite(d.duracionFranjaVistaAvanzada)
    ? Math.round(d.duracionFranjaVistaAvanzada)
    : MINUTOS_FRANJA;
  state.duracionFranjaVistaAvanzada = durImportada >= 10 && durImportada <= 240 ? durImportada : MINUTOS_FRANJA;
  state.version = VERSION_DATOS;
  state.semanasCalendario = d.semanasCalendario === 1 ? 1 : 2;
  guardar();
  huecosPorQuincena.clear();
  regenerarAlrededor();
  return {
    ok: true,
    mensaje: `Se importaron los datos: ${state.empleados.length} empleados, ${state.ausencias.length} ausencias, ${state.tiempos.length} apuntes de tiempo.`,
    empleados: state.empleados.length
  };
}

// ------------------------------------------------------------------ Ajustes
/** Guarda qué días de la semana cierra la empresa (1 = lunes … 7 = domingo). */
export function setDiasCierre(dias: number[]) {
  state.diasCierre = [...new Set(dias.filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b);
  guardar();
  regenerarAlrededor();
}

/** ¿Los días de cierre semanal cuentan como días de vacaciones? (Sí = naturales, No = laborables). */
export function setDiasCierreCuentanVacaciones(cuentan: boolean) {
  state.diasCierreCuentanVacaciones = cuentan;
  guardar();
}

/** Día (1 = lunes … 7 = domingo) en que empieza la semana laboral del Calendario de turnos. */
export function setInicioSemanaLaboral(dia: number) {
  if (!esDiaSemana(dia)) return;
  state.inicioSemanaLaboral = dia;
  guardar();
  regenerarAlrededor();
}

/** Día (1 = lunes … 7 = domingo) en que termina la semana laboral del Calendario de turnos. */
export function setFinSemanaLaboral(dia: number) {
  if (!esDiaSemana(dia)) return;
  state.finSemanaLaboral = dia;
  guardar();
  regenerarAlrededor();
}

/** Semanas mostradas en el Calendario de turnos: 1 o 2 (quincena). */
export function setSemanasCalendario(n: 1 | 2) {
  state.semanasCalendario = n;
  guardar();
}

/** Columnas ocultas en la tabla de Plantilla (se guarda tal cual). */
export function setColumnasOcultasPlantilla(claves: string[]) {
  state.columnasOcultasPlantilla = claves;
  guardar();
}

/** Días que abarca el período visible del calendario (7 u 14 según la preferencia). */
export function diasPorPeriodoCalendario(): number {
  return state.semanasCalendario === 1 ? 7 : 14;
}

/**
 * ¿Cae el día dentro de la semana laboral configurada (de inicioSemanaLaboral
 * a finSemanaLaboral, en orden cíclico)? Por defecto lunes (1) a domingo (7):
 * todos los días. Si la semana va de miércoles (3) a lunes (1), el martes (2)
 * queda fuera y no se muestra en el Calendario de turnos.
 */
export function diaEnSemanaLaboral(fecha: Fecha): boolean {
  const d = diaSemanaISO(fecha);
  const ini = state.inicioSemanaLaboral;
  const fin = state.finSemanaLaboral;
  if (ini <= fin) return d >= ini && d <= fin;
  // Cruza el domingo: p. ej. miércoles (3) a lunes (1) incluye 3,4,5,6,7,1.
  return d >= ini || d <= fin;
}

/**
 * Cuenta los días de vacaciones entre dos fechas (ambas incluidas):
 * naturales (todos) y laborables (excluye los días de cierre semanal).
 */
export function contarDiasVacaciones(inicio: Fecha, fin: Fecha): { naturales: number; laborables: number } {
  if (!inicio || !fin || compare(inicio, fin) > 0) return { naturales: 0, laborables: 0 };
  let naturales = 0;
  let laborables = 0;
  for (let d = inicio; compare(d, fin) <= 0; d = addDays(d, 1)) {
    naturales++;
    // Día de la semana en ISO (1 = lunes … 7 = domingo).
    const fecha = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))));
    const iso = ((fecha.getUTCDay() + 6) % 7) + 1;
    if (!state.diasCierre.includes(iso)) laborables++;
  }
  return { naturales, laborables };
}

/** Añade un período de cierre (empresa cerrada entre esas fechas, ambas incluidas). */
export function anyadirPeriodoCierre(inicio: Fecha, fin: Fecha) {
  if (!inicio || !fin || compare(inicio, fin) > 0) return;
  state.periodosCierre.push({ inicio, fin });
  guardar();
  regenerarAlrededor();
}

export function quitarPeriodoCierre(indice: number) {
  state.periodosCierre.splice(indice, 1);
  guardar();
  regenerarAlrededor();
}

/** Añade o actualiza un tipo de turno personalizado (id 0 = nuevo). */
export function guardarTipoTurno(tipo: TipoTurno) {
  const limpio: TipoTurno = {
    id: tipo.id,
    nombre: tipo.nombre.trim(),
    sigla: tipo.sigla.trim(),
    color: /^#[0-9a-fA-F]{6}$/.test(tipo.color) ? tipo.color : "#7C3AED",
    desde: tipo.desde?.trim() || undefined,
    hasta: tipo.hasta?.trim() || undefined,
    automatico: tipo.automatico
  };
  if (!limpio.sigla) return;
  // Mañana y Tarde no se crean como personalizados: si se borraron, se
  // restauran con `restaurarTurnosBase` para mantener su orden y comportamiento.
  if (limpio.id >= 0 && (limpio.sigla === "M" || limpio.sigla === "T")) return;
  const i = state.tiposTurno.findIndex((t) => t.id === limpio.id);
  if (i >= 0) state.tiposTurno[i] = limpio;
  else state.tiposTurno.push({ ...limpio, id: siguienteId(state.tiposTurno) });
  guardar();
  regenerarAlrededor();
}

/** Elimina un tipo de turno (incluidos Mañana y Tarde) y sus asignaciones a mano. */
export function quitarTipoTurno(id: number) {
  const tipo = state.tiposTurno.find((t) => t.id === id);
  state.tiposTurno = state.tiposTurno.filter((t) => t.id !== id);
  if (tipo) {
    state.asignaciones = state.asignaciones.filter(
      (a) => !(a.origen !== "auto" && a.turno === tipo.sigla));
  }
  guardar();
  regenerarAlrededor();
}

/** Vuelve a añadir Mañana y Tarde si alguno se había borrado (al principio de la lista). */
export function restaurarTurnosBase() {
  const faltan = TIPOS_TURNO_BASE.filter((b) => !state.tiposTurno.some((t) => t.sigla === b.sigla));
  if (!faltan.length) return;
  state.tiposTurno = conTurnosBase(state.tiposTurno);
  guardar();
  regenerarAlrededor();
}

/** Rango horario (HH:MM) configurado para la vista Avanzada del calendario. */
export function rangoVistaAvanzada(): { desde: string; hasta: string } {
  return { desde: state.desdeVistaAvanzada, hasta: state.hastaVistaAvanzada };
}

/**
 * Valida y guarda el rango de la vista Avanzada del calendario. Devuelve un
 * mensaje de error (o "" si se guardó correctamente). El rango debe encajar en
 * franjas completas con la duración configurada (p. ej. 06:00–22:00 con 00:30).
 */
export function setRangoVistaAvanzada(desde: string, hasta: string): string {
  const a = normalizarHora(desde);
  const b = normalizarHora(hasta);
  if (!a || !b) return "Indica la hora de inicio y de fin (HH:MM).";
  if (a >= b) return "La hora de inicio debe ser anterior a la de fin.";
  const total = (minutosDe(b) ?? 0) - (minutosDe(a) ?? 0);
  if (total % state.duracionFranjaVistaAvanzada !== 0) {
    return `El rango (${minutosAFormato(total)}) no encaja en franjas completas de ${minutosAFormato(state.duracionFranjaVistaAvanzada)}: ajusta las horas o la duración de la franja.`;
  }
  state.desdeVistaAvanzada = a;
  state.hastaVistaAvanzada = b;
  guardar();
  return "";
}

/**
 * Valida y guarda la duración de cada franja de la vista Avanzada (en formato
 * HH:MM, p. ej. «00:30» = media hora). Devuelve un mensaje de error (o "" si se
 * guardó correctamente). La duración debe dividir el rango horario configurado.
 */
export function setDuracionFranjaVistaAvanzada(duracion: string): string {
  const min = minutosDe(duracion);
  if (min === null) return "Indica la duración en formato HH:MM (p. ej. 00:30).";
  if (min < 10 || min > 240) return "La duración debe estar entre 00:10 y 04:00.";
  const a = minutosDe(state.desdeVistaAvanzada) ?? 0;
  const b = minutosDe(state.hastaVistaAvanzada) ?? 0;
  if (b > a && (b - a) % min !== 0) {
    return `El rango (${minutosAFormato(b - a)}) no encaja en franjas de ${minutosAFormato(min)}: elige una duración que lo divida (p. ej. 00:15, 00:30 o 01:00).`;
  }
  state.duracionFranjaVistaAvanzada = min;
  guardar();
  return "";
}

/** Duración (minutos) de cada franja de la vista Avanzada. */
export function duracionFranjaVistaAvanzada(): number {
  return state.duracionFranjaVistaAvanzada;
}

/** Activa o desactiva la vista Avanzada del calendario (y su configuración). */
export function setVistaAvanzadaActivada(activada: boolean) {
  state.vistaAvanzadaActivada = activada;
  guardar();
}

/** Franjas entre las horas configuradas para la vista Avanzada, con su duración. */
export function franjasVistaAvanzada(): Franja[] {
  return generarFranjas(
    state.desdeVistaAvanzada,
    state.hastaVistaAvanzada,
    state.duracionFranjaVistaAvanzada);
}

/** True si la empresa está cerrada ese día (cierre semanal o por período). */
export function esDiaCerrado(fecha: Fecha): boolean {
  // Día de la semana en ISO (1 = lunes … 7 = domingo).
  const d = new Date(Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10))));
  const iso = ((d.getUTCDay() + 6) % 7) + 1;
  if (state.diasCierre.includes(iso)) return true;
  return state.periodosCierre.some((p) => compare(fecha, p.inicio) >= 0 && compare(fecha, p.fin) <= 0);
}

/** Nombre, color y horas de un turno (M, T o sigla personalizada). */
export function infoTurno(sigla: string): {
  nombre: string;
  color?: string;
  desde?: string;
  hasta?: string;
} {
  if (sigla === "M" || sigla === "T") {
    const base = TIPOS_TURNO_BASE.find((t) => t.sigla === sigla);
    return base
      ? { nombre: base.nombre, desde: base.desde, hasta: base.hasta }
      : { nombre: sigla };
  }
  const t = state.tiposTurno.find((x) => x.sigla === sigla);
  return t
    ? { nombre: t.nombre || sigla, color: t.color, desde: t.desde, hasta: t.hasta }
    : { nombre: sigla };
}

/** Turnos que entran en la rotación automática (en orden de rotación). */
export function turnosAutomaticos(): string[] {
  return state.tiposTurno.filter((t) => t.automatico).map((t) => t.sigla);
}

/**
 * Duración en horas (1 decimal) de un turno asignado: si la asignación trae
 * `desde`/`hasta` propias (turno fijado a mano con horario) se usan esas;
 * si no, el horario por defecto del tipo de turno (Mañana/Tarde definidos en
 * Ajustes). Un turno sin horario definido cuenta 0 horas.
 */
export function horasDeAsignacion(a: Asignacion): number {
  const desde = a.desde ?? infoTurno(a.turno).desde;
  const hasta = a.hasta ?? infoTurno(a.turno).hasta;
  const h = minutosDe(desde ?? "");
  const m = minutosDe(hasta ?? "");
  if (h === null || m === null || m <= h) return 0;
  return Math.round(((m - h) / 60) * 10) / 10;
}

/**
 * Horas trabajadas de un empleado **en la semana en curso**: solo se suman
 * los días anteriores a hoy (si hoy es jueves, cuentan lunes, martes y
 * miércoles). La semana va del `inicioSemanaLaboral` (por defecto lunes) al
 * `finSemanaLaboral` (por defecto domingo), así que el acumulado vuelve a
 * cero al empezar cada semana laboral.
 */
export function horasTrabajadasSemana(empleadoId: number, referencia: Fecha = hoy()): number {
  const ini = state.inicioSemanaLaboral;
  // Fecha del día de inicio de la semana laboral de la semana de `referencia`.
  let inicioSemana = referencia;
  for (let i = 0; i < 7; i++) {
    if (diaSemanaISO(inicioSemana) === ini) break;
    inicioSemana = addDays(inicioSemana, -1);
  }
  let total = 0;
  // Del inicio de la semana al día anterior a la referencia (ambos laborables).
  for (let d = inicioSemana; compare(d, referencia) < 0; d = addDays(d, 1)) {
    if (!diaEnSemanaLaboral(d)) continue;
    for (const a of state.asignaciones) {
      if (a.fecha === d && a.empleadoId === empleadoId) total += horasDeAsignacion(a);
    }
  }
  return Math.round(total * 10) / 10;
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

/** Turno dominante de cada empleado en la semana anterior a `lunes`. */
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
    // Solo cuentan M y T: los turnos personalizados a mano no alteran la rotación.
    const conteo: Record<string, number> = {};
    for (const a of lista) conteo[a.turno] = (conteo[a.turno] ?? 0) + 1;
    mapa.set(id, (conteo.T ?? 0) > (conteo.M ?? 0) ? "T" : "M");
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
    (a) => a.origen !== "auto" && enRango(a.fecha, inicio, fin));
  const descansos = new Set<string>();
  for (const d of state.descansos) {
    const fecha = d.slice(d.indexOf("|") + 1);
    if (enRango(fecha, inicio, fin)) descansos.add(d);
  }
  const cerrados = new Set<string>();
  for (const f of diasQuincena(inicio)) {
    if (esDiaCerrado(f)) cerrados.add(f);
  }
  const previa = turnoDominanteSemanaAnterior(inicio);
  const plan = planificar({
    inicio,
    empleados: state.empleados,
    ausencias: state.ausencias,
    manuales,
    previa,
    descansos,
    tipos: state.tiposTurno,
    cerrados
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
    if (a.origen !== "auto") return true;
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

/** Ausencia de un empleado concreto en una fecha. */
export function ausenciaDeEmpleado(fecha: Fecha, empleadoId: number): Ausencia | undefined {
  return state.ausencias.find(
    (a) => a.empleadoId === empleadoId && compare(a.inicio, fecha) <= 0 && compare(a.fin, fecha) >= 0);
}

export function tieneDescanso(fecha: Fecha, empleadoId: number): boolean {
  return state.descansos.includes(`${empleadoId}|${fecha}`);
}

/** Quita un turno concreto con horas de un empleado en un día (la combinación
 *  fecha+empleado+horas es única: no se puede añadir el mismo tramo dos veces). */
export function quitarTurnoConHoras(
  inicio: Fecha,
  fecha: Fecha,
  empleadoId: number,
  desde: string,
  hasta: string,
  turno: Turno
) {
  const antes = state.asignaciones.length;
  state.asignaciones = state.asignaciones.filter(
    (a) =>
      !(a.fecha === fecha &&
        a.empleadoId === empleadoId &&
        a.desde === desde &&
        a.hasta === hasta &&
        a.turno === turno));
  if (state.asignaciones.length !== antes) {
    guardar();
    regenerarFortnight(inicio);
  }
}

export function asignacionDe(fecha: Fecha, empleadoId: number): Asignacion | undefined {
  return state.asignaciones.find((a) => a.fecha === fecha && a.empleadoId === empleadoId);
}

/** Todas las asignaciones (0..n) de un empleado en una fecha. */
export function asignacionesDe(fecha: Fecha, empleadoId: number): Asignacion[] {
  return state.asignaciones.filter((a) => a.fecha === fecha && a.empleadoId === empleadoId);
}

/**
 * Sustituye todas las asignaciones de un empleado en una fecha por la lista dada
 * (ya validada): un turno principal sin horas + adicionales con horario, o nada
 * (descanso). Recalcula el plan automático del período.
 */
export function fijarAsignacionesDia(
  inicio: Fecha,
  fecha: Fecha,
  empleadoId: number,
  asignaciones: Asignacion[]
) {
  state.asignaciones = state.asignaciones.filter(
    (a) => !(a.fecha === fecha && a.empleadoId === empleadoId));
  state.descansos = state.descansos.filter((d) => d !== `${empleadoId}|${fecha}`);
  if (asignaciones.length === 0) {
    // Sin turnos = descanso: hay que marcarlo explícitamente o el plan
    // automático volvería a rellenar el día al regenerar la quincena.
    state.descansos.push(`${empleadoId}|${fecha}`);
  }
  for (const a of asignaciones) state.asignaciones.push({ ...a, fecha, empleadoId });
  guardar();
  regenerarFortnight(inicio);
}

/**
 * True si el tramo [desde, hasta) del turno nuevo se solapa con otro turno ya
 * fijado a mano ese mismo día para el empleado (rango medio-abierto: p. ej.
 * terminar a las 14:00 y empezar otra a las 14:00 es válido; pisarse, no).
 */
export function solapanTurnosManuales(
  fecha: Fecha,
  empleadoId: number,
  desde: string,
  hasta: string
): boolean {
  const a = minutosDe(desde);
  const b = minutosDe(hasta);
  if (a === null || b === null) return false;
  return state.asignaciones.some(
    (x) =>
      x.fecha === fecha &&
      x.empleadoId === empleadoId &&
      x.origen !== "auto" &&
      !!x.desde && !!x.hasta &&
      (minutosDe(x.desde) ?? 0) < b &&
      (minutosDe(x.hasta) ?? 0) > a);
}

/**
 * Edita el día de un empleado:
 *  * turno "M"|"T" (o personalizado): fija ese turno a mano, con origen (empresa
 *    o intercambio entre empleados) y comentario opcional. Si se indican
 *    `horas`, el turno se AÑADE como jornada horada (un empleado puede tener
 *    varios turnos el mismo día siempre que no se solapen) y devuelve "" o un
 *    mensaje de error; sin `horas` sustituye lo que hubiera (comportamiento de
 *    siempre).
 *  * turno null: descanso (sin asignación ese día).
 */
export function editarDia(
  inicio: Fecha,
  fecha: Fecha,
  empleadoId: number,
  turno: Turno | null,
  origen: Exclude<Origen, "auto"> = "empresa",
  comentario = "",
  horas?: { desde: string; hasta: string }
): string {
  if (horas) {
    // Añadir un turno con horas (varios turnos al día, sin solapes).
    if (!turno) return "Elige un turno para añadir con horario.";
    const a = normalizarHora(horas.desde);
    const b = normalizarHora(horas.hasta);
    if (!a || !b) return "Indica una hora de inicio y de fin válidas (HH:MM).";
    if (a >= b) return "La hora de inicio debe ser anterior a la de fin.";
    if (solapanTurnosManuales(fecha, empleadoId, a, b)) {
      return "Ese empleado ya tiene un turno que se solapa con esas horas ese día.";
    }
    state.asignaciones.push({
      fecha,
      turno,
      empleadoId,
      origen,
      comentario: comentario.trim() || undefined,
      desde: a,
      hasta: b
    });
    guardar();
    regenerarFortnight(inicio);
    return "";
  }
  state.asignaciones = state.asignaciones.filter(
    (a) => !(a.fecha === fecha && a.empleadoId === empleadoId));
  state.descansos = state.descansos.filter((d) => d !== `${empleadoId}|${fecha}`);
  if (turno) {
    state.asignaciones.push({
      fecha,
      turno,
      empleadoId,
      origen,
      comentario: comentario.trim() || undefined
    });
  } else {
    state.descansos.push(`${empleadoId}|${fecha}`);
  }
  guardar();
  regenerarFortnight(inicio);
  return "";
}

/** Devuelve la celda a control automático (quita manual y descanso). */
export function restaurarAuto(inicio: Fecha, fecha: Fecha, empleadoId: number) {
  state.asignaciones = state.asignaciones.filter(
    (a) => !(a.fecha === fecha && a.empleadoId === empleadoId));
  state.descansos = state.descansos.filter((d) => d !== `${empleadoId}|${fecha}`);
  guardar();
  regenerarFortnight(inicio);
}

/**
 * Añade un tramo de planificación de la vista Avanzada a un empleado en un día.
 * Un empleado puede tener varios tramos el mismo día (p. ej. 09:00–11:00 y
 * 14:00–18:00), siempre que no se solapen entre sí. Devuelve "" si se guardó o
 * un mensaje de error si las horas no son válidas o se solapan con otro tramo.
 */
export function guardarPlanAvanzado(
  fecha: Fecha,
  empleadoId: number,
  desde: string,
  hasta: string
): string {
  const a = normalizarHora(desde);
  const b = normalizarHora(hasta);
  if (!a || !b) return "Indica una hora de inicio y de fin válidas (HH:MM).";
  if (a >= b) return "La hora de inicio debe ser anterior a la de fin.";
  const solape = state.planAvanzada.find(
    (p) =>
      p.fecha === fecha &&
      p.empleadoId === empleadoId &&
      p.desde < b &&
      p.hasta > a);
  if (solape) {
    return `Ese empleado ya trabaja de ${solape.desde} a ${solape.hasta} ese día: elige horas que no se solapen.`;
  }
  state.planAvanzada.push({
    id: siguienteIdPlan(),
    empleadoId,
    fecha,
    desde: a,
    hasta: b
  });
  guardar();
  return "";
}

/** Siguiente id numérico para un tramo nuevo de la vista Avanzada. */
function siguienteIdPlan(): number {
  return state.planAvanzada.reduce((max, p) => Math.max(max, p.id), 0) + 1;
}

/** Quita un tramo concreto (por id) de la vista Avanzada. */
export function quitarPlanAvanzadoPorId(id: number) {
  state.planAvanzada = state.planAvanzada.filter((p) => p.id !== id);
  guardar();
}

/** Quita todos los tramos planificados de un empleado en un día de la vista Avanzada. */
export function quitarPlanAvanzado(fecha: Fecha, empleadoId: number) {
  state.planAvanzada = state.planAvanzada.filter(
    (p) => !(p.fecha === fecha && p.empleadoId === empleadoId));
  guardar();
}

/** Índice de la quincena siguiente/anterior para navegación (alineada al inicio de semana). */
export function quincenaVecina(inicio: Fecha, delta: number): Fecha {
  return inicioDeIndice(indiceQuincena(inicio, state.inicioSemanaLaboral) + delta, state.inicioSemanaLaboral);
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

/** Inicio de la quincena visible, alineado al día de inicio de la semana laboral. */
export function inicioQuincena(iso: Fecha): Fecha {
  return inicioQuincenaBase(iso, state.inicioSemanaLaboral);
}

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import Icono from "../components/Icono.vue";
import {
  editarDia,
  empleadosOrdenados,
  esDiaCerrado,
  franjasVistaAvanzada,
  guardarPlanAvanzado,
  huecosPorQuincena,
  infoTurno,
  inicioQuincena,
  quincenaVecina,
  quitarPlanAvanzadoPorId,
  regenerarFortnight,
  restaurarAuto,
  state
} from "../lib/store";
import { minutosAFormato, minutosDe } from "../lib/horario";
import type { Franja } from "../lib/horario";
import { addDays, diasQuincena, fmt, hoy, nombreDia, nombreDiaCorto, semanaISO } from "../lib/dates";
import { nombreCompleto, tintaSobre, tipoInfo } from "../lib/types";
import type { CeldaPdf, FilaPdf } from "../lib/pdf";
import type { Asignacion, Ausencia, Empleado, Fecha, Origen, PlanAvanzado, TipoTurno, Turno } from "../lib/types";

const inicio = ref<Fecha>(inicioQuincena(hoy()));
const dias = computed(() => diasQuincena(inicio.value));
const empleados = computed(() => empleadosOrdenados());

// ------------------------------------------- filtro por estado (como Plantilla)
// La «actividad» es relativa a la quincena visible: un empleado con fecha de
// baja sigue contando como activo mientras la quincena mostrada incluya la
// semana de su último día (baja >= inicio); después pasa a No activos.
type FiltroEstado = "activos" | "noactivos" | "todos";
const filtroEstado = ref<FiltroEstado>("activos");
const OPCIONES_FILTRO: { id: FiltroEstado; etiqueta: string }[] = [
  { id: "activos", etiqueta: "Activos" },
  { id: "noactivos", etiqueta: "No activos" },
  { id: "todos", etiqueta: "Todos" }
];

/** Un empleado se considera activo en la quincena visible si no tiene fecha de
 *  baja o su último día cae dentro de la quincena (misma regla que el planificador). */
function activoEnQuincena(e: Empleado): boolean {
  return !e.baja || e.baja >= inicio.value;
}

const totalesFiltro = computed(() => {
  const todos = empleadosOrdenados();
  const activos = todos.filter(activoEnQuincena).length;
  return { total: todos.length, activos };
});

function conteoFiltro(id: FiltroEstado): number {
  if (id === "activos") return totalesFiltro.value.activos;
  if (id === "noactivos") return totalesFiltro.value.total - totalesFiltro.value.activos;
  return totalesFiltro.value.total;
}

const mensajeVacio = computed(() => {
  if (!totalesFiltro.value.total) {
    return { titulo: "Aún no hay empleados registrados.", sub: "Añade empleados en «Plantilla»." };
  }
  if (filtroEstado.value === "activos") {
    return { titulo: "No hay empleados activos en esta quincena.", sub: "Cambia el filtro a «No activos» o «Todos»." };
  }
  if (filtroEstado.value === "noactivos") {
    return { titulo: "No hay empleados de baja en esta quincena.", sub: "Cambia el filtro a «Todos»." };
  }
  return { titulo: "", sub: "" };
});

/** Empleados visibles en la tabla según el filtro (por defecto solo activos). */
const empleadosFiltrados = computed(() =>
  empleadosOrdenados().filter((e) =>
    filtroEstado.value === "activos" ? activoEnQuincena(e) :
    filtroEstado.value === "noactivos" ? !activoEnQuincena(e) :
    true));

/** Ancho de la columna Empleados: se mide el nombre más largo visible para que
 *  salga completo en UNA línea (con margen). Los días mantienen el mismo ancho
 *  porque la tabla usa `table-layout: fixed` (la columna de empleados se lleva
 *  lo que necesita y el resto se reparte por igual). */
const anchoColEmpleados = computed(() => {
  if (typeof document === "undefined") return 230;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 230;
  ctx.font = "600 12.5px 'Segoe UI Variable', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
  let maxPx = 0;
  for (const e of empleadosFiltrados.value) {
    const w = ctx.measureText(nombreCompleto(e)).width;
    if (w > maxPx) maxPx = w;
  }
  // avatar + hueco + padding de la celda + margen
  return Math.min(360, Math.max(230, Math.ceil(maxPx) + 24 + 8 + 20 + 14));
});

// ----------------------------------------------------- vista Simple / Avanzada
type VistaCal = "simple" | "avanzada";
const CLAVE_VISTA = "gestor-personal-vista-calendario";
const vista = ref<VistaCal>(cargarVista());
function cargarVista(): VistaCal {
  try {
    return localStorage.getItem(CLAVE_VISTA) === "avanzada" ? "avanzada" : "simple";
  } catch {
    return "simple";
  }
}
function cambiarVista(v: VistaCal) {
  vista.value = v;
  try {
    localStorage.setItem(CLAVE_VISTA, v);
  } catch {
    /* sin almacenamiento disponible */
  }
}

/** Vista realmente visible: si la Avanzada está desactivada en Ajustes, siempre Simple. */
const vistaEfectiva = computed<VistaCal>(() =>
  state.vistaAvanzadaActivada ? vista.value : "simple");

// ------------------------------------- vista Avanzada (columnas = días)
/** Franjas de 30 min del rango configurado en Ajustes (p. ej. 06:00 → 22:00). */
const franjas = computed(() => franjasVistaAvanzada());

/** Bloques de la capa de planificación por horas (con su empleado), por fecha. */
const bloquesPorFecha = computed(() => {
  const porId = new Map(empleados.value.map((e) => [e.id, e]));
  const mapa = new Map<Fecha, { p: PlanAvanzado; e: Empleado }[]>();
  for (const p of state.planAvanzada) {
    const e = porId.get(p.empleadoId);
    if (!e) continue;
    const lista = mapa.get(p.fecha) ?? [];
    lista.push({ p, e });
    mapa.set(p.fecha, lista);
  }
  return mapa;
});

/** True si el bloque (desde–hasta) cubre por completo la franja. */
function bloqueCubreFranja(p: { desde: string; hasta: string }, fr: Franja): boolean {
  const a = minutosDe(p.desde);
  const b = minutosDe(p.hasta);
  const i = minutosDe(fr.desde);
  const j = minutosDe(fr.hasta);
  return a !== null && b !== null && i !== null && j !== null && a <= i && b >= j;
}

/** Carril de un empleado en una franja concreta de un día. Un empleado puede
 *  tener varios tramos el mismo día; el carril se pinta si alguno lo cubre. */
interface CarrilPlan {
  e: Empleado;
  /** Tramos del día que cubren esta franja (nunca se solapan). */
  tramos: PlanAvanzado[];
  activo: boolean;
}

interface CeldaPlan {
  fecha: Fecha;
  fr: Franja;
  /** Un carril vertical por empleado del día (orden fijo), activo o no en esta franja. */
  carriles: CarrilPlan[];
  cerrado: boolean;
  esHoy: boolean;
  titulo: string;
}
interface FilaPlan {
  etiqueta: string;
  celdas: CeldaPlan[];
}

/**
 * Una fila por franja; columnas = días de la quincena visible. Para que la
 * jornada de cada empleado se lea como bandas verticales (de qué hora a qué
 * hora), cada día mantiene un carril por empleado en orden fijo y cada celda
 * solo pinta los empleados cuyo tramo cubre esa franja. Si un empleado tiene
 * varios tramos separados el mismo día (p. ej. 09:00–11:00 y 14:00–18:00),
 * su carril se pinta en cada tramo y queda el hueco entre medias sin pintar.
 */
const filasPlan = computed<FilaPlan[]>(() => {
  const bf = bloquesPorFecha.value;
  const diasArr = dias.value;
  // Empleados de cada día con todos sus tramos, en orden estable (por la hora
  // del primer tramo y luego por id) para que los carriles no cambien de sitio.
  const empleadosDelDia = diasArr.map((f) => {
    const porEmp = new Map<number, { e: Empleado; bloques: PlanAvanzado[] }>();
    for (const { p, e } of bf.get(f) ?? []) {
      let ent = porEmp.get(e.id);
      if (!ent) {
        ent = { e, bloques: [] };
        porEmp.set(e.id, ent);
      }
      ent.bloques.push(p);
    }
    const lista = [...porEmp.values()];
    lista.sort(
      (a, b) =>
        (minutosDe(a.bloques[0].desde) ?? 0) - (minutosDe(b.bloques[0].desde) ?? 0) ||
        a.e.id - b.e.id);
    return { fecha: f, lista };
  });
  return franjas.value.map((fr) => {
    const etiqueta = `${fr.desde}–${fr.hasta}`;
    return {
      etiqueta,
      celdas: empleadosDelDia.map(({ fecha, lista }): CeldaPlan => {
        const carriles: CarrilPlan[] = lista.map(({ e, bloques }) => {
          const tramos = bloques.filter((p) => bloqueCubreFranja(p, fr));
          return { e, tramos, activo: tramos.length > 0 };
        });
        const activos = carriles.filter((c) => c.activo);
        const cerrado = esDiaCerrado(fecha);
        const cabecera = `${nombreDia(fecha)}, ${fmt(fecha)} · ${etiqueta}`;
        const nombres = activos
          .map((c) =>
            `${nombreCompleto(c.e)} ${c.tramos.map((t) => `${t.desde}–${t.hasta}`).join(" y ")}`)
          .join("\n");
        return {
          fecha,
          fr,
          carriles,
          cerrado,
          esHoy: fecha === hoy(),
          titulo: cerrado
            ? `${cabecera} · empresa cerrada`
            : activos.length
              ? `${cabecera}\n${nombres}`
              : `${cabecera} · hueco libre: clic para añadir`
        };
      })
    };
  });
});

// ------------------------------------------- editor de la vista Avanzada
const popupAv = reactive<{ x: number; y: number; visible: boolean; fecha: Fecha | null; fr: Franja | null }>({
  x: 0, y: 0, visible: false, fecha: null, fr: null
});
const popoverAvEl = ref<HTMLElement | null>(null);
const borradorAv = reactive<{ empleadoId: number; desde: string; hasta: string }>({
  empleadoId: 0, desde: "", hasta: ""
});
const avisoAv = ref("");

/** Límites horarios que ofrece el editor (fronteras de las franjas). */
const horasDisponibles = computed(() => {
  const fs = franjas.value;
  if (!fs.length) return [];
  const hs = [fs[0].desde];
  for (const fr of fs) if (!hs.includes(fr.hasta)) hs.push(fr.hasta);
  return hs;
});

/** Bloques de la fecha abierta que cubren la franja pulsada. */
const bloquesPopup = computed(() => {
  if (!popupAv.fecha || !popupAv.fr) return [];
  return (bloquesPorFecha.value.get(popupAv.fecha) ?? [])
    .filter(({ p }) => bloqueCubreFranja(p, popupAv.fr!));
});

function ausenteFecha(empleadoId: number, fecha: Fecha): boolean {
  return state.ausencias.some((a) => a.empleadoId === empleadoId && a.inicio <= fecha && a.fin >= fecha);
}

/** Empleados que se pueden añadir a la franja abierta: activos, sin ausencia ese
 *  día y que no la estén cubriendo ya (si ya trabajan otras horas ese día, se
 *  les permite un segundo tramo). */
const candidatosAv = computed(() => {
  const f = popupAv.fecha;
  if (!f || !popupAv.fr) return [];
  return empleadosOrdenados().filter(
    (e) =>
      !e.baja &&
      !ausenteFecha(e.id, f) &&
      !state.planAvanzada.some(
        (p) => p.fecha === f && p.empleadoId === e.id && bloqueCubreFranja(p, popupAv.fr!)));
});

/** Turnos con horario (M/T/custom): atajos para rellenar desde/hasta. */
const turnosConHoras = computed(() => state.tiposTurno.filter((t) => t.desde && t.hasta));

function abrirEditorAv(event: MouseEvent, celda: CeldaPlan) {
  if (celda.cerrado || !celda.fr) return;
  popupAv.fecha = celda.fecha;
  popupAv.fr = celda.fr;
  borradorAv.desde = celda.fr.desde;
  borradorAv.hasta = celda.fr.hasta;
  const primero = candidatosAv.value[0];
  borradorAv.empleadoId = primero?.id ?? 0;
  avisoAv.value = "";
  popupAv.x = Math.min(event.clientX, window.innerWidth - 260);
  popupAv.y = Math.min(event.clientY, window.innerHeight - 480);
  popupAv.visible = true;
}
function cerrarPopupAv() {
  popupAv.visible = false;
  popupAv.fecha = null;
  popupAv.fr = null;
}
/** Aplica las horas de un turno con horario al borrador (atajo M/T/custom). */
function usarHorasTurno(desde: string, hasta: string) {
  borradorAv.desde = desde;
  borradorAv.hasta = hasta;
  avisoAv.value = "";
}
/** Guarda el tramo elegido para el empleado del borrador en la fecha abierta. */
function guardarPopupAv() {
  if (!popupAv.fecha) return;
  const msg = guardarPlanAvanzado(
    popupAv.fecha, borradorAv.empleadoId, borradorAv.desde, borradorAv.hasta);
  avisoAv.value = msg;
  if (msg) return;
  // Prepara el siguiente alta.
  const primero = candidatosAv.value[0];
  borradorAv.empleadoId = primero?.id ?? 0;
}
function quitarBloqueAv(idBloque: number) {
  quitarPlanAvanzadoPorId(idBloque);
}

// ----------------------------------------------------------------- navegación
function navegar(delta: number) {
  inicio.value = quincenaVecina(inicio.value, delta);
  regenerarFortnight(inicio.value);
}
function irHoy() {
  inicio.value = inicioQuincena(hoy());
  regenerarFortnight(inicio.value);
}
function regenerar() {
  regenerarFortnight(inicio.value);
}

onMounted(() => {
  // Garantiza la quincena visible generada (puede que el usuario navegara antes).
  regenerarFortnight(inicio.value);
  document.addEventListener("click", alClicFuera);
  document.addEventListener("keydown", alTeclaEsc);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", alClicFuera);
  document.removeEventListener("keydown", alTeclaEsc);
});

// ------------------------------------------------------------------ celdas
// La matriz completa de la quincena se calcula UNA vez por render con índices
// O(1) (fecha → empleado); antes cada celda barría el array global de
// asignaciones/ausencias, con coste cuadrático al crecer la plantilla.
type EstadoCelda =
  | { tipo: "turno"; turno: Turno; origen: Origen; comentario?: string; color?: string; tinta?: string }
  | { tipo: "descanso" }
  | { tipo: "cerrado" }
  | { tipo: "ausencia"; sigla: string; tipoNombre: string }
  | { tipo: "vacio" };

interface Celda {
  fecha: Fecha;
  estado: EstadoCelda;
  clase: string;
  /** Estilo inline para turnos personalizados (fondo y letra de su color). */
  estilo?: Record<string, string>;
  texto: string;
  titulo: string;
}

interface Fila {
  e: Empleado;
  celdas: Celda[];
}

function claseCelda(estado: EstadoCelda, fecha: Fecha): string {
  const clases = ["celda-turno"];
  if (estado.tipo === "turno") {
    // M y T usan clases propias; los personalizados llevan su color inline.
    if (estado.turno === "M") clases.push("manana");
    else if (estado.turno === "T") clases.push("tarde");
    else clases.push("personalizado");
    if (estado.origen === "empresa") clases.push("empresa");
    else if (estado.origen === "intercambio") clases.push("intercambio");
  } else if (estado.tipo === "descanso") clases.push("descanso");
  else if (estado.tipo === "cerrado") clases.push("cerrado");
  else if (estado.tipo === "ausencia") clases.push("ausencia");
  else clases.push("vacia");
  if (fecha === hoy()) clases.push("hoy");
  return clases.join(" ");
}

function textoCelda(estado: EstadoCelda): string {
  if (estado.tipo === "turno") return estado.turno;
  if (estado.tipo === "descanso") return "—";
  if (estado.tipo === "cerrado") return "✕";
  if (estado.tipo === "ausencia") return estado.sigla;
  return "";
}

function tituloCelda(nombre: string, fecha: Fecha, estado: EstadoCelda): string {
  const d = `${nombreDia(fecha)}, ${fmt(fecha)}`;
  if (estado.tipo === "turno") {
    const info = infoTurno(estado.turno);
    const horas = estado.turno !== "M" && estado.turno !== "T" && (info.desde || info.hasta)
      ? ` (${info.desde ?? "?"}–${info.hasta ?? "?"})` : "";
    const origen =
      estado.origen === "empresa" ? " · Cambiado por la empresa" :
      estado.origen === "intercambio" ? " · Cambio entre empleados" : "";
    const comentario = estado.comentario ? ` · ${estado.comentario}` : "";
    return `${nombre} · ${d} · ${info.nombre}${horas}${origen}${comentario}`;
  }
  if (estado.tipo === "descanso") return `${nombre} · ${d} · Descanso`;
  if (estado.tipo === "cerrado") return `${nombre} · ${d} · Empresa cerrada`;
  if (estado.tipo === "ausencia") return `${nombre} · ${d} · ${estado.tipoNombre}`;
  return `${nombre} · ${d}`;
}

const filas = computed<Fila[]>(() => {
  const diasArr = dias.value;
  const ini = diasArr[0];
  const finExcl = addDays(ini, diasArr.length);
  const ultimo = diasArr[diasArr.length - 1];

  // Índices del período: asignación y ausencia por (fecha → empleado).
  const asigPorDia = new Map<Fecha, Map<number, Asignacion>>();
  for (const a of state.asignaciones) {
    if (a.fecha < ini || a.fecha >= finExcl) continue;
    let m = asigPorDia.get(a.fecha);
    if (!m) {
      m = new Map();
      asigPorDia.set(a.fecha, m);
    }
    m.set(a.empleadoId, a);
  }

  const ausPorDia = new Map<Fecha, Map<number, Ausencia>>();
  for (const a of state.ausencias) {
    const desde = a.inicio > ini ? a.inicio : ini;
    const hasta = a.fin < ultimo ? a.fin : ultimo;
    if (desde > hasta) continue;
    for (let f = desde; f <= hasta; f = addDays(f, 1)) {
      let m = ausPorDia.get(f);
      if (!m) {
        m = new Map();
        ausPorDia.set(f, m);
      }
      m.set(a.empleadoId, a);
    }
  }

  const descansos = new Set(state.descansos);
  // Días en que la empresa cierra (cierre semanal o por período).
  const cerrados = new Set(diasArr.filter((f) => esDiaCerrado(f)));

  return empleadosFiltrados.value.map((e) => {
    const nombre = nombreCompleto(e);
    const celdas: Celda[] = diasArr.map((f) => {
      let estado: EstadoCelda;
      let estilo: Record<string, string> | undefined;
      if (cerrados.has(f)) {
        estado = { tipo: "cerrado" };
      } else {
        const aus = ausPorDia.get(f)?.get(e.id);
        if (aus) {
          const info = tipoInfo(aus.tipo);
          estado = { tipo: "ausencia", sigla: info.sigla, tipoNombre: info.nombre };
        } else {
          const a = asigPorDia.get(f)?.get(e.id);
          if (a) {
            estado = { tipo: "turno", turno: a.turno, origen: a.origen, comentario: a.comentario };
            // Turnos personalizados: fondo y letra según su color.
            if (a.turno !== "M" && a.turno !== "T") {
              const info = infoTurno(a.turno);
              if (info.color) {
                estado.color = info.color;
                estado.tinta = tintaSobre(info.color);
                estilo = { background: info.color, color: estado.tinta };
              }
            }
          } else if (descansos.has(`${e.id}|${f}`)) estado = { tipo: "descanso" };
          else estado = { tipo: "vacio" };
        }
      }
      return {
        fecha: f,
        estado,
        estilo,
        clase: claseCelda(estado, f),
        texto: textoCelda(estado),
        titulo: tituloCelda(nombre, f, estado)
      };
    });
    return { e, celdas };
  });
});

// -------------------------------------------------------------- editor popup
const popup = reactive<{ x: number; y: number; visible: boolean; empleado: Empleado | null; fecha: Fecha | null }>({
  x: 0, y: 0, visible: false, empleado: null, fecha: null
});

const popoverEl = ref<HTMLElement | null>(null);

/** Borrador del editor: turno elegido, motivo del cambio y comentario. */
const borradorPopup = reactive<{
  turno: Turno | null;
  origen: Exclude<Origen, "auto">;
  comentario: string;
}>({ turno: "M", origen: "empresa", comentario: "" });

function abrirEditor(event: MouseEvent, fila: Fila, celda: Celda) {
  if (celda.estado.tipo === "ausencia" || celda.estado.tipo === "cerrado") {
    cerrarPopup(); // no se edita un día de ausencia ni un día cerrado
    return;
  }
  // Precarga el borrador con el estado actual de la celda.
  if (celda.estado.tipo === "turno") {
    borradorPopup.turno = celda.estado.turno;
    borradorPopup.origen = celda.estado.origen === "intercambio" ? "intercambio" : "empresa";
    borradorPopup.comentario = celda.estado.comentario ?? "";
  } else if (celda.estado.tipo === "descanso") {
    borradorPopup.turno = null;
    borradorPopup.origen = "empresa";
    borradorPopup.comentario = "";
  } else {
    borradorPopup.turno = turnoPorDefecto();
    borradorPopup.origen = "empresa";
    borradorPopup.comentario = "";
  }
  popup.empleado = fila.e;
  popup.fecha = celda.fecha;
  popup.x = Math.min(event.clientX, window.innerWidth - 190);
  popup.y = Math.min(event.clientY, window.innerHeight - 400);
  popup.visible = true;
}
function cerrarPopup() {
  popup.visible = false;
  popup.empleado = null;
  popup.fecha = null;
}

/** Cierra los popups al hacer clic fuera (excepto en celdas editables, que reabren el suyo). */
function alClicFuera(event: MouseEvent) {
  const t = event.target as HTMLElement | null;
  if (!t) return;
  if (popup.visible) {
    if (popoverEl.value?.contains(t)) return; // dentro del popup: los botones gestionan su acción
    if (t.closest?.("td.celda-turno") && !t.closest("td.ausencia")) return; // celda editable: abre su propio editor
    cerrarPopup();
  }
  if (popupAv.visible) {
    if (popoverAvEl.value?.contains(t)) return; // dentro del popup
    if (t.closest?.("td.celda-plan")) return; // celda editable: abre su propio editor
    cerrarPopupAv();
  }
}
function alTeclaEsc(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  if (popup.visible) cerrarPopup();
  if (popupAv.visible) cerrarPopupAv();
}
/** Aplica el turno, el motivo y el comentario elegidos en el editor. */
function fijar() {
  if (!popup.fecha || !popup.empleado) return;
  editarDia(
    inicio.value,
    popup.fecha,
    popup.empleado.id,
    borradorPopup.turno,
    borradorPopup.origen,
    borradorPopup.comentario
  );
  cerrarPopup();
}
function volverAuto() {
  if (!popup.fecha || !popup.empleado) return;
  restaurarAuto(inicio.value, popup.fecha, popup.empleado.id);
  cerrarPopup();
}

const estadoActual = computed(() => {
  if (!popup.empleado || !popup.fecha) return "vacio";
  const fila = filas.value.find((x) => x.e.id === popup.empleado!.id);
  const celda = fila?.celdas.find((c) => c.fecha === popup.fecha);
  return celda?.estado.tipo ?? "vacio";
});

// ------------------------------------------------------------------- huecos
const huecos = computed(() => huecosPorQuincena.get(inicio.value) ?? []);

// ------------------------------------------------------------- exportar PDF
async function exportarPdf() {
  const filasPdf: FilaPdf[] = filas.value.map(({ e, celdas }) => ({
    nombre: nombreCompleto(e),
    color: e.color,
    celdas: celdas.map((c): CeldaPdf => {
      if (c.estado.tipo === "turno") {
        return {
          turno: c.estado.turno,
          clase: "turno",
          color: c.estado.color,
          origen: c.estado.origen === "empresa" || c.estado.origen === "intercambio" ? c.estado.origen : undefined
        };
      }
      if (c.estado.tipo === "descanso") return { turno: null, clase: "descanso" };
      if (c.estado.tipo === "cerrado") return { turno: null, clase: "cerrado" };
      if (c.estado.tipo === "ausencia") return { turno: null, clase: "ausencia", sigla: c.estado.sigla };
      return { turno: null, clase: "vacio" };
    })
  }));
  const avisos = huecos.value.map((h) => {
    const nombre = h.turno === "M" ? "mañana" : h.turno === "T" ? "tarde" : infoTurno(h.turno).nombre;
    return `${fmt(h.fecha)} · turno de ${nombre} sin cubrir`;
  });
  const { exportarCalendarioPdf } = await import("../lib/pdf");
  exportarCalendarioPdf({
    inicio: inicio.value,
    filas: filasPdf,
    avisos,
    turnos: state.tiposTurno.map((t) => ({ sigla: t.sigla, nombre: t.nombre, color: t.color }))
  });
}

// utilidad para la celda de hoy
function diaDelMes(f: Fecha): number {
  return Number(f.slice(8, 10));
}
function esDomingo(f: Fecha): boolean {
  return nombreDia(f) === "domingo";
}

// ------------------------------------------------------ turnos definidos
// Mañana/Tarde usan sus colores del sistema (clases CSS); los personalizados, el suyo.
function colorTipo(t: TipoTurno): string {
  if (t.id < 0) return t.sigla === "M" ? "var(--manana)" : "var(--tarde)";
  return t.color;
}
function tintaTipo(t: TipoTurno): string {
  if (t.id < 0) return t.sigla === "M" ? "var(--manana-tinta)" : "var(--tarde-tinta)";
  return tintaSobre(t.color);
}
/** Primer turno definido (para las celdas vacías si Mañana se ha borrado). */
function turnoPorDefecto(): Turno | null {
  return state.tiposTurno[0]?.sigla ?? null;
}
</script>

<template>
  <div class="pagina">
    <header class="cabecera-pagina">
      <div>
        <h1>Calendario de turnos</h1>
        <p class="sub">
          Quincena del <strong>{{ fmt(dias[0]) }}</strong> al <strong>{{ fmt(dias[13]) }}</strong>
          · semanas {{ semanaISO(dias[0]) }} y {{ semanaISO(dias[7]) }}
        </p>
      </div>
      <div class="acciones-pagina">
        <div class="vista-tabs">
          <button :class="{ activo: vistaEfectiva === 'simple' }" @click="cambiarVista('simple')">Simple</button>
          <button
            v-if="state.vistaAvanzadaActivada"
            :class="{ activo: vistaEfectiva === 'avanzada' }"
            @click="cambiarVista('avanzada')"
          >Avanzada</button>
        </div>
        <div v-if="vistaEfectiva === 'simple'" class="filtro-estado" role="group" aria-label="Filtrar por estado">
          <button
            v-for="f in OPCIONES_FILTRO"
            :key="f.id"
            type="button"
            class="chip-filtro"
            :class="{ activo: filtroEstado === f.id }"
            :aria-pressed="filtroEstado === f.id"
            @click="filtroEstado = f.id"
          >
            {{ f.etiqueta }}
            <span class="chip-num">{{ conteoFiltro(f.id) }}</span>
          </button>
        </div>
        <span style="width: 2px"></span>
        <button class="btn-redondo-nav" title="Quincena anterior" @click="navegar(-1)"><Icono nombre="flechaIzq" /></button>
        <button class="btn chico" @click="irHoy">Hoy</button>
        <button class="btn-redondo-nav" title="Quincena siguiente" @click="navegar(1)"><Icono nombre="flechaDer" /></button>
        <template v-if="vista === 'simple'">
          <span style="width: 2px"></span>
          <button class="btn" title="Regenerar asignaciones automáticas" @click="regenerar"><Icono nombre="recargar" /> Regenerar</button>
          <button class="btn primario" title="Exportar a PDF" @click="exportarPdf"><Icono nombre="descargar" /> Exportar PDF</button>
        </template>
      </div>
    </header>

    <!-- Leyenda (vista Simple) -->
    <div v-if="vistaEfectiva === 'simple'" style="display: flex; gap: 14px; flex-wrap: wrap; align-items: center; font-size: 12px; color: var(--subtitulo)">
      <span v-for="t in state.tiposTurno" :key="t.id" style="display: inline-flex; align-items: center; gap: 5px">
        <span class="punto" :style="{ background: colorTipo(t) }"></span> {{ t.nombre }} ({{ t.sigla }})
        <span v-if="t.automatico" style="color: var(--apagado); font-size: 10px">auto</span>
      </span>
      <span style="display: inline-flex; align-items: center; gap: 5px"><span class="punto" style="background: var(--superficie-2); border: 1px solid var(--borde)"></span> Descanso</span>
      <span style="display: inline-flex; align-items: center; gap: 5px"><span class="punto" style="background: repeating-linear-gradient(45deg,#faf6f6,#faf6f6 2px,#f1ecec 2px,#f1ecec 4px)"></span> Ausencia</span>
      <span style="display: inline-flex; align-items: center; gap: 5px"><span class="punto" style="background: repeating-linear-gradient(45deg,#f5f6fa,#f5f6fa 2px,#eceef4 2px,#eceef4 4px)"></span> Cerrado</span>
      <span style="display: inline-flex; align-items: center; gap: 5px"><span class="punto" style="border: 1px solid var(--ok)"></span> Hoy</span>
      <span style="display: inline-flex; align-items: center; gap: 5px"><span class="punto" style="border: 1px solid var(--empresa)"></span> Cambiado por la empresa</span>
      <span style="display: inline-flex; align-items: center; gap: 5px"><span class="punto" style="border: 1px solid var(--intercambio)"></span> Cambio entre empleados</span>
      <span style="display: inline-flex; align-items: center; gap: 5px; margin-left: auto">Clic en una celda para cambiar turno</span>
    </div>

    <!-- Vista Avanzada: cada columna es un día; filas de 30 min (franjas). -->
    <div v-if="vistaEfectiva === 'avanzada'" class="vista-avanzada">
      <div class="tarjeta strip-dias">
        <div class="strip-fila">
          <span class="strip-titulo">Plan por horas</span>
          <span v-if="franjas.length" class="rango-franjas">
            Franjas de <b>{{ minutosAFormato(state.duracionFranjaVistaAvanzada) }}</b> de
            <b>{{ franjas[0].desde }}</b> a <b>{{ franjas[franjas.length - 1].hasta }}</b> ·
            clic en una celda para añadir empleados · un empleado puede tener varios tramos al día
          </span>
          <span v-else class="rango-franjas">Rango horario sin definir</span>
        </div>
        <div class="mini-leyenda empleados-leyenda">
          <span v-for="e in empleados.filter((x) => !x.baja)" :key="e.id" class="emp-leyenda" :title="`${nombreCompleto(e)} · clic en un hueco para asignarle horas`">
            <span class="punto" :style="{ background: e.color }"></span> {{ e.nombre }}
          </span>
          <span v-if="!empleados.length">Añade empleados en «Plantilla».</span>
        </div>
        <p v-if="!state.planAvanzada.length && empleados.length" class="nota nota-aviso-strip">
          Esta vista es una planificación por horas independiente del calendario M/T: haz clic en un
          hueco (celda sin pintar) para asignar a un empleado con su horario (desde–hasta).
        </p>
      </div>

      <div v-if="empleados.length && franjas.length" class="tarjeta tabla-avanzada-wrap">
        <table class="tabla-avanzada tabla-plan-dias">
          <thead>
            <tr>
              <th class="col-hora" scope="col">Horas</th>
              <th
                v-for="f in dias"
                :key="f"
                class="col-dia"
                scope="col"
                :class="{ cerrado: esDiaCerrado(f), hoy: f === hoy(), 'inicio-semana': f === dias[7] }"
                :title="`${nombreDia(f)} ${fmt(f)}${esDiaCerrado(f) ? ' · empresa cerrada' : ''}`"
              >
                <span class="dia-corto">{{ nombreDiaCorto(f) }}<span v-if="esDiaCerrado(f)"> ✕</span></span>
                <span class="dia-num">{{ diaDelMes(f) }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="fila in filasPlan" :key="fila.etiqueta">
              <th class="col-hora" scope="row">{{ fila.etiqueta }}</th>
              <td
                v-for="cel in fila.celdas"
                :key="cel.fecha"
                class="celda-plan"
                :class="{ cerrado: cel.cerrado, ocupada: cel.carriles.some((c) => c.activo), vacia: !cel.carriles.some((c) => c.activo), 'inicio-semana': cel.fecha === dias[7] }"
                :title="cel.titulo"
                @click="abrirEditorAv($event, cel)"
              >
                <div v-if="cel.carriles.length" class="plan-carriles">
                  <span
                    v-for="c in cel.carriles"
                    :key="c.e.id"
                    class="plan-carril"
                    :class="{ activo: c.activo }"
                    :style="c.activo ? { background: c.e.color } : undefined"
                    :title="c.activo ? `${nombreCompleto(c.e)} ${c.tramos.map((t) => `${t.desde}–${t.hasta}`).join(' y ')}` : nombreCompleto(c.e)"
                  ></span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="empleados.length && !franjas.length" class="aviso-banda">
        <Icono nombre="alarma" />
        <span>Revisa en «Ajustes» el rango de la vista Avanzada: la hora de inicio debe ser anterior a la de fin.</span>
      </div>
      <div v-else class="tarjeta vacio-mensaje">
        Añade empleados en «Plantilla» para planificar la quincena por horas.
      </div>
    </div>

    <div class="tarjeta tabla-quincena-wrap" v-if="vistaEfectiva === 'simple' && empleados.length">
      <table class="tabla-quincena">
        <thead>
          <tr class="primer-fila">
            <th class="nombre-col" :style="{ width: anchoColEmpleados + 'px' }"></th>
            <th class="sep-semana" :colspan="7">Semana {{ semanaISO(dias[0]) }}</th>
            <th class="sep-semana" :colspan="7">Semana {{ semanaISO(dias[7]) }}</th>
          </tr>
          <tr>
            <th class="nombre-col" style="text-align: left; padding: 7px 10px">Empleados</th>
            <th v-for="f in dias" :key="f" class="dia" :class="{ domingo: esDomingo(f), cerrado: esDiaCerrado(f), hoy: f === hoy(), 'inicio-semana': f === dias[7] }">
              <div style="font-size: 10px; text-transform: uppercase">
                {{ nombreDiaCorto(f) }}<span v-if="esDiaCerrado(f)" style="color: var(--peligro)" title="Empresa cerrada"> ✕</span>
              </div>
              <div style="font-size: 13px">{{ diaDelMes(f) }}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="fila in filas" :key="fila.e.id">
            <td class="celda-empleada">
              <span class="nom">
                <span class="avatar" :style="{ background: fila.e.color, width: 24, height: 24, fontSize: 10 }">
                  {{ (fila.e.nombre[0] ?? "") + (fila.e.apellidos[0] ?? "") }}</span>
                {{ nombreCompleto(fila.e) }}
              </span>
            </td>
            <td
              v-for="c in fila.celdas"
              :key="c.fecha"
              class="celda-turno"
              :class="[c.clase, { 'inicio-semana': c.fecha === dias[7] }]"
              :style="c.estilo"
              :title="c.titulo"
              @click="abrirEditor($event, fila, c)"
            >{{ c.texto }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="vistaEfectiva === 'simple'" class="tarjeta vacio-mensaje">
      <strong>{{ mensajeVacio.titulo }}</strong>
      <div style="color: var(--subtitulo); font-weight: 500">{{ mensajeVacio.sub }}</div>
    </div>

    <div v-if="vistaEfectiva === 'simple' && huecos.length" class="aviso-banda">
      <Icono nombre="alarma" />
      <span>
        <strong>Aviso de cobertura:</strong>
        {{ huecos.map((h) => `${fmt(h.fecha)} (${h.turno})`).join(", ") }}
      </span>
    </div>
    <div v-else-if="vistaEfectiva === 'simple' && empleados.length" style="display: flex; align-items: center; gap: 8px; font-size: 13px">
      <template v-if="state.tiposTurno.length">
        <Icono nombre="corazon" :tam="15" style="color: #0f7a35" />
        <span style="color: #0f7a35; font-weight: 600">Todos los turnos cubiertos todos los días de la quincena.</span>
      </template>
      <template v-else>
        <Icono nombre="alarma" :tam="15" />
        <span style="color: var(--subtitulo)">No hay turnos definidos: añade o restaura tipos de turno en «Ajustes».</span>
      </template>
    </div>

    <!-- Popup de edición de celda -->
    <Teleport to="body">
      <div v-if="vistaEfectiva === 'simple' && popup.visible" class="popover-capa" :style="{ left: popup.x + 'px', top: popup.y + 'px' }">
        <div ref="popoverEl" class="popover popover-editor" @click.stop>
          <div style="padding: 6px 10px 4px; font-size: 12px; color: var(--subtitulo)">
            <strong style="color: var(--tinta)">{{ popup.empleado ? nombreCompleto(popup.empleado) : "" }}</strong><br />
            {{ popup.fecha ? `${nombreDia(popup.fecha)} · ${fmt(popup.fecha)}` : "" }}
          </div>
          <div class="pop-sep"></div>
          <div class="pop-etiqueta">Turno</div>
          <button
            v-for="t in state.tiposTurno"
            :key="t.id"
            class="pop-item"
            :class="{ activo: borradorPopup.turno === t.sigla }"
            @click="borradorPopup.turno = t.sigla"
          >
            <span class="muestra" :style="{ background: colorTipo(t), color: tintaTipo(t) }">{{ t.sigla }}</span>
            <span style="display: inline-flex; flex-direction: column; line-height: 1.2">
              {{ t.nombre }}
              <span v-if="t.desde || t.hasta" style="font-size: 10px; color: var(--apagado); font-weight: 500">
                {{ t.desde || "?" }}–{{ t.hasta || "?" }}
              </span>
            </span>
          </button>
          <button class="pop-item" :class="{ activo: borradorPopup.turno === null }" @click="borradorPopup.turno = null">
            <span class="muestra" style="background: var(--superficie-2); color: var(--apagado)">—</span>
            Descanso
          </button>
          <template v-if="borradorPopup.turno">
            <div class="pop-sep"></div>
            <div class="pop-etiqueta">Motivo del cambio</div>
            <button class="pop-item" :class="{ activo: borradorPopup.origen === 'empresa' }" @click="borradorPopup.origen = 'empresa'">
              <span class="muestra" style="background: var(--empresa-suave); color: var(--empresa); border: 1px solid var(--empresa)"></span>
              Cambio de la empresa
            </button>
            <button class="pop-item" :class="{ activo: borradorPopup.origen === 'intercambio' }" @click="borradorPopup.origen = 'intercambio'">
              <span class="muestra" style="background: var(--intercambio-suave); color: var(--intercambio); border: 1px solid var(--intercambio)"></span>
              Cambio entre empleados
            </button>
            <div class="pop-sep"></div>
            <div class="pop-etiqueta">Comentario</div>
            <textarea
              v-model="borradorPopup.comentario"
              class="pop-comentario"
              rows="2"
              placeholder="Motivo, observaciones…"
            ></textarea>
          </template>
          <div class="pop-sep"></div>
          <button class="pop-item" @click="volverAuto()" :disabled="estadoActual === 'vacio'">
            <span class="muestra" style="background: var(--acento-suave); color: var(--acento)">A</span>
            Volver a automático
          </button>
          <button class="pop-item pop-guardar" @click="fijar()">
            <span class="muestra" style="background: var(--ok-suave); color: var(--ok)">✓</span>
            Guardar
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Popup de la vista Avanzada: añadir/quitar empleados por horas -->
    <Teleport to="body">
      <div v-if="vistaEfectiva === 'avanzada' && popupAv.visible" class="popover-capa" :style="{ left: popupAv.x + 'px', top: popupAv.y + 'px' }">
        <div ref="popoverAvEl" class="popover popover-editor popover-av" @click.stop>
          <div style="padding: 6px 10px 4px; font-size: 12px; color: var(--subtitulo)">
            <strong style="color: var(--tinta)">{{ popupAv.fecha ? `${nombreDia(popupAv.fecha)}, ${fmt(popupAv.fecha)}` : "" }}</strong><br />
            {{ popupAv.fr ? `${popupAv.fr.desde}–${popupAv.fr.hasta}` : "" }}
          </div>
          <template v-if="bloquesPopup.length">
            <div class="pop-sep"></div>
            <div class="pop-etiqueta">Quienes trabajan en esta franja</div>
            <button
              v-for="b in bloquesPopup"
              :key="b.p.id"
              class="pop-item"
              title="Quitar a este empleado de este día"
              @click="quitarBloqueAv(b.p.id)"
            >
              <span class="muestra" :style="{ background: b.e.color }"></span>
              <span style="display: inline-flex; flex-direction: column; line-height: 1.2; text-align: left">
                {{ nombreCompleto(b.e) }}
                <span style="font-size: 10px; color: var(--apagado); font-weight: 500">{{ b.p.desde }}–{{ b.p.hasta }} · quitar</span>
              </span>
            </button>
          </template>
          <template v-if="candidatosAv.length">
            <div class="pop-sep"></div>
            <div class="pop-etiqueta">Añadir empleado en esta franja</div>
            <div style="padding: 2px 10px 0; display: flex; flex-direction: column; gap: 6px">
              <select v-model.number="borradorAv.empleadoId" class="pop-select">
                <option v-for="e in candidatosAv" :key="e.id" :value="e.id">{{ nombreCompleto(e) }}</option>
              </select>
              <div style="display: flex; gap: 6px; align-items: center">
                <label class="pop-label">Desde
                  <select v-model="borradorAv.desde" class="pop-select">
                    <option v-for="h in horasDisponibles" :key="h" :value="h">{{ h }}</option>
                  </select>
                </label>
                <label class="pop-label">Hasta
                  <select v-model="borradorAv.hasta" class="pop-select">
                    <option v-for="h in horasDisponibles" :key="h" :value="h">{{ h }}</option>
                  </select>
                </label>
              </div>
              <div v-if="turnosConHoras.length" style="display: flex; gap: 4px; flex-wrap: wrap">
                <button
                  v-for="t in turnosConHoras"
                  :key="t.id"
                  type="button"
                  class="btn chico"
                  :title="`Aplicar horario de ${t.nombre}: ${t.desde}–${t.hasta}`"
                  @click="usarHorasTurno(t.desde!, t.hasta!)"
                >{{ t.sigla }} {{ t.desde }}–{{ t.hasta }}</button>
              </div>
            </div>
            <div class="pop-sep"></div>
            <button class="pop-item pop-guardar" @click="guardarPopupAv()">
              <span class="muestra" style="background: var(--ok-suave); color: var(--ok)">✓</span>
              Guardar
            </button>
          </template>
          <p v-if="avisoAv" class="nota nota-error" style="padding: 4px 10px 0; font-size: 11px">{{ avisoAv }}</p>
          <div class="pop-sep"></div>
          <button class="pop-item" @click="cerrarPopupAv()">
            <span class="muestra" style="background: var(--superficie-2); color: var(--apagado)">✕</span>
            Cerrar
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* --------------------------------------------------- filtro por estado (como Plantilla) */
.filtro-estado {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--superficie-2);
  border: 1px solid var(--borde);
  border-radius: 11px;
  padding: 3px;
}
.chip-filtro {
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 5px 11px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--subtitulo);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}
.chip-filtro:hover { color: var(--tinta); background: var(--superficie); }
.chip-filtro.activo {
  background: var(--superficie);
  color: var(--acento);
  box-shadow: var(--sombra-suave);
}
.chip-num {
  font-size: 10px;
  font-weight: 700;
  background: var(--borde-suave);
  color: var(--subtitulo);
  border-radius: 999px;
  padding: 1px 6px;
  min-width: 16px;
  text-align: center;
}
.chip-filtro.activo .chip-num {
  background: var(--acento);
  color: #fff;
}

/* -------------------------------------------------------- selector Simple/Avanzada */
.vista-tabs {
  display: inline-flex;
  border: 1px solid var(--borde);
  border-radius: 9px;
  overflow: hidden;
  background: var(--superficie);
}
.vista-tabs button {
  border: none;
  background: transparent;
  padding: 6px 16px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--subtitulo);
  cursor: pointer;
}
.vista-tabs button + button { border-left: 1px solid var(--borde); }
.vista-tabs button.activo {
  background: var(--acento-suave);
  color: var(--acento);
}

/* --------------------------------------------------- vista Avanzada: plan por horas */
.strip-dias {
  padding: 13px 16px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.strip-fila {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.strip-titulo {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--apagado);
  white-space: nowrap;
}
.rango-franjas {
  font-size: 12.5px;
  color: var(--subtitulo);
}
.mini-leyenda {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--subtitulo);
  border-top: 1px solid var(--borde-suave);
  padding-top: 9px;
}
.mini-leyenda .punto { width: 9px; height: 9px; }
.empleados-leyenda .emp-leyenda {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px 1px 3px;
  border-radius: 20px;
  border: 1px solid var(--borde-suave);
  background: var(--superficie);
}
.nota-aviso-strip {
  font-size: 12px;
  font-weight: 600;
  color: #8a5a08;
  background: var(--aviso-suave);
  border: 1px solid #f3d9a7;
  border-radius: 9px;
  padding: 7px 11px;
}

/* Tabla plan por horas: columnas = días, filas = franjas. */
.tabla-avanzada-wrap {
  overflow: auto;
  max-height: 68vh;
  border-radius: var(--radio);
}
.tabla-plan-dias {
  border-collapse: separate;
  border-spacing: 0;
}
.tabla-plan-dias th,
.tabla-plan-dias td {
  border-right: 1px solid var(--borde-suave);
  border-bottom: 1px solid var(--borde-suave);
  padding: 0;
  text-align: center;
}
.tabla-plan-dias tr:last-child td,
.tabla-plan-dias tr:last-child th { border-bottom: none; }
.tabla-plan-dias thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--superficie-2);
  padding: 5px 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--subtitulo);
  white-space: nowrap;
}
.tabla-plan-dias th.col-hora {
  position: sticky;
  left: 0;
  z-index: 4;
  min-width: 86px;
  width: 86px;
  background: var(--superficie);
  border-right: 1px solid var(--borde);
}
.tabla-plan-dias tbody th.col-hora {
  font-size: 10px;
  font-weight: 600;
  color: var(--subtitulo);
  text-align: left;
  padding: 0 8px;
  white-space: nowrap;
}
.tabla-plan-dias thead th.col-hora { background: var(--superficie); z-index: 5; font-weight: 700; }
.tabla-plan-dias .col-dia {
  min-width: 66px;
  width: 66px;
  vertical-align: middle;
  line-height: 1.15;
}
.tabla-plan-dias .col-dia .dia-corto {
  display: block;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  opacity: 0.8;
}
.tabla-plan-dias .col-dia .dia-num { display: block; font-size: 13px; font-weight: 700; }
.tabla-plan-dias .col-dia.cerrado { opacity: 0.55; }
.tabla-plan-dias .col-dia.hoy .dia-num {
  color: var(--ok);
  text-decoration: underline;
  text-underline-offset: 2px;
}
/* Separación visible entre la semana 1 y la semana 2. */
.tabla-plan-dias .col-dia.inicio-semana,
.tabla-plan-dias td.celda-plan.inicio-semana { border-left: 4px solid var(--acento-borde); }
.tabla-plan-dias .col-dia.inicio-semana { background: var(--acento-suave); }

/* Celdas del plan: dentro de cada día cada empleado es un carril vertical; la
   franja coloreada de su carril marca que trabaja en ese tramo horario. */
.tabla-plan-dias td.celda-plan {
  height: 24px;
  min-height: 24px;
  cursor: pointer;
  vertical-align: middle;
  padding: 1px;
}
.tabla-plan-dias td.celda-plan.cerrado {
  background: repeating-linear-gradient(45deg, #f5f6fa, #f5f6fa 3px, #eceef4 3px, #eceef4 6px);
  cursor: not-allowed;
}
.tabla-plan-dias td.celda-plan.vacia { background: #fff; }
.tabla-plan-dias td.celda-plan.vacia:hover {
  background: var(--acento-suave);
  outline: 1px dashed var(--acento-borde);
  outline-offset: -1px;
}
.tabla-plan-dias td.celda-plan.ocupada:hover { filter: brightness(0.96); }
.tabla-plan-dias .plan-carriles {
  display: flex;
  height: 100%;
  min-height: 22px;
  gap: 1px;
}
.tabla-plan-dias .plan-carril {
  flex: 1 1 0;
  min-width: 2px;
  border-radius: 2px;
  background: transparent;
}
.tabla-plan-dias .plan-carril.activo { box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06); }

/* Popup de la vista Avanzada. */
.popover-av { min-width: 270px; max-width: 320px; }
.popover-av .pop-select {
  width: 100%;
  min-width: 0;
  padding: 5px 7px;
  border: 1px solid var(--borde);
  border-radius: 7px;
  background: var(--superficie);
  color: var(--tinta);
  font-size: 12px;
}
.popover-av .pop-label {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  font-size: 10px;
  font-weight: 600;
  color: var(--subtitulo);
}
</style>

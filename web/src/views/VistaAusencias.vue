<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import Icono from "../components/Icono.vue";
import Modal from "../components/Modal.vue";
import CampoFecha from "../components/CampoFecha.vue";
import {
  ausenciasEnDia,
  eliminarAusencia,
  empleadosOrdenados,
  guardarAusencia,
  regenerarAlrededor,
  ausenciasDeEmpleado,
  eliminarTiempo,
  guardarTiempo,
  tiemposDelMes,
  tiemposEnDia
} from "../lib/store";
import {
  addDays,
  compare,
  daysInMonth,
  fmt,
  hoy,
  inicioSemana,
  mesVecino,
  nombreDia,
  nombreMesCapitalizado,
  toISO,
  toDate
} from "../lib/dates";
import { iniciales, nombreCompleto, tipoInfo, TIPOS_AUSENCIA, tipoNombre } from "../lib/types";
import type { Ausencia, Empleado, Fecha, TiempoRecuperable, TipoAusencia } from "../lib/types";
import { descripcionSaldo, formatearTiempo, parsearTiempo } from "../lib/tiempo";

/** Tipos admitidos en el registro: ausencias clásicas + tiempo recuperable. */
type TipoRegistro = TipoAusencia | "recuperable";

const RECUPERABLE_INFO = { fondo: "#A5D6A7", tinta: "#1B5E20" };

const OPCIONES_TIPO: { id: TipoRegistro; nombre: string; fondo: string; tinta: string }[] = [
  ...TIPOS_AUSENCIA,
  { id: "recuperable", nombre: "Tiempo recuperable", ...RECUPERABLE_INFO }
];

const hoyISO = hoy();
const [hy, hm] = hoyISO.split("-").map(Number);

const anio = ref(hy);
const mes = ref(hm); // 1-12
const seleccionada = ref<Fecha | null>(null);

/** Bloques desplegables del historial lateral (cerrados hasta pulsar +). */
const abiertoAusencias = ref(false);
const abiertoTiempos = ref(false);

/** Filtros de la barra superior: aplican al calendario, al detalle y a las listas. */
type FiltroTipo = "todos" | TipoRegistro;
type FiltroEstado = "activos" | "noactivos" | "todos";
const OPCIONES_ESTADO: { id: FiltroEstado; etiqueta: string }[] = [
  { id: "activos", etiqueta: "Activos" },
  { id: "noactivos", etiqueta: "No activos" },
  { id: "todos", etiqueta: "Todos" }
];
const filtroBorrador = reactive({
  empleadoId: 0,
  tipo: "todos" as FiltroTipo,
  estado: "activos" as FiltroEstado
});
const filtro = reactive({
  empleadoId: 0,
  tipo: "todos" as FiltroTipo,
  estado: "activos" as FiltroEstado
});
const hayFiltro = computed(() => filtro.empleadoId !== 0 || filtro.tipo !== "todos");

/** ¿El empleado sigue trabajando hoy? (sin baja o con la baja todavía futura). */
function estaActivo(e: Empleado): boolean {
  return !e.baja || e.baja > hoy();
}

/** ¿Pertenece el empleado (o un registro suyo) al grupo de estado indicado? */
function empleadoEnEstado(e: Empleado | undefined, estado: FiltroEstado): boolean {
  if (!e) return true;
  if (estado === "activos") return estaActivo(e);
  if (estado === "noactivos") return !estaActivo(e);
  return true;
}

function aplicarFiltros() {
  // Si se eligió un empleado que no encaja en el estado seleccionado, se limpia.
  if (filtroBorrador.empleadoId !== 0) {
    const e = empleados.value.find((x) => x.id === filtroBorrador.empleadoId);
    if (!empleadoEnEstado(e, filtroBorrador.estado)) filtroBorrador.empleadoId = 0;
  }
  filtro.empleadoId = filtroBorrador.empleadoId;
  filtro.tipo = filtroBorrador.tipo;
  filtro.estado = filtroBorrador.estado;
}
function quitarFiltros() {
  filtroBorrador.empleadoId = 0;
  filtroBorrador.tipo = "todos";
  filtroBorrador.estado = "activos";
  aplicarFiltros();
}
/** Al cambiar el estado, un empleado ya elegido que no encaje se descarta. */
function alCambiarEstado() {
  if (filtroBorrador.empleadoId !== 0) {
    const e = empleados.value.find((x) => x.id === filtroBorrador.empleadoId);
    if (!empleadoEnEstado(e, filtroBorrador.estado)) filtroBorrador.empleadoId = 0;
  }
}
function cumpleFiltroEmpleado(empleadoId: number): boolean {
  return filtro.empleadoId === 0 || empleadoId === filtro.empleadoId;
}
function cumpleFiltroTipo(tipo: TipoAusencia | "recuperable"): boolean {
  return filtro.tipo === "todos" || tipo === filtro.tipo;
}
/** Los registros de un empleado solo se muestran si este encaja en el estado aplicado. */
function cumpleFiltroEstado(empleadoId: number): boolean {
  return empleadoEnEstado(empleadoDe(empleadoId), filtro.estado);
}

const empleados = computed(() => empleadosOrdenados());

/**
 * Empleados que siguen trabajando hoy (sin baja o con baja futura): los que se
 * ofrecen en el selector del formulario, ya que no se registran ausencias
 * nuevas a quien causó baja, y los que entran en el filtro «Activos».
 */
const empleadosActivos = computed(() => empleados.value.filter((e) => estaActivo(e)));

/** Empleados que se ofrecen en el desplegable del filtro según el estado elegido. */
const empleadosSegunEstadoBorrador = computed(() =>
  empleados.value.filter((e) => empleadoEnEstado(e, filtroBorrador.estado))
);

const cabecera = computed(() => `${nombreMesCapitalizado(mes.value)} ${anio.value}`);

function anterior() {
  const v = mesVecino(anio.value, mes.value, -1);
  anio.value = v.anio;
  mes.value = v.mes;
  seleccionada.value = null;
}
function siguiente() {
  const v = mesVecino(anio.value, mes.value, 1);
  anio.value = v.anio;
  mes.value = v.mes;
  seleccionada.value = null;
}
function volverHoy() {
  anio.value = hy;
  mes.value = hm;
  seleccionada.value = hoyISO;
}

// Semanas del mes: celdas (fecha o null) agrupadas por semana ISO (lunes a domingo).
const semanas = computed<(Fecha | null)[][]>(() => {
  const primero = toISO(new Date(anio.value, mes.value - 1, 1));
  const lunes = inicioSemana(primero);
  const out: (Fecha | null)[][] = [];
  let fila: (Fecha | null)[] = [];
  for (let i = 0; i < 42; i++) {
    const f = addDays(lunes, i);
    const enMes = Number(f.slice(5, 7)) === mes.value;
    fila.push(enMes ? f : null);
    if (fila.length === 7) {
      out.push(fila);
      fila = [];
    }
  }
  // descarta semanas finales totalmente vacías (deja al menos la primera)
  while (out.length > 1 && out[out.length - 1].every((x) => x === null)) out.pop();
  return out;
});

function numDia(f: Fecha): number {
  return Number(f.slice(8, 10));
}

function empleadoDe(id: number): Empleado | undefined {
  return empleados.value.find((e) => e.id === id);
}

function claseDia(f: Fecha | null): string {
  const clases = ["celda-dia"];
  if (!f) return clases.join(" ");
  const d = toDate(f);
  const dow = d.getDay();
  if (dow === 0) clases.push("domingo");
  if (dow === 6) clases.push("sabado");
  if (f === hoyISO) clases.push("hoy");
  if (f === seleccionada.value) clases.push("seleccionada");
  return clases.join(" ");
}

function seleccionar(f: Fecha | null) {
  if (f) seleccionada.value = f;
}

// Resumen del día seleccionado (respeta el filtro activo)
const detalleDia = computed(() => {
  if (!seleccionada.value) return null;
  const f = seleccionada.value;
  return {
    fecha: f,
    aus: ausenciasEnDia(f).filter(
      (a) => cumpleFiltroEmpleado(a.empleadoId) && cumpleFiltroTipo(a.tipo) && cumpleFiltroEstado(a.empleadoId)
    ),
    tiempos: tiemposEnDia(f).filter(
      (t) => cumpleFiltroEmpleado(t.empleadoId) && cumpleFiltroTipo("recuperable") && cumpleFiltroEstado(t.empleadoId)
    )
  };
});

// --------------------------------------------------------- alta de registros
const formularioAbierto = ref(false);
/** Registro en edición: una ausencia o un apunte de tiempo recuperable. */
const editar = ref<Ausencia | TiempoRecuperable | null>(null);
const borrador = reactive({
  empleadoId: 0,
  tipo: "vacaciones" as TipoRegistro,
  inicio: hoyISO,
  fin: hoyISO,
  valor: "",
  comentario: ""
});
const errorForm = ref("");

/**
 * Opciones del selector de empleado del formulario: los activos y, si se está
 * editando un registro de alguien ya inactivo, también esa persona para que el
 * valor actual siga visible y se pueda corregir.
 */
function opcionesEmpleado(): Empleado[] {
  const activos = empleadosActivos.value;
  const seleccionado = borrador.empleadoId
    ? empleados.value.find((e) => e.id === borrador.empleadoId)
    : undefined;
  if (seleccionado && !activos.includes(seleccionado)) return [...activos, seleccionado];
  return activos;
}

function abrirNueva() {
  editar.value = null;
  borrador.empleadoId = 0; // por defecto, sin empleado seleccionado
  borrador.tipo = "vacaciones";
  borrador.inicio = seleccionada.value ?? hoyISO;
  borrador.fin = seleccionada.value ?? hoyISO;
  borrador.valor = "";
  borrador.comentario = "";
  errorForm.value = "";
  formularioAbierto.value = true;
}
function abrirEdicionAusencia(a: Ausencia) {
  editar.value = a;
  borrador.empleadoId = a.empleadoId;
  borrador.tipo = a.tipo;
  borrador.inicio = a.inicio;
  borrador.fin = a.fin;
  borrador.valor = "";
  borrador.comentario = a.comentario ?? "";
  errorForm.value = "";
  formularioAbierto.value = true;
}
function abrirEdicionTiempo(t: TiempoRecuperable) {
  editar.value = t;
  borrador.empleadoId = t.empleadoId;
  borrador.tipo = "recuperable";
  borrador.inicio = t.fecha;
  borrador.fin = t.fecha;
  borrador.valor = formatearTiempo(t.minutos);
  borrador.comentario = t.comentario ?? "";
  errorForm.value = "";
  formularioAbierto.value = true;
}

function esTiempoEnEdicion(): boolean {
  return editar.value !== null && "minutos" in editar.value;
}

function guardar() {
  if (!borrador.empleadoId) {
    errorForm.value = "Selecciona un empleado.";
    return;
  }
  if (borrador.tipo === "recuperable") {
    const minutos = parsearTiempo(borrador.valor);
    if (minutos === null) {
      errorForm.value = "Valor no válido. Escribe el tiempo con signo, p. ej. «+2:30» o «-1:00».";
      return;
    }
    errorForm.value = "";
    guardarTiempo({
      id: esTiempoEnEdicion() ? (editar.value as TiempoRecuperable).id : 0,
      empleadoId: borrador.empleadoId,
      fecha: borrador.inicio,
      minutos,
      comentario: borrador.comentario.trim()
    });
    formularioAbierto.value = false;
    recargarSeleccion();
    return;
  }
  if (compare(borrador.inicio, borrador.fin) > 0) {
    errorForm.value = "La fecha final no puede ser anterior al inicio.";
    return;
  }
  errorForm.value = "";
  const a: Ausencia = {
    id: editar.value && !esTiempoEnEdicion() ? (editar.value as Ausencia).id : 0,
    empleadoId: borrador.empleadoId,
    inicio: borrador.inicio,
    fin: borrador.fin,
    tipo: borrador.tipo,
    comentario: borrador.comentario.trim()
  };
  guardarAusencia(a);
  regenerarAlrededor();
  formularioAbierto.value = false;
  recargarSeleccion();
}

/** Fuerza la actualización de la selección para refrescar el detalle del día. */
function recargarSeleccion() {
  const f = seleccionada.value;
  seleccionada.value = null;
  seleccionada.value = f;
}

function borrarAusencia(a: Ausencia) {
  eliminarAusencia(a.id);
  regenerarAlrededor();
  const f = seleccionada.value;
  if (f && f >= a.inicio && f <= a.fin) recargarSeleccion();
}

function borrarTiempo(t: TiempoRecuperable) {
  eliminarTiempo(t.id);
  const f = seleccionada.value;
  if (f && f === t.fecha) recargarSeleccion();
}

// Ausencias visibles este mes (para la lista lateral)
const ausenciasMes = computed(() => {
  const ini = `${anio.value}-${String(mes.value).padStart(2, "0")}-01`;
  const diasMes = daysInMonth(anio.value, mes.value);
  const fin = `${anio.value}-${String(mes.value).padStart(2, "0")}-${String(diasMes).padStart(2, "0")}`;
  const lista: { aus: Ausencia; emp?: Empleado }[] = [];
  for (const e of empleados.value) {
    for (const a of ausenciasDeEmpleado(e.id)) {
      if (
        compare(a.fin, ini) >= 0 &&
        compare(a.inicio, fin) <= 0 &&
        cumpleFiltroEmpleado(a.empleadoId) &&
        cumpleFiltroTipo(a.tipo) &&
        cumpleFiltroEstado(e.id)
      ) {
        lista.push({ aus: a, emp: e });
      }
    }
  }
  return lista.sort((x, y) => compare(x.aus.inicio, y.aus.inicio) || (x.emp?.apellidos ?? "").localeCompare(y.emp?.apellidos ?? "", "es"));
});

// Tiempo recuperable registrado este mes (respeta el filtro activo)
const tiemposMes = computed(() =>
  tiemposDelMes(anio.value, mes.value).filter(
    (t) =>
      cumpleFiltroEmpleado(t.empleadoId) &&
      cumpleFiltroTipo("recuperable") &&
      cumpleFiltroEstado(t.empleadoId)
  )
    .map((t) => ({ t, emp: empleadoDe(t.empleadoId) }))
    .sort((x, y) => compare(x.t.fecha, y.t.fecha) || (x.emp?.apellidos ?? "").localeCompare(y.emp?.apellidos ?? "", "es"))
);

/** Apunte visible en una celda del calendario: ausencia o tiempo recuperable. */
type RegistroDia =
  | { clase: "ausencia"; aus: Ausencia; emp?: Empleado }
  | { clase: "tiempo"; tiempo: TiempoRecuperable; emp?: Empleado };

// Apuntes por fecha dentro del mes visible. Se calcula una sola vez por mes
// (en vez de recorrer los arrays globales por cada celda) y alimenta las celdas
// y el contador «+N más».
const registrosPorFecha = computed<Map<Fecha, RegistroDia[]>>(() => {
  const ini = `${anio.value}-${String(mes.value).padStart(2, "0")}-01`;
  const fin = `${anio.value}-${String(mes.value).padStart(2, "0")}-${String(daysInMonth(anio.value, mes.value)).padStart(2, "0")}`;
  const mapa = new Map<Fecha, RegistroDia[]>();
  const meter = (f: Fecha, r: RegistroDia) => {
    const lista = mapa.get(f);
    if (lista) lista.push(r);
    else mapa.set(f, [r]);
  };
  for (const { aus, emp } of ausenciasMes.value) {
    const d0 = compare(aus.inicio, ini) < 0 ? ini : aus.inicio;
    const d1 = compare(aus.fin, fin) > 0 ? fin : aus.fin;
    for (let d = d0; compare(d, d1) <= 0; d = addDays(d, 1)) {
      meter(d, { clase: "ausencia", aus, emp });
    }
  }
  for (const { t, emp } of tiemposMes.value) {
    meter(t.fecha, { clase: "tiempo", tiempo: t, emp });
  }
  for (const lista of mapa.values()) {
    lista.sort(
      (x, y) =>
        (x.emp?.apellidos ?? "").localeCompare(y.emp?.apellidos ?? "", "es") ||
        (x.emp?.nombre ?? "").localeCompare(y.emp?.nombre ?? "", "es")
    );
  }
  return mapa;
});

/** Registros a pintar en una celda concreta (ya ordenados por empleado). */
function registrosEn(f: Fecha | null): RegistroDia[] {
  if (!f) return [];
  return registrosPorFecha.value.get(f) ?? [];
}

function claveRegistro(r: RegistroDia): string {
  return r.clase === "ausencia" ? `a${r.aus.id}` : `t${r.tiempo.id}`;
}

function tituloRegistro(r: RegistroDia): string {
  const nombre = r.emp ? nombreCompleto(r.emp) : "Empleado";
  if (r.clase === "ausencia") return `${nombre} · ${tipoNombre(r.aus.tipo)}`;
  return `${nombre} · Tiempo recuperable ${formatearTiempo(r.tiempo.minutos)} · ${descripcionSaldo(r.tiempo.minutos)}`;
}

function estiloRegistro(r: RegistroDia): { background: string; color: string } {
  if (r.clase === "ausencia") {
    const s = estiloTipo(r.aus.tipo);
    return { background: s.fondo, color: s.tinta };
  }
  return { background: RECUPERABLE_INFO.fondo, color: RECUPERABLE_INFO.tinta };
}

function textoRegistro(r: RegistroDia): string {
  if (r.clase === "ausencia") return r.emp ? nombreCompleto(r.emp).split(" ")[0] : "?";
  return formatearTiempo(r.tiempo.minutos);
}

const tituloModal = computed(() => {
  if (!editar.value) return "Registrar ausencia";
  return esTiempoEnEdicion() ? "Editar tiempo recuperable" : "Editar ausencia";
});

function estiloTipo(t: TipoAusencia): { fondo: string; tinta: string } {
  const info = tipoInfo(t);
  return { fondo: info.fondo, tinta: info.tinta };
}

/** Etiqueta visual para un saldo: verde si va a favor (−), ámbar si debe (+). */
function claseSaldo(min: number): string {
  return min < 0 ? "etiqueta ok" : min > 0 ? "etiqueta roja" : "etiqueta neutra";
}
</script>

<template>
  <div class="pagina">
    <header class="cabecera-pagina">
      <div>
        <h1>Vacaciones y ausencias</h1>
        <p class="sub">Cada día muestra las ausencias y el tiempo recuperable de cada empleado · clic en un día para ver el detalle</p>
      </div>
      <div class="acciones-pagina">
        <button class="btn primario" @click="abrirNueva"><Icono nombre="mas" /> Registrar ausencia</button>
      </div>
    </header>

    <div style="display: grid; grid-template-columns: 1fr 300px; gap: 18px; align-items: start">
      <div>
        <section class="tarjeta calendario-mes-wrap">
          <div class="barra-filtros">
            <div class="filtro-campo">
              <label for="filtro-empleada">Empleado</label>
              <select id="filtro-empleada" v-model="filtroBorrador.empleadoId">
                <option :value="0">Todos</option>
                <option v-for="e in empleadosSegunEstadoBorrador" :key="e.id" :value="e.id">{{ nombreCompleto(e) }}</option>
              </select>
            </div>
            <div class="filtro-campo">
              <label for="filtro-tipo">Tipo</label>
              <select id="filtro-tipo" v-model="filtroBorrador.tipo">
                <option value="todos">Todos los tipos</option>
                <option v-for="t in OPCIONES_TIPO" :key="t.id" :value="t.id">{{ t.nombre }}</option>
              </select>
            </div>
            <div class="filtro-campo">
              <label for="filtro-estado">Estado</label>
              <select id="filtro-estado" v-model="filtroBorrador.estado" @change="alCambiarEstado">
                <option v-for="op in OPCIONES_ESTADO" :key="op.id" :value="op.id">{{ op.etiqueta }}</option>
              </select>
            </div>
            <button class="btn primario" @click="aplicarFiltros">Aplicar</button>
            <button v-if="hayFiltro" class="btn" @click="quitarFiltros">Quitar filtros</button>
          </div>
          <div class="cabecera-mes">
            <div class="grupo-mes">
              <button class="btn-redondo-nav" title="Mes anterior" @click="anterior"><Icono nombre="flechaIzq" /></button>
            </div>
            <h3>{{ cabecera }}</h3>
            <div class="grupo-mes">
              <button class="btn-redondo-nav" title="Mes siguiente" @click="siguiente"><Icono nombre="flechaDer" /></button>
            </div>
            <button class="btn chico" @click="volverHoy">Hoy</button>
          </div>

          <table class="calendario-mes">
            <thead>
              <tr>
                <th v-for="n in ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']" :key="n" :class="{ domingo: n === 'Dom' }">{{ n }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(semana, wi) in semanas" :key="wi">
                <td
                  v-for="(f, di) in semana"
                  :key="`${wi}-${di}`"
                  class="celda-dia"
                  :class="claseDia(f)"
                  @click="seleccionar(f)"
                >
                  <template v-if="f">
                    <span class="num-dia">{{ numDia(f) }}</span>
                    <div class="dots-dia">
                      <template v-for="r in registrosEn(f).slice(0, 3)" :key="claveRegistro(r)">
                        <span
                          class="dot-persona"
                          :title="tituloRegistro(r)"
                          :style="estiloRegistro(r)"
                        >
                          <span class="mini" :style="{ background: r.emp?.color ?? '#888' }"></span>
                          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 52px">
                            {{ textoRegistro(r) }}
                          </span>
                        </span>
                      </template>
                      <span v-if="registrosEn(f).length > 3" class="dot-persona mas" :title="`${registrosEn(f).length} apuntes ese día`">
                        +{{ registrosEn(f).length - 3 }} más
                      </span>
                    </div>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Leyenda -->
          <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 8px; font-size: 11.5px; color: var(--subtitulo)">
            <template v-for="t in TIPOS_AUSENCIA" :key="t.id">
              <span class="etiqueta-tipo" :style="{ background: t.fondo, color: t.tinta }">{{ t.nombre }}</span>
            </template>
            <span class="etiqueta-tipo" :style="{ background: RECUPERABLE_INFO.fondo, color: RECUPERABLE_INFO.tinta }">Tiempo recuperable</span>
          </div>
        </section>

        <!-- Detalle del día -->
        <section v-if="detalleDia" class="tarjeta mt-18" style="padding: 16px">
          <h3 style="font-size: 14px; margin-bottom: 10px">
            {{ nombreDia(detalleDia.fecha) }}, {{ fmt(detalleDia.fecha) }}
          </h3>
          <template v-if="detalleDia.aus.length || detalleDia.tiempos.length">
            <div v-if="detalleDia.aus.length" class="lista-lateral" style="margin-bottom: 6px">
              <div v-for="a in detalleDia.aus" :key="`a${a.id}`" class="fila-lateral">
                <span
                  class="avatar"
                  :style="{ background: empleadoDe(a.empleadoId)?.color ?? '#888', width: 26, height: 26, fontSize: 10 }"
                >{{ empleadoDe(a.empleadoId) ? iniciales(empleadoDe(a.empleadoId)!) : "?" }}</span>
                <span class="detalles">
                  <span class="t1">
                    {{ empleadoDe(a.empleadoId) ? nombreCompleto(empleadoDe(a.empleadoId)!) : "Empleado" }}
                  </span>
                  <span class="t2">
                    <span class="etiqueta-tipo" :style="{ background: tipoInfo(a.tipo).fondo, color: tipoInfo(a.tipo).tinta }">
                      {{ tipoInfo(a.tipo).nombre }}
                    </span>
                    <span style="margin-left: 6px">{{ fmt(a.inicio) }} → {{ fmt(a.fin) }}</span>
                  </span>
                  <span v-if="a.comentario" class="comentario" :title="a.comentario">{{ a.comentario }}</span>
                </span>
                <button class="btn chico icono-solo" title="Editar" @click="abrirEdicionAusencia(a)"><Icono nombre="lapiz" :tam="13" /></button>
                <button class="btn chico icono-solo peligro" title="Eliminar" @click="borrarAusencia(a)"><Icono nombre="papelera" :tam="13" /></button>
              </div>
            </div>
            <div v-if="detalleDia.tiempos.length" class="lista-lateral">
              <div v-for="t in detalleDia.tiempos" :key="`t${t.id}`" class="fila-lateral">
                <span
                  class="avatar"
                  :style="{ background: empleadoDe(t.empleadoId)?.color ?? '#888', width: 26, height: 26, fontSize: 10 }"
                >{{ empleadoDe(t.empleadoId) ? iniciales(empleadoDe(t.empleadoId)!) : "?" }}</span>
                <span class="detalles">
                  <span class="t1">
                    {{ empleadoDe(t.empleadoId) ? nombreCompleto(empleadoDe(t.empleadoId)!) : "Empleado" }}
                  </span>
                  <span class="t2">
                    <span class="etiqueta-tipo" :style="{ background: RECUPERABLE_INFO.fondo, color: RECUPERABLE_INFO.tinta }">Tiempo recuperable</span>
                    <span
                      class="etiqueta"
                      :class="claseSaldo(t.minutos)"
                      :title="descripcionSaldo(t.minutos)"
                      style="margin-left: 6px"
                    >{{ formatearTiempo(t.minutos) }}</span>
                  </span>
                  <span v-if="t.comentario" class="comentario" :title="t.comentario">{{ t.comentario }}</span>
                </span>
                <button class="btn chico icono-solo" title="Editar" @click="abrirEdicionTiempo(t)"><Icono nombre="lapiz" :tam="13" /></button>
                <button class="btn chico icono-solo peligro" title="Eliminar" @click="borrarTiempo(t)"><Icono nombre="papelera" :tam="13" /></button>
              </div>
            </div>
          </template>
          <div v-else style="color: var(--apagado); font-size: 13px">Sin registros ese día.</div>
        </section>
      </div>

      <!-- Historial del mes (bloques desplegables) -->
      <aside class="tarjeta" style="padding: 16px">
        <div class="bloque-historico">
          <button
            type="button"
            class="cabecera-bloque"
            :aria-expanded="abiertoAusencias ? 'true' : 'false'"
            @click="abiertoAusencias = !abiertoAusencias"
          >
            <span class="signo-bloque" :class="{ abierto: abiertoAusencias }"><Icono nombre="mas" :tam="13" /></span>
            <span class="titulo-bloque">Ausencias</span>
            <span class="meta-bloque">{{ cabecera }} · {{ ausenciasMes.length }}</span>
          </button>
          <div v-show="abiertoAusencias">
            <div v-if="ausenciasMes.length" class="lista-lateral">
          <div v-for="item in ausenciasMes" :key="`a${item.aus.id}`" class="fila-lateral">
            <span class="punto" :style="{ background: item.emp?.color ?? '#888' }"></span>
            <span class="detalles">
              <span class="t1">
                {{ item.emp ? nombreCompleto(item.emp) : "Empleado" }}
                <span class="etiqueta-tipo" :style="{ background: tipoInfo(item.aus.tipo).fondo, color: tipoInfo(item.aus.tipo).tinta }">
                  {{ tipoInfo(item.aus.tipo).nombre }}
                </span>
              </span>
              <span class="t2">{{ fmt(item.aus.inicio) }} → {{ fmt(item.aus.fin) }}</span>
              <span v-if="item.aus.comentario" class="comentario" :title="item.aus.comentario">{{ item.aus.comentario }}</span>
            </span>
            <button class="btn chico icono-solo" title="Editar" @click="abrirEdicionAusencia(item.aus)"><Icono nombre="lapiz" :tam="13" /></button>
            <button class="btn chico icono-solo peligro" title="Eliminar" @click="borrarAusencia(item.aus)"><Icono nombre="papelera" :tam="13" /></button>
          </div>
            </div>
            <div v-else class="vacio-mensaje" style="padding: 6px 8px 4px">Sin ausencias este mes.</div>
          </div>
        </div>

        <div class="bloque-historico">
          <button
            type="button"
            class="cabecera-bloque"
            :aria-expanded="abiertoTiempos ? 'true' : 'false'"
            @click="abiertoTiempos = !abiertoTiempos"
          >
            <span class="signo-bloque" :class="{ abierto: abiertoTiempos }"><Icono nombre="mas" :tam="13" /></span>
            <span class="titulo-bloque">Tiempo recuperable</span>
            <span class="meta-bloque">{{ cabecera }} · {{ tiemposMes.length }}</span>
          </button>
          <div v-show="abiertoTiempos">
            <div v-if="tiemposMes.length" class="lista-lateral">
          <div v-for="item in tiemposMes" :key="`t${item.t.id}`" class="fila-lateral">
            <span class="punto" :style="{ background: item.emp?.color ?? '#888' }"></span>
            <span class="detalles">
              <span class="t1">
                {{ item.emp ? nombreCompleto(item.emp) : "Empleado" }}
                <span
                  class="etiqueta"
                  :class="claseSaldo(item.t.minutos)"
                  :title="descripcionSaldo(item.t.minutos)"
                >{{ formatearTiempo(item.t.minutos) }}</span>
              </span>
              <span class="t2">{{ fmt(item.t.fecha) }}</span>
              <span v-if="item.t.comentario" class="comentario" :title="item.t.comentario">{{ item.t.comentario }}</span>
            </span>
            <button class="btn chico icono-solo" title="Editar" @click="abrirEdicionTiempo(item.t)"><Icono nombre="lapiz" :tam="13" /></button>
            <button class="btn chico icono-solo peligro" title="Eliminar" @click="borrarTiempo(item.t)"><Icono nombre="papelera" :tam="13" /></button>
          </div>
            </div>
            <div v-else class="vacio-mensaje" style="padding: 6px 8px 4px">Sin apuntes este mes.</div>
          </div>
        </div>
      </aside>
    </div>

    <!-- Modal alta / edición -->
    <Modal
      v-if="formularioAbierto"
      :titulo="tituloModal"
      @cerrar="formularioAbierto = false"
    >
      <div class="fila-form">
        <div class="campo">
          <label>Empleado</label>
          <select v-model.number="borrador.empleadoId">
            <option :value="0" disabled>Selecciona el empleado…</option>
            <option v-for="e in opcionesEmpleado()" :key="e.id" :value="e.id">{{ nombreCompleto(e) }}</option>
          </select>
        </div>
        <div class="campo">
          <label>Tipo</label>
          <div style="display: flex; gap: 6px; flex-wrap: wrap">
            <button
              v-for="t in OPCIONES_TIPO"
              :key="t.id"
              type="button"
              class="chip-toggle"
              :class="{ activo: borrador.tipo === t.id }"
              :style="borrador.tipo === t.id ? { background: t.fondo, borderColor: t.tinta, color: t.tinta } : {}"
              @click="borrador.tipo = t.id"
            >{{ t.nombre }}</button>
          </div>
        </div>

        <template v-if="borrador.tipo === 'recuperable'">
          <div class="grid-2">
            <div class="campo">
              <label>Fecha</label>
              <CampoFecha v-model="borrador.inicio" />
            </div>
            <div class="campo">
              <label>Valor</label>
              <input v-model="borrador.valor" type="text" placeholder="+2:30" inputmode="text" />
            </div>
          </div>
          <p class="ayuda" style="margin: -2px 0 0">
            Horas y minutos con signo: <b>−</b> si ha hecho horas extra, <b>+</b> si debe horas
            (p. ej. «+2:30» o «-1:00»).
          </p>
        </template>

        <template v-else>
          <div class="grid-2">
            <div class="campo">
              <label>Desde</label>
              <CampoFecha v-model="borrador.inicio" />
            </div>
            <div class="campo">
              <label>Hasta</label>
              <CampoFecha v-model="borrador.fin" />
            </div>
          </div>
        </template>

        <div class="campo">
          <label>Comentario (opcional)</label>
          <textarea
            v-model="borrador.comentario"
            rows="2"
            placeholder="Motivo, justificante, observaciones…"
            style="width: 100%"
          ></textarea>
        </div>

        <p v-if="errorForm" style="color: var(--peligro); font-size: 13px; font-weight: 600">{{ errorForm }}</p>
        <div class="modal-pie">
          <button class="btn" @click="formularioAbierto = false">Cancelar</button>
          <button class="btn primario" @click="guardar">{{ editar ? "Guardar cambios" : "Registrar" }}</button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.barra-filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  padding: 10px 12px;
  margin-bottom: 14px;
  background: var(--superficie-2);
  border: 1px solid var(--borde-suave);
  border-radius: 12px;
}

.filtro-campo {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.filtro-campo label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--apagado);
}
.filtro-campo select {
  min-width: 170px;
  border: 1px solid var(--borde);
  border-radius: 10px;
  padding: 7px 10px;
  font: inherit;
  font-size: 13px;
  background: var(--superficie);
  color: var(--tinta);
  cursor: pointer;
  transition: border-color 0.15s;
}
.filtro-campo select:focus {
  outline: none;
  border-color: var(--acento);
  box-shadow: 0 0 0 3px var(--acento-suave);
}

.bloque-historico + .bloque-historico {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--borde-suave);
}

.cabecera-bloque {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--tinta);
  cursor: pointer;
  text-align: left;
  margin-bottom: 2px;
  border-radius: 8px;
}
.cabecera-bloque:hover .titulo-bloque { color: var(--acento); }

.signo-bloque {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--acento-borde);
  background: var(--acento-suave);
  color: var(--acento);
  transition: transform 0.2s ease, background 0.15s ease;
}
.signo-bloque.abierto {
  transform: rotate(45deg);
  background: var(--acento);
  border-color: var(--acento);
  color: #fff;
}

.titulo-bloque {
  font-size: 13.5px;
  font-weight: 700;
  transition: color 0.15s ease;
}

.meta-bloque {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--apagado);
  white-space: nowrap;
}

.chip-toggle {
  flex: none;
  border: 1px solid var(--borde);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: var(--superficie);
  color: var(--subtitulo);
  transition: all 0.15s;
}
.chip-toggle:hover { border-color: var(--acento-borde); }

.comentario {
  display: block;
  font-size: 11px;
  font-style: italic;
  color: var(--apagado);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import Icono from "../components/Icono.vue";
import {
  editarDia,
  empleadosOrdenados,
  huecosPorQuincena,
  inicioQuincena,
  quincenaVecina,
  regenerarFortnight,
  restaurarAuto,
  state
} from "../lib/store";
import { addDays, diasQuincena, fmt, hoy, nombreDia, nombreDiaCorto, semanaISO } from "../lib/dates";
import { nombreCompleto, tipoInfo } from "../lib/types";
import type { CeldaPdf, FilaPdf } from "../lib/pdf";
import type { Asignacion, Ausencia, Empleado, Fecha } from "../lib/types";

const inicio = ref<Fecha>(inicioQuincena(hoy()));
const dias = computed(() => diasQuincena(inicio.value));
const empleados = computed(() => empleadosOrdenados());

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
// O(1) (fecha → empleada); antes cada celda barría el array global de
// asignaciones/ausencias, con coste cuadrático al crecer la plantilla.
type EstadoCelda =
  | { tipo: "turno"; turno: "M" | "T"; origen: "auto" | "manual" }
  | { tipo: "descanso" }
  | { tipo: "ausencia"; sigla: string; tipoNombre: string }
  | { tipo: "vacio" };

interface Celda {
  fecha: Fecha;
  estado: EstadoCelda;
  clase: string;
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
    clases.push(estado.turno === "M" ? "manana" : "tarde");
    if (estado.origen === "manual") clases.push("manual");
  } else if (estado.tipo === "descanso") clases.push("descanso");
  else if (estado.tipo === "ausencia") clases.push("ausencia");
  else clases.push("vacia");
  if (fecha === hoy()) clases.push("hoy");
  return clases.join(" ");
}

function textoCelda(estado: EstadoCelda): string {
  if (estado.tipo === "turno") return estado.turno;
  if (estado.tipo === "descanso") return "—";
  if (estado.tipo === "ausencia") return estado.sigla;
  return "";
}

function tituloCelda(nombre: string, fecha: Fecha, estado: EstadoCelda): string {
  const d = `${nombreDia(fecha)}, ${fmt(fecha)}`;
  if (estado.tipo === "turno") return `${nombre} · ${d} · Turno de ${estado.turno === "M" ? "mañana" : "tarde"}${estado.origen === "manual" ? " (fijado a mano)" : ""}`;
  if (estado.tipo === "descanso") return `${nombre} · ${d} · Descanso`;
  if (estado.tipo === "ausencia") return `${nombre} · ${d} · ${estado.tipoNombre}`;
  return `${nombre} · ${d}`;
}

const filas = computed<Fila[]>(() => {
  const diasArr = dias.value;
  const ini = diasArr[0];
  const finExcl = addDays(ini, diasArr.length);
  const ultimo = diasArr[diasArr.length - 1];

  // Índices del período: asignación y ausencia por (fecha → empleada).
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

  return empleados.value.map((e) => {
    const nombre = nombreCompleto(e);
    const celdas: Celda[] = diasArr.map((f) => {
      const aus = ausPorDia.get(f)?.get(e.id);
      let estado: EstadoCelda;
      if (aus) {
        const info = tipoInfo(aus.tipo);
        estado = { tipo: "ausencia", sigla: info.sigla, tipoNombre: info.nombre };
      } else {
        const a = asigPorDia.get(f)?.get(e.id);
        if (a) estado = { tipo: "turno", turno: a.turno, origen: a.origen };
        else if (descansos.has(`${e.id}|${f}`)) estado = { tipo: "descanso" };
        else estado = { tipo: "vacio" };
      }
      return {
        fecha: f,
        estado,
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

function abrirEditor(event: MouseEvent, fila: Fila, celda: Celda) {
  if (celda.estado.tipo === "ausencia") {
    cerrarPopup(); // no se edita un día de ausencia: se cierra el popup abierto
    return;
  }
  popup.empleado = fila.e;
  popup.fecha = celda.fecha;
  popup.x = Math.min(event.clientX, window.innerWidth - 190);
  popup.y = Math.min(event.clientY, window.innerHeight - 220);
  popup.visible = true;
}
function cerrarPopup() {
  popup.visible = false;
  popup.empleado = null;
  popup.fecha = null;
}

/** Cierra el popup al hacer clic fuera de él (excepto en celdas editables, que lo reabren). */
function alClicFuera(event: MouseEvent) {
  if (!popup.visible) return;
  const t = event.target as HTMLElement | null;
  if (!t) return;
  if (popoverEl.value?.contains(t)) return; // dentro del popup: los botones gestionan su acción
  if (t.closest?.("td.celda-turno") && !t.closest("td.ausencia")) return; // celda editable: abre su propio editor
  cerrarPopup();
}
function alTeclaEsc(event: KeyboardEvent) {
  if (event.key === "Escape" && popup.visible) cerrarPopup();
}
function fijarTurno(t: "M" | "T") {
  if (!popup.fecha || !popup.empleado) return;
  editarDia(inicio.value, popup.fecha, popup.empleado.id, t);
  cerrarPopup();
}
function fijarDescanso() {
  if (!popup.fecha || !popup.empleado) return;
  editarDia(inicio.value, popup.fecha, popup.empleado.id, null);
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
      if (c.estado.tipo === "turno") return { turno: c.estado.turno, clase: "turno", manual: c.estado.origen === "manual" };
      if (c.estado.tipo === "descanso") return { turno: null, clase: "descanso" };
      if (c.estado.tipo === "ausencia") return { turno: null, clase: "ausencia", sigla: c.estado.sigla };
      return { turno: null, clase: "vacio" };
    })
  }));
  const avisos = huecos.value.map((h) => `${fmt(h.fecha)} · turno de ${h.turno === "M" ? "mañana" : "tarde"} sin cubrir`);
  const { exportarCalendarioPdf } = await import("../lib/pdf");
  exportarCalendarioPdf({ inicio: inicio.value, filas: filasPdf, avisos });
}

// utilidad para la celda de hoy
function diaDelMes(f: Fecha): number {
  return Number(f.slice(8, 10));
}
function esDomingo(f: Fecha): boolean {
  return nombreDia(f) === "domingo";
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
        <button class="btn-redondo-nav" title="Quincena anterior" @click="navegar(-1)"><Icono nombre="flechaIzq" /></button>
        <button class="btn chico" @click="irHoy">Hoy</button>
        <button class="btn-redondo-nav" title="Quincena siguiente" @click="navegar(1)"><Icono nombre="flechaDer" /></button>
        <span style="width: 2px"></span>
        <button class="btn" title="Regenerar asignaciones automáticas" @click="regenerar"><Icono nombre="recargar" /> Regenerar</button>
        <button class="btn primario" title="Exportar a PDF" @click="exportarPdf"><Icono nombre="descargar" /> Exportar PDF</button>
      </div>
    </header>

    <!-- Leyenda -->
    <div style="display: flex; gap: 14px; flex-wrap: wrap; align-items: center; font-size: 12px; color: var(--subtitulo)">
      <span style="display: inline-flex; align-items: center; gap: 5px"><span class="punto" style="background: var(--manana)"></span> Mañana (M)</span>
      <span style="display: inline-flex; align-items: center; gap: 5px"><span class="punto" style="background: var(--tarde)"></span> Tarde (T)</span>
      <span style="display: inline-flex; align-items: center; gap: 5px"><span class="punto" style="background: var(--superficie-2); border: 1px solid var(--borde)"></span> Descanso</span>
      <span style="display: inline-flex; align-items: center; gap: 5px"><span class="punto" style="background: repeating-linear-gradient(45deg,#faf6f6,#faf6f6 2px,#f1ecec 2px,#f1ecec 4px)"></span> Ausencia</span>
      <span style="display: inline-flex; align-items: center; gap: 5px"><span style="width: 12px; height: 12px; border: 2px solid var(--acento); border-radius: 3px; display: inline-block"></span> Fijado a mano</span>
      <span style="display: inline-flex; align-items: center; gap: 5px; margin-left: auto">Clic en una celda para cambiar turno</span>
    </div>

    <div class="tarjeta tabla-quincena-wrap" v-if="empleados.length">
      <table class="tabla-quincena">
        <thead>
          <tr class="primer-fila">
            <th class="nombre-col" style="min-width: 178px"></th>
            <th :colspan="7" style="color: var(--acento)">Semana {{ semanaISO(dias[0]) }}</th>
            <th :colspan="7" style="color: var(--acento)">Semana {{ semanaISO(dias[7]) }}</th>
          </tr>
          <tr>
            <th class="nombre-col" style="text-align: left; padding: 7px 10px">Empleada</th>
            <th v-for="f in dias" :key="f" class="dia" :class="{ domingo: esDomingo(f) }">
              <div style="font-size: 10px; text-transform: uppercase">{{ nombreDiaCorto(f) }}</div>
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
              :class="c.clase"
              :title="c.titulo"
              @click="abrirEditor($event, fila, c)"
            >{{ c.texto }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="tarjeta vacio-mensaje">
      Añade empleadas en «Plantilla» para generar el calendario de turnos.
    </div>

    <div v-if="huecos.length" class="aviso-banda">
      <Icono nombre="alarma" />
      <span>
        <strong>Aviso de cobertura:</strong>
        {{ huecos.map((h) => `${fmt(h.fecha)} (${h.turno})`).join(", ") }}
      </span>
    </div>
    <div v-else-if="empleados.length" style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #0f7a35; font-weight: 600">
      <Icono nombre="corazon" :tam="15" /> Ambos turnos cubiertos todos los días de la quincena.
    </div>

    <!-- Popup de edición de celda -->
    <Teleport to="body">
      <div v-if="popup.visible" class="popover-capa" :style="{ left: popup.x + 'px', top: popup.y + 'px' }">
        <div ref="popoverEl" class="popover" @click.stop>
          <div style="padding: 6px 10px 4px; font-size: 12px; color: var(--subtitulo)">
            <strong style="color: var(--tinta)">{{ popup.empleado ? nombreCompleto(popup.empleado) : "" }}</strong><br />
            {{ popup.fecha ? `${nombreDia(popup.fecha)} · ${fmt(popup.fecha)}` : "" }}
          </div>
          <div class="pop-sep"></div>
          <button class="pop-item" @click="fijarTurno('M')">
            <span class="muestra" style="background: var(--manana); color: var(--manana-tinta)">M</span>
            Mañana
          </button>
          <button class="pop-item" @click="fijarTurno('T')">
            <span class="muestra" style="background: var(--tarde); color: #fff">T</span>
            Tarde
          </button>
          <button class="pop-item" @click="fijarDescanso()">
            <span class="muestra" style="background: var(--superficie-2); color: var(--apagado)">—</span>
            Descanso
          </button>
          <div class="pop-sep"></div>
          <button class="pop-item" @click="volverAuto()" :disabled="estadoActual === 'vacio'">
            <span class="muestra" style="background: var(--acento-suave); color: var(--acento)">A</span>
            Volver a automático
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

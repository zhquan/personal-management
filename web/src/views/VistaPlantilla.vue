<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import Icono from "../components/Icono.vue";
import Modal from "../components/Modal.vue";
import CampoFecha from "../components/CampoFecha.vue";
import {
  PALETA,
  eliminarEmpleado,
  empleadosOrdenados,
  guardarEmpleado,
  historialDeEmpleado,
  regenerarAlrededor,
  saldoTiemposPorEmpleado,
  vacacionesDisponiblesAnio,
  vacacionesUsadasAnio
} from "../lib/store";
import { CONTRATO_POR_DEFECTO, iniciales, nombreCompleto, plantillaEmpleado, TIPOS_CONTRATO } from "../lib/types";
import type { Empleado, HistorialItem } from "../lib/types";
import { fmt, fmtFechaHora, hoy, transcurridoTexto } from "../lib/dates";
import { formatearTiempo, descripcionSaldo } from "../lib/tiempo";

type ClaveOrden = "empleada" | "telefono" | "contrato" | "antiguedad" | "alta" | "tiempo" | "vacaciones";

/** Orden activo de la tabla: columna y dirección (1 = ascendente, -1 = descendente). */
const orden = ref<{ clave: ClaveOrden; dir: 1 | -1 }>({ clave: "empleada", dir: 1 });

// --------------------------------------------------------- filtro por estado
// Por defecto se muestran solo los empleados activos (sin fecha de baja).
type FiltroEstado = "activos" | "noactivos" | "todos";
const filtroEstado = ref<FiltroEstado>("activos");
const OPCIONES_FILTRO: { id: FiltroEstado; etiqueta: string }[] = [
  { id: "activos", etiqueta: "Activos" },
  { id: "noactivos", etiqueta: "No activos" },
  { id: "todos", etiqueta: "Todos" }
];

const totales = computed(() => {
  const todos = empleadosOrdenados();
  const activos = todos.filter((e) => !e.baja).length;
  return { total: todos.length, activos };
});

function conteoFiltro(id: FiltroEstado): number {
  if (id === "activos") return totales.value.activos;
  if (id === "noactivos") return totales.value.total - totales.value.activos;
  return totales.value.total;
}

const mensajeVacio = computed(() => {
  if (!totales.value.total) {
    return { titulo: "Aún no hay empleados registrados.", sub: "Pulsa «Añadir empleado» para crear el primero." };
  }
  if (filtroEstado.value === "activos") {
    return { titulo: "No hay empleados activos.", sub: "Cambia el filtro a «No activos» o «Todos» para verlos." };
  }
  if (filtroEstado.value === "noactivos") {
    return { titulo: "No hay empleados de baja.", sub: "Cambia el filtro a «Todos» para ver la plantilla completa." };
  }
  return { titulo: "", sub: "" };
});

const empleados = computed(() => {
  // Copia ya ordenada por apellidos, filtrada por estado (activos por defecto).
  const lista = empleadosOrdenados().filter((e) =>
    filtroEstado.value === "activos" ? !e.baja :
    filtroEstado.value === "noactivos" ? !!e.baja :
    true);
  const { clave, dir } = orden.value;
  const saldos = clave === "tiempo" ? saldoTiemposPorEmpleado() : null;
  const usadas = clave === "vacaciones" ? new Map(lista.map((e) => [e.id, vacacionesUsadasAnio(e.id)])) : null;
  lista.sort((a, b) => {
    // Los empleados de baja quedan siempre al final del listado (se compara la
    // presencia de baja, no la fecha, para que el resto de columnas sí ordene).
    if (!!a.baja !== !!b.baja) return a.baja ? 1 : -1;
    let cmp = 0;
    switch (clave) {
      case "empleada":
        cmp = a.apellidos.localeCompare(b.apellidos, "es") || a.nombre.localeCompare(b.nombre, "es") || a.id - b.id;
        break;
      case "telefono":
        cmp = (a.telefono || "").localeCompare(b.telefono || "", "es");
        break;
      case "contrato":
        cmp = (a.tipoContrato || "").localeCompare(b.tipoContrato || "", "es");
        break;
      case "antiguedad":
      case "alta":
        cmp = a.alta.localeCompare(b.alta) || a.id - b.id; // ascendente = más antigua primero
        break;
      case "tiempo":
        cmp = (saldos?.get(a.id) ?? 0) - (saldos?.get(b.id) ?? 0);
        break;
      case "vacaciones":
        cmp = (usadas?.get(a.id) ?? 0) - (usadas?.get(b.id) ?? 0);
        break;
    }
    return cmp * dir;
  });
  return lista;
});

function alternarOrden(clave: ClaveOrden) {
  if (orden.value.clave === clave) {
    orden.value = { clave, dir: orden.value.dir === 1 ? -1 : 1 };
  } else {
    orden.value = { clave, dir: 1 };
  }
}

function flechaOrden(clave: ClaveOrden): string {
  return orden.value.clave === clave ? (orden.value.dir === 1 ? "↑" : "↓") : "";
}

function ariaOrden(clave: ClaveOrden): "ascending" | "descending" | "none" {
  if (orden.value.clave !== clave) return "none";
  return orden.value.dir === 1 ? "ascending" : "descending";
}

// ------------------------------------------------------------- modal alta/edición
// Los campos de fecha y el salario se editan como texto/vacío y se convierten al guardar.
type Borrador = Omit<Empleado, "baja" | "nacimiento" | "salarioBruto"> & {
  baja: string;
  nacimiento: string;
  salarioBruto: number | "";
};

function borradorNuevo(): Borrador {
  const base = plantillaEmpleado({
    color: PALETA[empleados.value.length % PALETA.length],
    alta: hoy()
  });
  return {
    ...base,
    baja: "",
    nacimiento: base.nacimiento ?? "",
    salarioBruto: base.salarioBruto ?? ""
  };
}

const abierto = ref(false);
const editando = ref(false);
const borrador = reactive<Borrador>(borradorNuevo());

function abrirNueva() {
  editando.value = false;
  Object.assign(borrador, borradorNuevo());
  abierto.value = true;
}

function abrirEdicion(e: Empleado) {
  editando.value = true;
  Object.assign(borrador, {
    ...e,
    baja: e.baja ?? "",
    nacimiento: e.nacimiento ?? "",
    salarioBruto: e.salarioBruto ?? ""
  });
  abierto.value = true;
}

const error = ref("");

function guardar() {
  const nombre = borrador.nombre.trim();
  const apellidos = borrador.apellidos.trim();
  if (!nombre || !apellidos) {
    error.value = "Indica nombre y apellidos.";
    return;
  }
  const alta = borrador.alta || hoy();
  const baja = borrador.baja || null;
  if (baja && baja < alta) {
    error.value = "La fecha de baja no puede ser anterior a la de alta.";
    return;
  }
  const sal = Number(borrador.salarioBruto);
  error.value = "";
  guardarEmpleado({
    id: borrador.id,
    nombre,
    apellidos,
    dni: borrador.dni.trim(),
    nss: borrador.nss.trim(),
    telefono: borrador.telefono.trim(),
    iban: borrador.iban.trim(),
    nacimiento: borrador.nacimiento || null,
    color: borrador.color,
    diasVacacionesAnuales: Math.max(0, borrador.diasVacacionesAnuales),
    jornadaHoras: Math.max(0, Math.round(Number(borrador.jornadaHoras) || 0)),
    salarioBruto: Number.isFinite(sal) && sal > 0 ? sal : null,
    tipoContrato: borrador.tipoContrato || CONTRATO_POR_DEFECTO,
    alta,
    baja,
    motivoBaja: borrador.motivoBaja.trim(),
    notas: borrador.notas.trim()
  });
  regenerarAlrededor();
  abierto.value = false;
}

function borrar(e: Empleado) {
  if (!window.confirm(`¿Eliminar a ${nombreCompleto(e)}? Se quitarán sus turnos y ausencias.`)) return;
  eliminarEmpleado(e.id);
  regenerarAlrededor();
}

const anioActual = Number(hoy().slice(0, 4));

// vacaciones usadas este año
function usadas(e: Empleado): number {
  return vacacionesUsadasAnio(e.id);
}

/** Días de vacaciones que corresponden a un empleado en el año actual (proporcional si el alta es este año). */
function diasDisponibles(e: Empleado): number {
  return vacacionesDisponiblesAnio(e, anioActual);
}

function tituloVacaciones(e: Empleado): string {
  const anual = e.diasVacacionesAnuales;
  const disp = diasDisponibles(e);
  if (disp >= anual) return `${anual} días de vacaciones anuales`;
  const hasta = e.baja && e.baja.slice(0, 4) === String(anioActual) ? `su baja (${fmt(e.baja)})` : "el 31 de diciembre";
  return `Alta el ${fmt(e.alta)}: ${disp} días proporcionales en ${anioActual} (${anual} anuales · hasta ${hasta})`;
}

/** Vista previa en la ficha: días que corresponderían este año según el borrador. */
const vacacionesAnioModal = computed(() =>
  vacacionesDisponiblesAnio(
    {
      alta: borrador.alta || hoy(),
      baja: borrador.baja || null,
      diasVacacionesAnuales: Math.max(0, borrador.diasVacacionesAnuales)
    },
    anioActual
  )
);

const saldosTiempo = computed(() => saldoTiemposPorEmpleado());

/** Saldo de tiempo recuperable (minutos con signo) de un empleado. */
function saldoDe(e: Empleado): number {
  return saldosTiempo.value.get(e.id) ?? 0;
}

/** Antigüedad de un empleado: desde el alta hasta hoy (o hasta su baja). */
function antiguedadDe(e: Empleado): string {
  if (!e.alta) return "—";
  return transcurridoTexto(e.alta, e.baja ?? hoy());
}

const antiguedadModal = computed(() => (borrador.alta ? transcurridoTexto(borrador.alta, hoy()) : "—"));

// --------------------------------------------------------------- historial
const historialAbierto = ref(false);
const historialEmp = ref<Empleado | null>(null);

const historialItems = computed<HistorialItem[]>(() =>
  historialEmp.value ? historialDeEmpleado(historialEmp.value.id) : []
);

function abrirHistorial(e: Empleado) {
  historialEmp.value = e;
  historialAbierto.value = true;
}

function editarDesdeHistorial() {
  const e = historialEmp.value;
  historialAbierto.value = false;
  if (e) abrirEdicion(e);
}

function colorTipoHistorial(t: HistorialItem["tipo"]): string {
  return t === "perfil" ? "#5C6BC0" : t === "ausencia" ? "#FB8C00" : "#26A69A";
}

function etiquetaTipoHistorial(t: HistorialItem["tipo"]): string {
  return t === "perfil" ? "Ficha" : t === "ausencia" ? "Ausencia" : "Tiempo";
}
</script>

<template>
  <div class="pagina">
    <header class="cabecera-pagina">
      <div>
        <h1>Plantilla</h1>
        <p class="sub">
          {{ totales.total }} empleado{{ totales.total === 1 ? "" : "s" }} · {{ totales.activos }} activo{{ totales.activos === 1 ? "" : "s" }}
          · clic en una fila para abrir su historial de acciones · ✎ para editar la ficha
        </p>
      </div>
      <div class="acciones-pagina">
        <div class="filtro-estado" role="group" aria-label="Filtrar por estado">
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
        <button class="btn primario" @click="abrirNueva"><Icono nombre="mas" /> Añadir empleado</button>
      </div>
    </header>

    <section class="tarjeta" style="overflow: auto">
      <table class="tabla-personas" v-if="empleados.length">
        <thead>
          <tr>
            <th class="th-ordenable" title="Ordenar por empleado" :aria-sort="ariaOrden('empleada')" @click="alternarOrden('empleada')">
              Empleados<span class="flecha" v-if="flechaOrden('empleada')">{{ flechaOrden('empleada') }}</span>
            </th>
            <th class="th-ordenable" title="Ordenar por teléfono" :aria-sort="ariaOrden('telefono')" @click="alternarOrden('telefono')">
              Teléfono<span class="flecha" v-if="flechaOrden('telefono')">{{ flechaOrden('telefono') }}</span>
            </th>
            <th class="th-ordenable" title="Ordenar por tipo de contrato" :aria-sort="ariaOrden('contrato')" @click="alternarOrden('contrato')">
              Contrato<span class="flecha" v-if="flechaOrden('contrato')">{{ flechaOrden('contrato') }}</span>
            </th>
            <th class="th-ordenable" title="Ordenar por antigüedad (más antigua primero)" :aria-sort="ariaOrden('antiguedad')" @click="alternarOrden('antiguedad')">
              Antigüedad<span class="flecha" v-if="flechaOrden('antiguedad')">{{ flechaOrden('antiguedad') }}</span>
            </th>
            <th class="th-ordenable" title="Ordenar por fecha de alta (más antigua primero)" :aria-sort="ariaOrden('alta')" @click="alternarOrden('alta')">
              Fecha alta<span class="flecha" v-if="flechaOrden('alta')">{{ flechaOrden('alta') }}</span>
            </th>
            <th
              class="th-ordenable"
              title="Ordenar por tiempo recuperable. − = horas extra realizadas · + = debe horas"
              :aria-sort="ariaOrden('tiempo')"
              @click="alternarOrden('tiempo')"
            >
              Tiempo Recuperable<span class="flecha" v-if="flechaOrden('tiempo')">{{ flechaOrden('tiempo') }}</span>
            </th>
            <th class="th-ordenable" title="Ordenar por días de vacaciones usados este año" :aria-sort="ariaOrden('vacaciones')" @click="alternarOrden('vacaciones')">
              Vacaciones {{ new Date().getFullYear() }}<span class="flecha" v-if="flechaOrden('vacaciones')">{{ flechaOrden('vacaciones') }}</span>
            </th>
            <th style="width: 96px"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="e in empleados"
            :key="e.id"
            :class="{ 'fila-inactiva': e.baja }"
            style="cursor: pointer"
            @click="abrirHistorial(e)"
          >
            <td>
              <div style="display: flex; align-items: center; gap: 10px">
                <span
                  class="avatar"
                  :style="{ background: e.color, filter: e.baja ? 'grayscale(0.85)' : '' }"
                >{{ iniciales(e) }}</span>
                <div>
                  <div style="font-weight: 600">{{ nombreCompleto(e) }}</div>
                  <div style="font-size: 11.5px; color: var(--apagado)">
                    {{ e.dni ? `DNI ${e.dni}` : "Sin DNI" }} ·
                    {{ e.baja ? `baja ${fmt(e.baja)}` : "activo" }}
                    <span v-if="e.baja && e.motivoBaja" :title="e.motivoBaja">✎</span>
                  </div>
                </div>
              </div>
            </td>
            <td style="color: var(--subtitulo); font-size: 13px; white-space: nowrap">{{ e.telefono || "—" }}</td>
            <td style="white-space: nowrap">
              <div style="font-weight: 600; font-size: 13px">{{ e.tipoContrato || "—" }}</div>
              <div style="font-size: 11.5px; color: var(--apagado)">
                {{ e.jornadaHoras ? `${e.jornadaHoras} h/semana` : "jornada sin fijar" }}
              </div>
            </td>
            <td style="white-space: nowrap">
              <span style="font-size: 13px">{{ antiguedadDe(e) }}</span>
            </td>
            <td style="white-space: nowrap" :title="`Alta el ${fmt(e.alta)}`">
              <span style="font-size: 13px">{{ fmt(e.alta) }}</span>
            </td>
            <td style="white-space: nowrap">
              <span
                class="etiqueta"
                :class="saldoDe(e) < 0 ? 'ok' : saldoDe(e) > 0 ? 'roja' : 'neutra'"
                :title="`${descripcionSaldo(saldoDe(e))}. ${formatearTiempo(saldoDe(e))}`"
              >{{ formatearTiempo(saldoDe(e)) }}</span>
            </td>
            <td>
              <span
                class="etiqueta"
                :class="usadas(e) >= diasDisponibles(e) ? 'roja' : 'ok'"
                :title="tituloVacaciones(e)"
              >
                {{ usadas(e) }} / {{ diasDisponibles(e) }} días
              </span>
            </td>
            <td @click.stop>
              <div style="display: flex; gap: 6px; justify-content: flex-end">
                <button class="btn chico icono-solo" title="Editar" @click="abrirEdicion(e)"><Icono nombre="lapiz" :tam="14" /></button>
                <button class="btn chico icono-solo peligro" title="Eliminar" @click="borrar(e)"><Icono nombre="papelera" :tam="14" /></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="vacio-mensaje">
        <template v-if="mensajeVacio.titulo">{{ mensajeVacio.titulo }}</template>
        <template v-else>Nadie coincide con el filtro.</template>
        <br />{{ mensajeVacio.sub }}
      </div>
    </section>

    <Modal v-if="abierto" :titulo="editando ? 'Editar empleado' : 'Nuevo empleado'" :ancho="680" @cerrar="abierto = false">
      <div class="fila-form">
        <p class="grupo-titulo">Datos personales</p>

        <div class="grid-2">
          <div class="campo">
            <label>Nombre *</label>
            <input v-model="borrador.nombre" type="text" placeholder="María" />
          </div>
          <div class="campo">
            <label>Apellidos *</label>
            <input v-model="borrador.apellidos" type="text" placeholder="García López" />
          </div>
        </div>

        <div class="grid-2">
          <div class="campo">
            <label>DNI / NIE</label>
            <input v-model="borrador.dni" type="text" placeholder="12345678A" />
          </div>
          <div class="campo">
            <label>Nº Seguridad Social</label>
            <input v-model="borrador.nss" type="text" placeholder="123456789012" />
          </div>
        </div>

        <div class="grid-2">
          <div class="campo">
            <label>Fecha de nacimiento</label>
            <CampoFecha v-model="borrador.nacimiento" :max="hoy()" />
          </div>
          <div class="campo">
            <label>Teléfono</label>
            <input v-model="borrador.telefono" type="tel" placeholder="612 345 678" />
          </div>
        </div>

        <div class="campo">
          <label>Nº de cuenta bancaria (IBAN)</label>
          <input v-model="borrador.iban" type="text" placeholder="ES00 0000 0000 0000 0000 0000" />
        </div>

        <div class="campo">
          <label>Color identificativo</label>
          <div class="paleta">
            <button
              v-for="c in PALETA"
              :key="c"
              type="button"
              class="luneta"
              :class="{ seleccionada: borrador.color === c }"
              :style="{ background: c }"
              @click="borrador.color = c"
            ></button>
          </div>
        </div>

        <p class="grupo-titulo">Contrato y retribución</p>

        <div class="grid-2">
          <div class="campo">
            <label>Fecha de alta</label>
            <CampoFecha v-model="borrador.alta" />
            <span class="ayuda" v-if="borrador.alta">Antigüedad: {{ antiguedadModal }}</span>
          </div>
          <div class="campo">
            <label>Tipo de contrato</label>
            <select v-model="borrador.tipoContrato">
              <option v-for="t in TIPOS_CONTRATO" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
        </div>

        <div class="grid-2">
          <div class="campo">
            <label>Jornada (horas / semana)</label>
            <input v-model.number="borrador.jornadaHoras" type="number" min="1" max="60" step="1" />
          </div>
          <div class="campo">
            <label>Salario bruto mensual (€)</label>
            <input v-model.number="borrador.salarioBruto" type="number" min="0" step="50" placeholder="1.500" />
          </div>
        </div>

        <div class="campo">
          <label>Días de vacaciones / año</label>
          <input v-model.number="borrador.diasVacacionesAnuales" type="number" min="0" max="60" />
          <span class="ayuda">
            Este año ({{ anioActual }}) le corresponden <b>{{ vacacionesAnioModal }} días</b>
            (proporcional a la fecha de alta si es este año; desde el 1 de enero del año
            siguiente vuelven a ser los anuales).
          </span>
        </div>

        <template v-if="editando">
          <p class="grupo-titulo">Baja laboral</p>
          <div class="campo">
            <label>Fecha de baja (vacío = sigue activo)</label>
            <CampoFecha v-model="borrador.baja" :max="hoy()" />
          </div>
          <div class="campo" v-if="borrador.baja">
            <label>Comentario de la baja</label>
            <textarea
              v-model="borrador.motivoBaja"
              rows="2"
              placeholder="Motivo, preaviso, fecha de la última jornada…"
            ></textarea>
          </div>
        </template>

        <p class="grupo-titulo">Comentarios</p>
        <div class="campo">
          <label>Notas internas</label>
          <textarea
            v-model="borrador.notas"
            rows="3"
            placeholder="Observaciones: preferencias de turno, alergias, documentación pendiente…"
          ></textarea>
        </div>

        <p v-if="error" style="color: var(--peligro); font-size: 13px; font-weight: 600">{{ error }}</p>

        <div class="modal-pie">
          <button class="btn" @click="abierto = false">Cancelar</button>
          <button class="btn primario" @click="guardar">Guardar</button>
        </div>
      </div>
    </Modal>

    <!-- Historial de acciones del empleado (más reciente primero) -->
    <Modal
      v-if="historialAbierto && historialEmp"
      :titulo="`Historial de acciones · ${nombreCompleto(historialEmp)}`"
      :ancho="640"
      @cerrar="historialAbierto = false"
    >
      <div v-if="historialItems.length" class="historial-lista">
        <div v-for="h in historialItems" :key="h.id" class="historial-item">
          <span class="hist-marca" :style="{ background: colorTipoHistorial(h.tipo) }">
            {{ etiquetaTipoHistorial(h.tipo).slice(0, 1) }}
          </span>
          <span class="hist-cuerpo">
            <!-- Cambios de ficha: se muestran campo a campo con el valor anterior tachado. -->
            <span v-if="h.cambios && h.cambios.length" class="hist-cambios">
              <span v-if="h.cambios.some((c) => !c.nota)" class="hist-cabecera">Perfil actualizado</span>
              <span v-for="c in h.cambios" :key="c.campo + (c.nota ?? '')" class="hist-cambio">
                <template v-if="c.nota">{{ c.nota }}</template>
                <template v-else>
                  <span class="hist-campo">{{ c.campo }}</span>
                  <s class="hist-antes" :title="`Antes: ${c.antes}`">{{ c.antes }}</s>
                  <span class="hist-flecha">→</span>
                  <b class="hist-despues">{{ c.despues }}</b>
                </template>
              </span>
            </span>
            <span v-else class="hist-texto">{{ h.texto }}</span>
            <span class="hist-fecha">{{ fmtFechaHora(h.cuando) }}</span>
          </span>
        </div>
      </div>
      <div v-else class="vacio-mensaje" style="padding: 22px 10px">
        Sin acciones registradas todavía: los cambios de ficha, ausencias y tiempo recuperable quedarán anotados aquí.
      </div>
      <div class="modal-pie">
        <button class="btn" @click="historialAbierto = false">Cerrar</button>
        <button class="btn primario" @click="editarDesdeHistorial"><Icono nombre="lapiz" :tam="14" /> Editar ficha</button>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.historial-lista {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 440px;
  overflow-y: auto;
  margin: 2px -4px 0;
}

.historial-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 10px 8px;
  border-radius: 10px;
  transition: background 0.12s;
}
.historial-item:hover { background: var(--superficie-2); }
.historial-item + .historial-item { border-top: 1px solid var(--borde-suave); }

.hist-marca {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  margin-top: 1px;
}

.hist-cuerpo {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.hist-texto {
  font-size: 13px;
  color: var(--tinta);
  line-height: 1.4;
}
.hist-fecha {
  font-size: 11px;
  color: var(--apagado);
}

.hist-cambios {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
  line-height: 1.45;
}
.hist-cabecera {
  font-weight: 700;
  color: var(--tinta);
}
.hist-cambio {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 7px;
  color: var(--tinta);
}
.hist-campo {
  color: var(--subtitulo);
  font-weight: 600;
  white-space: nowrap;
}
.hist-campo::after {
  content: ":";
}
.hist-antes {
  color: var(--apagado);
  text-decoration-thickness: 1.5px;
}
.hist-flecha {
  color: var(--apagado);
}
.hist-despues {
  color: var(--tinta);
}

.th-ordenable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: color 0.15s;
}
.th-ordenable:hover { color: var(--acento); }

.flecha {
  margin-left: 4px;
  font-size: 11px;
  color: var(--acento);
}

/* ------------------------------------------------------- filtro por estado */
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
</style>

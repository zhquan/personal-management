<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import Icono from "../components/Icono.vue";
import CampoFecha from "../components/CampoFecha.vue";
import {
  anyadirPeriodoCierre,
  esDiaCerrado,
  franjasVistaAvanzada,
  guardarTipoTurno,
  quitarPeriodoCierre,
  quitarTipoTurno,
  restaurarTurnosBase,
  setDiasCierre,
  setDiasCierreCuentanVacaciones,
  setFinSemanaLaboral,
  setInicioSemanaLaboral,
  setDuracionFranjaVistaAvanzada,
  setRangoVistaAvanzada,
  setVistaAvanzadaActivada,
  state
} from "../lib/store";
import { esTurnoBase, tintaSobre, TIPOS_TURNO_BASE, type TipoTurno } from "../lib/types";
import { fmt, hoy } from "../lib/dates";
import { minutosAFormato, normalizarHora } from "../lib/horario";

// ------------------------------------------------------ Días de cierre semanales
// Números ISO: 1 = lunes … 7 = domingo (el calendario empieza la semana en lunes).
const DIAS_SEMANA = [
  { n: 1, corto: "L", nombre: "lunes" },
  { n: 2, corto: "M", nombre: "martes" },
  { n: 3, corto: "X", nombre: "miércoles" },
  { n: 4, corto: "J", nombre: "jueves" },
  { n: 5, corto: "V", nombre: "viernes" },
  { n: 6, corto: "S", nombre: "sábado" },
  { n: 7, corto: "D", nombre: "domingo" }
];

function alternarDia(n: number) {
  const actuales = new Set(state.diasCierre);
  if (actuales.has(n)) actuales.delete(n);
  else actuales.add(n);
  setDiasCierre([...actuales]);
}

const textoDiasCierre = computed(() => {
  const nombres = state.diasCierre.map((n) => DIAS_SEMANA.find((d) => d.n === n)?.nombre ?? "");
  if (nombres.length === 7) return "toda la semana";
  if (!nombres.length) return "ningún día";
  return nombres.join(", ");
});

// ------------------------------------------------------------ Períodos de cierre
const nuevoPeriodo = reactive<{ inicio: string; fin: string }>({ inicio: "", fin: "" });
const avisoPeriodo = ref("");

function anadirPeriodo() {
  if (!nuevoPeriodo.inicio || !nuevoPeriodo.fin) {
    avisoPeriodo.value = "Indica las dos fechas del período de cierre.";
    return;
  }
  if (nuevoPeriodo.inicio > nuevoPeriodo.fin) {
    avisoPeriodo.value = "La fecha de inicio debe ser anterior o igual a la de fin.";
    return;
  }
  anyadirPeriodoCierre(nuevoPeriodo.inicio, nuevoPeriodo.fin);
  nuevoPeriodo.inicio = "";
  nuevoPeriodo.fin = "";
  avisoPeriodo.value = "";
}

// --------------------------------------------------------- Tipos de turno extra
const borrador = reactive<{
  id: number | null;
  nombre: string;
  sigla: string;
  color: string;
  desde: string;
  hasta: string;
  automatico: boolean;
}>({ id: null, nombre: "", sigla: "", color: "#7C3AED", desde: "", hasta: "", automatico: false });

/** Mañana o Tarde están borrados: se ofrece restaurarlos. */
const faltanTurnosBase = computed(() =>
  TIPOS_TURNO_BASE.some((b) => !state.tiposTurno.some((t) => t.sigla === b.sigla)));
const editando = ref(false);
const avisoTipo = ref("");
/** Editando un turno fijo (Mañana/Tarde): solo se puede cambiar su horario. */
const editandoBase = computed(() => borrador.id !== null && borrador.id < 0);

function empezarNuevo() {
  Object.assign(borrador, { id: null, nombre: "", sigla: "", color: "#7C3AED", desde: "", hasta: "", automatico: false });
  editando.value = true;
  avisoTipo.value = "";
}
function editarTipo(t: TipoTurno) {
  Object.assign(borrador, {
    id: t.id,
    nombre: t.nombre,
    sigla: t.sigla,
    color: t.color,
    desde: t.desde ?? "",
    hasta: t.hasta ?? "",
    automatico: t.automatico
  });
  editando.value = true;
  avisoTipo.value = "";
}
function cancelarEdicion() {
  editando.value = false;
  avisoTipo.value = "";
}

function guardarTipo() {
  // Mañana/Tarde son fijos: desde el formulario solo se cambia su horario (desde/hasta).
  if (editandoBase.value) {
    const original = state.tiposTurno.find((t) => t.id === borrador.id);
    if (!original) {
      editando.value = false;
      avisoTipo.value = "";
      return;
    }
    const desde = normalizarHora(borrador.desde);
    const hasta = normalizarHora(borrador.hasta);
    if (!desde || !hasta) {
      avisoTipo.value = "Indica la hora de inicio y de fin del turno (HH:MM).";
      return;
    }
    if (desde >= hasta) {
      avisoTipo.value = "La hora de inicio debe ser anterior a la de fin.";
      return;
    }
    guardarTipoTurno({ ...original, desde, hasta });
    editando.value = false;
    avisoTipo.value = "";
    return;
  }
  const sigla = borrador.sigla.trim();
  if (!sigla) {
    avisoTipo.value = "Escribe la sigla: una letra, un número o un carácter especial (p. ej. N, 2 o @).";
    return;
  }
  if (sigla === "M" || sigla === "T") {
    avisoTipo.value = "«M» y «T» están reservados a Mañana y Tarde: si los borraste, restáuralos con el botón de abajo.";
    return;
  }
  if (state.tiposTurno.some((t) => t.id !== borrador.id && t.sigla === sigla)) {
    avisoTipo.value = "Ya existe un turno con esa sigla: elige otra.";
    return;
  }
  if (!borrador.nombre.trim()) {
    avisoTipo.value = "Ponle un nombre al turno (p. ej. «Noche»).";
    return;
  }
  if (borrador.desde && borrador.hasta && borrador.desde >= borrador.hasta) {
    avisoTipo.value = "La hora de inicio debe ser anterior a la de fin.";
    return;
  }
  guardarTipoTurno({
    id: borrador.id ?? 0,
    nombre: borrador.nombre,
    sigla,
    color: borrador.color,
    desde: borrador.desde || undefined,
    hasta: borrador.hasta || undefined,
    automatico: borrador.automatico
  });
  editando.value = false;
  avisoTipo.value = "";
}

function eliminarTipo(t: TipoTurno) {
  const etiqueta = t.desde || t.hasta ? ` (${t.desde ?? "?"}–${t.hasta ?? "?"})` : "";
  const aviso = esTurnoBase(t)
    ? "Dejará de programarse en el calendario (puedes restaurarlo después con el botón de abajo)."
    : "Se quitarán las asignaciones a mano que lo usen.";
  if (!window.confirm(`¿Eliminar el turno «${t.nombre}» (${t.sigla})${etiqueta}?\n${aviso}`)) return;
  quitarTipoTurno(t.id);
}

function restaurarBase() {
  restaurarTurnosBase();
}

// ----------------------------------------- Rango y franjas (vista Avanzada)
const rangoAv = reactive({
  desde: state.desdeVistaAvanzada,
  hasta: state.hastaVistaAvanzada,
  duracion: minutosAFormato(state.duracionFranjaVistaAvanzada)
});
const avisoRango = ref("");
const franjasAvanzadas = computed(() => franjasVistaAvanzada());

function guardarRango() {
  avisoRango.value = setRangoVistaAvanzada(rangoAv.desde, rangoAv.hasta);
  if (!avisoRango.value) avisoRango.value = setDuracionFranjaVistaAvanzada(rangoAv.duracion);
  if (!avisoRango.value) {
    // Refleja los valores normalizados guardados.
    rangoAv.desde = state.desdeVistaAvanzada;
    rangoAv.hasta = state.hastaVistaAvanzada;
    rangoAv.duracion = minutosAFormato(state.duracionFranjaVistaAvanzada);
  }
}

function alternarAvanzada() {
  setVistaAvanzadaActivada(!state.vistaAvanzadaActivada);
}

/** Si «hoy» o los próximos días están cerrados, se avisa al pie de la página. */
const avisoHoyCerrado = computed(() => {
  const cerrado = (offset: number) => {
    const f = new Date();
    f.setDate(f.getDate() + offset);
    const iso = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
    return esDiaCerrado(iso);
  };
  if (cerrado(0)) return `La empresa está cerrada hoy (${fmt(hoy())}).`;
  const proximo = [1, 2, 3, 4, 5, 6, 7].find((o) => cerrado(o));
  return proximo !== undefined ? `Próximo cierre: dentro de ${proximo} día${proximo === 1 ? "" : "s"}.` : "";
});
</script>

<template>
  <div class="pagina">
    <header class="cabecera-pagina">
      <div>
        <h1>Ajustes</h1>
        <p class="sub">Cierre de la empresa (días sueltos o períodos) y tipos de turno personalizados</p>
      </div>
    </header>

    <div class="fila-ajustes-top">
      <!-- Cierre semanal -->
      <section class="tarjeta" style="padding: 18px">
        <h3 class="titulo-tarjeta"><Icono nombre="calendario" :tam="15" /> Días de cierre semanales</h3>
        <p class="descripcion">
          Días de la semana en que la empresa permanece <b>cerrada</b> (p. ej. todos los martes):
          no se generan turnos y el calendario los marca con una ✕.
        </p>
        <div class="dias-cierre">
          <button
            v-for="d in DIAS_SEMANA"
            :key="d.n"
            type="button"
            class="chip-dia"
            :class="{ activo: state.diasCierre.includes(d.n) }"
            :title="`Cerrar todos los ${d.nombre}s`"
            @click="alternarDia(d.n)"
          >
            <span class="chip-corto">{{ d.corto }}</span>
            <span class="chip-nombre">{{ d.nombre.slice(0, 3) }}</span>
          </button>
        </div>
        <p class="nota resumen-cierre">
          Cierre semanal: <b>{{ textoDiasCierre }}</b>
          <template v-if="state.diasCierre.length"> · los días cerrados quedan sin turnos</template>.
        </p>

        <div class="opcion-vacaciones">
          <span class="etiqueta-opcion">¿Los días de cierre semanal cuentan como vacaciones?</span>
          <div class="grupo-si-no">
            <button
              type="button"
              class="chip-si-no"
              :class="{ activo: state.diasCierreCuentanVacaciones }"
              :title="'Cada día del período cuenta como vacaciones (días naturales)'"
              @click="setDiasCierreCuentanVacaciones(true)"
            >Sí</button>
            <button
              type="button"
              class="chip-si-no"
              :class="{ activo: !state.diasCierreCuentanVacaciones }"
              :title="'Los días de cierre semanal no cuentan como vacaciones (días laborables)'"
              @click="setDiasCierreCuentanVacaciones(false)"
            >No</button>
          </div>
          <p class="nota resumen-cierre" style="margin-top: 8px">
            Con «Sí», un período del lunes al domingo con cierre el martes cuenta
            <b>7 días naturales</b>; con «No», <b>6 días laborables</b> (el martes no cuenta).
          </p>
        </div>

        <div class="sep-forma"></div>
        <div class="rango-semana">
          <span class="etiqueta-opcion">Inicio y fin de semana (Calendario de turnos)</span>
          <div class="grid-2">
            <div class="campo">
              <label>La semana empieza el</label>
              <select
                :value="state.inicioSemanaLaboral"
                @change="setInicioSemanaLaboral(Number(($event.target as HTMLSelectElement).value))"
              >
                <option v-for="d in DIAS_SEMANA" :key="d.n" :value="d.n">{{ d.nombre[0].toUpperCase() + d.nombre.slice(1) }}</option>
              </select>
            </div>
            <div class="campo">
              <label>y termina el</label>
              <select
                :value="state.finSemanaLaboral"
                @change="setFinSemanaLaboral(Number(($event.target as HTMLSelectElement).value))"
              >
                <option v-for="d in DIAS_SEMANA" :key="d.n" :value="d.n">{{ d.nombre[0].toUpperCase() + d.nombre.slice(1) }}</option>
              </select>
            </div>
          </div>
          <p class="nota resumen-cierre" style="margin-top: 8px">
            El Calendario de turnos muestra cada semana desde el día de inicio hasta el de fin.
            Si, por ejemplo, el <b>martes</b> es día de cierre semanal, pon la semana de
            <b>miércoles a lunes</b>: el martes no aparecerá en el calendario.
          </p>
        </div>
      </section>

      <!-- Períodos de cierre -->
      <section class="tarjeta" style="padding: 18px">
        <h3 class="titulo-tarjeta"><Icono nombre="sol" :tam="15" /> Períodos de cierre</h3>
        <p class="descripcion">
          La empresa cierra durante estos períodos (p. ej. vacaciones de la empresa
          del 03/08 al 25/08): las fechas dentro del rango quedan cerradas.
        </p>
        <div v-if="state.periodosCierre.length" class="lista-periodos">
          <div v-for="(p, i) in state.periodosCierre" :key="i" class="fila-periodo">
            <span class="punto" style="background: var(--peligro)"></span>
            <span class="periodo-fechas">Del <b>{{ fmt(p.inicio) }}</b> al <b>{{ fmt(p.fin) }}</b></span>
            <span v-if="p.inicio <= hoy() && p.fin >= hoy()" class="mini-activo">en curso</span>
            <button class="btn chico icono-solo peligro" title="Quitar período de cierre" @click="quitarPeriodoCierre(i)">
              <Icono nombre="papelera" :tam="13" />
            </button>
          </div>
        </div>
        <div v-else class="vacio-mensaje" style="padding: 12px 8px">Sin períodos de cierre.</div>

        <div class="sep-forma"></div>
        <div class="grid-2">
          <div class="campo">
            <label>Desde</label>
            <CampoFecha v-model="nuevoPeriodo.inicio" :max="nuevoPeriodo.fin || undefined" />
          </div>
          <div class="campo">
            <label>Hasta</label>
            <CampoFecha v-model="nuevoPeriodo.fin" :min="nuevoPeriodo.inicio || undefined" />
          </div>
        </div>
        <div class="pie-accion">
          <button class="btn" @click="anadirPeriodo"><Icono nombre="mas" :tam="15" /> Añadir período</button>
        </div>
        <p v-if="avisoPeriodo" class="nota nota-error">{{ avisoPeriodo }}</p>
      </section>

    </div>

    <!-- Vista Avanzada del calendario: activable/desactivable con su formulario -->
    <section class="tarjeta" style="padding: 18px">
      <div class="cabecera-toggle">
        <div>
          <h3 class="titulo-tarjeta"><Icono nombre="reloj" :tam="15" /> Vista Avanzada del calendario</h3>
          <p class="descripcion" style="margin-bottom: 0">
            La vista <b>Avanzada</b> de «Calendario de turnos» es un plan por horas: cada columna
            es un día del período visible (semana o quincena) y cada fila, una franja de la duración que elijas. Haz clic en
            una celda para asignar empleados con su horario (desde–hasta); cada empleado se pinta
            con su color.
          </p>
        </div>
        <button class="btn" :class="{ primario: !state.vistaAvanzadaActivada }" @click="alternarAvanzada">
          <Icono nombre="power" :tam="14" />
          {{ state.vistaAvanzadaActivada ? "Desactivar" : "Activar" }}
        </button>
      </div>

      <template v-if="state.vistaAvanzadaActivada">
        <div class="sep-forma" style="margin-top: 16px"></div>
        <div class="grid-2">
          <div class="campo">
            <label>Primera franja (desde)</label>
            <input v-model="rangoAv.desde" type="time" />
          </div>
          <div class="campo">
            <label>Última franja (hasta)</label>
            <input v-model="rangoAv.hasta" type="time" />
          </div>
        </div>
        <div class="campo" style="margin-top: 10px">
          <label>Duración de cada franja (HH:MM)</label>
          <input v-model="rangoAv.duracion" placeholder="00:30" class="entrada-duracion" />
          <span class="ayuda">En formato HH:MM, p. ej. 00:15, 00:30 o 01:00. Debe dividir el rango en franjas completas.</span>
        </div>
        <div class="pie-accion" style="margin-top: 10px">
          <button class="btn primario" @click="guardarRango">Guardar rango y duración</button>
        </div>
        <p class="nota resumen-cierre" style="margin-top: 10px">
          Rango: de <b>{{ state.desdeVistaAvanzada }}</b> a <b>{{ state.hastaVistaAvanzada }}</b>
          · {{ franjasAvanzadas.length }} franjas de {{ minutosAFormato(state.duracionFranjaVistaAvanzada) }}
        </p>
        <p v-if="avisoRango" class="nota nota-error">{{ avisoRango }}</p>
      </template>
      <p v-else class="nota resumen-cierre" style="margin-top: 12px">
        La vista Avanzada está <b>desactivada</b>: no aparece en «Calendario de turnos» y su
        configuración queda oculta. Pulsa «Activar» para usarla de nuevo; la planificación por
        horas guardada se conserva.
      </p>
    </section>

    <!-- Tipos de turno (fila completa, debajo de las tarjetas anteriores) -->
    <section class="tarjeta tipos-turno" style="padding: 18px">
      <h3 class="titulo-tarjeta"><Icono nombre="reloj" :tam="15" /> Tipos de turno</h3>
      <p class="descripcion">
        «Mañana» (M) y «Tarde» (T) vienen por defecto y siempre son automáticos; si quieres,
        también puedes <b>borrarlos</b> (dejarán de programarse). Añade turnos extra con su
        propia <b>sigla</b> (letra, número o carácter especial), <b>color</b> y, opcionalmente,
        <b>horario</b> («por hora»). Si marcas <b>automático</b>, el turno entra en la rotación
        semanal.
      </p>

      <div v-if="state.tiposTurno.length" class="lista-tipos">
        <div v-for="t in state.tiposTurno" :key="t.id" class="fila-tipo" :class="{ base: esTurnoBase(t) }">
          <span class="muestra-tipo" :style="{ background: t.color, color: tintaSobre(t.color) }">{{ t.sigla }}</span>
          <div class="tipo-info">
            <div>
              <b>{{ t.nombre }}</b>
              <span v-if="esTurnoBase(t)" class="mini-badge">fijo</span>
              <span v-if="t.automatico" class="mini-badge auto">automático</span>
              <span v-else class="mini-badge">a mano</span>
            </div>
            <div v-if="t.desde || t.hasta" class="tipo-horas">De {{ t.desde || "?" }} a {{ t.hasta || "?" }}</div>
          </div>
          <button
            class="btn chico icono-solo"
            :title="esTurnoBase(t) ? 'Cambiar su horario' : 'Editar turno'"
            @click="editarTipo(t)"
          >
            <Icono nombre="lapiz" :tam="13" />
          </button>
          <button class="btn chico icono-solo peligro" title="Eliminar turno" @click="eliminarTipo(t)">
            <Icono nombre="papelera" :tam="13" />
          </button>
        </div>
      </div>
      <div v-else class="vacio-mensaje" style="padding: 10px 8px">
        No hay tipos de turno definidos (Mañana y Tarde borrados). Añade turnos nuevos o restaura
        los fijos con el botón de abajo.
      </div>

      <!-- Formulario nuevo / edición -->
      <div v-if="editando" class="form-tipo">
        <template v-if="!editandoBase">
          <div class="grid-3">
            <div class="campo">
              <label>Sigla (1 carácter)</label>
              <input v-model="borrador.sigla" maxlength="1" placeholder="N" class="entrada-sigla" />
            </div>
            <div class="campo">
              <label>Nombre</label>
              <input v-model="borrador.nombre" maxlength="24" placeholder="Noche" />
            </div>
            <div class="campo">
              <label>Color</label>
              <div class="campo-color">
                <input v-model="borrador.color" type="color" />
                <input v-model="borrador.color" maxlength="7" class="entrada-hex" />
              </div>
            </div>
            <div class="campo">
              <label>Hora de inicio (opcional)</label>
              <input v-model="borrador.desde" type="time" />
            </div>
            <div class="campo">
              <label>Hora de fin (opcional)</label>
              <input v-model="borrador.hasta" type="time" />
            </div>
            <label class="interruptor auto-interruptor">
              <input v-model="borrador.automatico" type="checkbox" />
              <span>Incluir en la rotación automática</span>
            </label>
          </div>
          <p class="ayuda" style="margin-top: 2px">
            La sigla es lo que verás en el calendario. Para turnos «por hora» indica el horario,
            p. ej. de 22:00 a 06:00. Los turnos automáticos rotan cada semana: M → T → siguiente…
          </p>
        </template>
        <template v-else>
          <div class="grid-2" style="margin-top: 6px">
            <div class="campo">
              <label>Hora de inicio</label>
              <input v-model="borrador.desde" type="time" />
            </div>
            <div class="campo">
              <label>Hora de fin</label>
              <input v-model="borrador.hasta" type="time" />
            </div>
          </div>
          <p class="ayuda" style="margin-top: 2px">
            Mañana y Tarde son fijos: solo puedes cambiar su <b>horario</b>. Estas horas sirven
            como <b>atajo</b> al asignar un empleado en la vista Avanzada del calendario
            (por defecto Mañana 06:00–14:00 y Tarde 14:00–22:00).
          </p>
        </template>
        <div class="pie-accion" style="margin-top: 10px">
          <button class="btn primario" @click="guardarTipo">Guardar turno</button>
          <button class="btn" @click="cancelarEdicion">Cancelar</button>
        </div>
        <p v-if="avisoTipo" class="nota nota-error">{{ avisoTipo }}</p>
      </div>
      <div v-else class="pie-accion">
        <button class="btn" @click="empezarNuevo"><Icono nombre="mas" :tam="15" /> Añadir turno</button>
        <button
          v-if="faltanTurnosBase"
          class="btn"
          title="Vuelve a añadir Mañana y Tarde al principio de la rotación"
          @click="restaurarBase"
        >
          <Icono nombre="recargar" :tam="14" /> Restaurar Mañana y Tarde
        </button>
      </div>
    </section>

    <p v-if="avisoHoyCerrado" class="nota aviso-proximo">
      <Icono nombre="alarma" :tam="14" /> {{ avisoHoyCerrado }}
    </p>
  </div>
</template>

<style scoped>
.fila-ajustes-top {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 18px;
  /* Las tres tarjetas (cierre semanal, períodos y vista Avanzada) se estiran
     para que todas tengan la misma altura. */
  align-items: stretch;
}
.titulo-tarjeta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14.5px;
  margin-bottom: 8px;
}
.descripcion {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--subtitulo);
  margin: 0 0 14px;
}
.pie-accion {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
/* Cabecera de la tarjeta de la vista Avanzada: título a la izquierda y el
   botón Activar/Desactivar a la derecha (se envuelve en pantallas estrechas). */
.cabecera-toggle {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}
.cabecera-toggle > div { flex: 1; min-width: 260px; }
.nota {
  font-size: 12.5px;
  font-weight: 600;
  margin-top: 10px;
}
.nota-error { color: var(--peligro); }

/* ------------------------------------------------------- días de cierre */
.dias-cierre {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.chip-dia {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 7px 2px 5px;
  border-radius: 10px;
  border: 1px solid var(--borde);
  background: var(--superficie);
  cursor: pointer;
  transition: all 0.15s;
  font-weight: 600;
}
.chip-dia:hover { border-color: var(--acento-borde); background: var(--superficie-2); }
.chip-dia.activo {
  background: var(--peligro-suave);
  border-color: var(--peligro);
  color: var(--peligro);
}
.chip-corto { font-size: 13px; line-height: 1; }
.chip-nombre { font-size: 9.5px; font-weight: 500; text-transform: uppercase; opacity: 0.75; }
.resumen-cierre { color: var(--subtitulo); font-weight: 500; }

/* ------------------------------------------- los días de cierre cuentan como vacaciones */
.opcion-vacaciones {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--borde-suave);
  border-radius: 10px;
  background: var(--superficie);
}
.etiqueta-opcion {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 8px;
}
.grupo-si-no {
  display: inline-flex;
  border: 1px solid var(--borde);
  border-radius: 999px;
  overflow: hidden;
}
.chip-si-no {
  border: none;
  background: var(--superficie);
  color: var(--subtitulo);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 5px 18px;
  cursor: pointer;
  transition: all 0.15s;
}
.chip-si-no + .chip-si-no { border-left: 1px solid var(--borde); }
.chip-si-no.activo {
  background: var(--acento);
  color: #fff;
}

/* ------------------------------------------- inicio y fin de la semana laboral */
.rango-semana {
  margin-top: 4px;
  padding: 12px;
  border: 1px solid var(--borde-suave);
  border-radius: 10px;
  background: var(--superficie);
}
.rango-semana select {
  width: 100%;
  min-width: 0;
}

/* -------------------------------------------------------- períodos de cierre */
.lista-periodos {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fila-periodo {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--borde-suave);
  background: var(--superficie);
  font-size: 13px;
}
.fila-periodo:hover { background: var(--superficie-2); }
.periodo-fechas { flex: 1; min-width: 0; }
.mini-activo {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #fff;
  background: var(--peligro);
  border-radius: 999px;
  padding: 2px 8px;
}
.sep-forma { height: 1px; background: var(--borde-suave); margin: 14px 0; }

/* ----------------------------------------------------------- tipos de turno */
/* La lista ocupa una fila completa; crece en columnas y, si hay muchos turnos,
   aparece un scroll interno para que la página no se alargue sin fin. */
.lista-tipos {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 6px 10px;
  max-height: 380px;
  overflow-y: auto;
  padding-right: 6px;
  align-content: start;
}
.entrada-duracion {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.4px;
  max-width: 200px;
}
.campo .ayuda {
  font-size: 11px;
  color: var(--apagado);
  font-weight: 500;
  margin-top: 3px;
}
.fila-tipo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 10px;
  border: 1px solid var(--borde-suave);
  background: var(--superficie);
}
.fila-tipo:hover { background: var(--superficie-2); }
.fila-tipo.base { background: var(--superficie-2); border-style: dashed; }
.muestra-tipo {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 13px;
  flex: none;
}
.tipo-info { flex: 1; min-width: 0; }
.tipo-info > div { font-size: 13px; }
.tipo-horas { font-size: 11.5px; color: var(--apagado); }
.mini-badge {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--apagado);
  border: 1px solid var(--borde);
  border-radius: 999px;
  padding: 1px 7px;
  margin-left: 6px;
  vertical-align: 1px;
}
.mini-badge.auto { color: var(--acento); border-color: var(--acento-borde); background: var(--acento-suave); }

.form-tipo {
  margin-top: 12px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--acento-borde);
  background: var(--acento-suave);
}
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
@media (max-width: 640px) {
  .grid-3 { grid-template-columns: 1fr; }
}
.entrada-sigla {
  text-align: center;
  font-weight: 800;
  text-transform: uppercase;
}
.campo-color {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.campo-color input[type="color"] {
  width: 40px;
  flex: none;
  height: 36px;
  padding: 2px;
  border: 1px solid var(--borde);
  border-radius: 8px;
  background: var(--superficie);
  cursor: pointer;
}
.entrada-hex {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
/* La fila de campos de hora no debe desbordar el cuadro en columnas estrechas. */
.campo > input[type="time"] { width: 100%; min-width: 0; }
.auto-interruptor {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  color: var(--tinta);
  align-self: end;
  padding-bottom: 9px;
}
.auto-interruptor input { width: 16px; height: 16px; accent-color: var(--acento); cursor: pointer; }

.aviso-proximo {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #8a5a08;
  background: var(--aviso-suave);
  border: 1px solid #f3d9a7;
  padding: 9px 14px;
  border-radius: 10px;
  font-weight: 500;
}
</style>

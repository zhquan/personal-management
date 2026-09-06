<script setup lang="ts">
import { computed, ref } from "vue";
import CampoFecha from "../components/CampoFecha.vue";
import GraficoBarras from "../components/GraficoBarras.vue";
import GraficoLineas from "../components/GraficoLineas.vue";
import { state } from "../lib/store";
import {
  edadesEmpleados,
  OPCIONES_ESTADO_DASHBOARD,
  rangoPorDefecto,
  rangosEdad,
  serieAltasBajasActual,
  serieDuracionMedia,
  serieSalarioMedio,
  type FiltroEstadoDashboard
} from "../lib/dashboard";
import { hoy } from "../lib/dates";

// --------------------------------------------------------------- filtros
// Por defecto: empleados activos y el último año natural.
const estado = ref<FiltroEstadoDashboard>("activos");
const inicial = rangoPorDefecto();
const desde = ref(inicial.desde);
const hasta = ref(inicial.hasta);

const totales = computed(() => {
  const total = state.empleados.length;
  const activos = state.empleados.filter((e) => !e.baja).length;
  return { total, activos };
});

function conteoEstado(id: FiltroEstadoDashboard): number {
  if (id === "activos") return totales.value.activos;
  if (id === "noactivos") return totales.value.total - totales.value.activos;
  return totales.value.total;
}

const rangoValido = computed(() => !!desde.value && !!hasta.value && desde.value <= hasta.value);

const filtros = computed(() => ({ estado: estado.value, desde: desde.value, hasta: hasta.value }));

// --------------------------------------------------------------- métricas
const altasBajas = computed(() =>
  rangoValido.value ? serieAltasBajasActual(state.empleados, filtros.value) : null
);
const salario = computed(() =>
  rangoValido.value ? serieSalarioMedio(state.empleados, filtros.value) : null
);
const duracion = computed(() =>
  rangoValido.value ? serieDuracionMedia(state.empleados, filtros.value) : null
);
const edades = computed(() =>
  rangoValido.value ? rangosEdad(edadesEmpleados(state.empleados, filtros.value, hoy())) : []
);
const sinNacimiento = computed(() => totales.value.total - state.empleados.filter((e) => !!e.nacimiento).length);

const fmtEntero = (v: number) => v.toLocaleString("es-ES");
const fmtEuro = (v: number) => `${v.toLocaleString("es-ES")} €`;
const fmtMeses = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} meses`;

function restablecerRango() {
  desde.value = inicial.desde;
  hasta.value = inicial.hasta;
}
</script>

<template>
  <div class="pagina">
    <header class="cabecera-pagina">
      <div>
        <h1>Dashboard</h1>
        <p class="sub">
          Evolución de la plantilla, salarios, antigüedad y edades · los gráficos responden a los filtros
        </p>
      </div>
      <div class="acciones-pagina">
        <div class="filtro-estado" role="group" aria-label="Filtrar por estado">
          <button
            v-for="f in OPCIONES_ESTADO_DASHBOARD"
            :key="f.id"
            type="button"
            class="chip-filtro"
            :class="{ activo: estado === f.id }"
            :aria-pressed="estado === f.id"
            @click="estado = f.id"
          >
            {{ f.etiqueta }}
            <span class="chip-num">{{ conteoEstado(f.id) }}</span>
          </button>
        </div>
        <div class="filtro-fechas">
          <div class="campo campo-fecha">
            <label>Desde</label>
            <CampoFecha v-model="desde" />
          </div>
          <div class="campo campo-fecha">
            <label>Hasta</label>
            <CampoFecha v-model="hasta" />
          </div>
          <button class="btn chico" type="button" @click="restablecerRango">Último año</button>
        </div>
      </div>
    </header>

    <div v-if="!rangoValido" class="aviso-banda">
      El rango de fechas no es válido: «Desde» debe ser anterior o igual a «Hasta» y ambos deben estar rellenos.
    </div>

    <section class="tarjeta tarjeta-dash">
      <div class="dash-cabecera">
        <h2>Altas vs Bajas vs Actual</h2>
        <p class="dash-sub">Altas y bajas ocurridas cada mes y plantilla al cierre del mes, dentro del rango seleccionado.</p>
      </div>
      <GraficoLineas
        v-if="altasBajas"
        :etiquetas="altasBajas.etiquetas"
        :series="[
          { nombre: 'Altas', color: '#16a34a', valores: altasBajas.altas },
          { nombre: 'Bajas', color: '#dc2626', valores: altasBajas.bajas },
          { nombre: 'Actual', color: '#4f46e5', valores: altasBajas.actual }
        ]"
        :formato="fmtEntero"
      />
    </section>

    <div class="dash-grid">
      <section class="tarjeta tarjeta-dash">
        <div class="dash-cabecera">
          <h2>Salario bruto medio</h2>
          <p class="dash-sub">Media del salario de quien está en plantilla al cierre de cada mes.</p>
        </div>
        <GraficoLineas
          v-if="salario"
          :etiquetas="salario.etiquetas"
          :series="[{ nombre: 'Salario medio', color: '#4f46e5', valores: salario.valores }]"
          :formato="fmtEuro"
        />
      </section>

      <section class="tarjeta tarjeta-dash">
        <div class="dash-cabecera">
          <h2>Duración media</h2>
          <p class="dash-sub">Antigüedad media en meses de quien está en plantilla al cierre de cada mes.</p>
        </div>
        <GraficoLineas
          v-if="duracion"
          :etiquetas="duracion.etiquetas"
          :series="[{ nombre: 'Duración media', color: '#009688', valores: duracion.valores }]"
          :formato="fmtMeses"
        />
      </section>
    </div>

    <section class="tarjeta tarjeta-dash">
      <div class="dash-cabecera">
        <h2>Empleados por rango de edad</h2>
        <p class="dash-sub">
          Edad a fin del rango (o a día de hoy) de quienes trabajaron en el período.
          <template v-if="sinNacimiento"> · {{ sinNacimiento }} sin fecha de nacimiento no se muestran.</template>
        </p>
      </div>
      <GraficoBarras
        v-if="edades.length"
        :barras="edades.map((r) => ({
          etiqueta: r.etiqueta,
          valor: r.valor,
          titulo: `${r.etiqueta} años: ${r.valor} empleado${r.valor === 1 ? '' : 's'}`
        }))"
        :formato="fmtEntero"
      />
      <div v-else class="vacio-mensaje">Sin datos de edad para los filtros seleccionados.</div>
    </section>
  </div>
</template>

<style scoped>
/* Filtro por estado (mismo aspecto que en Plantilla) */
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

/* Rango de fechas */
.filtro-fechas {
  display: inline-flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.campo-fecha {
  width: 138px;
}
.filtro-fechas .btn {
  margin-bottom: 1px;
}

/* Tarjetas de gráficos */
.tarjeta-dash {
  padding: 18px 20px 16px;
}
.dash-cabecera {
  margin-bottom: 12px;
}
.dash-cabecera h2 {
  font-size: 15px;
  font-weight: 700;
}
.dash-sub {
  font-size: 12px;
  color: var(--apagado);
  margin-top: 2px;
}
.dash-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
@media (max-width: 980px) {
  .dash-grid {
    grid-template-columns: 1fr;
  }
}
</style>
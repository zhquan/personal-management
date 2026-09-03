<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import Icono from "../components/Icono.vue";
import {
  copiasGuardadas,
  crearCopia,
  eliminarCopia,
  exportarDatos,
  guardarPlanCopia,
  importarDatos,
  leerPlanCopia,
  restaurarCopia,
  type CopiaGuardada,
  type PlanCopia
} from "../lib/store";
import { fmtFechaHora, hoy } from "../lib/dates";

// ---------------------------------------------------------------- exportar
const exportado = ref(false);

function exportar() {
  const datos = exportarDatos();
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gestor-personal-${hoy()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  exportado.value = true;
  window.setTimeout(() => (exportado.value = false), 4000);
}

// ---------------------------------------------------------------- importar
const inputArchivo = ref<HTMLInputElement | null>(null);
const avisoImport = ref<{ tipo: "ok" | "error"; texto: string } | null>(null);

function elegirArchivo() {
  avisoImport.value = null;
  inputArchivo.value?.click();
}

function alElegirArchivo(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const archivo = input.files?.[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    let raw: unknown = null;
    try {
      raw = JSON.parse(String(lector.result));
    } catch {
      avisoImport.value = { tipo: "error", texto: "El archivo no es un JSON válido." };
      return;
    }
    try {
      const resultado = importarDatos(raw);
      avisoImport.value = { tipo: resultado.ok ? "ok" : "error", texto: resultado.mensaje };
      if (resultado.ok) {
        exportado.value = false;
        recargarCopias();
      }
    } catch {
      avisoImport.value = { tipo: "error", texto: "No se pudo importar el archivo." };
    } finally {
      input.value = "";
    }
  };
  lector.readAsText(archivo);
}

// ------------------------------------------------- copias de seguridad plan
const FRECUENCIAS: { id: PlanCopia["frecuencia"]; nombre: string }[] = [
  { id: "dia", nombre: "Cada día" },
  { id: "semana", nombre: "Cada semana" },
  { id: "mes", nombre: "Cada mes" }
];

const plan = reactive<PlanCopia>(leerPlanCopia());
const copias = ref<CopiaGuardada[]>(copiasGuardadas());
const avisoPlan = ref<{ tipo: "ok" | "error"; texto: string } | null>(null);

function recargarCopias() {
  copias.value = copiasGuardadas();
  Object.assign(plan, leerPlanCopia());
}

function guardarPlan() {
  const sano = guardarPlanCopia({
    activo: plan.activo,
    frecuencia: plan.frecuencia,
    maxCopias: plan.maxCopias,
    ultima: plan.ultima
  });
  Object.assign(plan, sano);
  avisoPlan.value = {
    tipo: "ok",
    texto: plan.activo
      ? "Copia automática activada. Se comprobará al abrir la aplicación y cada hora mientras esté abierta."
      : "Copias automáticas desactivadas."
  };
  window.setTimeout(() => (avisoPlan.value = null), 5000);
}

function copiarAhora() {
  crearCopia();
  recargarCopias();
  avisoPlan.value = { tipo: "ok", texto: "Copia de seguridad creada ahora mismo." };
  window.setTimeout(() => (avisoPlan.value = null), 5000);
}

function restaurar(c: CopiaGuardada) {
  if (!window.confirm(`¿Restaurar la copia del ${fmtFechaHora(c.creado)}?\nLos datos actuales se sustituirán por los de esa copia.`)) return;
  const r = restaurarCopia(c.id);
  avisoPlan.value = { tipo: r.ok ? "ok" : "error", texto: r.mensaje };
  recargarCopias();
  window.setTimeout(() => (avisoPlan.value = null), 6000);
}

function borrarCopia(c: CopiaGuardada) {
  eliminarCopia(c.id);
  recargarCopias();
}

const proximaCopia = computed(() => {
  if (!plan.activo) return "—";
  return plan.ultima ? `Última: ${fmtFechaHora(plan.ultima)}` : "Pendiente (se hará la próxima vez que se abra la app)";
});

const kb = (c: CopiaGuardada) => Math.max(1, Math.round(JSON.stringify(c.datos).length / 1024));
</script>

<template>
  <div class="pagina">
    <header class="cabecera-pagina">
      <div>
        <h1>Mantenimiento</h1>
        <p class="sub">Copia de seguridad de todos los datos (plantilla, ausencias, tiempo y calendario)</p>
      </div>
    </header>

    <div class="grid-mant">
      <!-- Exportar -->
      <section class="tarjeta" style="padding: 18px">
        <h3 class="titulo-tarjeta"><Icono nombre="descargar" :tam="15" /> Exportar base de datos</h3>
        <p class="descripcion">
          Descarga un archivo JSON con todos los datos guardados. Guárdalo en un sitio seguro (unidad,
          nube…) para poder recuperarlo en este u otro equipo.
        </p>
        <div class="pie-accion">
          <button class="btn primario" @click="exportar"><Icono nombre="descargar" :tam="15" /> Exportar ahora</button>
          <span v-if="exportado" class="nota-ok">Archivo descargado ✔</span>
        </div>
      </section>

      <!-- Importar -->
      <section class="tarjeta" style="padding: 18px">
        <h3 class="titulo-tarjeta"><Icono nombre="flechas" :tam="15" /> Importar base de datos</h3>
        <p class="descripcion">
          Elige un archivo de copia (.json) exportado desde esta aplicación. <b>Los datos actuales se
          sustituirán</b> por los del archivo (se recomienda exportar antes por si acaso).
        </p>
        <input ref="inputArchivo" type="file" accept=".json,application/json" hidden @change="alElegirArchivo" />
        <div class="pie-accion">
          <button class="btn" @click="elegirArchivo">Elegir archivo…</button>
        </div>
        <p v-if="avisoImport" class="nota" :class="avisoImport.tipo === 'ok' ? 'nota-ok' : 'nota-error'">{{ avisoImport.texto }}</p>
      </section>

      <!-- Planificar copias -->
      <section class="tarjeta plan-copias" style="padding: 18px">
        <h3 class="titulo-tarjeta"><Icono nombre="alarma" :tam="15" /> Planificar copias de seguridad</h3>
        <p class="descripcion">
          La app guarda automáticamente copias internas con la frecuencia elegida (se comprueba al
          abrirla y cada hora mientras esté abierta) y conserva las últimas {{ plan.maxCopias }}.
        </p>

        <div class="linea-plan">
          <label class="interruptor">
            <input v-model="plan.activo" type="checkbox" />
            <span>Copias automáticas</span>
          </label>
        </div>

        <div class="grid-plan">
          <div class="campo">
            <label>Frecuencia</label>
            <select v-model="plan.frecuencia" :disabled="!plan.activo">
              <option v-for="f in FRECUENCIAS" :key="f.id" :value="f.id">{{ f.nombre }}</option>
            </select>
          </div>
          <div class="campo">
            <label>Conservar últimas copias</label>
            <input v-model.number="plan.maxCopias" type="number" min="1" max="30" :disabled="!plan.activo" />
          </div>
        </div>

        <p class="resumen-plan">{{ proximaCopia }}</p>

        <div class="pie-accion">
          <button class="btn primario" @click="copiarAhora"><Icono nombre="recargar" :tam="15" /> Hacer copia ahora</button>
          <button class="btn" :disabled="!plan.activo" @click="guardarPlan">Guardar plan</button>
        </div>
        <p v-if="avisoPlan" class="nota" :class="avisoPlan.tipo === 'ok' ? 'nota-ok' : 'nota-error'">{{ avisoPlan.texto }}</p>
      </section>
    </div>

    <!-- Copias guardadas -->
    <section class="tarjeta" style="margin-top: 18px; padding: 18px">
      <h3 class="titulo-tarjeta" style="margin-bottom: 12px">
        Copias guardadas
        <span class="contador" v-if="copias.length">{{ copias.length }}</span>
      </h3>
      <div v-if="copias.length" class="lista-copias">
        <div v-for="c in copias" :key="c.id" class="fila-copia">
          <span class="punto" style="background: var(--acento)"></span>
          <div class="copia-info">
            <div style="font-size: 13px; font-weight: 600">{{ fmtFechaHora(c.creado) }}</div>
            <div style="font-size: 11.5px; color: var(--apagado)">
              {{ c.resumen.empleados }} empleadas · {{ c.resumen.ausencias }} ausencias ·
              {{ c.resumen.tiempos }} apuntes · {{ kb(c) }} KB
            </div>
          </div>
          <button class="btn chico" title="Restaurar esta copia" @click="restaurar(c)">Restaurar</button>
          <button class="btn chico icono-solo peligro" title="Eliminar copia" @click="borrarCopia(c)">
            <Icono nombre="papelera" :tam="13" />
          </button>
        </div>
      </div>
      <div v-else class="vacio-mensaje" style="padding: 14px 8px">
        Todavía no hay copias guardadas. Activa el plan o pulsa «Hacer copia ahora».
      </div>
    </section>
  </div>
</template>

<style scoped>
.grid-mant {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 18px;
  align-items: start;
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
.nota {
  font-size: 12.5px;
  font-weight: 600;
  margin-top: 10px;
}
.nota-ok { color: #0f7a35; }
.nota-error { color: var(--peligro); }

.linea-plan { margin-bottom: 12px; }
.interruptor {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: var(--tinta);
}
.interruptor input { width: 16px; height: 16px; accent-color: var(--acento); cursor: pointer; }

.grid-plan {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.resumen-plan {
  font-size: 11.5px;
  color: var(--apagado);
  margin: 10px 0;
}

.contador {
  background: var(--acento-suave);
  color: var(--acento);
  border-radius: 999px;
  font-size: 11px;
  padding: 1px 8px;
  margin-left: 6px;
}

.lista-copias {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fila-copia {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--borde-suave);
  background: var(--superficie);
}
.fila-copia:hover { background: var(--superficie-2); }
.copia-info { flex: 1; min-width: 0; }
</style>

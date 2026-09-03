<script setup lang="ts">
import { onMounted, ref, shallowRef, type Component } from "vue";
import Icono from "./components/Icono.vue";
import VistaPlantilla from "./views/VistaPlantilla.vue";
import VistaCalendario from "./views/VistaCalendario.vue";
import VistaAusencias from "./views/VistaAusencias.vue";
import VistaMantenimiento from "./views/VistaMantenimiento.vue";

type Seccion = "plantilla" | "calendario" | "ausencias" | "mantenimiento";

const secciones: { id: Seccion; etiqueta: string; icono: string }[] = [
  { id: "plantilla", etiqueta: "Plantilla", icono: "personas" },
  { id: "calendario", etiqueta: "Calendario de turnos", icono: "calendario" },
  { id: "ausencias", etiqueta: "Vacaciones y ausencias", icono: "sol" },
  { id: "mantenimiento", etiqueta: "Mantenimiento", icono: "engranaje" }
];

const componente: Record<Seccion, Component> = {
  plantilla: VistaPlantilla,
  calendario: VistaCalendario,
  ausencias: VistaAusencias,
  mantenimiento: VistaMantenimiento
};

function seccionDesdeHash(): Seccion {
  const h = window.location.hash.replace("#", "") as Seccion;
  return componente[h] ? h : "plantilla";
}

const activa = ref<Seccion>(seccionDesdeHash());
const vistaActual = shallowRef<Component>(componente[activa.value]);

function ir(seccion: Seccion) {
  activa.value = seccion;
  vistaActual.value = componente[seccion];
  window.location.hash = seccion;
}

onMounted(() => {
  window.addEventListener("hashchange", () => {
    const s = seccionDesdeHash();
    activa.value = s;
    vistaActual.value = componente[s];
  });
});
</script>

<template>
  <div class="envoltorio-app">
    <aside class="barra-lateral">
      <div class="marca">
        <span class="marca-icono"><Icono nombre="sol" :tam="20" /></span>
        <span>
          <div class="marca-nombre">Gestor de Personal</div>
          <div class="marca-sub">Turnos y ausencias</div>
        </span>
      </div>
      <nav>
        <button
          v-for="s in secciones"
          :key="s.id"
          class="nav-item"
          :class="{ activo: activa === s.id }"
          @click="ir(s.id)"
        >
          <Icono :nombre="s.icono" />
          <span>{{ s.etiqueta }}</span>
        </button>
      </nav>
      <div class="pie-lateral">
        Calendario quincenal de turnos<br />
        Mañana · Tarde
      </div>
    </aside>

    <main class="area-contenido">
      <Transition name="fade" mode="out-in">
        <component :is="vistaActual" :key="activa" />
      </Transition>
    </main>
  </div>
</template>

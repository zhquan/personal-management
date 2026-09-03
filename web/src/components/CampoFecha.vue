<script setup lang="ts">
import { ref, watch } from "vue";
import { fmt, parseFechaES } from "../lib/dates";

// Campo de fecha con formato fijo dd/mm/aaaa: el navegador muestra y recoge la
// fecha en este formato pase lo que pase con el idioma del sistema (los inputs
// nativos de fecha dependen de la configuración regional y pueden salir mm/dd/aaaa).

const props = withDefaults(
  defineProps<{
    /** Fecha en ISO (YYYY-MM-DD) o vacío. */
    modelValue?: string;
    /** Límite superior (ISO) opcional. */
    max?: string;
    /** Límite inferior (ISO) opcional. */
    min?: string;
    placeholder?: string;
  }>(),
  { modelValue: "", max: undefined, min: undefined, placeholder: "dd/mm/aaaa" }
);

const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();

const input = ref<HTMLInputElement | null>(null);
const texto = ref(props.modelValue ? fmt(props.modelValue) : "");
const noValida = ref(false);

// Si el valor cambia desde fuera (otra ficha, mes por defecto…), reflejarlo.
watch(
  () => props.modelValue,
  (v) => {
    if (document.activeElement !== input.value) {
      texto.value = v ? fmt(v) : "";
      noValida.value = false;
    }
  }
);

function enmascarar(actual: string): string {
  const digitos = actual.replace(/\D/g, "").slice(0, 8);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}

function alEscribir() {
  const el = input.value;
  if (!el) return;
  texto.value = enmascarar(el.value);
  noValida.value = false;
}

function alSalir() {
  const t = texto.value.trim();
  if (!t) {
    texto.value = "";
    noValida.value = false;
    emit("update:modelValue", "");
    return;
  }
  const iso = parseFechaES(t);
  if (!iso || (props.max && iso > props.max) || (props.min && iso < props.min)) {
    noValida.value = true; // se queda marcada en rojo; el valor anterior sigue vigente
    return;
  }
  noValida.value = false;
  texto.value = fmt(iso);
  if (iso !== props.modelValue) emit("update:modelValue", iso);
}
</script>

<template>
  <input
    ref="input"
    :value="texto"
    type="text"
    inputmode="numeric"
    autocomplete="off"
    :placeholder="placeholder"
    :aria-invalid="noValida ? 'true' : 'false'"
    :title="noValida ? 'Fecha no válida. Usa el formato dd/mm/aaaa.' : undefined"
    :class="{ 'no-valida': noValida }"
    @input="alEscribir"
    @blur="alSalir"
    @keydown.enter.prevent="alSalir"
  />
</template>

<style scoped>
.no-valida {
  border-color: var(--peligro) !important;
  box-shadow: 0 0 0 3px var(--peligro-suave) !important;
}
</style>
